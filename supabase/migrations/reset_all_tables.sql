-- 激进方案：删除所有表并重新创建
-- ⚠️ 警告：此操作会删除所有数据！

-- 1. 删除所有表（按依赖关系顺序）
DROP TABLE IF EXISTS public.questions CASCADE;
DROP TABLE IF EXISTS public.terms CASCADE;
DROP TABLE IF EXISTS public.lessons CASCADE;
DROP TABLE IF EXISTS public.user_daily_progress CASCADE;

-- 2. 重新创建 lessons 表
CREATE TABLE public.lessons (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  deadline TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 重新创建 terms 表（使用 term 和 definition，不是 front/back）
CREATE TABLE public.terms (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lesson_id UUID REFERENCES public.lessons(id) ON DELETE CASCADE NOT NULL,
  term TEXT NOT NULL,
  definition TEXT NOT NULL,
  explanation TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. 重新创建 questions 表
CREATE TABLE public.questions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  term_id UUID REFERENCES public.terms(id) ON DELETE CASCADE NOT NULL,
  question_text TEXT NOT NULL,
  question_type TEXT DEFAULT 'mcq',
  options JSONB,
  correct_answer TEXT NOT NULL,
  explanation TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. 重新创建 user_daily_progress 表
CREATE TABLE public.user_daily_progress (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  questions_completed INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date)
);

-- 6. 启用 RLS
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_daily_progress ENABLE ROW LEVEL SECURITY;

-- 7. 创建 RLS 策略

-- Lessons 策略
CREATE POLICY "Users can manage their own lessons" 
ON public.lessons FOR ALL 
TO authenticated
USING (auth.uid() = user_id);

-- Terms 策略
CREATE POLICY "Users can manage terms of their lessons" 
ON public.terms FOR ALL 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.lessons 
    WHERE public.lessons.id = public.terms.lesson_id 
    AND public.lessons.user_id = auth.uid()
  )
);

-- Questions 策略
CREATE POLICY "Users can manage questions of their terms" 
ON public.questions FOR ALL 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.terms 
    JOIN public.lessons ON public.terms.lesson_id = public.lessons.id
    WHERE public.terms.id = public.questions.term_id 
    AND public.lessons.user_id = auth.uid()
  )
);

-- User Daily Progress 策略
CREATE POLICY "Users can manage their own progress" 
ON public.user_daily_progress FOR ALL 
TO authenticated
USING (auth.uid() = user_id);

-- 8. 创建索引以提高性能
CREATE INDEX idx_lessons_user_id ON public.lessons(user_id);
CREATE INDEX idx_lessons_created_at ON public.lessons(created_at DESC);

CREATE INDEX idx_terms_lesson_id ON public.terms(lesson_id);
CREATE INDEX idx_terms_created_at ON public.terms(created_at DESC);

CREATE INDEX idx_questions_term_id ON public.questions(term_id);
CREATE INDEX idx_questions_created_at ON public.questions(created_at DESC);

CREATE INDEX idx_user_daily_progress_user_id ON public.user_daily_progress(user_id);
CREATE INDEX idx_user_daily_progress_date ON public.user_daily_progress(date DESC);

-- 9. 强制刷新 schema cache
NOTIFY pgrst, 'reload schema';

-- 10. 验证表结构
SELECT 
    table_name,
    column_name, 
    data_type, 
    is_nullable
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name IN ('lessons', 'terms', 'questions', 'user_daily_progress')
ORDER BY table_name, ordinal_position;

-- 预期结果：
-- lessons: id, user_id, name, description, deadline, created_at
-- terms: id, lesson_id, term, definition, explanation, created_at
-- questions: id, term_id, question_text, question_type, options, correct_answer, explanation, created_at
-- user_daily_progress: id, user_id, date, questions_completed, created_at, updated_at

