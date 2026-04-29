-- Add is_vocab_mode column to lessons table
-- This field distinguishes between regular concept learning and vocabulary/language learning

alter table public.lessons 
add column if not exists is_vocab_mode boolean default false;

-- Add comment to explain the field
comment on column public.lessons.is_vocab_mode is 'When true, optimizes questions for language learning (pronunciation, synonyms, antonyms, sentences)';

