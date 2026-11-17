/**
 * The chat surface: what was asked, what came back, and the box to say more.
 *
 * It knows nothing about any particular interface. A finished interface arrives as
 * a part with a name and some props, and `renderComponent` draws it — so adding
 * `show_card_drafts` later touches that function and not this file. The shell's own
 * job is the three things that are easy to get wrong: prose that grows a token at a
 * time without the list jumping, something honest on screen while nothing is being
 * said, and a turn that ends badly ending somewhere the person can act from.
 *
 * The source of events is a prop as well, which is how the lab drives it with a
 * scripted answer and no server.
 */

import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { chatEvents, type ChatAsk, type ChatSource } from '@/lib/chatClient';
import { applyEvent, endWithoutDone, startTurn, type ChatPart, type ChatTurn } from '@/lib/chatTurn';
import { colors, fonts, radius, space, type } from '@/theme';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator, Animated, Easing, KeyboardAvoidingView, Platform,
  Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';

/** What the app says while the model has not spoken yet. The server sends the
 *  state; the wording belongs here, in the app's own voice. */
const WAITING: Record<string, string> = {
  thinking: 'Thinking…',
  reading: 'Looking through your lessons…',
  drafting: 'Writing the cards…',
};

export type ChatShellProps = {
  mode: ChatAsk['mode'];
  /** Where the conversation was opened from, passed to the model as data. */
  context?: ChatAsk['context'];
  /** Draws one finished interface. Return null for a name this screen does not
   *  know, and the shell will say so rather than show an empty gap. */
  renderComponent?: (part: { name: string; props: unknown }) => ReactNode;
  /** Replaced in the lab and in tests. Defaults to the live chat function. */
  source?: ChatSource;
  placeholder?: string;
  /** Shown before anything has been asked. */
  opening?: string;
};

export function ChatShell({ mode, context, renderComponent, source, placeholder, opening }: ChatShellProps) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const threadId = useRef<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const scroller = useRef<ScrollView>(null);
  /** Where each turn starts, so a part's own offset can be turned into one the
   *  scroll view understands. */
  const turnTops = useRef<Record<number, number>>({});
  /** Set when an interface has just been laid out, and consumed by whichever of
   *  the two scroll triggers gets there first. */
  const anchor = useRef<number | null>(null);

  const showAnchor = useCallback(() => {
    const y = anchor.current;
    if (y == null) return false;
    anchor.current = null;
    // A little above it, so it does not sit flush against the top edge.
    scroller.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });
    return true;
  }, []);

  // A turn in flight when the screen closes would otherwise keep writing into
  // state that is no longer mounted.
  useEffect(() => () => abort.current?.abort(), []);

  const send = useCallback(async (question: string) => {
    const text = question.trim();
    if (!text || sending) return;
    setDraft('');
    setSending(true);

    const index = turns.length;
    setTurns((previous) => [...previous, startTurn(text, threadId.current)]);
    const update = (change: (turn: ChatTurn) => ChatTurn) =>
      setTurns((previous) => previous.map((turn, at) => (at === index ? change(turn) : turn)));

    const controller = new AbortController();
    abort.current = controller;
    let closed = false;
    try {
      for await (const event of chatEvents(
        { mode, message: text, threadId: threadId.current, context },
        { source, signal: controller.signal },
      )) {
        if (event.type === 'done') { closed = true; threadId.current = event.thread_id ?? threadId.current; }
        if (event.type === 'error') closed = true;
        update((turn) => applyEvent(turn, event));
      }
      // The stream ended on its own without saying so: say it stopped rather than
      // leaving a thinking face on screen for ever.
      if (!closed) update(endWithoutDone);
    } catch (error) {
      if (!controller.signal.aborted) {
        const message = error instanceof Error ? error.message : 'Could not reach chat.';
        update((turn) => applyEvent(turn, { type: 'error', code: 'internal', message }));
      }
    } finally {
      if (abort.current === controller) abort.current = null;
      setSending(false);
    }
  }, [context, mode, sending, source, turns.length]);

  const retry = useCallback((question: string) => {
    // Drop the failed turn before asking again, so the thread does not keep a
    // half-answer the person has already been told about.
    setTurns((previous) => previous.slice(0, -1));
    void send(question);
  }, [send]);

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        ref={scroller}
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardDismissMode="interactive"
        onContentSizeChange={() => { if (!showAnchor()) scroller.current?.scrollToEnd({ animated: true }); }}
      >
        {opening && turns.length === 0 && <Text style={styles.opening}>{opening}</Text>}
        {turns.map((turn, index) => (
          <View
            key={index}
            style={styles.turn}
            onLayout={(event) => { turnTops.current[index] = event.nativeEvent.layout.y; }}
          >
            <View style={styles.asked}><Text style={styles.askedText}>{turn.question}</Text></View>
            {turn.parts.map((part, at) => (
              <Part
                key={at}
                part={part}
                renderComponent={renderComponent}
                onComponentLayout={(y) => {
                  // An interface is read from its top: it says where the cards are
                  // going, and that is the part someone has to see before deciding.
                  // Scrolling to the end of the conversation would push it off.
                  anchor.current = (turnTops.current[index] ?? 0) + y;
                  requestAnimationFrame(showAnchor);
                }}
              />
            ))}
            {turn.status && <Waiting label={WAITING[turn.status] ?? 'Working…'} />}
            {!turn.status && !turn.done && turn.parts.length === 0 && <Waiting label="Thinking…" />}
            {turn.error && (
              <View style={styles.failed}>
                <Text style={styles.failedText}>{turn.error.message}</Text>
                {/* Nothing to retry for a refusal the person has to resolve first. */}
                {turn.error.code !== 'quota' && turn.error.code !== 'daily_budget' && (
                  <Pressable accessibilityRole="button" onPress={() => retry(turn.question)} hitSlop={8}>
                    <Text style={styles.retry}>Try again</Text>
                  </Pressable>
                )}
              </View>
            )}
          </View>
        ))}
      </ScrollView>

      <View style={styles.bar}>
        <Field
          value={draft}
          onChangeText={setDraft}
          placeholder={placeholder ?? 'Say what you want to learn'}
          multiline
          editable={!sending}
          onSubmitEditing={() => void send(draft)}
          returnKeyType="send"
          style={styles.input}
        />
        <Button
          label="Send"
          size="sm"
          width="hug"
          disabled={!draft.trim() || sending}
          loading={sending}
          onPress={() => void send(draft)}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

function Part({ part, renderComponent, onComponentLayout }: {
  part: ChatPart;
  renderComponent?: ChatShellProps['renderComponent'];
  onComponentLayout?: (y: number) => void;
}) {
  if (part.kind === 'text') {
    return <Text style={styles.said}>{part.text}</Text>;
  }
  const drawn = renderComponent?.({ name: part.name, props: part.props });
  if (drawn) {
    return (
      <View style={styles.component} onLayout={(event) => onComponentLayout?.(event.nativeEvent.layout.y)}>
        {drawn}
      </View>
    );
  }
  // An interface this build cannot draw — a newer server, or a screen that was not
  // given a renderer. Say so instead of leaving a gap.
  return <Text style={styles.unknown}>This needs a newer version of the app to show.</Text>;
}

/** Something honest on screen while the model has not spoken. The line breathes so
 *  it reads as working rather than stuck; it says what is happening, never a
 *  percentage it cannot know. */
function Waiting({ label }: { label: string }) {
  const pulse = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 760, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0.45, duration: 760, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <View style={styles.waiting}>
      <ActivityIndicator size="small" color={colors.sub} />
      <Animated.Text style={[styles.waitingText, { opacity: pulse }]}>{label}</Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  content: { padding: space[4], gap: space[6], paddingBottom: space[8] },
  opening: { ...type.body, fontFamily: fonts.regular, color: colors.sub },
  turn: { gap: space[2] },
  asked: {
    alignSelf: 'flex-end',
    maxWidth: '85%',
    backgroundColor: colors.limeSurface,
    paddingHorizontal: space[4],
    paddingVertical: space[2],
    borderRadius: radius.lg,
  },
  askedText: { ...type.body, fontFamily: fonts.medium, color: colors.text },
  said: { ...type.body, fontFamily: fonts.regular, color: colors.text },
  component: { marginVertical: space[2] },
  unknown: { ...type.caption, fontFamily: fonts.regular, color: colors.faint },
  waiting: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  waitingText: { ...type.caption, fontFamily: fonts.regular, color: colors.sub },
  failed: { gap: space[2] },
  failedText: { ...type.caption, fontFamily: fonts.regular, color: colors.red },
  retry: { ...type.caption, fontFamily: fonts.semibold, color: colors.action },
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space[2],
    padding: space[4],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    backgroundColor: colors.surf,
  },
  input: { flex: 1 },
});
