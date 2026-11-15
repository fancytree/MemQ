import { isDirectUserSession } from '../_shared/directSession.ts';
import { cardStateFromRow, scheduleReview, STAGES } from '../_shared/scheduler.ts';
// Supabase Edge Function - Update Term Progress (SRS Algorithm)
// Deno environment

/// <reference path="./deno.d.ts" />

// @ts-ignore - Deno remote import
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// CORS 响应头
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// 请求体类型定义
interface UpdateProgressRequest {
  term_id: string;
  is_correct: boolean;
  /** Minutes east of UTC, so a wait of days can end when the person's day starts. */
  tz_offset_minutes?: number;
}

Deno.serve(async (req: Request) => {
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
    const body: UpdateProgressRequest = await req.json();

    // 验证输入
    if (!body.term_id || typeof body.is_correct !== 'boolean') {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: term_id and is_correct' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 初始化 Supabase 客户端（使用 Service Role Key 以绕过 RLS 进行数据库操作）
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 从 Authorization header 获取 token 并验证用户
    const token = authHeader.replace('Bearer ', '');
    
    // 创建临时客户端来验证用户
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

    // 获取用户信息
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

    // Verified third-party OAuth sessions are limited to the MCP endpoint.
    if (!isDirectUserSession(authHeader)) {
      return new Response(JSON.stringify({ error: 'This action is not available to connected apps.' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 获取当前用户对该 term 的进度记录
    const { data: currentProgress, error: fetchError } = await supabase
      .from('user_term_progress')
      .select('*')
      .eq('user_id', user.id)
      .eq('term_id', body.term_id)
      .maybeSingle();

    if (fetchError && fetchError.code !== 'PGRST116') {
      console.error('Error fetching progress:', fetchError);
      throw new Error('Failed to fetch current progress');
    }

    const currentIndex = currentProgress?.step_index ?? 0;
    const now = new Date();

    // The lesson's deadline, if it has one: the schedule bends to fit it.
    const { data: termData, error: termError } = await supabase
      .from('terms')
      .select('lesson_id')
      .eq('id', body.term_id)
      .single();

    let deadline: Date | null = null;
    if (!termError && termData && termData.lesson_id) {
      const { data: lessonData, error: lessonError } = await supabase
        .from('lessons')
        .select('deadline')
        .eq('id', termData.lesson_id)
        .single();

      if (!lessonError && lessonData && lessonData.deadline) {
        const parsed = new Date(lessonData.deadline);
        if (!Number.isNaN(parsed.getTime())) deadline = parsed;
      }
    }

    // The schedule itself lives in _shared/scheduler.ts, which the app's offline
    // fallback runs too. What it decides here: a stage is earned only by a card that
    // was due, so the several questions one round asks about a card move it once.
    const tzOffsetMinutes = typeof body.tz_offset_minutes === 'number'
      && Number.isFinite(body.tz_offset_minutes) && Math.abs(body.tz_offset_minutes) <= 14 * 60
      ? body.tz_offset_minutes : null;
    const review = scheduleReview({
      state: cardStateFromRow(currentProgress),
      isCorrect: body.is_correct, now, deadline, tzOffsetMinutes,
    });
    const newIndex = review.stepIndex;
    const nextReviewAt = review.nextReviewAt;

    const baseUpdate = {
      user_id: user.id,
      term_id: body.term_id,
      status: review.status as any,
      step_index: newIndex,
      last_reviewed_at: now.toISOString(),
      next_review_at: nextReviewAt.toISOString(),
    };

    // `ease` and `lapses` arrive with a migration. Until it has run the columns are
    // not there, and the answer is still recorded without them.
    let { error: upsertError } = await supabase
      .from('user_term_progress')
      .upsert({ ...baseUpdate, ease: review.ease, lapses: review.lapses }, { onConflict: 'user_id,term_id' });
    if (upsertError && (upsertError.code === 'PGRST204' || upsertError.code === '42703')) {
      ({ error: upsertError } = await supabase
        .from('user_term_progress')
        .upsert(baseUpdate, { onConflict: 'user_id,term_id' }));
    }

    if (upsertError) {
      console.error('Error upserting progress:', upsertError);
      throw new Error('Failed to update progress');
    }

    // 返回成功响应
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          term_id: body.term_id,
          previous_index: currentIndex,
          new_index: newIndex,
          previous_status: currentProgress?.status || STAGES[0],
          new_status: STAGES[newIndex],
          next_review_at: nextReviewAt.toISOString(),
          outcome: review.outcome,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error updating term progress:', error);
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

