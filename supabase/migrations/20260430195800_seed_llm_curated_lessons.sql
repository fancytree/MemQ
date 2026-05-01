-- 为现有用户批量注入 LLM 精品课程（可重复执行，避免重复插入）
WITH target_users AS (
  SELECT id AS user_id
  FROM auth.users
),
lesson_templates AS (
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
insert_lessons AS (
  INSERT INTO public.lessons (user_id, name, description, deadline)
  SELECT
    u.user_id,
    lt.lesson_name,
    lt.lesson_desc,
    NULL
  FROM target_users u
  CROSS JOIN lesson_templates lt
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.lessons l
    WHERE l.user_id = u.user_id
      AND lower(l.name) = lower(lt.lesson_name)
  )
  RETURNING id, user_id, name
),
all_lessons AS (
  SELECT l.id, l.user_id, lt.slug
  FROM public.lessons l
  JOIN lesson_templates lt ON lower(l.name) = lower(lt.lesson_name)
  JOIN target_users u ON u.user_id = l.user_id
),
term_templates AS (
  SELECT *
  FROM (
    VALUES
      ('llm-core', 'token', 'A minimal unit of text used by language models for processing.', 'Models do not read characters directly; they read token sequences.'),
      ('llm-core', 'context window', 'The maximum number of tokens a model can consider at once.', 'Longer context windows allow the model to handle longer conversations or documents.'),
      ('llm-core', 'temperature', 'A sampling parameter that controls randomness in generated text.', 'Higher temperature usually means more diverse but less deterministic outputs.'),
      ('llm-core', 'top_p', 'A sampling strategy that limits choices to a probability mass.', 'Top-p sampling truncates the token distribution before picking the next token.'),
      ('llm-core', 'system prompt', 'A high-priority instruction that sets model behavior and constraints.', 'Use system prompts to define role, tone, and hard rules.'),
      ('llm-core', 'hallucination', 'A confident but incorrect model output not grounded in facts.', 'Grounding and verification reduce hallucination risk.'),
      ('llm-core', 'inference', 'The stage where a trained model generates outputs for new inputs.', 'Inference cost and latency are key production concerns.'),
      ('llm-core', 'latency', 'The time from sending a request to receiving a response.', 'Streaming often improves perceived latency in chat products.'),
      ('llm-core', 'fine-tuning', 'Additional training on task-specific examples to adapt model behavior.', 'Fine-tuning helps style and format consistency for repeated tasks.'),
      ('llm-core', 'reasoning trace', 'Intermediate thinking structure used to solve multi-step tasks.', 'Expose only safe summaries instead of internal traces in user-facing apps.'),

      ('prompt-patterns', 'role prompting', 'Assigning a role to the model to guide perspective and style.', 'Example: “You are a concise technical editor.”'),
      ('prompt-patterns', 'few-shot prompting', 'Providing example input-output pairs before the real task.', 'Few-shot examples improve consistency on structured outputs.'),
      ('prompt-patterns', 'chain-of-thought prompt', 'A prompt that asks for step-by-step reasoning.', 'Use carefully in production and avoid exposing unsafe details.'),
      ('prompt-patterns', 'instruction hierarchy', 'Prioritizing system, developer, and user instructions safely.', 'Conflicts should be resolved by rule priority.'),
      ('prompt-patterns', 'output schema', 'A required format that structures model output fields.', 'JSON schemas reduce parsing failures.'),
      ('prompt-patterns', 'delimiter strategy', 'Using clear markers to separate context and instructions.', 'Delimiters reduce prompt injection confusion.'),
      ('prompt-patterns', 'self-consistency', 'Generating multiple reasoned outputs and selecting consensus.', 'Useful for tasks that require stable reasoning.'),
      ('prompt-patterns', 'constraint prompt', 'A prompt that limits scope, style, and allowed actions.', 'Hard constraints reduce drift and improve compliance.'),
      ('prompt-patterns', 're-ask pattern', 'A fallback pattern that asks clarifying questions on ambiguity.', 'Helps avoid wrong assumptions and low-quality answers.'),
      ('prompt-patterns', 'reflection step', 'A final check stage where the model reviews its own output.', 'Can improve quality on long and complex outputs.'),

      ('rag-practice', 'retrieval-augmented generation', 'A method that combines external retrieval with generation.', 'RAG improves factual grounding using relevant documents.'),
      ('rag-practice', 'embedding', 'A vector representation of text used for semantic similarity.', 'Similar meanings map to nearby vectors in embedding space.'),
      ('rag-practice', 'vector database', 'A database optimized for nearest-neighbor search on vectors.', 'Used to fetch semantically relevant chunks quickly.'),
      ('rag-practice', 'chunking', 'Splitting documents into manageable units for retrieval.', 'Chunk size strongly affects recall and answer quality.'),
      ('rag-practice', 'chunk overlap', 'Shared tokens between neighboring chunks to preserve context.', 'Overlap reduces context loss at chunk boundaries.'),
      ('rag-practice', 'reranking', 'Reordering retrieved results by relevance with a second model.', 'Reranking improves precision before generation.'),
      ('rag-practice', 'grounded answer', 'An answer explicitly based on retrieved evidence.', 'Grounded answers should cite or reference source chunks.'),
      ('rag-practice', 'retrieval recall', 'The fraction of relevant documents retrieved.', 'Low recall leads to missing facts in final answers.'),
      ('rag-practice', 'hybrid search', 'Combining keyword and vector search for better coverage.', 'Hybrid retrieval handles both exact terms and semantics.'),
      ('rag-practice', 'context packing', 'Selecting and ordering retrieved chunks within token limits.', 'Packing strategy determines what the model can see.'),

      ('llm-eval', 'golden set', 'A curated benchmark set with expected outputs or judgments.', 'Golden sets provide stable regression checks across model updates.'),
      ('llm-eval', 'rubric scoring', 'Evaluating outputs against explicit quality dimensions.', 'Rubrics make human evaluations more consistent.'),
      ('llm-eval', 'offline evaluation', 'Batch testing without exposing outputs to end users.', 'Use offline eval before production rollout.'),
      ('llm-eval', 'online evaluation', 'Measuring real-world performance in production.', 'Track user outcomes and quality signals continuously.'),
      ('llm-eval', 'A/B test', 'Comparing variants with controlled traffic split.', 'A/B tests reveal real product impact beyond lab metrics.'),
      ('llm-eval', 'win rate', 'The percentage of pairwise comparisons one variant wins.', 'Pairwise win rate is common for preference evaluation.'),
      ('llm-eval', 'judge model', 'A model used to assess other model outputs.', 'Judge models speed up evaluation but need calibration.'),
      ('llm-eval', 'evaluation drift', 'Metric shifts caused by changing data or behavior over time.', 'Revalidate benchmarks periodically to avoid stale conclusions.'),
      ('llm-eval', 'failure taxonomy', 'A structured categorization of recurring failure modes.', 'Taxonomies help teams prioritize fixes efficiently.'),
      ('llm-eval', 'acceptance threshold', 'A minimum score required before deployment.', 'Thresholds gate releases and reduce quality regressions.'),

      ('tool-calling', 'function calling', 'Allowing models to request predefined tools via structured arguments.', 'Tool calls connect models to APIs, search, or business systems.'),
      ('tool-calling', 'tool schema', 'A formal description of tool arguments and expected types.', 'Precise schemas reduce malformed tool arguments.'),
      ('tool-calling', 'argument validation', 'Checking tool-call inputs before execution.', 'Validation prevents unsafe or invalid backend operations.'),
      ('tool-calling', 'tool router', 'Logic that chooses which tool to invoke for a request.', 'Routers may be rule-based, learned, or hybrid.'),
      ('tool-calling', 'idempotent tool', 'A tool that can be called repeatedly with the same effect.', 'Idempotency improves reliability during retries.'),
      ('tool-calling', 'tool fallback', 'A backup behavior when tool execution fails.', 'Fallbacks maintain graceful user experience under failures.'),
      ('tool-calling', 'multi-tool workflow', 'A sequence where multiple tools are called to complete a task.', 'Complex tasks often require retrieval, transform, then action.'),
      ('tool-calling', 'tool timeout', 'A maximum allowed execution time for tool responses.', 'Timeout controls prevent long stalls in conversation flow.'),
      ('tool-calling', 'tool result grounding', 'Conditioning final answers on actual returned tool data.', 'Never fabricate results when tool calls fail.'),
      ('tool-calling', 'schema evolution', 'Updating tool definitions without breaking existing flows.', 'Versioned schemas ease migration in production systems.'),

      ('ai-safety', 'guardrail', 'A rule or mechanism that constrains unsafe model behavior.', 'Guardrails can run before, during, or after generation.'),
      ('ai-safety', 'policy enforcement', 'Applying explicit safety and compliance policies to outputs.', 'Enforcement can block, redact, or rewrite risky content.'),
      ('ai-safety', 'prompt injection', 'Malicious instructions hidden in user or retrieved content.', 'Use delimiters and instruction hierarchy to mitigate injection.'),
      ('ai-safety', 'safety classifier', 'A model that labels content risk levels.', 'Classifiers can trigger moderation workflows automatically.'),
      ('ai-safety', 'content moderation', 'Detecting and handling harmful, abusive, or disallowed content.', 'Moderation should cover both inputs and outputs.'),
      ('ai-safety', 'PII redaction', 'Removing personally identifiable information from text.', 'Redaction supports privacy and regulatory requirements.'),
      ('ai-safety', 'jailbreak attempt', 'A user strategy to bypass model safety constraints.', 'Defense-in-depth is needed against evolving jailbreak tactics.'),
      ('ai-safety', 'human-in-the-loop', 'Escalating high-risk cases to human review.', 'Critical domains often require human oversight.'),
      ('ai-safety', 'audit log', 'A trace of prompts, decisions, and tool actions for review.', 'Auditability is essential for governance and debugging.'),
      ('ai-safety', 'risk tiering', 'Assigning scenarios to low/medium/high risk categories.', 'Risk tiers determine which safeguards must apply.')
  ) AS t(lesson_slug, term, definition, explanation)
)
INSERT INTO public.terms (lesson_id, term, definition, explanation)
SELECT
  al.id,
  tt.term,
  tt.definition,
  tt.explanation
FROM all_lessons al
JOIN term_templates tt ON tt.lesson_slug = al.slug
WHERE NOT EXISTS (
  SELECT 1
  FROM public.terms t
  WHERE t.lesson_id = al.id
    AND lower(t.term) = lower(tt.term)
);
