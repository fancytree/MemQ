-- SRS (间隔重复系统) 数据库 Schema
-- 用于追踪用户对每个单词 (Term) 的掌握程度

-- 1. 创建学习阶段枚举类型
CREATE TYPE learning_stage AS ENUM (
  'New',
  'Learning',
  'Familiar',
  'Good',
  'Strong',
  'Mastered'
);

-- 2. 创建用户词条进度表
CREATE TABLE public.user_term_progress (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  term_id UUID REFERENCES public.terms(id) ON DELETE CASCADE NOT NULL,
  status learning_stage DEFAULT 'New' NOT NULL,
  step_index INTEGER DEFAULT 0 NOT NULL,
  next_review_at TIMESTAMPTZ,
  last_reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  -- 唯一约束：确保同一个用户对同一个 Term 只能有一条进度记录
  UNIQUE(user_id, term_id)
);

-- 3. 创建索引以提高查询性能
CREATE INDEX idx_user_term_progress_user_id ON public.user_term_progress(user_id);
CREATE INDEX idx_user_term_progress_term_id ON public.user_term_progress(term_id);
CREATE INDEX idx_user_term_progress_next_review ON public.user_term_progress(next_review_at) WHERE next_review_at IS NOT NULL;
CREATE INDEX idx_user_term_progress_user_next_review ON public.user_term_progress(user_id, next_review_at) WHERE next_review_at IS NOT NULL;

-- 4. 启用行级安全 (RLS)
ALTER TABLE public.user_term_progress ENABLE ROW LEVEL SECURITY;

-- 5. 创建 RLS 策略
-- 允许用户查看自己的进度记录
CREATE POLICY "Users can view their own term progress"
ON public.user_term_progress
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- 允许用户插入自己的进度记录
CREATE POLICY "Users can insert their own term progress"
ON public.user_term_progress
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- 允许用户更新自己的进度记录
CREATE POLICY "Users can update their own term progress"
ON public.user_term_progress
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 允许用户删除自己的进度记录
CREATE POLICY "Users can delete their own term progress"
ON public.user_term_progress
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- 6. 添加注释说明
COMMENT ON TABLE public.user_term_progress IS '用户词条学习进度表，用于 SRS 间隔重复系统';
COMMENT ON COLUMN public.user_term_progress.status IS '学习阶段：New -> Learning -> Familiar -> Good -> Strong -> Mastered';
COMMENT ON COLUMN public.user_term_progress.step_index IS '算法步骤索引 (0-5)，对应不同的学习阶段';
COMMENT ON COLUMN public.user_term_progress.next_review_at IS '下次复习时间，用于间隔重复算法';
COMMENT ON COLUMN public.user_term_progress.last_reviewed_at IS '上次复习时间';

-- 7. 强制刷新 schema cache
NOTIFY pgrst, 'reload schema';

