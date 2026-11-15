ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS cover_style text;
COMMENT ON COLUMN public.lessons.cover_style IS 'Versioned lesson cover palette and symbol preference.';
