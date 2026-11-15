-- Save questions written by the user's LLM as one RLS-scoped transaction.
CREATE OR REPLACE FUNCTION public.mcp_add_practice_questions(p_lesson_id uuid, p_questions jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE n integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_questions IS NULL OR jsonb_typeof(p_questions) <> 'array' OR jsonb_array_length(p_questions) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Invalid question batch';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.lessons WHERE id=p_lesson_id AND user_id=auth.uid()) THEN RAISE EXCEPTION 'Lesson not found or inaccessible'; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_questions) AS q
    WHERE jsonb_typeof(q) <> 'object'
      OR jsonb_typeof(q->'card_id') IS DISTINCT FROM 'string'
      OR jsonb_typeof(q->'card_revision') IS DISTINCT FROM 'string'
      OR NOT EXISTS (SELECT 1 FROM public.terms t WHERE t.lesson_id=p_lesson_id AND t.id::text=q->>'card_id' AND t.content_revision::text=q->>'card_revision')
      OR jsonb_typeof(q->'question_text') IS DISTINCT FROM 'string'
      OR length(trim(q->>'question_text')) NOT BETWEEN 1 AND 240
      OR jsonb_typeof(q->'correct_answer') IS DISTINCT FROM 'string'
      OR length(trim(q->>'correct_answer')) NOT BETWEEN 1 AND 1000
      OR (q->'explanation' IS NOT NULL AND jsonb_typeof(q->'explanation') NOT IN ('string','null'))
      OR length(coalesce(q->>'explanation','')) > 1200
      OR q->>'question_type' NOT IN ('mcq','fill_blank','true_false')
      OR q->>'question_type' IS NULL
      OR (q->>'question_type' = 'fill_blank' AND q->'options' IS NOT NULL AND q->'options' <> 'null'::jsonb)
      OR (q->>'question_type' IN ('mcq','true_false') AND CASE
        WHEN jsonb_typeof(q->'options') IS DISTINCT FROM 'array' THEN true
        ELSE (q->>'question_type'='mcq' AND jsonb_array_length(q->'options') NOT BETWEEN 5 AND 6)
          OR (q->>'question_type'='true_false' AND q->'options' <> '["True", "False"]'::jsonb)
          OR EXISTS (SELECT 1 FROM jsonb_array_elements(q->'options') o WHERE jsonb_typeof(o) <> 'string' OR length(trim(o #>> '{}')) NOT BETWEEN 1 AND 100)
          OR (SELECT count(DISTINCT lower(trim(o #>> '{}'))) FROM jsonb_array_elements(q->'options') o) <> jsonb_array_length(q->'options')
          OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(q->'options') o WHERE trim(o #>> '{}') = trim(q->>'correct_answer'))
        END)
  ) THEN RAISE EXCEPTION 'Invalid or inaccessible question'; END IF;
  INSERT INTO public.questions (term_id,question_text,question_type,options,correct_answer,explanation,source_revision)
  SELECT (q->>'card_id')::uuid, trim(q->>'question_text'), q->>'question_type',
    CASE WHEN q->>'question_type'='fill_blank' THEN NULL ELSE q->'options' END,
    trim(q->>'correct_answer'), nullif(trim(q->>'explanation'),''), (q->>'card_revision')::uuid
  FROM jsonb_array_elements(p_questions) q;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN jsonb_build_object('lesson_id',p_lesson_id,'questions_created',n);
END $$;
REVOKE ALL ON FUNCTION public.mcp_add_practice_questions(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mcp_add_practice_questions(uuid,jsonb) TO authenticated;
