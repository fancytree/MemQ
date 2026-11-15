-- Cards and the user's LLM-authored practice are committed as one transaction.
CREATE OR REPLACE FUNCTION public.mcp_add_cards_with_practice(p_lesson_id uuid, p_cards jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
  lesson_mode text;
  card_data jsonb;
  prepared_questions jsonb;
  card_id uuid;
  card_revision uuid;
  created_cards jsonb := '[]'::jsonb;
  question_count integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT learning_mode INTO lesson_mode FROM public.lessons WHERE id=p_lesson_id AND user_id=auth.uid();
  IF lesson_mode IS NULL THEN RAISE EXCEPTION 'Lesson not found or inaccessible'; END IF;
  IF p_cards IS NULL OR jsonb_typeof(p_cards) <> 'array' OR jsonb_array_length(p_cards) NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'Invalid card batch'; END IF;
  FOR card_data IN SELECT value FROM jsonb_array_elements(p_cards) LOOP
    IF jsonb_typeof(card_data) <> 'object'
      OR jsonb_typeof(card_data->'term') IS DISTINCT FROM 'string'
      OR length(trim(card_data->>'term')) NOT BETWEEN 1 AND 300
      OR jsonb_typeof(card_data->'definition') IS DISTINCT FROM 'string'
      OR length(trim(card_data->>'definition')) NOT BETWEEN 1 AND 4000
      OR (card_data->'explanation' IS NOT NULL AND jsonb_typeof(card_data->'explanation') NOT IN ('string','null'))
      OR length(coalesce(card_data->>'explanation','')) > 4000
      OR (card_data->'language_data' IS NOT NULL AND card_data->'language_data' <> 'null'::jsonb AND jsonb_typeof(card_data->'language_data') <> 'object')
      OR (lesson_mode <> 'language' AND card_data->'language_data' IS NOT NULL AND card_data->'language_data' <> 'null'::jsonb)
      OR jsonb_typeof(card_data->'questions') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Invalid card data';
    END IF;
    IF jsonb_array_length(card_data->'questions') NOT BETWEEN 2 AND 10
      OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(card_data->'questions') q WHERE q->>'question_type'='mcq')
      OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(card_data->'questions') q WHERE q->>'question_type'='fill_blank') THEN
      RAISE EXCEPTION 'Each card requires multiple-choice and recall questions';
    END IF;
    question_count := question_count + jsonb_array_length(card_data->'questions');
    IF question_count > 100 THEN RAISE EXCEPTION 'Too many questions'; END IF;
    INSERT INTO public.terms (lesson_id,term,definition,explanation,language_data)
      VALUES (p_lesson_id,trim(card_data->>'term'),trim(card_data->>'definition'),nullif(trim(card_data->>'explanation'),''),nullif(card_data->'language_data','null'::jsonb))
      RETURNING id, content_revision INTO card_id, card_revision;
    SELECT jsonb_agg(q || jsonb_build_object('card_id',card_id::text,'card_revision',card_revision::text)) INTO prepared_questions
      FROM jsonb_array_elements(card_data->'questions') q;
    PERFORM public.mcp_add_practice_questions(p_lesson_id, prepared_questions);
    created_cards := created_cards || jsonb_build_array(jsonb_build_object('id',card_id,'term',trim(card_data->>'term'),'content_revision',card_revision));
  END LOOP;
  RETURN jsonb_build_object('lesson_id',p_lesson_id,'cards_created',jsonb_array_length(created_cards),'questions_created',question_count,'cards',created_cards);
END $$;

CREATE OR REPLACE FUNCTION public.mcp_create_lesson_with_practice(
  p_name text, p_description text, p_learning_mode text, p_cards jsonb,
  p_deadline timestamptz DEFAULT NULL, p_cover_style text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE lesson jsonb; added jsonb;
BEGIN
  lesson := public.mcp_create_lesson(p_name,p_description,p_learning_mode,'[]'::jsonb,p_deadline,p_cover_style);
  added := public.mcp_add_cards_with_practice((lesson->>'id')::uuid,p_cards);
  RETURN lesson || added;
END $$;
REVOKE ALL ON FUNCTION public.mcp_add_cards_with_practice(uuid,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.mcp_create_lesson_with_practice(text,text,text,jsonb,timestamptz,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mcp_add_cards_with_practice(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_create_lesson_with_practice(text,text,text,jsonb,timestamptz,text) TO authenticated;
