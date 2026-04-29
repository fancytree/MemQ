-- 创建聊天线程表，用于存储用户的对话记录
CREATE TABLE IF NOT EXISTS chat_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  thread_id TEXT NOT NULL UNIQUE, -- OpenAI Thread ID
  title TEXT, -- 对话标题（由 AI 生成）
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chat_threads_user_thread_unique UNIQUE (user_id, thread_id)
);

-- 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_chat_threads_user_id ON chat_threads(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_threads_created_at ON chat_threads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_threads_thread_id ON chat_threads(thread_id);

-- 启用 Row Level Security
ALTER TABLE chat_threads ENABLE ROW LEVEL SECURITY;

-- 创建策略：用户只能访问自己的对话记录
CREATE POLICY "Users can view their own chat threads"
  ON chat_threads
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own chat threads"
  ON chat_threads
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own chat threads"
  ON chat_threads
  FOR UPDATE
  USING (auth.uid() = user_id);

-- 创建更新 updated_at 的触发器
CREATE OR REPLACE FUNCTION update_chat_threads_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_chat_threads_updated_at
  BEFORE UPDATE ON chat_threads
  FOR EACH ROW
  EXECUTE FUNCTION update_chat_threads_updated_at();

