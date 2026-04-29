// Supabase Edge Function - Process PDF File (using MinerU API)
// Deno environment

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { OpenAI } from 'https://deno.land/x/openai@v4.20.1/mod.ts';

// CORS 响应头
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// 请求体类型定义
interface ProcessFileRequest {
  pdf_url: string; // PDF 文件的公开 URL
}

Deno.serve(async (req) => {
  // 处理 CORS 预检请求
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

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

    // 获取 MinerU API Token
    const mineruToken = Deno.env.get('MINERU_API_TOKEN');
    if (!mineruToken) {
      throw new Error('MINERU_API_TOKEN environment variable is not set');
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
        url: body.pdf_url,
        model_version: 'vlm',
      }),
    });

    if (!createTaskResponse.ok) {
      const errorText = await createTaskResponse.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { message: errorText };
      }
      console.error('MinerU API error:', errorData);
      throw new Error(`MinerU API error: ${errorData.message || errorData.error || createTaskResponse.statusText}`);
    }

    const taskData = await createTaskResponse.json();
    const taskId = taskData.task_id || taskData.id || taskData.data?.task_id;

    if (!taskId) {
      console.error('MinerU API response:', taskData);
      throw new Error('Failed to get task ID from MinerU API. Response: ' + JSON.stringify(taskData));
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
      const status = statusData.status || statusData.state || statusData.data?.status;

      console.log(`MinerU task status (attempt ${attempt + 1}):`, status);

      if (status === 'completed' || status === 'success' || status === 'done') {
        // 任务完成，获取结果
        const resultUrl = statusData.result_url || statusData.download_url || statusData.data?.result_url;
        const markdown = statusData.markdown || statusData.data?.markdown;
        const text = statusData.text || statusData.data?.text;
        const content = statusData.content || statusData.data?.content;

        if (resultUrl) {
          // 从 URL 下载结果
          const resultResponse = await fetch(resultUrl);
          if (resultResponse.ok) {
            const resultContent = await resultResponse.text();
            
            // 尝试解析为 JSON
            try {
              const jsonResult = JSON.parse(resultContent);
              extractedText = jsonResult.markdown || jsonResult.text || jsonResult.content || JSON.stringify(jsonResult);
            } catch {
              // 如果不是 JSON，直接使用文本内容（可能是 Markdown）
              extractedText = resultContent;
            }
          }
        } else if (markdown || text || content) {
          // 结果直接在响应中
          extractedText = markdown || text || content;
        } else {
          // 尝试从响应中提取任何文本字段
          extractedText = JSON.stringify(statusData);
        }
        break;
      } else if (status === 'failed' || status === 'error') {
        const errorMsg = statusData.message || statusData.error || statusData.data?.message || 'Unknown error';
        throw new Error(`MinerU task failed: ${errorMsg}`);
      }
      // 如果状态是 'processing'、'pending'、'running' 等，继续轮询
    }

    if (!extractedText || extractedText.trim().length === 0) {
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

    const openaiModel = Deno.env.get('OPENAI_MODEL') || 'gpt-4o-mini';

    const openai = new OpenAI({
      apiKey: openaiApiKey,
    });

    // 构建 System Prompt（复用 generate-terms 的逻辑）
    const systemPrompt = `You are a rigorous knowledge graph expert. Your task is to extract core concepts (Terms) and their definitions (Definitions) from the input.

STRICT RULES:

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
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    });

    const responseContent = completion.choices[0]?.message?.content;
    if (!responseContent) {
      throw new Error('No response from OpenAI');
    }

    // 解析 JSON 响应
    let parsedResponse: { results: Array<{ term: string; definition: string }> };
    try {
      parsedResponse = JSON.parse(responseContent);
    } catch (parseError) {
      console.error('Error parsing OpenAI response:', parseError);
      console.error('Response content:', responseContent);
      throw new Error('Invalid JSON response from OpenAI');
    }

    if (!parsedResponse.results || !Array.isArray(parsedResponse.results)) {
      throw new Error('Invalid response format from OpenAI');
    }

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
    console.error('Error processing file:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
