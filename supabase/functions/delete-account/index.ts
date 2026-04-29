// Supabase Edge Function - Delete User Account
// 彻底删除用户账号和相关数据（满足 iOS 审核要求）

/// <reference path="./deno.d.ts" />

// @ts-ignore - Deno remote import
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// CORS 响应头
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    // 初始化 Supabase 客户端
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    
    if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
      throw new Error('Missing Supabase environment variables');
    }

    // 验证用户
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

    const userId = user.id;

    // 创建 Supabase Admin 客户端（用于删除操作）
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    console.log(`Starting account deletion for user: ${userId}`);

    // 1. 删除存储中的用户文件
    try {
      // 删除用户头像（路径格式：userId/filename）
      try {
        const { data: avatarFiles, error: listAvatarError } = await supabaseAdmin.storage
          .from('avatars')
          .list(userId, {
            limit: 1000,
            offset: 0,
          });

        if (!listAvatarError && avatarFiles && avatarFiles.length > 0) {
          const avatarPaths = avatarFiles.map((file) => `${userId}/${file.name}`);
          const { error: deleteAvatarError } = await supabaseAdmin.storage
            .from('avatars')
            .remove(avatarPaths);

          if (deleteAvatarError) {
            console.error('Error deleting avatar files:', deleteAvatarError);
          } else {
            console.log(`Deleted ${avatarFiles.length} avatar file(s)`);
          }
        }
      } catch (avatarError) {
        console.error('Error deleting avatar files:', avatarError);
        // 继续执行
      }

      // 删除用户 PDF 文件（路径格式：userId/filename）
      try {
        const { data: pdfFiles, error: listPdfError } = await supabaseAdmin.storage
          .from('pdfs')
          .list(userId, {
            limit: 1000,
            offset: 0,
          });

        if (!listPdfError && pdfFiles && pdfFiles.length > 0) {
          const pdfPaths = pdfFiles.map((file) => `${userId}/${file.name}`);
          const { error: deletePdfError } = await supabaseAdmin.storage
            .from('pdfs')
            .remove(pdfPaths);

          if (deletePdfError) {
            console.error('Error deleting PDF files:', deletePdfError);
          } else {
            console.log(`Deleted ${pdfFiles.length} PDF file(s)`);
          }
        }
      } catch (pdfError) {
        console.error('Error deleting PDF files:', pdfError);
        // 继续执行
      }
    } catch (storageError) {
      console.error('Error deleting storage files:', storageError);
      // 继续执行，不阻断删除流程
    }

    // 2. 显式删除数据库中的用户数据（虽然 CASCADE 会自动处理，但为了确保完整性）
    // 注意：由于设置了 ON DELETE CASCADE，删除用户时会自动删除关联数据
    // 但为了确保彻底删除，我们显式删除主要表的数据

    try {
      // 删除 user_term_progress（用户学习进度）
      const { error: progressError } = await supabaseAdmin
        .from('user_term_progress')
        .delete()
        .eq('user_id', userId);

      if (progressError) {
        console.error('Error deleting user_term_progress:', progressError);
      } else {
        console.log('Deleted user_term_progress records');
      }

      // 删除 user_daily_progress（如果存在）
      const { error: dailyProgressError } = await supabaseAdmin
        .from('user_daily_progress')
        .delete()
        .eq('user_id', userId);

      if (dailyProgressError) {
        // 表可能不存在，忽略错误
        console.log('user_daily_progress table may not exist, skipping');
      } else {
        console.log('Deleted user_daily_progress records');
      }

      // 删除 chat_messages（聊天消息）
      const { error: messagesError } = await supabaseAdmin
        .from('chat_messages')
        .delete()
        .eq('user_id', userId);

      if (messagesError) {
        console.error('Error deleting chat_messages:', messagesError);
      } else {
        console.log('Deleted chat_messages records');
      }

      // 删除 chat_threads（聊天线程）
      const { error: threadsError } = await supabaseAdmin
        .from('chat_threads')
        .delete()
        .eq('user_id', userId);

      if (threadsError) {
        console.error('Error deleting chat_threads:', threadsError);
      } else {
        console.log('Deleted chat_threads records');
      }

      // 删除 lessons（课程，会自动 CASCADE 删除 terms 和 questions）
      const { error: lessonsError } = await supabaseAdmin
        .from('lessons')
        .delete()
        .eq('user_id', userId);

      if (lessonsError) {
        console.error('Error deleting lessons:', lessonsError);
      } else {
        console.log('Deleted lessons records');
      }

      // 删除 profiles（用户资料）
      const { error: profilesError } = await supabaseAdmin
        .from('profiles')
        .delete()
        .eq('id', userId);

      if (profilesError) {
        console.error('Error deleting profiles:', profilesError);
      } else {
        console.log('Deleted profiles record');
      }
    } catch (dbError) {
      console.error('Error deleting database records:', dbError);
      // 继续执行，尝试删除 Auth 用户
    }

    // 3. 删除 Auth 用户（使用 Admin API）
    // 这会触发 CASCADE 删除所有关联的数据
    const { error: deleteUserError } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (deleteUserError) {
      console.error('Error deleting auth user:', deleteUserError);
      throw new Error(`Failed to delete auth user: ${deleteUserError.message}`);
    }

    console.log(`Successfully deleted user account: ${userId}`);

    // 返回成功响应
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Account deleted successfully',
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in delete-account:', error);
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

