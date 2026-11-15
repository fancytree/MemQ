-- Run after mcp_fixture.sql and the production migration in a disposable database.
\set ON_ERROR_STOP on
CREATE OR REPLACE FUNCTION public.test_reject_term() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.term = 'trigger-failure' THEN RAISE EXCEPTION 'simulated database failure'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER test_reject_term BEFORE INSERT ON public.terms FOR EACH ROW EXECUTE FUNCTION public.test_reject_term();
SET ROLE anon;
DO $$ BEGIN
  IF has_function_privilege(current_user, 'public.mcp_create_lesson(text,text,text,jsonb,timestamp with time zone,text)', 'EXECUTE') THEN RAISE EXCEPTION 'anonymous execution was granted'; END IF;
  IF has_function_privilege(current_user, 'public.mcp_add_practice_questions(uuid,jsonb)', 'EXECUTE') THEN RAISE EXCEPTION 'anonymous question creation was granted'; END IF;
END $$;
RESET ROLE;
SET ROLE authenticated;
SET request.jwt.claim.sub = '';
DO $$ BEGIN
  BEGIN
    PERFORM public.mcp_create_lesson('Anonymous', null, 'knowledge', '[]'::jsonb);
    RAISE EXCEPTION 'missing user unexpectedly accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'missing user unexpectedly accepted' THEN RAISE; END IF;
  END;
END $$;
SET request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
SELECT public.mcp_create_lesson('Italian', 'Sample', 'language', '[{"term":"ciao","definition":"hello","language_data":{"language_code":"it-IT"}}]'::jsonb) AS result \gset
DO $$ DECLARE old_revision uuid; BEGIN
  PERFORM public.mcp_create_lesson('Cover test', null, 'knowledge', '[]'::jsonb, '2027-01-20T12:00:00Z'::timestamptz, 'v1:lime:book-open');
  IF NOT EXISTS (SELECT 1 FROM public.lessons WHERE name='Cover test' AND deadline='2027-01-20T12:00:00Z'::timestamptz AND cover_style='v1:lime:book-open') THEN RAISE EXCEPTION 'lesson deadline or cover was not saved'; END IF;
  DELETE FROM public.lessons WHERE name='Cover test';
  IF (SELECT count(*) FROM public.lessons WHERE name = 'Italian') <> 1 OR (SELECT count(*) FROM public.terms WHERE term = 'ciao' AND language_data->>'language_code' = 'it-IT') <> 1 THEN RAISE EXCEPTION 'valid creation failed'; END IF;
  BEGIN
    PERFORM public.mcp_create_lesson('Bad language mode', null, 'knowledge', '[{"term":"ciao","definition":"hello","language_data":{"language_code":"it-IT"}}]'::jsonb);
    RAISE EXCEPTION 'knowledge lesson silently accepted language details';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'knowledge lesson silently accepted language details' THEN RAISE; END IF;
  END;
  IF EXISTS (SELECT 1 FROM public.lessons WHERE name='Bad language mode') THEN RAISE EXCEPTION 'invalid language lesson was saved'; END IF;
  PERFORM public.mcp_update_card((SELECT id FROM public.lessons WHERE name = 'Italian'), (SELECT id FROM public.terms WHERE term = 'ciao'), '{"language_data":{"pronunciation":"chow"}}');
  IF NOT EXISTS (SELECT 1 FROM public.terms WHERE term = 'ciao' AND language_data->>'language_code' = 'it-IT' AND language_data->>'pronunciation' = 'chow') THEN RAISE EXCEPTION 'partial language update lost existing fields'; END IF;
  PERFORM public.mcp_update_card((SELECT id FROM public.lessons WHERE name = 'Italian'), (SELECT id FROM public.terms WHERE term = 'ciao'), '{"language_data":null}');
  IF NOT EXISTS (SELECT 1 FROM public.terms WHERE term = 'ciao' AND language_data IS NULL) THEN RAISE EXCEPTION 'clearing language details failed'; END IF;
  PERFORM public.mcp_add_practice_questions((SELECT id FROM public.lessons WHERE name='Italian'), jsonb_build_array(
    jsonb_build_object('card_id',(SELECT id FROM public.terms WHERE term='ciao'),'card_revision',(SELECT content_revision FROM public.terms WHERE term='ciao'),'question_type','mcq','question_text','What does ciao mean?', 'options',jsonb_build_array('hello','water','good night','please','thanks'), 'correct_answer','hello'),
    jsonb_build_object('card_id',(SELECT id FROM public.terms WHERE term='ciao'),'card_revision',(SELECT content_revision FROM public.terms WHERE term='ciao'),'question_type','fill_blank','question_text','What does ciao mean?', 'correct_answer','hello')
  ));
  IF (SELECT count(*) FROM public.questions) <> 2 THEN RAISE EXCEPTION 'question batch was not saved'; END IF;
  SELECT content_revision INTO old_revision FROM public.terms WHERE term='ciao';
  IF EXISTS (SELECT 1 FROM public.questions q JOIN public.terms t ON t.id=q.term_id WHERE q.source_revision IS DISTINCT FROM t.content_revision) THEN RAISE EXCEPTION 'new question revision not captured'; END IF;
  UPDATE public.terms SET definition=definition WHERE term='ciao';
  IF EXISTS (SELECT 1 FROM public.questions q JOIN public.terms t ON t.id=q.term_id WHERE q.source_revision IS DISTINCT FROM t.content_revision) THEN RAISE EXCEPTION 'no-op edit invalidated questions'; END IF;
  UPDATE public.terms SET content_revision=gen_random_uuid() WHERE term='ciao';
  IF (SELECT content_revision FROM public.terms WHERE term='ciao') IS DISTINCT FROM old_revision THEN RAISE EXCEPTION 'revision changed without card content'; END IF;
  UPDATE public.terms SET definition='a greeting' WHERE term='ciao';
  IF EXISTS (SELECT 1 FROM public.questions q JOIN public.terms t ON t.id=q.term_id WHERE q.source_revision=t.content_revision) THEN RAISE EXCEPTION 'changed card left old questions current'; END IF;
  BEGIN
    PERFORM public.mcp_add_practice_questions((SELECT id FROM public.lessons WHERE name='Italian'), jsonb_build_array(
      jsonb_build_object('card_id',(SELECT id FROM public.terms WHERE term='ciao'),'card_revision',old_revision,'question_type','fill_blank','question_text','Old meaning?', 'correct_answer','hello')
    ));
    RAISE EXCEPTION 'old card revision unexpectedly accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'old card revision unexpectedly accepted' THEN RAISE; END IF;
  END;
  IF (SELECT count(*) FROM public.questions) <> 2 THEN RAISE EXCEPTION 'old revision added a question'; END IF;
  BEGIN
    INSERT INTO public.questions(term_id,question_text,question_type,correct_answer,source_revision)
      VALUES ((SELECT id FROM public.terms WHERE term='ciao'),'Old?', 'fill_blank','hello',old_revision);
    RAISE EXCEPTION 'old revision bypassed the insert trigger';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'old revision bypassed the insert trigger' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE public.questions SET question_text='Old source revision', source_revision=old_revision WHERE question_type='mcq';
    RAISE EXCEPTION 'old revision bypassed the update trigger';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'old revision bypassed the update trigger' THEN RAISE; END IF;
  END;
  UPDATE public.questions SET question_text='What is the updated meaning?', source_revision=(SELECT content_revision FROM public.terms WHERE term='ciao') WHERE question_type='mcq';
  IF (SELECT count(*) FROM public.questions q JOIN public.terms t ON t.id=q.term_id WHERE q.source_revision=t.content_revision) <> 1 THEN RAISE EXCEPTION 'updated question was not marked current'; END IF;
  BEGIN
    PERFORM public.mcp_add_practice_questions((SELECT id FROM public.lessons WHERE name='Italian'), jsonb_build_array(
      jsonb_build_object('card_id',(SELECT id FROM public.terms WHERE term='ciao'),'card_revision',(SELECT content_revision FROM public.terms WHERE term='ciao'),'question_type','mcq','question_text','Invalid?', 'options',jsonb_build_array('hello','no'), 'correct_answer','hello')
    ));
    RAISE EXCEPTION 'invalid question unexpectedly accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'invalid question unexpectedly accepted' THEN RAISE; END IF;
  END;
  IF (SELECT count(*) FROM public.questions) <> 2 THEN RAISE EXCEPTION 'invalid batch was not atomic'; END IF;
  DELETE FROM public.questions;
  BEGIN
    PERFORM public.mcp_create_lesson('Invalid', null, 'knowledge', '[{"term":"valid","definition":"yes"},{"term":"bad","definition":"  "}]'::jsonb);
    RAISE EXCEPTION 'invalid batch unexpectedly accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'invalid batch unexpectedly accepted' THEN RAISE; END IF;
  END;
  IF EXISTS (SELECT 1 FROM public.lessons WHERE name = 'Invalid') THEN RAISE EXCEPTION 'invalid batch was not atomic'; END IF;
  BEGIN
    PERFORM public.mcp_create_lesson('Rollback', null, 'knowledge', '[{"term":"good","definition":"yes"},{"term":"trigger-failure","definition":"no"}]'::jsonb);
    RAISE EXCEPTION 'database failure unexpectedly accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'database failure unexpectedly accepted' THEN RAISE; END IF;
  END;
  IF EXISTS (SELECT 1 FROM public.lessons WHERE name = 'Rollback') OR EXISTS (SELECT 1 FROM public.terms WHERE term = 'good') THEN RAISE EXCEPTION 'database failure did not roll back'; END IF;
  BEGIN
    PERFORM public.mcp_create_lesson('Too many', null, 'knowledge', (SELECT jsonb_agg(jsonb_build_object('term','x','definition','y')) FROM generate_series(1, 101)));
    RAISE EXCEPTION 'oversized batch unexpectedly accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'oversized batch unexpectedly accepted' THEN RAISE; END IF;
  END;
END $$;
DO $$
DECLARE
  good jsonb := '{"term":"Atom","definition":"Basic unit of matter","questions":[{"question_type":"mcq","question_text":"What is an atom?","options":["Basic unit of matter","A living organ","A sound wave","A legal rule","A planet"],"correct_answer":"Basic unit of matter"},{"question_type":"fill_blank","question_text":"What is an atom?","correct_answer":"Basic unit of matter"}]}'::jsonb;
  bad jsonb := '{"term":"Bad","definition":"Invalid","questions":[{"question_type":"mcq","question_text":"Bad?","options":["one","two"],"correct_answer":"one"},{"question_type":"fill_blank","question_text":"Bad?","correct_answer":"no"}]}'::jsonb;
  created jsonb; v_lesson_id uuid;
BEGIN
  BEGIN
    PERFORM public.mcp_create_lesson_with_practice('Atomic failure',null,'knowledge',jsonb_build_array(good,bad));
    RAISE EXCEPTION 'invalid atomic lesson unexpectedly accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'invalid atomic lesson unexpectedly accepted' THEN RAISE; END IF;
  END;
  IF EXISTS (SELECT 1 FROM public.lessons WHERE name='Atomic failure') THEN RAISE EXCEPTION 'atomic lesson did not roll back'; END IF;
  created := public.mcp_create_lesson_with_practice('Atomic success',null,'knowledge',jsonb_build_array(good));
  v_lesson_id := (created->>'id')::uuid;
  IF (created->>'cards_created')::int <> 1 OR (created->>'questions_created')::int <> 2 THEN RAISE EXCEPTION 'atomic result incorrect'; END IF;
  BEGIN
    PERFORM public.mcp_add_cards_with_practice(v_lesson_id,jsonb_build_array(good,bad));
    RAISE EXCEPTION 'invalid atomic addition unexpectedly accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'invalid atomic addition unexpectedly accepted' THEN RAISE; END IF;
  END;
  IF (SELECT count(*) FROM public.terms WHERE terms.lesson_id=v_lesson_id) <> 1 THEN RAISE EXCEPTION 'atomic addition did not roll back'; END IF;
  IF (SELECT count(*) FROM public.questions q JOIN public.terms t ON t.id=q.term_id WHERE t.lesson_id=v_lesson_id) <> 2 THEN RAISE EXCEPTION 'atomic question count incorrect'; END IF;
  DELETE FROM public.lessons WHERE id=v_lesson_id;
END $$;
RESET ROLE;
CREATE TEMP TABLE lesson_id AS SELECT l.id, (SELECT t.id FROM public.terms t WHERE t.lesson_id = l.id LIMIT 1) AS card_id FROM public.lessons l WHERE l.name = 'Italian';
GRANT SELECT ON lesson_id TO authenticated;
SET ROLE authenticated;
SET request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.lessons WHERE name = 'Italian') OR EXISTS (SELECT 1 FROM public.terms WHERE term = 'ciao') THEN RAISE EXCEPTION 'cross-user read was allowed'; END IF;
  BEGIN
    INSERT INTO public.terms (lesson_id, term, definition) VALUES ((SELECT id FROM lesson_id), 'intrusion', 'bad');
    RAISE EXCEPTION 'cross-user insert unexpectedly accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.mcp_update_card((SELECT id FROM lesson_id), (SELECT card_id FROM lesson_id), '{"term":"intrusion"}');
    RAISE EXCEPTION 'cross-user update unexpectedly accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'cross-user update unexpectedly accepted' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.mcp_add_practice_questions((SELECT id FROM lesson_id), jsonb_build_array(jsonb_build_object('card_id',(SELECT card_id FROM lesson_id),'card_revision',gen_random_uuid(),'question_type','fill_blank','question_text','Intrusion?', 'correct_answer','no')));
    RAISE EXCEPTION 'cross-user question unexpectedly accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'cross-user question unexpectedly accepted' THEN RAISE; END IF;
  END;
END $$;
RESET ROLE;
SELECT 'MCP database transaction, validation, and RLS tests passed' AS result;
