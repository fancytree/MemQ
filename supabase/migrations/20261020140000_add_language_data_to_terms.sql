-- Language learning details are optional and do not change knowledge cards.
ALTER TABLE public.terms
  ADD COLUMN IF NOT EXISTS language_data JSONB;

ALTER TABLE IF EXISTS public.explore_terms
  ADD COLUMN IF NOT EXISTS language_data JSONB;

COMMENT ON COLUMN public.terms.language_data IS
  'Structured language card data: language_code, pronunciation, part_of_speech, forms, example, synonyms, antonyms and collocations.';
