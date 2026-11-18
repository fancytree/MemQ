-- The pdfs bucket holds what people upload to be read: PDFs, and photos taken
-- in chat. A public bucket serves every one of them from
-- /storage/v1/object/public/pdfs/<path> with no sign-in, no token and no expiry,
-- and RLS does not apply to that endpoint at all. The paths carry a user id, so
-- they are not guessable — but a link that escapes once works for ever.
--
-- Two steps, because either alone leaves it open:
--   1. the bucket's own public flag, which is what serves /object/public/;
--   2. the "Public can read PDFs" policy, which granted SELECT on the whole
--      bucket to the `public` role — anonymous requests would still read every
--      file through the authenticated endpoint with only the publishable key.
--
-- What stays: "Users can read their own PDFs" (authenticated, own folder). That
-- is what signed URLs are issued against, and the app now asks for one
-- everywhere (lib/pdfSignedUrl.ts, 15 minutes).

update storage.buckets set public = false where id = 'pdfs';

drop policy if exists "Public can read PDFs" on storage.objects;
