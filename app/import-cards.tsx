/**
 * Cards made with the person's own AI, brought in.
 *
 * The third way to make cards, beside typing a topic and attaching a PDF — and
 * the one that costs nothing and never runs out, because the model doing the
 * work is not ours. It is what is left when the month's generated lessons are
 * used up, and it is how the app is fully usable without paying for anything.
 *
 * Three things on one page, in the order they are done:
 *
 *   1. Copy a prompt. It carries the whole contract (lib/cardImport.ts), so it
 *      works in any chat app with no setup. Nothing is asked for here: the AI is
 *      better placed to find out what is wanted — pasted into a conversation
 *      they already had it makes cards from that; pasted with notes it works
 *      from those; pasted alone it asks. If something was already typed on the
 *      screen this was opened from, it goes along in the prompt.
 *   2. Paste back what the AI said, or pick a file. Whatever shape it came in.
 *   3. See what was understood, untick what is not wanted, and save.
 *
 * Pasting is the main way in rather than a file because of where this happens:
 * on a phone, getting a file out of a chat app and finding it again is the hard
 * part, and copy-and-paste is two taps. A file is there for the spreadsheet made
 * at a desk.
 *
 * Nothing is saved until the last button. What the AI wrote is checked first,
 * card by card, and anything wrong with a card is said under it — usually that
 * its questions did not pass, in which case the card still comes in and can be
 * practised as a flashcard.
 *
 * Opened on its own it makes a new lesson; opened from a lesson (`lessonId`) it
 * adds to that one.
 *
 * How much to say. The first version explained itself at every step and the
 * page was mostly reading; the second cut each step to one line and left out the
 * part that happens somewhere else — so it no longer said what to do between
 * "copy" and "paste", which is the whole of the instructions. Now the steps are
 * the journey as it is actually made, the one in the other app included, each in
 * a short sentence or two: what to do, and what will happen when you do.
 */

import { ChatTopBar } from '@/components/chat/ChatTopBar';
import { EdBase } from '@/components/EdBase';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { LessonNameField } from '@/components/LessonNameField';
import { Icon } from '@/components/ui/Icon';
import { LearningModeSelector } from '@/components/ui/LearningModeSelector';
import { clearCache } from '@/lib/cache';
import {
  buildPrompt, parseImport, saveImport,
  type ImportedCard, type ImportOutcome, type ImportResult, type LearningMode,
} from '@/lib/cardImport';
import { dialog } from '@/lib/dialog';
import type { LessonChoice } from '@/lib/chatDrafts';
import { safeBack } from '@/lib/safeBack';
import { supabase } from '@/lib/supabase';
import { colors, fonts, layout, radius, space, type } from '@/theme';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

/* Loaded when first wanted, like the pickers in the chat: these are native
 * modules, and a development build that does not carry one should lose that
 * button rather than the screen. */
type Clipboard = { setStringAsync: (text: string) => Promise<boolean>; getStringAsync: () => Promise<string> };
type DocumentPicker = {
  getDocumentAsync: (options: { copyToCacheDirectory?: boolean; type?: string[] }) => Promise<{
    canceled: boolean; assets?: { uri: string; name?: string; size?: number | null }[] | null;
  }>;
};
function load<T>(name: 'expo-clipboard' | 'expo-document-picker'): T | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = name === 'expo-clipboard' ? require('expo-clipboard') : require('expo-document-picker');
    return (mod?.default ?? mod) as T;
  } catch { return null; }
}

/** A reply is a few thousand characters. Past this it is not a reply. */
const FILE_MAX_BYTES = 1024 * 1024;
/** How long "Copied" stays up: long enough to be read, short enough to copy again. */
const SAID_COPIED = 1800;

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

export default function ImportCardsScreen() {
  const { lessonId, topic: carried } = useLocalSearchParams<{ lessonId?: string; topic?: string }>();
  /** What was typed where this was opened from. Written into the prompt as given. */
  const topic = typeof carried === 'string' ? carried.trim() : '';
  const [mode, setMode] = useState<LearningMode>('knowledge');
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  /** The lesson being added to, when there is one: its name to show, and its mode,
   *  which decides both the prompt and what may be saved. */
  const [lesson, setLesson] = useState<{ name: string; mode: LearningMode } | null>(null);
  /** What that lesson already holds, folded for comparing. A card it has is shown,
   *  said to be there, and left unticked: brought in again it would be asked twice. */
  const [held, setHeld] = useState<Set<string>>(() => new Set());
  /** The same cards as they are written, for the prompt: the AI is told what the
   *  lesson holds so that it adds to it rather than starting it again. */
  const [heldTerms, setHeldTerms] = useState<string[]>([]);

  const [read, setRead] = useState<ImportResult | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<ImportOutcome | null>(null);
  const scroller = useRef<ScrollView>(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  /* A lesson of theirs picked in the name box at the last step, when this was
   * opened to make a new one (components/LessonNameField). From then on it is the
   * lesson being added to, exactly as if the page had been opened from it. */
  const [existing, setExisting] = useState<LessonChoice | null>(null);
  const targetId = lessonId || existing?.id;

  useEffect(() => {
    if (!targetId) { setHeld(new Set()); setHeldTerms([]); setLesson(null); return; }
    let live = true;
    void (async () => {
      const [{ data }, cards] = await Promise.all([
        supabase.from('lessons').select('name, learning_mode').eq('id', targetId).maybeSingle(),
        supabase.from('terms').select('term').eq('lesson_id', targetId).limit(2000),
      ]);
      if (!live) return;
      setHeldTerms(((cards.data ?? []) as { term: unknown }[])
        .map((row) => (typeof row.term === 'string' ? row.term.trim() : '')).filter(Boolean));
      setHeld(new Set(((cards.data ?? []) as { term: unknown }[])
        .map((row) => (typeof row.term === 'string' ? row.term.trim().toLocaleLowerCase() : '')).filter(Boolean)));
      if (!data) return;
      const lessonMode: LearningMode = data.learning_mode === 'language' ? 'language' : 'knowledge';
      setLesson({ name: String(data.name ?? ''), mode: lessonMode });
      setMode(lessonMode);
    })();
    return () => { live = false; };
  }, [targetId]);

  /* A card the lesson already has is left unticked. The lesson's cards can
   * arrive after the reply has been read — when it was handed over from the
   * screen before, it is read at once — so this is applied when they do. */
  useEffect(() => {
    if (!held.size) return;
    setPicked((current) => current.filter((id) => {
      const card = read?.cards.find((one) => one.id === id);
      return !card || !held.has(card.term.toLocaleLowerCase());
    }));
    // Only when the lesson's cards arrive: after that the ticks are the person's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [held]);

  const copyPrompt = async () => {
    const clipboard = load<Clipboard>('expo-clipboard');
    if (!clipboard) return dialog('Not available', 'Copying needs a newer build of the app.');
    try { await clipboard.setStringAsync(buildPrompt({
      topic,
      lessonMode: lessonId ? lesson?.mode ?? mode : undefined,
      lesson: lessonId && lesson ? { name: lesson.name, terms: heldTerms } : undefined,
    })); } catch { return; }
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), SAID_COPIED);
  };

  /** Take in a reply. A second one is added to the first rather than replacing it,
   *  which is what "say continue for the next part" needs. */
  const take = (text: string, from?: string) => {
    const next = parseImport(text);
    if (!next.cards.length) {
      return dialog('Nothing to bring in', next.problems[0] ?? 'That could not be read as cards.');
    }
    const earlier = read?.cards ?? [];
    const have = new Set(earlier.map((card) => card.term.toLocaleLowerCase()));
    const fresh = next.cards.filter((card) => !have.has(card.term.toLocaleLowerCase()));
    // Earlier cards keep their place, so they keep their ids and their ticks.
    const cards = [...earlier, ...fresh].map((card, at) => ({ ...card, id: `c${at + 1}` }));

    setRead({
      cards,
      lesson: { ...next.lesson, ...read?.lesson },
      problems: [...(read?.problems ?? []), ...next.problems],
      format: next.format,
    });
    // What was ticked stays as it was; what has just arrived comes in ticked,
    // unless the lesson already has it.
    setPicked((current) => [...current, ...cards.slice(earlier.length)
      .filter((card) => !held.has(card.term.toLocaleLowerCase())).map((card) => card.id)]);
    if (!name.trim()) setName(next.lesson.name ?? from ?? topic.slice(0, 60));
    if (!lesson && next.lesson.learning_mode) setMode(next.lesson.learning_mode);
    setDone(null);
    requestAnimationFrame(() => scroller.current?.scrollToEnd({ animated: true }));
  };

  const paste = async () => {
    const clipboard = load<Clipboard>('expo-clipboard');
    if (!clipboard) return dialog('Not available', 'Pasting needs a newer build of the app. You can still choose a file.');
    let text = '';
    try { text = await clipboard.getStringAsync(); } catch { text = ''; }
    if (!text.trim()) return dialog('Nothing copied', 'Copy the whole reply from your AI first, then come back and paste.');
    take(text);
  };

  const pickFile = async () => {
    const picker = load<DocumentPicker>('expo-document-picker');
    if (!picker) return dialog('Not available', 'Choosing a file needs a newer build of the app.');
    try {
      const result = await picker.getDocumentAsync({ copyToCacheDirectory: true });
      const asset = result.canceled ? null : result.assets?.[0];
      if (!asset) return;
      const fileName = asset.name ?? '';
      // A spreadsheet's own format is a zip of XML, not text. Every spreadsheet
      // app can save as CSV, and saying so is better than reading nonsense.
      if (/\.(xlsx?|numbers|ods)$/i.test(fileName)) {
        return dialog('Save it as CSV first', 'In your spreadsheet app choose Export or Save As, pick CSV, and then choose that file here.');
      }
      if ((asset.size ?? 0) > FILE_MAX_BYTES) return dialog('That file is too large', 'A file of cards is small. This one is over 1 MB.');
      const text = await (await fetch(asset.uri)).text();
      take(text, fileName.replace(/\.[^.]+$/, '').trim());
    } catch {
      dialog('Could not open that', 'Something went wrong reading the file.');
    }
  };

  const chosen = useMemo(() => (read?.cards ?? []).filter((card) => picked.includes(card.id)), [picked, read]);
  const withPractice = chosen.filter((card) => card.questions.length).length;
  const allPicked = !!read && picked.length === read.cards.length;
  const lessonName = lesson?.name ?? name.trim();

  const save = async () => {
    if (saving || !chosen.length) return;
    if (!targetId && !name.trim()) return dialog('Name the lesson', 'Give these cards a lesson to live in.');
    setSaving(true);
    try {
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user.id;
      if (!user) throw new Error('Sign in to save these.');
      const outcome = await saveImport(supabase as never, chosen, targetId
        ? { kind: 'existing', lesson_id: targetId, learning_mode: lesson?.mode ?? existing?.learning_mode ?? mode }
        : { kind: 'new', name: name.trim(), description: read?.lesson.description, learning_mode: mode });
      // The lists that would otherwise still show things as they were.
      void clearCache('DASHBOARD', user);
      void clearCache('LESSONS', user);
      void clearCache('LESSON_DETAIL', outcome.lessonId);
      setDone(outcome);
      requestAnimationFrame(() => scroller.current?.scrollToEnd({ animated: true }));
    } catch (error) {
      dialog('Could not save', error instanceof Error ? error.message : 'Try again in a moment.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <EdBase scroll={false} bottomInset={0}>
      <Stack.Screen options={{ headerShown: false }} />
      <ChatTopBar title="Use your own AI" onClose={() => safeBack('/(tabs)')} started={false} onClear={() => {}} />
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView showsVerticalScrollIndicator={false} ref={scroller} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.lead}>Your AI writes the cards. Free, no limit.</Text>

          <Card pad="md" gap={space[3]}>
            <Step number={1} title="Copy the prompt" />
            {!!topic && (
              <Text numberOfLines={1} style={styles.note}>
                It starts from “{topic.length > 40 ? `${topic.slice(0, 40)}…` : topic}”.
              </Text>
            )}
            <Button
              label={copied ? 'Copied' : 'Copy prompt'}
              size="sm" width="full" variant={read ? 'secondary' : 'primary'}
              icon={<Icon name={copied ? 'check' : 'copy'} size={16} color={read ? colors.text : colors.surf} />}
              onPress={() => void copyPrompt()}
            />
          </Card>

          {/* The step that happens somewhere else. No button, because there is
              nothing here to press — but leaving it out left the page with
              "copy" and "paste" and nothing about what goes between them. */}
          <Card pad="md" gap={space[2]}>
            <Step number={2} title="Ask your AI" />
            <Text style={styles.note}>Open ChatGPT, Claude or any AI and paste the prompt.</Text>
            <Text style={styles.note}>It asks what you want to learn. In a chat you already had, it makes cards from that chat.</Text>
          </Card>

          <Card pad="md" gap={space[3]}>
            <Step number={3} title="Bring its reply back" />
            <Text style={styles.note}>When it gives you the cards, copy that whole reply, come back and tap Paste.</Text>
            <Button
              label={read ? 'Paste more' : 'Paste'}
              size="sm" width="full" variant={read ? 'secondary' : 'primary'}
              onPress={() => void paste()}
            />
            <Button label="Or choose a file" size="sm" width="full" variant="ghost" onPress={() => void pickFile()} />
          </Card>

          {read && (
            <Card pad="md" gap={space[3]}>
              <Step number={4} title="Check and save" />
              <View style={styles.head}>
                <Text style={styles.summary}>
                  {plural(chosen.length, 'card', 'cards')}
                  {chosen.length > 0 && `  ·  ${withPractice === chosen.length ? 'all' : withPractice} with questions`}
                </Text>
                <Pressable
                  accessibilityRole="button" hitSlop={10}
                  onPress={() => setPicked(allPicked ? [] : read.cards.map((card) => card.id))}
                >
                  <Text style={styles.all}>{allPicked ? 'Clear all' : 'Select all'}</Text>
                </Pressable>
              </View>

              {read.problems.map((problem, at) => <Text key={at} style={styles.problem}>{problem}</Text>)}

              <View style={styles.rows}>
                {read.cards.map((card) => (
                  <Row
                    key={card.id} card={card} picked={picked.includes(card.id)}
                    already={held.has(card.term.toLocaleLowerCase())}
                    onToggle={() => setPicked((current) => (
                      current.includes(card.id) ? current.filter((id) => id !== card.id) : [...current, card.id]
                    ))}
                  />
                ))}
              </View>

              {lessonId ? (
                <Text style={styles.note}>
                  Adding to <Text style={styles.strong}>{lesson?.name ?? 'this lesson'}</Text>
                </Text>
              ) : (
                <>
                  {/* A name for a new lesson, or a search of the ones they have. */}
                  <LessonNameField value={name} onChangeText={setName}
                    chosen={existing} onChoose={setExisting} disabled={saving} />
                  {/* Which kind of lesson, as the AI judged it, and theirs to change.
                      Asked here rather than before the prompt: until there are
                      cards there is nothing to be the kind of. A lesson they
                      already have is already one kind. */}
                  {!existing && <LearningModeSelector value={mode} onChange={setMode} />}
                </>
              )}

              {done ? (
                <>
                  <Text style={styles.saved}>
                    {plural(done.cards, 'card', 'cards')} saved in <Text style={styles.strong}>{lessonName}</Text>
                    {done.questions > 0 && `, with ${plural(done.questions, 'question', 'questions')}`}.
                  </Text>
                  <Button label="Open the lesson" size="sm" width="full"
                    onPress={() => router.replace(`/lessons/${done.lessonId}` as never)} />
                </>
              ) : (
                <Button
                  label={chosen.length ? `Save ${plural(chosen.length, 'card', 'cards')}` : 'Nothing ticked'}
                  size="sm" width="full" loading={saving} disabled={!chosen.length || saving}
                  onPress={() => void save()}
                />
              )}
            </Card>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </EdBase>
  );
}

function Step({ number, title }: { number: number; title: string }) {
  return (
    <View style={styles.step}>
      <View style={styles.badge}><Text style={styles.badgeText}>{number}</Text></View>
      <Text style={styles.stepTitle}>{title}</Text>
    </View>
  );
}

function Row({ card, picked, already, onToggle }: { card: ImportedCard; picked: boolean; already: boolean; onToggle: () => void }) {
  /* One short line under the definition says what will be practised. A card
   * whose questions did not pass is not an error: it comes in as a flashcard. */
  const practice = already ? 'Already in this lesson'
    : card.questions.length
    ? plural(card.questions.length, 'question', 'questions')
    : 'Flashcard only';
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: picked }}
      accessibilityLabel={`${card.term}: ${card.definition}`}
      onPress={onToggle}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={styles.boxLine}>
        <View style={[styles.box, picked && styles.boxOn]}>
          {picked && <Icon name="check" size={13} color={colors.text} />}
        </View>
      </View>
      <View style={styles.rowText}>
        <Text numberOfLines={2} style={[styles.term, !picked && styles.dimmed]}>{card.term}</Text>
        <Text numberOfLines={2} style={[styles.definition, !picked && styles.dimmed]}>{card.definition}</Text>
        <Text numberOfLines={1} style={[styles.detail, already && styles.detailFlag]}>
          {practice}
        </Text>
      </View>
    </Pressable>
  );
}

const BADGE = 24;

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: layout.screenInline, paddingBottom: space[8], gap: space[4] },
  lead: { ...type.body, fontFamily: fonts.regular, color: colors.sub },
  step: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  badge: {
    width: BADGE, height: BADGE, borderRadius: radius.pill,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.tint,
  },
  badgeText: { ...type.caption, fontFamily: fonts.semibold, color: colors.text },
  stepTitle: { ...type.body, fontFamily: fonts.semibold, color: colors.text },
  note: { ...type.caption, fontFamily: fonts.regular, color: colors.sub },
  strong: { fontFamily: fonts.semibold, color: colors.text },
  head: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  summary: { ...type.caption, fontFamily: fonts.regular, color: colors.sub, flex: 1 },
  all: { ...type.caption, fontFamily: fonts.semibold, color: colors.action },
  problem: { ...type.caption, fontFamily: fonts.regular, color: colors.red },
  rows: { gap: space[1] },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space[3], paddingVertical: space[2] },
  rowPressed: { opacity: 0.6 },
  boxLine: { height: type.body.lineHeight, justifyContent: 'center' },
  box: {
    width: 22, height: 22, borderRadius: radius.sm,
    borderWidth: 1.5, borderColor: colors.line,
    alignItems: 'center', justifyContent: 'center',
  },
  boxOn: { backgroundColor: colors.limeSurface, borderColor: colors.action },
  rowText: { flex: 1, gap: space[0] },
  term: { ...type.body, fontFamily: fonts.semibold, color: colors.text },
  definition: { ...type.caption, fontFamily: fonts.regular, color: colors.sub },
  detail: { ...type.caption, fontFamily: fonts.regular, color: colors.faint },
  detailFlag: { color: colors.sub },
  dimmed: { color: colors.faint },
  saved: { ...type.body, fontFamily: fonts.regular, color: colors.text },
});
