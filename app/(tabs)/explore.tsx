import { EdBase } from '@/components/EdBase';
import { Icon } from '@/components/Icon';
import { SectionLabel } from '@/components/SectionLabel';
import {
    exploreCategories,
    type ExploreCategoryId,
    type ExploreLesson,
} from '@/data/explore';
import { supabase } from '@/lib/supabase';
import { colors, fonts } from '@/theme';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

/**
 * Explore — discovery surface for community / curated decks.
 * Three editorial bands: a Featured hero, a category chip filter, then
 * a numbered trending list.
 */
export default function ExploreScreen() {
  const [activeCat, setActiveCat] = useState<ExploreCategoryId>('all');
  const [lessons, setLessons] = useState<ExploreLesson[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadExploreLessons = useCallback(async () => {
    const { data, error } = await supabase
      .from('explore_lessons')
      .select('id, title, description, category, creator_handle, is_official, is_new, is_featured, cards_count, learners_count, sort_order')
      .order('sort_order', { ascending: true });

    if (error || !data) {
      setLessons([]);
      return;
    }

    setLessons(
      data.map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description || '',
        cards: row.cards_count || 0,
        creator: row.creator_handle || '@memq',
        isOfficial: row.is_official ?? false,
        cat: (row.category as Exclude<ExploreCategoryId, 'all'>) || 'tech',
        isNew: row.is_new ?? false,
        learners: row.learners_count || 0,
        isFeatured: row.is_featured ?? false,
        sortOrder: row.sort_order ?? 999,
      }))
    );
  }, []);

  useEffect(() => {
    loadExploreLessons();
  }, [loadExploreLessons]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadExploreLessons();
    } finally {
      setRefreshing(false);
    }
  }, [loadExploreLessons]);

  const searchedLessons = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return lessons;
    return lessons.filter((lesson) => {
      const haystack = `${lesson.title} ${lesson.description} ${lesson.creator}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [lessons, searchQuery]);

  const featuredDeck = useMemo(
    () => searchedLessons.find((l) => l.isFeatured) || null,
    [searchedLessons]
  );

  const filtered: ExploreLesson[] =
    activeCat === 'all'
      ? searchedLessons
      : searchedLessons.filter((d) => d.cat === activeCat);

  const formatLearners = (count: number) => {
    if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
    return String(count);
  };

  return (
    <EdBase scroll={false} bottomInset={0}>
      {/* Top bar */}
      <View style={styles.topbar}>
        {searchOpen ? (
          <View style={styles.searchRowFull}>
            <TextInput
              style={styles.searchInputFull}
              placeholder="Search lessons"
              placeholderTextColor={colors.muted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
            />
            <Pressable
              style={styles.searchInlineCancel}
              onPress={() => {
                setSearchOpen(false);
                setSearchQuery('');
              }}
            >
              <Text style={styles.searchInlineCancelText}>×</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <Text style={styles.title}>Explore</Text>
            <Pressable onPress={() => setSearchOpen(true)}>
              <Text style={styles.linkAccent}>Search</Text>
            </Pressable>
          </>
        )}
      </View>

      <ScrollView
        style={styles.contentScroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        {/* Featured */}
        {featuredDeck && (
          <View style={styles.featuredWrap}>
            <SectionLabel
              color={colors.accent}
              size={12}
              style={{
                marginBottom: 10,
                fontFamily: 'JetBrainsMono_600',
                fontWeight: '400',
                lineHeight: 17,
                letterSpacing: -0.1,
              }}
            >
              Featured · This week
            </SectionLabel>
            <Pressable
              onPress={() => router.push(`/deck/${featuredDeck.id}` as never)}
              style={styles.featuredCard}
            >
              <Text style={styles.featuredTitle}>{featuredDeck.title}</Text>
              <Text style={styles.featuredSub}>{featuredDeck.description}</Text>
              <View style={styles.featuredMeta}>
                <Text style={styles.featuredAuthor}>{featuredDeck.isOfficial ? '@memq' : featuredDeck.creator}</Text>
                <View style={styles.dotSeparator} />
                <Text style={styles.featuredLearners}>{formatLearners(featuredDeck.learners)} learners</Text>
              </View>
            </Pressable>
          </View>
        )}

        {/* Category chips */}
        <View style={styles.chipsBar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {exploreCategories.map((c) => {
              const isActive = activeCat === c.id;
              return (
                <Pressable
                  key={c.id}
                  onPress={() => setActiveCat(c.id)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: isActive ? colors.text : 'transparent',
                      borderColor: isActive ? colors.text : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipLabel,
                      { color: isActive ? colors.surf : colors.sub },
                    ]}
                  >
                    {c.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* Trending */}
        <View style={styles.section}>
          <View style={[styles.row, styles.sectionHead]}>
            <SectionLabel size={12} style={styles.trendingLabel}>Trending</SectionLabel>
            <Text style={styles.sectionMeta}>{filtered.length} lessons</Text>
          </View>
          <View style={{ gap: 8 }}>
            {filtered.map((d, i) => (
              <Pressable
                key={d.id}
                onPress={() => router.push(`/deck/${d.id}` as never)}
                style={styles.deckRow}
              >
                <View style={styles.numTile}>
                  <Text style={styles.numTileText}>{String(i + 1).padStart(2, '0')}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={styles.titleRow}>
                    <Text style={styles.deckTitle}>{d.title}</Text>
                    {d.isNew && (
                      <View style={styles.newBadge}>
                        <Text style={styles.newBadgeText}>New</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.deckSub}>
                    {d.cards} cards · {d.isOfficial ? '@memq' : d.creator}
                  </Text>
                  <Text style={styles.deckLearners}>{formatLearners(d.learners)} learners</Text>
                </View>
                <Icon name="chevronRight" color={colors.muted} size={16} />
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>
    </EdBase>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  contentScroll: { flex: 1 },

  topbar: {
    paddingHorizontal: 20,
    height: 64,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  title: {
    fontFamily: 'JetBrainsMono_800',
    fontSize: 24,
    fontWeight: '400',
    letterSpacing: -0.5,
    color: colors.text,
  },
  linkAccent: {
    fontSize: 13,
    letterSpacing: -0.1,
    color: colors.accent,
    fontFamily: 'JetBrainsMono_700',
  },
  searchRowFull: {
    flex: 1,
    justifyContent: 'center',
    height: 40,
  },
  searchInputFull: {
    width: '100%',
    height: 40,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    color: colors.text,
    fontSize: 12,
    fontFamily: 'JetBrainsMono_400',
    paddingRight: 32,
  },
  searchInlineCancel: {
    position: 'absolute',
    right: 8,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  searchInlineCancelText: {
    fontSize: 18,
    lineHeight: 20,
    color: colors.muted,
    fontFamily: 'JetBrainsMono_700',
  },

  featuredWrap: {
    paddingHorizontal: 20, paddingTop: 18, paddingBottom: 20,
    backgroundColor: colors.surf,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  featuredCard: {
    backgroundColor: colors.bg,
    borderWidth: 1, borderColor: colors.border, borderRadius: 12,
    paddingHorizontal: 18, paddingVertical: 20,
    position: 'relative', overflow: 'hidden',
  },
  featuredTitle: {
    fontFamily: 'JetBrainsMono_800',
    fontSize: 22,
    fontWeight: '400',
    letterSpacing: -0.1,
    lineHeight: 25,
    color: colors.text,
    marginTop: 8,
  },
  featuredSub: {
    fontSize: 14,
    color: colors.muted,
    marginTop: 6,
    lineHeight: 21,
    letterSpacing: -0.1,
    fontFamily: 'JetBrainsMono_400',
    fontWeight: '400',
  },
  featuredMeta:   { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.borderS },
  featuredAuthor: {
    fontSize: 12,
    color: colors.text,
    fontFamily: 'JetBrainsMono_600',
    fontWeight: '400',
    lineHeight: 17,
    letterSpacing: -0.1,
  },
  featuredLearners: {
    fontSize: 12,
    color: colors.muted,
    fontFamily: 'JetBrainsMono_400',
    fontWeight: '400',
    lineHeight: 17,
    letterSpacing: -0.1,
  },
  dotSeparator:  { width: 3, height: 3, borderRadius: 1.5, backgroundColor: colors.dim },

  chipsBar: {
    paddingHorizontal: 20, paddingVertical: 14,
    backgroundColor: colors.surf,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  chip: {
    paddingHorizontal: 11, paddingVertical: 6,
    borderRadius: 999, borderWidth: 1,
  },
  chipLabel: {
    fontSize: 14,
    fontFamily: 'JetBrainsMono_700',
    fontWeight: '400',
    lineHeight: 20,
    letterSpacing: -0.1,
  },

  section: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 24 },
  sectionHead: { paddingHorizontal: 4, paddingBottom: 10, alignItems: 'baseline' },
  trendingLabel: {
    fontFamily: 'JetBrainsMono_500',
    fontWeight: '400',
    lineHeight: 17,
    letterSpacing: -0.1,
  },
  sectionMeta: { fontSize: 11, color: colors.muted, fontFamily: fonts.mono },

  deckRow: {
    backgroundColor: colors.surf,
    borderWidth: 1, borderColor: colors.border, borderRadius: 10,
    padding: 14, flexDirection: 'row', gap: 12, alignItems: 'flex-start',
  },
  numTile: {
    width: 32, height: 32, borderRadius: 6,
    backgroundColor: colors.bg,
    borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  numTileText: { fontFamily: 'JetBrainsMono_800', fontSize: 12, fontWeight: '400', color: colors.muted },

  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  deckTitle: {
    fontSize: 16,
    fontFamily: 'JetBrainsMono_700',
    fontWeight: '400',
    lineHeight: 22,
    letterSpacing: -0.1,
    color: colors.text,
  },
  newBadge: {
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3,
    backgroundColor: colors.accentL,
  },
  newBadgeText: {
    fontSize: 10,
    color: colors.accent,
    fontFamily: 'JetBrainsMono_700',
    fontWeight: '400',
    lineHeight: 14,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  deckSub: { fontSize: 12, color: colors.muted, marginTop: 3, fontFamily: fonts.grotesk },
  deckLearners: { fontSize: 11, color: colors.muted, marginTop: 8, fontFamily: fonts.mono, letterSpacing: 0.2 },
});
