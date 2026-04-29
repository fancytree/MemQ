// Supabase Edge Function - Chat Extractor
// Deno environment

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import OpenAI from 'https://esm.sh/openai@4';

// CORS 响应头
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// 请求体类型定义
interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface UserLesson {
  id: string;
  name: string;
}

interface ChatExtractorRequest {
  messages: ChatMessage[];
  user_lessons: UserLesson[];
}

// 响应类型定义
interface ExtractedTerm {
  term: string;
  definition: string;
  suggested_action: 'save_to_existing' | 'create_new' | 'save_to_default';
  target_lesson_id?: string;
  target_lesson_name: string;
}

interface ChatExtractorResponse {
  reply_text: string;
  extracted_term: ExtractedTerm | null;
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
    const body: ChatExtractorRequest = await req.json();

    // 验证输入
    if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid messages array' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (!body.user_lessons || !Array.isArray(body.user_lessons)) {
  return new Response(
        JSON.stringify({ error: 'Missing or invalid user_lessons array' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 获取 OpenAI API Key
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      throw new Error('OPENAI_API_KEY environment variable is not set');
    }

    const openaiModel = Deno.env.get('OPENAI_MODEL') || 'gpt-4o-mini';

    const openai = new OpenAI({
      apiKey: openaiApiKey,
    });

    // 构建用户课程列表字符串（用于 System Prompt）
    const lessonsListText = body.user_lessons.length > 0
      ? body.user_lessons.map((lesson) => `- ${lesson.name} (ID: ${lesson.id})`).join('\n')
      : 'No existing lessons';

    // 构建 System Prompt
    const systemPrompt = `You are a smart study assistant. Your goal is to help users capture knowledge.

Analysis Logic:

1. Chat: Reply naturally to the user's query. Be helpful, friendly, and educational.

2. Extract: If the user mentions a specific fact, concept, or definition, EXTRACT it as a 'Term' and 'Definition'.
   - Term: Must be a core noun, concept, legal term, event name, or key terminology
   - Definition: Must be objective and concise, explaining WHAT the term IS
   - Only extract if there's a clear concept with a definition

3. Classify (The most important part):
   - Compare the extracted content with the provided user_lessons list
   - If a lesson name is semantically relevant (e.g., content is 'Benzene', lesson is 'Organic Chemistry'), suggest that lesson ID
   - If NO lesson matches, suggest creating a new lesson with a suitable name based on the topic
   - If the topic is too general or unclear, use 'save_to_default' action

User's Existing Lessons:
${lessonsListText}

Response Format (STRICT JSON):
{
  "reply_text": "Your natural reply to the user's query",
  "extracted_term": {
    "term": "Term Name",
    "definition": "Objective definition",
    "suggested_action": "save_to_existing" | "create_new" | "save_to_default",
    "target_lesson_id": "uuid" (only if suggested_action is "save_to_existing"),
    "target_lesson_name": "Lesson Name" (existing lesson name or new lesson name suggestion)
  }
}

IMPORTANT RULES:
- If no term is detected in the conversation, set extracted_term to null
- Only extract terms when there's a clear concept with a definition
- Be smart about matching topics to existing lessons (semantic matching)
- If creating a new lesson, suggest a concise, descriptive name
- Always return valid JSON`;

    // 转换消息格式为 OpenAI 格式
    const openaiMessages = body.messages.map((msg) => ({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.content,
    }));

    // 调用 OpenAI API
    const completion = await openai.chat.completions.create({
      model: openaiModel,
      messages: [
        { role: 'system', content: systemPrompt },
        ...openaiMessages,
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' },
    });

    const responseContent = completion.choices[0]?.message?.content;
    if (!responseContent) {
      throw new Error('No response from OpenAI');
    }

    // 解析 JSON 响应
    let parsedResponse: ChatExtractorResponse;
    try {
      parsedResponse = JSON.parse(responseContent);
    } catch (parseError) {
      console.error('Error parsing OpenAI response:', parseError);
      console.error('Response content:', responseContent);
      throw new Error('Invalid JSON response from OpenAI');
    }

    // 验证响应格式
    if (!parsedResponse.reply_text) {
      throw new Error('Missing reply_text in response');
    }

    // 验证 extracted_term（如果存在）
    if (parsedResponse.extracted_term !== null) {
      const term = parsedResponse.extracted_term;
      if (!term.term || !term.definition || !term.suggested_action || !term.target_lesson_name) {
        throw new Error('Invalid extracted_term format');
      }

      // 验证 suggested_action
      if (!['save_to_existing', 'create_new', 'save_to_default'].includes(term.suggested_action)) {
        throw new Error('Invalid suggested_action value');
      }

      // 如果 suggested_action 是 save_to_existing，必须有 target_lesson_id
      if (term.suggested_action === 'save_to_existing' && !term.target_lesson_id) {
        // 尝试从 user_lessons 中查找匹配的 lesson
        const matchedLesson = body.user_lessons.find(
          (lesson) => lesson.name.toLowerCase() === term.target_lesson_name.toLowerCase()
        );
        if (matchedLesson) {
          term.target_lesson_id = matchedLesson.id;
        } else {
          // 如果找不到匹配，降级为 create_new
          term.suggested_action = 'create_new';
          delete term.target_lesson_id;
        }
      }

      // 如果 suggested_action 不是 save_to_existing，移除 target_lesson_id
      if (term.suggested_action !== 'save_to_existing' && term.target_lesson_id) {
        delete term.target_lesson_id;
      }
    }

    // 返回成功响应
    return new Response(
      JSON.stringify({
        success: true,
        data: parsedResponse,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in chat-extractor:', error);
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
