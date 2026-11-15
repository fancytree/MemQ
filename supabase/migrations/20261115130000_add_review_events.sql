-- One row per answer.
--
-- user_term_progress keeps only where each card stands now: a card answered on
-- Monday and again on Wednesday shows Wednesday and nothing else. That is enough to
-- schedule the next review and not enough to say how much anybody studied on a
-- given day, or how often they were right. This is the record those questions need:
-- every answer, when it was given, and whether it was right.
--
-- It starts empty. Nothing before it can be reconstructed, so the charts that read
-- it fill in from the day it goes live.
CREATE TABLE IF NOT EXISTS public.review_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  term_id uuid NOT NULL REFERENCES public.terms(id) ON DELETE CASCADE,
  is_correct boolean NOT NULL,
  reviewed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS review_events_user_time
  ON public.review_events (user_id, reviewed_at DESC);

ALTER TABLE public.review_events ENABLE ROW LEVEL SECURITY;

-- A person reads and adds their own answers. Nobody edits or removes one: the
-- record is of what happened. (The Edge Function writes with the service role and
-- sets user_id itself.)
DROP POLICY IF EXISTS "review_events_select_own" ON public.review_events;
CREATE POLICY "review_events_select_own" ON public.review_events
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "review_events_insert_own" ON public.review_events;
CREATE POLICY "review_events_insert_own" ON public.review_events
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- The days, already counted. A chart of twelve weeks would otherwise fetch every
-- answer in them, and past a thousand it would quietly get only the first thousand.
-- Days are the person's own: the offset is theirs, in minutes east of UTC.
CREATE OR REPLACE FUNCTION public.review_days(since timestamptz, tz_offset_minutes integer DEFAULT 0)
RETURNS TABLE (day date, answers integer, correct integer, cards integer)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    ((reviewed_at AT TIME ZONE 'UTC') + make_interval(mins => tz_offset_minutes))::date AS day,
    count(*)::integer AS answers,
    (count(*) FILTER (WHERE is_correct))::integer AS correct,
    count(DISTINCT term_id)::integer AS cards
  FROM public.review_events
  WHERE user_id = auth.uid() AND reviewed_at >= since
  GROUP BY 1
  ORDER BY 1;
$$;

GRANT EXECUTE ON FUNCTION public.review_days(timestamptz, integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
