// Supabase Edge Function - Delete Chat Thread
// 删除用户的对话线程

/// <reference path="./deno.d.ts" />

// @ts-ignore - Deno remote import
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// @ts-ignore - Deno remote import
import OpenAI from 'https://esm.sh/openai@4';

// CORS 响应头
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// 请求体类型定义
interface DeleteThreadRequest {
  thread_id: string;
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
    const body: DeleteThreadRequest = await req.json();

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

    // 删除数据库中的记录
    const { error: deleteError } = await supabase
      .from('chat_threads')
      .delete()
      .eq('id', threadData.id)
      .eq('user_id', user.id);

    if (deleteError) {
      console.error('Error deleting thread from database:', deleteError);
      throw new Error('Failed to delete thread from database');
    }

    // 可选：删除 OpenAI 中的线程（如果需要）
    // 注意：OpenAI 的线程删除是可选的，因为我们已经从数据库中删除了记录
    // 如果将来需要清理 OpenAI 的资源，可以在这里添加：
    /*
    try {
      const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
      if (openaiApiKey) {
        const openai = new OpenAI({
          apiKey: openaiApiKey,
        });
        await openai.beta.threads.del(body.thread_id);
      }
    } catch (error) {
      console.error('Error deleting thread from OpenAI:', error);
      // 不抛出错误，因为数据库记录已经删除
    }
    */

    // 返回成功响应
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Thread deleted successfully',
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in chat-delete-thread:', error);
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

