-- What the schedule remembers about a card beyond the stage it is at.
--
-- ease   how readily this card sticks for this person: the multiplier on its waits.
--        It falls when a card that had been learned is missed, and creeps back up
--        with each spaced success, so a stubborn card returns sooner than an easy one.
-- lapses how many times a learned card has been forgotten.
--
-- Both are optional to the code that writes progress: it retries without them when
-- the columns are missing, so this migration can run before or after a deploy.
ALTER TABLE public.user_term_progress
  ADD COLUMN IF NOT EXISTS ease real NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS lapses integer NOT NULL DEFAULT 0;

ALTER TABLE public.user_term_progress
  DROP CONSTRAINT IF EXISTS user_term_progress_ease_range,
  ADD CONSTRAINT user_term_progress_ease_range CHECK (ease >= 0.5 AND ease <= 1.5),
  DROP CONSTRAINT IF EXISTS user_term_progress_lapses_nonnegative,
  ADD CONSTRAINT user_term_progress_lapses_nonnegative CHECK (lapses >= 0);

COMMENT ON COLUMN public.user_term_progress.ease IS 'Multiplier on this card''s review waits (0.6–1.3); see supabase/functions/_shared/scheduler.ts';
COMMENT ON COLUMN public.user_term_progress.lapses IS 'Times a learned card (Familiar or above) was answered wrong';

NOTIFY pgrst, 'reload schema';
