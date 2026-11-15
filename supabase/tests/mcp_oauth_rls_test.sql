-- Tests the candidate, not the production schema or any SECURITY DEFINER API.
\set ON_ERROR_STOP on
SET ROLE authenticated;
SET request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
SET request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['user_daily_progress', 'profiles', 'ai_usage', 'chat_threads', 'chat_messages'] LOOP
    EXECUTE format('INSERT INTO public.%I VALUES ($1, 1)', table_name) USING auth.uid();
  END LOOP;
END $$;
INSERT INTO public.questions (term_id,question_text,question_type,correct_answer) SELECT id,'Test','fill_blank','hello' FROM public.terms WHERE term = 'ciao';
INSERT INTO public.user_term_progress SELECT id, auth.uid() FROM public.terms WHERE term = 'ciao';
DO $$ DECLARE table_name text; n int; BEGIN
  FOREACH table_name IN ARRAY ARRAY['user_daily_progress', 'profiles', 'ai_usage', 'chat_threads', 'chat_messages'] LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', table_name) INTO n;
    IF n <> 1 THEN RAISE EXCEPTION 'direct session lost access to %', table_name; END IF;
  END LOOP;
END $$;
SET request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","client_id":"test-client"}';
DO $$ DECLARE table_name text; n int; BEGIN
  IF EXISTS (SELECT 1 FROM public.user_daily_progress) OR EXISTS (SELECT 1 FROM public.profiles)
    OR EXISTS (SELECT 1 FROM public.ai_usage) OR EXISTS (SELECT 1 FROM public.chat_threads)
    OR EXISTS (SELECT 1 FROM public.chat_messages)
    OR EXISTS (SELECT 1 FROM public.user_term_progress) THEN RAISE EXCEPTION 'OAuth read personal data'; END IF;
  FOREACH table_name IN ARRAY ARRAY['user_daily_progress', 'profiles', 'ai_usage', 'chat_threads', 'chat_messages'] LOOP
    EXECUTE format('UPDATE public.%I SET value = 2', table_name);
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 0 THEN RAISE EXCEPTION 'OAuth updated %', table_name; END IF;
    EXECUTE format('DELETE FROM public.%I', table_name);
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 0 THEN RAISE EXCEPTION 'OAuth deleted from %', table_name; END IF;
  END LOOP;
  BEGIN
    INSERT INTO public.user_daily_progress VALUES (auth.uid(), 2);
    RAISE EXCEPTION 'OAuth inserted personal data';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  IF (SELECT count(*) FROM public.lessons WHERE name = 'Italian') <> 1 THEN RAISE EXCEPTION 'OAuth lost lesson access'; END IF;
  IF (SELECT count(*) FROM public.terms WHERE term = 'ciao') <> 1 OR (SELECT count(*) FROM public.questions) <> 1 THEN RAISE EXCEPTION 'OAuth lost card or question access'; END IF;
  UPDATE public.lessons SET name = 'Italian updated' WHERE name = 'Italian';
  UPDATE public.terms SET definition = 'hello updated' WHERE term = 'ciao';
  IF NOT FOUND THEN RAISE EXCEPTION 'OAuth could not edit its card'; END IF;
  DELETE FROM public.lessons WHERE name = 'Italian updated';
  IF NOT FOUND OR EXISTS (SELECT 1 FROM public.terms WHERE term = 'ciao') THEN RAISE EXCEPTION 'OAuth delete/cascade failed'; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.questions) OR EXISTS (SELECT 1 FROM public.user_term_progress) THEN
    RAISE EXCEPTION 'question or progress cascade failed';
  END IF;
END $$;
DROP TABLE public.profiles;
SELECT 'OAuth RLS candidate test passed' AS result;
