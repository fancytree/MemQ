-- Existing records in a disposable database, before the revision migration.
INSERT INTO public.lessons(id,user_id,name,learning_mode) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','Legacy revision fixture','knowledge');
INSERT INTO public.terms(id,lesson_id,term,definition) VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Legacy card','Existing definition');
INSERT INTO public.questions(id,term_id,question_text,question_type,correct_answer) VALUES ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Legacy question','fill_blank','Existing definition');
