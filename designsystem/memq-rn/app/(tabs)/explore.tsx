import { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { EdBase } from '@/components/EdBase';
import { SectionLabel } from '@/components/SectionLabel';
import { Icon } from '@/components/Icon';
import { colors, fonts } from '@/theme';
import {
  exploreCategories,
  featuredDeck,
  trendingDecks,
  type ExploreCategoryId,
  type TrendingDeck,
} from '@/data/explore';

/**
 * Explore — discovery surface for community / curated decks.
 * Three editorial bands: a Featured hero, a category chip filter, then
 * a numbered trending list.
 */
export default function ExploreScreen() {
  const [activeCat, setActiveCat] = useState<ExploreCategoryId>('all');

  const filtered: TrendingDeck[] =
    activeCat === 'all'
      ? trendingDecks
      : trendingDecks.filter((d) => d.cat === activeCat);

  return (
    <EdBase>
      {/* Top bar */}
      <View style={styles.topbar}>
        <Text style={styles.title}>Explore</Text>
        <Text style={styles.linkAccent}>Search</Text>
      </View>

      {/* Featured */}
      <View style={styles.featuredWrap}>
        <SectionLabel color={colors.accent} style={{ marginBottom: 10, fontWeight: '600' }}>
          Featured · This week
        </SectionLabel>
        <Pressable onPress={() => router.push(`/deck/${featuredDeck.id}` as never)} style={styles.featuredCard}>
          <Text style={styles.edition}>{featuredDeck.edition}</Text>
          <Text style={styles.featuredTitle}>{featuredDeck.title}</Text>
          <Text style={styles.featuredSub}>{featuredDeck.sub}</Text>
          <View style={styles.featuredMeta}>
            <Text style={styles.featuredAuthor}>{featuredDeck.author}</Text>
            <View style={styles.dotSeparator} />
            <Text style={styles.featuredLearners}>{featuredDeck.learners} learners</Text>
          </View>
        </Pressable>
      </View>

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
                    { color: isActive ? colors.surf : colors.sub, fontWeight: isActive ? '700' : '500' },
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
          <SectionLabel>Trending</SectionLabel>
          <Text style={styles.sectionMeta}>{filtered.length} decks</Text>
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
                <Text style={styles.deckSub}>{d.sub}</Text>
                <Text style={styles.deckLearners}>{d.learners} learners</Text>
              </View>
              <Icon name="chevronRight" color={colors.muted} size={16} />
            </Pressable>
          ))}
        </View>
      </View>
    </EdBase>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

  topbar: {
    paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  title: { fontFamily: fonts.grotesk, fontSize: 19, fontWeight: '800', letterSpacing: -0.5, color: colors.text },
  linkAccent: { fontSize: 12, color: colors.accent, fontWeight: '600', fontFamily: fonts.grotesk },

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
  edition: {
    position: 'absolute', top: 14, right: 14,
    fontFamily: fonts.mono, fontSize: 10, color: colors.muted,
    letterSpacing: 0.8, textTransform: 'uppercase', fontWeight: '600',
  },
  featuredTitle: {
    fontFamily: fonts.grotesk,
    fontSize: 22, fontWeight: '800', letterSpacing: -0.6, lineHeight: 25, color: colors.text,
    marginTop: 8,
  },
  featuredSub:    { fontSize: 12.5, color: colors.muted, marginTop: 6, lineHeight: 18, fontFamily: fonts.grotesk },
  featuredMeta:   { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.borderS },
  featuredAuthor: { fontSize: 11, color: colors.text, fontWeight: '600', fontFamily: fonts.grotesk },
  featuredLearners: { fontSize: 11, color: colors.muted, fontFamily: fonts.grotesk },
  dotSeparator:  { width: 3, height: 3, borderRadius: 1.5, backgroundColor: colors.dim },

  chipsBar: {
    paddingHorizontal: 20, paddingVertical: 12,
    backgroundColor: colors.surf,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  chip: {
    paddingHorizontal: 11, paddingVertical: 6,
    borderRadius: 999, borderWidth: 1,
  },
  chipLabel: { fontSize: 12, fontFamily: fonts.grotesk },

  section: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 24 },
  sectionHead: { paddingHorizontal: 4, paddingBottom: 10, alignItems: 'baseline' },
  sectionMeta: { fontSize: 10.5, color: colors.muted, fontFamily: fonts.mono },

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
  numTileText: { fontFamily: fonts.mono, fontSize: 12, fontWeight: '700', color: colors.muted },

  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  deckTitle: { fontSize: 14, fontWeight: '700', letterSpacing: -0.2, color: colors.text, fontFamily: fonts.grotesk },
  newBadge: {
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3,
    backgroundColor: colors.accentL,
  },
  newBadgeText: { fontSize: 9, color: colors.accent, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', fontFamily: fonts.grotesk },
  deckSub: { fontSize: 11.5, color: colors.muted, marginTop: 3, fontFamily: fonts.grotesk },
  deckLearners: { fontSize: 10.5, color: colors.muted, marginTop: 8, fontFamily: fonts.mono, letterSpacing: 0.2 },
});
