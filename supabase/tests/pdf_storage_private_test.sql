-- This fake fixture models the bucket setting; production must use Storage API.
UPDATE storage.buckets SET public = false WHERE id = 'pdfs';
-- Exercise RLS and bucket metadata after the review-only candidate is applied.
DO $$ BEGIN
  IF (SELECT public FROM storage.buckets WHERE id = 'pdfs') IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'PDF bucket remains public';
  END IF;
END $$;
SET ROLE anon;
DO $$ BEGIN
  IF (SELECT count(*) FROM storage.objects) <> 0 THEN RAISE EXCEPTION 'Anonymous PDF access'; END IF;
END $$;
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
DO $$ BEGIN
  IF (SELECT count(*) FROM storage.objects) <> 1 THEN RAISE EXCEPTION 'Owner isolation failed'; END IF;
  IF EXISTS (SELECT 1 FROM storage.objects WHERE name LIKE '22222222%') THEN RAISE EXCEPTION 'Another user PDF visible'; END IF;
END $$;
RESET ROLE;
SELECT 'PDF private bucket and owner policies passed' AS result;
