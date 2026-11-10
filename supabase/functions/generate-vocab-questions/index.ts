// Supabase Edge Function - Generate Vocabulary Questions
// Deno environment
// For language lessons (learning_mode = 'language')

// @ts-expect-error - Deno supports URL imports, but TypeScript needs type declarations
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// @ts-expect-error - Deno supports URL imports, but TypeScript needs type declarations
import OpenAI from 'https://esm.sh/openai@4';

// CORS 响应头
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// 请求体类型定义
interface GenerateRequest {
  lessonId: string;
  terms: Array<{
    id: string;
    term: string;
    definition: string;
    explanation?: string; // May contain IPA, POS, Meaning, Example, Synonyms
    language_data?: Record<string, unknown> | null;
  }>;
}

Deno.serve(async (req) => {
  // 处理 CORS 预检请求
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 解析请求体
    const body: GenerateRequest = await req.json();

    // 验证输入
    if (!body.lessonId || !body.terms || !Array.isArray(body.terms)) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: lessonId and terms' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (body.terms.length === 0) {
  return new Response(
        JSON.stringify({ error: 'Terms array cannot be empty' }),
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

    // 初始化 Supabase 客户端（使用 Service Role Key）
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const systemPrompt = `You are a language teacher creating practice for words, phrases, and grammar patterns in any language.
Use the term's language in questions and examples. Never assume the user's native language or add translations.
Use the supplied definition, example, forms, collocations, synonyms, and antonyms. Test usage in context, spelling, forms, and suitable relationships. Never ask a synonym/antonym question when the source data has no reliable relationship.
For grammar patterns, test applying the construction in a natural sentence. Avoid questions that only repeat the definition.
Return only JSON: {"questions":[{"term_id":"uuid","question_text":"...","question_type":"mcq","options":["A","B","C","D"],"correct_answer":"A","explanation":"..."}]}.
Use mcq with exactly four options, true_false with ["True","False"], or fill_blank with null options and a short exact answer. Generate 1-3 questions per term. Every term_id must be one of the supplied IDs.`;

    const userPrompt = `Create language practice from these cards:\n\n${body.terms.map((term) =>
      `Term ID: ${term.id}\nTerm: ${term.term}\nDefinition: ${term.definition}\nUsage note: ${term.explanation || ''}\nLanguage details: ${JSON.stringify(term.language_data || {})}`
    ).join('\n\n')}`;

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
      temperature: 0.7,
    });

    // 解析 OpenAI 返回的 JSON
    const responseContent = completion.choices[0]?.message?.content;
    if (!responseContent) {
      throw new Error('OpenAI returned empty response');
    }

    let questionsData: { questions: any[] };
    try {
      questionsData = JSON.parse(responseContent);
    } catch (parseError) {
      console.error('Failed to parse OpenAI response:', responseContent);
      throw new Error('Invalid JSON response from OpenAI');
    }

    if (!questionsData.questions || !Array.isArray(questionsData.questions)) {
      throw new Error('Invalid response format: missing questions array');
    }

    // 验证并构建数据库插入数据
    const insertData = questionsData.questions.map((q) => {
      // 验证必填字段
      if (!q.term_id || !q.question_text || !q.question_type || !q.correct_answer) {
        throw new Error(`Invalid question format: missing required fields`);
      }

      // 验证 term_id 是否在传入的 terms 中
      const termExists = body.terms.some((t) => t.id === q.term_id);
      if (!termExists) {
        throw new Error(`Invalid term_id: ${q.term_id} not found in provided terms`);
      }

      // 验证 question_type
      if (!['mcq', 'true_false', 'fill_blank'].includes(q.question_type)) {
        throw new Error(`Invalid question_type: ${q.question_type}`);
      }

      // 验证 options
      if (q.question_type === 'fill_blank') {
        if (q.options !== null) {
          console.warn(`Warning: fill_blank question should have null options, got: ${q.options}`);
          q.options = null;
        }
      } else if (q.question_type === 'true_false') {
        if (!Array.isArray(q.options) || q.options.length !== 2) {
          throw new Error(`true_false question must have exactly 2 options: ["True", "False"]`);
        }
      } else if (q.question_type === 'mcq') {
        if (!Array.isArray(q.options) || q.options.length !== 4) {
          throw new Error(`mcq question must have exactly 4 options`);
        }
      }

      return {
        term_id: q.term_id,
        question_text: q.question_text,
        question_type: q.question_type,
        options: q.options,
        correct_answer: q.correct_answer,
        explanation: q.explanation || null,
      };
    });

    // 批量插入到数据库
    const { error: insertError } = await supabase
      .from('questions')
      .insert(insertData);

    if (insertError) {
      console.error('Database insert error:', insertError);
      return new Response(
        JSON.stringify({
          error: 'Failed to save questions to database',
          details: insertError.message,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 返回成功响应
    return new Response(
      JSON.stringify({
        success: true,
        questionsGenerated: insertData.length,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error generating vocabulary questions:', error);
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
