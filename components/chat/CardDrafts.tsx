/**
 * Drafted cards, waiting to be kept.
 *
 * This is the confirmation step — there is no separate one. The model drafted these
 * and nothing has been written; the person ticks what they want, picks nothing else
 * (the lesson is already proposed), and the save happens from here with their own
 * session.
 *
 * It does not navigate on save. The create screen does, because finishing there is
 * the end of the errand, but here the person is in the middle of a conversation and
 * may want to ask for more. So it says what it kept and offers the way through.
 */

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { clearCache } from '@/lib/cache';
import {
  initialSelection, readCardDrafts, saveDrafts,
  type DraftCard, type DraftTarget, type SaveResult,
} from '@/lib/chatDrafts';
import { supabase } from '@/lib/supabase';
import { colors, fonts, radius, space, type } from '@/theme';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export function CardDrafts({ raw }: { raw: unknown }) {
  const drafts = useMemo(() => readCardDrafts(raw), [raw]);
  const [picked, setPicked] = useState<string[]>(() => (drafts ? initialSelection(drafts) : []));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<SaveResult | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  // Not a draft this build can draw. The shell says so rather than leaving a gap.
  if (!drafts) return null;

  const toggle = (id: string) =>
    setPicked((current) => (current.includes(id) ? current.filter((at) => at !== id) : [...current, id]));
  const allPicked = picked.length === drafts.cards.length;

  const keep = async () => {
    if (saving || saved) return;
    setSaving(true);
    setFailed(null);
    try {
      const { data } = await supabase.auth.getUser();
      if (!data.user) throw new Error('Sign in to keep these.');
      const chosen = drafts.cards.filter((card) => picked.includes(card.id));
      const result = await saveDrafts(supabase as never, data.user.id, chosen, drafts.target);
      // The lists that would otherwise still show the lesson as it was.
      void clearCache('DASHBOARD', data.user.id);
      void clearCache('LESSONS', data.user.id);
      if (drafts.target.kind === 'existing') void clearCache('LESSON_DETAIL', drafts.target.lesson_id);
      setSaved(result);
    } catch (error) {
      setFailed(error instanceof Error ? error.message : 'Could not keep these just now.');
    } finally {
      setSaving(false);
    }
  };

  if (saved) {
    const where = drafts.target.kind === 'existing' ? drafts.target.lesson_name : drafts.target.name;
    return (
      <Card pad="md" gap={space[3]}>
        <Text style={styles.kept}>
          {saved.saved === 1 ? '1 card kept in ' : `${saved.saved} cards kept in `}
          <Text style={styles.keptWhere}>{where}</Text>
        </Text>
        <Button
          label="Open the lesson"
          size="sm"
          width="hug"
          onPress={() => router.push(`/lessons/${saved.lessonId}` as never)}
        />
      </Card>
    );
  }

  return (
    <Card pad="md" gap={space[3]}>
      <Target target={drafts.target} />

      <View style={styles.rows}>
        {drafts.cards.map((card) => (
          <Row key={card.id} card={card} picked={picked.includes(card.id)} onToggle={() => toggle(card.id)} />
        ))}
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={() => setPicked(allPicked ? [] : drafts.cards.map((card) => card.id))}
        hitSlop={8}
      >
        <Text style={styles.all}>{allPicked ? 'Clear all' : 'Select all'}</Text>
      </Pressable>

      {failed && <Text style={styles.failed}>{failed}</Text>}

      <Button
        label={picked.length === 1 ? 'Keep 1 card' : `Keep ${picked.length} cards`}
        size="sm"
        width="full"
        disabled={!picked.length}
        loading={saving}
        onPress={() => void keep()}
      />
    </Card>
  );
}

/** Where these are going, said before the list rather than under it: it changes how
 *  the cards read. */
function Target({ target }: { target: DraftTarget }) {
  if (target.kind === 'existing') {
    return (
      <View style={styles.target}>
        <Text style={styles.targetLine}>
          Adding to <Text style={styles.targetName}>{target.lesson_name}</Text>
        </Text>
        {target.why && <Text style={styles.why}>{target.why}</Text>}
      </View>
    );
  }
  return (
    <View style={styles.target}>
      <Text style={styles.targetLine}>
        New lesson: <Text style={styles.targetName}>{target.name}</Text>
      </Text>
      {target.description && <Text style={styles.why}>{target.description}</Text>}
    </View>
  );
}

/** The one line of language detail worth showing before a decision: how it sounds,
 *  and how it is used. Null for a card that carries neither. */
function detail(card: DraftCard): string | null {
  const details = card.language_data;
  if (!details) return null;
  const said = typeof details.pronunciation === 'string' ? details.pronunciation.trim() : '';
  const used = typeof details.example === 'string' ? details.example.trim() : '';
  const parts = [said && `[${said}]`, used].filter(Boolean);
  return parts.length ? parts.join('  ') : null;
}

function Row({ card, picked, onToggle }: { card: DraftCard; picked: boolean; onToggle: () => void }) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: picked }}
      accessibilityLabel={`${card.term}: ${card.definition}`}
      onPress={onToggle}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={[styles.box, picked && styles.boxOn]}>
        {picked && <Icon name="check" size={13} color={colors.text} />}
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.term, !picked && styles.dimmed]}>{card.term}</Text>
        <Text style={[styles.definition, !picked && styles.dimmed]}>{card.definition}</Text>
        {/* A language card carries more than this, but only the two that help
         *  someone decide are shown: how it sounds, and it used in a sentence. The
         *  rest is saved and read on the card itself. */}
        {detail(card) && <Text style={[styles.detail, !picked && styles.dimmed]}>{detail(card)}</Text>}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  target: { gap: space[1] },
  targetLine: { ...type.caption, fontFamily: fonts.regular, color: colors.sub },
  targetName: { fontFamily: fonts.semibold, color: colors.text },
  why: { ...type.caption, fontFamily: fonts.regular, color: colors.faint },
  rows: { gap: space[1] },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space[3], paddingVertical: space[2] },
  rowPressed: { opacity: 0.6 },
  box: {
    width: 22, height: 22, borderRadius: radius.sm,
    borderWidth: 1.5, borderColor: colors.line,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 1,
  },
  boxOn: { backgroundColor: colors.limeSurface, borderColor: colors.action },
  rowText: { flex: 1, gap: space[0] },
  term: { ...type.body, fontFamily: fonts.semibold, color: colors.text },
  definition: { ...type.caption, fontFamily: fonts.regular, color: colors.sub },
  detail: { ...type.caption, fontFamily: fonts.regular, color: colors.faint },
  dimmed: { color: colors.faint },
  all: { ...type.caption, fontFamily: fonts.semibold, color: colors.action },
  failed: { ...type.caption, fontFamily: fonts.regular, color: colors.red },
  kept: { ...type.body, fontFamily: fonts.regular, color: colors.text },
  keptWhere: { fontFamily: fonts.semibold },
});
