-- Update only supplied card fields and merge language details atomically under RLS.
CREATE OR REPLACE FUNCTION public.mcp_update_card(p_lesson_id uuid, p_card_id uuid, p_changes jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_temp AS $$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_changes IS NULL OR jsonb_typeof(p_changes) <> 'object' OR p_changes = '{}'::jsonb
     OR (p_changes - ARRAY['term','definition','explanation','language_data']) <> '{}'::jsonb
     OR (p_changes ? 'term' AND (jsonb_typeof(p_changes->'term') <> 'string' OR length(trim(p_changes->>'term')) NOT BETWEEN 1 AND 300))
     OR (p_changes ? 'definition' AND (jsonb_typeof(p_changes->'definition') <> 'string' OR length(trim(p_changes->>'definition')) NOT BETWEEN 1 AND 4000))
     OR (p_changes ? 'explanation' AND (jsonb_typeof(p_changes->'explanation') NOT IN ('string','null') OR length(coalesce(p_changes->>'explanation','')) > 4000))
     OR (p_changes ? 'language_data' AND jsonb_typeof(p_changes->'language_data') NOT IN ('object','null')) THEN
    RAISE EXCEPTION 'Invalid card data';
  END IF;
  UPDATE public.terms AS t SET
    term = CASE WHEN p_changes ? 'term' THEN trim(p_changes->>'term') ELSE t.term END,
    definition = CASE WHEN p_changes ? 'definition' THEN trim(p_changes->>'definition') ELSE t.definition END,
    explanation = CASE WHEN p_changes ? 'explanation' THEN nullif(trim(p_changes->>'explanation'), '') ELSE t.explanation END,
    language_data = CASE
      WHEN NOT (p_changes ? 'language_data') THEN t.language_data
      WHEN p_changes->'language_data' = 'null'::jsonb THEN NULL
      ELSE coalesce(t.language_data, '{}'::jsonb) || (p_changes->'language_data') END
  FROM public.lessons AS l
  WHERE t.id = p_card_id AND t.lesson_id = p_lesson_id AND l.id = t.lesson_id
    AND l.user_id = auth.uid()
    AND (NOT (p_changes ? 'language_data') OR p_changes->'language_data' = 'null'::jsonb OR l.learning_mode = 'language')
  RETURNING jsonb_build_object('id', t.id, 'term', t.term, 'definition', t.definition, 'explanation', t.explanation, 'language_data', t.language_data, 'content_revision', t.content_revision) INTO result;
  IF result IS NULL THEN RAISE EXCEPTION 'Card not found, inaccessible, or could not be updated'; END IF;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.mcp_update_card(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mcp_update_card(uuid, uuid, jsonb) TO authenticated;
