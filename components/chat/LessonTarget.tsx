/**
 * Where the kept cards go — the turn after the one that drafted them.
 *
 * This used to live inside the drafts card, under the cards and above the button.
 * Both things were true in one place at once — here is what I wrote, and here is
 * where I am putting it — and a single answer ended up carrying two decisions and
 * two sets of controls, which is how the one being made now stops being obvious.
 *
 * So it is the next thing said instead (ChatShell's `useSay`). The drafts are
 * answered with "keep them", and the answer to that is this: where, and the button
 * that does it. One question to a turn, in the order they are asked.
 *
 * Nothing is written until the button here is pressed. The drafts card saves
 * nothing on its own.
 *
 *
 * One field, not two paths.
 *
 * Before this there was a name box for a new lesson and a "use an existing one"
 * link beside it that opened a sheet of everything they had. Two controls for one
 * question, and the person had to know which of the two they were answering before
 * they could start typing.
 *
 * Now the name is a search box. Type, and the lessons you already have that match
 * appear under it; tap one and these cards go there. Type something that matches
 * nothing and that is the name of a new lesson. The same keystrokes do both, which
 * is right, because "where do these go" is one question — and what the model
 * proposed is simply what the box starts with.
 *
 * That box is components/LessonNameField now, shared with the pages that save
 * cards outside the chat.
 *
 * The matches hang over the card rather than sitting in it. In the flow they
 * pushed the description and the button down the moment anyone touched the box,
 * so the card changed height while it was being read and the button moved out
 * from under the thumb on its way to it. A menu is a thing that opens over what
 * is already there and closes again, leaving it where it was — so this one is
 * drawn above the card, on its own ground, and the card underneath never moves.
 */

import { useKept } from '@/components/chat/ChatShell';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { LessonNameField } from '@/components/LessonNameField';
import { Field } from '@/components/ui/Field';
import { clearCache } from '@/lib/cache';
import {
  readLessonTarget, saveDrafts,
  type DraftTarget, type LessonChoice, type SaveResult,
} from '@/lib/chatDrafts';
import { supabase } from '@/lib/supabase';
import { colors, fonts, space, type } from '@/theme';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text } from 'react-native';

/** What a card that had already saved wrote down, read back as carefully as
 *  anything else that comes out of storage. */
function readSaved(before: { saved?: unknown; name?: unknown } | null): { saved: SaveResult; name: string } | null {
  const saved = before?.saved as { lessonId?: unknown; saved?: unknown } | undefined;
  if (!saved || typeof saved.lessonId !== 'string' || typeof saved.saved !== 'number') return null;
  if (typeof before?.name !== 'string' || !before.name.trim()) return null;
  return { saved: { lessonId: saved.lessonId, saved: saved.saved }, name: before.name.trim() };
}

export function LessonTarget({ raw }: { raw: unknown }) {
  const asked = useMemo(() => readLessonTarget(raw), [raw]);
  /* Where these cards went, if they already have. The conversation comes back
   * when the screen is reopened, and a card that had saved must come back saying
   * so — not as a form with a button that would save the same cards again. */
  const [before, writeDown] = useKept<{ saved?: unknown; name?: unknown }>();
  const done = useMemo(() => readSaved(before), [before]);
  /** What is in the box. Starts as whatever the model proposed — the name it
   *  invented, or the name of the lesson it wants to add to. */
  const [named, setNamed] = useState(() => (done ? done.name : !asked ? ''
    : asked.target.kind === 'new' ? asked.target.name : asked.target.lesson_name));
  /** Set when the box's text is a lesson they already have, because they picked
   *  it or because the model did. Null means what is typed is a new lesson. */
  const [chosen, setChosen] = useState<LessonChoice | null>(() => (
    asked?.target.kind === 'existing'
      ? { id: asked.target.lesson_id, name: asked.target.lesson_name, learning_mode: asked.target.learning_mode ?? null }
      : null
  ));
  const [blurb, setBlurb] = useState(() => (asked?.target.kind === 'new' ? asked.target.description ?? '' : ''));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<SaveResult | null>(() => done?.saved ?? null);
  const [failed, setFailed] = useState<string | null>(null);
  const typed = named.trim();
  if (!asked) return null;

  const keep = async () => {
    if (saving || saved) return;
    const going: DraftTarget = chosen
      ? {
        kind: 'existing', lesson_id: chosen.id, lesson_name: chosen.name,
        ...(chosen.learning_mode ? { learning_mode: chosen.learning_mode } : {}),
      }
      : {
        kind: 'new', name: typed,
        description: blurb.trim() || undefined,
        learning_mode: asked.target.kind === 'new' ? asked.target.learning_mode : 'knowledge',
      };
    setSaving(true);
    setFailed(null);
    try {
      const { data } = await supabase.auth.getUser();
      if (!data.user) throw new Error('Sign in to keep these.');
      const result = await saveDrafts(supabase as never, data.user.id, asked.cards, going);
      // The lists that would otherwise still show the lesson as it was.
      void clearCache('DASHBOARD', data.user.id);
      void clearCache('LESSONS', data.user.id);
      if (going.kind === 'existing') void clearCache('LESSON_DETAIL', going.lesson_id);
      setSaved(result);
      // Kept with the conversation, and told to the model: until now it never
      // learned whether the cards it drafted were wanted.
      writeDown(
        { saved: result, name: typed },
        `The person kept ${result.saved === 1 ? '1 card' : `${result.saved} cards`} in their lesson "${typed}": ${asked.cards.map((card) => card.term).join('; ').slice(0, 400)}. They are saved.`,
      );
    } catch (error) {
      setFailed(error instanceof Error ? error.message : 'Could not keep these just now.');
    } finally {
      setSaving(false);
    }
  };

  if (saved) {
    return (
      <Card pad="md" gap={space[3]}>
        <Text style={styles.kept}>
          {saved.saved === 1 ? '1 card kept in ' : `${saved.saved} cards kept in `}
          <Text style={styles.keptWhere}>{typed}</Text>
        </Text>
        <Button
          label="Open the lesson"
          size="sm"
          onPress={() => router.push(`/lessons/${saved.lessonId}` as never)}
        />
      </Card>
    );
  }

  const count = asked.cards.length;
  return (
    <Card pad="md" gap={space[3]}>
      {/* One box that names a new lesson or finds one of theirs. It started
          here and is shared now (components/LessonNameField). */}
      <LessonNameField value={named} onChangeText={setNamed} chosen={chosen} onChoose={setChosen} disabled={saving} />

      {/* Only a new lesson has one of these to write. */}
      {!chosen && (
        <Field
          label="What it is about"
          value={blurb}
          onChangeText={setBlurb}
          placeholder="Optional"
          multiline
          maxLength={2000}
        />
      )}

      {failed && <Text style={styles.failed}>{failed}</Text>}

      <Button
        label={chosen
          ? `Add to ${chosen.name}`
          : (count === 1 ? 'Make the lesson and keep 1 card' : `Make the lesson and keep ${count} cards`)}
        size="sm"
        width="full"
        disabled={!typed}
        loading={saving}
        onPress={() => void keep()}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  failed: { ...type.caption, fontFamily: fonts.regular, color: colors.red },
  kept: { ...type.body, fontFamily: fonts.regular, color: colors.text },
  keptWhere: { fontFamily: fonts.semibold },
});
