-- REVIEW-ONLY candidate. Do not apply before updated clients are distributed,
-- real MinerU signed-URL processing is verified, and existing integrations are
-- inventoried. Changing this bucket can break older app versions.
-- Set the bucket private separately using the Storage API or dashboard;
-- do not update Storage metadata directly through SQL.
BEGIN;
DROP POLICY IF EXISTS "Public can read PDFs" ON storage.objects;
-- The existing authenticated owner SELECT policy must remain in place. Audit
-- every other permissive SELECT policy before considering the bucket private.
COMMIT;
