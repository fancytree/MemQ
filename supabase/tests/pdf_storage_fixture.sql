-- Only for a disposable local test database.
CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE storage.buckets (id text PRIMARY KEY, public boolean NOT NULL);
CREATE TABLE storage.objects (bucket_id text NOT NULL, name text NOT NULL);
CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY[split_part($1, '/', 1)] $$;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA storage TO anon, authenticated;
GRANT SELECT ON storage.objects TO anon, authenticated;
CREATE POLICY "Public can read PDFs" ON storage.objects FOR SELECT TO PUBLIC USING (bucket_id = 'pdfs');
CREATE POLICY "Users can read their own PDFs" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'pdfs' AND (storage.foldername(name))[1] = auth.uid()::text);
INSERT INTO storage.buckets VALUES ('pdfs', true);
INSERT INTO storage.objects VALUES ('pdfs', '11111111-1111-1111-1111-111111111111/a.pdf'), ('pdfs', '22222222-2222-2222-2222-222222222222/b.pdf');
