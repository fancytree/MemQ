// Supabase Edge Function - Generate Vocabulary Questions
// Deno environment
// For language lessons (learning_mode = 'language')

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import OpenAI from 'https://esm.sh/openai@6.49.0';
import { validMcqPool, validTrueFalse } from '../_shared/practiceOptions.ts';
import { requestPractice } from '../_shared/requestPractice.ts';
import { checkQuestionAccess, type QuestionAccessClient } from '../_shared/questionAccess.ts';

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
    explanation?: string | null; // May contain IPA, POS, Meaning, Example, Synonyms
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

    // Verify the caller and use their own database privileges, never service role.
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const authorization = req.headers.get('Authorization') || '';
    if (!supabaseUrl || !supabaseAnonKey) throw new Error('Missing Supabase environment variables');
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const access = await checkQuestionAccess(supabase as unknown as QuestionAccessClient, authorization, body.lessonId, body.terms.map((term) => term?.id));
    if (!access.ok) {
      return new Response(JSON.stringify({ error: access.error }), {
        status: access.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    // Generate from the verified snapshot, not caller-supplied card text.
    body.terms = access.terms;
    const revisions = new Map(access.terms.map((term) => [term.id, term.content_revision]));

    const systemPrompt = `You are a language teacher creating practice for words, phrases, and grammar patterns in any language.
Use the language of the supplied definition for question wording and explanations. Preserve target-language words and examples. Every answer option, including distractors and the correct answer, must use the same language as the expected answer. Never substitute the system language or invent translations.
Use the supplied definition, example, forms, collocations, synonyms, and antonyms. Test usage in context, spelling, forms, and suitable relationships. Never ask a synonym/antonym question when the source data has no reliable relationship.
For grammar patterns, test applying the construction in a natural sentence. Avoid questions that only repeat the definition.
Return only JSON: {"questions":[{"term_id":"uuid","question_text":"...","question_type":"mcq","options":["A","B","C","D","E"],"correct_answer":"A","explanation":"..."}]}.
Use mcq with 5–6 distinct options of at most 100 characters, including exactly one correct answer; the app displays four choices. Use true_false with ["True","False"] only for English questions; otherwise use mcq or fill_blank, or fill_blank with null options and a short exact answer. Generate 1-3 questions per term. Every term_id must be one of the supplied IDs.`;

    const userPrompt = `Create language practice from these cards:\n\n${body.terms.map((term) =>
      `Term ID: ${term.id}\nTerm: ${term.term}\nDefinition: ${term.definition}\nUsage note: ${term.explanation || ''}\nLanguage details: ${JSON.stringify(term.language_data || {})}`
    ).join('\n\n')}`;

    // 调用 OpenAI API
    const openaiModel = Deno.env.get('OPENAI_MODEL') || 'gpt-6-luna';
    const questionsData = await requestPractice(openai, openaiModel, systemPrompt, userPrompt, body.terms.map((term) => term.id));

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
          console.warn('Normalizing non-null fill_blank options');
          q.options = null;
        }
      } else if (q.question_type === 'true_false') {
        if (!validTrueFalse(q.options, q.correct_answer, q.question_text)) {
          throw new Error('true_false requires the supported True/False options and answer and compatible question wording');
        }
      } else if (q.question_type === 'mcq') {
        if (!validMcqPool(q.options, q.correct_answer)) {
          throw new Error('mcq question requires 5–6 distinct options of at most 100 characters, including the correct answer, using a consistent writing system');
        }
        q.options = q.options.map((option: string) => option.trim());
        q.correct_answer = q.correct_answer.trim();
      }

      return {
        term_id: q.term_id,
        source_revision: revisions.get(q.term_id),
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
