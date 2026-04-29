import { isCacheExpired, loadFromCache, saveToCache } from '@/lib/cache';
import { supabase } from '@/lib/supabase';
import { useNavigation } from '@react-navigation/native';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// ── Types ─────────────────────────────────────────────────────────
interface Lesson {
  id: string;
  name: string;
  description: string | null;
  deadline: string | null;
  created_at: string;
  terms_count?: number;
  completed_terms?: number;
  progress_percent?: number;
}

// ── Editorial Design Tokens ───────────────────────────────────────
const ED = {
  bg: '#FAFAF8',
  surf: '#FFFFFF',
  border: '#E5E3DE',
  accent: '#1A8A72',
  accentL: '#E6F5F2',
  text: '#1A1916',
  sub: '#37352F',
  muted: '#9B9790',
  dim: '#D8D5CF',
};

const MONO = Platform.select({
  ios: 'Courier New',
  default: 'monospace',
});

// ── Learning Stage Weights ────────────────────────────────────────
const LEARNING_STAGE_WEIGHTS: Record<string, number> = {
  New: 0, Learning: 0.2, Familiar: 0.4, Good: 0.6, Strong: 0.8, Mastered: 1.0,
};
const getStatusWeight = (s: string | null | undefined) =>
  !s || s === 'New' ? 0 : LEARNING_STAGE_WEIGHTS[s] || 0;

// Expo Router options
export const options = { headerShown: false };

export default function LessonsListScreen() {
  const navigation = useNavigation();
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    navigation.setOptions({ headerShown: false, header: () => null });
  }, [navigation]);

  const fetchLessons = async (useCache: boolean = true) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      if (useCache && loading && !refreshing) {
        const cached = await loadFromCache<Lesson[]>('LESSONS');
        if (cached && cached.length > 0) {
          setLessons(cached);
          setLoading(false);
        }
      }

      const { data: lessonsData, error: lessonsError } = await supabase
        .from('lessons').select('*').eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (lessonsError) {
        if (!useCache || lessons.length === 0) setLessons([]);
        return;
      }
      if (!lessonsData || lessonsData.length === 0) {
        setLessons([]); await saveToCache('LESSONS', []); return;
      }

      const lessonIds = lessonsData.map(l => l.id);
      const { data: allTermsData } = await supabase
        .from('terms').select('id, lesson_id').in('lesson_id', lessonIds);
      const allTermIds = allTermsData?.map(t => t.id) || [];
      const { data: allProgressData } = allTermIds.length > 0
        ? await supabase.from('user_term_progress').select('term_id, status')
            .eq('user_id', user.id).in('term_id', allTermIds)
        : { data: [] };

      const progressMap = new Map<string, string>();
      allProgressData?.forEach(p => progressMap.set(p.term_id, p.status));

      const termsByLesson = new Map<string, typeof allTermsData>();
      allTermsData?.forEach(term => {
        if (!termsByLesson.has(term.lesson_id)) termsByLesson.set(term.lesson_id, []);
        termsByLesson.get(term.lesson_id)!.push(term);
      });

      const lessonsWithCounts = lessonsData.map(lesson => {
        const lessonTerms = termsByLesson.get(lesson.id) || [];
        let completedTerms = 0;
        let weightedScore = 0;
        lessonTerms.forEach(term => {
          const status = progressMap.get(term.id) || null;
          weightedScore += getStatusWeight(status);
          if (status === 'Strong' || status === 'Mastered') completedTerms++;
        });
        return {
          ...lesson,
          terms_count: lessonTerms.length,
          completed_terms: completedTerms,
          progress_percent: lessonTerms.length > 0
            ? Math.round((weightedScore / lessonTerms.length) * 100) : 0,
        };
      });

      setLessons(lessonsWithCounts);
      await saveToCache('LESSONS', lessonsWithCounts);
    } catch (error) {
      if (!useCache || lessons.length === 0) setLessons([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchLessons(true); }, []);

  useFocusEffect(
    useCallback(() => {
      const checkAndRefresh = async () => {
        const expired = await isCacheExpired('LESSONS');
        if (expired) fetchLessons(false);
      };
      checkAndRefresh();
    }, [])
  );

  const onRefresh = () => { setRefreshing(true); fetchLessons(false); };

  // Derived totals
  const totalCards = lessons.reduce((s, l) => s + (l.terms_count || 0), 0);
  const totalDue = lessons.reduce((s, l) => {
    const due = Math.max(0, (l.terms_count || 0) - (l.completed_terms || 0));
    return s + due;
  }, 0);

  const filtered = lessons.filter(l =>
    !search.trim() ||
    l.name.toLowerCase().includes(search.toLowerCase()) ||
    (l.description || '').toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={ED.accent} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ED.accent} />
        }
      >
        {/* ── Header ──────────────────────────────────────────── */}
        <View style={styles.topBar}>
          <Text style={styles.topBarTitle}>Library</Text>
          <TouchableOpacity
            style={styles.filterBtn}
            onPress={() => router.push('/(tabs)/create')}
            activeOpacity={0.7}
          >
            <Text style={styles.filterBtnText}>+ New</Text>
          </TouchableOpacity>
        </View>

        {/* ── Search ──────────────────────────────────────────── */}
        <View style={styles.searchBar}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search decks"
            placeholderTextColor={ED.muted}
            value={search}
            onChangeText={setSearch}
          />
        </View>

        {/* ── Stats summary ────────────────────────────────────── */}
        <View style={styles.statsRow}>
          {[
            { v: String(lessons.length), l: 'decks' },
            { v: String(totalCards), l: 'cards' },
            { v: String(totalDue), l: 'due' },
          ].map((s, i) => (
            <View key={s.l} style={[styles.statCell, i < 2 && styles.statCellBorder]}>
              <Text style={styles.statVal}>{s.v}</Text>
              <Text style={styles.statLabel}>{s.l}</Text>
            </View>
          ))}
        </View>

        {/* ── Deck list ────────────────────────────────────────── */}
        <View style={styles.deckSection}>
          <View style={styles.deckSectionHeader}>
            <Text style={styles.sectionLabel}>All Decks</Text>
          </View>

          {filtered.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyTitle}>
                {search ? 'No decks found' : 'No lessons yet'}
              </Text>
              <Text style={styles.emptyText}>
                {search
                  ? 'Try a different search term.'
                  : 'Create your first lesson to get started!'}
              </Text>
              {!search && (
                <TouchableOpacity
                  style={styles.emptyBtn}
                  onPress={() => router.push('/(tabs)/create')}
                  activeOpacity={0.8}
                >
                  <Text style={styles.emptyBtnText}>Create Lesson</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <View style={styles.deckList}>
              {filtered.map(lesson => {
                const pct = lesson.progress_percent || 0;
                const due = Math.max(0, (lesson.terms_count || 0) - (lesson.completed_terms || 0));
                return (
                  <TouchableOpacity
                    key={lesson.id}
                    style={styles.deckCard}
                    onPress={() => router.push(`/lessons/${lesson.id}` as any)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.deckCardTop}>
                      <Text style={styles.deckTitle} numberOfLines={2}>{lesson.name}</Text>
                      <Text style={[styles.deckDue, due === 0 && styles.deckCaughtUp]}>
                        {due > 0 ? `${due} due` : 'caught up'}
                      </Text>
                    </View>
                    {lesson.description ? (
                      <Text style={styles.deckDesc} numberOfLines={1}>{lesson.description}</Text>
                    ) : null}
                    <View style={styles.deckBottom}>
                      <View style={styles.deckProgressTrack}>
                        <View style={[styles.deckProgressFill, { width: `${pct}%` as any }]} />
                      </View>
                      <Text style={styles.deckCards}>{lesson.terms_count || 0} cards</Text>
                      <Text style={styles.deckPct}>{pct}%</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: ED.bg },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollView: { flex: 1 },
  scrollContent: { paddingBottom: 80 },

  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: ED.border,
  },
  topBarTitle: {
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: -0.025 * 19,
    color: ED.text,
  },
  filterBtn: { paddingVertical: 4, paddingHorizontal: 2 },
  filterBtnText: { fontSize: 12, color: ED.accent, fontWeight: '600' },

  searchBar: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: ED.border,
    backgroundColor: ED.surf,
  },
  searchInput: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: ED.border,
    borderRadius: 8,
    fontSize: 13,
    color: ED.text,
    backgroundColor: ED.bg,
  },

  statsRow: {
    flexDirection: 'row',
    backgroundColor: ED.surf,
    borderBottomWidth: 1,
    borderBottomColor: ED.border,
  },
  statCell: { flex: 1, padding: 14 },
  statCellBorder: { borderRightWidth: 1, borderRightColor: ED.border },
  statVal: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.03 * 22,
    lineHeight: 26,
    color: ED.text,
  },
  statLabel: {
    fontSize: 9.5,
    color: ED.muted,
    marginTop: 5,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontFamily: MONO,
    fontWeight: '500',
  },
  sectionLabel: {
    fontSize: 10,
    color: ED.muted,
    letterSpacing: 0.09 * 10,
    textTransform: 'uppercase',
    fontWeight: '500',
    fontFamily: MONO,
  },

  deckSection: { paddingTop: 16, paddingBottom: 24 },
  deckSectionHeader: { paddingHorizontal: 20, marginBottom: 10 },
  deckList: { paddingHorizontal: 16, gap: 8 },

  deckCard: {
    backgroundColor: ED.surf,
    borderWidth: 1,
    borderColor: ED.border,
    borderRadius: 10,
    padding: 14,
  },
  deckCardTop: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 3,
  },
  deckTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.015 * 14,
    color: ED.text,
  },
  deckDue: { fontSize: 11, color: ED.accent, fontWeight: '600', flexShrink: 0 },
  deckCaughtUp: { color: ED.muted },
  deckDesc: { fontSize: 11.5, color: ED.muted, marginBottom: 10 },
  deckBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
  },
  deckProgressTrack: {
    flex: 1,
    height: 2,
    borderRadius: 1,
    backgroundColor: ED.dim,
    overflow: 'hidden',
  },
  deckProgressFill: {
    height: '100%' as any,
    backgroundColor: ED.accent,
    borderRadius: 1,
  },
  deckCards: { fontSize: 10.5, color: ED.muted, width: 60, textAlign: 'right' as any },
  deckPct: {
    fontSize: 10.5,
    color: ED.text,
    fontWeight: '700',
    width: 32,
    textAlign: 'right' as any,
  },

  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 20,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: ED.text, marginBottom: 8 },
  emptyText: { fontSize: 13, color: ED.muted, textAlign: 'center', marginBottom: 24 },
  emptyBtn: {
    backgroundColor: ED.accent,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  emptyBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
