// Supabase Edge Function - Generate Vocabulary Questions
// Deno environment
// For vocabulary mode lessons (is_vocab_mode = true)

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

    // 构建 System Prompt（语言教师角色）
    const systemPrompt = `You are a language teacher specializing in vocabulary acquisition. Your task is to create effective vocabulary test questions that assess spelling, collocation, synonym/antonym knowledge, and correct usage - not just simple definition matching.

CRITICAL RULE: Focus on Vocabulary Skills, Not Definition Recall

Instead of asking "What does this word mean?", create questions that test:
1. Collocation (word combinations and context)
2. Synonym/Antonym knowledge
3. Correct usage in context
4. Spelling and word forms

Question Type Requirements:

1. Fill Blank (fill_blank):
   - This type can test TWO different skills:
   
   a) Collocation (语境搭配) - Test how words combine with other words in natural contexts
      Example: "The meeting was _____ (delayed) due to rain." 
     Correct Answer: "postponed"
      - The blank should appear in a natural sentence context that tests word collocation
   
   b) Spelling (单词拼写) - Test the spelling of the target word itself, with grammatical variations allowed
      Example: "She showed great _____ (resilience) in facing challenges."
      Correct Answer: "resilience" (exact spelling of the target word)
      
      Example with grammatical variation: "He _____ (resilient) overcame all obstacles."
      Correct Answer: "resiliently" (adverb form, grammatically correct variation)
      
      Example with tense variation: "Yesterday, she _____ (study) for the exam."
      Correct Answer: "studied" (past tense form of the target word "study")
      
      - For spelling questions, the correct_answer should be the target word itself or a grammatically correct variation (e.g., different tenses, forms, parts of speech)
      - The word in parentheses should hint at the target word (can be in base form)
      - Accept variations like: verb tenses (study/studied/studying), word forms (resilient/resilience/resiliently), plural forms, etc.
      - The answer must be spelled correctly and grammatically appropriate for the context
   
   - correct_answer must be concise (1-2 words, usually the target word or its grammatical variation)
   - options field must be null (frontend will render an input box for typing)
   - Mix both collocation and spelling questions for comprehensive vocabulary assessment

2. MCQ (mcq):
   - Focus: Synonym/Antonym discrimination (近义词/反义词辨析)
   - Example (Synonym): "Which word is a SYNONYM for 'Happy'?"
     Options: ["Joyful", "Sad", "Angry", "Tired"]
     Correct Answer: "Joyful"
   - Example (Antonym): "Which word is an ANTONYM for 'Happy'?"
     Options: ["Joyful", "Sad", "Content", "Pleased"]
     Correct Answer: "Sad"
   - Can also test subtle differences between similar words
   - Must have exactly 4 options

3. True/False (true_false):
   - Focus: Correct usage in context (用法是否正确)
   - Example: "The word 'delicious' is used correctly in this sentence: 'The weather is delicious today.'"
     Options: ["True", "False"]
     Correct Answer: "False"
   - Test whether the word is used appropriately in the given sentence
   - Must have exactly 2 options: ["True", "False"]

Rules for Question Generation:

1. Dynamic Quantity:
   - Complex/polysemous words -> generate 2-4 questions (mix different question types)
   - Simple words -> generate 1-2 questions
   - Analyze each term's complexity, usage patterns, and relationships with other words

2. Utilize Explanation Field:
   - If the term has an "explanation" field with IPA, POS, Example, and Synonyms, use this information to create better questions
   - Use the provided examples to create context-based questions
   - Use synonyms to create synonym/antonym discrimination questions
   - Use POS (Part of Speech) to create collocation questions

3. Avoid Simple Definition Matching:
   - DO NOT ask: "What is the definition of X?" or "What does X mean?"
   - DO NOT create questions that simply match term to definition
   - Focus on practical vocabulary skills: usage, collocation, synonyms, context, spelling

4. Spelling Questions (fill_blank type):
   - Include spelling questions that test the correct spelling of the target word
   - Allow grammatical variations (tenses, word forms, parts of speech) when contextually appropriate
   - Example: For verb "study", accept "studied", "studying", "studies" based on sentence context
   - Example: For noun "resilience", accept "resilient" (adjective) or "resiliently" (adverb) if the sentence requires it
   - The word in parentheses should provide a hint (can be in base form)
   - Ensure the answer is spelled correctly and fits grammatically in the sentence

5. Question Format Requirements:
   - mcq: Must have exactly 4 options
   - true_false: options must be ["True", "False"]
   - fill_blank: 
     * correct_answer must be concise (1-2 words, usually the target word)
     * options field must be null
     * question_text should include context showing the blank position

6. Each question must include:
   - term_id: The UUID of the term
   - question_text: The question content
   - question_type: One of "mcq", "true_false", or "fill_blank"
   - options: Array of strings for mcq/true_false, null for fill_blank
   - correct_answer: The correct answer
   - explanation: A brief explanation (optional but recommended)

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
    const userPrompt = `Analyze each vocabulary term below. Generate effective vocabulary test questions that assess collocation, synonym/antonym knowledge, spelling, and correct usage in context.

For each term, generate 1-4 questions focusing on vocabulary skills rather than simple definition recall. Use different question types (mcq, true_false, fill_blank) to test various aspects of vocabulary knowledge.

IMPORTANT: Include spelling questions (fill_blank type) that test the correct spelling of the target word. You may use grammatical variations (different tenses, word forms, parts of speech) when the sentence context requires it. For example, if the target word is "study" (verb), you can create a question requiring "studied" (past tense) or "studying" (present participle) based on the sentence context.

If an explanation field is provided (containing IPA, POS, Meaning, Example, Synonyms), use this information to create contextually rich questions.

Terms to analyze:

${body.terms
  .map(
    (term) => `Term ID: ${term.id}
Term: ${term.term}
Definition: ${term.definition}
${term.explanation ? `Explanation: ${term.explanation}` : ''}`
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
