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

// 学习阶段定义
const STAGES: string[] = ['New', 'Learning', 'Familiar', 'Good', 'Strong', 'Mastered'];

// 根据 step_index 计算下次复习间隔（天数）
const getReviewIntervalDays = (stepIndex: number): number => {
  const intervals: { [key: number]: number } = {
    0: 1,   // New -> 1天后
    1: 3,   // Learning -> 3天后
    2: 7,   // Familiar -> 7天后
    3: 14,  // Good -> 14天后
    4: 30,  // Strong -> 30天后
    5: 90,  // Mastered -> 90天后（可选，或者设置为很远的日期）
  };
  return intervals[stepIndex] || 1;
};

// 请求体类型定义
interface UpdateProgressRequest {
  term_id: string;
  is_correct: boolean;
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

    // 确定当前索引（如果不存在，默认为 0）
    const currentIndex = currentProgress?.step_index ?? 0;
    const now = new Date();

    // Step A: 获取 Deadline
    // 查询该 Term 所属的 Lesson，获取 deadline 字段
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
        deadline = new Date(lessonData.deadline);
      }
    }

    // 计算新的索引和状态
    let newIndex: number;
    let nextReviewAt: Date;

    if (body.is_correct) {
      // 答对了：索引 + 1（最大为 5）
      newIndex = Math.min(currentIndex + 1, 5);
      
      // Step B: 计算标准间隔 (Standard Interval)
      const standardIntervalDays = getReviewIntervalDays(newIndex);
      
      // Step C: 计算压缩间隔 (Compressed Interval)
      let finalIntervalDays = standardIntervalDays;
      
      if (deadline && deadline > now) {
        // 计算剩余天数
        const daysUntilDeadline = Math.ceil(
          (deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        );
        
        // 计算剩余阶段（目标是 Mastered，Index 5）
        // 如果当前是 index 2 (Familiar)，则剩余 3 个阶段 (3->4, 4->5, 5->Done)
        const targetIndex = 5; // Mastered
        const stagesRemaining = Math.max(1, targetIndex - newIndex);
        
        // 最大允许间隔：days_until_deadline / stages_remaining
        const maxAllowedInterval = daysUntilDeadline / stagesRemaining;
        
        // Step D: 决策 (Decision)
        // Final Interval = Math.min(standard_interval, max_allowed_interval)
        finalIntervalDays = Math.min(standardIntervalDays, maxAllowedInterval);
        
        // 保底策略：如果 Final Interval < 1，设置为 1 天 (Cram Mode)
        if (finalIntervalDays < 1) {
          finalIntervalDays = 1;
        }
      }
      
      // 根据最终间隔计算下次复习时间
      nextReviewAt = new Date(now);
      nextReviewAt.setDate(nextReviewAt.getDate() + Math.ceil(finalIntervalDays));
    } else {
      // 答错了：降级到 'Learning' (index 1)
      newIndex = 1;
      // 立即复习（设置为当前时间）
      nextReviewAt = now;
    }

    // 准备更新数据
    const updateData = {
      user_id: user.id,
      term_id: body.term_id,
      status: STAGES[newIndex] as any,
      step_index: newIndex,
      last_reviewed_at: now.toISOString(),
      next_review_at: nextReviewAt.toISOString(),
    };

    // 使用 upsert 更新或插入记录
    // 注意：onConflict 应该使用唯一约束的名称，或者直接使用列名
    const { data, error: upsertError } = await supabase
      .from('user_term_progress')
      .upsert(updateData, {
        onConflict: 'user_id,term_id', // 使用列名组合作为冲突键
      })
      .select()
      .single();

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

