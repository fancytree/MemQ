import AsyncStorage from '@react-native-async-storage/async-storage';
import { ledge } from '@/theme/ledge';
import { homeColors } from '@/theme/colors';
import { LinearGradient } from 'expo-linear-gradient';
import { elevation as cardElevation } from '@/theme';
import { layout } from '@/theme/spacing';
import { EdBase } from '@/components/EdBase';
import { Icon } from '@/components/Icon';
import { CloseButton } from '@/components/ui/RoundButtons';
import { Feather } from '@expo/vector-icons';
import { MascotRig } from '@/components/mascot/rig/MascotRig';
import { LanguageCardDetails, PlayButton } from '@/components/LanguageCardFields';
import { ListenPrompt } from '@/components/practice/ListenPrompt';
import { MatchBoard } from '@/components/practice/MatchBoard';
import { SentenceBuilder, isBuiltCorrectly } from '@/components/practice/SentenceBuilder';
import { SpellingResult } from '@/components/practice/SpellingResult';
import { checkMeaning, checkSpelling, type SpellingVerdict } from '@/lib/answerCheck';
import { judgeMeaning } from '@/lib/judgeAnswer';
import { supabase } from '@/lib/supabase';
import { loadCurrentPracticeQuestions } from '@/lib/loadPracticeQuestions';
import type { SavedPracticeQuestion } from '@/lib/practiceQuestions';
import {
  askableSteps, questionFor,
  type ChoiceQuestion, type FlipQuestion as RoundFlipQuestion, type RecallQuestion as RoundRecallQuestion,
  type RoundContext, type RoundQuestion, type RoundTerm, type StepKind,
} from '@/lib/practiceRound';
import { isNewCard, planToday, takeForRound, type PlanProgress } from '@/lib/studyPlan';
import { updateTermProgressSafe } from '@/lib/updateTermProgress';
import { colors, fonts } from '@/theme';
import PracticeSettingsModal, {
  DEFAULT_PRACTICE_SETTINGS, type PracticeSettings,
} from '@/components/PracticeSettingsModal';
import { loadPracticeSettings, savePracticeSettings } from '@/lib/practiceSettings';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, Keyboard, KeyboardAvoidingView, InteractionManager, Modal, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TextInput } from 'react-native';
import { LedgePressable } from '@/components/ui/LedgePressable';
import { MascotState } from '@/components/mascot/MascotState';
import type { MascotStateKind } from '@/components/mascot/states';
import { isOffline } from '@/lib/networkError';
import { practiceDemo } from '@/lib/practiceDemo';
import { MascotLoading } from '@/components/mascot/MascotLoading';

// The questions themselves, and which a card is asked, are decided in
// lib/practiceRound. This screen shows them and keeps the round moving.
type MCQ = ChoiceQuestion;
type RecallQuestion = RoundRecallQuestion;
type FlipQuestion = RoundFlipQuestion;
type QuizQuestion = RoundQuestion;
type QuizTermRow = RoundTerm;
type TermProgressLite = PlanProgress & { term_id: string };

/** What is still to be asked of each card this round, next step first. */
type Queues = Record<string, StepKind[]>;

/** How a typed answer was marked. */
type RecallVerdict = {
  correct: boolean;
  skipped: boolean;
  /** Present when the answer was marked by its letters; carries the slips to show. */
  spelling?: SpellingVerdict;
  /** A meaning marked wrong under relaxed marking can be overruled by the person who wrote it. */
  canOverrule: boolean;
};

const stepsLeft = (queues: Queues) => Object.values(queues).reduce((sum, queue) => sum + queue.length, 0);

/**
 * The next question: starting at `startIdx`, the first card that still has a step to
 * take, asked that step. Going round the cards rather than finishing one at a time is
 * what spaces a card's questions apart within the round.
 *
 * A step that cannot be asked right now — its forms were switched off mid-round, say
 * — is dropped rather than left to block the card, so the queues come back too.
 */
function pickNext(
  terms: QuizTermRow[], queues: Queues, startIdx: number, context: RoundContext, lastVariant: Record<string, string>,
): { q: QuizQuestion | null; termIdx: number; variant: string; queues: Queues } {
  let open = queues;
  const n = terms.length;
  for (let i = 0; i < n; i++) {
    const termIdx = (startIdx + i) % n;
    const term = terms[termIdx];
    while ((open[term.id]?.length ?? 0) > 0) {
      const step = open[term.id][0];
      // Cards waiting to be recognised can be asked together, as a matching question.
      const partners = step === 'recognize'
        ? terms.filter((other) => other.id !== term.id && open[other.id]?.[0] === 'recognize') : [];
      const asked = questionFor(term, step, context, partners, lastVariant[term.id]);
      if (asked) return { q: asked.question, termIdx, variant: asked.variant, queues: open };
      open = { ...open, [term.id]: open[term.id].slice(1) };
    }
  }
  return { q: null, termIdx: 0, variant: '', queues: open };
}

/**
 * Quiz host. One screen shows every kind of question by switching the body of the
 * card and keeping the same header and progress around it.
 *
 * What was answered is saved as it is answered (lib/updateTermProgress); what is on
 * screen — the selection, the typed text, the placed words — is reset on every
 * advance.
 */

/** What a session that could not start says when the reason is the connection. */
const OFFLINE = 'You’re offline. Check your connection and try again.';
/** The side of the picture over a session that could not start. */
const STATE_ART = 176;
/** Which picture goes with which reason. The reasons are the sentences this screen
 * already tells apart by how they begin, to decide where its button leads. */
function stateFor(reason: string): MascotStateKind {
  if (reason === OFFLINE) return 'offline';
  if (reason.startsWith('You’re all caught up')) return 'caughtUp';
  if (reason.startsWith('No ')) return 'empty';
  if (reason.includes('not found')) return 'noResults';
  return 'error';
}

export default function QuizScreen() {
  const { height: windowHeight, fontScale } = useWindowDimensions();
  const swipeProgress = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();
  const [navHeight, setNavHeight] = useState(72);
  const { entry, lessonId } = useLocalSearchParams<{ entry?: string; lessonId?: string }>();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sessionTerms, setSessionTerms] = useState<QuizTermRow[]>([]);
  const [pool, setPool] = useState<QuizTermRow[]>([]);
  const [lessonTopicByLessonId, setLessonTopicByLessonId] = useState<Record<string, string>>({});
  const [queues, setQueues] = useState<Queues>({});
  const [completedSteps, setCompletedSteps] = useState(0);
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
  const [currentQ, setCurrentQ] = useState<QuizQuestion | null>(null);
  const [currentTermIdx, setCurrentTermIdx] = useState(0);
  const [selected, setSelected]       = useState<number | null>(null);
  const [revealed, setRevealed]       = useState(false);
  const [recallText, setRecallText]   = useState('');
  const [verdict, setVerdict]         = useState<RecallVerdict | null>(null);
  /** A typed meaning is being read for sense; the mark is on its way. */
  const [checking, setChecking]       = useState(false);
  const [placed, setPlaced]           = useState<number[]>([]);
  const [flipped, setFlipped]         = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const recallInputRef = useRef<TextInput>(null);
  const explanationAngle = useRef(new Animated.Value(0)).current;
  const explanationTurning = useRef(false);
  /** 首页 quiz：首轮仅今天该学的（到期复习 + 当日新卡额度）；之后递增，放开到全部卡片 */
  const [quizRound, setQuizRound]     = useState(0);
  const [practiceComplete, setPracticeComplete] = useState(false);
  /** This round asks every kind of question, because the kinds switched on had nothing to ask. */
  const [everyKindRound, setEveryKindRound] = useState(false);

  /** What the round remembers that is not drawn: which cards have had their second go
   *  at a missed step, and the form each was last asked in. */
  const round = useRef({ retried: {} as Record<string, boolean>, lastVariant: {} as Record<string, string> });
  /** Counts questions shown, so an answer to a slow check is not applied to the next question. */
  const shown = useRef(0);
  /** A typed answer's mark, held until the person moves on: until then they may overrule it. */
  const pending = useRef<{ termId: string; correct: boolean } | null>(null);

  const engineRef = useRef({
    sessionTerms: [] as QuizTermRow[],
    pool: [] as QuizTermRow[],
    lessonTopicByLessonId: {} as Record<string, string>,
    queues: {} as Queues,
    completedSteps: 0,
    currentTermIdx: 0,
    modes: DEFAULT_PRACTICE_SETTINGS.modes,
  });
  useEffect(() => {
    engineRef.current = {
      sessionTerms,
      pool,
      lessonTopicByLessonId,
      queues,
      completedSteps,
      currentTermIdx,
      modes: everyKindRound ? DEFAULT_PRACTICE_SETTINGS.modes : settings.modes,
    };
  });
  /** What questions are built from, as things stand now: a kind switched off mid-round
   *  stops being asked from the next question on. */
  const roundContext = (): RoundContext => {
    const e = engineRef.current;
    return { modes: e.modes, topicByLesson: e.lessonTopicByLessonId, pool: e.pool };
  };

  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  useEffect(() => {
    if (loading || practiceComplete || currentQ?.mode !== 'recall' || revealed || checking) return;
    const task = InteractionManager.runAfterInteractions(() => recallInputRef.current?.focus());
    return () => task.cancel();
  }, [loading, practiceComplete, currentQ, revealed, checking]);

  // Answers are saved as they are given and nothing waits for them, except leaving:
  // see handleClose.
  const saving = useRef(new Set<Promise<void>>());
  const updateTermProgress = async (termId: string, isCorrect: boolean) => {
    if (__DEV__ && entry === 'demo') return;
    const save = updateTermProgressSafe(termId, isCorrect);
    saving.current.add(save);
    try { await save; } finally { saving.current.delete(save); }
  };
  const updateTermProgressRef = useRef(updateTermProgress);
  updateTermProgressRef.current = updateTermProgress;
  /** Save the typed answer's mark as it now stands. */
  const flushPending = () => {
    const held = pending.current;
    if (!held) return;
    pending.current = null;
    void updateTermProgress(held.termId, held.correct);
  };
  /** A finished matching board moves on by itself, after a beat. */
  const matchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (matchTimer.current) clearTimeout(matchTimer.current); }, []);
  // Leaving by any road — the close button, a swipe back — still records it.
  useEffect(() => () => {
    const held = pending.current;
    if (held) { pending.current = null; void updateTermProgressRef.current(held.termId, held.correct); }
  }, []);

  useEffect(() => {
    if (!settingsReady) return;
    const clearLocalSession = () => {
      setSessionTerms([]);
      setPool([]);
      setLessonTopicByLessonId({});
      setQueues({});
      setCompletedSteps(0);
      setCurrentQ(null);
      setCurrentTermIdx(0);
      round.current = { retried: {}, lastVariant: {} };
    };

    const loadRealQuizData = async () => {
      try {
        setLoading(true);
        setLoadError(null);
        clearLocalSession();

        // Development only: a round of fixture cards, with no account behind it.
        const demo = __DEV__ && entry === 'demo' ? practiceDemo() : null;

        const { data: { user } } = demo ? { data: { user: { id: 'demo' } } } : await supabase.auth.getUser();
        if (!user) {
          setLoadError('Please log in first.');
          return;
        }

        const { data: lessonsData, error: lessonsError } = demo ? { data: demo.lessons, error: null } : await supabase
          .from('lessons')
          .select('id, name, learning_mode, deadline')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (lessonsError || !lessonsData) {
          setLoadError(isOffline(lessonsError) ? OFFLINE : 'Could not load your lessons. Please try again.');
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

        const { data: termsData, error: termsError } = demo ? { data: demo.terms, error: null } : await supabase
          .from('terms')
          .select('id, lesson_id, term, definition, explanation, language_data')
          .in('lesson_id', lessonIds)
          .order('created_at', { ascending: false });

        if (termsError) {
          setLoadError(isOffline(termsError) ? OFFLINE : 'Failed to load terms.');
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
        const { data: progressData } = demo ? { data: demo.progress } :
          termIds.length > 0
            ? await supabase
                .from('user_term_progress')
                .select('term_id, status, next_review_at, last_reviewed_at, created_at, step_index')
                .eq('user_id', user.id)
                .in('term_id', termIds)
            : { data: [] as TermProgressLite[] };

        const progressMap = new Map<string, TermProgressLite>(
          (progressData || []).map((p) => [p.term_id, p as TermProgressLite]),
        );

        if (usableTerms.length === 0) {
          setLoadError(
            entryType === 'home'
              ? 'No cards available for review.'
              : 'No terms in this lesson. Add at least one term with a definition.',
          );
          return;
        }

        /*
         * ─── Quiz 当轮总流程（中文）───
         * 1）选词（lib/studyPlan）：按“今天该做什么”排序，而不是随机抽——
         *    到期复习在前（deadline 最近、掌握最弱、拖得最久的优先），然后是今天的新卡额度
         *    （有 deadline 时按剩余天数分摊，并预留最后一段时间专门复习）。
         *    首页首轮只出这些；之后的轮次和课程内练习再放开到额度外的新卡与未到期的卡。
         * 2）每张卡的步骤（lib/practiceRound）：掌握得越好，题越少越难——
         *    新卡：看卡 → 辨认 → 产出；Learning/Familiar：辨认 → 产出；Good 及以上：只产出。
         * 3）混排：多张卡轮流出题；几张卡同时等待“辨认”时可以合成一道连线题。
         * 4）答错：该步骤在本轮稍后再来一次（仅一次），不卡关。
         * 5）进度：是否升级由 lib/scheduler 决定——只有到期的卡答对才升级，一轮内只升一次。
         */
        const plan = planToday(
          targetLessons.map((lesson) => ({ id: lesson.id, deadline: lesson.deadline })),
          usableTerms.map((term) => ({ id: term.id, lessonId: term.lesson_id, progress: progressMap.get(term.id) })),
        );
        const todayOnly = entryType === 'home' && quizRound === 0;
        const orderedIds = todayOnly ? plan.queue : [...plan.queue, ...plan.extraNew, ...plan.early];

        if (orderedIds.length === 0) {
          setLoadError('You’re all caught up. Choose a lesson to keep practicing.');
          return;
        }

        const termById = new Map(usableTerms.map((term) => [term.id, term]));
        const stageOf = (termId: string) => {
          const progress = progressMap.get(termId);
          return isNewCard(progress) ? 0 : progress?.step_index ?? 0;
        };
        const pickedTerms = takeForRound(
          orderedIds.map((id) => termById.get(id)).filter((term): term is QuizTermRow => !!term),
          (term) => stageOf(term.id),
        );
        // Weakest first, so the cards being met for the first time are met at the start.
        const orderedTerms = pickedTerms
          .map((term, index) => ({ term, index }))
          .sort((a, b) => stageOf(a.term.id) - stageOf(b.term.id) || a.index - b.index)
          .map(({ term }) => term);

        // Load the LLM-authored questions for selected cards; older cards may have none.
        const { data: practiceRows, error: practiceError } = demo ? { data: [], error: null } : await loadCurrentPracticeQuestions(orderedTerms.map((term) => term.id));
        if (practiceError) {
          setLoadError(isOffline(practiceError) ? OFFLINE : 'Could not load practice questions. Please try again.');
          return;
        }
        const questionsByTerm = new Map<string, SavedPracticeQuestion[]>();
        for (const row of practiceRows || []) {
          const entries = questionsByTerm.get(row.term_id) || [];
          entries.push(row);
          questionsByTerm.set(row.term_id, entries);
        }
        const termsWithQuestions = orderedTerms.map((term) => ({ ...term, practiceQuestions: questionsByTerm.get(term.id) || [] }));

        const topics: Record<string, string> = {};
        lessonMap.forEach((name, id) => {
          topics[id] = name;
        });
        const layOut = (modes: PracticeSettings['modes']) => {
          const context: RoundContext = { modes, topicByLesson: topics, pool: usableTerms };
          const initialQueues: Queues = {};
          termsWithQuestions.forEach((term) => {
            initialQueues[term.id] = askableSteps(term, stageOf(term.id), context, termsWithQuestions);
          });
          return pickNext(termsWithQuestions, initialQueues, 0, context, {});
        };
        // The kinds switched on may have nothing to ask of these cards — only listening
        // and matching, say, in a lesson that is not a language. Practising them with
        // every kind is better than a round that cannot start.
        let first = layOut(settings.modes);
        const everyKind = !first.q;
        if (everyKind) first = layOut(DEFAULT_PRACTICE_SETTINGS.modes);
        if (!first.q) {
          setLoadError('Could not build quiz session.');
          return;
        }
        setEveryKindRound(everyKind);

        round.current = { retried: {}, lastVariant: { [first.q.termId]: first.variant } };
        shown.current += 1;
        // Only the cards this round has something to ask of: the rest would be counted
        // at the end as practised without ever having been shown.
        setSessionTerms(termsWithQuestions.filter((term) => (first.queues[term.id]?.length ?? 0) > 0));
        setPool(usableTerms);
        setLessonTopicByLessonId(topics);
        setQueues(first.queues);
        setCompletedSteps(0);
        setCurrentQ(first.q);
        setCurrentTermIdx(first.termIdx);
      } catch (failure) {
        setLoadError(isOffline(failure) ? OFFLINE : 'Failed to initialize quiz.');
        clearLocalSession();
      } finally {
        setLoading(false);
      }
    };

    loadRealQuizData();
    // `settings` is deliberately not a dependency: changing what a round asks should
    // not tear down the round being answered. It takes effect from the next question.
  }, [entry, lessonId, quizRound, settingsReady]);

  const q = currentQ;
  const totalSteps = Math.max(1, completedSteps + stepsLeft(queues));

  const handleClose = async () => {
    const destination = entry === 'lesson' && lessonId
      ? { pathname: '/lessons/[id]' as const, params: { id: lessonId } }
      : '/(tabs)' as const;
    flushPending();
    // The screen being returned to reads its numbers the moment it is back in front
    // — the streak among them, which this session may just have added a day to. An
    // answer still on its way to the server would not be counted, so the last of
    // them are given a moment to land. Not long: leaving must not hang on a network.
    if (saving.current.size) {
      await Promise.race([
        Promise.allSettled(Array.from(saving.current)),
        new Promise((done) => setTimeout(done, 1200)),
      ]);
    }
    // Dismiss every stacked practice screen, returning to the entry screen in one action.
    if (router.canDismiss()) router.dismissTo(destination);
    else router.replace(destination);
  };

  if (loading) {
    return (
      <EdBase bottomInset={0} scroll={false}>
        <View style={styles.nav}><CloseButton onPress={handleClose} label="Close practice" /></View>
        <MascotLoading label="Getting your cards…" />
      </EdBase>
    );
  }
  if (loadError) {
    return (
      <EdBase bottomInset={0} scroll={false}>
        <View style={styles.nav}><CloseButton onPress={handleClose} label="Close practice" /></View>
        <View style={styles.loadingWrap}>
          <MascotState kind={stateFor(loadError)} width={STATE_ART} style={styles.stateArt} />
          <Text style={[styles.loadingText, styles.stateText]}>{loadError}</Text>
          <LedgePressable accessibilityRole="button" onPress={() => {
            if (entry === 'lesson' && lessonId && loadError.startsWith('No terms')) router.replace(`/lessons/${lessonId}/add-terms`);
            else if (entry === 'home' && (loadError.startsWith('No cards') || loadError.startsWith('You’re all caught up'))) router.replace('/(tabs)/library');
            else handleClose();
          }} style={styles.emptyAction}><View style={styles.emptyActionFace}><Text style={styles.emptyActionText}>{entry === 'lesson' && lessonId && loadError.startsWith('No terms') ? 'Add cards' : entry === 'home' && (loadError.startsWith('No cards') || loadError.startsWith('You’re all caught up')) ? 'View lessons' : 'Go back'}</Text></View></LedgePressable>
        </View>
      </EdBase>
    );
  }
  if (practiceComplete) {
    return <PracticeComplete cards={sessionTerms.length} steps={completedSteps} onClose={handleClose} onContinue={() => {
      setLoading(true);
      setPracticeComplete(false);
      setQuizRound((round) => round + 1);
    }} />;
  }
  if (!q || sessionTerms.length === 0) {
    return (
      <EdBase bottomInset={0} scroll={false}>
        <View style={styles.nav}><CloseButton onPress={handleClose} label="Close practice" /></View>
        <View style={styles.loadingWrap}>
          <MascotState kind="empty" width={STATE_ART} style={styles.stateArt} />
          <Text style={[styles.loadingText, styles.stateText]}>No quiz data available.</Text>
          <LedgePressable accessibilityRole="button" onPress={handleClose} style={styles.emptyAction}><View style={styles.emptyActionFace}><Text style={styles.emptyActionText}>Go back</Text></View></LedgePressable>
        </View>
      </EdBase>
    );
  }

  const progressPct = Math.min(100, (completedSteps / totalSteps) * 100);

  const reset = () => {
    shown.current += 1;
    setSelected(null);
    setRevealed(false);
    setRecallText('');
    setVerdict(null);
    setChecking(false);
    setPlaced([]);
    setFlipped(false);
    explanationAngle.stopAnimation();
    explanationAngle.setValue(0);
    explanationTurning.current = false;
    setShowExplanation(false);
  };

  /** Show whatever comes next given these queues, or finish the round. */
  const moveOn = (nextQueues: Queues, done: number) => {
    const e = engineRef.current;
    const n = e.sessionTerms.length;
    const picked = pickNext(e.sessionTerms, nextQueues, n ? (e.currentTermIdx + 1) % n : 0, roundContext(), round.current.lastVariant);
    reset();
    setQueues(picked.queues);
    setCompletedSteps(e.completedSteps + done);
    if (!picked.q) {
      setPracticeComplete(true);
      return;
    }
    round.current.lastVariant[picked.q.termId] = picked.variant;
    setCurrentQ(picked.q);
    setCurrentTermIdx(picked.termIdx);
  };

  /**
   * Move on from the question just answered. A card that got it right has taken that
   * step. A card that got it wrong keeps the step and is asked it again later in the
   * round — once, and only if there is something else to ask in between, since being
   * asked again straight away is reading the answer back, not remembering it.
   * 答错不卡关：第二次不论对错都继续。
   */
  const advance = (results: { termId: string; correct: boolean }[]) => {
    const e = engineRef.current;
    const next: Queues = { ...e.queues };
    let done = 0;
    for (const { termId, correct } of results) {
      const queue = next[termId] ?? [];
      if (queue.length === 0) continue;
      const othersWaiting = e.sessionTerms.some((term) => term.id !== termId && (next[term.id]?.length ?? 0) > 0);
      if (!correct && !round.current.retried[termId] && othersWaiting) {
        round.current.retried[termId] = true;
        continue;
      }
      next[termId] = queue.slice(1);
      done += 1;
    }
    moveOn(next, done);
  };

  /** Trade a question that has to be heard for one that can be read, unmarked. */
  const cannotListen = () => {
    const e = engineRef.current;
    const term = e.sessionTerms.find((item) => item.id === q.termId);
    const step = e.queues[q.termId]?.[0];
    if (!term || !step) return;
    const quiet = { ...roundContext(), modes: { ...e.modes, listen: false } };
    const asked = questionFor(term, step, quiet);
    if (asked) {
      reset();
      round.current.lastVariant[term.id] = asked.variant;
      setCurrentQ(asked.question);
      return;
    }
    // Nothing else can ask this step: let it go.
    moveOn({ ...e.queues, [q.termId]: e.queues[q.termId].slice(1) }, 0);
  };

  /** Mark a typed answer. Letters are marked here; a meaning the words leave open is
   *  read for sense by the judge, and until it answers the card says it is checking. */
  const submitRecall = async (question: RecallQuestion, skipped = false) => {
    Keyboard.dismiss();
    const settle = (next: RecallVerdict) => {
      pending.current = { termId: question.termId, correct: next.correct };
      setVerdict(next);
      setChecking(false);
      setRevealed(true);
    };
    if (question.answerKind === 'spelling') {
      const spelling = checkSpelling(skipped ? '' : recallText, question.answer, settings.grading);
      settle({ correct: !skipped && spelling.result !== 'wrong', skipped, spelling, canOverrule: false });
      return;
    }
    if (skipped) {
      settle({ correct: false, skipped: true, canOverrule: false });
      return;
    }
    const relaxed = settings.grading === 'relaxed';
    const local = checkMeaning(recallText, question.answer, settings.grading);
    if (local.result === 'correct' || local.confident || !relaxed) {
      settle({ correct: local.result === 'correct', skipped: false, canOverrule: relaxed && local.result !== 'correct' });
      return;
    }
    const asked = shown.current;
    setChecking(true);
    const judged = await judgeMeaning(question.q, question.answer, recallText);
    if (shown.current !== asked) return;
    settle({ correct: judged === true, skipped: false, canOverrule: judged !== true });
  };

  const overrule = () => {
    if (!verdict || !pending.current) return;
    pending.current = { ...pending.current, correct: true };
    setVerdict({ ...verdict, correct: true, canOverrule: false });
  };

  const isAudio = (q.mode === 'mcq' || q.mode === 'recall') && !!q.audio;
  const mcqRight = q.mode === 'mcq' && selected === q.correct;
  const buildRight = q.mode === 'build' && isBuiltCorrectly(q, placed);
  /** The card can be turned over for the answer and its explanation. */
  const canExplain = q.mode === 'mcq' || q.mode === 'recall' || q.mode === 'build';
  const correctAnswerText = q.mode === 'mcq' ? q.opts[q.correct] : q.mode === 'recall' ? q.answer : q.mode === 'build' ? q.answer.join(' ') : '';
  const chip = q.mode === 'match' ? 'Match' : q.mode === 'build' ? 'Build' : q.mode === 'flip' ? '' : q.chip;
  const questionText = q.mode === 'match' || q.mode === 'flip' ? '' : q.q;
  /** A question that is a sentence or a definition, not a word, is set smaller. */
  const longQuestion = q.mode === 'build'
    || (q.mode === 'mcq' && (q.variant === 'reverse' || q.variant === 'gap'))
    || (q.mode === 'recall' && q.variant === 'spelling');
  /** Hearing the word is offered where it would not give the answer away. */
  const showPlay = q.mode !== 'match' && q.mode !== 'flip' && !!q.languageData && !!q.termText
    && (revealed || (!isAudio && q.q === q.termText));

  const checkDisabled = checking ||
    (!revealed &&
      ((q.mode === 'mcq' && selected === null) ||
        (q.mode === 'build' && placed.length !== q.tiles.length) ||
        (q.mode === 'recall' && !recallText.trim())));
  /** Choosing answers itself; the button only appears to move on. */
  const footerWaiting = q.mode === 'mcq' && !revealed;

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
    if (checking) return;
    if (!revealed) {
      if (q.mode === 'recall') {
        if (recallText.trim()) void submitRecall(q);
      } else if (q.mode === 'build') {
        if (placed.length !== q.tiles.length) return;
        void updateTermProgress(q.termId, isBuiltCorrectly(q, placed));
        setRevealed(true);
      }
      return;
    }
    // 中文：答错也已写入进度；仍推进流程，不卡关
    flushPending();
    if (q.mode === 'mcq') advance([{ termId: q.termId, correct: selected === q.correct }]);
    else if (q.mode === 'recall') advance([{ termId: q.termId, correct: !!verdict?.correct }]);
    else if (q.mode === 'build') advance([{ termId: q.termId, correct: isBuiltCorrectly(q, placed) }]);
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
      <View style={styles.progressRow} accessibilityRole="progressbar" accessibilityLabel="Practice progress" accessibilityValue={{ min: 0, max: totalSteps, now: completedSteps }}>
        <Text style={styles.progressCount}>{completedSteps}</Text><View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${progressPct}%` }]} /></View><Text style={styles.progressCount}>{totalSteps}</Text>
      </View>

      <ScrollView style={styles.practiceScroll} contentContainerStyle={[styles.practiceScrollContent, q.mode !== 'flip' && styles.fixedCardContent]} scrollEnabled={q.mode === 'flip'} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      {q.mode !== 'flip' ? (
        <Animated.View style={[styles.fixedQuestionCard, { transform: [{ perspective: 1000 }, { rotateY: explanationRotation }] }]}>
        <View style={[styles.questionCard, styles.fixedQuestionCard, q.mode === 'match' && styles.matchCard]}>
          <View style={[styles.questionArea, styles.compactQuestionArea, (q.mode === 'match' || q.mode === 'build') && styles.briefQuestionArea]}>
            <View style={styles.topicRow}><Text numberOfLines={2} style={styles.cardTopic}>{q.topic}</Text><View style={styles.modeChip}><Text style={styles.modeChipText}>{chip}</Text></View></View>
            {/* A matching board is its own question: the card is all board. */}
            {q.mode !== 'match' && <View style={q.mode === 'build' ? styles.briefQuestionCenter : styles.questionCenter}>
              {q.mode === 'mcq' && <View style={styles.retryBadgeSlot}>{revealed && !mcqRight && <Text style={styles.retryBadge}>Let’s try again</Text>}</View>}
              {isAudio && !revealed
                ? <ListenPrompt key={`${q.termId}-${shown.current}`} text={q.termText || q.q} languageCode={q.languageData?.language_code} onCannotListen={checking ? undefined : cannotListen} />
                : <ScrollView style={[styles.questionTextScroll, q.mode !== 'mcq' && { maxHeight: 120 * fontScale }]} nestedScrollEnabled showsVerticalScrollIndicator><Text style={[styles.qText, longQuestion && styles.qTextLong]}>{questionText}</Text></ScrollView>}
              {showPlay && <PlayButton text={q.termText!} languageCode={q.languageData?.language_code} label={`Play ${q.termText}`} />}
            </View>}
          </View>
          {showExplanation && revealed && canExplain ? <View style={styles.answerArea}>
            <ScrollView style={styles.backExplanationScroll} nestedScrollEnabled showsVerticalScrollIndicator>
              <View style={styles.backExplanationContent}>
                <View style={styles.correctAnswerBox}><Text style={styles.explanationTitle}>Correct answer</Text><Text style={styles.correctAnswerText}>{correctAnswerText}</Text></View>
                <View style={styles.explanation}><Text style={styles.explanationTitle}>Explanation</Text><Text style={styles.explanationText}>{q.explain?.trim() || 'No explanation available for this card yet.'}</Text></View>
                {q.languageData && <LanguageCardDetails data={q.languageData} />}
              </View>
            </ScrollView>
            <Pressable accessibilityRole="button" accessibilityLabel="Return to answers" onPress={flipExplanation} hitSlop={10} style={styles.explanationToggle}><Text style={styles.explanationLink}>Tap to see your answer again</Text></Pressable>
          </View> : <View style={[styles.answerArea, q.mode === 'mcq' && styles.mcqAnswerArea, q.mode === 'match' && styles.matchAnswerArea]}>
            {q.mode === 'mcq' && <>
              <Text style={[styles.answerPrompt, revealed && { color: mcqRight ? colors.green : colors.warn }]}>{revealed ? (mcqRight ? 'You got it!' : 'Keep going — learning takes practice.') : q.prompt}</Text>
              <MCQView q={q} selected={selected} revealed={revealed} onSelect={(i) => {
                if (revealed) return;
                setSelected(i);
                setRevealed(true);
                void updateTermProgress(q.termId, i === q.correct);
              }} />
            </>}
            {q.mode === 'match' && <MatchBoard key={`${q.termId}-${shown.current}`} question={q} onDone={(results) => {
              // Every pair made: nothing to press. What was matched is recorded and
              // the round moves on after a beat, long enough to see the last pair go.
              results.forEach((result) => { void updateTermProgress(result.termId, result.correct); });
              const asked = shown.current;
              matchTimer.current = setTimeout(() => {
                matchTimer.current = null;
                if (shown.current === asked) advance(results);
              }, 450);
            }} />}
            {q.mode === 'build' && <>
              <Text style={[styles.answerPrompt, revealed && { color: buildRight ? colors.green : colors.warn }]}>{revealed ? (buildRight ? 'You got it!' : 'Keep going — learning takes practice.') : 'Tap the words in order'}</Text>
              <SentenceBuilder question={q} placed={placed} onChange={setPlaced} revealed={revealed} correct={buildRight} />
            </>}
            {q.mode === 'recall' && (checking
              ? <View style={styles.checking} accessibilityLiveRegion="polite"><ActivityIndicator size="small" color={colors.accentText} /><Text style={styles.checkingText}>Checking your answer…</Text></View>
              : revealed && verdict ? <RecallResult q={q} recallText={recallText} verdict={verdict} onOverrule={overrule} /> : null)}
            {(q.mode === 'mcq' || (revealed && canExplain)) && <View pointerEvents={revealed ? 'auto' : 'none'} style={styles.explanationSlot}>
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
            void updateTermProgress(q.termId, isCorrect);
            if (engineRef.current.sessionTerms.length === 0) return;
            advance([{ termId: q.termId, correct: isCorrect }]);
          }}
        />
      )}

      </ScrollView>
      {/* The recall composer stays above the keyboard; feedback uses the fixed Continue action. */}
      {q.mode === 'recall' && !revealed && !checking ? <View style={styles.recallComposer}>
        <TextInput key={q.answerKind} ref={recallInputRef} accessibilityLabel={q.placeholder} value={recallText} onChangeText={setRecallText} placeholder={q.placeholder} placeholderTextColor={homeColors.muted} multiline style={styles.recallComposerInput}
          // Spelling is the exercise: the keyboard must not correct it or capitalise it.
          {...(q.answerKind === 'spelling' ? { autoCapitalize: 'none' as const, autoCorrect: false, spellCheck: false, autoComplete: 'off' as const } : {})} />
        <Pressable accessibilityRole="button" accessibilityLabel="Don't know" onPress={() => { void submitRecall(q, true); }} style={styles.recallSkip}><Text style={styles.recallSkipText}>Don’t know</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Submit answer" accessibilityState={{ disabled: checkDisabled }} disabled={checkDisabled} onPress={onCheckOrNext} style={[styles.recallSubmit, checkDisabled && styles.recallSubmitDisabled]}><Icon name="arrowRight" size={20} color={homeColors.white} strokeWidth={2} /></Pressable>
      </View> : q.mode !== 'flip' && q.mode !== 'match' && <View style={styles.practiceFooter} pointerEvents={footerWaiting ? 'none' : 'auto'} accessibilityElementsHidden={footerWaiting} importantForAccessibility={footerWaiting ? 'no-hide-descendants' : 'auto'}>
        <LedgePressable accessibilityRole="button" accessibilityState={{ disabled: checkDisabled }} onPress={onCheckOrNext} disabled={checkDisabled} style={[styles.cta, checkDisabled && styles.ctaDisabled, footerWaiting && styles.reservedInvisible]}><View style={styles.ctaFace}><Text style={styles.ctaText}>{checking ? 'Checking…' : q.mode === 'build' && !revealed ? 'Check' : 'Continue →'}</Text></View></LedgePressable>
      </View>}
      </KeyboardAvoidingView>
      <PracticeSettingsModal visible={settingsOpen} settings={settings}
        onChange={updateSettings} onClose={() => setSettingsOpen(false)} />
    </EdBase>
  );
}

/** The mascot on the finish card, celebrating in the rig's own pose rather than a
 * picture of one. */
const COMPLETE_MASCOT = 132;

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
          <View style={styles.completeMascot}><Animated.View style={{ transform: [{ translateY: mascotCelebrate.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }, { scale: mascotCelebrate.interpolate({ inputRange: [0, 1], outputRange: [0.74, 1] }) }] }}><MascotRig width={COMPLETE_MASCOT} mood="learningComplete" /></Animated.View></View>
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
        <LedgePressable accessibilityRole="button" onPress={onContinue} style={styles.completePrimaryBase}><View style={styles.completePrimary}><Text style={styles.completePrimaryText}>Keep practicing</Text></View></LedgePressable>
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
          {/* Options are held to two lines when they are built (LIMITS.option in lib/practiceRound);
              the cap here is for a large text size, not a way of fitting long ones. */}
          <Text numberOfLines={4} style={mcqStyles.optText}>{opt}</Text>
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
function RecallResult({ q, recallText, verdict, onOverrule }: { q: RecallQuestion; recallText: string; verdict: RecallVerdict; onOverrule: () => void }) {
  // Marked by its letters: shown back with every slip picked out.
  if (verdict.spelling) return <SpellingResult verdict={verdict.spelling} skipped={verdict.skipped} />;
  const { correct, skipped } = verdict;
  const differs = recallText.trim().toLocaleLowerCase() !== q.answer.trim().toLocaleLowerCase();
  return <View style={recallStyles.result}>
    <Text style={[recallStyles.resultLabel, { color: correct ? colors.green : colors.warn }]}>{skipped ? 'Give this one another try later' : correct ? 'You got it!' : 'Keep going — learning takes practice.'}</Text>
    <View style={[recallStyles.resultAnswer, { borderColor: correct ? colors.green : homeColors.quizWrongOutline }]}><Text style={recallStyles.resultText}>{skipped ? 'Skipped' : recallText}</Text></View>
    {/* A right answer in other words is still worth comparing with the card's own. */}
    {(!correct || differs) && <><Text style={[recallStyles.resultLabel, { color: colors.green }]}>{correct ? 'On the card' : 'Correct answer'}</Text><View style={[recallStyles.resultAnswer, { borderColor: colors.green }]}><Text style={recallStyles.resultText}>{q.answer}</Text></View></>}
    {verdict.canOverrule && !correct && <Pressable accessibilityRole="button" accessibilityHint="Counts this answer as right" onPress={onOverrule} hitSlop={6} style={recallStyles.overrule}><Text style={recallStyles.overruleText}>My answer means the same</Text></Pressable>}
  </View>;
}
const recallStyles = StyleSheet.create({
  result: { gap: 8 },
  resultLabel: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20 },
  resultAnswer: { minHeight: 52, justifyContent: 'center', borderWidth: 1.5, borderRadius: 16, backgroundColor: homeColors.white, paddingHorizontal: 16, paddingVertical: 10 },
  resultText: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 23, color: homeColors.darkest },
  overrule: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center' },
  overruleText: { fontFamily: fonts.semibold, fontSize: 14, color: homeColors.primary },
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
            <LedgePressable accessibilityRole="button" onPress={dismissGuide} style={flipStyles.guideButton}><View style={flipStyles.guideFace}><Text style={flipStyles.guideButtonText}>Got it</Text></View></LedgePressable>
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
  guideButton: { height: 52 + ledge.lead, borderRadius: 26, backgroundColor: homeColors.deep, paddingBottom: ledge.lead },
  guideFace: { flex: 1, borderRadius: 26, backgroundColor: homeColors.primary, alignItems: 'center', justifyContent: 'center' },
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
      <MascotRig width={76} mood={tone === 'right' ? 'happy' : 'thinking'} />
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
  // Lipped like Library's empty-state button, so every "nothing here" offers the
  // same kind of way out.
  emptyAction: { borderRadius: 24, backgroundColor: homeColors.deep, paddingBottom: 3, marginTop: 8 },
  emptyActionFace: { minHeight: 45, paddingHorizontal: 20, borderRadius: 24, backgroundColor: homeColors.primary, alignItems: 'center', justifyContent: 'center' },
  emptyActionText: { fontFamily: fonts.semibold, fontSize: 15, color: homeColors.white },
  stateArt: { marginBottom: 14 },
  stateText: { fontSize: 15, lineHeight: 22, textAlign: 'center', maxWidth: 300, color: colors.text },
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
  qTextLong: { fontSize: 20, lineHeight: 29, fontFamily: fonts.semibold },
  // Matching and building need the card for the answer, so the question takes only
  // the room its one line needs instead of half the card.
  briefQuestionArea: { flexGrow: 0, flexShrink: 0, minHeight: 0 },
  briefQuestionCenter: { gap: 6 },
  // Matching has no button under it, so its card runs to the bottom of the screen
  // (the home indicator's inset is kept by the screen itself) and the board fills it.
  matchCard: { paddingBottom: 20, gap: 14 },
  matchAnswerArea: { flex: 1 },
  checking: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkingText: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20, color: homeColors.muted },

  // It had a lip painted on as a shadow, which stayed put when pressed; now the lip
  // is the shell showing under the face, and pressing uses it up.
  cta: { height: 56 + ledge.lead, borderRadius: 100, backgroundColor: homeColors.deep, paddingBottom: ledge.lead },
  ctaFace: { flex: 1, borderRadius: 100, backgroundColor: colors.action, alignItems: 'center', justifyContent: 'center' },
  ctaDisabled: { opacity: 0.45 },
  reservedInvisible: { opacity: 0 },
  ctaText: { color: colors.onAction, fontSize: 17, fontFamily: fonts.semibold },
});
