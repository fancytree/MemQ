ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS learning_mode TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'lessons' AND column_name = 'is_vocab_mode'
  ) THEN
    UPDATE public.lessons
    SET learning_mode = CASE WHEN is_vocab_mode THEN 'language' ELSE 'knowledge' END
    WHERE learning_mode IS NULL;
  ELSE
    UPDATE public.lessons SET learning_mode = 'knowledge' WHERE learning_mode IS NULL;
  END IF;
END $$;

ALTER TABLE public.lessons
  ALTER COLUMN learning_mode SET DEFAULT 'knowledge',
  ALTER COLUMN learning_mode SET NOT NULL;

ALTER TABLE public.lessons
  ADD CONSTRAINT lessons_learning_mode_check
  CHECK (learning_mode IN ('language', 'knowledge'));

COMMENT ON COLUMN public.lessons.learning_mode IS
  'Language learning (vocabulary, phrases and grammar) or knowledge learning.';

