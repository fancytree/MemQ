// Supabase Edge Function - Generate/Extract Vocabulary Terms
// Deno environment
// For language lessons (learning_mode = 'language')

// @ts-expect-error - Deno supports URL imports, but TypeScript needs type declarations
import OpenAI from 'https://esm.sh/openai@4';

// CORS 响应头
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// 请求体类型定义
interface GenerateVocabTermsRequest {
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
    const body: GenerateVocabTermsRequest = await req.json();

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

    const systemPrompt = `You create language learning cards for words, phrases, and grammar patterns in any language.
Return JSON only: {"results":[{"term":"...","definition":"...","explanation":"...","language_data":{"language_code":"en-US","pronunciation":"...","part_of_speech":"...","forms":"...","example":"...","synonyms":[],"antonyms":[],"collocations":[]}}]}.
Use a short, clear definition in the term's language. Never add a translation or assume the user's native language.
The explanation is an optional short usage note; do not duplicate structured fields in it.
Infer a valid BCP-47 language code for iOS speech (for example en-US, es-ES, fr-FR, zh-CN). Use an empty string if unsure.
Give one natural example in the same language as the term. Pronunciation may be IPA, pinyin, or another appropriate reading guide. Forms should contain only relevant grammar information.
Synonyms, antonyms, and collocations are optional arrays. Omit misleading or unnatural relationships; never invent antonyms just to fill a field.
For grammar patterns, describe the construction, put a full sentence in example, and leave irrelevant lexical fields empty.
If no useful cards can be made, return {"results":[]}.`;

    const userPrompt = body.type === 'topic'
      ? `Create language learning cards for this topic, word, phrase, or grammar pattern: "${body.content}"`
      : `Extract useful language learning cards from this text:\n\n${body.content}`;

    // 调用 OpenAI API
    const openaiModel = Deno.env.get('OPENAI_MODEL') || 'gpt-6-luna';
    const completion = await openai.chat.completions.create({
      model: openaiModel,
      ...(openaiModel === 'gpt-6-luna' ? { reasoning_effort: 'none' as const } : {}),
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

    let termsData: {
      results: Array<{
        term: string;
        definition: string;
        explanation?: string;
        language_data?: Record<string, unknown>;
      }>;
    };
    try {
      termsData = JSON.parse(responseContent);
    } catch (parseError) {
      console.error('Failed to parse OpenAI response:', responseContent);
      throw new Error('Invalid JSON response from OpenAI');
    }

    if (!termsData.results || !Array.isArray(termsData.results)) {
      throw new Error('Invalid response format: missing results array');
    }

    // 验证结果格式
    const validatedResults = termsData.results
      .filter(
        (item) =>
          item &&
          typeof item.term === 'string' &&
          typeof item.definition === 'string'
      )
      .map((item) => {
        const raw = item.language_data && typeof item.language_data === 'object' ? item.language_data : {};
        const value = (key: string) => typeof raw[key] === 'string' ? (raw[key] as string).trim() : '';
        const list = (key: string) => Array.isArray(raw[key])
          ? (raw[key] as unknown[]).filter((entry): entry is string => typeof entry === 'string').map((entry) => entry.trim()).filter(Boolean)
          : [];
        return {
          term: item.term.trim(),
          definition: item.definition.trim(),
          explanation: typeof item.explanation === 'string' ? item.explanation.trim() : '',
          language_data: {
            language_code: value('language_code'),
            pronunciation: value('pronunciation'),
            part_of_speech: value('part_of_speech'),
            forms: value('forms'),
            example: value('example'),
            synonyms: list('synonyms'),
            antonyms: list('antonyms'),
            collocations: list('collocations'),
          },
        };
      })
      .filter(
        (item) => item.term.length > 0 && item.definition.length > 0
      );

    // 即使没有提取到 term，也返回 200，只是 results 为空，方便前端做友好提示
    return new Response(
      JSON.stringify({
        success: true,
        results: validatedResults,
        count: validatedResults.length,
        message:
          validatedResults.length === 0
            ? 'No valid vocabulary terms extracted from the input.'
            : undefined,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error generating vocabulary terms:', error);
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
