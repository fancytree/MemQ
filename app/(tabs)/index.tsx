import { LessonCover } from '@/components/LessonCover';
import LoadingScreen from '@/components/LoadingScreen';
import { colors, homeColors } from '@/theme/colors';
import { type } from '@/theme/typography';
import { HomeAsset } from '@/components/HomeAsset';
import { MascotCharacter, type MascotMood } from '@/components/mascot/MascotCharacter';
import { loadFromCache, saveToCache } from '@/lib/cache';
import { activityDaysFromProgressUpdates, computeCurrentStreak } from '@/lib/streak';
import { supabase } from '@/lib/supabase';
import { buildLatestProgressMap } from '@/lib/termProgress';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
}

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

/** Implementation extension: the reference frame reads 23min for 37 due cards. */
const SECONDS_PER_CARD = 37;

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
  const [currentStreak, setCurrentStreak] = useState(isDemo ? 5 : 0);
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
  const heroEntrance = useRef([new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)]).current;
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
  const visibleLessons = lessons.slice(0, 3);
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
  const estimateMinutes = Math.max(1, Math.round((totalDue * SECONDS_PER_CARD) / 60));
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
          .select('term_id, status, last_reviewed_at')
          .eq('user_id', user.id)
          .in('term_id', termIds)
      : { data: [] as { term_id: string; status: string | null; last_reviewed_at: string | null }[] };

    const progressMap = buildLatestProgressMap(progressData || []);
    const activityDays = activityDaysFromProgressUpdates(progressData || []);
    setCurrentStreak(computeCurrentStreak(activityDays));

    // Count distinct terms reviewed today (last_reviewed_at >= today 00:00 local)
    const todayMidnight = new Date();
    todayMidnight.setHours(0, 0, 0, 0);
    const reviewedTodayCount = (progressData || []).filter(
      (p) => p.last_reviewed_at && new Date(p.last_reviewed_at) >= todayMidnight
    ).length;
    setReviewedToday(reviewedTodayCount);

    const termsByLesson = new Map<string, { id: string; lesson_id: string }[]>();
    (termsData || []).forEach((term) => {
      if (!termsByLesson.has(term.lesson_id)) {
        termsByLesson.set(term.lesson_id, []);
      }
      termsByLesson.get(term.lesson_id)?.push(term);
    });

    const nextLessons: LessonSummary[] = lessonsData.map((lesson) => {
      const lessonTerms = termsByLesson.get(lesson.id) || [];
      const cards = lessonTerms.length;
      let weightedScore = 0;

      lessonTerms.forEach((term) => {
        const status = progressMap.get(term.id);
        weightedScore += getStatusWeight(status);
      });

      const reviewed = Math.round(weightedScore);
      const pct = cards > 0 ? Math.round((weightedScore / cards) * 100) : 0;
      const rawDue = Math.max(cards - reviewed, 0);
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);
      const lessonDeadline = lesson.deadline ? new Date(lesson.deadline) : null;
      const isFutureLesson =
        lessonDeadline &&
        !Number.isNaN(lessonDeadline.getTime()) &&
        lessonDeadline > todayEnd;
      let due = rawDue;
      if (isFutureLesson && lessonDeadline) {
        const msPerDay = 24 * 60 * 60 * 1000;
        const daysRemaining = Math.max(
          1,
          Math.floor((lessonDeadline.getTime() - todayStart.getTime()) / msPerDay) + 1
        );
        // 预留复习缓冲天数，避免学习计划卡到 deadline 当天
        const reviewBufferDays = Math.max(1, Math.floor(daysRemaining * 0.2));
        const effectiveStudyDays = Math.max(1, daysRemaining - reviewBufferDays);
        due = Math.ceil(rawDue / effectiveStudyDays);
      }

      return {
        id: lesson.id,
        learningMode: lesson.learning_mode,
        coverStyle: lesson.cover_style,
        title: lesson.name || 'Untitled lesson',
        sub: lesson.description || 'No description',
        cards,
        due,
        totalDue: rawDue,
        pct,
        deadline: lesson.deadline ?? null,
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
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, { paddingBottom: 90 + Math.max(8, insets.bottom) }]}>
        <LinearGradient pointerEvents="none" colors={[homeColors.gradientStart, homeColors.gradientBright, homeColors.gradientSoft, homeColors.canvas]} locations={[0, 0.21154, 0.44712, 1]} style={styles.background} />
        <View pointerEvents="none" style={styles.waveBack}><HomeAsset name="waveBack" /></View>
        <View pointerEvents="none" style={styles.mascot}>
          <MascotCharacter width={MASCOT_WIDTH} mood={mood} tilt={MASCOT_TILT} look={MASCOT_LOOK}
            handRest={{ right: MASCOT_RIGHT_HAND }} tailRest={MASCOT_TAIL}
            behind={<View pointerEvents="none" style={styles.waveOverMascot}><HomeAsset name="waveFront" /></View>} />
        </View>
        <View style={[styles.top, { paddingTop: insets.top + 10 }]}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Open profile for ${username}`} onPress={() => router.push('/you')} style={styles.profile}>{avatarUrl ? <Image source={{ uri: avatarUrl }} style={styles.profileImage} onError={() => setAvatarUrl(null)} /> : <Text style={styles.profileText}>{initial}</Text>}</Pressable>
          <View style={styles.streak} accessibilityLabel={`${currentStreak}-day streak`}><View style={styles.streakFace}><HomeAsset name="flame" /><Text style={styles.streakText}>{currentStreak}</Text></View></View>
        </View>
        <View style={styles.hero}>
          <Animated.View style={[styles.focus, entranceStyle(0)]}><HomeAsset name="focusTarget" height={FOCUS_ICON} /><Text style={styles.focusText}>Today’s Focus</Text></Animated.View>
          <Animated.View style={[styles.heroCopy, entranceStyle(1)]}>
            <Text accessibilityRole="header" style={styles.count}>{totalDue}<Text style={styles.countUnit}> {totalDue === 1 ? 'card' : 'cards'}</Text></Text>
            <Text style={styles.subtitle}>{lessonsError ? 'Couldn’t load your lessons' : lessonsLoading ? 'Getting your lessons ready' : lessonsCount === 0 ? 'Create a lesson to start learning' : !hasCards ? 'Add cards to a lesson to start learning' : totalDue > 0 ? 'Need your review' : 'All caught up'}</Text>
          </Animated.View>
          <Animated.View style={entranceStyle(2)}><Pressable accessibilityRole="button" accessibilityState={{ disabled: lessonsLoading }} disabled={lessonsLoading} onPress={startLearning} style={({ pressed }) => [styles.start, lessonsLoading && styles.startLoading, pressed && styles.startPressed]}>
            <View style={styles.startFace}>{hasCards && !lessonsLoading && !lessonsError && <View style={styles.playIcon}><HomeAsset name="play" /></View>}<Text style={styles.startText}>{startLabel}</Text></View>
          </Pressable></Animated.View>
          {!lessonsLoading && !lessonsError && lessonsCount > 0 && !hasCards && <Pressable accessibilityRole="button" onPress={() => router.push('/create')} style={styles.createAlternative}><Text style={styles.createAlternativeText}>Or create a new lesson</Text></Pressable>}
        </View>
        <View style={styles.stats}><View style={styles.statsFace}>
          <View style={styles.stat}><HomeAsset name="time" /><Text style={styles.statValue}>{totalDue ? `${estimateMinutes}min` : '—'}</Text><Text style={styles.statLabel}>Estimated</Text></View>
          <View style={styles.stat}><View style={styles.chartIcon}><View style={[styles.bar, { height: 11, opacity: 0.5 }]} /><View style={[styles.bar, { height: 17 }]} /><View style={[styles.bar, { height: 23, opacity: 0.65 }]} /></View><Text style={styles.statValue}>—</Text><Text style={styles.statLabel}>Accuracy</Text></View>
          <View style={styles.stat}><View style={styles.goalIcon}><HomeAsset name="goal" /></View><Text style={styles.statValue}>{reviewedToday}/{dailyGoalCards}</Text><Text style={styles.statLabel}>Today’s goal</Text></View>
        </View></View>
        <View style={styles.courses}><View style={styles.coursesFace}>
          <View style={styles.heading}><Text accessibilityRole="header" style={styles.sectionTitle}>Continue Learning</Text><Pressable accessibilityRole="button" onPress={() => router.push('/(tabs)/library')} style={styles.seeAll}><Text style={styles.seeAllText}>See All</Text><HomeAsset name="chevron" /></Pressable></View>
          {visibleLessons.map(lesson => <Pressable key={lesson.id} accessibilityRole="button" onPress={() => router.push(`/lessons/${lesson.id}`)} style={styles.lesson}>
            <LessonCover id={lesson.id} mode={lesson.learningMode} coverStyle={lesson.coverStyle} width={71} height={56} /><View style={styles.lessonCopy}><Text numberOfLines={1} style={styles.lessonTitle}>{lesson.title}</Text><Text style={styles.lessonMeta}>{lesson.pct}% · {lesson.totalDue} cards remaining</Text><View style={styles.track}><View style={[styles.fill, { width: `${lesson.pct}%` }]} /></View></View>
          </Pressable>)}
          {!lessonsLoading && !lessonsError && lessonsCount === 0 && <View style={styles.empty}><Text style={styles.lessonTitle}>Your first course is waiting.</Text><Text style={styles.lessonMeta}>Turn a topic, a note, or a PDF into learning cards.</Text></View>}
        </View></View>
      </ScrollView>
      <Modal visible={showLessonPicker} transparent animationType="slide" onRequestClose={() => setShowLessonPicker(false)}>
        <View style={styles.pickerOverlay}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close lesson picker" style={StyleSheet.absoluteFill} onPress={() => setShowLessonPicker(false)} />
          <View accessibilityViewIsModal style={[styles.picker, { paddingBottom: Math.max(20, insets.bottom) }]}>
            <View style={styles.pickerHandle} />
            <View style={styles.pickerHeading}><View style={styles.pickerCopy}><Text accessibilityRole="header" style={styles.pickerTitle}>Choose a lesson</Text><Text style={styles.pickerSubtitle}>Where would you like to add cards?</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close lesson picker" onPress={() => setShowLessonPicker(false)} style={styles.pickerClose}><Text style={styles.pickerCloseText}>×</Text></Pressable></View>
            <ScrollView style={styles.pickerList} showsVerticalScrollIndicator={false}>
              {lessons.map((lesson) => <Pressable key={lesson.id} accessibilityRole="button" accessibilityLabel={`Add cards to ${lesson.title}`} onPress={() => { setShowLessonPicker(false); router.push(`/lessons/${lesson.id}/add-terms`); }} style={styles.pickerLesson}>
                <LessonCover id={lesson.id} mode={lesson.learningMode} coverStyle={lesson.coverStyle} width={48} height={48} /><Text numberOfLines={2} style={styles.pickerLessonName}>{lesson.title}</Text><HomeAsset name="chevron" />
              </Pressable>)}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const purple = homeColors.deep;
/** The character's box. The static asset was a 220.205 square whose drawing filled
 * 60.4% of it; the animated one is a 256 square filling 60.2%, so the same number
 * puts the body on screen at the same size and the layout above is untouched. */
const MASCOT_WIDTH = 220.205;
/** It sits in the top right with the count, the line of copy and the button all to
 * its left, so that is where it looks.
 *
 * These two numbers are what the character was first given at 16:33 — translated,
 * because the scale they were written in no longer exists. Back then one unit of look
 * moved the pupil 12 units across and 8 down, and nothing else; at 16:37 that single
 * reach was split in two, the eye white began to travel as well, and one unit became
 * 7 + 11 across and 4 + 10 down. The constant lives in MascotCharacter and is shared
 * by every screen that aims a gaze, so this screen's numbers went on meaning what
 * they had meant while quietly driving half again as far, and an afternoon of tuning
 * on top of that took them to -1.8 — 32 units into an eye white that has 13 to give,
 * which pins both pupils against the rim and holds them there.
 *
 * So: -1 by 12 across and 0.15 by 8 down, divided back out by 18 and 14. The gaze
 * lands exactly where it landed before any of it, and if that reach is ever retuned
 * again these have to be divided out again with it. */
const MASCOT_LOOK = { x: -0.667, y: 0.086 };
/** No lean. The mockup draws the character at +10.1 degrees, which turned its head
 * away from everything it is about; leaning it the other way fixed that and brought
 * its own problems — the hands orbit a circle and a tilted body meets them at a
 * different angle. Upright, the hands sit where they were drawn and the character
 * faces its copy without being tipped at it. */
const MASCOT_TILT = 0;

/** Where the right paw rests on this screen.
 *
 * Two corrections, measured rather than nudged by eye.
 *
 * `out` 6.31 — the paws are not mirror images in the artwork. About the body's own
 * centre (x 124 of the 256 box) the left paw rests at radius 76.50 and the right at
 * 70.19, so the right one sits inside the circle the left one rests on, buried in
 * the outline rather than against it.
 *
 * `turn` 38 — here the character rests its hands on the hill, which this screen
 * hands it as `behind`, so the hill is drawn between the body and the hands. The
 * hill's edge is a slope: at the left paw it passes 8.0 points above the paw's
 * centre, which is what resting on it looks like, and at the right paw's place it
 * runs 28.1 points below — the paw was hanging clear of everything by 11.1 points.
 * Sliding it 38 degrees down the outline puts it back on the edge at the same 8.0.
 *
 * Both numbers are this screen's, not the artwork's: the sign-in screens rest the
 * same paws on the level top edge of a card, where they are right as they are. */
const MASCOT_RIGHT_HAND = { out: 6.31, turn: 38 } as const;

/** The tail, put back down this screen's back.
 *
 * The artwork carries a global 48-unit lift (TAIL_LIFT in the importer) that the
 * sign-in screens need: there the card covers the body's lower half, and a tail at
 * its natural height is swallowed by it. Nothing covers the body here, so the same
 * lift leaves the tail riding high up the back instead of coming off its base. */
const MASCOT_TAIL = { y: 26 } as const;

/** The Today's Focus icon's drawn height.
 *
 * Its export is 63.69 by 60, which is an icon sheet's size rather than this
 * pill's. 16 keeps the target ring the size the ring it replaced was drawn at:
 * both drawings give their ring about 92% of the canvas, so matching the canvas
 * height matches the ring, and the dart is the part that is new. */
const FOCUS_ICON = 16;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: homeColors.canvas },
  content: { paddingHorizontal: 16, paddingBottom: 120 },
  background: { position: 'absolute', top: 0, left: 0, right: 0, height: 874 },
  waveBack: { position: 'absolute', top: 113, left: -19 },
  mascot: { position: 'absolute', top: 89, right: -1 },
  // The hill, placed inside the character's box so it can be drawn between its body
  // and its hands. Same screen position as before: the box's left edge sits at
  // 402 - 220.205 + 1, and the hill is laid out at left -19, top 150.
  waveOverMascot: { position: 'absolute', left: -19 - (402 - MASCOT_WIDTH + 1), top: 150 - 89 },

  top: { height: 145, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  streak: { height: 40, borderRadius: 27, backgroundColor: homeColors.streakBorder, paddingBottom: 2 },
  streakFace: { flex: 1, borderRadius: 27, backgroundColor: homeColors.white, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 8 },
  streakText: { fontFamily: 'Geist_600SemiBold', fontSize: 22, color: homeColors.black },
  profile: { width: 40, height: 40, borderRadius: 20, backgroundColor: homeColors.placeholder, alignItems: 'center', justifyContent: 'center' },
  profileImage: { width: 40, height: 40, borderRadius: 20 },
  profileText: { fontFamily: 'Geist_600SemiBold', color: purple, fontSize: 15 },
  hero: { gap: 8 },
  focus: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 36, backgroundColor: homeColors.focus },
  focusText: { fontFamily: 'Geist_500Medium', fontSize: 16, color: homeColors.black },
  heroCopy: { alignSelf: 'flex-start', maxWidth: '58%', minHeight: 86, justifyContent: 'center', gap: 2 },
  count: { fontFamily: 'Oswald_600SemiBold', fontSize: 44, lineHeight: 52, color: purple },
  countUnit: { fontSize: 24 },
  subtitle: { fontFamily: 'Geist_500Medium', fontSize: 16, lineHeight: 22, color: purple },
  start: { marginTop: 8, height: 61, borderRadius: 42, backgroundColor: purple, paddingBottom: 4 },
  startFace: { flex: 1, borderRadius: 42, backgroundColor: homeColors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  playIcon: { transform: [{ rotate: '90deg' }] },
  startText: { fontFamily: 'Geist_500Medium', fontSize: 24, lineHeight: 32, color: homeColors.white },
  createAlternative: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  createAlternativeText: { fontFamily: 'Geist_600SemiBold', fontSize: 15, color: homeColors.deep },
  pickerOverlay: { flex: 1, backgroundColor: colors.modalScrim, justifyContent: 'flex-end' },
  picker: { maxHeight: '75%', backgroundColor: homeColors.canvas, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 10 },
  pickerHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: homeColors.border, alignSelf: 'center', marginBottom: 18 },
  pickerHeading: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 16 },
  pickerCopy: { flex: 1, gap: 4 },
  pickerTitle: { fontFamily: 'Oswald_600SemiBold', fontSize: 26, lineHeight: 34, color: homeColors.deep },
  pickerSubtitle: { fontFamily: 'Geist_500Medium', fontSize: 14, lineHeight: 20, color: homeColors.muted },
  pickerClose: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  pickerCloseText: { fontFamily: 'Geist_500Medium', fontSize: 28, color: homeColors.deep },
  pickerList: { flexGrow: 0 },
  pickerLesson: { minHeight: 72, padding: 12, marginBottom: 8, borderRadius: 20, backgroundColor: homeColors.white, flexDirection: 'row', alignItems: 'center', gap: 12 },
  pickerLessonName: { flex: 1, fontFamily: 'Geist_600SemiBold', fontSize: 16, color: homeColors.deep },
  stats: { marginTop: 16, backgroundColor: homeColors.border, borderRadius: 24, paddingBottom: 4 },
  statsFace: { backgroundColor: homeColors.white, borderRadius: 24, paddingVertical: 16, paddingHorizontal: 12, flexDirection: 'row' },
  stat: { flex: 1, alignItems: 'center', gap: 4 },
  statValue: { fontFamily: 'Oswald_600SemiBold', fontSize: 18, color: purple },
  statLabel: { fontFamily: 'Geist_500Medium', fontSize: 12, color: homeColors.muted },
  chartIcon: { width: 42, height: 42, backgroundColor: homeColors.chartBackground, borderRadius: 12, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 9, gap: 3 },
  bar: { width: 6, borderRadius: 2, backgroundColor: homeColors.chartBar },
  goalIcon: { width: 42, height: 42, borderRadius: 12, backgroundColor: homeColors.goalBackground, alignItems: 'center', justifyContent: 'center' },
  courses: { marginTop: 16, borderRadius: 24, backgroundColor: homeColors.border, paddingBottom: 4 },
  coursesFace: { paddingHorizontal: 12, paddingVertical: 24, borderRadius: 24, backgroundColor: homeColors.white, gap: 24 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontFamily: 'Geist_600SemiBold', fontSize: 20, color: homeColors.darkest },
  seeAll: { flexDirection: 'row', alignItems: 'center', minHeight: 24 },
  seeAllText: { fontFamily: 'Geist_500Medium', fontSize: 12, color: homeColors.muted },
  lesson: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  thumbnail: { width: 71, height: 56, borderRadius: 16, backgroundColor: homeColors.placeholder },
  lessonCopy: { flex: 1, gap: 4 },
  lessonTitle: { fontFamily: 'Oswald_600SemiBold', fontSize: 18, color: homeColors.darkest },
  lessonMeta: { ...type.lessonProgress, color: homeColors.muted },
  track: { height: 5, borderRadius: 14, backgroundColor: homeColors.track, overflow: 'hidden' },
  fill: { height: 5, borderRadius: 10, backgroundColor: homeColors.primary },
  startLoading: { opacity: 0.6 },
  startPressed: { transform: [{ scale: 0.98 }] },
  empty: { gap: 8 },
});
