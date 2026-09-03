import { EdBase } from '@/components/EdBase';
import { Icon } from '@/components/Icon';
import { SectionLabel } from '@/components/SectionLabel';
import { supabase } from '@/lib/supabase';
import { updateTermProgressSafe } from '@/lib/updateTermProgress';
import { colors, fonts } from '@/theme';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { TextInput } from 'react-native';

interface MCQ {
  termId: string;
  mode: 'mcq';
  topic: string;
  q: string;
  opts: string[];
  correct: number;
  explain?: string;
}

interface RecallQuestion {
  termId: string;
  mode: 'recall';
  topic: string;
  q: string;
  answer: string;
  explain?: string;
}

interface FlipQuestion {
  termId: string;
  mode: 'flip';
  topic: string;
  q: string;
  back: string;
  explain?: string;
}

type QuizQuestion = MCQ | RecallQuestion | FlipQuestion;

const RECALL_STOP_WORDS = new Set([
  'a', 'an', 'the', 'to', 'of', 'in', 'on', 'at', 'for', 'with', 'and', 'or',
  'is', 'are', 'was', 'were', 'be', 'being', 'been', 'it', 'this', 'that',
  'means', 'meaning', 'phrase', 'word', 'informal', 'formal',
]);

const normalizeRecallText = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const toKeywordTokens = (text: string) =>
  normalizeRecallText(text)
    .split(' ')
    .filter((token) => token.length > 1 && !RECALL_STOP_WORDS.has(token));

const isRecallAnswerCorrect = (userInput: string, expectedAnswer: string) => {
  const normalizedUser = normalizeRecallText(userInput);
  const normalizedExpected = normalizeRecallText(expectedAnswer);
  if (!normalizedUser || !normalizedExpected) return false;

  // 精确/包含匹配：覆盖短语型答案
  if (normalizedUser === normalizedExpected) return true;
  if (normalizedExpected.includes(normalizedUser) && normalizedUser.length >= 4) return true;
  if (normalizedUser.includes(normalizedExpected) && normalizedExpected.length >= 4) return true;

  // 关键词匹配：用户关键词大部分命中即可通过，避免长句定义导致误判
  const userTokens = toKeywordTokens(userInput);
  const expectedTokens = new Set(toKeywordTokens(expectedAnswer));
  if (userTokens.length === 0) return false;

  const overlap = userTokens.filter((token) => expectedTokens.has(token)).length;
  return overlap >= 2 && overlap / userTokens.length >= 0.75;
};

// 单课 term 数量少时，用占位错误项补足 MCQ 的 3 个干扰项（共 4 个选项）
const MCQ_PLACEHOLDER_DISTRACTORS = [
  'Unrelated idea — not the right definition.',
  'A partial or misleading paraphrase.',
  'Opposite or contradictory meaning.',
  'Too vague to be a precise definition.',
  'Mixes up two different concepts.',
] as const;

/** 构造 MCQ 选项并打乱顺序，返回正确答案下标 */
function buildMcqOptions(
  correctDef: string,
  allTerms: { id: string; definition: string | null }[],
  selfId: string,
): { opts: string[]; correctIndex: number } {
  const correct = correctDef.trim();
  const used = new Set<string>([correct.toLowerCase()]);
  const distractors: string[] = [];

  for (const t of allTerms) {
    if (t.id === selfId || distractors.length >= 3) continue;
    const d = (t.definition || '').trim();
    if (!d || used.has(d.toLowerCase())) continue;
    used.add(d.toLowerCase());
    distractors.push(d);
  }

  let pi = 0;
  while (distractors.length < 3 && pi < MCQ_PLACEHOLDER_DISTRACTORS.length) {
    const ph = MCQ_PLACEHOLDER_DISTRACTORS[pi++];
    if (!used.has(ph.toLowerCase())) {
      used.add(ph.toLowerCase());
      distractors.push(ph);
    }
  }

  const opts = [correct, ...distractors.slice(0, 3)];
  const shuffled = [...opts];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const correctIndex = shuffled.findIndex((o) => o === correct);
  return { opts: shuffled, correctIndex: correctIndex >= 0 ? correctIndex : 0 };
}

/** Supabase terms 行（quiz 用） */
type QuizTermRow = {
  id: string;
  lesson_id: string;
  term: string;
  definition: string | null;
  explanation: string | null;
};

type TermProgressLite = {
  term_id: string;
  status: string | null;
  next_review_at: string | null;
  step_index: number | null;
};

/**
 * 选词权重：掌握度越弱越高；Mastered 仍保留较低权重用于抽查。
 */
function termPickWeight(progress: TermProgressLite | undefined): number {
  if (!progress) return 12;
  const st = (progress.status || 'New').trim();
  const byStatus: Record<string, number> = {
    New: 12,
    Learning: 10,
    Familiar: 7,
    Good: 5,
    Strong: 3,
    Mastered: 2,
  };
  if (byStatus[st] != null) return byStatus[st];
  const si = typeof progress.step_index === 'number' ? progress.step_index : 0;
  return Math.max(2, 10 - si);
}

function weightedSampleTermsWithoutReplacement(
  terms: QuizTermRow[],
  count: number,
  getWeight: (t: QuizTermRow) => number,
): QuizTermRow[] {
  const pool = [...terms];
  const picked: QuizTermRow[] = [];
  const nPick = Math.min(count, pool.length);
  for (let k = 0; k < nPick; k++) {
    const weights = pool.map(getWeight);
    const total = weights.reduce((a, b) => a + b, 0) || 1;
    let r = Math.random() * total;
    let pickIdx = 0;
    for (; pickIdx < pool.length; pickIdx++) {
      r -= weights[pickIdx];
      if (r <= 0) break;
    }
    pickIdx = Math.min(pickIdx, pool.length - 1);
    picked.push(pool.splice(pickIdx, 1)[0]);
  }
  return picked;
}

/**
 * 同一题型阶段内：step_index 升序（弱的先出现），相同则用随机 tie-break。
 */
function orderPickedTermsForQuizPhases(
  picked: QuizTermRow[],
  progressMap: Map<string, TermProgressLite>,
): QuizTermRow[] {
  return [...picked].sort((a, b) => {
    const sa = progressMap.get(a.id)?.step_index ?? 0;
    const sb = progressMap.get(b.id)?.step_index ?? 0;
    if (sa !== sb) return sa - sb;
    return Math.random() - 0.5;
  });
}

/** 每个词在当轮内的三步进度 */
type TermStage = 'flip' | 'mcq' | 'recall' | 'done';

/**
 * 单轮内每个词的计划（中文流程）：
 * - full：必须按闪卡 → MCQ → Recall 顺序学习；轮询混排多词，但同一词未完成当前步不会进入该词下一步。
 * - spot：已掌握（Mastered）抽查，本只出现 1 道题，题型在三种中随机，做完该词即结束当轮中该词。
 */
type TermPlan = { kind: 'full' } | { kind: 'spot'; singleMode: 'flip' | 'mcq' | 'recall' };

const FULL_TERM_PLAN: TermPlan = { kind: 'full' };

function buildTermPlanForRound(progress: TermProgressLite | undefined): TermPlan {
  const st = (progress?.status || 'New').trim();
  if (st === 'Mastered') {
    const r = Math.random();
    const singleMode: 'flip' | 'mcq' | 'recall' =
      r < 1 / 3 ? 'flip' : r < 2 / 3 ? 'mcq' : 'recall';
    return { kind: 'spot', singleMode };
  }
  return { kind: 'full' };
}

function initialStageFromPlan(plan: TermPlan): TermStage {
  if (plan.kind === 'spot') return plan.singleMode;
  return 'flip';
}

function buildQuizQuestionForStage(
  term: QuizTermRow,
  stage: TermStage,
  lessonTopicByLessonId: Record<string, string>,
  allTermsForMcq: QuizTermRow[],
): QuizQuestion | null {
  if (stage === 'done') return null;
  const topic = lessonTopicByLessonId[term.lesson_id] || 'Lesson';
  const definition = (term.definition ?? '').trim();
  if (stage === 'flip') {
    return {
      termId: term.id,
      mode: 'flip',
      topic,
      q: term.term,
      back: definition,
      explain:
        term.explanation?.trim() ||
        'No extra note yet. Try making your own sentence with this term.',
    };
  }
  if (stage === 'mcq') {
    const explainText = term.explanation || `Review: ${term.term} → ${definition}`;
    const { opts, correctIndex } = buildMcqOptions(definition, allTermsForMcq, term.id);
    return {
      termId: term.id,
      mode: 'mcq',
      topic,
      q: `What is the best definition of "${term.term}"?`,
      opts,
      correct: correctIndex,
      explain: explainText,
    };
  }
  const explainText = term.explanation || `Review: ${term.term} → ${definition}`;
  return {
    termId: term.id,
    mode: 'recall',
    topic,
    q: `Define "${term.term}" in your own words.`,
    answer: definition,
    explain: explainText,
  };
}

/**
 * 从 startIdx 起环形找第一个「尚未完成当轮」的词，按其当前阶段出题。
 */
function pickNextQuestion(
  terms: QuizTermRow[],
  stages: Record<string, TermStage>,
  startIdx: number,
  lessonTopicByLessonId: Record<string, string>,
  allTermsForMcq: QuizTermRow[],
): { q: QuizQuestion; termIdx: number } | null {
  const n = terms.length;
  if (n === 0) return null;
  for (let i = 0; i < n; i++) {
    const termIdx = (startIdx + i) % n;
    const term = terms[termIdx];
    const stage = stages[term.id] || 'flip';
    if (stage === 'done') continue;
    const q = buildQuizQuestionForStage(term, stage, lessonTopicByLessonId, allTermsForMcq);
    if (q) return { q, termIdx };
  }
  return null;
}

function countCompletedSubsteps(
  terms: QuizTermRow[],
  stages: Record<string, TermStage>,
  plans: Record<string, TermPlan>,
): number {
  return terms.reduce((acc, t) => {
    const plan = plans[t.id] ?? FULL_TERM_PLAN;
    const s =
      stages[t.id] ?? (plan.kind === 'spot' ? plan.singleMode : 'flip');
    if (plan.kind === 'spot') {
      return acc + (s === 'done' ? 1 : 0);
    }
    if (s === 'mcq') return acc + 1;
    if (s === 'recall') return acc + 2;
    if (s === 'done') return acc + 3;
    return acc;
  }, 0);
}

function totalStepsForRound(terms: QuizTermRow[], plans: Record<string, TermPlan>): number {
  return terms.reduce((acc, t) => {
    const plan = plans[t.id] ?? FULL_TERM_PLAN;
    return acc + (plan.kind === 'spot' ? 1 : 3);
  }, 0);
}

/**
 * Quiz host. One screen handles three card modes (mcq / recall / flip)
 * by switching the body but keeping the same header + progress chrome.
 *
 * Local state (idx, selected, revealed, recallText, flipped) is reset
 * on every advance — there's no persistence between sessions, since this
 * is a UI port. Wire your real quiz engine on top.
 */
export default function QuizScreen() {
  const { entry, lessonId } = useLocalSearchParams<{ entry?: string; lessonId?: string }>();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sessionTerms, setSessionTerms] = useState<QuizTermRow[]>([]);
  const [allTermsForMcq, setAllTermsForMcq] = useState<QuizTermRow[]>([]);
  const [lessonTopicByLessonId, setLessonTopicByLessonId] = useState<Record<string, string>>({});
  const [stages, setStages] = useState<Record<string, TermStage>>({});
  const [termPlans, setTermPlans] = useState<Record<string, TermPlan>>({});
  const [currentQ, setCurrentQ] = useState<QuizQuestion | null>(null);
  const [currentTermIdx, setCurrentTermIdx] = useState(0);
  const [selected, setSelected]       = useState<number | null>(null);
  const [revealed, setRevealed]       = useState(false);
  const [recallText, setRecallText]   = useState('');
  const [flipped, setFlipped]         = useState(false);
  /** 首页 quiz：首轮仅「到期」池；之后递增，从全量词加权抽题（含 Mastered 抽查） */
  const [quizRound, setQuizRound]     = useState(0);

  const engineRef = useRef({
    sessionTerms: [] as QuizTermRow[],
    allTermsForMcq: [] as QuizTermRow[],
    lessonTopicByLessonId: {} as Record<string, string>,
    stages: {} as Record<string, TermStage>,
    termPlans: {} as Record<string, TermPlan>,
    currentTermIdx: 0,
  });
  useEffect(() => {
    engineRef.current = {
      sessionTerms,
      allTermsForMcq,
      lessonTopicByLessonId,
      stages,
      termPlans,
      currentTermIdx,
    };
  });

  const updateTermProgress = async (termId: string, isCorrect: boolean) => {
    await updateTermProgressSafe(termId, isCorrect);
  };

  useEffect(() => {
    const clearLocalSession = () => {
      setSessionTerms([]);
      setAllTermsForMcq([]);
      setLessonTopicByLessonId({});
      setStages({});
      setTermPlans({});
      setCurrentQ(null);
      setCurrentTermIdx(0);
    };

    const loadRealQuizData = async () => {
      try {
        setLoading(true);
        setLoadError(null);
        clearLocalSession();

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setLoadError('Please log in first.');
          return;
        }

        const { data: lessonsData, error: lessonsError } = await supabase
          .from('lessons')
          .select('id, name')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (lessonsError || !lessonsData || lessonsData.length === 0) {
          setLoadError('No lessons found. Please create one first.');
          return;
        }

        const entryType = entry === 'lesson' ? 'lesson' : 'home';
        const targetLessons =
          entryType === 'lesson' && lessonId
            ? lessonsData.filter((lesson) => lesson.id === lessonId)
            : lessonsData;

        if (targetLessons.length === 0) {
          setLoadError(entryType === 'lesson' ? 'Lesson not found.' : 'No lessons found.');
          return;
        }

        const lessonMap = new Map(targetLessons.map((lesson) => [lesson.id, lesson.name || 'Lesson']));
        const lessonIds = targetLessons.map((lesson) => lesson.id);

        const { data: termsData, error: termsError } = await supabase
          .from('terms')
          .select('id, lesson_id, term, definition, explanation')
          .in('lesson_id', lessonIds)
          .order('created_at', { ascending: false });

        if (termsError) {
          setLoadError('Failed to load terms.');
          return;
        }

        const usableTerms = ((termsData || []).filter(
          (term) => term.term?.trim() && term.definition?.trim(),
        )) as QuizTermRow[];

        const termIds = usableTerms.map((term) => term.id);
        const { data: progressData } =
          termIds.length > 0
            ? await supabase
                .from('user_term_progress')
                .select('term_id, status, next_review_at, step_index')
                .eq('user_id', user.id)
                .in('term_id', termIds)
            : { data: [] as TermProgressLite[] };

        const progressMap = new Map<string, TermProgressLite>(
          (progressData || []).map((p) => [p.term_id, p as TermProgressLite]),
        );

        const now = new Date();
        const filteredTerms =
          entryType === 'home'
            ? usableTerms.filter((term) => {
                const progress = progressMap.get(term.id);
                if (!progress) return true;
                if (progress.status === 'New') return true;
                if (progress.next_review_at && new Date(progress.next_review_at) <= now) return true;
                return false;
              })
            : usableTerms;

        if (usableTerms.length === 0) {
          setLoadError(
            entryType === 'home'
              ? 'No cards available for review.'
              : 'No terms in this lesson. Add at least one term with a definition.',
          );
          return;
        }

        // 中文：仅首页「第一轮」要求至少 4 张到期卡；后续轮次用全量词池 + 权重（含已掌握抽查）
        if (entryType === 'home' && quizRound === 0 && filteredTerms.length < 4) {
          setLoadError('Not enough cards due for review right now.');
          return;
        }

        const isHomeFollowUp = entryType === 'home' && quizRound > 0;
        const selectionPool: QuizTermRow[] = isHomeFollowUp ? usableTerms : entryType === 'home' ? filteredTerms : usableTerms;

        if (selectionPool.length === 0) {
          setLoadError('No terms available for this quiz round.');
          return;
        }

        const MAX_QUIZ_QUESTIONS = 12;
        const STEPS_PER_TERM = 3;
        const maxTerms = Math.max(1, Math.floor(MAX_QUIZ_QUESTIONS / STEPS_PER_TERM));
        const pickedRaw = weightedSampleTermsWithoutReplacement(selectionPool, maxTerms, (t) =>
          termPickWeight(progressMap.get(t.id)),
        );
        const orderedTerms = orderPickedTermsForQuizPhases(pickedRaw, progressMap);

        /*
         * ─── Quiz 当轮总流程（中文）───
         * 1）选词：首页首轮仅从「到期 / New」池加权抽；后续轮从全课 term 加权抽（Mastered 权重低但仍可入轮）。
         * 2）分词计划（buildTermPlanForRound）：
         *    - 非 Mastered：full，必须闪卡 → MCQ → Recall；同一词未完成当前步不会进入该词下一步。
         *    - Mastered：spot，本只 1 题，题型在 flip / mcq / recall 中随机，不强制走满三步。
         * 3）混排：多词之间按轮询指针环形取「下一个还有待办」的词；full 词可与其他词的任意阶段交错出现。
         * 4）进度：总步数 = 各词 3（full）或 1（spot）之和；答错仍记 updateTermProgress，点 Continue 推进（不卡关）。
         */
        const topics: Record<string, string> = {};
        lessonMap.forEach((name, id) => {
          topics[id] = name;
        });
        const plans: Record<string, TermPlan> = {};
        const initialStages: Record<string, TermStage> = {};
        orderedTerms.forEach((t) => {
          const plan = buildTermPlanForRound(progressMap.get(t.id));
          plans[t.id] = plan;
          initialStages[t.id] = initialStageFromPlan(plan);
        });
        const first = pickNextQuestion(orderedTerms, initialStages, 0, topics, usableTerms);
        if (!first) {
          setLoadError('Could not build quiz session.');
          return;
        }

        setSessionTerms(orderedTerms);
        setAllTermsForMcq(usableTerms);
        setLessonTopicByLessonId(topics);
        setTermPlans(plans);
        setStages(initialStages);
        setCurrentQ(first.q);
        setCurrentTermIdx(first.termIdx);
      } catch {
        setLoadError('Failed to initialize quiz.');
        clearLocalSession();
      } finally {
        setLoading(false);
      }
    };

    loadRealQuizData();
  }, [entry, lessonId, quizRound]);

  const q = currentQ;
  const totalSteps = Math.max(1, totalStepsForRound(sessionTerms, termPlans));
  const completedSubsteps = countCompletedSubsteps(sessionTerms, stages, termPlans);

  if (loading) {
    return (
      <EdBase bottomInset={0}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="small" color={colors.accent} />
          <Text style={styles.loadingText}>Loading quiz...</Text>
        </View>
      </EdBase>
    );
  }
  if (loadError) {
    return (
      <EdBase bottomInset={0}>
        <View style={styles.loadingWrap}>
          <Text style={styles.loadingText}>{loadError}</Text>
        </View>
      </EdBase>
    );
  }
  if (!q || sessionTerms.length === 0) {
    return (
      <EdBase bottomInset={0}>
        <View style={styles.loadingWrap}>
          <Text style={styles.loadingText}>No quiz data available.</Text>
        </View>
      </EdBase>
    );
  }

  const progressPct = Math.min(100, (completedSubsteps / totalSteps) * 100);
  const recallCorrect = q.mode === 'recall'
    ? isRecallAnswerCorrect(recallText, q.answer)
    : false;

  const reset = () => {
    setSelected(null);
    setRevealed(false);
    setRecallText('');
    setFlipped(false);
  };

  const checkDisabled =
    !revealed &&
    ((q.mode === 'mcq' && selected === null) ||
      (q.mode === 'recall' && !recallText.trim()));

  const planForCurrent = termPlans[q.termId] ?? FULL_TERM_PLAN;
  const othersAllDone = sessionTerms
    .filter((t) => t.id !== q.termId)
    .every((t) => stages[t.id] === 'done');
  // 中文：全轮最后一题揭晓后点继续即下一轮（full 最后一题必是 Recall；spot 可能是 MCQ/Recall）
  const finishingRound =
    revealed &&
    othersAllDone &&
    (q.mode === 'recall' || (planForCurrent.kind === 'spot' && q.mode === 'mcq'));

  const onCheckOrNext = () => {
    if (!revealed) {
      if (q.mode === 'mcq'    && selected === null)  return;
      if (q.mode === 'recall' && !recallText.trim()) return;
      if (q.mode === 'mcq') {
        updateTermProgress(q.termId, selected === q.correct);
      }
      if (q.mode === 'recall') {
        updateTermProgress(q.termId, isRecallAnswerCorrect(recallText, q.answer));
      }
      setRevealed(true);
    } else {
      // 中文：答错也已在上一步写入进度；仍推进流程，不卡关
      const e = engineRef.current;
      const n = e.sessionTerms.length;
      const nextRR = (e.currentTermIdx + 1) % n;
      if (q.mode === 'mcq') {
        const plan = e.termPlans[q.termId] ?? FULL_TERM_PLAN;
        const newStages =
          plan.kind === 'spot'
            ? { ...e.stages, [q.termId]: 'done' as TermStage }
            : { ...e.stages, [q.termId]: 'recall' as TermStage };
        const allDone = e.sessionTerms.every((t) => newStages[t.id] === 'done');
        setStages(newStages);
        if (allDone) {
          reset();
          setQuizRound((r) => r + 1);
          return;
        }
        const picked = pickNextQuestion(
          e.sessionTerms,
          newStages,
          nextRR,
          e.lessonTopicByLessonId,
          e.allTermsForMcq,
        );
        if (picked) {
          setCurrentQ(picked.q);
          setCurrentTermIdx(picked.termIdx);
        }
        reset();
      } else if (q.mode === 'recall') {
        const newStages = { ...e.stages, [q.termId]: 'done' as TermStage };
        const allDone = e.sessionTerms.every((t) => newStages[t.id] === 'done');
        setStages(newStages);
        if (allDone) {
          reset();
          setQuizRound((r) => r + 1);
          return;
        }
        const picked = pickNextQuestion(
          e.sessionTerms,
          newStages,
          nextRR,
          e.lessonTopicByLessonId,
          e.allTermsForMcq,
        );
        if (picked) {
          setCurrentQ(picked.q);
          setCurrentTermIdx(picked.termIdx);
        }
        reset();
      }
    }
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    // 兜底：如果当前是深链/首屏进入，没有可回退历史，则回到首页 Tab。
    router.replace('/(tabs)');
  };

  return (
    <EdBase bottomInset={0}>
      {/* Nav */}
      <View style={styles.nav}>
        <Pressable onPress={handleBack}>
          <Text style={styles.navBack}>← Back</Text>
        </Pressable>
        <Text style={styles.navCount}>
          {completedSubsteps} / {totalSteps} steps
        </Text>
      </View>

      {/* Progress */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
      </View>

      {/* Topic + question */}
      <View style={styles.qBlock}>
        <View style={styles.topicRow}>
          <SectionLabel size={10.5} color={colors.accent}>{q.topic}</SectionLabel>
          <View style={styles.modeChip}>
            <Text style={styles.modeChipText}>
              {q.mode === 'mcq' ? 'Choose' : q.mode === 'recall' ? 'Recall' : 'Flashcard'}
            </Text>
          </View>
        </View>
        <Text style={styles.qText}>{q.q}</Text>
      </View>

      {/* Body — per mode */}
      {q.mode === 'mcq' && (
        <MCQView
          q={q}
          selected={selected}
          revealed={revealed}
          onSelect={(i) => !revealed && setSelected(i)}
        />
      )}
      {q.mode === 'recall' && (
        <RecallView
          q={q}
          recallText={recallText}
          revealed={revealed}
          recallCorrect={recallCorrect}
          onChange={setRecallText}
        />
      )}
      {q.mode === 'flip' && (
        <FlipView
          q={q}
          flipped={flipped}
          onFlip={() => setFlipped(!flipped)}
          onConfidence={(level) => {
            const isCorrect = level === 'I got it';
            updateTermProgress(q.termId, isCorrect);
            const e = engineRef.current;
            const n = e.sessionTerms.length;
            if (n === 0) return;
            const nextRR = (e.currentTermIdx + 1) % n;
            const plan = e.termPlans[q.termId] ?? FULL_TERM_PLAN;
            // 中文：full 则进入 MCQ；spot 仅闪卡一题，结束后该词当轮完成
            const newStages =
              plan.kind === 'spot'
                ? { ...e.stages, [q.termId]: 'done' as TermStage }
                : { ...e.stages, [q.termId]: 'mcq' as TermStage };
            const allDone = e.sessionTerms.every((t) => newStages[t.id] === 'done');
            setStages(newStages);
            if (allDone) {
              setFlipped(false);
              setSelected(null);
              setRevealed(false);
              setRecallText('');
              setQuizRound((r) => r + 1);
              return;
            }
            const picked = pickNextQuestion(
              e.sessionTerms,
              newStages,
              nextRR,
              e.lessonTopicByLessonId,
              e.allTermsForMcq,
            );
            if (picked) {
              setCurrentQ(picked.q);
              setCurrentTermIdx(picked.termIdx);
            }
            setFlipped(false);
            setSelected(null);
            setRevealed(false);
            setRecallText('');
          }}
        />
      )}

      {/* Feedback (mcq + recall) */}
      {revealed && q.mode !== 'flip' && q.explain && (
        <FeedbackBlock
          q={q}
          recallCorrect={recallCorrect}
          mcqCorrect={q.mode === 'mcq' && selected === q.correct}
        />
      )}

      {/* CTA — flip uses confidence buttons instead */}
      {q.mode !== 'flip' && (
        <View style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 24 }}>
          <Pressable
            onPress={onCheckOrNext}
            disabled={checkDisabled}
            style={[styles.cta, checkDisabled && { backgroundColor: colors.dim }]}
          >
            <Text style={styles.ctaText}>
              {revealed
                ? (finishingRound ? 'Next round →' : 'Continue →')
                : 'Check answer'}
            </Text>
          </Pressable>
        </View>
      )}
    </EdBase>
  );
}

// ── MCQ ─────────────────────────────────────────────────────────
interface MCQViewProps {
  q: MCQ;
  selected: number | null;
  revealed: boolean;
  onSelect: (i: number) => void;
}

function MCQView({ q, selected, revealed, onSelect }: MCQViewProps) {
  return (
    <View style={mcqStyles.wrap}>
      {q.opts.map((opt, i) => {
        const isSelected = selected === i;
        const isCorrect = i === q.correct;

        let leftColor: string = 'transparent';
        let bg: string = 'transparent';
        let textColor: string = colors.text;
        let labelColor: string = colors.muted;
        let labelBg: string = colors.bg;
        let labelBorderColor: string = colors.border;

        if (revealed && isCorrect) {
          leftColor = colors.green;
          bg = colors.greenL;
          textColor = colors.green;
          labelColor = '#fff';
          labelBg = colors.green;
          labelBorderColor = 'transparent';
        } else if (revealed && isSelected && !isCorrect) {
          leftColor = colors.red;
          bg = colors.redL;
          textColor = colors.red;
          labelColor = '#fff';
          labelBg = colors.red;
          labelBorderColor = 'transparent';
        } else if (!revealed && isSelected) {
          leftColor = colors.accent;
          labelColor = '#fff';
          labelBg = colors.accent;
          labelBorderColor = 'transparent';
        }

        return (
          <Pressable
            key={i}
            onPress={() => onSelect(i)}
            style={[
              mcqStyles.row,
              { backgroundColor: bg },
              i < q.opts.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
            ]}
          >
            <View style={[mcqStyles.leftRule, { backgroundColor: leftColor }]} />
            <View style={mcqStyles.body}>
              <View
                style={[
                  mcqStyles.labelBox,
                  { backgroundColor: labelBg, borderColor: labelBorderColor },
                ]}
              >
                {revealed && isCorrect ? (
                  <Icon name="check" color="#fff" size={12} strokeWidth={3} />
                ) : revealed && isSelected && !isCorrect ? (
                  <Icon name="close" color="#fff" size={11} strokeWidth={3} />
                ) : (
                  <Text style={[mcqStyles.labelChar, { color: labelColor }]}>
                    {String.fromCharCode(65 + i)}
                  </Text>
                )}
              </View>
              <Text
                style={[
                  mcqStyles.optText,
                  {
                    color: textColor,
                    fontWeight:
                      revealed && (isCorrect || (isSelected && !isCorrect)) ? '500' : '400',
                  },
                ]}
              >
                {opt}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const mcqStyles = StyleSheet.create({
  wrap: {
    marginHorizontal: 20, marginTop: 20,
    backgroundColor: colors.surf,
    borderWidth: 1, borderColor: colors.border, borderRadius: 10,
    overflow: 'hidden',
  },
  row: { flexDirection: 'row' },
  leftRule: { width: 3 },
  body: { flexDirection: 'row', gap: 11, paddingHorizontal: 14, paddingVertical: 13, flex: 1, alignItems: 'flex-start' },
  labelBox: {
    width: 22, height: 22, borderRadius: 5, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  labelChar: { fontSize: 11, fontWeight: '700', fontFamily: fonts.grotesk },
  optText:   { fontSize: 14, lineHeight: 21, flex: 1, paddingTop: 1, fontFamily: fonts.grotesk },
});

// ── Recall ──────────────────────────────────────────────────────
interface RecallViewProps {
  q: RecallQuestion;
  recallText: string;
  revealed: boolean;
  recallCorrect: boolean;
  onChange: (s: string) => void;
}

function RecallView({ q, recallText, revealed, recallCorrect, onChange }: RecallViewProps) {
  const borderColor = revealed
    ? recallCorrect
      ? `${colors.green}80`
      : `${colors.red}80`
    : colors.border;

  return (
    <View style={{ marginHorizontal: 20, marginTop: 20 }}>
      <View
        style={{
          backgroundColor: colors.surf,
          borderWidth: 1, borderColor, borderRadius: 10, overflow: 'hidden',
        }}
      >
        {/* Use TextInput from RN — keep it inline so styles co-locate */}
        <RecallInput value={recallText} onChange={onChange} disabled={revealed} />
        <View style={recallStyles.footer}>
          <Text style={recallStyles.charCount}>{recallText.length} characters</Text>
          {revealed && (
            <Text
              style={[
                recallStyles.statusText,
                { color: recallCorrect ? colors.green : colors.red },
              ]}
            >
              {recallCorrect ? '✓ Match' : '✗ No match'}
            </Text>
          )}
        </View>
      </View>
      {revealed && (
        <View style={recallStyles.answerCard}>
          <SectionLabel style={{ marginBottom: 5 }}>Answer</SectionLabel>
          <Text style={recallStyles.answerText}>{q.answer}</Text>
        </View>
      )}
    </View>
  );
}

// 用户主动表示不会：填入固定句，便于走判分逻辑（视为错误）
const RECALL_DONT_KNOW_FILL = "I don't know";

function RecallInput({ value, onChange, disabled }: { value: string; onChange: (s: string) => void; disabled: boolean }) {
  return (
    <View style={recallStyles.inputShell}>
      <TextInput
        value={value}
        onChangeText={onChange}
        editable={!disabled}
        multiline
        placeholder="Type your answer…"
        placeholderTextColor={colors.muted}
        style={recallStyles.textarea}
      />
      {!disabled && (
        <Pressable
          style={({ pressed }) => [recallStyles.dontKnowChip, pressed && recallStyles.dontKnowChipPressed]}
          onPress={() => onChange(RECALL_DONT_KNOW_FILL)}
          accessibilityRole="button"
          accessibilityLabel="Don't know"
          hitSlop={6}
        >
          <Text style={recallStyles.dontKnowChipText}>Don't know</Text>
        </Pressable>
      )}
    </View>
  );
}

const recallStyles = StyleSheet.create({
  inputShell: {
    position: 'relative',
    minHeight: 80,
  },
  textarea: {
    minHeight: 80,
    padding: 14,
    paddingRight: 108,
    paddingBottom: 44,
    color: colors.text,
    fontSize: 15,
    lineHeight: 23,
    fontFamily: fonts.grotesk,
  },
  dontKnowChip: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dontKnowChipPressed: {
    backgroundColor: colors.borderS,
  },
  dontKnowChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
    fontFamily: fonts.grotesk,
  },
  footer: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderTopWidth: 1, borderTopColor: colors.border,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: colors.bg,
  },
  charCount: { fontSize: 11, color: colors.muted, fontFamily: fonts.grotesk },
  statusText: {
    fontSize: 11, fontWeight: '700',
    letterSpacing: 0.5, textTransform: 'uppercase',
    fontFamily: fonts.grotesk,
  },
  answerCard: {
    marginTop: 12, paddingHorizontal: 14, paddingVertical: 12,
    backgroundColor: colors.surf,
    borderWidth: 1, borderColor: colors.border, borderRadius: 8,
  },
  answerText: { fontSize: 14, fontWeight: '600', color: colors.text, fontFamily: fonts.grotesk },
});

// ── Flip ────────────────────────────────────────────────────────
interface FlipViewProps {
  q: FlipQuestion;
  flipped: boolean;
  onFlip: () => void;
  onConfidence: (level: 'Need review' | 'I got it') => void;
}

const CONFIDENCE_BUTTONS = [
  { label: 'Need review', color: colors.red },
  { label: 'I got it',  color: colors.accent },
] as const;

function FlipView({ q, flipped, onFlip, onConfidence }: FlipViewProps) {
  return (
    <View style={flipStyles.wrap}>
      <Pressable onPress={onFlip} style={flipStyles.card}>
        <SectionLabel style={{ marginBottom: 10 }}>
          {flipped ? 'Back' : 'Front'}
        </SectionLabel>
        {flipped ? (
          <Text style={flipStyles.back}>
            {q.explain || 'No extra note yet. Try making your own sentence with this term.'}
          </Text>
        ) : (
          <Text style={flipStyles.front}>{q.back}</Text>
        )}
        <Text style={flipStyles.cornerHint}>{flipped ? '← Front' : 'Confidence ↓'}</Text>
      </Pressable>

      <View style={flipStyles.confRow}>
        {CONFIDENCE_BUTTONS.map((b) => (
          <Pressable key={b.label} onPress={() => onConfidence(b.label)} style={flipStyles.confBtn}>
            <Text style={[flipStyles.confLabel, { color: b.color }]}>{b.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const flipStyles = StyleSheet.create({
  wrap: {
    marginHorizontal: 20,
    marginTop: 20,
  },
  card: {
    backgroundColor: colors.surf,
    borderWidth: 1, borderColor: colors.border, borderRadius: 10,
    paddingHorizontal: 20, paddingVertical: 24,
    minHeight: 340, position: 'relative',
  },
  front: { fontSize: 18, fontWeight: '700', letterSpacing: -0.4, lineHeight: 25, color: colors.text, fontFamily: fonts.grotesk },
  back:  { fontSize: 14, lineHeight: 22, color: colors.sub, fontFamily: fonts.grotesk },
  cornerHint: {
    position: 'absolute', top: 14, right: 14,
    fontSize: 10.5, color: colors.muted,
    letterSpacing: 0.7, textTransform: 'uppercase', fontWeight: '600',
    fontFamily: fonts.grotesk,
  },
  confRow: { flexDirection: 'row', gap: 6, marginTop: 12, marginBottom: 10 },
  confBtn: {
    flex: 1, paddingVertical: 10, alignItems: 'center',
    backgroundColor: colors.surf,
    borderWidth: 1, borderColor: colors.border, borderRadius: 8,
  },
  confLabel: { fontSize: 12, fontWeight: '700', fontFamily: fonts.grotesk },
});

// ── Feedback ────────────────────────────────────────────────────
function FeedbackBlock({
  q,
  recallCorrect,
  mcqCorrect,
}: {
  q: MCQ | RecallQuestion;
  recallCorrect: boolean;
  mcqCorrect: boolean;
}) {
  const isWrong = q.mode === 'recall' ? !recallCorrect : !mcqCorrect;
  const tone = isWrong ? 'wrong' : 'right';
  const bg     = tone === 'right' ? colors.greenL : colors.redL;
  const accent = tone === 'right' ? colors.green  : colors.red;

  return (
    <View style={[fbStyles.block, { backgroundColor: bg, borderColor: `${accent}30` }]}>
      <Text style={[fbStyles.heading, { color: accent }]}>
        {tone === 'right' ? 'Correct' : q.mode === 'recall' ? 'Not quite' : 'Incorrect'}
      </Text>
      {q.explain && <Text style={fbStyles.body}>{q.explain}</Text>}
    </View>
  );
}

const fbStyles = StyleSheet.create({
  block: {
    marginHorizontal: 20, marginTop: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1, borderRadius: 8,
  },
  heading: { fontSize: 12, fontWeight: '700', marginBottom: 3, letterSpacing: 0.3, fontFamily: fonts.grotesk },
  body:    { fontSize: 12, color: colors.sub, lineHeight: 19, fontFamily: fonts.grotesk },
});

// ── Host styles ─────────────────────────────────────────────────
const styles = StyleSheet.create({
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
    fontFamily: fonts.grotesk,
  },
  progressTrack: { height: 2, backgroundColor: colors.dim },
  progressFill:  { height: '100%', backgroundColor: colors.accent },

  nav: {
    paddingHorizontal: 20, paddingVertical: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  navBack:  { fontSize: 13, color: colors.muted, fontFamily: fonts.grotesk },
  navCount: { fontSize: 12, color: colors.muted, fontFamily: fonts.mono },

  qBlock: { paddingHorizontal: 20, paddingTop: 20 },
  topicRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  modeChip: {
    paddingHorizontal: 7, paddingVertical: 2,
    backgroundColor: colors.bg,
    borderWidth: 1, borderColor: colors.border, borderRadius: 9,
  },
  modeChipText: {
    fontSize: 9.5, color: colors.muted,
    letterSpacing: 0.5, textTransform: 'uppercase', fontWeight: '600',
    fontFamily: fonts.grotesk,
  },
  qText: {
    fontSize: 19, fontWeight: '700', letterSpacing: -0.5, lineHeight: 26,
    color: colors.text, fontFamily: fonts.grotesk,
  },

  cta: { paddingVertical: 14, borderRadius: 8, backgroundColor: colors.accent, alignItems: 'center' },
  ctaText: { color: '#fff', fontSize: 14, fontWeight: '700', fontFamily: fonts.grotesk },
});
