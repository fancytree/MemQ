// Supabase Edge Function - Generate/Extract Terms
// Deno environment

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import OpenAI from 'https://esm.sh/openai@4';

// CORS 响应头
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// 请求体类型定义
interface GenerateTermsRequest {
  type: 'topic' | 'text';
  content: string;
}

Deno.serve(async (req) => {
  // 处理 CORS 预检请求
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 解析请求体
    const body: GenerateTermsRequest = await req.json();

    // 验证输入
    if (!body.type || !body.content) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: type and content' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (body.type !== 'topic' && body.type !== 'text') {
      return new Response(
        JSON.stringify({ error: 'Invalid type. Must be "topic" or "text"' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (!body.content.trim()) {
      return new Response(
        JSON.stringify({ error: 'Content cannot be empty' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 初始化 OpenAI 客户端
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      throw new Error('OPENAI_API_KEY environment variable is not set');
    }

    const openai = new OpenAI({
      apiKey: openaiApiKey,
    });

    // 构建 System Prompt（支持中英文，尽量宽松提取术语）
    const systemPrompt = `You are a rigorous but helpful knowledge graph expert. Your task is to extract important concepts ("terms") and their concise definitions from the input text.

STRICT RULES:

1. Term Requirements:
   - A "term" is a key concept, technical phrase, important noun, or named entity (e.g. a theory, method, law, process, metric, algorithm, framework, standard, etc.).
   - Terms can be in ANY LANGUAGE (English, Chinese, or mixed). Do NOT translate them; keep the original language.
   - Terms should be as short as possible (usually 1–6 words).

2. Definition Requirements:
   - A "definition" is a short explanation of what the term means or what it does (its identity or function).
   - Definitions can also be in ANY LANGUAGE, matching the language of the term.
   - If the text does not contain an explicit definition sentence, you may infer a concise definition from context (your best guess), but keep it factual and neutral.

3. FORBIDDEN in Definitions:
   - DO NOT include subjective opinions (e.g. "this is very important", "this is interesting").
   - DO NOT include long paragraphs; keep each definition within 1–2 sentences.
   - DO NOT include long examples, anecdotes, or citations; focus on the core meaning.

4. Domain Adaptation:
   - The text may be from many domains: UX design, product management, psychology, medicine, law, history, programming, science, etc.
   - Choose terms that are most important for understanding the topic (not trivial words).

5. Output Format (MUST FOLLOW EXACTLY):
   - Return ONLY valid JSON in this format (no extra keys, no comments, no explanations):
{
  "results": [
    { "term": "Term 1", "definition": "Short definition for term 1" },
    { "term": "Term 2", "definition": "Short definition for term 2" }
  ]
}
   - If you cannot find any meaningful terms, return:
{
  "results": []
}`;

    // 根据 type 构建不同的 User Prompt
    let userPrompt: string;
    if (body.type === 'topic') {
      userPrompt = `Generate key terms and definitions for the topic: "${body.content}"

Extract the most important concepts, terminology, and definitions related to this topic. Focus on core concepts that are essential to understanding the subject.`;
    } else {
      // type === 'text'
      userPrompt = `Extract key terms and their definitions from the following text:

${body.content}

Identify all important concepts, terminology, and definitions mentioned in the text. Extract only terms that have clear definitions provided.`;
    }

    // 调用 OpenAI API
    const completion = await openai.chat.completions.create({
      model: Deno.env.get('OPENAI_MODEL') || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3, // Lower temperature for more consistent, factual output
    });

    // 解析 OpenAI 返回的 JSON
    const responseContent = completion.choices[0]?.message?.content;
    if (!responseContent) {
      throw new Error('OpenAI returned empty response');
    }

    let termsData: { results: Array<{ term: string; definition: string }> };
    try {
      termsData = JSON.parse(responseContent);
    } catch (parseError) {
      console.error('Failed to parse OpenAI response:', responseContent);
      throw new Error('Invalid JSON response from OpenAI');
    }

    if (!termsData.results || !Array.isArray(termsData.results)) {
      throw new Error('Invalid response format: missing results array');
    }

    // 验证结果格式（宽松处理，只要有 term 和 definition 就保留）
    const validatedResults = termsData.results
      .filter((item) => item && typeof item.term === 'string' && typeof item.definition === 'string')
      .map((item) => ({
        term: item.term.trim(),
        definition: item.definition.trim(),
      }))
      .filter((item) => item.term.length > 0 && item.definition.length > 0);

    // 即使没有提取到 term，也返回 200，只是 results 为空，方便前端做友好提示
    return new Response(
      JSON.stringify({
        success: true,
        results: validatedResults,
        count: validatedResults.length,
        message:
          validatedResults.length === 0
            ? 'No valid terms extracted from the input.'
            : undefined,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error generating terms:', error);
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

