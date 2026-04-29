// Supabase Edge Function - Generate Questions
// Deno environment

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
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

    // 构建 System Prompt
    const systemPrompt = `You are an expert tutor. Analyze the provided terms and definitions to create the most effective test questions.

CRITICAL RULE: Mix the Question Direction (Bidirectional Questions)

You MUST generate questions in BOTH directions for each term:

Direction A (Concept Check): Given Definition/Context, ask for the Term.
  Example: "Which term refers to the power house of the cell?" → Answer: "Mitochondria"
  Example: "What is the process by which plants convert sunlight into energy?" → Answer: "Photosynthesis"

Direction B (Definition Check): Given Term, ask for the Definition/Function.
  Example: "What is the primary function of Mitochondria?" → Answer: "Generates ATP" or "Powerhouse of the cell"
  Example: "What is Photosynthesis?" → Answer: "The process by which plants convert sunlight into energy"

IMPORTANT: For each term, generate a MIX of both directions. Do NOT only generate Direction B questions.

Rules for Question Generation:

1. Dynamic Quantity:
   - Detailed/complex concepts -> generate 2-4 questions (mix both directions)
   - Simple/factual concepts -> generate 1-2 questions (mix both directions)
   - Analyze the complexity of each term and definition to determine the optimal number of questions
   - Ensure at least one question in each direction when generating 2+ questions

2. Optimal Type Selection:
   Choose the question type (mcq, true_false, fill_blank) that BEST fits the specific content:
   - Use true_false for verifying simple facts or binary statements
   - Use fill_blank for testing key vocabulary, terminology, or contextual understanding
   - Use mcq for distinguishing between similar concepts, testing deep understanding, or when multiple plausible answers exist

3. Question Direction by Type:

   MCQ (Multiple Choice):
   - Case 1 (Direction A): Question provides Definition/Scenario → Options are Terms
     Example: "Which organelle is known as the powerhouse of the cell?"
     Options: ["Mitochondria", "Nucleus", "Ribosome", "Golgi apparatus"]
     Correct Answer: "Mitochondria"
   
   - Case 2 (Direction B): Question provides Term → Options are Definitions (shortened)
     Example: "What is the primary function of Mitochondria?"
     Options: ["Generates ATP", "Stores DNA", "Produces proteins", "Packages molecules"]
     Correct Answer: "Generates ATP"

   Fill Blank:
   - Case 1 (Direction A): "The process of [BLANK] is how plants convert sunlight into energy." → Answer: "Photosynthesis" (Term)
   - Case 2 (Direction B): "Photosynthesis is the process of [BLANK]..." → Answer: "converting sunlight into energy" (Keyword from definition, 1-3 words only)

   True/False:
   - Mix matched term-definition pairs (True) and mismatched ones (False)
   - Direction A: "Mitochondria is the powerhouse of the cell." → True
   - Direction B: "The powerhouse of the cell is the Nucleus." → False

4. Question Format Requirements:
   - mcq (Multiple Choice): Must have exactly 4 options
   - true_false (True/False): options must be ["True", "False"]
   - fill_blank (Fill in the Blank):
     * correct_answer must be concise (1-3 words only, no full sentences)
     * options field must be null (frontend will render an input box)

5. Each question must include:
   - term_id: The UUID of the term
   - question_text: The question content
   - question_type: One of "mcq", "true_false", or "fill_blank"
   - options: Array of strings for mcq/true_false, null for fill_blank
   - correct_answer: The correct answer
   - explanation: A brief explanation

Return ONLY valid JSON in this format:
{
  "questions": [
    {
      "term_id": "uuid-here",
      "question_text": "...",
      "question_type": "mcq",
      "options": ["A", "B", "C", "D"],
      "correct_answer": "A",
      "explanation": "..."
    }
  ]
}`;

    // 构建用户提示词
    const userPrompt = `Analyze each term and definition below. Generate the most effective test questions based on the complexity and nature of each concept. 

CRITICAL: For each term, generate a MIX of both question directions:
- Some questions should ask "Given Definition, what is the Term?" (Direction A)
- Other questions should ask "Given Term, what is the Definition?" (Direction B)

Create 1-4 questions per term, choosing the question types that best assess understanding of each specific term. Ensure you mix both directions when generating multiple questions.

Terms to analyze:

${body.terms
  .map(
    (term) => `Term ID: ${term.id}
Term: ${term.term}
Definition: ${term.definition}`
  )
  .join('\n\n')}`;

    // 调用 OpenAI API
    const completion = await openai.chat.completions.create({
      model: Deno.env.get('OPENAI_MODEL') || 'gpt-4o-mini',
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
    console.error('Error generating questions:', error);
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
