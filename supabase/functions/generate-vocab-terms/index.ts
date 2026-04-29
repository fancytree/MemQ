// Supabase Edge Function - Generate/Extract Vocabulary Terms
// Deno environment
// For vocabulary mode lessons (is_vocab_mode = true)

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

    // 构建 System Prompt（语言学专家角色）
    const systemPrompt = `You are a linguistic expert and lexicographer (like Oxford Dictionary). Your task is to extract important vocabulary words and phrases from the input text, providing comprehensive linguistic information for each word.

STRICT RULES:

1. Vocabulary Requirements:
   - Extract key vocabulary words, phrases, or expressions that are important for language learning.
   - Focus on words that have specific meanings, technical terms, idioms, or expressions worth learning.
   - Words can be in ANY LANGUAGE (English, Chinese, or mixed). Do NOT translate them; keep the original language.

2. Definition Requirements:
   - The "definition" field should be a concise, clear explanation of what the word/phrase means.
   - Definitions can be in ANY LANGUAGE, matching the language of the term.
   - Keep definitions factual and neutral, within 1–2 sentences.

3. Explanation Field Requirements (CRITICAL):
   - The "explanation" field MUST be a Markdown-formatted string containing the following sections:
     - **IPA:** (International Phonetic Alphabet transcription)
     - **POS:** (Part of Speech: Noun, Verb, Adjective, Adverb, Preposition, Conjunction, etc.)
     - **Meaning:** (Brief, clear definition)
     - **Example:** (A sentence example where the word/phrase appears, with the word/phrase marked in **bold** or *italic*)
     - **Synonyms:** (2-3 synonyms or near-synonyms, comma-separated)
   
   Example format (use \\n for line breaks in JSON):
   **IPA:** /wɔːrd/\\n**POS:** Noun\\n**Meaning:** A single distinct meaningful element of speech or writing.\\n**Example:** The **word** "hello" is a common greeting.\\n**Synonyms:** term, expression, vocabulary

4. FORBIDDEN in Definitions:
   - DO NOT include subjective opinions.
   - DO NOT include long paragraphs.
   - DO NOT include long examples in the definition field (use explanation for detailed info).

5. Domain Adaptation:
   - The text may be from many domains: academic texts, literature, news, technical documents, etc.
   - Choose words that are valuable for vocabulary building and language learning.

6. Output Format (MUST FOLLOW EXACTLY):
   - Return ONLY valid JSON in this format (no extra keys, no comments, no explanations):
   - The "explanation" field is REQUIRED for each vocabulary term
   - Use \\n (double backslash + n) to represent line breaks in the explanation string
{
  "results": [
    {
      "term": "vocabulary word",
      "definition": "Short definition",
      "explanation": "**IPA:** /ɪɡˈzæmpəl/\\n**POS:** Noun\\n**Meaning:** A thing characteristic of its kind or illustrating a general rule.\\n**Example:** This is an **example** of good practice.\\n**Synonyms:** instance, illustration, case"
    }
  ]
}
   - If you cannot find any meaningful vocabulary, return:
{
  "results": []
}`;

    // 根据 type 构建不同的 User Prompt
    let userPrompt: string;
    if (body.type === 'topic') {
      userPrompt = `Extract important vocabulary words and phrases related to the topic: "${body.content}"

For each vocabulary item, provide:
1. The word/phrase itself
2. A concise definition
3. Detailed linguistic information in the explanation field (IPA, POS, Meaning, Example, Synonyms)`;
    } else {
      // type === 'text'
      userPrompt = `Extract key vocabulary words and phrases from the following text:

${body.content}

For each vocabulary item found in the text, provide:
1. The word/phrase itself
2. A concise definition
3. Detailed linguistic information in the explanation field (IPA, POS, Meaning, Example, Synonyms)`;
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

    let termsData: {
      results: Array<{
        term: string;
        definition: string;
        explanation?: string;
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
          typeof item.definition === 'string' &&
          item.explanation !== undefined &&
          typeof item.explanation === 'string' &&
          item.explanation.trim().length > 0 // explanation 是必需的
      )
      .map((item) => {
        // TypeScript 类型守卫：此时 item.explanation 一定存在且是字符串
        const explanation = item.explanation!;
        return {
          term: item.term.trim(),
          definition: item.definition.trim(),
          explanation: explanation.trim(),
        };
      })
      .filter(
        (item) => item.term.length > 0 && item.definition.length > 0 && item.explanation.length > 0
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
