# generate-vocab-terms

Supabase Edge Function for generating/extracting vocabulary terms from text or topics.

## Purpose

This function is specifically designed for vocabulary mode lessons (`is_vocab_mode = true`). It extracts vocabulary words and phrases with comprehensive linguistic information, including IPA transcription, part of speech, meaning, examples, and synonyms.

## Request Format

```typescript
{
  "type": "topic" | "text",
  "content": "string"
}
```

## Response Format

```typescript
{
  "success": true,
  "results": [
    {
      "term": "vocabulary word",
      "definition": "Short definition",
      "explanation": "**IPA:** /ɪɡˈzæmpəl/\\n**POS:** Noun\\n**Meaning:** A thing characteristic...\\n**Example:** This is an **example**...\\n**Synonyms:** instance, illustration"
    }
  ],
  "count": 1
}
```

## Explanation Field Format

The `explanation` field is a Markdown-formatted string containing:

- **IPA:** International Phonetic Alphabet transcription
- **POS:** Part of Speech (Noun, Verb, Adjective, etc.)
- **Meaning:** Brief, clear definition
- **Example:** Sentence example with the word/phrase in **bold** or *italic*
- **Synonyms:** 2-3 synonyms or near-synonyms, comma-separated

## Differences from generate-terms

- Focuses on vocabulary learning (lexicographic approach)
- Provides detailed linguistic information in the `explanation` field
- Includes IPA, POS, examples, and synonyms
- Designed for language learning contexts


