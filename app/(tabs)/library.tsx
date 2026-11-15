import { LessonCover } from '@/components/LessonCover';
import { homeColors } from '@/theme/colors';
import { HomeAsset } from '@/components/HomeAsset';
import { Icon } from '@/components/Icon';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { loadFromCache, saveToCache } from '@/lib/cache';
import { supabase } from '@/lib/supabase';
import { buildLatestProgressMap } from '@/lib/termProgress';
import { colors, fonts, layout, radius, type } from '@/theme';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LedgePressable } from '@/components/ui/LedgePressable';
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
        sub: lesson.description || 'No description',
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

  const filteredLessons = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    const matched = lessons.filter((lesson) => {
      const matchesSearch = !search || `${lesson.title} ${lesson.sub}`.toLocaleLowerCase().includes(search);
      const matchesFilter = filter === 'all' || (filter === 'review' && lesson.due > 0) ||
        (filter === 'mastered' && lesson.cards > 0 && lesson.pct === 100) ||
        (filter === 'deadline' && deadlineOf(lesson) !== null);
      return matchesSearch && matchesFilter;
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

  // The heading does not scroll with the list: the page's name and its mark stay
  // where they are, and the list goes under them. What changes is how much room
  // they take. At the top of the page the name is as large as it was drawn; once
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
  const markSize = settle.interpolate({ inputRange: [0, 1], outputRange: [1, MARK_SMALL] });
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
        contentContainerStyle={[styles.content, { paddingBottom: 90 + Math.max(8, insets.bottom) }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListHeaderComponent={<View>
          <LinearGradient colors={[homeColors.gradientStart, homeColors.gradientBright, homeColors.canvas]} locations={[0, 0.48, 1]} style={[styles.hero, { paddingTop: insets.top + 22 }]}>
            <View style={{ height: headingHeight }} />
            <View style={styles.summary}>
              <View style={styles.summaryItem}><Text style={styles.summaryNumber}>{summary.lessons}</Text><Text style={styles.summaryLabel}>{summary.lessons === 1 ? 'Lesson' : 'Lessons'}</Text></View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}><Text style={styles.summaryNumber}>{summary.cards}</Text><Text style={styles.summaryLabel}>Cards</Text></View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}><Text style={styles.summaryNumber}>{summary.due}</Text><Text style={styles.summaryLabel}>To review</Text></View>
            </View>
          </LinearGradient>
          <View style={styles.tools}>
            <View style={styles.search}><Icon name="search" size={20} color={homeColors.muted} strokeWidth={1.8} /><TextInput value={query} onChangeText={setQuery} placeholder="Search lessons" placeholderTextColor={homeColors.muted} accessibilityLabel="Search lessons" returnKeyType="search" style={styles.searchInput} />{query.length > 0 && <Pressable onPress={() => setQuery('')} accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={8}><Icon name="close" size={20} color={homeColors.deep} /></Pressable>}</View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
              {FILTERS.map((item) => <Pressable key={item.id} accessibilityRole="button" accessibilityState={{ selected: filter === item.id }} onPress={() => setFilter(item.id)} style={[styles.filter, filter === item.id && styles.filterActive]}><Text style={[styles.filterLabel, filter === item.id && styles.filterLabelActive]}>{item.label}</Text></Pressable>)}
            </ScrollView>
            <View style={styles.sectionHeading}><Text accessibilityRole="header" style={styles.sectionTitle}>Lessons <Text style={styles.resultCount}>{filteredLessons.length}</Text></Text><Pressable accessibilityRole="button" accessibilityLabel="Create a new lesson" onPress={() => router.push('/create')} style={styles.newLesson}><Icon name="plus" size={18} color={homeColors.primary} /><Text style={styles.newLessonLabel}>New lesson</Text></Pressable></View>
          </View>
        </View>}
        renderItem={({ item }) => <LessonCard lesson={item} showDeadline={filter === 'deadline'} />}
        ListEmptyComponent={!loading ? <View style={styles.empty}>
          <MascotState kind={emptyContent.art} width={EMPTY_ART} />
          <Text style={styles.emptyTitle}>{emptyContent.title}</Text>
          <Text style={styles.emptyCopy}>{emptyContent.copy}</Text>
          <LedgePressable accessibilityRole="button" onPress={emptyContent.onPress} style={styles.emptyActionBase}><View style={styles.emptyAction}><Text style={styles.emptyActionText}>{emptyContent.action}</Text><Icon name="arrowRight" size={17} color={homeColors.white} /></View></LedgePressable>
        </View> : null}
      />
      <Animated.View pointerEvents="none" style={[styles.topBar, { transform: [{ translateY: pulled }] }]}>
        <Animated.View style={[styles.topBarSky, { height: insets.top + BAR_SKY, opacity: barSky }]}>
          <LinearGradient style={StyleSheet.absoluteFill}
            colors={[homeColors.gradientStart, homeColors.gradientStart, `${homeColors.gradientStart}00`]} locations={[0, 0.74, 1]} />
        </Animated.View>
        <Animated.View
          onLayout={(event) => setHeadingHeight(event.nativeEvent.layout.height)}
          style={[styles.headingRow, styles.topBarRow, { marginTop: insets.top + 22, transform: [{ translateY: rise }] }]}>
          <View style={styles.headingCopy}>
            <Animated.Text accessibilityRole="header" style={[styles.title, { transform: [{ scale: titleSize }] }]}>Your library</Animated.Text>
            <Animated.Text style={[styles.subtitle, { opacity: subtitleShown }]}>Everything you’re learning, in one place.</Animated.Text>
          </View>
          <Animated.View style={[styles.libraryIcon, { transform: [{ scale: markSize }] }]}><HomeAsset name="library" /></Animated.View>
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
/** How far up it travels to get there, and how small the name and mark become. */
const RISE = 12;
const TITLE_SMALL = 0.72;
const MARK_SMALL = 0.84;
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

function startOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today.getTime();
}
/** The deadline's day, at its start, in ms; or null when there is none or it does
 * not parse. */
function deadlineOf(lesson: LessonSummary): number | null {
  if (!lesson.deadline) return null;
  const at = new Date(lesson.deadline);
  if (Number.isNaN(at.getTime())) return null;
  at.setHours(0, 0, 0, 0);
  return at.getTime();
}
/** A deadline as time left, which is what a person reading a list of them wants. */
function timeLeft(lesson: LessonSummary): string | null {
  const at = deadlineOf(lesson);
  if (at === null) return null;
  const days = Math.round((at - startOfToday()) / 86400000);
  if (days < 0) return `Ended ${new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `${days} days left`;
}

function LessonCard({ lesson, showDeadline = false }: { lesson: LessonSummary; showDeadline?: boolean }) {
  const left = showDeadline ? timeLeft(lesson) : null;
  return <Pressable accessibilityRole="button" accessibilityLabel={`${lesson.title}.${lesson.learningMode === 'language' ? ' Language lesson.' : ''} ${lesson.cards} ${lesson.cards === 1 ? 'card' : 'cards'}. ${lesson.pct} percent mastered. ${lesson.due} cards remaining.`} accessibilityHint="Opens lesson details" onPress={() => router.push(`/lessons/${lesson.id}`)} style={({ pressed }) => [styles.cardBase, pressed && styles.cardPressed]}>
    <View style={styles.cardFace}>
      <View style={styles.cardHeading}><LessonCover id={lesson.id} mode={lesson.learningMode} coverStyle={lesson.coverStyle} width={56} height={56} /><View style={styles.cardCopy}><View style={styles.titleRow}><Text numberOfLines={2} style={styles.cardTitle}>{lesson.title}</Text>{lesson.learningMode === 'language' && <View style={styles.languageSticker} accessible={false}><MaterialIcons name="language" size={16} color={homeColors.white} /></View>}</View><Text numberOfLines={2} style={styles.description}>{lesson.sub}</Text></View><HomeAsset name="chevron" /></View>
      <View style={styles.cardBottom}><Text style={styles.cardCount}>{lesson.cards} {lesson.cards === 1 ? 'card' : 'cards'}{left ? <Text style={[styles.cardDeadline, left.startsWith('Ended') && styles.cardDeadlinePast]}>{` · ${left}`}</Text> : null}</Text><Text style={styles.review}>{lesson.cards === 0 ? 'No cards yet' : `${lesson.pct}% · ${lesson.due} cards remaining`}</Text></View>
      <View accessible={false} style={styles.track}><View style={[styles.fill, { width: `${Math.max(0, Math.min(100, lesson.pct))}%` }]} /></View>
    </View>
  </Pressable>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: homeColors.canvas },
  content: { paddingBottom: 125 },
  hero: { paddingHorizontal: layout.screenInline, paddingTop: 22, paddingBottom: 22, gap: 24 },
  headingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 },
  headingCopy: { flex: 1, gap: 4 },
  title: { fontFamily: fonts.display, fontSize: 36, lineHeight: 46, color: homeColors.deep, alignSelf: 'flex-start', transformOrigin: 'left center' },
  subtitle: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20, color: homeColors.deep },
  libraryIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: homeColors.focus, alignItems: 'center', justifyContent: 'center' },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0 },
  topBarSky: { position: 'absolute', top: 0, left: 0, right: 0 },
  topBarRow: { marginHorizontal: layout.screenInline },
  summary: { flexDirection: 'row', alignItems: 'center', backgroundColor: homeColors.white, borderRadius: 24, paddingVertical: 14, paddingHorizontal: 8, ...{ boxShadow: `0px 4px 0px ${homeColors.border}` } },
  summaryItem: { flex: 1, alignItems: 'center', gap: 2 },
  summaryNumber: { fontFamily: fonts.display, fontSize: 24, color: homeColors.deep },
  summaryLabel: { fontFamily: fonts.medium, fontSize: 12, color: homeColors.muted },
  summaryDivider: { width: 1, height: 32, backgroundColor: homeColors.border },
  tools: { paddingHorizontal: layout.screenInline, gap: 16, paddingBottom: 12 },
  search: { height: 52, borderRadius: 26, backgroundColor: homeColors.white, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, borderWidth: 1, borderColor: homeColors.border },
  searchInput: { flex: 1, fontFamily: fonts.medium, fontSize: 15, color: homeColors.darkest, paddingVertical: 0, height: '100%' },
  filters: { gap: 8, paddingBottom: 2 },
  filter: { minHeight: 40, paddingHorizontal: 16, borderRadius: 24, backgroundColor: homeColors.white, borderWidth: 1, borderColor: homeColors.border, alignItems: 'center', justifyContent: 'center' },
  filterActive: { backgroundColor: homeColors.selected, borderColor: homeColors.selected },
  filterLabel: { fontFamily: fonts.medium, fontSize: 14, color: homeColors.deep },
  filterLabelActive: { fontFamily: fonts.semibold },
  sectionHeading: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  sectionTitle: { fontFamily: fonts.semibold, fontSize: 20, color: homeColors.darkest },
  resultCount: { fontFamily: fonts.medium, fontSize: 14, color: homeColors.muted },
  newLesson: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4 },
  newLessonLabel: { fontFamily: fonts.semibold, fontSize: 14, color: homeColors.primary },
  separator: { height: 12 },
  cardBase: { marginHorizontal: layout.screenInline, borderRadius: 24, backgroundColor: homeColors.border, paddingBottom: 4 },
  cardPressed: { opacity: 0.8 },
  cardFace: { borderRadius: 24, backgroundColor: homeColors.white, padding: 16, gap: 12 },
  cardHeading: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardCopy: { flex: 1, gap: 4 },
  cardTitle: { flexShrink: 1, fontFamily: fonts.display, fontSize: 20, color: homeColors.darkest },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  languageSticker: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: homeColors.primary, transform: [{ rotate: '-8deg' }], boxShadow: `0px 2px 0px ${homeColors.border}` },
  description: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, color: colors.supporting },
  cardBottom: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  cardDeadline: { fontFamily: fonts.semibold, color: homeColors.primary },
  // A date already gone is a fact, not a call to hurry.
  cardDeadlinePast: { fontFamily: fonts.medium, color: homeColors.muted },
  cardCount: { fontFamily: fonts.medium, fontSize: 12, color: homeColors.deep },
  review: { ...type.lessonProgress, color: homeColors.muted },
  track: { height: 5, borderRadius: radius.pill, backgroundColor: homeColors.track, overflow: 'hidden' },
  fill: { height: 5, borderRadius: radius.pill, backgroundColor: homeColors.primary },
  empty: { marginHorizontal: layout.screenInline, paddingHorizontal: 24, paddingTop: 14, paddingBottom: 24, alignItems: 'center' },
  emptyTitle: { fontFamily: fonts.semibold, fontSize: 18, lineHeight: 26, color: homeColors.darkest, textAlign: 'center', marginTop: 12 },
  emptyCopy: { ...type.bodyReading, color: homeColors.muted, textAlign: 'center', marginTop: 2, maxWidth: 290 },
  emptyActionBase: { marginTop: 16, borderRadius: 24, backgroundColor: homeColors.deep, paddingBottom: 3 },
  emptyAction: { minHeight: 45, borderRadius: 24, backgroundColor: homeColors.primary, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyActionText: { fontFamily: fonts.semibold, fontSize: 14, color: homeColors.white },
});
