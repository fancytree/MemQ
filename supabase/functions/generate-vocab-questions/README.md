# generate-vocab-questions

Supabase Edge Function for generating vocabulary test questions for vocabulary mode lessons (`is_vocab_mode = true`).

## Purpose

This function generates vocabulary-focused test questions that assess:
- Collocation (语境搭配)
- Synonym/Antonym discrimination (近义词/反义词辨析)
- Correct usage in context (用法是否正确)

Rather than simple definition matching, it focuses on practical vocabulary acquisition skills.

## Request Format

```typescript
{
  "lessonId": "uuid",
  "terms": [
    {
      "id": "uuid",
      "term": "vocabulary word",
      "definition": "Short definition",
      "explanation": "**IPA:** /wɔːrd/\\n**POS:** Noun\\n**Meaning:** ...\\n**Example:** ...\\n**Synonyms:** ..." // Optional
    }
  ]
}
```

## Response Format

```typescript
{
  "success": true,
  "questionsGenerated": 10
}
```

## Question Types

### Fill Blank (fill_blank)
- **Focus:** Collocation (语境搭配)
- Tests how words combine with other words in natural contexts
- Example: "The meeting was _____ (delayed) due to rain."
- `options` field is `null` (frontend renders input box)

### MCQ (mcq)
- **Focus:** Synonym/Antonym discrimination (近义词/反义词辨析)
- Example: "Which word is a SYNONYM for 'Happy'?"
- Must have exactly 4 options

### True/False (true_false)
- **Focus:** Correct usage in context (用法是否正确)
- Example: "The word 'delicious' is used correctly in this sentence: 'The weather is delicious today.'"
- Options: ["True", "False"]

## Differences from generate-questions

- Focuses on vocabulary acquisition skills (collocation, synonyms, usage) rather than definition recall
- Utilizes the `explanation` field (IPA, POS, Example, Synonyms) if provided
- Avoids simple "term ↔ definition" matching questions
- Tests practical vocabulary skills needed for language learning


