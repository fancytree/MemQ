import { componentTokens, hairline } from '@/theme';
import { layout, space, radius } from '@/theme/spacing';
import { LessonCover } from '@/components/LessonCover';
import LoadingScreen from '@/components/LoadingScreen';
import { colors, lessonCoverPalettes } from '@/theme/colors';
import { fonts, oneLine, type } from '@/theme/typography';
import { Sheet } from '@/components/ui/Sheet';
import { HomeAsset } from '@/components/HomeAsset';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { MascotRig, type MascotMood } from '@/components/mascot/rig/MascotRig';
import { loadFromCache, saveToCache } from '@/lib/cache';
import { activityDaysFromProgressUpdates, computeCurrentStreak } from '@/lib/streak';
import { supabase } from '@/lib/supabase';
import { deadlineLeft, estimateMinutes as minutesFor, planToday } from '@/lib/studyPlan';
import { buildLatestProgressMap } from '@/lib/termProgress';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect, useIsFocused } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Reanimated, { useAnimatedProps } from 'react-native-reanimated';
import { CountUp, ProgressFill, useEased } from '@/components/motion/Grow';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/Button';
import { StreakPill } from '@/components/ui/StreakPill';

interface LessonSummary {
  id: string;
  title: string;
  sub: string;
  cards: number;
  due: number;
  totalDue: number;
  pct: number;
  deadline: string | null;
  learningMode?: 'language' | 'knowledge';
  coverStyle?: string | null;
  /** When this lesson was last touched, in ms: the latest review of any of its
   * cards, or failing that when it was made. Absent on a list cached before this
   * was recorded. */
  recent?: number;
}

/** How many lessons Continue Learning lists. The rest are in the library. */
const CONTINUE_MAX = 5;

const LEARNING_STAGE_WEIGHTS: Record<string, number> = {
  New: 0,
  Learning: 0.2,
  Familiar: 0.4,
  Good: 0.6,
  Strong: 0.8,
  Mastered: 1.0,
};

const getStatusWeight = (status: string | null | undefined): number => {
  if (!status || status === 'New') return LEARNING_STAGE_WEIGHTS.New;
  return LEARNING_STAGE_WEIGHTS[status] ?? LEARNING_STAGE_WEIGHTS.New;
};

/** The ring over Today's goal, drawn rather than imported.
 *
 * The exported asset was one fixed arc — a picture of a progress ring, sitting above
 * a number that was already telling the truth. Same geometry as that asset: a 30 by
 * 30 box, a radius of 13 and a 4-unit stroke, the white track underneath, starting
 * at twelve o'clock and going clockwise.
 *
 * Tile and arc are one colour at two strengths, which is the rule the other two
 * tiles on this card already follow: a pale ground under a saturated mark. The asset
 * broke it — the hills' yellow on a white track on a tile filled with 36% of that
 * same yellow, three layers of one hue with no strength between them, so the arc
 * went missing. Green here, pale under deep, and green is what finishing something
 * means everywhere else in the app.
 *
 * Past the goal it stays full rather than wrapping: the number beside it already says
 * 70/20, and a ring that laps itself would show 10/20's worth of arc on a day that
 * went well. */
function GoalRing({ done, goal }: { done: number; goal: number }) {
  const r = 13;
  const circumference = 2 * Math.PI * r;
  const at = goal > 0 ? Math.max(0, Math.min(1, done / goal)) : 0;
  // The arc sweeps round to where today has got to, as the number beside it counts.
  const swept = useEased(at, 250);
  const arc = useAnimatedProps(() => ({ strokeDasharray: [circumference * swept.value, circumference] }));
  return (
    <Svg width={30} height={30} viewBox="0 0 30 30">
      <Circle cx={15} cy={15} r={r} fill="none" stroke={colors.surf} strokeWidth={4} />
      {at > 0 && (
        <RingArc cx={15} cy={15} r={r} fill="none" stroke={colors.green} strokeWidth={4}
          strokeLinecap="round" animatedProps={arc}
          transform="rotate(-90 15 15)" />
      )}
    </Svg>
  );
}
const RingArc = Reanimated.createAnimatedComponent(Circle);


/** Today: live learning data in the Figma home composition; course artwork is deferred. */
export default function TodayScreen({ demo = false }: { demo?: boolean } = {}) {
  const isDemo = __DEV__ && demo;
  const [lessons, setLessons] = useState<LessonSummary[]>(() => isDemo ? [
    { id: 'demo-language', title: 'Everyday Italian', sub: 'Useful words and phrases', cards: 24, due: 8, totalDue: 8, pct: 67, deadline: null, learningMode: 'language' },
    { id: 'demo-knowledge', title: 'How the brain learns', sub: 'Ideas worth remembering', cards: 18, due: 5, totalDue: 5, pct: 72, deadline: null, learningMode: 'knowledge' },
  ] : []);
  const [lessonsLoading, setLessonsLoading] = useState(!isDemo);
  const [lessonsError, setLessonsError] = useState(false);
  const [showLessonPicker, setShowLessonPicker] = useState(false);
  const [username, setUsername] = useState(isDemo ? 'Alex' : 'User');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [dailyGoalCards, setDailyGoalCards] = useState(20);
  const [reviewedToday, setReviewedToday] = useState(isDemo ? 7 : 0);
  // How far the whole library has been carried, on the same scale the lesson bars
  // use. Null until there is a card to measure, which is not the same as 0%.
  const [mastery, setMastery] = useState<number | null>(isDemo ? 64 : null);
  const [currentStreak, setCurrentStreak] = useState(isDemo ? 5 : 0);
  // Whether this screen is the one in front. The streak only celebrates then: it
  // grows while a practice session is covering this screen, and the moment to say
  // so is when that session is put away and this is what is being looked at.
  const focused = useIsFocused();
  // How far the page has been scrolled, for the band that comes in behind the top
  // bar once there is something passing under it.
  const scrolled = useRef(new Animated.Value(0)).current;
  const barSky = scrolled.interpolate({ inputRange: [6, 44], outputRange: [0, 1], extrapolate: 'clamp' });
  // Whose streak it is, so the last number each account was shown is kept apart.
  const [streakOwner, setStreakOwner] = useState<string | null>(null);
  // The character's face is read off this screen's own numbers — how many are due,
  // whether the day's goal is met, whether there are any cards at all — so it cannot
  // be drawn before they are all here. Drawn early it wears one expression and swaps
  // to another a moment later, which is the screen correcting itself in front of the
  // person. Both answers have to be in, not just the first one back: lessons alone
  // settle it on idle and the goal arriving after that turns it happy, a second
  // change out of the same load. So the wait stays on the loading screen, which is
  // what the wait is for, and Today comes up already settled.
  const arrived = useRef({ lessons: isDemo, user: isDemo });
  const [ready, setReady] = useState(isDemo);
  const markArrived = useCallback((which: 'lessons' | 'user') => {
    arrived.current[which] = true;
    if (arrived.current.lessons && arrived.current.user) setReady(true);
  }, []);
  // The hero's three lines, then the stats card and the lessons card under them.
  const heroEntrance = useRef(Array.from({ length: 6 }, () => new Animated.Value(0))).current;
  /** Counts each time Today comes to the front once it is ready. The numbers and
   * progress bars are keyed by it, so they count and fill again on every arrival
   * rather than only the first. */
  const [visit, setVisit] = useState(0);
  useEffect(() => { if (focused && ready) setVisit((n) => n + 1); }, [focused, ready]);
  useEffect(() => {
    // Nothing to come in until there is something to come in: run it when the screen
    // is first shown, not while the loading screen is still over it.
    if (!ready) return;
    let active = true;
    let animation: Animated.CompositeAnimation | undefined;
    AccessibilityInfo.isReduceMotionEnabled().then((reduceMotion) => {
      if (!active) return;
      if (reduceMotion) {
        heroEntrance.forEach((value) => value.setValue(1));
        return;
      }
      animation = Animated.stagger(90, heroEntrance.map((value) => Animated.timing(value, {
        toValue: 1, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true,
      })));
      animation.start();
    }).catch(() => heroEntrance.forEach((value) => value.setValue(1)));
    return () => { active = false; animation?.stop(); };
  }, [heroEntrance, ready]);
  const entranceStyle = (index: number) => ({
    opacity: heroEntrance[index],
    transform: [{ translateY: heroEntrance[index].interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
  });
  const insets = useSafeAreaInsets();
  // Continue Learning is what was being learned, most recent first — not the
  // newest lessons made. A lesson studied this morning belongs above one created
  // last night and never opened. The sort is stable, so lessons with nothing to
  // tell them apart stay in the order they came in.
  const visibleLessons = [...lessons]
    .sort((a, b) => (b.recent ?? 0) - (a.recent ?? 0))
    .slice(0, CONTINUE_MAX);
  const lessonsCount = lessons.length;
  const totalCards = lessons.reduce((sum, lesson) => sum + lesson.cards, 0);
  const totalDue = lessons.reduce((sum, lesson) => sum + lesson.due, 0);
  const hasCards = totalCards > 0;
  // The character reacts to where the learner actually stands today, off the same
  // state the heading reads. Its hands, its breath and its blink come with it.
  const goalMet = dailyGoalCards > 0 && reviewedToday >= dailyGoalCards;
  // `todayIdle`, not `idle`: this screen's resting motion is its own, so retuning the
  // general-purpose one for a lab or another screen cannot reach it. See state.ts.
  const mood: MascotMood = !hasCards ? 'onboarding'
    : goalMet ? 'happy'
    : totalDue === 0 ? 'sleepy'
    : 'todayIdle';
  const startLabel = lessonsLoading ? 'Loading…' : lessonsError ? 'Try again' : lessonsCount === 0 ? 'Create your first lesson' : !hasCards ? 'Add cards' : 'Start Learning';
  const startLearning = () => {
    if (lessonsError) { void fetchLessons(true); return; }
    if (lessonsCount === 0) { router.push('/create'); return; }
    if (!hasCards) {
      if (lessonsCount === 1) router.push(`/lessons/${lessons[0].id}/add-terms`);
      else setShowLessonPicker(true);
      return;
    }
    router.push('/quiz?entry=home');
  };
  const estimateMinutes = minutesFor(totalDue);
  const initial = Array.from(username)[0]?.toUpperCase() || 'U';

  const loadUserName = useCallback(async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const fromMeta = user.user_metadata?.full_name as string | undefined;
      const fromEmail = user.email?.split('@')[0];
      setUsername((fromMeta?.trim() || fromEmail || 'User').trim());
      const avatarPath = user.user_metadata?.avatar_url as string | undefined;
      if (!avatarPath) setAvatarUrl(null);
      else if (avatarPath.startsWith('http')) setAvatarUrl(avatarPath);
      else setAvatarUrl(supabase.storage.from('avatars').getPublicUrl(avatarPath).data.publicUrl || null);
      const goalFromMeta = user.user_metadata?.daily_goal_cards;
      if (typeof goalFromMeta === 'number' && goalFromMeta > 0) {
        setDailyGoalCards(goalFromMeta);
      } else {
        setDailyGoalCards(20);
      }
  }, []);
  const loadUser = useCallback(async () => {
    try { await loadUserName(); } finally { markArrived('user'); }
  }, [loadUserName, markArrived]);

  /** `again` is a retry after a failure. An ordinary refetch is neither: coming back
   *  to this tab re-reads the numbers, and while a fresher copy of answers already on
   *  the screen is on its way nothing on it should fall back to saying it is waiting.
   *  Only a screen with nothing on it yet, or one asking again after a failure, says
   *  that. */
  const fetchLessons = useCallback(async (again = false) => {
    if (!arrived.current.lessons || again) setLessonsLoading(true);
    setLessonsError(false);
    try {
    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;
    if (!user) {
      setLessons([]);
      setLessonsError(true);
      setCurrentStreak(0);
      return;
    }

    // 先从本地缓存加载，立即显示（stale-while-revalidate）
    const cached = await loadFromCache<LessonSummary[]>('DASHBOARD', user.id);
    if (cached && cached.length > 0) {
      setLessons(cached);
    }

    const { data: lessonsData, error: lessonsError } = await supabase
      .from('lessons')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (lessonsError || !lessonsData) {
      setLessonsError(true);
      setCurrentStreak(0);
      return;
    }

    const lessonIds = lessonsData.map((l) => l.id);
    if (lessonIds.length === 0) {
      setLessons([]);
      setCurrentStreak(0);
      return;
    }

    const { data: termsData, error: termsError } = await supabase
      .from('terms')
      .select('id, lesson_id')
      .in('lesson_id', lessonIds);
    if (termsError) { setLessonsError(true); return; }

    const termIds = termsData?.map((t) => t.id) || [];
    const { data: progressData } = termIds.length
      ? await supabase
          .from('user_term_progress')
          .select('term_id, status, last_reviewed_at, next_review_at, step_index, created_at')
          .eq('user_id', user.id)
          .in('term_id', termIds)
      : { data: [] as { term_id: string; status: string | null; last_reviewed_at: string | null; next_review_at: string | null; step_index: number | null; created_at: string | null }[] };

    const progressMap = buildLatestProgressMap(progressData || []);

    // The middle stat. It was a hardcoded dash: the app has never recorded whether an
    // answer was right — `is_correct` goes to update-term-progress, moves the card a
    // stage, and is dropped — so there is no accuracy to show and nothing to compute
    // one from. What the app does know is how far each card has been carried, and
    // that is real: every one of these weights comes from a review the person sat
    // through. Averaged over the library it is the same number the lesson bars show,
    // on the same scale, so the two agree.
    const carried = (termsData || []).reduce(
      (sum, term) => sum + getStatusWeight(progressMap.get(term.id)), 0);
    setMastery(termIds.length ? Math.round((carried / termIds.length) * 100) : null);
    const activityDays = activityDaysFromProgressUpdates(progressData || []);
    setCurrentStreak(computeCurrentStreak(activityDays));
    setStreakOwner(user.id);

    // Count distinct terms reviewed today (last_reviewed_at >= today 00:00 local)
    const todayMidnight = new Date();
    todayMidnight.setHours(0, 0, 0, 0);
    const reviewedTodayCount = (progressData || []).filter(
      (p) => p.last_reviewed_at && new Date(p.last_reviewed_at) >= todayMidnight
    ).length;
    setReviewedToday(reviewedTodayCount);

    // When each card was last reviewed, for ordering lessons by when they were
    // last studied.
    const reviewedAt = new Map<string, number>();
    (progressData || []).forEach((row) => {
      const at = row.last_reviewed_at ? new Date(row.last_reviewed_at).getTime() : NaN;
      if (Number.isFinite(at) && at > (reviewedAt.get(row.term_id) ?? 0)) reviewedAt.set(row.term_id, at);
    });

    const termsByLesson = new Map<string, { id: string; lesson_id: string }[]>();
    (termsData || []).forEach((term) => {
      if (!termsByLesson.has(term.lesson_id)) {
        termsByLesson.set(term.lesson_id, []);
      }
      termsByLesson.get(term.lesson_id)?.push(term);
    });

    // Today's number is what the schedule says is for today: the reviews whose time
    // has come, plus the share of never-seen cards today has room for — a deadline
    // spreads those over the days left, keeping the last stretch for review. It is
    // the same plan practice is built from (lib/studyPlan), so the count on this
    // screen is the count the round then asks.
    const progressByTerm = new Map((progressData || []).map((row) => [row.term_id, row]));
    const plan = planToday(
      lessonsData.map((lesson) => ({ id: lesson.id, deadline: lesson.deadline })),
      (termsData || []).map((term) => ({ id: term.id, lessonId: term.lesson_id, progress: progressByTerm.get(term.id) })),
    );

    const nextLessons: LessonSummary[] = lessonsData.map((lesson) => {
      const lessonTerms = termsByLesson.get(lesson.id) || [];
      const cards = lessonTerms.length;
      let weightedScore = 0;
      const made = lesson.created_at ? new Date(lesson.created_at).getTime() : NaN;
      let recent = Number.isFinite(made) ? made : 0;

      lessonTerms.forEach((term) => {
        const status = progressMap.get(term.id);
        weightedScore += getStatusWeight(status);
        recent = Math.max(recent, reviewedAt.get(term.id) ?? 0);
      });

      const reviewed = Math.round(weightedScore);
      const pct = cards > 0 ? Math.round((weightedScore / cards) * 100) : 0;
      const rawDue = Math.max(cards - reviewed, 0);
      const today = plan.byLesson.get(lesson.id);
      const due = today ? today.dueReviews + today.newToday : 0;

      return {
        id: lesson.id,
        learningMode: lesson.learning_mode,
        coverStyle: lesson.cover_style,
        title: lesson.name || 'Untitled lesson',
        sub: lesson.description?.trim() || '',
        cards,
        due,
        totalDue: rawDue,
        pct,
        deadline: lesson.deadline ?? null,
        recent,
      };
    });

    setLessons(nextLessons);
    // 保存到本地，下次打开立即可见
    void saveToCache('DASHBOARD', nextLessons, user.id);
    } catch { setLessonsError(true); } finally { setLessonsLoading(false); markArrived('lessons'); }
  }, [markArrived]);

  useFocusEffect(
    useCallback(() => {
      if (!isDemo) { void fetchLessons(); void loadUser(); }
    }, [fetchLessons, loadUser, isDemo])
  );

  // Until then this is the screen: the same one the sign-in and the first run hand
  // over to, so arriving from either reads as one wait rather than two.
  if (!ready) return <View style={styles.root}><LoadingScreen visible /></View>;

  return (
    <View style={styles.root}>
      <Animated.ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, { paddingBottom: 90 + Math.max(8, insets.bottom) }]}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrolled } } }], { useNativeDriver: true })}>
        <LinearGradient pointerEvents="none" colors={[colors.limePale, colors.limeBright, colors.limeSurface, colors.bg]} locations={[0, 0.21154, 0.44712, 1]} style={styles.background} />
        <View pointerEvents="none" style={styles.waveBack}><HomeAsset name="waveBack" /></View>
        <View pointerEvents="none" style={styles.mascot}>
          <MascotRig width={MASCOT_WIDTH} mood={mood} tilt={MASCOT_TILT} look={MASCOT_LOOK}
            handRest={MASCOT_HAND_REST} tailRest={MASCOT_TAIL}
            behind={<View pointerEvents="none" style={styles.waveOverMascot}><HomeAsset name="waveFront" /></View>} />
        </View>
        {/* Where the streak and the profile sit. They are not in here: they stay put
            while this scrolls, and are drawn over it below. */}
        <View style={styles.top} />
        <View style={styles.hero}>
          <Animated.View style={[styles.focus, entranceStyle(0)]}><HomeAsset name="focusTarget" height={FOCUS_ICON} /><Text style={styles.focusText}>Today’s Focus</Text></Animated.View>
          <Animated.View style={[styles.heroCopy, entranceStyle(1)]}>
            <Text accessibilityRole="header" style={styles.count}><CountUp key={`due${visit}`} value={totalDue} style={styles.count} /><Text style={styles.countUnit}> {totalDue === 1 ? 'card' : 'cards'}</Text></Text>
            <Text style={styles.subtitle}>{lessonsError ? 'Couldn’t load your lessons' : lessonsLoading ? 'Getting your lessons ready' : lessonsCount === 0 ? 'Create a lesson to start learning' : !hasCards ? 'Add cards to a lesson to start learning' : totalDue > 0 ? 'Need your review' : 'All caught up'}</Text>
          </Animated.View>
          <Animated.View style={entranceStyle(2)}><Button size="lg" width="hug" style={styles.start}
            label={startLabel} disabled={lessonsLoading} onPress={startLearning}
            icon={hasCards && !lessonsLoading && !lessonsError ? <View style={styles.playIcon}><HomeAsset name="play" height={16} /></View> : undefined} />
          </Animated.View>
          {!lessonsLoading && !lessonsError && lessonsCount > 0 && !hasCards && <Button variant="quiet" size="sm" label="Or start something new" onPress={() => router.push('/create')} />}
        </View>
        <Animated.View style={[styles.stats, entranceStyle(3)]}><View style={styles.statsFace}>
          <View style={styles.stat}><HomeAsset name="time" /><Text style={styles.statValue}>{totalDue ? <><CountUp key={`min${visit}`} value={estimateMinutes} delay={150} style={styles.statValue} />min</> : '—'}</Text><Text style={styles.statLabel}>Estimated</Text></View>
          <View style={styles.stat}><View style={styles.chartIcon}><View style={[styles.bar, { height: 11, opacity: 0.5 }]} /><View style={[styles.bar, { height: 17 }]} /><View style={[styles.bar, { height: 23, opacity: 0.65 }]} /></View><Text style={styles.statValue}>{mastery === null ? '—' : <><CountUp key={`mastery${visit}`} value={mastery} delay={220} style={styles.statValue} />%</>}</Text><Text style={styles.statLabel}>Mastery</Text></View>
          <View style={styles.stat}><View style={styles.goalIcon}><GoalRing key={`ring${visit}`} done={reviewedToday} goal={dailyGoalCards} /></View><Text style={styles.statValue}><CountUp key={`done${visit}`} value={reviewedToday} delay={290} style={styles.statValue} />/{dailyGoalCards}</Text><Text style={styles.statLabel}>Today’s goal</Text></View>
        </View></Animated.View>
        {/* Only once there is something to ask about. A standing entry above a
            screen with no cards in it would be an invitation to nothing, and it
            would be competing with the hero's own button for attention. */}
        {/* Two cards, not one with a rule down it: they are two different things
            and they say so. Separate all the way in, too — they are not one entry
            that works out which you meant. The allowance is charged before the
            model runs and the two cost about twenty times differently, so the line
            has to be known at the door rather than guessed afterwards (§12.1).
            Wanting the other one mid-conversation is handled by a button that hands
            over, not by merging them.

            Tinted rather than white: everything else on this screen is a white card
            on a lime wash, so a pair of coloured ones reads as something offered
            rather than more of the same list. */}
        {!lessonsLoading && !lessonsError && (
          <Animated.View style={[styles.askRow, entranceStyle(4)]}>
            {/* The app's own card, so these press the way every other card does:
                the face travels down onto its lip. Opacity would have been a
                different language on the one screen where everything else is
                physical. */}
            <Card onPress={() => router.push('/create-chat' as any)}
              accessibilityLabel="Learn something"
              pad="md" gap={space[2]}
              style={[styles.ask, styles.askLearnShell]} faceStyle={styles.askFace}
            >
              {/* A bubble with a sparkle in it: a conversation, and one that writes
                  something for you. No chip behind it — without the disc it can be
                  big enough to read as a mark rather than a bullet.
                  `red` here is a hue, not a state: on peach it reads as terracotta,
                  and it is the palette's only deep warm that is saturated enough to
                  look clean. `warn` is the same hue desaturated, which on this face
                  came out looking like a stain. Nothing on this card is an error. */}
              <Icon name="chatSparkle" size={30} color={colors.red} />
              <Text style={[styles.askTitle, styles.askLearnInk]}>Learn something</Text>
              <Text style={[styles.askHint, styles.askLearnInkSoft]}>Explained, then kept</Text>
            </Card>
            {lessonsCount > 0 && (
              <Card onPress={() => router.push('/practice-chat' as any)}
                accessibilityLabel="Ask a question about your cards"
                pad="md" gap={space[2]}
                style={[styles.ask, styles.askAskShell]} faceStyle={[styles.askFace, styles.askAskFace]}
              >
                {/* The same bubble with a question in it rather than a sparkle: a
                    conversation that answers rather than writes.
                    Each icon takes the deep end of its own card's hue instead of one
                    system colour, so the mark belongs to the card it sits on. */}
                <Icon name="chatQuery" size={30} color={colors.action} />
                <Text style={styles.askTitle}>Ask a question</Text>
                {/* What it can actually do today. It has no sight of your progress
                    yet, so it does not offer to say what you keep missing. */}
                <Text style={styles.askHint}>About your cards</Text>
              </Card>
            )}
          </Animated.View>
        )}
        <Animated.View style={[styles.courses, entranceStyle(5)]}><View style={styles.coursesFace}>
          <View style={styles.heading}><Text accessibilityRole="header" style={styles.sectionTitle}>Continue Learning</Text>{lessonsCount > 0 && <Pressable accessibilityRole="button" onPress={() => router.push('/(tabs)/library')} style={styles.seeAll}><Text style={styles.seeAllText}>See All</Text><HomeAsset name="chevron" /></Pressable>}</View>
          {visibleLessons.map((lesson, row) => <LessonRow key={lesson.id} lesson={lesson} row={row} visit={visit} />)}
          {/* Nothing to continue yet. The place a lesson would be is kept, drawn as
              one that has not been made: the same row, a plus where its cover goes.
              It is the quiet way in — the hero's button is the loud one — so it is
              a row to tap, not a second button. */}
          {!lessonsLoading && !lessonsError && lessonsCount === 0 && <Pressable accessibilityRole="button" accessibilityLabel="Create your first lesson" onPress={() => router.push('/create')} style={({ pressed }) => [styles.lesson, pressed && styles.emptyPressed]}>
            <View style={styles.emptyCover}><Icon name="plus" size={22} color={colors.sub} /></View>
            <View style={styles.lessonCopy}><Text style={styles.lessonTitle}>Your first lesson is waiting</Text><Text style={styles.lessonHint}>Turn a topic, a note, or a PDF into learning cards.</Text><View style={styles.track} /></View>
          </Pressable>}
        </View></Animated.View>
      </Animated.ScrollView>
      {/* The top bar: the streak and the way to the profile. It does not scroll. Those
          two are the screen's standing furniture — how the days are going, and who
          this is — and they were the first things to leave when the page moved.
          At rest it is just the two of them on the hero; once the page has moved
          under them a band of the hero's own sky comes in behind, fading out at its
          lower edge, so the cards pass beneath it instead of through it. */}
      <View pointerEvents="box-none" style={styles.topBar}>
        <Animated.View pointerEvents="none" style={[styles.topBarSky, { height: insets.top + BAR_SKY, opacity: barSky }]}>
          <LinearGradient pointerEvents="none" style={StyleSheet.absoluteFill}
            colors={[colors.limePale, colors.limePale, `${colors.limePale}00`]}
            locations={[0, 0.7, 1]} />
        </Animated.View>
        <View pointerEvents="box-none" style={[styles.topBarRow, { paddingTop: insets.top + 10 }]}>
          <StreakPill value={currentStreak} active={focused} seenKey={streakOwner ? `memq:streak-seen:${streakOwner}` : null} />
          <Pressable accessibilityRole="button" accessibilityLabel={`Open profile for ${username}`} onPress={() => router.push('/you')} style={styles.profile}>{avatarUrl ? <Image source={{ uri: avatarUrl }} style={styles.profileImage} onError={() => setAvatarUrl(null)} /> : <Text style={styles.profileText}>{initial}</Text>}</Pressable>
        </View>
      </View>
      <Sheet visible={showLessonPicker} onClose={() => setShowLessonPicker(false)}
        closeLabel="Close lesson picker"
        title="Choose a lesson" subtitle="Where would you like to add cards?">
        <ScrollView style={styles.pickerList} contentContainerStyle={styles.pickerListContent} showsVerticalScrollIndicator={false}>
          {lessons.map((lesson) => <Pressable key={lesson.id} accessibilityRole="button" accessibilityLabel={`Add cards to ${lesson.title}`} onPress={() => { setShowLessonPicker(false); router.push(`/lessons/${lesson.id}/add-terms`); }} style={styles.pickerLesson}>
            <LessonCover id={lesson.id} mode={lesson.learningMode} coverStyle={lesson.coverStyle} width={48} height={48} /><Text numberOfLines={2} style={styles.pickerLessonName}>{lesson.title}</Text><HomeAsset name="chevron" />
          </Pressable>)}
        </ScrollView>
      </Sheet>
    </View>
  );
}

/** What a lesson is asking of you, in one phrase — the same one the library's
 *  cards use, so a lesson reads the same in both lists. The percentage is the bar
 *  under it, drawn rather than written twice. */
function standing(lesson: LessonSummary): string {
  if (lesson.cards === 0) return 'No cards yet';
  if (lesson.totalDue === 0) return 'All caught up';
  return `${lesson.totalDue} to review`;
}

/** A lesson on Today.
 *
 * The line under the title is what is left to do, and a deadline belongs in it:
 * it is the other half of "how much", and the half that says when. It is said in
 * the action's colour so it reads as the thing with a clock on it, and quietly
 * once the date has gone by, which is the same way the library says it.
 */
function LessonRow({ lesson, row, visit }: { lesson: LessonSummary; row: number; visit: number }) {
  const left = deadlineLeft(lesson.deadline);
  return (
    <Pressable accessibilityRole="button"
      accessibilityLabel={`${lesson.title}. ${standing(lesson)}.${left ? ` ${left.text}.` : ''} ${lesson.pct} percent mastered.`}
      onPress={() => router.push(`/lessons/${lesson.id}`)} style={styles.lesson}>
      <LessonCover id={lesson.id} mode={lesson.learningMode} coverStyle={lesson.coverStyle} width={71} height={56} />
      <View style={styles.lessonCopy}>
        <Text numberOfLines={1} style={styles.lessonTitle}>{lesson.title}</Text>
        <View style={styles.lessonMeta}>
          <Text numberOfLines={1} style={styles.lessonLead}>{standing(lesson)}</Text>
          {left ? <Text style={[styles.lessonDeadline, left.past && styles.lessonDeadlinePast]}>{left.text}</Text> : null}
        </View>
        <View style={styles.track}><ProgressFill key={`fill${visit}`} pct={lesson.pct} delay={300 + row * 90} style={styles.fill} /></View>
      </View>
    </Pressable>
  );
}

/** How far below the status bar the band behind the top bar reaches: the bar's own
 * ten points of air and forty of height, and then the length of its fade. */
const BAR_SKY = 86;
/** The character's box. The static asset was a 220.205 square whose drawing filled
 * 60.4% of it; the animated one is a 256 square filling 60.2%, so the same number
 * puts the body on screen at the same size and the layout above is untouched. */
const MASCOT_WIDTH = 220.205;
/** It sits in the top right with the count, the line of copy and the button all to
 * its left, so that is where it looks.
 *
 * The numbers are a distance, written in the rig's scale. One unit of look moves a
 * pupil 10 units across and 8 down inside its white, and slides the whole face 4
 * and 2.5 after it (LOOK_REACH and FACE_TURN in the rig). What this screen wants is
 * the gaze 12 units to the left and a little over 1 down, which is where it was
 * first set and where it has been kept through two changes of that scale — so 12
 * over 14 and 1.2 over 10.5. If the reach is retuned again these are divided out
 * again with it; asking for more than about one unit pins both pupils to the rim. */
const MASCOT_LOOK = { x: -0.857, y: 0.115 };
/** No lean. The mockup draws the character at +10.1 degrees, which turned its head
 * away from everything it is about; leaning it the other way fixed that and brought
 * its own problems — the hands orbit a circle and a tilted body meets them at a
 * different angle. Upright, the hands sit where they were drawn and the character
 * faces its copy without being tipped at it. */
const MASCOT_TILT = 0;

/** Where the paws rest on this screen.
 *
 * The character rests its hands on the hill, which this screen hands it as
 * `behind`, so the hill is drawn between the body and the hands. Given something to
 * lean on, the hands come to rest level, as they would on a card — but the hill's
 * edge is a slope, high where it crosses the body's left side and low on its right,
 * so a level pair leaves the left paw stranded on the hill's face a long way below
 * the edge. Each is slid round the outline to where the edge passes it: the left
 * one up to the body's side, the right one a little further down.
 *
 * These are this screen's numbers, not the artwork's. The sign-in screens rest the
 * same paws on the level top edge of a card, where they are right as they are. */
const MASCOT_HAND_REST = {
  left: { out: -6, turn: 25 },
  right: { turn: 6 },
} as const;

/** The tail, lifted clear of the hill.
 *
 * The drawing sprouts it low on the body's right side, and on this screen that is
 * behind the hill: two thirds of its length was hidden and what showed was an
 * arrowhead coming and going beside the body. Raised this far its whole curve sits
 * above the hill's edge and it comes out from behind the body instead. (It was
 * -26, which carried the tip up level with the eyes; -14 keeps the curve clear of
 * the hill and the tip lower down the body.) */
const MASCOT_TAIL = { x: 6, y: -14 } as const;

/** The Today's Focus icon's drawn height.
 *
 * Its export is 63.69 by 60, which is an icon sheet's size rather than this
 * pill's. 16 keeps the target ring the size the ring it replaced was drawn at:
 * both drawings give their ring about 92% of the canvas, so matching the canvas
 * height matches the ring, and the dart is the part that is new. */
const FOCUS_ICON = 14;

const card = componentTokens.card;
/** A lesson cover palette by name — [face, a shade down]. By name rather than by
 *  position, so reordering the palettes cannot quietly repaint these cards. */
const cover = (id: 'lime' | 'lavender' | 'peach' | 'sky' | 'mint' | 'rose') =>
  (lessonCoverPalettes.find((item) => item.id === id) ?? lessonCoverPalettes[0]).colors;
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: space[4], paddingBottom: 120 },
  background: { position: 'absolute', top: 0, left: 0, right: 0, height: 874 },
  waveBack: { position: 'absolute', top: 113, left: -19 },
  mascot: { position: 'absolute', top: 89, right: -1 },
  // The hill, placed inside the character's box so it can be drawn between its body
  // and its hands. Same screen position as before: the box's left edge sits at
  // 402 - 220.205 + 1, and the hill is laid out at left -19, top 150.
  waveOverMascot: { position: 'absolute', left: -19 - (402 - MASCOT_WIDTH + 1), top: 150 - 89 },

  // The room the top bar takes at the head of the page. The bar itself is drawn
  // over the scroll view, not in it.
  top: { height: 145 },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0 },
  topBarSky: { position: 'absolute', top: 0, left: 0, right: 0 },
  topBarRow: { paddingHorizontal: space[4], flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: space[2] },
  // The same disc the profile page gives someone with no photo: deep, with the
  // initial reversed out of it. It was the one flat grey on a screen made of lime
  // and colors.sub, and next to the streak it read as something still loading.
  profile: { width: 40, height: 40, borderRadius: radius.lg, backgroundColor: colors.actionShell, alignItems: 'center', justifyContent: 'center' },
  profileImage: { width: 40, height: 40, borderRadius: radius.lg },
  profileText: { ...type.small, fontFamily: 'Geist_600SemiBold', color: colors.surf },
  // Three sizes, not three shouts: a small eyebrow, the count as the one large
  // thing on the screen, and an action that hugs its label. The button was as wide
  // as the page and taller than the heading, which left the number nothing to be
  // bigger than.
  hero: { gap: space[1] },
  focus: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: space[1], paddingHorizontal: space[2], paddingVertical: space[1], borderRadius: radius.pill, backgroundColor: colors.veil },
  focusText: { ...type.caption, fontFamily: 'Geist_500Medium', color: colors.text },
  heroCopy: { alignSelf: 'flex-start', maxWidth: '58%', minHeight: 80, justifyContent: 'center', gap: space.hair },
  count: { ...oneLine(type.display), fontFamily: 'Oswald_600SemiBold', color: colors.sub },
  countUnit: { ...type.heading },
  subtitle: { ...type.small, fontFamily: 'Geist_500Medium', color: colors.faint },
  start: { marginTop: space[2] },
  playIcon: { transform: [{ rotate: '90deg' }] },
  pickerList: { flexGrow: 0 },
  // The side margin the head above it keeps, so a lesson's cover lines up with
  // the title that asked which lesson.
  pickerListContent: { paddingHorizontal: layout.screenInline },
  pickerLesson: { minHeight: 72, padding: space[3], marginBottom: space[2], borderRadius: radius.lg, backgroundColor: colors.surf, flexDirection: 'row', alignItems: 'center', gap: space[3] },
  pickerLessonName: { ...type.body, fontFamily: 'Geist_600SemiBold', flex: 1, color: colors.sub },
  // The two layers of components/ui/Card, written out because the entrance
  // animation has to ride on them and only an Animated.View can carry it. The lip
  // was four points here and three everywhere else.
  stats: { marginTop: space[4], backgroundColor: card.shell, borderRadius: card.radius.lg, paddingBottom: card.lip },
  statsFace: { backgroundColor: card.face, borderRadius: card.radius.lg, paddingVertical: card.pad.md, paddingHorizontal: space[3], flexDirection: 'row' },
  stat: { flex: 1, alignItems: 'center', gap: space[1] },
  statValue: { ...type.body, fontFamily: 'Oswald_600SemiBold', color: colors.sub },
  statLabel: { ...type.caption, fontFamily: 'Geist_500Medium', color: colors.faint },
  chartIcon: { width: 42, height: 42, backgroundColor: colors.tint, borderRadius: radius.md, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: space[2], gap: space.hair },
  bar: { width: 6, borderRadius: radius.sm, backgroundColor: colors.chartBar },
  goalIcon: { width: 42, height: 42, borderRadius: radius.md, backgroundColor: colors.swipeGreen, alignItems: 'center', justifyContent: 'center' },
  askRow: { flexDirection: 'row', gap: space[3], marginTop: space[4] },
  ask: { flex: 1 },
  askFace: { alignItems: 'center', backgroundColor: cover('peach')[0] },
  /* Each card stands on its own colour a shade down, the way the lesson covers are
   * built — these are those palettes, so no new colours and no neutral grey edge
   * under a tinted card.
   *
   * Lavender for the one that writes something, since that is the accent's family;
   * peach for the one that answers. Both faces carry about the same weight, which
   * the earlier pair did not: a near-white second card read as the weaker offer
   * rather than the other one. */
  askLearnShell: { backgroundColor: cover('peach')[1] },
  askAskShell: { backgroundColor: cover('lavender')[1] },
  askAskFace: { backgroundColor: cover('lavender')[0] },
  // White on the tint, rather than the lime chip the white cards use: a lime disc
  // on a lavender card is a third colour for no reason.
  askMark: {
    width: 40, height: 40, borderRadius: radius.md,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surf,
  },
  /* The right-hand card needs no ink of its own: this app's text colours are
   * already purple — `text` is #301a50 and `sub` is #4b2c78 — so on lavender they
   * are the deep end of the card's own hue. That is why that one always looked
   * settled. The warm card gets the same two steps in its own hue instead. */
  askTitle: { ...oneLine(type.body), fontFamily: fonts.semibold, color: colors.text, textAlign: 'center' },
  askHint: { ...type.caption, fontFamily: fonts.regular, color: colors.sub, textAlign: 'center' },
  askLearnInk: { color: colors.redShell },
  askLearnInkSoft: { color: colors.red },
  courses: { marginTop: space[4], borderRadius: card.radius.lg, backgroundColor: card.shell, paddingBottom: card.lip },
  // A card's title belongs against its top edge: twenty-four points of room above
  // it read as a gap rather than as the card beginning, and it was the same
  // twenty-four that separates one lesson from the next.
  coursesFace: { padding: card.pad.md, borderRadius: card.radius.lg, backgroundColor: card.face, gap: space[5] },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  // A heading inside a card is a card's title, not a screen's section: the page's
  // own sections — Library's "Lessons", a lesson's "Cards" — are the step above.
  // One line, so it goes without the body's leading: those eight points would sit
  // above the words and read as padding the card does not have.
  sectionTitle: { ...oneLine(type.body), fontFamily: fonts.semibold, color: colors.text },
  seeAll: { flexDirection: 'row', alignItems: 'center', minHeight: 24 },
  seeAllText: { ...type.caption, fontFamily: 'Geist_500Medium', color: colors.faint },
  lesson: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  lessonCopy: { flex: 1, gap: space[1] },
  lessonTitle: { ...type.body, fontFamily: 'Oswald_600SemiBold', color: colors.text },
  lessonMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[2] },
  // The row that has no lesson behind it yet says a sentence, not a standing.
  lessonHint: { ...type.small, fontFamily: fonts.medium, color: colors.faint },
  // The lead, a step below the title and a step above the bar.
  lessonLead: { ...type.small, fontFamily: fonts.semibold, flexShrink: 1, color: colors.sub },
  // The same two steps of the one ink as the library's rows.
  lessonDeadline: { ...type.small, fontFamily: fonts.semibold, color: colors.sub },
  lessonDeadlinePast: { fontFamily: fonts.medium, color: colors.faint },
  track: { height: 5, borderRadius: radius.md, backgroundColor: colors.tint, overflow: 'hidden' },
  fill: { height: 5, borderRadius: radius.sm, backgroundColor: colors.action },
  emptyCover: {
    width: 71, height: 56, borderRadius: radius.md, backgroundColor: colors.limeSurface,
    borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.faint,
    alignItems: 'center', justifyContent: 'center',
  },
  emptyPressed: { opacity: 0.7 },
});
