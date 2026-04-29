-- 为 chat_threads 表添加 mode 字段，用于区分不同的对话模式
ALTER TABLE chat_threads 
ADD COLUMN IF NOT EXISTS mode TEXT CHECK (mode IN ('ask', 'vocab_lookup', 'practice')) DEFAULT 'ask';

-- 创建索引以提高按模式查询的性能
CREATE INDEX IF NOT EXISTS idx_chat_threads_mode ON chat_threads(mode);
CREATE INDEX IF NOT EXISTS idx_chat_threads_user_mode ON chat_threads(user_id, mode);

