-- 创建 PDFs Storage Bucket 并配置 RLS 策略
-- 用于存储用户上传的 PDF 文件，供 MinerU API 解析

-- 1. 创建 Storage Bucket（如果不存在）
-- 注意：Supabase 的 Storage Bucket 需要通过 Dashboard 或 API 创建
-- 这里只创建 RLS 策略，bucket 需要在 Dashboard 中手动创建

-- 2. 启用 Storage 的 RLS（如果还没有启用）
-- Storage 的 RLS 默认是启用的

-- 3. 创建 RLS 策略：允许认证用户上传文件到自己的文件夹
CREATE POLICY "Users can upload PDFs to their own folder"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'pdfs' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 4. 创建 RLS 策略：允许认证用户读取自己的文件
CREATE POLICY "Users can read their own PDFs"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'pdfs' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 5. 创建 RLS 策略：允许认证用户删除自己的文件
CREATE POLICY "Users can delete their own PDFs"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'pdfs' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 6. 创建 RLS 策略：允许公开读取（用于 MinerU API 访问）
-- 注意：这允许任何人读取 bucket 中的文件，因为 MinerU API 需要访问
-- 如果担心安全性，可以考虑使用预签名 URL 或其他方式
CREATE POLICY "Public can read PDFs"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'pdfs');

