-- Keep authored questions without presenting them after their source card changes.
ALTER TABLE public.terms ADD COLUMN IF NOT EXISTS content_revision uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS source_revision uuid;
UPDATE public.questions AS q SET source_revision=t.content_revision
  FROM public.terms AS t WHERE q.term_id=t.id AND q.source_revision IS NULL;

CREATE OR REPLACE FUNCTION public.memq_card_revision() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  IF ROW(NEW.term,NEW.definition,NEW.explanation,NEW.language_data)
     IS DISTINCT FROM ROW(OLD.term,OLD.definition,OLD.explanation,OLD.language_data) THEN
    NEW.content_revision := gen_random_uuid();
  ELSE
    NEW.content_revision := OLD.content_revision;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS memq_card_revision ON public.terms;
CREATE TRIGGER memq_card_revision BEFORE UPDATE ON public.terms FOR EACH ROW EXECUTE FUNCTION public.memq_card_revision();

CREATE OR REPLACE FUNCTION public.memq_question_revision() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE current_revision uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND ROW(NEW.term_id,NEW.question_text,NEW.question_type,NEW.options,NEW.correct_answer,NEW.explanation)
    IS NOT DISTINCT FROM ROW(OLD.term_id,OLD.question_text,OLD.question_type,OLD.options,OLD.correct_answer,OLD.explanation)
    AND NEW.source_revision IS NOT DISTINCT FROM OLD.source_revision THEN
    NEW.source_revision := OLD.source_revision;
  ELSE
    SELECT content_revision INTO current_revision FROM public.terms WHERE id=NEW.term_id FOR SHARE;
    IF current_revision IS NULL THEN RAISE EXCEPTION 'Card not found or inaccessible'; END IF;
    IF TG_OP = 'INSERT' AND NEW.source_revision IS NOT NULL AND NEW.source_revision IS DISTINCT FROM current_revision THEN
      RAISE EXCEPTION 'Card changed; reload it before creating the question';
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.source_revision IS DISTINCT FROM current_revision THEN
      RAISE EXCEPTION 'Card changed; reload it before updating the question';
    END IF;
    NEW.source_revision := current_revision;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS memq_question_revision ON public.questions;
CREATE TRIGGER memq_question_revision BEFORE INSERT OR UPDATE ON public.questions FOR EACH ROW EXECUTE FUNCTION public.memq_question_revision();
