# generate-vocab-questions

Generates context, form, spelling, and usage questions for lessons with `learning_mode = 'language'`. The request contains `lessonId` and an array of terms with `id`, `term`, `definition`, optional `explanation`, and optional structured `language_data`.

The function uses examples, forms, and relationships when available. It supports words, phrases, and grammar patterns and does not require translations or a user default language.
