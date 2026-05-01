-- 清理此前误自动注入到用户 lessons 的 Explore 模板课
-- 仅删除与模板“标题 + 描述 + 词条集合”精确匹配的数据，尽量避免误删用户自建课程。

WITH lesson_templates AS (
  SELECT *
  FROM (
    VALUES
      ('llm-core', 'LLM Core Concepts', 'Tokens, context windows, sampling, and decoding essentials.'),
      ('prompt-patterns', 'Prompt Engineering Patterns', 'Reusable prompt structures for reliable outputs.'),
      ('rag-practice', 'RAG in Practice', 'Retrieval, chunking, reranking, and grounded answers.'),
      ('llm-eval', 'LLM Evaluation Basics', 'How to measure quality, consistency, and usefulness.'),
      ('tool-calling', 'Function Calling and Tools', 'Schema design, tool routing, and robust tool use.'),
      ('ai-safety', 'AI Product Safety', 'Hallucination control, policy checks, and safe responses.')
  ) AS t(slug, lesson_name, lesson_desc)
),
term_templates AS (
  SELECT *
  FROM (
    VALUES
      ('llm-core', 'token'),
      ('llm-core', 'context window'),
      ('llm-core', 'temperature'),
      ('llm-core', 'top_p'),
      ('llm-core', 'system prompt'),
      ('llm-core', 'hallucination'),
      ('llm-core', 'inference'),
      ('llm-core', 'latency'),
      ('llm-core', 'fine-tuning'),
      ('llm-core', 'reasoning trace'),
      ('prompt-patterns', 'role prompting'),
      ('prompt-patterns', 'few-shot prompting'),
      ('prompt-patterns', 'chain-of-thought prompt'),
      ('prompt-patterns', 'instruction hierarchy'),
      ('prompt-patterns', 'output schema'),
      ('prompt-patterns', 'delimiter strategy'),
      ('prompt-patterns', 'self-consistency'),
      ('prompt-patterns', 'constraint prompt'),
      ('prompt-patterns', 're-ask pattern'),
      ('prompt-patterns', 'reflection step'),
      ('rag-practice', 'retrieval-augmented generation'),
      ('rag-practice', 'embedding'),
      ('rag-practice', 'vector database'),
      ('rag-practice', 'chunking'),
      ('rag-practice', 'chunk overlap'),
      ('rag-practice', 'reranking'),
      ('rag-practice', 'grounded answer'),
      ('rag-practice', 'retrieval recall'),
      ('rag-practice', 'hybrid search'),
      ('rag-practice', 'context packing'),
      ('llm-eval', 'golden set'),
      ('llm-eval', 'rubric scoring'),
      ('llm-eval', 'offline evaluation'),
      ('llm-eval', 'online evaluation'),
      ('llm-eval', 'A/B test'),
      ('llm-eval', 'win rate'),
      ('llm-eval', 'judge model'),
      ('llm-eval', 'evaluation drift'),
      ('llm-eval', 'failure taxonomy'),
      ('llm-eval', 'acceptance threshold'),
      ('tool-calling', 'function calling'),
      ('tool-calling', 'tool schema'),
      ('tool-calling', 'argument validation'),
      ('tool-calling', 'tool router'),
      ('tool-calling', 'idempotent tool'),
      ('tool-calling', 'tool fallback'),
      ('tool-calling', 'multi-tool workflow'),
      ('tool-calling', 'tool timeout'),
      ('tool-calling', 'tool result grounding'),
      ('tool-calling', 'schema evolution'),
      ('ai-safety', 'guardrail'),
      ('ai-safety', 'policy enforcement'),
      ('ai-safety', 'prompt injection'),
      ('ai-safety', 'safety classifier'),
      ('ai-safety', 'content moderation'),
      ('ai-safety', 'PII redaction'),
      ('ai-safety', 'jailbreak attempt'),
      ('ai-safety', 'human-in-the-loop'),
      ('ai-safety', 'audit log'),
      ('ai-safety', 'risk tiering')
  ) AS t(slug, term)
),
candidate_lessons AS (
  SELECT l.id, l.user_id, lt.slug
  FROM public.lessons l
  JOIN lesson_templates lt
    ON lower(l.name) = lower(lt.lesson_name)
   AND coalesce(l.description, '') = lt.lesson_desc
),
validated_lessons AS (
  SELECT c.id
  FROM candidate_lessons c
  JOIN (
    SELECT slug, count(*) AS expected_count
    FROM term_templates
    GROUP BY slug
  ) tc ON tc.slug = c.slug
  JOIN (
    SELECT lesson_id, count(*) AS actual_count
    FROM public.terms
    GROUP BY lesson_id
  ) ac ON ac.lesson_id = c.id
  WHERE ac.actual_count = tc.expected_count
    AND NOT EXISTS (
      SELECT 1
      FROM term_templates tt
      WHERE tt.slug = c.slug
        AND NOT EXISTS (
          SELECT 1
          FROM public.terms t
          WHERE t.lesson_id = c.id
            AND lower(t.term) = lower(tt.term)
        )
    )
)
DELETE FROM public.lessons
WHERE id IN (SELECT id FROM validated_lessons);
