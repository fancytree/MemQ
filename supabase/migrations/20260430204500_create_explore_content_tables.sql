-- Explore 官方课程内容表（数据库驱动）
CREATE TABLE IF NOT EXISTS public.explore_lessons (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL,
  creator_handle TEXT NOT NULL DEFAULT '@memq',
  is_official BOOLEAN NOT NULL DEFAULT true,
  is_new BOOLEAN NOT NULL DEFAULT false,
  is_featured BOOLEAN NOT NULL DEFAULT false,
  cards_count INTEGER NOT NULL DEFAULT 0,
  learners_count INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 999,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.explore_terms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id TEXT NOT NULL REFERENCES public.explore_lessons(id) ON DELETE CASCADE,
  term TEXT NOT NULL,
  definition TEXT NOT NULL,
  explanation TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (lesson_id, term)
);

ALTER TABLE public.explore_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.explore_terms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read explore lessons" ON public.explore_lessons;
CREATE POLICY "Authenticated users can read explore lessons"
ON public.explore_lessons FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Authenticated users can read explore terms" ON public.explore_terms;
CREATE POLICY "Authenticated users can read explore terms"
ON public.explore_terms FOR SELECT
TO authenticated
USING (true);

-- 课程种子
INSERT INTO public.explore_lessons (
  id, title, description, category, creator_handle, is_official, is_new, is_featured, cards_count, learners_count, sort_order
)
VALUES
  ('feat-llm-core', 'LLM Core Concepts', 'Tokens, context windows, sampling, and decoding essentials.', 'tech', '@memq', true, true, true, 8, 14100, 1),
  ('p1', 'Business Email Essentials', 'Clear, professional patterns for daily workplace email.', 'lang', '@memq', true, true, false, 8, 10600, 2),
  ('p2', 'Meeting English Toolkit', 'Useful phrases for leading, joining, and closing meetings.', 'lang', '@memq', true, true, false, 8, 9100, 3),
  ('p3', 'Travel Survival English', 'Practical phrases for transport, hotels, food, and emergencies.', 'lang', '@memq', true, false, false, 8, 12000, 4),
  ('p4', 'Productivity Phrases', 'High-utility language for planning, prioritizing, and execution.', 'tech', '@memq', true, false, false, 8, 6400, 5),
  ('llm1', 'Prompt Engineering Patterns', 'Reusable prompt structures for reliable outputs.', 'tech', '@memq', true, true, false, 8, 11200, 6),
  ('llm2', 'RAG in Practice', 'Retrieval, chunking, reranking, and grounded answers.', 'tech', '@memq', true, true, false, 8, 9300, 7),
  ('llm3', 'LLM Evaluation Basics', 'How to measure quality, consistency, and usefulness.', 'tech', '@memq', true, false, false, 8, 7800, 8),
  ('llm4', 'Function Calling & Tools', 'JSON schemas, tool routing, and robust tool use.', 'tech', '@memq', true, false, false, 8, 8900, 9),
  ('llm5', 'AI Product Safety', 'Hallucination control, guardrails, and policy checks.', 'tech', '@memq', true, false, false, 8, 6700, 10),
  ('llm6', 'Embeddings & Similarity', 'Vector search, cosine similarity, and recall tradeoffs.', 'tech', '@memq', true, false, false, 8, 7200, 11),
  ('t1', 'Japanese · N5 Kanji', 'Foundational kanji and beginner reading patterns.', 'lang', '@hiro', false, true, false, 8, 8200, 12),
  ('t2', 'Organic Chemistry I', 'Core molecules, groups, and reaction language.', 'sci', '@melb', false, false, false, 8, 5600, 13),
  ('t3', 'Roman Emperors', 'High-yield figures, reforms, and turning points.', 'hist', '@classics', false, false, false, 8, 3100, 14),
  ('t4', 'Big-O Complexity', 'Complexity notation and common algorithmic tradeoffs.', 'tech', '@csprep', false, true, false, 8, 9800, 15),
  ('t5', 'Renaissance Painters', 'Major artists, techniques, and hallmark works.', 'arts', '@atlas', false, false, false, 8, 2400, 16),
  ('t6', 'French · A1 Verbs', 'Beginner French verbs for daily communication.', 'lang', '@lou', false, false, false, 8, 6000, 17)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  creator_handle = EXCLUDED.creator_handle,
  is_official = EXCLUDED.is_official,
  is_new = EXCLUDED.is_new,
  is_featured = EXCLUDED.is_featured,
  cards_count = EXCLUDED.cards_count,
  learners_count = EXCLUDED.learners_count,
  sort_order = EXCLUDED.sort_order;

-- 词条种子
INSERT INTO public.explore_terms (lesson_id, term, definition, explanation, sort_order)
VALUES
  ('feat-llm-core','token','A minimal text unit used by language models.','LLMs process token sequences instead of raw characters.',1),
  ('feat-llm-core','context window','Maximum tokens a model can attend to in one request.','Longer windows allow more conversation and source text.',2),
  ('feat-llm-core','temperature','Sampling parameter controlling output randomness.','Higher values usually increase diversity and uncertainty.',3),
  ('feat-llm-core','top_p','Sampling method that truncates low-probability tokens.','Top-p keeps only tokens within a cumulative probability mass.',4),
  ('feat-llm-core','system prompt','High-priority instruction defining behavior and constraints.','Set role, style, and hard rules at system level.',5),
  ('feat-llm-core','hallucination','Confident model output that is not factually grounded.','Use retrieval and validation to reduce hallucinations.',6),
  ('feat-llm-core','inference','The runtime stage where a trained model generates outputs.','Inference quality, speed, and cost matter in production.',7),
  ('feat-llm-core','latency','Time from request submission to response receipt.','Streaming improves perceived latency for end users.',8),

  ('p1','quick follow-up','A concise message sent to continue a previous thread.','Use it to keep momentum without rewriting full context.',1),
  ('p1','loop in','To include someone in an email conversation.','Example: “I’m looping in Sarah for context.”',2),
  ('p1','for your review','A polite phrase requesting someone to check a document.','Common in collaborative editing workflows.',3),
  ('p1','action items','Specific tasks assigned after a discussion.','List owner and deadline for each item.',4),
  ('p1','ETA','Estimated time of arrival or completion.','In email, it usually means expected completion time.',5),
  ('p1','gentle reminder','A polite prompt about pending work.','Soft tone helps maintain positive collaboration.',6),
  ('p1','as discussed','A phrase referencing prior agreement.','Useful for anchoring next steps in writing.',7),
  ('p1','please advise','Request for guidance or a decision.','Best used when multiple options exist.',8),

  ('p2','kick off','To start a meeting or initiative.','Example: “Let’s kick off with the agenda.”',1),
  ('p2','align on','To reach shared understanding on a topic.','Often used before making decisions.',2),
  ('p2','timebox','To limit discussion to a fixed duration.','Prevents overrun and keeps focus.',3),
  ('p2','parking lot','A list of off-topic items saved for later.','Helps maintain meeting flow.',4),
  ('p2','next steps','Actions agreed after a discussion.','Should include owners and timelines.',5),
  ('p2','blocker','An issue preventing progress.','Raise blockers early to avoid delays.',6),
  ('p2','decision owner','Person accountable for final call.','Clarifies responsibility when opinions differ.',7),
  ('p2','wrap up','To conclude discussion and summarize.','A good wrap-up restates decisions and actions.',8),

  ('p3','boarding pass','Document needed to board a flight.','Can be digital or printed.',1),
  ('p3','carry-on','Bag you bring into the cabin.','Must meet airline size and weight limits.',2),
  ('p3','check in','To register arrival at airport or hotel.','Usually requires ID and booking details.',3),
  ('p3','platform','Area where trains arrive and depart.','Station signs indicate the platform number.',4),
  ('p3','single ticket','One-way transport ticket.','Different from return or round-trip ticket.',5),
  ('p3','local currency','Official money used in a country.','Useful phrase when asking for payment options.',6),
  ('p3','allergy warning','Notice about food ingredients that may cause allergies.','Important for safe restaurant communication.',7),
  ('p3','emergency contact','Person to call in urgent situations.','Usually requested in forms or registrations.',8),

  ('p4','high impact','Likely to produce strong meaningful results.','Use it to justify priority decisions.',1),
  ('p4','low effort','Requires relatively little time or resources.','Low effort plus high impact is usually a quick win.',2),
  ('p4','quick win','Task that delivers value quickly with minimal cost.','Good for early momentum in projects.',3),
  ('p4','deep work','Focused, distraction-free work on cognitively demanding tasks.','Scheduling deep work blocks improves quality.',4),
  ('p4','context switching','Frequent task changes that reduce efficiency.','Batch similar tasks to reduce switching overhead.',5),
  ('p4','dependency','Task or resource required before another task can proceed.','Identify dependencies early in planning.',6),
  ('p4','scope creep','Uncontrolled growth of project scope over time.','Track scope changes to protect deadlines.',7),
  ('p4','retrospective','Review session to identify what worked and what to improve.','Used after sprints or milestones.',8),

  ('llm1','role prompting','Assigning a role to guide response perspective.','Example: “You are a concise technical reviewer.”',1),
  ('llm1','few-shot prompting','Providing examples before the actual task.','Few-shot boosts consistency on structured tasks.',2),
  ('llm1','constraint prompt','Prompt with explicit boundaries and rules.','Constraints reduce drift and improve reliability.',3),
  ('llm1','delimiter strategy','Clear separators between instructions and data.','Delimiters help mitigate instruction confusion.',4),
  ('llm1','output schema','Required output format with typed fields.','Schema-first prompting reduces parser failures.',5),
  ('llm1','re-ask pattern','Asking clarifying questions when input is ambiguous.','Improves quality by avoiding wrong assumptions.',6),
  ('llm1','reflection step','Self-check phase before final output.','Useful for catching omissions and formatting issues.',7),
  ('llm1','instruction hierarchy','Priority model for resolving conflicting instructions.','System constraints should override user conflicts.',8),

  ('llm2','RAG','Retrieval-Augmented Generation combines retrieval with generation.','Improves factual quality by grounding answers in sources.',1),
  ('llm2','embedding','Vector representation of text semantics.','Similar meanings map to nearby vectors.',2),
  ('llm2','vector search','Nearest-neighbor retrieval in embedding space.','Finds semantically related chunks, not just keyword matches.',3),
  ('llm2','chunking','Splitting documents into retrieval units.','Chunk size affects both recall and answer quality.',4),
  ('llm2','chunk overlap','Shared context between neighboring chunks.','Prevents context loss at chunk boundaries.',5),
  ('llm2','reranking','Second-stage relevance ordering after retrieval.','Raises precision before passing context to the model.',6),
  ('llm2','grounded answer','Response tied to retrieved evidence.','Grounding reduces unsupported claims.',7),
  ('llm2','hybrid retrieval','Combining keyword and vector retrieval.','Balances exact-match precision and semantic recall.',8),

  ('llm3','golden set','Curated benchmark examples for repeatable evaluation.','Supports regression checks between model versions.',1),
  ('llm3','rubric scoring','Scoring outputs on explicit quality dimensions.','Improves evaluator alignment and consistency.',2),
  ('llm3','offline eval','Batch evaluation outside production traffic.','Useful before rollout decisions.',3),
  ('llm3','online eval','Production-time quality measurement.','Captures real user impact and behavior.',4),
  ('llm3','A/B test','Controlled comparison between variants.','Measures real effect on product metrics.',5),
  ('llm3','win rate','Percent of pairwise comparisons a variant wins.','Common in preference-based LLM evaluation.',6),
  ('llm3','failure taxonomy','Structured categories of model errors.','Helps prioritize fixes by error class.',7),
  ('llm3','acceptance threshold','Minimum score required for deployment.','Prevents low-quality releases.',8),

  ('llm4','function calling','Model requests structured tool execution.','Enables API actions and data fetches.',1),
  ('llm4','tool schema','Typed specification for tool arguments.','Clear schema reduces malformed calls.',2),
  ('llm4','argument validation','Verifying tool inputs before execution.','Prevents invalid and unsafe operations.',3),
  ('llm4','tool router','Logic deciding which tool to invoke.','Routing can be rules, model, or hybrid.',4),
  ('llm4','idempotency','Repeated calls produce the same final effect.','Important for retries and reliability.',5),
  ('llm4','fallback policy','Backup behavior for tool failures.','Maintains UX when dependencies fail.',6),
  ('llm4','multi-tool workflow','Chained tool calls to complete one task.','Common in complex assistant operations.',7),
  ('llm4','tool timeout','Maximum allowed duration for a tool response.','Timeout guards keep the flow responsive.',8),

  ('llm5','guardrail','Constraint layer to keep outputs within policy.','Can run before and after generation.',1),
  ('llm5','policy enforcement','Applying compliance rules to model behavior.','Can block, redact, or rewrite risky outputs.',2),
  ('llm5','prompt injection','Malicious instruction hidden in user or source text.','Mitigate with isolation and instruction hierarchy.',3),
  ('llm5','moderation','Detecting and handling unsafe content.','Run moderation on both input and output.',4),
  ('llm5','PII redaction','Removing personal identifiers from text.','Supports privacy and governance requirements.',5),
  ('llm5','jailbreak','Attempt to bypass safety constraints.','Needs defense-in-depth protections.',6),
  ('llm5','human-in-the-loop','Escalating sensitive cases to human reviewers.','Critical for high-risk domains.',7),
  ('llm5','audit log','Trace of prompts, tool calls, and decisions.','Essential for incident review and debugging.',8),

  ('llm6','embedding model','Model that maps text into dense vectors.','Embedding quality shapes retrieval quality.',1),
  ('llm6','cosine similarity','Similarity metric based on vector angle.','Common metric for semantic retrieval.',2),
  ('llm6','nearest neighbor','Most similar vectors in embedding space.','ANN indexes accelerate nearest-neighbor lookup.',3),
  ('llm6','ANN index','Approximate nearest-neighbor index for fast search.','Trades exactness for speed and scale.',4),
  ('llm6','recall','Fraction of relevant results retrieved.','Low recall hurts downstream answer quality.',5),
  ('llm6','precision','Fraction of retrieved results that are relevant.','High precision reduces noise in context packing.',6),
  ('llm6','vector drift','Embedding behavior shift after model updates.','May require index rebuild and threshold tuning.',7),
  ('llm6','semantic deduplication','Removing near-duplicate chunks by meaning.','Reduces redundancy and improves context efficiency.',8),

  ('t1','日','sun / day','Commonly read as にち, ひ, or び depending on context.',1),
  ('t1','月','moon / month','Common readings include げつ, がつ, and つき.',2),
  ('t1','火','fire','Used in weekdays and basic vocabulary.',3),
  ('t1','水','water','Appears in daily words like 水曜日 and 水.',4),
  ('t1','木','tree / wood','Also used in weekday names and nouns.',5),
  ('t1','金','gold / money','Context determines whether it means metal or money.',6),
  ('t1','土','earth / soil','Basic kanji used in time and nature words.',7),
  ('t1','人','person','Very high-frequency character in beginner texts.',8),

  ('t2','alkane','Hydrocarbon with only single bonds.','General formula follows CnH2n+2 for acyclic alkanes.',1),
  ('t2','alkene','Hydrocarbon containing at least one C=C bond.','Double bonds increase reactivity compared with alkanes.',2),
  ('t2','alkyne','Hydrocarbon containing at least one C≡C bond.','Triple bonds are linear at the bonded carbons.',3),
  ('t2','functional group','Reactive atom pattern defining compound behavior.','Examples include alcohol, ketone, and carboxylic acid.',4),
  ('t2','isomer','Compounds with same formula but different structures.','Structural differences lead to different properties.',5),
  ('t2','electrophile','Species that accepts an electron pair.','Electrophiles react with electron-rich sites.',6),
  ('t2','nucleophile','Species that donates an electron pair.','Nucleophiles attack electron-deficient centers.',7),
  ('t2','substitution reaction','Reaction replacing one group with another.','SN1 and SN2 are classic substitution mechanisms.',8),

  ('t3','Augustus','First Roman emperor and founder of the Principate.','Established long-term imperial administration.',1),
  ('t3','Pax Romana','Period of relative peace and stability in the Empire.','Often associated with the first two centuries CE.',2),
  ('t3','Tiberius','Second Roman emperor after Augustus.','Inherited a stable but politically tense system.',3),
  ('t3','Nero','Emperor known for controversial rule and crises.','His reign ended with revolt and civil conflict.',4),
  ('t3','Trajan','Emperor under whom Roman territory reached maximum extent.','Remembered for expansion and public works.',5),
  ('t3','Hadrian','Emperor focused on consolidation and defense.','Associated with Hadrian’s Wall in Britain.',6),
  ('t3','Diocletian','Emperor who reorganized imperial governance.','Introduced the Tetrarchy to share rule.',7),
  ('t3','Constantine','Emperor who legalized Christianity and refounded Byzantium.','Linked to major religious and political transition.',8),

  ('t4','O(1)','Constant-time complexity.','Runtime does not scale with input size.',1),
  ('t4','O(log n)','Logarithmic complexity.','Typical in divide-and-conquer search patterns.',2),
  ('t4','O(n)','Linear complexity.','Runtime grows proportionally with input size.',3),
  ('t4','O(n log n)','Quasilinear complexity.','Common in efficient comparison sorting algorithms.',4),
  ('t4','O(n^2)','Quadratic complexity.','Often seen in nested-loop implementations.',5),
  ('t4','best case','Lower bound behavior for favorable inputs.','Useful but insufficient alone for guarantees.',6),
  ('t4','worst case','Upper bound behavior for unfavorable inputs.','Most reliable basis for hard guarantees.',7),
  ('t4','amortized analysis','Average cost per operation over a sequence.','Captures occasional expensive operations in dynamic structures.',8),

  ('t5','Leonardo da Vinci','Renaissance polymath known for painting and scientific inquiry.','Associated with Mona Lisa and The Last Supper.',1),
  ('t5','Michelangelo','Artist known for painting, sculpture, and architecture.','Famous for the Sistine Chapel ceiling.',2),
  ('t5','Raphael','Painter known for balanced composition and clarity.','The School of Athens is a key reference work.',3),
  ('t5','sfumato','Technique blending tones softly without harsh outlines.','Often associated with Leonardo’s portraits.',4),
  ('t5','fresco','Painting on wet plaster so pigment bonds with wall surface.','Widely used in large Renaissance murals.',5),
  ('t5','perspective','Method creating depth on a flat surface.','Linear perspective transformed Renaissance composition.',6),
  ('t5','chiaroscuro','Strong contrast between light and dark.','Used to model volume and dramatic effect.',7),
  ('t5','patronage','Financial support from powerful sponsors for artists.','Patronage shaped what works were commissioned.',8),

  ('t6','être','to be','Core auxiliary and identity verb in French.',1),
  ('t6','avoir','to have','Used for possession and many past-tense constructions.',2),
  ('t6','aller','to go','Frequently used for movement and near future.',3),
  ('t6','faire','to do / to make','High-frequency verb across many expressions.',4),
  ('t6','parler','to speak','Regular -er verb used in basic communication.',5),
  ('t6','aimer','to like / to love','Common for preferences and opinions.',6),
  ('t6','vouloir','to want','Useful for polite requests and intentions.',7),
  ('t6','pouvoir','can / to be able to','Expresses ability or permission.',8)
ON CONFLICT (lesson_id, term) DO UPDATE SET
  definition = EXCLUDED.definition,
  explanation = EXCLUDED.explanation,
  sort_order = EXCLUDED.sort_order;
