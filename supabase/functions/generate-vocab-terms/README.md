# generate-vocab-terms

Generates structured language cards for lessons with `learning_mode = 'language'`. It supports words, phrases, and grammar patterns.

## Request

```json
{ "type": "topic", "content": "Italian travel phrases" }
```

`type` can be `topic` or `text`.

## Response

```json
{
  "success": true,
  "results": [
    {
      "term": "andare",
      "definition": "Muoversi verso un luogo.",
      "explanation": "Verbo comune di movimento.",
      "language_data": {
        "language_code": "it-IT",
        "pronunciation": "/anˈda.re/",
        "part_of_speech": "verb",
        "forms": "vado, vai, va",
        "example": "Domani vado a Roma.",
        "synonyms": [],
        "antonyms": [],
        "collocations": ["andare a casa"]
      }
    }
  ],
  "count": 1
}
```

The function does not translate definitions or examples. Optional relationships remain empty when they would be misleading. The iOS app uses `language_code` when reading the term and example aloud.
