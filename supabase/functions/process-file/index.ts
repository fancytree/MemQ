// Supabase Edge Function - Process PDF File (using MinerU API)
// Deno environment

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { OpenAI } from 'https://deno.land/x/openai@v4.20.1/mod.ts';
import { unzipSync } from 'https://esm.sh/fflate@0.8.2';

import { ALLOWANCES, usageOf } from '../_shared/aiGate.ts';
import { afterResponse, meter, openGate, type Meter } from '../_shared/aiGateStore.ts';
import { ownedPdfPath, signOwnedPdfReference } from '../_shared/pdfReference.ts';
import { PDF_MAX_BYTES, pageRange, tooLarge } from '../_shared/pdfLimits.ts';

// CORS 响应头
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// 请求体类型定义
interface ProcessFileRequest {
  pdf_url: string; // Time-limited URL for the processor.
}

Deno.serve(async (req) => {
  // 处理 CORS 预检请求
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // What this request has spent, so a failure after the model was paid is still filed.
  let tab: Meter | null = null;
  // Removes the uploaded file. Set once the file is known to be theirs.
  let discard: (() => void) | null = null;
  try {
    // 获取认证信息
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  }
      );
    }

    // 解析请求体
    const body: ProcessFileRequest = await req.json();

    // 验证输入
    if (!body.pdf_url || typeof body.pdf_url !== 'string') {
  return new Response(
        JSON.stringify({ error: 'Missing or invalid pdf_url' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    /* Who is asking, and whether they have any left. A PDF is the dearest thing
     * the app does and the only one whose cost grows with what is sent, so free
     * accounts get three, ever (aiGate.ts). Refused here, before the file is
     * handed to anyone. */
    const door = await openGate(req, ALLOWANCES.pdfProcess);
    if (!door.ok) return door.response;
    const { gate } = door.admission;
    tab = meter(gate);

    // Legacy app versions send a public URL; newer ones send a signed URL.
    // Neither is trusted as authority: resolve it to this user's object, then
    // mint a fresh short-lived URL under the user's own Storage permissions.
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    if (!supabaseUrl || !anonKey) throw new Error('Storage configuration unavailable');
    const client = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const signedUrl = await signOwnedPdfReference(body.pdf_url, supabaseUrl,
      () => client.auth.getUser(),
      (path) => client.storage.from('pdfs').createSignedUrl(path, 15 * 60),
      Deno.env.get('MEMQ_PUBLIC_SUPABASE_URL'));
    if (!signedUrl) {
      return new Response(JSON.stringify({ error: 'Invalid or inaccessible PDF' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    /* The file is only needed for this: nothing in the app opens it again once
     * the cards exist. So it goes when this request ends, whichever way it ends.
     * Kept, every upload sat in storage for good, and storage is the one cost
     * here that grows whether anyone is using the app or not. */
    const path = ownedPdfPath(body.pdf_url, supabaseUrl, gate.userId, Deno.env.get('MEMQ_PUBLIC_SUPABASE_URL'));
    if (path) {
      const store = (door.service ?? client).storage.from('pdfs');
      discard = () => afterResponse(Promise.resolve(store.remove([path])).catch(() => {}));

      // Its size, from storage's own record rather than anything the caller says.
      const cut = path.lastIndexOf('/');
      const listed = await client.storage.from('pdfs').list(path.slice(0, cut), { search: path.slice(cut + 1), limit: 1 });
      const bytes = Number((listed.data?.[0]?.metadata as { size?: unknown } | undefined)?.size ?? 0);
      if (bytes > PDF_MAX_BYTES) {
        discard();
        return new Response(JSON.stringify(tooLarge()), {
          status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // 获取 MinerU API Token
    const mineruToken = Deno.env.get('MINERU_API_TOKEN');
    if (!mineruToken) {
      console.error('PDF processor configuration unavailable');
      return new Response(JSON.stringify({ error: 'PDF processing is temporarily unavailable.' }), {
        status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 第一步：调用 MinerU API 创建解析任务
    const mineruApiUrl = 'https://mineru.net/api/v4/extract/task';
    const createTaskResponse = await fetch(mineruApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mineruToken}`,
      },
      body: JSON.stringify({
        url: signedUrl,
        model_version: 'vlm',
        // What is read is capped by pages: the processor's cost follows the page
        // count, and only the first 15,000 characters reach the model anyway.
        page_ranges: pageRange(gate.isPro),
      }),
    });

    if (!createTaskResponse.ok) {
      // Upstream responses may echo the temporary bearer URL; never log them.
      console.error('MinerU task creation failed', createTaskResponse.status);
      throw new Error('Could not start PDF processing.');
    }

    const taskData = await createTaskResponse.json();
    const taskId = taskData.task_id || taskData.id || taskData.data?.task_id;

    if (!taskId) {
      throw new Error('PDF processing did not return a task ID.');
    }

    // 第二步：轮询任务状态，直到完成
    let extractedText: string | null = null;
    const maxAttempts = 60; // 最多轮询 60 次（2 分钟）
    const pollInterval = 2000; // 每 2 秒轮询一次

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // 等待后轮询（第一次立即检查）
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
      }

      // 查询任务状态
      const statusResponse = await fetch(`${mineruApiUrl}/${taskId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${mineruToken}`,
        },
      });

      if (!statusResponse.ok) {
        console.error(`Failed to check task status (attempt ${attempt + 1}):`, statusResponse.statusText);
        if (attempt === maxAttempts - 1) {
          throw new Error('Failed to check task status after multiple attempts');
        }
        continue;
      }

      const statusData = await statusResponse.json();
      const status = statusData.status || statusData.state || statusData.data?.status || statusData.data?.state;

      console.log(`MinerU task status (attempt ${attempt + 1}):`, status);

      if (status === 'completed' || status === 'success' || status === 'done') {
        // 任务完成，获取结果
        const resultUrl = statusData.data?.full_zip_url;
        const markdown = statusData.markdown || statusData.data?.markdown;
        const text = statusData.text || statusData.data?.text;
        const content = statusData.content || statusData.data?.content;

        if (resultUrl) {
          // Only fetch the documented MinerU result CDN, with bounded input and output.
          const archiveUrl = new URL(resultUrl);
          if (archiveUrl.protocol !== 'https:' || archiveUrl.hostname !== 'cdn-mineru.openxlab.org.cn' || archiveUrl.port || archiveUrl.username || archiveUrl.password) throw new Error('Invalid PDF result location');
          const resultResponse = await fetch(archiveUrl, { redirect: 'error' });
          if (!resultResponse.ok || !resultResponse.body) throw new Error('Could not download PDF result');
          const maxArchiveBytes = 20 * 1024 * 1024;
          const reader = resultResponse.body.getReader();
          const chunks: Uint8Array[] = [];
          let length = 0;
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            length += value.length;
            if (length > maxArchiveBytes) { await reader.cancel(); throw new Error('PDF result is too large'); }
            chunks.push(value);
          }
          const archive = new Uint8Array(length);
          let offset = 0;
          for (const chunk of chunks) { archive.set(chunk, offset); offset += chunk.length; }
          let markdownCount = 0;
          const files = unzipSync(archive, { filter: (file) => {
            if (file.name !== 'full.md' && !file.name.endsWith('/full.md')) return false;
            if (++markdownCount > 1 || file.originalSize > 5 * 1024 * 1024) throw new Error('Invalid PDF result markdown');
            return true;
          } });
          const markdownFiles = Object.keys(files);
          if (markdownFiles.length !== 1) throw new Error('PDF result has no unique markdown');
          extractedText = new TextDecoder().decode(files[markdownFiles[0]]);
        } else if (markdown || text || content) {
          // 结果直接在响应中
          extractedText = markdown || text || content;
        } else {
          // 尝试从响应中提取任何文本字段
          throw new Error('PDF result has no text');
        }
        break;
      } else if (status === 'failed' || status === 'error') {
        const errorMsg = statusData.message || statusData.error || statusData.data?.message || 'Unknown error';
        throw new Error(`MinerU task failed: ${errorMsg}`);
      }
      // 如果状态是 'processing'、'pending'、'running' 等，继续轮询
    }

    if (!extractedText || extractedText.trim().length === 0) {
      discard?.();
      return new Response(
        JSON.stringify({ 
          error: 'Failed to extract text from PDF',
          message: 'MinerU API did not return any text content'
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 第三步：如果提取的是 Markdown，转换为纯文本（移除 Markdown 标记）
    // 简单的 Markdown 清理
    let processedText = extractedText
      .replace(/^#+\s+/gm, '') // 移除标题标记
      .replace(/\*\*(.*?)\*\*/g, '$1') // 移除粗体
      .replace(/\*(.*?)\*/g, '$1') // 移除斜体
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1') // 移除链接，保留文本
      .replace(/`([^`]+)`/g, '$1') // 移除代码标记
      .trim();

    // 截断保护：如果文本过长，截取前 15,000 字符
    const maxLength = 15000;
    if (processedText.length > maxLength) {
      processedText = processedText.substring(0, maxLength) + '...';
    }

    // 第四步：调用 OpenAI 提取 Terms
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      throw new Error('OPENAI_API_KEY environment variable is not set');
    }

    const openaiModel = Deno.env.get('OPENAI_MODEL') || 'gpt-6-luna';

    const openai = new OpenAI({
      apiKey: openaiApiKey,
    });

    // 构建 System Prompt（复用 generate-terms 的逻辑）
    const systemPrompt = `You are a rigorous knowledge graph expert. Your task is to extract core concepts (Terms) and their definitions (Definitions) from the input.

STRICT RULES:

0. Language:
   - Write each card's definition in the language of the source material; do not default to the app or system language.
   - Preserve original terminology and proper names. If the source contains multiple languages, keep each concept and its definition consistent with its own source context.

1. Term Requirements:
   - Must be a core noun, concept, legal term, event name, or key terminology
   - Should be concise and specific
   - Examples: "Mitochondria", "Tort", "Photosynthesis", "Quantum Entanglement"

2. Definition Requirements:
   - Must be objective and concise (Identity/Function)
   - Should explain WHAT the term IS, not WHY it's important
   - Should be a clear, factual definition

3. FORBIDDEN in Definitions:
   - DO NOT include explanations like "This is important because..."
   - DO NOT include examples or use cases
   - DO NOT include "Explanation" sections
   - DO NOT include subjective opinions
   - Definition should ONLY be the definition itself

4. Domain Adaptation:
   - Must handle various domains: medicine, law, history, programming, science, etc.
   - Adapt terminology and precision to the domain

Return ONLY valid JSON in this format:
{
  "results": [
    { "term": "Term Name", "definition": "Objective definition only" },
    { "term": "Another Term", "definition": "Another objective definition" }
  ]
}`;

    // 构建 User Prompt
    const userPrompt = `Extract key terms and their definitions from the following PDF text:

${processedText}

Identify all important concepts, terminology, and definitions mentioned in the text. Extract only terms that have clear definitions provided.`;

    // 调用 OpenAI API
    const completion = await openai.chat.completions.create({
      model: openaiModel,
      ...(openaiModel === 'gpt-6-luna' ? { reasoning_effort: 'none' as const } : {}),
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    });

    tab.add(openaiModel, usageOf(completion.usage));

    const responseContent = completion.choices[0]?.message?.content;
    if (!responseContent) {
      throw new Error('No response from OpenAI');
    }

    // 解析 JSON 响应
    let parsedResponse: { results: Array<{ term: string; definition: string }> };
    try {
      parsedResponse = JSON.parse(responseContent);
    } catch {
      console.error('Error parsing OpenAI response');
      throw new Error('Invalid JSON response from OpenAI');
    }

    if (!parsedResponse.results || !Array.isArray(parsedResponse.results)) {
      throw new Error('Invalid response format from OpenAI');
    }

    // An import that produced no cards is not one of their three.
    if (parsedResponse.results.length) tab.done(); else tab.failed();
    discard?.();

    // 返回成功响应
    return new Response(
      JSON.stringify({
        success: true,
        results: parsedResponse.results,
        count: parsedResponse.results.length,
        textLength: extractedText.length,
        processedLength: processedText.length,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    tab?.failed();
    discard?.();
    // Errors from third parties can contain the signed URL or document text.
    console.error('Error processing file');
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: 'Unable to process this PDF. Please try again.',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
