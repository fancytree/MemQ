import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { safeBack } from '@/lib/safeBack';
import { EdBase } from '@/components/EdBase';
import { SectionLabel } from '@/components/SectionLabel';
import { Icon } from '@/components/Icon';
import { colors, fonts } from '@/theme';

type Phase = 'idle' | 'generating' | 'done';

interface GeneratedCard {
  n: string;
  tag: string;
  title: string;
  body?: string;
  ex?: string;
}

const PRESET: GeneratedCard[] = [
  {
    n: '01',
    tag: 'Core Concept',
    title: 'What sparked the French Revolution?',
    body: 'A convergence of fiscal crisis, Enlightenment political thought, and a rigid estate system that excluded the bourgeoisie from real power.',
    ex: '"Let them eat cake" — apocryphal, but captures the disconnect of Versailles from rural famine.',
  },
  { n: '02', tag: 'Mechanism',   title: 'The Estates-General (1789)' },
  { n: '03', tag: 'Consequence', title: 'From Bastille to the Terror' },
];

export default function CreateScreen() {
  const [prompt, setPrompt]   = useState('Explain the causes of the French Revolution');
  const [phase, setPhase]     = useState<Phase>('idle');
  const [cards, setCards]     = useState<GeneratedCard[]>([]);
  const [kept, setKept]       = useState<Record<string, boolean>>({});

  const generate = () => {
    if (!prompt.trim()) return;
    setPhase('generating');
    setCards([]);
    setKept({});
    PRESET.forEach((c, i) => {
      setTimeout(() => {
        setCards((prev) => [...prev, c]);
        if (i === PRESET.length - 1) setPhase('done');
      }, 350 + i * 350);
    });
  };

  const isGenerating = phase === 'generating';

  return (
    <EdBase bottomInset={0}>
      {/* Top bar */}
      <View style={styles.topbar}>
        <Pressable onPress={() => safeBack('/(tabs)')}>
          <Text style={styles.cancel}>Cancel</Text>
        </Pressable>
        <Text style={styles.title}>New card set</Text>
        <Text style={styles.tag}>History</Text>
      </View>

      {/* Prompt block */}
      <View style={styles.promptBlock}>
        <View style={{ paddingHorizontal: 18, paddingTop: 14, paddingBottom: 6 }}>
          <SectionLabel style={{ marginBottom: 10 }}>What do you want to learn?</SectionLabel>
          <TextInput
            value={prompt}
            onChangeText={setPrompt}
            placeholder="Type a question, paste a passage, or describe a topic…"
            placeholderTextColor={colors.muted}
            multiline
            style={styles.textarea}
          />
        </View>
        <View style={styles.promptActions}>
          {(['Attach', 'Voice', 'Doc'] as const).map((label, i, arr) => (
            <Pressable
              key={label}
              style={[
                styles.actionBtn,
                i < arr.length - 1 && { borderRightWidth: 1, borderRightColor: colors.border },
              ]}
            >
              <Text style={styles.actionLabel}>{label}</Text>
            </Pressable>
          ))}
          <Pressable
            disabled={isGenerating}
            onPress={generate}
            style={[styles.actionBtn, { marginLeft: 'auto' }]}
          >
            <Text style={[styles.generateLabel, { color: isGenerating ? colors.muted : colors.accent }]}>
              {isGenerating ? 'Generating…' : 'Generate →'}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Generated header */}
      <View style={styles.genHead}>
        <SectionLabel>
          {phase === 'idle'       && 'Awaiting prompt'}
          {phase === 'generating' && `Generating — ${cards.length} of ${PRESET.length}`}
          {phase === 'done'       && `Generated — ${cards.length} cards`}
        </SectionLabel>
        {phase === 'done' && <Text style={styles.saveAll}>Save all</Text>}
      </View>

      {/* Empty state */}
      {phase === 'idle' && (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            Cards will appear here.{'\n'}
            Try: "Verb conjugation in Spanish," or paste a paragraph.
          </Text>
        </View>
      )}

      {/* Loading skeletons */}
      {isGenerating && cards.length === 0 && (
        <View style={{ paddingHorizontal: 16 }}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.skeletonCard}>
              <View style={[styles.skeletonBar, { width: 80, marginBottom: 8 }]} />
              <View style={[styles.skeletonBar, { width: '70%', height: 14 }]} />
            </View>
          ))}
        </View>
      )}

      {/* Generated cards */}
      {cards.map((c, i) =>
        i === 0 ? (
          <FullCard
            key={c.n}
            card={c}
            kept={!!kept[c.n]}
            onKeep={() => setKept({ ...kept, [c.n]: true })}
          />
        ) : (
          <CompactCard key={c.n} card={c} />
        ),
      )}

      <View style={{ height: 24 }} />
    </EdBase>
  );
}

function FullCard({ card: c, kept, onKeep }: { card: GeneratedCard; kept: boolean; onKeep: () => void }) {
  return (
    <View style={styles.fullCard}>
      <View style={styles.fullCardHead}>
        <View style={{ flex: 1 }}>
          <SectionLabel style={{ marginBottom: 4 }}>Card {c.n} · {c.tag}</SectionLabel>
          <Text style={styles.fullCardTitle}>{c.title}</Text>
        </View>
        <Text style={styles.editLink}>Edit</Text>
      </View>
      <View style={{ paddingHorizontal: 14, paddingVertical: 12 }}>
        {c.body && <Text style={styles.fullCardBody}>{c.body}</Text>}
        {c.ex && (
          <View style={styles.exBlock}>
            <SectionLabel style={{ marginBottom: 5 }}>Example</SectionLabel>
            <Text style={styles.exText}>{c.ex}</Text>
          </View>
        )}
      </View>
      <View style={styles.fullCardActions}>
        {(['discard', 'regen', 'keep'] as const).map((key, j, arr) => {
          const isKeep = key === 'keep';
          const label = key === 'discard' ? 'Discard' : key === 'regen' ? 'Regenerate' : kept ? 'Kept ✓' : 'Keep';
          return (
            <Pressable
              key={key}
              onPress={isKeep ? onKeep : undefined}
              style={[
                styles.fullCardAction,
                j < arr.length - 1 && { borderRightWidth: 1, borderRightColor: colors.border },
              ]}
            >
              <Text
                style={[
                  styles.fullCardActionLabel,
                  { color: isKeep ? colors.accent : colors.muted, fontWeight: isKeep ? '700' : '400' },
                ]}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function CompactCard({ card: c }: { card: GeneratedCard }) {
  return (
    <View style={styles.compactCard}>
      <View style={{ flex: 1 }}>
        <SectionLabel style={{ marginBottom: 3 }}>Card {c.n}</SectionLabel>
        <Text style={styles.compactTitle}>{c.title}</Text>
      </View>
      <Icon name="chevronRight" color={colors.dim} size={14} />
    </View>
  );
}

const styles = StyleSheet.create({
  topbar: {
    paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  cancel: { fontSize: 13, color: colors.muted, fontFamily: fonts.grotesk },
  title:  { fontSize: 15, fontWeight: '700', letterSpacing: -0.4, color: colors.text, fontFamily: fonts.grotesk },
  tag:    { fontSize: 12, color: colors.accent, fontWeight: '600', fontFamily: fonts.grotesk },

  promptBlock: { backgroundColor: colors.surf, borderBottomWidth: 1, borderBottomColor: colors.border },
  textarea: {
    minHeight: 64,
    fontSize: 15, lineHeight: 22, color: colors.text,
    fontFamily: fonts.grotesk,
    padding: 0, // strip RN default
  },
  promptActions: {
    flexDirection: 'row', alignItems: 'center',
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  actionBtn: { paddingHorizontal: 14, paddingVertical: 9 },
  actionLabel: {
    fontSize: 11.5, color: colors.muted,
    letterSpacing: 0.5, textTransform: 'uppercase', fontWeight: '600',
    fontFamily: fonts.grotesk,
  },
  generateLabel: { fontSize: 13, fontWeight: '700', fontFamily: fonts.grotesk },

  genHead: {
    paddingHorizontal: 18, paddingTop: 14, paddingBottom: 10,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  saveAll: { fontSize: 12, color: colors.accent, fontWeight: '600', fontFamily: fonts.grotesk },

  empty: {
    marginHorizontal: 16, marginBottom: 16,
    paddingHorizontal: 18, paddingVertical: 24,
    borderWidth: 1, borderStyle: 'dashed', borderColor: colors.dim, borderRadius: 10,
    alignItems: 'center',
  },
  emptyText: { fontSize: 13, color: colors.muted, lineHeight: 21, textAlign: 'center', fontFamily: fonts.grotesk },

  skeletonCard: {
    backgroundColor: colors.surf,
    borderWidth: 1, borderColor: colors.border, borderRadius: 10,
    padding: 14, marginBottom: 6,
  },
  skeletonBar: { height: 8, backgroundColor: colors.dim, borderRadius: 2, opacity: 0.5 },

  fullCard: {
    marginHorizontal: 16,
    backgroundColor: colors.surf,
    borderWidth: 1, borderColor: colors.border, borderRadius: 10,
  },
  fullCardHead: {
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: colors.border,
    flexDirection: 'row', alignItems: 'flex-start',
  },
  fullCardTitle: {
    fontSize: 15, fontWeight: '700', letterSpacing: -0.3, lineHeight: 20,
    color: colors.text, fontFamily: fonts.grotesk,
  },
  editLink: { fontSize: 12, color: colors.accent, fontWeight: '600', marginLeft: 10, fontFamily: fonts.grotesk },

  fullCardBody: { fontSize: 13, color: colors.sub, lineHeight: 21, marginBottom: 12, fontFamily: fonts.grotesk },
  exBlock: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 6,
    paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: colors.bg,
  },
  exText: { fontSize: 12, color: colors.sub, lineHeight: 19, fontFamily: fonts.mono },

  fullCardActions: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.border },
  fullCardAction:  { flex: 1, paddingVertical: 10, alignItems: 'center' },
  fullCardActionLabel: { fontSize: 12, fontFamily: fonts.grotesk },

  compactCard: {
    marginHorizontal: 16, marginTop: 6,
    backgroundColor: colors.surf,
    borderWidth: 1, borderColor: colors.border, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  compactTitle: { fontSize: 14, fontWeight: '600', color: colors.text, fontFamily: fonts.grotesk },
});
