-- Create a lesson and its cards as one transaction, using the caller's RLS permissions.
CREATE OR REPLACE FUNCTION public.mcp_create_lesson(
  p_name text, p_description text, p_learning_mode text, p_cards jsonb,
  p_deadline timestamptz DEFAULT NULL, p_cover_style text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lesson public.lessons%ROWTYPE;
  v_cards jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_name IS NULL OR length(trim(p_name)) NOT BETWEEN 1 AND 160
    OR p_learning_mode IS NULL OR p_learning_mode NOT IN ('knowledge', 'language')
    OR (p_description IS NOT NULL AND length(p_description) > 2000)
    OR (p_cover_style IS NOT NULL AND p_cover_style !~ '^v1:(lime|lavender|peach|sky|mint|rose):(book-open|layers|code|briefcase|star|zap|globe|EN|IT|ES|FR|DE|中文|日本語)$')
    OR p_cards IS NULL OR jsonb_typeof(p_cards) <> 'array' THEN
    RAISE EXCEPTION 'Invalid lesson data';
  END IF;
  IF jsonb_array_length(p_cards) > 100 THEN RAISE EXCEPTION 'Too many cards'; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_cards) AS c
    WHERE jsonb_typeof(c) <> 'object'
      OR jsonb_typeof(c->'term') IS DISTINCT FROM 'string'
      OR jsonb_typeof(c->'definition') IS DISTINCT FROM 'string'
      OR length(trim(c->>'term')) NOT BETWEEN 1 AND 300
      OR length(trim(c->>'definition')) NOT BETWEEN 1 AND 4000
      OR length(coalesce(c->>'explanation', '')) > 4000
      OR (c->'language_data' IS NOT NULL AND c->'language_data' <> 'null'::jsonb AND jsonb_typeof(c->'language_data') <> 'object')
      OR (p_learning_mode = 'knowledge' AND c->'language_data' IS NOT NULL AND c->'language_data' <> 'null'::jsonb)
  ) THEN RAISE EXCEPTION 'Invalid card data'; END IF;
  INSERT INTO public.lessons (user_id, name, description, learning_mode, deadline, cover_style)
    VALUES (auth.uid(), trim(p_name), nullif(trim(p_description), ''), p_learning_mode, p_deadline, p_cover_style)
    RETURNING * INTO v_lesson;
  WITH inserted AS (INSERT INTO public.terms (lesson_id, term, definition, explanation, language_data)
    SELECT v_lesson.id, trim(c->>'term'), trim(c->>'definition'),
      nullif(trim(c->>'explanation'), ''),
      CASE WHEN p_learning_mode = 'language' THEN nullif(c->'language_data', 'null'::jsonb) ELSE NULL END
    FROM jsonb_array_elements(p_cards) AS c RETURNING id, term, content_revision)
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'term', term, 'content_revision', content_revision)), '[]'::jsonb) INTO v_cards FROM inserted;
  RETURN jsonb_build_object('id', v_lesson.id, 'name', v_lesson.name, 'learning_mode', v_lesson.learning_mode, 'cards_created', jsonb_array_length(v_cards), 'cards', v_cards);
END;
$$;
REVOKE ALL ON FUNCTION public.mcp_create_lesson(text, text, text, jsonb, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mcp_create_lesson(text, text, text, jsonb, timestamptz, text) TO authenticated;
