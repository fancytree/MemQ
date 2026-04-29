// Supabase Edge Function - Chat Thread Messages
// 获取特定对话线程的所有消息（从数据库读取）

/// <reference path="./deno.d.ts" />

// @ts-ignore - Deno remote import
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// CORS 响应头
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// 请求体类型定义
interface GetThreadMessagesRequest {
  thread_id: string;
}

// 响应类型定义
interface ThreadMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
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
    const body: GetThreadMessagesRequest = await req.json();

    // 验证输入
    if (!body.thread_id || typeof body.thread_id !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid thread_id' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 初始化 Supabase 客户端
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 验证用户
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    if (!supabaseAnonKey) {
      throw new Error('Missing SUPABASE_ANON_KEY');
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: authHeader },
      },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 验证该线程属于当前用户
    const { data: threadData, error: threadError } = await supabase
      .from('chat_threads')
      .select('id, thread_id')
      .eq('thread_id', body.thread_id)
      .eq('user_id', user.id)
      .single();

    if (threadError || !threadData) {
      return new Response(
        JSON.stringify({ error: 'Thread not found or access denied' }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 从数据库获取消息
    const { data: messages, error: messagesError } = await supabase
      .from('chat_messages')
      .select('id, role, content, created_at')
      .eq('thread_id', body.thread_id)
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(100); // 最多返回 100 条消息

    if (messagesError) {
      console.error('Error fetching messages:', messagesError);
      throw new Error('Failed to fetch messages');
    }

    // 转换消息格式（过滤掉 system 消息）
    const formattedMessages: ThreadMessage[] = (messages || [])
      .filter((msg) => msg.role === 'user' || msg.role === 'assistant')
      .map((msg) => ({
            id: msg.id,
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
            created_at: msg.created_at,
      }));

    // 返回成功响应
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          thread_id: body.thread_id,
          messages: formattedMessages,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in chat-thread-messages:', error);
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
