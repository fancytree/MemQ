-- A historical question is initialized to its current card revision.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.questions q JOIN public.terms t ON t.id=q.term_id
    WHERE q.id='cccccccc-cccc-4ccc-8ccc-cccccccccccc' AND q.source_revision=t.content_revision AND q.source_revision IS NOT NULL
  ) THEN RAISE EXCEPTION 'legacy question revision backfill failed'; END IF;
END $$;
DELETE FROM public.lessons WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
