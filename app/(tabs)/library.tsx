import { oneLine } from '@/theme/typography';
import { componentTokens } from '@/theme';
import { LanguageBadge } from '@/components/LanguageBadge';
import { Card } from '@/components/ui/Card';
import { LessonCover } from '@/components/LessonCover';
import { deadlineLeft } from '@/lib/studyPlan';
import { HomeAsset } from '@/components/HomeAsset';
import { Icon } from '@/components/ui/Icon';
import { LinearGradient } from 'expo-linear-gradient';
import { loadFromCache, saveToCache } from '@/lib/cache';
import { supabase } from '@/lib/supabase';
import { buildLatestProgressMap } from '@/lib/termProgress';
import { space, colors, fonts, layout, radius, type } from '@/theme';
import { router, useFocusEffect, useIsFocused } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/Button';
import { SearchField } from '@/components/ui/SearchField';
import { LedgePressable } from '@/components/ui/LedgePressable';
import { FilterMenu } from '@/components/ui/FilterMenu';
import { CountUp, ProgressFill } from '@/components/motion/Grow';
import { MascotState } from '@/components/mascot/MascotState';
import type { MascotStateKind } from '@/components/mascot/states';
import { isOffline } from '@/lib/networkError';

interface LessonSummary {
  id: string;
  title: string;
  sub: string;
  cards: number;
  due: number;
  pct: number;
  learningMode?: 'language' | 'knowledge';
  coverStyle?: string | null;
  /** The date the person wants this learned by. Absent on a list cached before it
   * was kept. */
  deadline?: string | null;
}

type LearningStage = 'New' | 'Learning' | 'Familiar' | 'Good' | 'Strong' | 'Mastered';

const LEARNING_STAGE_WEIGHTS: Record<LearningStage, number> = {
  New: 0,
  Learning: 0.2,
  Familiar: 0.4,
  Good: 0.6,
  Strong: 0.8,
  Mastered: 1.0,
};

const getStatusWeight = (status?: LearningStage | null): number => {
  if (!status) return LEARNING_STAGE_WEIGHTS.New;
  return LEARNING_STAGE_WEIGHTS[status] ?? LEARNING_STAGE_WEIGHTS.New;
};

export default function LibraryScreen() {
  const insets = useSafeAreaInsets();
  const [lessons, setLessons] = useState<LessonSummary[]>([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<LessonFilter>('all');
  /** Counts each arrival on Library. The summary's numbers and every card's progress
   * are keyed by it, so they count and fill again whenever the tab is opened — the
   * tab stays mounted underneath, and would otherwise only do it the first time. */
  const focused = useIsFocused();
  const [visit, setVisit] = useState(0);
  useEffect(() => { if (focused) setVisit((n) => n + 1); }, [focused]);
  const [loading, setLoading] = useState(true);
  // Not just whether it failed but which way: no connection is the person's to fix
  // and is said differently from a failure that is ours.
  const [loadError, setLoadError] = useState<false | 'error' | 'offline'>(false);

  const fetchLessons = useCallback(async () => {
    setLoadError(false);
    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;
    if (!user) {
      setLessons([]);
      setLoading(false);
      return;
    }

    // 先从本地缓存加载，立即显示（stale-while-revalidate）
    const cached = await loadFromCache<LessonSummary[]>('LESSONS', user.id);
    if (cached && cached.length > 0) {
      setLessons(cached);
      setLoading(false);
    }

    const { data: lessonsData, error: lessonsError } = await supabase
      .from('lessons')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (lessonsError || !lessonsData) {
      if (!cached?.length) setLoadError(isOffline(lessonsError) ? 'offline' : 'error');
      setLoading(false);
      return;
    }

    const lessonIds = lessonsData.map((l) => l.id);
    if (lessonIds.length === 0) {
      setLessons([]);
      setLoading(false);
      return;
    }

    const { data: termsData } = await supabase
      .from('terms')
      .select('id, lesson_id')
      .in('lesson_id', lessonIds);

    const termIds = termsData?.map((t) => t.id) || [];
    const { data: progressData } = termIds.length
      ? await supabase
          .from('user_term_progress')
          .select('term_id, status, last_reviewed_at')
          .eq('user_id', user.id)
          .in('term_id', termIds)
      : { data: [] as { term_id: string; status: string | null; last_reviewed_at: string | null }[] };

    const progressMap = buildLatestProgressMap(progressData || []);

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
        const status = progressMap.get(term.id) as LearningStage | null | undefined;
        weightedScore += getStatusWeight(status);
      });

      // 与 lesson 详情页保持一致：使用加权进度，并用 round 后的 reviewed 计算 due
      const pct = cards > 0 ? Math.round((weightedScore / cards) * 100) : 0;
      const reviewedCount = Math.round(weightedScore);
      const due = Math.max(cards - reviewedCount, 0);

      return {
        id: lesson.id,
        coverStyle: lesson.cover_style,
        title: lesson.name || 'Untitled lesson',
        sub: lesson.description?.trim() || '',
        cards,
        due,
        pct,
        learningMode: lesson.learning_mode === 'language' ? 'language' : 'knowledge',
        deadline: lesson.deadline ?? null,
      };
    });

    setLessons(nextLessons);
    setLoading(false);
    // 保存到本地，下次打开立即可见
    void saveToCache('LESSONS', nextLessons, user.id);
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchLessons();
    }, [fetchLessons])
  );

  const summary = useMemo(() => {
    const cards = lessons.reduce((sum, lesson) => sum + lesson.cards, 0);
    const due = lessons.reduce((sum, lesson) => sum + lesson.due, 0);
    return { lessons: lessons.length, cards, due };
  }, [lessons]);

  // How many lessons each filter would leave, shown beside it in the menu, so a
  // filter that leaves none can be seen to before it is chosen.
  const filterOptions = useMemo(() => FILTERS.map((item) => ({
    ...item, count: lessons.filter((lesson) => inFilter(lesson, item.id)).length,
  })), [lessons]);

  const filteredLessons = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    const matched = lessons.filter((lesson) => {
      const matchesSearch = !search || `${lesson.title} ${lesson.sub}`.toLocaleLowerCase().includes(search);
      return matchesSearch && inFilter(lesson, filter);
    });
    // With a deadline, the order that matters is which comes first: the soonest at
    // the top, and the ones already past after every one still ahead.
    if (filter !== 'deadline') return matched;
    const today = startOfToday();
    return [...matched].sort((a, b) => {
      const da = deadlineOf(a)!, db = deadlineOf(b)!;
      const pa = da < today, pb = db < today;
      if (pa !== pb) return pa ? 1 : -1;
      return pa ? db - da : da - db;
    });
  }, [lessons, query, filter]);
  const searching = query.trim().length > 0;
  const retry = () => { setLoading(true); void fetchLessons(); };
  // Each empty list says why it is empty, in words and in the picture over them,
  // and its button is the next thing to do about that particular emptiness — not
  // a way back to where the person just was.
  const studied = lessons.filter((lesson) => lesson.cards > 0);
  /** The lesson nearest to being mastered: where to go when nothing is due. */
  const nearest = studied.reduce<LessonSummary | null>((best, lesson) => (!best || lesson.pct > best.pct ? lesson : best), null);
  /** The lesson with the most left to learn: the one a deadline would help most. */
  const heaviest = studied.reduce<LessonSummary | null>((best, lesson) => (!best || lesson.due > best.due ? lesson : best), null);
  const startLearning = () => router.push(summary.due > 0 ? '/quiz?entry=home' : `/lessons/${nearest?.id}`);
  // One short line each. The picture already says how to feel about it; the line
  // only has to say what to do.
  const emptyContent: { art: MascotStateKind; title: string; copy: string; action: string; onPress: () => void } =
    loadError === 'offline' ? { art: 'offline', title: 'You’re offline', copy: 'Reconnect to load your lessons.', action: 'Try again', onPress: retry }
    : loadError ? { art: 'error', title: 'Couldn’t load lessons', copy: 'Your lessons are safe. Try again.', action: 'Try again', onPress: retry }
    : lessons.length === 0 ? { art: 'empty', title: 'Start your first lesson', copy: 'Turn any topic into cards.', action: 'Create a lesson', onPress: () => router.push('/create') }
    : searching ? (filter === 'all'
      ? { art: 'noResults', title: 'No matches', copy: 'Try a shorter word.', action: 'Clear search', onPress: () => setQuery('') }
      : { art: 'noResults', title: 'No matches', copy: 'It may be under another filter.', action: 'Search all lessons', onPress: () => setFilter('all') })
    : filter === 'review' ? { art: 'caughtUp', title: 'All caught up', copy: 'Nothing is due right now.', action: 'Learn something new', onPress: () => router.push('/create') }
    : filter === 'mastered' ? (studied.length === 0
      ? { art: 'empty', title: 'Nothing mastered yet', copy: 'Add cards to start learning.', action: 'Add cards', onPress: () => router.push(`/lessons/${lessons[0].id}/add-terms`) }
      : { art: 'empty', title: 'Nothing mastered yet', copy: 'Keep reviewing to get there.', action: 'Start learning', onPress: startLearning })
    : studied.length === 0
      ? { art: 'empty', title: 'No deadlines yet', copy: 'Set a date to pace your reviews.', action: 'View lessons', onPress: () => setFilter('all') }
      : { art: 'empty', title: 'No deadlines yet', copy: 'Set a date to pace your reviews.', action: 'Set a deadline', onPress: () => router.push(`/lessons/${heaviest!.id}/settings`) };

  // The heading does not scroll with the list: the page's name stays where it
  // is, and the list goes under it. What changes is how much room it takes. At the top of the page the name is as large as it was drawn; once
  // the list has moved it settles to the size of a bar, the line under it goes, and
  // a band of the page's own sky comes in behind so the cards passing beneath do
  // not run through the letters.
  const scrolled = useRef(new Animated.Value(0)).current;
  /** The same offset, readable here, and the height the list is shown in. */
  const offset = useRef(0);
  const viewport = useRef(0);
  const settle = scrolled.interpolate({ inputRange: [0, SETTLE], outputRange: [0, 1], extrapolate: 'clamp' });
  const barSky = scrolled.interpolate({ inputRange: [6, SETTLE], outputRange: [0, 1], extrapolate: 'clamp' });
  // Pulled down past the top, the heading goes with the page rather than letting
  // it stretch away from under it.
  const pulled = scrolled.interpolate({ inputRange: [-1, 0], outputRange: [1, 0], extrapolateRight: 'clamp' });
  const rise = settle.interpolate({ inputRange: [0, 1], outputRange: [0, -RISE] });
  const titleSize = settle.interpolate({ inputRange: [0, 1], outputRange: [1, TITLE_SMALL] });
  const subtitleShown = scrolled.interpolate({ inputRange: [0, SETTLE * 0.5], outputRange: [1, 0], extrapolate: 'clamp' });
  // The list leaves the heading's room empty at its top; the room is measured, so
  // a subtitle that wraps at a larger text size is still cleared.
  const [headingHeight, setHeadingHeight] = useState(HEADING_HEIGHT);

  return (
    <View style={styles.root}>
      <Animated.FlatList
        data={filteredLessons}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrolled } } }], {
          useNativeDriver: true,
          listener: (event: { nativeEvent: { contentOffset: { y: number } } }) => { offset.current = event.nativeEvent.contentOffset.y; },
        })}
        onLayout={(event) => { viewport.current = event.nativeEvent.layout.height; }}
        onContentSizeChange={(_, height) => {
          // A filter that leaves fewer lessons makes the list shorter than where it
          // was scrolled to, and the list is put back within its new length without
          // telling anyone it moved. The heading would stay settled into a bar over
          // a page that is back at its top, so it is told here.
          const furthest = Math.max(0, height - viewport.current);
          if (offset.current > furthest) {
            offset.current = furthest;
            scrolled.setValue(furthest);
          }
        }}
        keyExtractor={(lesson) => lesson.id}
        extraData={visit}
        contentContainerStyle={[styles.content, { paddingBottom: 90 + Math.max(8, insets.bottom) }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListHeaderComponent={<View>
          <LinearGradient colors={[colors.limePale, colors.limeBright, colors.bg]} locations={[0, 0.48, 1]} style={[styles.hero, { paddingTop: insets.top + 22 }]}>
            <View style={{ height: headingHeight }} />
            <Card pad="sm" gap={0} faceStyle={styles.summary}>
              <View style={styles.summaryItem}><CountUp key={`l${visit}`} value={summary.lessons} style={styles.summaryNumber} /><Text style={styles.summaryLabel}>{summary.lessons === 1 ? 'Lesson' : 'Lessons'}</Text></View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}><CountUp key={`c${visit}`} value={summary.cards} delay={70} style={styles.summaryNumber} /><Text style={styles.summaryLabel}>Cards</Text></View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}><CountUp key={`d${visit}`} value={summary.due} delay={140} style={styles.summaryNumber} /><Text style={styles.summaryLabel}>To review</Text></View>
            </Card>
          </LinearGradient>
          <View style={styles.tools}>
            <View style={styles.searchRow}>
            <FilterMenu label="Filter lessons" options={filterOptions} value={filter} onChange={setFilter} />
            <SearchField label="Search lessons" value={query} onChangeText={setQuery} />
            </View>
            <View style={styles.sectionHeading}><Text accessibilityRole="header" style={styles.sectionTitle}>{filter === 'all' ? 'Lessons' : FILTERS.find((item) => item.id === filter)!.label} <Text style={styles.resultCount}>{filteredLessons.length}</Text></Text><Pressable accessibilityRole="button" accessibilityLabel="Make new cards" onPress={() => router.push('/create')} style={styles.newLesson}><Icon name="plus" size={18} color={colors.action} /><Text style={styles.newLessonLabel}>New cards</Text></Pressable></View>
          </View>
        </View>}
        renderItem={({ item, index }) => <LessonCard lesson={item} order={index} visit={visit} />}
        ListEmptyComponent={!loading ? <View style={styles.empty}>
          <MascotState kind={emptyContent.art} width={EMPTY_ART} />
          <Text style={styles.emptyTitle}>{emptyContent.title}</Text>
          <Text style={styles.emptyCopy}>{emptyContent.copy}</Text>
          <Button size="md" style={styles.emptyActionBase} label={emptyContent.action} onPress={emptyContent.onPress}
            iconEnd={<Icon name="arrowRight" size={17} color={colors.surf} />} />
        </View> : null}
      />
      <Animated.View pointerEvents="none" style={[styles.topBar, { transform: [{ translateY: pulled }] }]}>
        <Animated.View style={[styles.topBarSky, { height: insets.top + BAR_SKY, opacity: barSky }]}>
          <LinearGradient style={StyleSheet.absoluteFill}
            colors={[colors.limePale, colors.limePale, `${colors.limePale}00`]} locations={[0, 0.74, 1]} />
        </Animated.View>
        <Animated.View
          onLayout={(event) => setHeadingHeight(event.nativeEvent.layout.height)}
          style={[styles.headingRow, styles.topBarRow, { marginTop: insets.top + 22, transform: [{ translateY: rise }] }]}>
          <View style={styles.headingCopy}>
            <Animated.Text accessibilityRole="header" style={[styles.title, { transform: [{ scale: titleSize }] }]}>Your library</Animated.Text>
            <Animated.Text style={[styles.subtitle, { opacity: subtitleShown }]}>Everything you’re learning, in one place.</Animated.Text>
          </View>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

/** The side of the picture over an empty list. Small enough that, under the
 * library's header, the picture, its two lines and the button all clear the tab
 * bar on a phone: the button is the point of the state, and one hidden under the
 * tabs is no use. */
const EMPTY_ART = 116;
/** How far the list moves before the heading has finished settling into a bar. */
const SETTLE = 48;
/** How far up it travels to get there, and how small the name becomes. */
const RISE = 12;
const TITLE_SMALL = 0.72;
/** The sky behind the settled bar, below the status bar: solid behind the name,
 * gone by its lower edge. */
const BAR_SKY = 100;
/** The heading's height before it has been measured: the name and one line. */
const HEADING_HEIGHT = 70;

/** The filters. There was a "No cards" one; it found the lessons a person had
 * made and not filled, which is something every lesson card already says on its
 * face, and almost never more than one. A deadline is what a person actually
 * plans around, so that is the filter now. */
type LessonFilter = 'all' | 'review' | 'mastered' | 'deadline';
const FILTERS: { id: LessonFilter; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'review', label: 'To review' },
  { id: 'mastered', label: 'Mastered' }, { id: 'deadline', label: 'Deadline' },
];

function inFilter(lesson: LessonSummary, filter: LessonFilter) {
  return filter === 'all' || (filter === 'review' && lesson.due > 0) ||
    (filter === 'mastered' && lesson.cards > 0 && lesson.pct === 100) ||
    (filter === 'deadline' && deadlineOf(lesson) !== null);
}

function startOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today.getTime();
}
/** The deadline's day, at its start, in ms; or null when there is none or it does
 * not parse. Sorting and filtering want the instant; the row wants the words,
 * which are lib/studyPlan's `deadlineLeft`. */
function deadlineOf(lesson: LessonSummary): number | null {
  if (!lesson.deadline) return null;
  const at = new Date(lesson.deadline);
  if (Number.isNaN(at.getTime())) return null;
  at.setHours(0, 0, 0, 0);
  return at.getTime();
}

/** A card opens its lesson, so it is a button and presses like one: the face goes
 * down onto its lip. The press waits a moment before it shows, so a finger that
 * lands on a card to scroll the list does not push it. */
const SCROLL_GRACE_MS = 70;

/** How long after the one above a card's progress starts to fill, and the most any
 * card waits: the cards below the fold have no reason to wait for the ones above. */
const FILL_STAGGER_MS = 80;
const FILL_STAGGER_MAX = 6;

/** What a lesson is asking of you, in one phrase.
 *
 * The row used to say four things — the card count, the deadline, the percentage
 * and the number left — in two clusters joined by three middots, all at much the
 * same weight. The percentage is the bar underneath, drawn rather than written,
 * so it is gone from the words. The size of the lesson stays, because a library
 * is a catalogue and "six to review" means something different in a deck of ten
 * than in one of two hundred — but it rides inside the same phrase rather than
 * sitting in a cluster of its own, in the wording the lesson's own page uses for
 * the same pair of numbers ("0 of 14 mastered").
 */
function standing(lesson: LessonSummary): string {
  if (lesson.cards === 0) return 'No cards yet';
  if (lesson.due === 0) return 'All caught up';
  return `${lesson.due} of ${lesson.cards} to review`;
}

function LessonCard({ lesson, order = 0, visit = 0 }: { lesson: LessonSummary; order?: number; visit?: number }) {
  // It used to appear only under the Deadline filter, which meant that in the list
  // a person actually reads — all of them — a lesson with a date on it looked
  // exactly like one without.
  const left = deadlineLeft(lesson.deadline);
  return <LedgePressable accessibilityRole="button" accessibilityLabel={`${lesson.title}.${lesson.learningMode === 'language' ? ' Language lesson.' : ''} ${standing(lesson)}.${left ? ` ${left.text}.` : ''} ${lesson.pct} percent mastered.`} accessibilityHint="Opens lesson details" onPress={() => router.push(`/lessons/${lesson.id}`)} unstable_pressDelay={SCROLL_GRACE_MS} style={styles.cardBase}>
    <View style={styles.cardFace}>
      <View style={styles.cardHeading}><LessonCover id={lesson.id} mode={lesson.learningMode} coverStyle={lesson.coverStyle} width={56} height={56} /><View style={styles.cardCopy}><View style={styles.titleRow}><Text numberOfLines={2} style={styles.cardTitle}>{lesson.title}</Text>{lesson.learningMode === 'language' && <LanguageBadge />}</View>{!!lesson.sub && <Text numberOfLines={2} style={styles.description}>{lesson.sub}</Text>}</View><HomeAsset name="chevron" /></View>
      <View style={styles.cardBottom}>
        <Text numberOfLines={1} style={styles.cardLead}>{standing(lesson)}</Text>
        {left ? <Text style={[styles.cardDeadline, left.past && styles.cardDeadlinePast]}>{left.text}</Text> : null}
      </View>
      <View accessible={false} style={styles.track}><ProgressFill key={`fill${visit}`} pct={lesson.pct} delay={150 + Math.min(order, FILL_STAGGER_MAX) * FILL_STAGGER_MS} style={styles.fill} /></View>
    </View>
  </LedgePressable>;
}

const card = componentTokens.card;
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingBottom: 125 },
  hero: { paddingHorizontal: layout.screenInline, paddingTop: space[5], paddingBottom: space[5], gap: space[6] },
  headingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: space[4] },
  headingCopy: { flex: 1, gap: space[1] },
  title: { ...oneLine(type.title), color: colors.sub, alignSelf: 'flex-start', transformOrigin: 'left center' },
  subtitle: { ...type.small, fontFamily: fonts.medium, color: colors.sub },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0 },
  topBarSky: { position: 'absolute', top: 0, left: 0, right: 0 },
  topBarRow: { marginHorizontal: layout.screenInline },
  summary: { flexDirection: 'row', alignItems: 'center' },
  summaryItem: { flex: 1, alignItems: 'center', gap: space.hair },
  summaryNumber: { ...oneLine(type.page), color: colors.sub },
  summaryLabel: { ...type.caption, color: colors.faint },
  summaryDivider: { width: 1, height: 32, backgroundColor: colors.line },
  tools: { paddingHorizontal: layout.screenInline, gap: space[4], paddingBottom: space[3] },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  sectionHeading: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[3] },
  sectionTitle: { ...oneLine(type.heading), color: colors.text },
  resultCount: { ...type.small, fontFamily: fonts.medium, color: colors.faint },
  newLesson: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: space[1] },
  newLessonLabel: { ...type.small, fontFamily: fonts.semibold, color: colors.action },
  separator: { height: 12 },
  // The two layers of components/ui/Card. They are written out because the row is
  // a LedgePressable — it presses flat, and the press has to drive both layers.
  cardBase: { marginHorizontal: layout.screenInline, borderRadius: card.radius.lg, backgroundColor: card.shell, paddingBottom: card.lip },
  cardFace: { borderRadius: card.radius.lg, backgroundColor: card.face, padding: card.pad.md, gap: card.gap },
  cardHeading: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  cardCopy: { flex: 1, gap: space[1] },
  cardTitle: { ...type.heading, fontFamily: fonts.display, flexShrink: 1, color: colors.text },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  description: { ...type.caption, fontFamily: fonts.regular, color: colors.sub },
  cardBottom: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: space[2] },
  // The row is one ink in two steps, not an accent beside a neutral: a live
  // deadline sits at the lead's own weight and colour, and one that has gone by
  // drops a step back. The action purple it used to take is a different hue, and
  // against the reading ink two words away it jumped off the line.
  cardDeadline: { ...type.small, fontFamily: fonts.semibold, color: colors.sub },
  cardDeadlinePast: { fontFamily: fonts.medium, color: colors.faint },
  // A date already gone is a fact, not a call to hurry.
  // The lead: heavier than the description above it, so the eye lands on what
  // there is to do rather than on what the lesson is about.
  cardLead: { ...type.small, fontFamily: fonts.semibold, flexShrink: 1, color: colors.sub },
  track: { height: 5, borderRadius: radius.pill, backgroundColor: colors.tint, overflow: 'hidden' },
  fill: { height: 5, borderRadius: radius.pill, backgroundColor: colors.action },
  empty: { marginHorizontal: layout.screenInline, paddingHorizontal: space[6], paddingTop: space[3], paddingBottom: space[6], alignItems: 'center' },
  emptyTitle: { ...type.body, fontFamily: fonts.semibold, color: colors.text, textAlign: 'center', marginTop: space[3] },
  emptyCopy: { ...type.small, color: colors.faint, textAlign: 'center', marginTop: space.hair, maxWidth: 290 },
  emptyActionBase: { marginTop: space[4] },
});
