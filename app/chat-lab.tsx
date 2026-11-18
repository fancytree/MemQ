/**
 * Where the chat surface is taken apart.
 *
 * The shell is driven here by scripted answers instead of the chat function, for
 * two reasons: the branches that matter are the awkward ones — a stream that stops
 * early, a refusal, an interface this build cannot draw — and none of them are
 * convenient to produce on demand from a real server. The second reason is plainer:
 * the backend cannot be run locally yet, and the surface should not have to wait.
 *
 * Chunks below are cut on purpose in the middle of events and in the middle of
 * words, because an answer that only ever arrived on tidy boundaries would not
 * exercise the parser's buffer or the prose joining.
 */

import { CardDrafts } from '@/components/chat/CardDrafts';
import { ChatShell } from '@/components/chat/ChatShell';
import { EdBase } from '@/components/EdBase';
import { SecondaryPageNav } from '@/components/SecondaryPageNav';
import { Button } from '@/components/ui/Button';
import { scriptedSource, type ChatSource } from '@/lib/chatClient';
import { safeBack } from '@/lib/safeBack';
import { colors, fonts, radius, space, type } from '@/theme';
import { Redirect, Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

const frame = (event: unknown) => `data: ${JSON.stringify(event)}\n\n`;

/** Prose arriving a few characters at a time, as a model actually sends it. */
function prose(text: string, size = 7): string[] {
  const out: string[] = [];
  for (let at = 0; at < text.length; at += size) {
    out.push(frame({ type: 'text', delta: text.slice(at, at + size) }));
  }
  return out;
}

/** Cuts a stream into pieces that do not respect event boundaries. */
function ragged(frames: string[]): string[] {
  const whole = frames.join('');
  const pieces: string[] = [];
  for (let at = 0; at < whole.length;) {
    const size = 11 + ((at * 7) % 23);
    pieces.push(whole.slice(at, at + size));
    at += size;
  }
  return pieces;
}

// language_data stands in for what the chat function attaches on the way out: the
// model never sends it, so a scripted answer has to carry it the same way.
const ORDERING_CARDS = [
  { id: 'd1', term: 'un tavolo per due', definition: 'a table for two',
    language_data: { language_code: 'it-IT', pronunciation: 'oon TAH-voh-loh per DOO-eh', example: 'Un tavolo per due, per favore.' } },
  { id: 'd2', term: 'il conto, per favore', definition: 'the bill, please',
    language_data: { language_code: 'it-IT', pronunciation: 'eel KON-toh per fah-VOH-reh', example: 'Scusi, il conto per favore.' } },
  { id: 'd3', term: 'sono allergico a...', definition: 'I am allergic to...', explanation: 'Follow with the food.',
    language_data: { language_code: 'it-IT', pronunciation: 'SOH-noh ah-LEHR-jee-koh ah', example: 'Sono allergico alle noci.' } },
  { id: 'd4', term: 'posso avere il menu?', definition: 'can I have the menu?',
    language_data: { language_code: 'it-IT', pronunciation: 'POS-soh ah-VEH-reh eel meh-NOO' } },
  // Deliberately without details, to see a card that carries none.
  { id: 'd5', term: 'senza glutine', definition: 'gluten free' },
];

const SCENARIOS: Record<string, { label: string; note: string; source: ChatSource }> = {
  answer: {
    label: 'A normal answer',
    note: 'status → prose → an interface. Prose should grow smoothly and the waiting line should disappear the moment it starts.',
    source: scriptedSource(ragged([
      frame({ type: 'status', status: 'thinking' }),
      frame({ type: 'status', status: 'reading' }),
      ...prose('I’ll check your lessons for a good fit, then draft about five Italian ordering cards.'),
      frame({ type: 'status', status: 'drafting' }),
      ...prose('\n\nThese go with your Italian basics lesson.'),
      frame({ type: 'component', name: 'start_practice', props: { lesson_id: '11111111-1111-4111-8111-111111111111', lesson_name: 'Norse gods' } }),
      frame({ type: 'done', thread_id: 'lab-thread-1' }),
    ]), 55),
  },
  silent: {
    label: 'No prose at all',
    note: 'What the model did before the prompt asked it to speak first. Only the waiting line, then an interface.',
    source: scriptedSource(ragged([
      frame({ type: 'status', status: 'thinking' }),
      frame({ type: 'status', status: 'drafting' }),
      frame({ type: 'component', name: 'start_practice', props: {} }),
      frame({ type: 'done', thread_id: 'lab-thread-1' }),
    ]), 400),
  },
  cut: {
    label: 'Stream stops early',
    note: 'No done event. The half answer should stay, the waiting should stop, and a retry should be offered.',
    source: scriptedSource(ragged([
      frame({ type: 'status', status: 'thinking' }),
      ...prose('Let me look at what you already have and then I’ll dra'),
    ]), 55),
  },
  quota: {
    label: 'Out of messages',
    note: 'A refusal the person cannot retry away: there should be no Try again.',
    source: scriptedSource([
      frame({ type: 'status', status: 'thinking' }),
      frame({ type: 'error', code: 'quota', message: 'You have used this month’s AI messages.' }),
    ], 220),
  },
  draftsExisting: {
    label: 'Drafts for a lesson you have',
    note: '⚠️ Keep writes for real, into whichever project this build points at. Tick things to check the count; only press Keep if you mean it.',
    source: scriptedSource(ragged([
      ...prose('These go with your Italian basics lesson.'),
      frame({ type: 'component', name: 'show_card_drafts', props: {
        cards: ORDERING_CARDS,
        target: { kind: 'existing', lesson_id: '11111111-1111-4111-8111-111111111111', lesson_name: 'Italian basics', learning_mode: 'language', why: 'These beginner phrases extend it into restaurants.' },
      } }),
      frame({ type: 'done', thread_id: 'lab-thread-1' }),
    ]), 45),
  },
  draftsNew: {
    label: 'Drafts for a new lesson',
    note: '⚠️ Keep really creates a lesson. A new lesson with its name filled in, and two cards left unticked to check the count.',
    source: scriptedSource(ragged([
      ...prose('Nothing of yours fits, so here is a new one.'),
      frame({ type: 'component', name: 'show_card_drafts', props: {
        cards: ORDERING_CARDS,
        target: { kind: 'new', name: 'Ordering food in Italian', description: 'Phrases for a restaurant, from the table to the bill.', learning_mode: 'language' },
        preselected: ['d1', 'd2', 'd4'],
      } }),
      frame({ type: 'done', thread_id: 'lab-thread-1' }),
    ]), 45),
  },
  unknown: {
    label: 'An interface this build cannot draw',
    note: 'A newer server sends a component this app does not know. It should say so, not leave a gap.',
    source: scriptedSource([
      ...prose('Here is what I found.'),
      frame({ type: 'component', name: 'show_future_thing', props: { whatever: true } }),
      frame({ type: 'done', thread_id: 'lab-thread-1' }),
    ], 90),
  },
  junk: {
    label: 'Noise on the wire',
    note: 'Keep-alive comments, a malformed event and an unknown status, with a good answer around them.',
    source: scriptedSource(ragged([
      ': keep-alive\n\n',
      frame({ type: 'status', status: 'dancing' }),
      'data: {not json\n\n',
      ...prose('The noise around this answer should have been ignored.'),
      'retry: 1000\n\n',
      frame({ type: 'done', thread_id: 'lab-thread-1' }),
    ]), 40),
  },
};

type ScenarioKey = keyof typeof SCENARIOS;

function ChatLabScreen() {
  const [scenario, setScenario] = useState<ScenarioKey>('answer');
  const picked = SCENARIOS[scenario];

  return (
    // EdBase is what every second-level page sits in: it owns the safe area, so the
    // back bar does not end up printed over the clock. bottomInset 0 because the
    // shell draws its own bar down there.
    <EdBase scroll={false} bottomInset={0}>
      <Stack.Screen options={{ headerShown: false }} />
      <SecondaryPageNav onBack={() => safeBack('/profile/settings')} backLabel="← Chat lab" />
      <View style={styles.picker}>
        {(Object.keys(SCENARIOS) as ScenarioKey[]).map((key) => (
          <Pressable
            key={key}
            accessibilityRole="button"
            accessibilityState={{ selected: key === scenario }}
            onPress={() => setScenario(key)}
            style={[styles.chip, key === scenario && styles.chipOn]}
          >
            <Text style={[styles.chipText, key === scenario && styles.chipTextOn]}>{SCENARIOS[key].label}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.note}>{picked.note}</Text>
      {/* Remounted per scenario so each one starts from an empty conversation. */}
      <ChatShell
        key={scenario}
        mode="create"
        source={picked.source}
        opening="Ask for anything — this lab replays a scripted answer."
        placeholder="Type anything"
        renderComponent={({ name, props }) => {
          if (name === 'show_card_drafts') return <CardDrafts raw={props} />;
          if (name === 'start_practice') {
            return (
              <Button
                label={(props as { label?: string })?.label ?? 'Start practice'}
                size="sm"
                width="hug"
                onPress={() => {}}
              />
            );
          }
          return null;
        }}
      />
    </EdBase>
  );
}

export default function ChatLab() {
  return __DEV__ ? <ChatLabScreen /> : <Redirect href="/" />;
}

const styles = StyleSheet.create({
  picker: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2], paddingHorizontal: space[4], paddingTop: space[2] },
  chip: {
    paddingHorizontal: space[3],
    paddingVertical: space[2],
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.surf,
  },
  chipOn: { backgroundColor: colors.limeSurface, borderColor: colors.action },
  chipText: { ...type.caption, fontFamily: fonts.medium, color: colors.sub },
  chipTextOn: { color: colors.text },
  note: { ...type.caption, fontFamily: fonts.regular, color: colors.faint, paddingHorizontal: space[4], paddingTop: space[2] },
});
