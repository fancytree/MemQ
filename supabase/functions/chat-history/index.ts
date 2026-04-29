// Supabase Edge Function - Chat History
// 获取用户的对话历史列表（从数据库读取）

/// <reference path="./deno.d.ts" />

// @ts-ignore - Deno remote import
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// CORS 响应头
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// 请求体类型定义（可选，用于过滤模式）
interface GetChatHistoryRequest {
  mode?: 'ask' | 'vocab_lookup' | 'practice'; // 可选：按模式过滤
}

// 响应类型定义
interface ChatThread {
  id: string;
  thread_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  preview?: string; // 对话预览（第一条用户消息）
  mode?: string; // 对话模式
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

    // 解析请求体（如果有）
    let body: GetChatHistoryRequest = {};
    try {
      const requestText = await req.text();
      if (requestText) {
        body = JSON.parse(requestText);
      }
    } catch {
      // 如果没有请求体，使用默认值
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

    // 构建查询
    let query = supabase
      .from('chat_threads')
      .select('id, thread_id, title, created_at, updated_at, mode')
      .eq('user_id', user.id);

    // 如果指定了模式，添加过滤
    if (body.mode) {
      query = query.eq('mode', body.mode);
    }

    // 获取用户的对话线程列表
    const { data: threads, error: threadsError } = await query
      .order('updated_at', { ascending: false })
      .limit(50); // 限制返回最近 50 条

    if (threadsError) {
      console.error('Error fetching threads:', threadsError);
      throw new Error('Failed to fetch chat threads');
    }

    // 为每个线程生成标题和预览（如果还没有标题）
    const threadsWithTitles: ChatThread[] = await Promise.all(
      (threads || []).map(async (thread) => {
        let title = thread.title;
        let preview = '';

        // 如果还没有标题，从第一条用户消息生成标题
        if (!title) {
          try {
            const { data: firstUserMessage } = await supabase
              .from('chat_messages')
              .select('content')
              .eq('thread_id', thread.thread_id)
              .eq('user_id', user.id)
              .eq('role', 'user')
              .order('created_at', { ascending: true })
              .limit(1)
              .single();

            if (firstUserMessage && firstUserMessage.content) {
              const messageText = firstUserMessage.content.trim();
              if (messageText.length > 0) {
                  title = messageText.substring(0, 30).trim();
                  if (title.length < messageText.length) {
                    title += '...';
                  }
                preview = messageText.substring(0, 100);

              // 更新数据库中的标题
              await supabase
                .from('chat_threads')
                .update({ title })
                .eq('id', thread.id);
              }
            }
          } catch (error) {
            console.error(`Error generating title for thread ${thread.thread_id}:`, error);
          }
        } else {
          // 如果已有标题，获取预览（从第一条用户消息）
          try {
            const { data: firstUserMessage } = await supabase
              .from('chat_messages')
              .select('content')
              .eq('thread_id', thread.thread_id)
              .eq('user_id', user.id)
              .eq('role', 'user')
              .order('created_at', { ascending: true })
              .limit(1)
              .single();

            if (firstUserMessage && firstUserMessage.content) {
              preview = firstUserMessage.content.substring(0, 100);
            }
          } catch (error) {
            console.error(`Error fetching preview for thread ${thread.thread_id}:`, error);
          }
        }

        return {
          id: thread.id,
          thread_id: thread.thread_id,
          title: title || 'New Conversation',
          created_at: thread.created_at,
          updated_at: thread.updated_at,
          preview,
          mode: thread.mode || 'ask',
        };
      })
    );

    // 返回成功响应
    return new Response(
      JSON.stringify({
        success: true,
        data: threadsWithTitles,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in chat-history:', error);
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
