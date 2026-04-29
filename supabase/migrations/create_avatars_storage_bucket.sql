-- 创建 Avatars Storage Bucket 并配置 RLS 策略
-- 用于存储用户头像

-- 1. 创建 Storage Bucket（如果不存在）
-- 注意：Supabase 的 Storage Bucket 需要通过 Dashboard 或 API 创建
-- 这里只创建 RLS 策略，bucket 需要在 Dashboard 中手动创建

-- 2. 启用 Storage 的 RLS（如果还没有启用）
-- Storage 的 RLS 默认是启用的

-- 3. 创建 RLS 策略：允许认证用户上传头像到自己的文件夹
CREATE POLICY "Users can upload avatars to their own folder"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 4. 创建 RLS 策略：允许认证用户读取自己的头像
CREATE POLICY "Users can read their own avatars"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'avatars' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 5. 创建 RLS 策略：允许认证用户更新自己的头像
CREATE POLICY "Users can update their own avatars"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars' 
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'avatars' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 6. 创建 RLS 策略：允许认证用户删除自己的头像
CREATE POLICY "Users can delete their own avatars"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 7. 创建 RLS 策略：允许公开读取头像（用于显示）
CREATE POLICY "Public can read avatars"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'avatars');

