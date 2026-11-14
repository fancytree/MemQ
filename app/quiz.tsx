import AsyncStorage from '@react-native-async-storage/async-storage';
import { homeColors } from '@/theme/colors';
import { LinearGradient } from 'expo-linear-gradient';
import { elevation as cardElevation } from '@/theme';
import { layout } from '@/theme/spacing';
import { EdBase } from '@/components/EdBase';
import { Icon } from '@/components/Icon';
import { CloseButton } from '@/components/ui/RoundButtons';
import { Feather } from '@expo/vector-icons';
import { HomeAsset } from '@/components/HomeAsset';
import { MascotCharacter } from '@/components/mascot/MascotCharacter';
import { SectionLabel } from '@/components/SectionLabel';
import { LanguageCardDetails, PlayButton } from '@/components/LanguageCardFields';
import { LanguageCardData, normalizeLanguageData } from '@/lib/languageCard';
import { supabase } from '@/lib/supabase';
import { loadCurrentPracticeQuestions } from '@/lib/loadPracticeQuestions';
import { chooseSavedQuestion, type SavedPracticeQuestion } from '@/lib/practiceQuestions';
import { fallbackOptions } from '@/lib/quizLanguage';
import { updateTermProgressSafe } from '@/lib/updateTermProgress';
import { colors, fonts } from '@/theme';
import PracticeSettingsModal, {
  DEFAULT_PRACTICE_SETTINGS, type PracticeMode, type PracticeSettings,
} from '@/components/PracticeSettingsModal';
import { loadPracticeSettings, savePracticeSettings } from '@/lib/practiceSettings';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, Keyboard, KeyboardAvoidingView, InteractionManager, Modal, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TextInput } from 'react-native';

interface MCQ {
  termId: string;
  mode: 'mcq';
  topic: string;
  q: string;
  opts: string[];
  correct: number;
  explain?: string;
  languageData?: LanguageCardData;
  termText?: string;
}

interface RecallQuestion {
  termId: string;
  mode: 'recall';
  topic: string;
  q: string;
  answer: string;
  explain?: string;
  languageData?: LanguageCardData;
  termText?: string;
}

interface FlipQuestion {
  termId: string;
  mode: 'flip';
  topic: string;
  q: string;
  back: string;
  explain?: string;
  languageData?: LanguageCardData;
  termText?: string;
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

const isRecallAnswerCorrect = (
  userInput: string,
  expectedAnswer: string,
  grading: PracticeSettings['grading'] = 'relaxed',
) => {
  const normalizedUser = normalizeRecallText(userInput);
  const normalizedExpected = normalizeRecallText(expectedAnswer);
  if (!normalizedUser || !normalizedExpected) return false;

  // 精确/包含匹配：覆盖短语型答案
  if (normalizedUser === normalizedExpected) return true;
  if (normalizedExpected.includes(normalizedUser) && normalizedUser.length >= 4) return true;
  if (normalizedUser.includes(normalizedExpected) && normalizedExpected.length >= 4) return true;

  // Keyword matching is the relaxed half of the rule: an answer that means the right
  // thing passes. Strict stops at the exact and contained matches above.
  if (grading === 'strict') return false;
  const userTokens = toKeywordTokens(userInput);
  const expectedTokens = new Set(toKeywordTokens(expectedAnswer));
  if (userTokens.length === 0) return false;

  const overlap = userTokens.filter((token) => expectedTokens.has(token)).length;
  return overlap >= 2 && overlap / userTokens.length >= 0.75;
};

/** Supabase terms 行（quiz 用） */
type QuizTermRow = {
  id: string;
  lesson_id: string;
  term: string;
  definition: string | null;
  explanation: string | null;
  language_data?: unknown;
  practiceQuestions?: SavedPracticeQuestion[];
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
 * - full：按闪卡 → 可用时选择题 → Recall 顺序学习；没有合适选项时跳过选择题。
 * - spot：已掌握（Mastered）抽查，本只出现 1 道题，题型在三种中随机，做完该词即结束当轮中该词。
 */
type TermPlan = { kind: 'full'; hasMcq: boolean } | { kind: 'spot'; singleMode: 'flip' | 'mcq' | 'recall' };

const FULL_TERM_PLAN: TermPlan = { kind: 'full', hasMcq: true };

/** The order a term is taken through, and the only place that order is written down.
 *  A kind the person has turned off is stepped over rather than asked. */
const STAGE_ORDER: PracticeMode[] = ['flip', 'mcq', 'recall'];

/** Whether this stage can be asked of this term at all: a term with no sensible
 *  distractors has no multiple choice to offer, whatever the settings say. */
const stageAvailable = (stage: PracticeMode, plan: TermPlan, modes: PracticeSettings['modes']) =>
  modes[stage] && !(stage === 'mcq' && plan.kind === 'full' && !plan.hasMcq);

/** The next stage after this one, or done. */
function stageAfter(stage: TermStage, plan: TermPlan, modes: PracticeSettings['modes']): TermStage {
  if (plan.kind === 'spot') return 'done';
  const from = stage === 'done' ? STAGE_ORDER.length : STAGE_ORDER.indexOf(stage as PracticeMode) + 1;
  for (let i = from; i < STAGE_ORDER.length; i++) {
    if (stageAvailable(STAGE_ORDER[i], plan, modes)) return STAGE_ORDER[i];
  }
  return 'done';
}

function buildTermPlanForRound(
  progress: TermProgressLite | undefined,
  hasMcq: boolean,
  modes: PracticeSettings['modes'],
): TermPlan {
  const st = (progress?.status || 'New').trim();
  if (st === 'Mastered') {
    // One question at random, drawn only from the kinds that are on and possible.
    const open = STAGE_ORDER.filter((m) => modes[m] && !(m === 'mcq' && !hasMcq));
    const pick = open.length ? open[Math.floor(Math.random() * open.length)] : 'flip';
    return { kind: 'spot', singleMode: pick };
  }
  return { kind: 'full', hasMcq };
}

function firstStage(plan: TermPlan, modes: PracticeSettings['modes']): TermStage {
  if (plan.kind === 'spot') return plan.singleMode;
  for (const stage of STAGE_ORDER) if (stageAvailable(stage, plan, modes)) return stage;
  return 'done';
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
  const languageData = term.language_data ? normalizeLanguageData(term.language_data) : undefined;
  if (stage === 'flip') {
    return {
      termId: term.id,
      mode: 'flip',
      topic,
      languageData,
      termText: term.term,
      q: term.term,
      back: definition,
      explain: term.explanation?.trim() || undefined,
    };
  }
  if (stage === 'mcq') {
    const saved = chooseSavedQuestion(term.practiceQuestions || [], 'mcq');
    if (saved && saved.mode === 'mcq') return { ...saved, termId: term.id, topic, languageData, termText: term.term };
    const explainText = term.explanation?.trim() || undefined;
    const fallback = fallbackOptions(definition, term.lesson_id, term.id, allTermsForMcq);
    if (!fallback) return null;
    const { opts, correctIndex } = fallback;
    return {
      termId: term.id,
      mode: 'mcq',
      topic,
      languageData,
      termText: term.term,
      q: term.term,
      opts,
      correct: correctIndex,
      explain: explainText,
    };
  }
  const saved = chooseSavedQuestion(term.practiceQuestions || [], 'recall');
  if (saved && saved.mode === 'recall') return { ...saved, termId: term.id, topic, languageData, termText: term.term };
  const explainText = term.explanation?.trim() || undefined;
  return {
    termId: term.id,
    mode: 'recall',
    topic,
    languageData,
    termText: term.term,
    q: term.term,
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
    if (s === 'recall') return acc + (plan.hasMcq ? 2 : 1);
    if (s === 'done') return acc + (plan.hasMcq ? 3 : 2);
    return acc;
  }, 0);
}

function totalStepsForRound(terms: QuizTermRow[], plans: Record<string, TermPlan>): number {
  return terms.reduce((acc, t) => {
    const plan = plans[t.id] ?? FULL_TERM_PLAN;
    return acc + (plan.kind === 'spot' ? 1 : plan.hasMcq ? 3 : 2);
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
  const { height: windowHeight, fontScale } = useWindowDimensions();
  const swipeProgress = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();
  const [navHeight, setNavHeight] = useState(72);
  const { entry, lessonId } = useLocalSearchParams<{ entry?: string; lessonId?: string }>();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sessionTerms, setSessionTerms] = useState<QuizTermRow[]>([]);
  const [allTermsForMcq, setAllTermsForMcq] = useState<QuizTermRow[]>([]);
  const [lessonTopicByLessonId, setLessonTopicByLessonId] = useState<Record<string, string>>({});
  const [stages, setStages] = useState<Record<string, TermStage>>({});
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<PracticeSettings>(DEFAULT_PRACTICE_SETTINGS);
  // The round is built out of these, so it waits for them: read a frame late, the
  // first question would already have been picked under the defaults.
  const [settingsReady, setSettingsReady] = useState(false);
  useEffect(() => {
    void loadPracticeSettings().then((saved) => { setSettings(saved); setSettingsReady(true); });
  }, []);
  const updateSettings = (next: PracticeSettings) => {
    setSettings(next);
    void savePracticeSettings(next);
  };
  const [termPlans, setTermPlans] = useState<Record<string, TermPlan>>({});
  const [currentQ, setCurrentQ] = useState<QuizQuestion | null>(null);
  const [currentTermIdx, setCurrentTermIdx] = useState(0);
  const [selected, setSelected]       = useState<number | null>(null);
  const [revealed, setRevealed]       = useState(false);
  const [recallText, setRecallText]   = useState('');
  const [flipped, setFlipped]         = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const recallInputRef = useRef<TextInput>(null);
  const explanationAngle = useRef(new Animated.Value(0)).current;
  const explanationTurning = useRef(false);
  /** 首页 quiz：首轮仅「到期」池；之后递增，从全量词加权抽题（含 Mastered 抽查） */
  const [quizRound, setQuizRound]     = useState(0);
  const [practiceComplete, setPracticeComplete] = useState(false);

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

  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  useEffect(() => {
    if (loading || practiceComplete || currentQ?.mode !== 'recall' || revealed) return;
    const task = InteractionManager.runAfterInteractions(() => recallInputRef.current?.focus());
    return () => task.cancel();
  }, [loading, practiceComplete, currentQ?.mode, currentQ?.termId, revealed]);

  const updateTermProgress = async (termId: string, isCorrect: boolean) => {
    await updateTermProgressSafe(termId, isCorrect);
  };

  useEffect(() => {
    if (!settingsReady) return;
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
          .select('id, name, learning_mode')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (lessonsError || !lessonsData) {
          setLoadError('Could not load your lessons. Please try again.');
          return;
        }
        if (lessonsData.length === 0) {
          router.replace('/create');
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
          .select('id, lesson_id, term, definition, explanation, language_data')
          .in('lesson_id', lessonIds)
          .order('created_at', { ascending: false });

        if (termsError) {
          setLoadError('Failed to load terms.');
          return;
        }

        const languageLessonIds = new Set(
          targetLessons.filter((lesson) => lesson.learning_mode === 'language').map((lesson) => lesson.id),
        );
        const usableTerms = ((termsData || []).filter(
          (term) => term.term?.trim() && term.definition?.trim(),
        ).map((term) => ({
          ...term,
          language_data: term.language_data || (languageLessonIds.has(term.lesson_id) ? {} : null),
        }))) as QuizTermRow[];

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

        const isHomeFollowUp = entryType === 'home' && quizRound > 0;
        const selectionPool: QuizTermRow[] = isHomeFollowUp ? usableTerms : entryType === 'home' ? filteredTerms : usableTerms;

        if (selectionPool.length === 0) {
          setLoadError('You’re all caught up. Choose a lesson to keep practicing.');
          return;
        }

        const MAX_QUIZ_QUESTIONS = 12;
        const STEPS_PER_TERM = 3;
        const maxTerms = Math.max(1, Math.floor(MAX_QUIZ_QUESTIONS / STEPS_PER_TERM));
        const pickedRaw = weightedSampleTermsWithoutReplacement(selectionPool, maxTerms, (t) =>
          termPickWeight(progressMap.get(t.id)),
        );
        const orderedTerms = orderPickedTermsForQuizPhases(pickedRaw, progressMap);

        // Load the LLM-authored questions for selected cards; older cards may have none.
        const { data: practiceRows, error: practiceError } = await loadCurrentPracticeQuestions(orderedTerms.map((term) => term.id));
        if (practiceError) {
          setLoadError('Could not load practice questions. Please try again.');
          return;
        }
        const questionsByTerm = new Map<string, SavedPracticeQuestion[]>();
        for (const row of practiceRows || []) {
          const entries = questionsByTerm.get(row.term_id) || [];
          entries.push(row);
          questionsByTerm.set(row.term_id, entries);
        }
        const termsWithQuestions = orderedTerms.map((term) => ({ ...term, practiceQuestions: questionsByTerm.get(term.id) || [] }));

        /*
         * ─── Quiz 当轮总流程（中文）───
         * 1）选词：首页首轮仅从「到期 / New」池加权抽；后续轮从全课 term 加权抽（Mastered 权重低但仍可入轮）。
         * 2）分词计划（buildTermPlanForRound）：
         *    - 非 Mastered：full，闪卡 → 可用时选择题 → Recall。
         *    - Mastered：spot，本只 1 题，题型在 flip / mcq / recall 中随机，不强制走满三步。
         * 3）混排：多词之间按轮询指针环形取「下一个还有待办」的词；full 词可与其他词的任意阶段交错出现。
         * 4）进度：full 为 2 或 3 步，spot 为 1 步；答错仍推进。
         */
        const topics: Record<string, string> = {};
        lessonMap.forEach((name, id) => {
          topics[id] = name;
        });
        const plans: Record<string, TermPlan> = {};
        const initialStages: Record<string, TermStage> = {};
        termsWithQuestions.forEach((t) => {
          const hasSaved = !!chooseSavedQuestion(t.practiceQuestions || [], 'mcq');
          const hasFallback = !!fallbackOptions(t.definition || '', t.lesson_id, t.id, usableTerms);
          const plan = buildTermPlanForRound(progressMap.get(t.id), hasSaved || hasFallback, settings.modes);
          plans[t.id] = plan;
          initialStages[t.id] = firstStage(plan, settings.modes);
        });
        const first = pickNextQuestion(termsWithQuestions, initialStages, 0, topics, usableTerms);
        if (!first) {
          setLoadError('Could not build quiz session.');
          return;
        }

        setSessionTerms(termsWithQuestions);
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
    // `settings` is deliberately not a dependency: changing what a round asks should
    // not tear down the round being answered. It takes effect on the next one.
  }, [entry, lessonId, quizRound, settingsReady]);

  const q = currentQ;
  const totalSteps = Math.max(1, totalStepsForRound(sessionTerms, termPlans));
  const completedSubsteps = countCompletedSubsteps(sessionTerms, stages, termPlans);

  const handleClose = () => {
    const destination = entry === 'lesson' && lessonId
      ? { pathname: '/lessons/[id]' as const, params: { id: lessonId } }
      : '/(tabs)' as const;
    // Dismiss every stacked practice screen, returning to the entry screen in one action.
    if (router.canDismiss()) router.dismissTo(destination);
    else router.replace(destination);
  };

  if (loading) {
    return (
      <EdBase bottomInset={0}>
        <View style={styles.nav}><CloseButton onPress={handleClose} label="Close practice" /></View>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="small" color={colors.accentText} />
          <Text style={styles.loadingText}>Loading quiz...</Text>
        </View>
      </EdBase>
    );
  }
  if (loadError) {
    return (
      <EdBase bottomInset={0}>
        <View style={styles.nav}><CloseButton onPress={handleClose} label="Close practice" /></View>
        <View style={styles.loadingWrap}>
          <Text style={styles.loadingText}>{loadError}</Text>
          <Pressable accessibilityRole="button" onPress={() => {
            if (entry === 'lesson' && lessonId && loadError.startsWith('No terms')) router.replace(`/lessons/${lessonId}/add-terms`);
            else if (entry === 'home' && (loadError.startsWith('No cards') || loadError.startsWith('You’re all caught up'))) router.replace('/(tabs)/library');
            else handleClose();
          }} style={styles.emptyAction}><Text style={styles.emptyActionText}>{entry === 'lesson' && lessonId && loadError.startsWith('No terms') ? 'Add cards' : entry === 'home' && (loadError.startsWith('No cards') || loadError.startsWith('You’re all caught up')) ? 'View lessons' : 'Go back'}</Text></Pressable>
        </View>
      </EdBase>
    );
  }
  if (practiceComplete) {
    return <PracticeComplete cards={sessionTerms.length} steps={totalSteps} onClose={handleClose} onContinue={() => {
      setLoading(true);
      setPracticeComplete(false);
      setQuizRound((round) => round + 1);
    }} />;
  }
  if (!q || sessionTerms.length === 0) {
    return (
      <EdBase bottomInset={0}>
        <View style={styles.nav}><CloseButton onPress={handleClose} label="Close practice" /></View>
        <View style={styles.loadingWrap}>
          <Text style={styles.loadingText}>No quiz data available.</Text>
          <Pressable accessibilityRole="button" onPress={handleClose} style={styles.emptyAction}><Text style={styles.emptyActionText}>Go back</Text></Pressable>
        </View>
      </EdBase>
    );
  }

  const progressPct = Math.min(100, (completedSubsteps / totalSteps) * 100);
  const recallCorrect = q.mode === 'recall'
    ? isRecallAnswerCorrect(recallText, q.answer, settings.grading)
    : false;

  const reset = () => {
    setSelected(null);
    setRevealed(false);
    setRecallText('');
    setFlipped(false);
    explanationAngle.stopAnimation();
    explanationAngle.setValue(0);
    explanationTurning.current = false;
    setShowExplanation(false);
  };

  const checkDisabled =
    !revealed &&
    ((q.mode === 'mcq' && selected === null) ||
      (q.mode === 'recall' && !recallText.trim()));

  const flipExplanation = () => {
    if (explanationTurning.current) return;
    explanationTurning.current = true;
    Animated.timing(explanationAngle, { toValue: 90, duration: 150, useNativeDriver: true }).start(({ finished }) => {
      if (!finished) { explanationTurning.current = false; return; }
      setShowExplanation((current) => !current);
      explanationAngle.setValue(-90);
      Animated.timing(explanationAngle, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => { explanationTurning.current = false; });
    });
  };
  const explanationRotation = explanationAngle.interpolate({ inputRange: [-90, 0, 90], outputRange: ['-90deg', '0deg', '90deg'] });

  const onCheckOrNext = () => {
    if (!revealed) {
      if (q.mode === 'mcq'    && selected === null)  return;
      if (q.mode === 'recall' && !recallText.trim()) return;
      if (q.mode === 'mcq') {
        updateTermProgress(q.termId, selected === q.correct);
      }
      if (q.mode === 'recall') {
        Keyboard.dismiss();
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
            : { ...e.stages, [q.termId]: stageAfter('mcq', plan, settings.modes) };
        const allDone = e.sessionTerms.every((t) => newStages[t.id] === 'done');
        setStages(newStages);
        if (allDone) {
          reset();
          setPracticeComplete(true);
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
          setPracticeComplete(true);
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



  return (
    <EdBase bottomInset={0} scroll={false} style={{ paddingBottom: keyboardVisible ? 0 : insets.bottom }}>
      <LinearGradient pointerEvents="none" colors={[homeColors.gradientStart, homeColors.gradientBright, homeColors.canvas]} locations={[0, 0.42, 1]} style={[styles.headerGradient, { top: -insets.top }]} />
      {q.mode === 'flip' && <View pointerEvents="none" style={[styles.pageSwipeBackground, { top: -insets.top, height: windowHeight }]}>
        <Animated.View style={[styles.pageSwipeGradient, { opacity: swipeProgress.interpolate({ inputRange: [0, 24, 110], outputRange: [0, 0.2, 1], extrapolate: 'clamp' }) }]}><LinearGradient colors={[homeColors.swipeGreen, homeColors.swipeGreenLight, homeColors.canvas]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} /></Animated.View>
        <Animated.View style={[styles.pageSwipeGradient, { opacity: swipeProgress.interpolate({ inputRange: [-110, -24, 0], outputRange: [1, 0.2, 0], extrapolate: 'clamp' }) }]}><LinearGradient colors={[homeColors.swipeRed, homeColors.swipeRedLight, homeColors.canvas]} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} /></Animated.View>
      </View>}
      <KeyboardAvoidingView style={styles.practiceLayout} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Nav */}
      <View style={styles.nav} onLayout={(event) => setNavHeight(event.nativeEvent.layout.height)}>
        <CloseButton onPress={handleClose} label="Close practice" />
        <Text style={styles.roundTitle}>Practice</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Practice settings"
          onPress={() => setSettingsOpen(true)} style={styles.navButton}>
          <Feather name="settings" size={22} color={homeColors.deep} />
        </Pressable>
      </View>

      {/* Progress */}
      <View style={styles.progressRow} accessibilityRole="progressbar" accessibilityLabel="Practice progress" accessibilityValue={{ min: 0, max: totalSteps, now: completedSubsteps }}>
        <Text style={styles.progressCount}>{completedSubsteps}</Text><View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${progressPct}%` }]} /></View><Text style={styles.progressCount}>{totalSteps}</Text>
      </View>

      <ScrollView style={styles.practiceScroll} contentContainerStyle={[styles.practiceScrollContent, q.mode !== 'flip' && styles.fixedCardContent]} scrollEnabled={q.mode === 'flip'} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      {q.mode !== 'flip' ? (
        <Animated.View style={[styles.fixedQuestionCard, { transform: [{ perspective: 1000 }, { rotateY: explanationRotation }] }]}>
        <View style={[styles.questionCard, styles.fixedQuestionCard]}>
          <View style={[styles.questionArea, styles.compactQuestionArea]}>
            <View style={styles.topicRow}><Text numberOfLines={2} style={styles.cardTopic}>{q.topic}</Text><View style={styles.modeChip}><Text style={styles.modeChipText}>{q.mode === 'mcq' ? 'Choose' : 'Recall'}</Text></View></View>
            <View style={styles.questionCenter}>
              {q.mode === 'mcq' && <View style={styles.retryBadgeSlot}>{revealed && selected !== q.correct && <Text style={styles.retryBadge}>Let’s try again</Text>}</View>}
              <ScrollView style={[styles.questionTextScroll, q.mode !== 'mcq' && { maxHeight: 120 * fontScale }]} nestedScrollEnabled showsVerticalScrollIndicator><Text style={styles.qText}>{q.q}</Text></ScrollView>
              {q.languageData && !!q.termText && <PlayButton text={q.termText} languageCode={q.languageData.language_code} label={`Play ${q.termText}`} />}
            </View>
          </View>
          {showExplanation && revealed ? <View style={styles.answerArea}>
            <ScrollView style={styles.backExplanationScroll} nestedScrollEnabled showsVerticalScrollIndicator>
              <View style={styles.backExplanationContent}>
                <View style={styles.correctAnswerBox}><Text style={styles.explanationTitle}>Correct answer</Text><Text style={styles.correctAnswerText}>{q.mode === 'mcq' ? q.opts[q.correct] : q.answer}</Text></View>
                <View style={styles.explanation}><Text style={styles.explanationTitle}>Explanation</Text><Text style={styles.explanationText}>{q.explain?.trim() || 'No explanation available for this card yet.'}</Text></View>
                {q.languageData && <LanguageCardDetails data={q.languageData} />}
              </View>
            </ScrollView>
            <Pressable accessibilityRole="button" accessibilityLabel="Return to answers" onPress={flipExplanation} hitSlop={10} style={styles.explanationToggle}><Text style={styles.explanationLink}>Tap to see your answer again</Text></Pressable>
          </View> : <View style={[styles.answerArea, q.mode === 'mcq' && styles.mcqAnswerArea]}>
            {q.mode === 'mcq' ? <>
              <Text style={[styles.answerPrompt, revealed && { color: selected === q.correct ? colors.green : colors.warn }]}>{revealed ? (selected === q.correct ? 'You got it!' : 'Keep going — learning takes practice.') : 'Choose the answer'}</Text>
              <MCQView q={q} selected={selected} revealed={revealed} onSelect={(i) => {
                if (revealed) return;
                setSelected(i);
                setRevealed(true);
                void updateTermProgress(q.termId, i === q.correct);
              }} />
            </> : revealed ? <RecallResult q={q} recallText={recallText} recallCorrect={recallCorrect} /> : null}
            {(q.mode === 'mcq' || revealed) && <View pointerEvents={revealed ? 'auto' : 'none'} style={styles.explanationSlot}>
              {revealed && <Pressable accessibilityRole="button" accessibilityLabel="Reveal explanation" onPress={flipExplanation} hitSlop={10} style={styles.explanationToggle}><Text style={styles.explanationLink}>Tap to reveal explanation</Text></Pressable>}
            </View>}
          </View>}
        </View>
        </Animated.View>
      ) : null}

      {q.mode === 'flip' && (
        <FlipView
          swipeProgress={swipeProgress}
          cardMinHeight={Math.max(200, windowHeight - insets.top - insets.bottom - navHeight - 78 - (flipped ? 80 : 0))}
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
            // 有合适的选择题时进入 MCQ，否则直接进入 Recall。
            const newStages =
              plan.kind === 'spot'
                ? { ...e.stages, [q.termId]: 'done' as TermStage }
                : { ...e.stages, [q.termId]: stageAfter('flip', plan, settings.modes) };
            const allDone = e.sessionTerms.every((t) => newStages[t.id] === 'done');
            setStages(newStages);
            if (allDone) {
              setFlipped(false);
              setSelected(null);
              setRevealed(false);
              setRecallText('');
              setPracticeComplete(true);
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

      </ScrollView>
      {/* The recall composer stays above the keyboard; feedback uses the fixed Continue action. */}
      {q.mode === 'recall' && !revealed ? <View style={styles.recallComposer}>
        <TextInput ref={recallInputRef} accessibilityLabel="Type your answer" value={recallText} onChangeText={setRecallText} placeholder="Type your answer" placeholderTextColor={homeColors.muted} multiline style={styles.recallComposerInput} />
        <Pressable accessibilityRole="button" accessibilityLabel="Don't know" onPress={() => {
          Keyboard.dismiss();
          setRecallText(RECALL_DONT_KNOW_FILL);
          setRevealed(true);
          void updateTermProgress(q.termId, false);
        }} style={styles.recallSkip}><Text style={styles.recallSkipText}>Don’t know</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Submit answer" accessibilityState={{ disabled: checkDisabled }} disabled={checkDisabled} onPress={onCheckOrNext} style={[styles.recallSubmit, checkDisabled && styles.recallSubmitDisabled]}><Icon name="arrowRight" size={20} color={homeColors.white} strokeWidth={2} /></Pressable>
      </View> : q.mode !== 'flip' && <View style={styles.practiceFooter} pointerEvents={q.mode === 'mcq' && !revealed ? 'none' : 'auto'} accessibilityElementsHidden={q.mode === 'mcq' && !revealed} importantForAccessibility={q.mode === 'mcq' && !revealed ? 'no-hide-descendants' : 'auto'}>
        <Pressable accessibilityRole="button" onPress={onCheckOrNext} disabled={checkDisabled} style={[styles.cta, checkDisabled && styles.ctaDisabled, q.mode === 'mcq' && !revealed && styles.reservedInvisible]}><Text style={styles.ctaText}>Continue →</Text></Pressable>
      </View>}
      </KeyboardAvoidingView>
      <PracticeSettingsModal visible={settingsOpen} settings={settings}
        onChange={updateSettings} onClose={() => setSettingsOpen(false)} />
    </EdBase>
  );
}

function PracticeComplete({ cards, steps, onClose, onContinue }: { cards: number; steps: number; onClose: () => void; onContinue: () => void }) {
  const insets = useSafeAreaInsets();
  const entrance = useRef(new Animated.Value(0)).current;
  const mascotCelebrate = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then((reduceMotion) => {
      if (!active) return;
      if (reduceMotion) { entrance.setValue(1); mascotCelebrate.setValue(1); return; }
      Animated.parallel([
        Animated.spring(entrance, { toValue: 1, useNativeDriver: true, friction: 7, tension: 65 }),
        Animated.sequence([Animated.delay(120), Animated.spring(mascotCelebrate, { toValue: 1, useNativeDriver: true, friction: 4, tension: 90 })]),
      ]).start();
    }).catch(() => { if (active) { entrance.setValue(1); mascotCelebrate.setValue(1); } });
    return () => { active = false; entrance.stopAnimation(); mascotCelebrate.stopAnimation(); };
  }, [entrance, mascotCelebrate]);
  return <EdBase bottomInset={0} scroll={false}>
    <LinearGradient pointerEvents="none" colors={[homeColors.gradientStart, homeColors.gradientBright, homeColors.canvas]} locations={[0, 0.38, 1]} style={[styles.completeGradient, { top: -insets.top }]} />
    <View style={styles.nav}><CloseButton onPress={onClose} label="Close practice" /></View>
    <ScrollView contentContainerStyle={styles.completeContent} showsVerticalScrollIndicator={false}>
      <Animated.View style={[styles.completeCardBase, { opacity: entrance, transform: [{ translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }, { scale: entrance.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }] }]}>
        <View style={styles.completeCard}>
          <View style={styles.completeMascot}><Animated.View style={{ transform: [{ translateY: mascotCelebrate.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }, { scale: mascotCelebrate.interpolate({ inputRange: [0, 1], outputRange: [0.48, 0.65] }) }, { rotate: mascotCelebrate.interpolate({ inputRange: [0, 1], outputRange: ['-12deg', '0deg'] }) }] }}><HomeAsset name="happy" /></Animated.View></View>
          <View style={styles.completeBadge}><Icon name="check" size={16} color={homeColors.deep} strokeWidth={2.5} /><Text style={styles.completeBadgeText}>Practice complete</Text></View>
          <Text accessibilityRole="header" style={styles.completeTitle}>You did it!</Text>
          <Text style={styles.completeCopy}>A little practice goes a long way.</Text>
          <View style={styles.completeStats}>
            <View style={styles.completeStat}><Text style={styles.completeNumber}>{cards}</Text><Text style={styles.completeStatLabel}>{cards === 1 ? 'Card' : 'Cards'}</Text></View>
            <View style={styles.completeDivider} />
            <View style={styles.completeStat}><Text style={styles.completeNumber}>{steps}</Text><Text style={styles.completeStatLabel}>{steps === 1 ? 'Step' : 'Steps'} completed</Text></View>
          </View>
        </View>
      </Animated.View>
      <View style={styles.completeActions}>
        <Pressable accessibilityRole="button" onPress={onContinue} style={styles.completePrimaryBase}><View style={styles.completePrimary}><Text style={styles.completePrimaryText}>Keep practicing</Text></View></Pressable>
        <Pressable accessibilityRole="button" onPress={onClose} style={styles.completeDone}><Text style={styles.completeDoneText}>Done</Text></Pressable>
      </View>
    </ScrollView>
  </EdBase>;
}

// ── MCQ ─────────────────────────────────────────────────────────
interface MCQViewProps {
  q: MCQ;
  selected: number | null;
  revealed: boolean;
  onSelect: (i: number) => void;
}

function MCQView({ q, selected, revealed, onSelect }: MCQViewProps) {
  const answeredIncorrectly = revealed && selected !== q.correct;
  return (
    <ScrollView style={mcqStyles.scroll} contentContainerStyle={mcqStyles.wrap} nestedScrollEnabled showsVerticalScrollIndicator keyboardShouldPersistTaps="handled">
      {q.opts.map((opt, i) => {
        const isSelected = selected === i;
        const isCorrect = i === q.correct;
        const showCorrect = revealed && isCorrect;
        const showWrong = answeredIncorrectly && isSelected;
        return <Pressable key={i} accessibilityRole="radio"
          accessibilityState={{ checked: isSelected, disabled: revealed }}
          accessibilityLabel={`${String.fromCharCode(65 + i)}. ${opt}${showCorrect ? ', correct answer' : showWrong ? ', incorrect answer' : ''}`}
          disabled={revealed} onPress={() => onSelect(i)}
          style={[mcqStyles.row, showCorrect && mcqStyles.correct, showCorrect && answeredIncorrectly && mcqStyles.correctDashed, showWrong && mcqStyles.wrong]}>
          <Text style={mcqStyles.optText}>{opt}</Text>
        </Pressable>;
      })}
    </ScrollView>
  );
}

const mcqStyles = StyleSheet.create({
  scroll: { flexGrow: 0, flexShrink: 1, minHeight: 0 },
  wrap: { gap: 8, paddingBottom: 5 },
  row: { minHeight: 52, justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 16, borderWidth: 1, borderColor: homeColors.border, backgroundColor: homeColors.white },
  correct: { borderColor: colors.green, borderWidth: 1.5 },
  correctDashed: { borderStyle: 'dashed' },
  wrong: { borderColor: homeColors.quizWrongOutline, borderWidth: 1.5 },
  optText: { fontSize: 16, lineHeight: 23, color: homeColors.darkest, fontFamily: fonts.regular },
});

// ── Recall ──────────────────────────────────────────────────────
const RECALL_DONT_KNOW_FILL = "I don't know";

function RecallResult({ q, recallText, recallCorrect }: { q: RecallQuestion; recallText: string; recallCorrect: boolean }) {
  const skipped = recallText === RECALL_DONT_KNOW_FILL;
  return <View style={recallStyles.result}>
    <Text style={[recallStyles.resultLabel, { color: recallCorrect ? colors.green : colors.warn }]}>{skipped ? 'Give this one another try later' : recallCorrect ? 'You got it!' : 'Keep going — learning takes practice.'}</Text>
    <View style={[recallStyles.resultAnswer, { borderColor: recallCorrect ? colors.green : homeColors.quizWrongOutline }]}><Text style={recallStyles.resultText}>{skipped ? 'Skipped' : recallText}</Text></View>
    {!recallCorrect && <><Text style={[recallStyles.resultLabel, { color: colors.green }]}>Correct answer</Text><View style={[recallStyles.resultAnswer, { borderColor: colors.green }]}><Text style={recallStyles.resultText}>{q.answer}</Text></View></>}
  </View>;
}
const recallStyles = StyleSheet.create({
  result: { gap: 8 },
  resultLabel: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20 },
  resultAnswer: { minHeight: 52, justifyContent: 'center', borderWidth: 1.5, borderRadius: 16, backgroundColor: homeColors.white, paddingHorizontal: 16, paddingVertical: 10 },
  resultText: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 23, color: homeColors.darkest },
});

// ── Flip ────────────────────────────────────────────────────────
interface FlipViewProps {
  swipeProgress: Animated.Value;
  cardMinHeight: number;
  q: FlipQuestion;
  flipped: boolean;
  onFlip: () => void;
  onConfidence: (level: 'Need review' | 'I got it') => void;
}

const FLASHCARD_GUIDE_KEY = 'memq.flashcard-guide.v1';
let flashcardGuideDismissedThisSession = false;

const CONFIDENCE_BUTTONS = [
  { label: 'Need review', color: colors.red },
  { label: 'I got it',  color: colors.accentText },
] as const;

function FlipView({ q, flipped, onFlip, onConfidence, cardMinHeight, swipeProgress }: FlipViewProps) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [showGuide, setShowGuide] = useState(false);
  const [cardHeight, setCardHeight] = useState(cardMinHeight);
  const [shownBack, setShownBack] = useState(flipped);
  const flipAngle = useRef(new Animated.Value(0)).current;
  const flipping = useRef(false);
  const translateX = swipeProgress;
  const submitting = useRef(false);
  const onConfidenceRef = useRef(onConfidence);
  const widthRef = useRef(width);
  onConfidenceRef.current = onConfidence;
  widthRef.current = width;

  useEffect(() => {
    let active = true;
    if (!flashcardGuideDismissedThisSession) {
      AsyncStorage.getItem(FLASHCARD_GUIDE_KEY)
        .then((seen) => { if (active && !seen && !flashcardGuideDismissedThisSession) setShowGuide(true); })
        .catch(() => { if (active && !flashcardGuideDismissedThisSession) setShowGuide(true); });
    }
    return () => { active = false; };
  }, []);

  const dismissGuide = () => {
    flashcardGuideDismissedThisSession = true;
    setShowGuide(false);
    void AsyncStorage.setItem(FLASHCARD_GUIDE_KEY, '1').catch(() => {});
  };

  useEffect(() => {
    translateX.setValue(0);
    submitting.current = false;
  }, [q, translateX]);

  useEffect(() => {
    if (flipped === shownBack) return;
    flipping.current = true;
    let cancelled = false;
    Animated.timing(flipAngle, { toValue: 90, duration: 150, useNativeDriver: true }).start(({ finished }) => {
      if (!finished || cancelled) return;
      setShownBack(flipped);
      flipAngle.setValue(-90);
      Animated.timing(flipAngle, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => { flipping.current = false; });
    });
    return () => { cancelled = true; flipAngle.stopAnimation(); flipping.current = false; };
  }, [flipped, flipAngle]);

  const swipe = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => !submitting.current && Math.abs(gesture.dx) > 12 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.4,
    onPanResponderMove: (_, gesture) => translateX.setValue(gesture.dx),
    onPanResponderRelease: (_, gesture) => {
      const threshold = Math.min(110, widthRef.current * 0.25);
      const accepted = Math.abs(gesture.dx) > threshold || (Math.abs(gesture.dx) > 35 && Math.abs(gesture.vx) > 0.8);
      if (!accepted) {
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
        return;
      }
      submitting.current = true;
      const right = gesture.dx > 0;
      Animated.timing(translateX, { toValue: right ? widthRef.current * 1.2 : -widthRef.current * 1.2, duration: 200, useNativeDriver: true }).start(({ finished }) => {
        if (finished) onConfidenceRef.current(right ? 'I got it' : 'Need review');
        else { translateX.setValue(0); submitting.current = false; }
      });
    },
    onPanResponderTerminate: () => Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start(),
  })).current;
  const flipRotation = flipAngle.interpolate({ inputRange: [-90, 0, 90], outputRange: ['-90deg', '0deg', '90deg'] });
  const rotate = translateX.interpolate({ inputRange: [-width, 0, width], outputRange: ['-10deg', '0deg', '10deg'], extrapolate: 'clamp' });
  const rememberedOpacity = translateX.interpolate({ inputRange: [0, 24, 80], outputRange: [0, 0.25, 1], extrapolate: 'clamp' });
  const reviewOpacity = translateX.interpolate({ inputRange: [-100, -15, 0], outputRange: [1, 0.15, 0], extrapolate: 'clamp' });
  const rememberedOffset = translateX.interpolate({ inputRange: [0, 100], outputRange: [18, 0], extrapolate: 'clamp' });
  const reviewOffset = translateX.interpolate({ inputRange: [-100, 0], outputRange: [0, 18], extrapolate: 'clamp' });
  const rememberedScale = translateX.interpolate({ inputRange: [0, 100], outputRange: [0.92, 1], extrapolate: 'clamp' });
  const reviewScale = translateX.interpolate({ inputRange: [-100, 0], outputRange: [1, 0.92], extrapolate: 'clamp' });

  return (
    <View style={flipStyles.wrap}>
      <View pointerEvents="none" style={[flipStyles.swipeBackdrop, { height: Math.max(cardMinHeight, cardHeight) }]}>
        <Animated.View style={[flipStyles.swipeFeedback, flipStyles.rememberedFeedback, { opacity: rememberedOpacity, transform: [{ translateY: rememberedOffset }, { scale: rememberedScale }] }]}><View style={flipStyles.feedbackIcon}><Icon name="check" size={22} color={colors.green} strokeWidth={2.5} /></View><Text style={[flipStyles.swipeFeedbackText, { color: colors.green }]}>I got it</Text></Animated.View>
        <Animated.View style={[flipStyles.swipeFeedback, flipStyles.reviewFeedback, { opacity: reviewOpacity, transform: [{ translateY: reviewOffset }, { scale: reviewScale }] }]}><View style={flipStyles.feedbackIcon}><Icon name="close" size={22} color={colors.red} strokeWidth={2.5} /></View><Text style={[flipStyles.swipeFeedbackText, { color: colors.red }]}>Need review</Text></Animated.View>
      </View>
      <Animated.View {...swipe.panHandlers} style={{ transform: [{ translateX }, { rotate }] }}>
      <Animated.View style={{ transform: [{ perspective: 1000 }, { rotateY: flipRotation }] }}>
      <Pressable accessibilityRole="button" accessibilityLabel={shownBack ? "Show front of card" : "Reveal answer"} accessibilityHint="Swipe right if you remember, or left if you need review." accessibilityActions={[{ name: 'remembered', label: 'I got it' }, { name: 'review', label: 'Need review' }]} onAccessibilityAction={(event) => { if (event.nativeEvent.actionName === 'remembered') onConfidence('I got it'); else if (event.nativeEvent.actionName === 'review') onConfidence('Need review'); }} onPress={() => { if (!flipping.current) onFlip(); }} onLayout={(event) => setCardHeight(event.nativeEvent.layout.height)} style={[flipStyles.card, { minHeight: cardMinHeight }, shownBack && flipStyles.cardRevealed]}>
        <View style={flipStyles.cardHeader}><Text numberOfLines={2} style={flipStyles.topic}>{q.topic}</Text><View style={flipStyles.typeBadge}><Text style={flipStyles.typeBadgeText}>Flashcard</Text></View></View>
        {shownBack ? <View style={flipStyles.backLayout}>
          <View style={flipStyles.backQuestion}>
            <Text style={flipStyles.backTermLabel}>Term</Text>
            <Text style={flipStyles.termRevealed}>{q.q}</Text>
            {q.languageData && !!q.termText && <PlayButton text={q.termText} languageCode={q.languageData.language_code} label={`Play ${q.termText}`} />}
          </View>
          <View style={flipStyles.answer}>
            <View style={flipStyles.correctAnswer}><Text style={flipStyles.meaningLabel}>Meaning</Text><Text style={flipStyles.definition}>{q.back}</Text></View>
            {!!q.explain && <View style={flipStyles.explanationBlock}><Text style={flipStyles.answerLabel}>Explanation</Text><Text style={flipStyles.back}>{q.explain}</Text></View>}
            {q.languageData && <LanguageCardDetails data={q.languageData} variant="flashcard" />}
          </View>
        </View> : <View style={flipStyles.cardContent}>
          <Text style={flipStyles.frontLabel}>Term</Text>
          <Text style={flipStyles.term}>{q.q}</Text>
          {!!q.languageData?.pronunciation && <Text style={flipStyles.pronunciation}>{q.languageData.pronunciation}</Text>}
          {!!q.languageData?.part_of_speech && <View style={flipStyles.wordType}><Text style={flipStyles.wordTypeText}>{q.languageData.part_of_speech}</Text></View>}
          {q.languageData && !!q.termText && <View style={flipStyles.audioControl}><PlayButton text={q.termText} languageCode={q.languageData.language_code} label={`Play ${q.termText}`} /></View>}
        </View>}
        <View style={flipStyles.cornerHint}><Text style={flipStyles.hintText}>{shownBack ? 'Tap to see question again' : 'Tap to reveal answer'}</Text></View>
      </Pressable>
      </Animated.View>
      </Animated.View>

      <Modal visible={showGuide} transparent animationType="fade" onRequestClose={dismissGuide}>
        <View style={[flipStyles.guideOverlay, { paddingBottom: Math.max(insets.bottom, 20) + 12 }]}>
          <View style={flipStyles.guideCard} accessibilityViewIsModal>
            <View style={flipStyles.guideHeadingRow}><View style={flipStyles.guideIcon}><Icon name="library" size={22} color={homeColors.deep} strokeWidth={2} /></View><CloseButton onPress={dismissGuide} label="Close flashcard guide" size={20} /></View>
            <Text accessibilityRole="header" style={flipStyles.guideTitle}>Study with flashcards</Text>
            <Text style={flipStyles.guideDescription}>Tap the card to reveal the answer. When you’re ready, swipe to continue.</Text>
            <View style={flipStyles.guideDirections}>
              <View style={flipStyles.guideDirection}><Text style={flipStyles.guideArrow}>←</Text><View style={flipStyles.guideDirectionCopy}><Text style={flipStyles.guideDirectionTitle}>Need review</Text><Text style={flipStyles.guideDirectionHint}>Swipe left</Text></View></View>
              <View style={flipStyles.guideDirection}><Text style={flipStyles.guideArrow}>→</Text><View style={flipStyles.guideDirectionCopy}><Text style={flipStyles.guideDirectionTitle}>I got it</Text><Text style={flipStyles.guideDirectionHint}>Swipe right</Text></View></View>
            </View>
            <Pressable accessibilityRole="button" onPress={dismissGuide} style={flipStyles.guideButton}><Text style={flipStyles.guideButtonText}>Got it</Text></Pressable>
          </View>
        </View>
      </Modal>
      {flipped && (
        <View style={flipStyles.confRow}>
          {CONFIDENCE_BUTTONS.map((b) => (
            <Pressable accessibilityRole="button" key={b.label} onPress={() => onConfidence(b.label)} style={flipStyles.confBtn}>
              <Text style={[flipStyles.confLabel, { color: b.color }]}>{b.label}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const flipStyles = StyleSheet.create({
  wrap: {
    marginHorizontal: layout.screenInline,
    marginTop: 20,
  },
  swipeBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, borderRadius: 24, overflow: 'hidden' },
  swipeFeedback: { position: 'absolute', bottom: 28, paddingHorizontal: 16, gap: 8 },
  rememberedFeedback: { left: 0, alignItems: 'flex-start' },
  reviewFeedback: { right: 0, alignItems: 'flex-end' },
  feedbackIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: homeColors.white },
  swipeFeedbackText: { fontFamily: fonts.display, fontSize: 20 },
  card: { backgroundColor: colors.surf, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 24, paddingTop: 76, paddingBottom: 64, position: 'relative', alignItems: 'center', justifyContent: 'center', ...cardElevation.card },
  cardRevealed: { alignItems: 'stretch', justifyContent: 'flex-start' },
  cardHeader: { position: 'absolute', top: 20, left: 20, right: 20, flexDirection: 'row', alignItems: 'center', gap: 8 },
  topic: { flexShrink: 1, fontFamily: fonts.medium, fontSize: 14, color: homeColors.muted },
  typeBadge: { borderRadius: 16, backgroundColor: homeColors.selected, paddingHorizontal: 10, paddingVertical: 5 },
  typeBadgeText: { fontFamily: fonts.semibold, fontSize: 12, color: homeColors.deep },
  cardContent: { width: '100%', alignItems: 'center', gap: 12 },
  frontLabel: { fontFamily: fonts.semibold, fontSize: 13, color: homeColors.muted },
  pronunciation: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 23, color: homeColors.muted, textAlign: 'center' },
  wordType: { borderRadius: 16, backgroundColor: homeColors.nav, paddingHorizontal: 10, paddingVertical: 5 },
  wordTypeText: { fontFamily: fonts.medium, fontSize: 12, color: homeColors.deep },
  audioControl: { alignItems: 'center', marginTop: 4 },
  backTermLabel: { fontFamily: fonts.medium, fontSize: 13, color: homeColors.muted },
  backLayout: { width: '100%', flexGrow: 1, gap: 20 },
  backQuestion: { flexGrow: 1, minHeight: 120, justifyContent: 'center', alignItems: 'flex-start', gap: 8 },
  term: { fontFamily: fonts.display, fontSize: 36, lineHeight: 46, color: homeColors.darkest, textAlign: 'center' },
  termRevealed: { fontFamily: fonts.display, fontSize: 26, lineHeight: 36, color: homeColors.deep, textAlign: 'left' },
  answer: { flexGrow: 1, alignSelf: 'stretch', gap: 16 },
  correctAnswer: { borderRadius: 18, backgroundColor: homeColors.selected, padding: 16, gap: 8 },
  meaningLabel: { fontFamily: fonts.semibold, fontSize: 13, color: homeColors.deep },
  explanationBlock: { gap: 6 },
  front: { fontSize: 14, lineHeight: 21, color: homeColors.muted, fontFamily: fonts.medium, textAlign: 'center', maxWidth: 280 },
  answerLabel: { fontSize: 13, color: homeColors.muted, fontFamily: fonts.medium },
  definition: { fontSize: 20, lineHeight: 29, color: homeColors.darkest, fontFamily: fonts.semibold },
  back:  { fontSize: 15, lineHeight: 23, color: homeColors.deep, fontFamily: fonts.regular },
  cornerHint: {
    position: 'absolute', bottom: 16, left: 20, right: 20, alignItems: 'center', gap: 5,
  },
  hintText: { fontSize: 13, color: homeColors.muted, fontFamily: fonts.medium,
  },
  guideOverlay: { flex: 1, backgroundColor: colors.modalScrim, justifyContent: 'flex-end', paddingHorizontal: 16 },
  guideCard: { backgroundColor: homeColors.white, borderRadius: 24, padding: 20, gap: 14, boxShadow: `0px 4px 0px ${homeColors.border}` },
  guideHeadingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  guideIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: homeColors.selected, alignItems: 'center', justifyContent: 'center' },
  guideClose: { width: 44, height: 44, borderRadius: 22, backgroundColor: homeColors.nav, alignItems: 'center', justifyContent: 'center' },
  guideTitle: { fontFamily: fonts.display, fontSize: 26, lineHeight: 34, color: homeColors.darkest },
  guideDescription: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 23, color: homeColors.deep },
  guideDirections: { flexDirection: 'row', gap: 10 },
  guideDirection: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 16, backgroundColor: homeColors.nav, padding: 12 },
  guideDirectionCopy: { flex: 1, gap: 2 },
  guideArrow: { fontFamily: fonts.semibold, fontSize: 22, color: homeColors.primary },
  guideDirectionTitle: { fontFamily: fonts.semibold, fontSize: 13, color: homeColors.darkest },
  guideDirectionHint: { fontFamily: fonts.regular, fontSize: 12, color: homeColors.muted },
  guideButton: { minHeight: 52, borderRadius: 26, backgroundColor: homeColors.primary, alignItems: 'center', justifyContent: 'center' },
  guideButtonText: { fontFamily: fonts.semibold, fontSize: 16, color: homeColors.white },
  confRow: { flexDirection: 'row', gap: 12, marginTop: 18, marginBottom: 10 },
  confBtn: {
    flex: 1, minHeight: 52, paddingVertical: 14, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surf,
    borderWidth: 1, borderColor: colors.border, borderRadius: 26, boxShadow: `0px 4px 0px ${homeColors.border}`,
  },
  confLabel: { fontSize: 15, fontFamily: fonts.semibold },
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
      <MascotCharacter width={76} mood={tone === 'right' ? 'happy' : 'thinking'} />
      <View style={fbStyles.copy}>
        <Text style={[fbStyles.heading, { color: accent }]}>
          {tone === 'right' ? 'That one stuck.' : q.mode === 'recall' ? 'Not quite yet.' : 'A useful miss.'}
        </Text>
        {q.explain ? <Text style={fbStyles.body}>{q.explain}</Text> : <Text style={fbStyles.body}>Keep going. Every try helps it settle in.</Text>}
      </View>
    </View>
  );
}

const fbStyles = StyleSheet.create({
  block: {
    marginHorizontal: layout.screenInline, marginTop: 12,
    paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, borderRadius: 18,
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  copy: { flex: 1, minWidth: 0 },
  heading: { fontSize: 15, fontWeight: '700', marginBottom: 3, letterSpacing: 0.3, fontFamily: fonts.bold },
  body:    { fontSize: 14, color: colors.sub, lineHeight: 21, fontFamily: fonts.regular },
});

// ── Host styles ─────────────────────────────────────────────────
const styles = StyleSheet.create({
  headerGradient: { position: 'absolute', top: 0, left: 0, right: 0, height: 340 },
  completeGradient: { position: 'absolute', left: 0, right: 0, height: 680 },
  completeContent: { flexGrow: 1, paddingHorizontal: 16, paddingBottom: 16, justifyContent: 'center', gap: 20 },
  completeCardBase: { backgroundColor: homeColors.border, borderRadius: 24, paddingBottom: 4 },
  completeCard: { alignItems: 'center', backgroundColor: homeColors.white, borderRadius: 24, paddingHorizontal: 20, paddingVertical: 24, gap: 10 },
  completeMascot: { width: 150, height: 130, alignItems: 'center', justifyContent: 'center' },
  completeBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: homeColors.selected, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 },
  completeBadgeText: { fontFamily: fonts.semibold, fontSize: 13, color: homeColors.deep },
  completeTitle: { fontFamily: fonts.display, fontSize: 36, lineHeight: 46, color: homeColors.darkest, textAlign: 'center' },
  completeCopy: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 22, color: homeColors.muted, textAlign: 'center' },
  completeStats: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', backgroundColor: homeColors.nav, borderRadius: 18, paddingVertical: 14, marginTop: 10 },
  completeStat: { flex: 1, alignItems: 'center', gap: 2 },
  completeNumber: { fontFamily: fonts.display, fontSize: 24, color: homeColors.deep },
  completeStatLabel: { fontFamily: fonts.medium, fontSize: 12, color: homeColors.muted },
  completeDivider: { width: 1, height: 34, backgroundColor: homeColors.border },
  completeActions: { gap: 8 },
  completePrimaryBase: { height: 56, paddingBottom: 4, borderRadius: 28, backgroundColor: homeColors.deep },
  completePrimary: { flex: 1, borderRadius: 28, backgroundColor: homeColors.primary, alignItems: 'center', justifyContent: 'center' },
  completePrimaryText: { fontFamily: fonts.semibold, fontSize: 16, color: homeColors.white },
  completeDone: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  completeDoneText: { fontFamily: fonts.semibold, fontSize: 15, color: homeColors.deep },
  pageSwipeBackground: { position: 'absolute', top: 0, left: 0, right: 0 },
  pageSwipeGradient: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 },
  practiceLayout: { flex: 1 },
  practiceScroll: { flex: 1 },
  practiceScrollContent: { flexGrow: 1, paddingBottom: 8 },
  fixedCardContent: { flexShrink: 1 },
  practiceFooter: { paddingHorizontal: layout.screenInline, paddingTop: 10, paddingBottom: 8 },
  recallComposer: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: layout.screenInline, marginTop: 8, marginBottom: 8, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: homeColors.border, borderRadius: 24, backgroundColor: homeColors.white, boxShadow: `0px 4px 0px ${homeColors.border}` },
  recallComposerInput: { flex: 1, minHeight: 40, maxHeight: 100, paddingVertical: 8, fontFamily: fonts.regular, fontSize: 16, lineHeight: 22, color: homeColors.darkest },
  recallSkip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  recallSkipText: { fontFamily: fonts.semibold, fontSize: 13, color: homeColors.primary },
  recallSubmit: { width: 40, height: 40, borderRadius: 20, backgroundColor: homeColors.primary, alignItems: 'center', justifyContent: 'center' },
  recallSubmitDisabled: { opacity: 0.4 },
  emptyAction: { minHeight: 44, paddingHorizontal: 20, borderRadius: 22, backgroundColor: homeColors.primary, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  emptyActionText: { fontFamily: fonts.semibold, fontSize: 15, color: homeColors.white },
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
    fontFamily: fonts.regular,
  },
  progressRow: { marginHorizontal: layout.screenInline, flexDirection: 'row', alignItems: 'center', gap: 10 },
  progressCount: { fontFamily: fonts.medium, fontSize: 12, color: homeColors.deep },
  progressTrack: { flex: 1, height: 10, backgroundColor: homeColors.track, borderRadius: 6, overflow: 'hidden' },
  progressFill:  { height: '100%', backgroundColor: colors.accent, borderRadius: 5 },

  nav: {
    paddingHorizontal: layout.screenInline, paddingVertical: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: 0, zIndex: 10,
  },
  navButton: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  roundTitle: { fontFamily: fonts.semibold, fontSize: 20, color: homeColors.deep },
  navBack: { fontSize: 14, color: homeColors.deep, fontFamily: fonts.medium },
  navCount: { fontSize: 14, color: homeColors.deep, fontFamily: fonts.medium },

  questionCard: { marginHorizontal: layout.screenInline, marginTop: 16, padding: 20, paddingBottom: 8, borderRadius: 24, backgroundColor: homeColors.white, gap: 20, boxShadow: `0px 4px 0px ${homeColors.border}` },
  fixedQuestionCard: { flex: 1, minHeight: 0 },
  questionArea: { flexGrow: 1, flexShrink: 0, minHeight: 70, justifyContent: 'flex-start', gap: 10, paddingTop: 0, paddingBottom: 12 },
  compactQuestionArea: { flexGrow: 1, flexShrink: 1, minHeight: 100, gap: 6, paddingTop: 0, paddingBottom: 0 },
  questionCenter: { flex: 1, minHeight: 0, justifyContent: 'center', gap: 6 },
  questionTextScroll: { flexGrow: 0, flexShrink: 1 },
  retryBadgeSlot: { height: 20, alignItems: 'flex-start', justifyContent: 'center' },
  retryBadge: { overflow: 'hidden', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, fontFamily: fonts.medium, fontSize: 12, color: colors.warn, backgroundColor: colors.warnL },
  cardTopic: { flexShrink: 1, fontFamily: fonts.medium, fontSize: 14, color: homeColors.muted },
  answerArea: { flexShrink: 1, minHeight: 0, gap: 10 },
  mcqAnswerArea: { flexGrow: 0 },
  answerPrompt: { fontFamily: fonts.medium, fontSize: 14, color: homeColors.muted },
  explanationSlot: { height: 44, marginTop: -14, marginBottom: -6, justifyContent: 'center' },
  explanationToggle: { minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  explanationLink: { fontFamily: fonts.medium, fontSize: 13, color: homeColors.muted },
  backExplanationScroll: { flexShrink: 1, minHeight: 0 },
  backExplanationContent: { gap: 16, paddingBottom: 4 },
  correctAnswerBox: { padding: 16, borderRadius: 16, backgroundColor: homeColors.nav, gap: 8 },
  correctAnswerText: { fontFamily: fonts.semibold, fontSize: 17, lineHeight: 24, color: homeColors.deep },
  explanation: { gap: 8 },
  explanationTitle: { fontFamily: fonts.semibold, fontSize: 14, color: homeColors.deep },
  explanationText: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 23, color: homeColors.darkest },
  qBlock: { paddingHorizontal: layout.screenInline, paddingTop: 24, gap: 8 },
  topicRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  topicText: { flexShrink: 1, fontSize: 14, color: homeColors.deep, fontFamily: fonts.medium },
  modeChip: { paddingHorizontal: 10, paddingVertical: 5, backgroundColor: homeColors.nav, borderRadius: 16 },
  modeChipText: { fontSize: 12, color: homeColors.deep, fontFamily: fonts.semibold },
  qText: {
    fontSize: 30, lineHeight: 40, color: homeColors.deep, fontFamily: fonts.display,
  },

  cta: { minHeight: 56, paddingVertical: 15, borderRadius: 100, backgroundColor: colors.action, alignItems: 'center', justifyContent: 'center', boxShadow: `0px 4px 0px ${homeColors.deep}` },
  ctaDisabled: { opacity: 0.45 },
  reservedInvisible: { opacity: 0 },
  ctaText: { color: colors.onAction, fontSize: 17, fontFamily: fonts.semibold },
});
