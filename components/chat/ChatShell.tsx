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

import { AnchoredMenu, MenuLayer, type MenuAction } from '@/components/ui/AnchoredMenu';
import { PhotoSheet, type PickedPhoto } from '@/components/chat/PhotoSheet';
import { AnswerActions } from '@/components/chat/AnswerActions';
import { Starters } from '@/components/chat/Starters';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { ATTACH_MAX, attachFile, AttachError, type Attached } from '@/lib/chatAttach';
import { ChatError, chatEvents, type ChatAsk, type ChatSource } from '@/lib/chatClient';
import { fileTurn, loadThread, refile, rowId } from '@/lib/chatThread';
import { applyEvent, endWithoutDone, startTurn, type ChatPart, type ChatTurn } from '@/lib/chatTurn';
import { CreditsLine } from '@/components/CreditsLine';
import { useSubscription } from '@/context/SubscriptionContext';
import { dialog } from '@/lib/dialog';
import { useCredits } from '@/lib/useCredits';
import { supabase } from '@/lib/supabase';
import { colors, componentTokens, fonts, radius, space, type } from '@/theme';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator, Animated, Easing, Image, KeyboardAvoidingView, Platform,
  Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';

/** What the app says while the model has not spoken yet. The server sends the
 *  state; the wording belongs here, in the app's own voice. */
/* One line of `type.body` is 24 high. Six above and six below puts it at 36 — the
 * same as the small round buttons either side of it — so a single line sits level
 * with them instead of hanging below. Each further line adds its 24; four lines is
 * where it stops growing and starts scrolling. */
const INPUT_LINE = 24;
const INPUT_PAD = 6;
const INPUT_MIN = INPUT_LINE + INPUT_PAD * 2;
const INPUT_MAX = INPUT_LINE * 4 + INPUT_PAD * 2;

/** The three ways to add something. A photo of a page and a PDF end up in the
 *  same place: the processor reads both. */
const ADD: MenuAction<'camera' | 'library' | 'file'>[] = [
  { id: 'camera', label: 'Take a photo', icon: 'camera' },
  { id: 'library', label: 'Choose a photo', icon: 'photo' },
  { id: 'file', label: 'Choose a file', icon: 'paperclip' },
];

const WAITING: Record<string, string> = {
  thinking: 'Thinking…',
  reading: 'Looking through your lessons…',
  drafting: 'Writing the cards…',
};

/** An answer as one string: its prose, with the interfaces left out. What copy
 *  puts on the clipboard and what listen reads aloud — a card of drafts is not
 *  something either of those can carry, and the blank line keeps two paragraphs
 *  that an interface sat between from running together. */
/** A turn as the screen holds it: the turn itself, and a name that stays its own
 *  whatever is removed around it. */
type Shown = ChatTurn & { id: number };

/** What a send may carry besides the words. Both are things the app knows and the
 *  model would otherwise have to guess. */
type SendOptions = {
  /** This question is replacing the answer it got. */
  retry?: boolean;
  /** A button with one meaning was pressed (see `forcedTool` on the server). */
  intent?: 'draft';
};

function prose(turn: ChatTurn): string {
  return turn.parts
    .filter((part) => part.kind === 'text')
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join('\n\n');
}

/**
 * How close to the end still counts as being at the end.
 *
 * A few lines of slack, so the button does not appear because an answer grew by
 * a word while it was being read, and does not flicker on and off as a thumb
 * settles. Below this the end of the answer is on screen and there is nothing to
 * go back down to.
 */
const NEAR_BOTTOM = 120;

/** How long to wait for the first event before calling it off. The function
 *  answers with a status as soon as it has the request, so this is a clock on
 *  the connection and not on the model. */
const SILENCE_LIMIT = 20_000;

/**
 * How long the stream may then say nothing at all.
 *
 * The first version of the watchdog stopped at the first event, on the reasoning
 * that an answer taking a minute to write is still an answer. True — but it says
 * so as it goes, a token at a time, and `status: thinking` arrives within a few
 * hundred milliseconds of the request whatever happens next. So the clock was
 * being cleared by the one event that proves nothing, and a stream that opened
 * and then stalled left the waiting line on screen with no end: seen here, after
 * a redeploy, sitting on "Still waiting for an answer…" indefinitely.
 *
 * Now every event winds it up again. Longer than the first-contact limit,
 * because by this point a model really is working and tool rounds pass without
 * a word; long enough that no turn that is going to finish ever reaches it.
 */
const STALL_LIMIT = 45_000;

/** How long a conversation that has just been brought back is given to lay
 *  itself out. Its cards measure themselves and grow, and each growth would
 *  otherwise be an animated scroll: the screen would be seen travelling down a
 *  conversation it should simply have opened at the end of. */
const SETTLE = 900;

/**
 * What the waiting line says while nothing has come back yet.
 *
 * Only while the server has said nothing. Once it does, its own status is better
 * than anything guessed here, because it knows what it is actually doing.
 *
 * None of these claim progress. A line that said "almost there" would be making
 * something up; these say only that the app is awake and that it knows this is
 * slower than it should be — which is what someone staring at a spinner actually
 * wants to know.
 */
const PATIENCE: { after: number; label: string }[] = [
  { after: 16_000, label: 'Still waiting for an answer…' },
  { after: 7_000, label: 'Still thinking…' },
];

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
  /** A few things to say, offered under the opening while the conversation is
   *  empty. Each screen writes its own: what is worth suggesting depends on what
   *  that line's tools can actually do. */
  starters?: string[];
  /** Told when the conversation starts and when it is empty again, so the screen
   *  around it knows whether there is anything to clear. */
  onStarted?: (started: boolean) => void;
  /** Whether this conversation is the kept one: brought back when the screen
   *  opens, and written to as it goes (lib/chatThread.ts). On unless a scripted
   *  source stands in for the server — the lab's conversations are nobody's. */
  kept?: boolean;
  /** Open empty, without looking for a conversation to bring back. Set by the
   *  screen right after clearing, when it already knows there is none. */
  fresh?: boolean;
};

/* The pickers are loaded when they are first wanted, not at import: these native
 * modules are missing in some runtimes, and a top-level import takes the screen
 * down with it. The create screen does the same for its own file picker. */
type Picked = { uri: string; name: string; type?: string | null };

/* Photos are asked for as the most compatible representation, not the one on disk:
 * an iPhone photographs in HEIC and the model does not read HEIC, so without this
 * every picked photo would be refused. 0.8 keeps a page of text legible at a
 * fraction of the bytes. */
const PHOTO: { quality: number; preferredAssetRepresentationMode: 'compatible' } = {
  quality: 0.8, preferredAssetRepresentationMode: 'compatible',
};
type DocumentResult = {
  canceled: boolean;
  assets?: { uri: string; name?: string; mimeType?: string | null }[] | null;
};
type ImageResult = {
  canceled: boolean;
  assets?: { uri: string; fileName?: string | null; mimeType?: string | null }[] | null;
};
type DocumentPicker = {
  getDocumentAsync: (options: { copyToCacheDirectory?: boolean; type?: string[] }) => Promise<DocumentResult>;
};
type ImageOptions = {
  quality?: number;
  /** iOS: ask for the representation that is most widely readable rather than the
   *  one on disk. Without it an iPhone hands back the HEIC it photographed, which
   *  the model cannot open. */
  preferredAssetRepresentationMode?: 'automatic' | 'compatible' | 'current';
  allowsMultipleSelection?: boolean;
  selectionLimit?: number;
};
type ImagePicker = {
  requestCameraPermissionsAsync: () => Promise<{ granted: boolean }>;
  requestMediaLibraryPermissionsAsync: () => Promise<{ granted: boolean }>;
  launchCameraAsync: (options?: ImageOptions) => Promise<ImageResult>;
  launchImageLibraryAsync: (options?: ImageOptions) => Promise<ImageResult>;
};
let documentPicker: DocumentPicker | null | undefined;
let imagePicker: ImagePicker | null | undefined;
function loadDocumentPicker(): DocumentPicker | null {
  if (documentPicker === undefined) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    try { const mod = require('expo-document-picker'); documentPicker = (mod?.default ?? mod) as DocumentPicker; }
    catch { documentPicker = null; }
  }
  return documentPicker;
}
function loadImagePicker(): ImagePicker | null {
  if (imagePicker === undefined) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    try { const mod = require('expo-image-picker'); imagePicker = (mod?.default ?? mod) as ImagePicker; }
    catch { imagePicker = null; }
  }
  return imagePicker;
}

/**
 * How a drawn interface says something back into the conversation.
 *
 * An interface is the end of one turn, not a place to hold the rest of the
 * exchange. When the drafts card asked "keep these?" and the person said yes, the
 * next question — where do they go — used to appear as a second block inside that
 * same answer, and one turn ended up doing two things: here is what I wrote, and
 * now decide where it lands. Two decisions under one bubble, with the one being
 * made now no more prominent than the one already settled.
 *
 * So a component can add a turn. The tap becomes what the person said, and the
 * next question becomes the next thing answered — the same shape as every other
 * exchange on the screen, because that is what it is.
 *
 * Local to the app: nothing is sent, nothing is charged, and the model is not
 * asked. The thread the server keeps does not hear about it, which is right —
 * these are the app and the person settling where something goes, and the model
 * has already said its piece.
 */
type Say = (
  said: string, part: ChatPart,
  /** What happened, in a sentence, for the record: the turn is kept with the
   *  conversation, and the model is told this much about it and no more. */
  note?: string,
) => void;
const SayContext = createContext<Say | null>(null);

/** For a component drawn inside the conversation. Outside one it does nothing,
 *  so a card can be rendered on its own page without special-casing. */
export function useSay(): Say {
  return useContext(SayContext) ?? noSay;
}
const noSay: Say = () => {};

/**
 * How a drawn interface remembers what became of it.
 *
 * A conversation is brought back when the screen reopens, and each interface in
 * it is drawn again from what the server sent. That is only half of what was on
 * screen: the drafts had been handed over, the cards had been saved. Drawn again
 * without that, the drafts would offer to be kept a second time — and would be.
 *
 * So a component can write down what happened to it, and is given it back the
 * next time it is drawn. What it writes is its own business; the shell only
 * carries it. `note`, when given, replaces what the model is told about this
 * interface, for the cases where what happened is something it should know
 * ("3 cards were saved to Norse gods").
 */
type Keeper = { state: unknown; keep: (state: unknown, note?: string) => void };
const KeptContext = createContext<Keeper | null>(null);

export function useKept<T>(): [T | null, (state: T, note?: string) => void] {
  const keeper = useContext(KeptContext);
  return [(keeper?.state ?? null) as T | null, keeper?.keep ?? noKeep];
}
const noKeep = () => {};

type ComponentPart = Extract<ChatPart, { kind: 'component' }>;

export function ChatShell({
  mode, context, renderComponent, source, placeholder, opening, starters, onStarted,
  kept = !source, fresh = false,
}: ChatShellProps) {
  const { isPro, showPaywall } = useSubscription();
  /** The month's AI credits (lib/aiCredits.ts): a message here costs one. */
  const { credits, refresh: refreshCredits, spend } = useCredits();
  const [turns, setTurns] = useState<Shown[]>([]);
  /** True while the kept conversation is being read. The screen opens on nothing
   *  rather than on its greeting, which would be replaced a moment later. */
  const [restoring, setRestoring] = useState(kept && !fresh);
  /** The last turn that was brought back rather than had. Those are drawn where
   *  they fall; only an interface that has just arrived pulls the view to itself. */
  const restored = useRef(0);
  /** Set while a restored conversation settles, so it opens at its end instead of
   *  being seen to scroll there. */
  const settling = useRef(false);
  /** Whether anything has been asked since the screen opened. */
  const [asked, setAsked] = useState(false);
  /** Who is signed in, for the rows this screen files itself. */
  const user = useRef<string | null>(null);
  /** Writes to the record, one after another: what became of a turn must not
   *  arrive before the turn. */
  const writes = useRef<Promise<unknown>>(Promise.resolve());
  /** The next turn's id. Turns are found by this and never by where they sit:
   *  asking again removes turns, and a position read before the removal points at
   *  a turn that is no longer there — the new answer was being written to it, and
   *  the screen sat on "Thinking…" until the watchdog gave up. */
  const nextId = useRef(1);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  /** Files waiting for the message they belong to. They ride on that one message:
   *  a document re-sent every turn is paid for every turn, and by then the answer
   *  already says what was in it. */
  const [attached, setAttached] = useState<Attached[]>([]);
  /** True while the file is going up. Short now that nothing is transcribed on
   *  the way — the model reads the file itself — but a large PDF on a slow
   *  connection is still a wait, and it belongs on screen. */
  const [reading, setReading] = useState(false);
  /** Whether the app's own photo grid is up. */
  const [picking, setPicking] = useState(false);
  const last = turns[turns.length - 1];
  /** The row of attachments, so a new one can be scrolled into view. */
  const tray = useRef<ScrollView>(null);
  /** The box itself, so a starter can hand it the words and the caret. */
  const input = useRef<TextInput>(null);
  /** Which turn came with which files, so the conversation still shows what a
   *  question was asked about after the thumbnails have gone. */
  const askedWith = useRef<Record<number, Attached[]>>({});
  const threadId = useRef<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const scroller = useRef<ScrollView>(null);
  /** Where each turn starts, so a part's own offset can be turned into one the
   *  scroll view understands. */
  const turnTops = useRef<Record<number, number>>({});
  /** Set when an interface has just been laid out, and consumed by whichever of
   *  the two scroll triggers gets there first. */
  const anchor = useRef<number | null>(null);
  /** True once the view has been scrolled far enough off the bottom that the end
   *  of the answer is out of sight. Drives the button that goes back down. */
  const [adrift, setAdrift] = useState(false);

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

  /* Bring the conversation back.
   *
   * Once, when the screen opens. The stored session and not the network says who
   * this is, so the only waiting is the read itself. Whatever goes wrong, the
   * screen opens empty: a conversation that cannot be shown is not a reason to
   * keep someone from starting one. */
  useEffect(() => {
    if (!kept) return;
    let live = true;
    void (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const id = data.session?.user.id ?? null;
        user.current = id;
        if (!id || fresh) return;
        const found = await loadThread(supabase, id, mode);
        if (!live || !found) return;
        threadId.current = found.threadId;
        if (!found.turns.length) return;
        const shown = found.turns.map((turn) => ({ ...turn, id: nextId.current++ }));
        restored.current = shown[shown.length - 1].id;
        settling.current = true;
        setTimeout(() => { settling.current = false; }, SETTLE);
        setTurns(shown);
      } finally {
        if (live) setRestoring(false);
      }
    })();
    return () => { live = false; };
    // Read once for the screen it opened on; a change of line is a remount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { onStarted?.(turns.length > 0); }, [turns.length, onStarted]);

  const send = useCallback(async (question: string, options: SendOptions = {}) => {
    const text = question.trim();
    // Not while the conversation is still being read: the thread this would join
    // is not known yet, and it would start a second one beside it.
    if (!text || sending || restoring) return;
    const files = attached;
    setDraft('');
    setAttached([]);
    setSending(true);
    setAsked(true);

    const id = nextId.current++;
    if (files.length) askedWith.current[id] = files;
    setTurns((previous) => [...previous, { ...startTurn(text, threadId.current), id }]);
    const update = (change: (turn: ChatTurn) => ChatTurn) =>
      setTurns((previous) => previous.map((turn) => (turn.id === id ? { ...change(turn), id } : turn)));

    const controller = new AbortController();
    abort.current = controller;
    let closed = false;

    /* A watchdog on silence.
     *
     * A connection that never answers would leave "Thinking…" on screen for ever,
     * which is what being broken looks like; so would a stream that opens and
     * then stops saying anything. Both are the same thing from where the person
     * is sitting, so both are one clock, wound back up by every event that
     * arrives. A turn may take as long as it likes as long as it keeps saying so.
     *
     * `aborted` alone cannot tell a timeout from the screen closing — both abort
     * the same controller — so the reason is remembered here. */
    let settled = false;
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    const giveUp = () => {
      if (settled) return;
      settled = true;
      /* The timer does the visible thing itself rather than aborting and waiting
       * for the loop to unwind.
       *
       * Aborting alone was not enough: the loop is parked inside the transport's
       * own await, and `expo/fetch` did not come back out of it when the signal
       * fired — so the first version of this watchdog changed nothing on screen
       * and the spinner ran on exactly as before. The abort is still sent, as
       * cleanup; what the person sees no longer depends on it. */
      controller.abort();
      update((turn) => applyEvent(turn, {
        type: 'error', code: 'internal',
        message: 'Chat did not answer. Try again in a moment.',
      }));
      setSending(false);
    };
    /** Wind the clock back up. Called on every event, so the limit is on silence
     *  rather than on the turn, which is allowed to take as long as it says. */
    const wait = (limit: number) => {
      clearTimeout(watchdog);
      watchdog = setTimeout(giveUp, limit);
    };
    wait(SILENCE_LIMIT);

    try {
      for await (const event of chatEvents(
        {
          mode, message: text, threadId: threadId.current, context,
          ...(files.length ? { attachments: files } : {}),
          ...(options.retry ? { retry: true } : {}),
          ...(options.intent ? { intent: options.intent } : {}),
        },
        { source, signal: controller.signal },
      )) {
        // A late arrival after the watchdog has given up is dropped: the turn has
        // already been told it failed, and reviving it would contradict that.
        if (settled) return;
        wait(STALL_LIMIT);
        if (event.type === 'done') {
          closed = true;
          threadId.current = event.thread_id ?? threadId.current;
          // An answered message is one of the month's AI credits spent.
          spend(mode === 'create' ? 'ai_chat_create' : 'ai_chat');
        }
        if (event.type === 'error') {
          closed = true;
          // Refused: whatever the screen thought was left, it was wrong.
          refreshCredits();
        }
        update((turn) => applyEvent(turn, event));
      }
      // The stream ended on its own without saying so: say it stopped rather than
      // leaving a thinking face on screen for ever.
      if (!closed && !settled) update(endWithoutDone);
    } catch (error) {
      // The watchdog has already said its piece; anything thrown afterwards is the
      // transport noticing the abort, which the person does not need to hear about.
      if (settled) { /* said already */ }
      else if (!controller.signal.aborted) {
        // Whatever went wrong, the person is told the same thing they can act on.
        // Only our own sentences reach the screen: a dropped connection throws a
        // message with a Swift file and a line number in it, which reads as the app
        // being broken rather than as something to try again.
        if (!(error instanceof ChatError)) console.warn('chat turn', error);
        const message = error instanceof ChatError
          ? error.message : 'Chat could not be reached. Try again in a moment.';
        update((turn) => applyEvent(turn, { type: 'error', code: 'internal', message }));
      }
    } finally {
      clearTimeout(watchdog);
      if (abort.current === controller) abort.current = null;
      setSending(false);
    }
  }, [attached, context, mode, refreshCredits, restoring, sending, source, spend]);

  /**
   * Picking something to add, and putting it where chat can fetch it.
   *
   * The upload happens on the pick rather than on send, so the message goes in one
   * piece and a file that was never going to work says so while the person is
   * still standing where they took it. What the file *says* is not read here at
   * all any more: the model opens it when it answers.
   */
  /**
   * Put the chosen files up, one at a time.
   *
   * One at a time rather than all at once, so each thumbnail appears as it lands
   * and a failure on the fourth does not throw away the first three.
   */
  const upload = useCallback(async (picked: Picked[]) => {
    if (!picked.length) return;
    setReading(true);
    try {
      for (const one of picked) {
        const file = await attachFile(one.uri, one.name, one.type);
        // Checked again on the way in: the uploads took time, and the list could
        // have filled while they were in the air.
        setAttached((previous) => (previous.length >= ATTACH_MAX ? previous : [...previous, file]));
      }
    } catch (error) {
      // `AttachError` is already something the person can act on; anything else is
      // ours, and gets a plain line rather than its own words.
      dialog('Could not add that', error instanceof AttachError
        ? error.message : 'Something went wrong adding that file.');
    } finally {
      setReading(false);
    }
  }, []);

  const pick = useCallback(async (from: 'camera' | 'library' | 'file') => {
    const room = ATTACH_MAX - attached.length;
    if (room <= 0) return dialog('That is enough', `A message can carry ${ATTACH_MAX} files.`);
    let picked: Picked[] = [];
    try {
      if (from === 'file') {
        const picker = loadDocumentPicker();
        if (!picker) return dialog('Not available', 'Picking a file needs a newer build of the app.');
        const result = await picker.getDocumentAsync({ copyToCacheDirectory: true });
        const asset = result.canceled ? null : result.assets?.[0];
        if (!asset) return;
        picked = [{ uri: asset.uri, name: asset.name || 'file', type: asset.mimeType }];
      } else {
        const picker = loadImagePicker();
        if (!picker) return dialog('Not available', 'The camera needs a newer build of the app.');
        const granted = from === 'camera'
          ? await picker.requestCameraPermissionsAsync()
          : await picker.requestMediaLibraryPermissionsAsync();
        if (!granted.granted) {
          return dialog('No permission', 'MemQ needs permission for that. You can change it in Settings.');
        }
        // The library can give several at once, up to whatever room is left; the
        // camera gives one, because it took one.
        const result = from === 'camera'
          ? await picker.launchCameraAsync(PHOTO)
          : await picker.launchImageLibraryAsync({ ...PHOTO, allowsMultipleSelection: true, selectionLimit: room });
        const assets = result.canceled ? [] : result.assets ?? [];
        if (!assets.length) return;
        picked = assets.map((asset, at) => ({
          uri: asset.uri,
          name: asset.fileName || `photo-${at + 1}.jpg`,
          type: asset.mimeType ?? 'image/jpeg',
        }));
      }
    } catch {
      return dialog('Could not open that', 'Something went wrong opening the picker.');
    }

    await upload(picked.slice(0, room));
  }, [attached.length, upload]);

  /* Ask the last question again, in place of the answer it got.
   *
   * Reached two ways: from a turn that failed, and from the "ask again" mark under
   * a turn that did not (AnswerActions). Both drop the turn on screen before
   * re-asking, so the conversation does not keep an answer the person has already
   * replaced.
   *
   * It drops what came after it too. An answer from the middle of a conversation
   * is the one every turn below it was replying to, so replacing it and keeping
   * them would leave the rest of the page answering a question that is no longer
   * on it. Asking again is starting from there again.
   *
   * The server is told, so its record goes the same way: it drops that exchange
   * and what followed before answering (chatHistory.ts, `rewind`). Without that
   * the model read the question twice, and the answer the person had rejected. */
  /* A turn that was never asked for: no status, no error, done on arrival. It is
   * the app answering a tap, so there is nothing to wait for. */
  const say = useCallback<Say>((said, part, note) => {
    const id = nextId.current++;
    // Named here, so that what the interface goes on to do can be written to the
    // same row it was filed in.
    const row = rowId();
    const shown: ChatPart = part.kind === 'component' ? { ...part, id: row, local: true } : part;
    setTurns((previous) => [...previous, { ...startTurn(said, threadId.current), parts: [shown], done: true, id }]);

    const thread = threadId.current;
    const who = user.current;
    if (!kept || part.kind !== 'component' || !thread || !who) return;
    writes.current = writes.current.then(() => fileTurn(supabase, {
      id: row, threadId: thread, userId: who,
      kept: { component: part.name, props: part.props, said },
      note: note ?? `The person chose "${said}".`,
    }));
  }, [kept]);

  /* What became of an interface, on screen and in the record. On screen so that
   * the part itself carries it, whatever redraws; in the record so that it is
   * there the next time the conversation is opened. */
  const keepPart = useCallback((part: ComponentPart, said: string | undefined, state: unknown, note?: string) => {
    if (!part.id) return;
    const id = part.id;
    setTurns((previous) => previous.map((turn) => (
      turn.parts.some((one) => one.kind === 'component' && one.id === id)
        ? { ...turn, parts: turn.parts.map((one) => (one.kind === 'component' && one.id === id ? { ...one, state } : one)) }
        : turn
    )));
    const who = user.current;
    if (!kept || !who) return;
    writes.current = writes.current.then(() => refile(supabase, {
      id, userId: who, note,
      kept: { component: part.name, props: part.props, ...(said ? { said } : {}), state },
    }));
  }, [kept]);

  const retry = useCallback((id: number, question: string) => {
    setTurns((previous) => {
      const at = previous.findIndex((turn) => turn.id === id);
      return at < 0 ? previous : previous.slice(0, at);
    });
    void send(question, { retry: true });
  }, [send]);

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* The menu draws here rather than in a modal, which would take the keyboard
          down with it every time someone reached for the plus. */}
      <MenuLayer>
      <SayContext.Provider value={say}>
      {/* The list and what floats over it. The wrapper exists so the button
          below can be positioned against the bottom of the conversation rather
          than the bottom of the screen, which is where the box is. */}
      <View style={styles.list}>
        <ScrollView
          ref={scroller}
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardDismissMode="interactive"
          onContentSizeChange={() => {
            if (!showAnchor()) scroller.current?.scrollToEnd({ animated: !settling.current });
          }}
          /* Often enough to feel like it is watching, rarely enough not to run a
           * handler on every frame of a flick. */
          scrollEventThrottle={120}
          onScroll={(event) => {
            const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
            const left = contentSize.height - contentOffset.y - layoutMeasurement.height;
            setAdrift(left > NEAR_BOTTOM);
          }}
        >
          {opening && turns.length === 0 && !restoring && <Text style={styles.opening}>{opening}</Text>}
          {turns.map((turn, index) => (
            <View
              key={turn.id}
              style={styles.turn}
              onLayout={(event) => { turnTops.current[index] = event.nativeEvent.layout.y; }}
            >
              <View style={styles.asked}>
                <Text style={styles.askedText}>{turn.question}</Text>
                {askedWith.current[turn.id]?.length ? (
                  <View style={styles.askedFile}>
                    <Icon name="paperclip" size={12} color={colors.sub} />
                    <Text style={styles.askedFileText} numberOfLines={1}>
                      {askedWith.current[turn.id].length === 1
                        ? askedWith.current[turn.id][0].name
                        : `${askedWith.current[turn.id].length} files`}
                    </Text>
                  </View>
                ) : null}
              </View>
              {turn.parts.map((part, at) => (
                <Part
                  key={at}
                  part={part}
                  said={turn.question}
                  onKeep={keepPart}
                  renderComponent={renderComponent}
                  onComponentLayout={(y) => {
                    // One that came back with the conversation is drawn where it
                    // falls; the view opens at the end, not on whichever card
                    // happened to be laid out last.
                    if (turn.id <= restored.current) return;
                    // An interface is read from its top: it says where the cards are
                    // going, and that is the part someone has to see before deciding.
                    // Scrolling to the end of the conversation would push it off.
                    anchor.current = (turnTops.current[index] ?? 0) + y;
                    requestAnimationFrame(showAnchor);
                  }}
                />
              ))}
              {/* What you can do with an answer, once there is a whole one. Never
                  while it is still arriving: a copy button over half a sentence
                  copies half a sentence. */}
              {turn.done && !turn.error && (
                <AnswerActions
                  text={prose(turn)}
                  onRetry={() => retry(turn.id, turn.question)}
                  /* Sent, not written into the box. The suggestions above the box are
                   * a starting point someone is meant to edit, which is why tapping
                   * one fills the box; this is a button with one meaning, pressed on
                   * purpose, and the other three here act at once — one of four
                   * behaving differently would read as a bug. */
                  /* Says what was pressed as well as the words. The words are for
                   * the conversation; the intent is so that the turn drafts cards
                   * rather than deciding whether cards were meant. */
                  onMakeCards={mode === 'create' ? () => void send('Make cards from this', { intent: 'draft' }) : undefined}
                />
              )}
              {turn.status && <Waiting label={WAITING[turn.status] ?? 'Working…'} />}
              {/* Nothing from the server yet, so this line keeps itself honest
                  about how long that has been going on. */}
              {!turn.status && !turn.done && turn.parts.length === 0 && <Waiting label="Thinking…" patient />}
              {turn.error && (
                <View style={styles.failed}>
                  <Text style={styles.failedText}>{turn.error.message}</Text>
                  {/* Nothing to retry for a refusal the person has to resolve first. */}
                  {turn.error.code !== 'quota' && turn.error.code !== 'daily_budget' && (
                    <Pressable accessibilityRole="button" onPress={() => retry(turn.id, turn.question)} hitSlop={8}>
                      <Text style={styles.retry}>Try again</Text>
                    </Pressable>
                  )}
                  {/* Out of the month's credits: the one refusal Pro answers, so
                      the way to it is here, where they were stopped. */}
                  {turn.error.code === 'quota' && !isPro && (
                    <Pressable accessibilityRole="button" onPress={() => void showPaywall()} hitSlop={8}>
                      <Text style={styles.retry}>See Pro</Text>
                    </Pressable>
                  )}
                </View>
              )}
            </View>
          ))}
        </ScrollView>
        {/* Back to the end of the answer.
         *
         * A long answer is read from the top, and the way back down is a flick
         * that has to be repeated until it stops. One tap instead, floating on
         * the last lines of the conversation.
         *
         * Only while there is somewhere to go. A button that is always there and
         * does nothing most of the time teaches people to ignore it. */}
        {adrift && (
          <View style={styles.downHolder} pointerEvents="box-none">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go to the end of the answer"
              onPress={() => scroller.current?.scrollToEnd({ animated: true })}
              hitSlop={10}
              style={({ pressed }) => [styles.down, pressed && styles.downPressed]}
            >
              <Icon name="arrowDown" size={20} color={colors.sub} />
            </Pressable>
          </View>
        )}
      </View>

      {/* A way in, and nothing more.
       *
       * They used to stay for the whole conversation, carrying what the model
       * offered as a next move under every answer. That is now the row of marks
       * under the answer itself, where "this" is unambiguous — and two sets of
       * suggestions on one screen, one of them a stack of full sentences right
       * above the box, was more to read than the answer. So they are what an
       * empty conversation opens with, and they go the moment it is not empty. */}
      {/* A conversation that came back is not empty, and opening it from a card is
          still arriving with something to ask about. So with somewhere to ask
          about, they stay until the first thing is asked on this visit. */}
      {!sending && !restoring && !!starters?.length && (turns.length === 0 || (!!context && !asked)) && (
        <Starters
          starters={starters}
          onPick={(text) => {
            setDraft(text);
            /* Focused as well as filled, so the next thing a hand does is change
             * a word or press send — not hunt for the box it just wrote into.
             *
             * On the next frame, not this one: asking for focus in the same tick
             * as the text puts it in front of the re-render that follows, and the
             * box comes back without it. */
            requestAnimationFrame(() => input.current?.focus());
          }}
        />
      )}
      {/* What is left of the month's AI credits, once there is little enough
          for it to matter. Silent before that: a count over every message is a
          meter running, and this is a conversation. */}
      <CreditsLine credits={credits} onUpgrade={() => void showPaywall()} style={styles.credits} />
      <View style={styles.bar}>
        {/* One box holding everything: what is riding on this message sits above
            what is being typed, and the row of buttons sits on the bottom edge, so
            the box grows upward and they stay put. */}
        <View style={styles.box}>
          {(attached.length > 0 || reading) && (
            <ScrollView
              ref={tray}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              style={styles.tray}
              contentContainerStyle={styles.trayRow}
              // A photo that lands off the right edge is one the person cannot see
              // they just added, so the row follows what it is given.
              onContentSizeChange={() => tray.current?.scrollToEnd({ animated: true })}
            >
              {attached.map((file, at) => (
                <Attachment key={file.url} file={file}
                  onRemove={() => setAttached((previous) => previous.filter((_, i) => i !== at))} />
              ))}
              {reading && (
                <View style={[styles.thumb, styles.thumbWaiting]}>
                  <ActivityIndicator size="small" color={colors.sub} />
                </View>
              )}
            </ScrollView>
          )}
          <View style={styles.row}>
          <AnchoredMenu
            label="Add a photo or a file"
            actions={ADD}
            onSelect={(from) => (from === 'library' ? setPicking(true) : void pick(from))}
            disabled={sending || reading}
            trigger={(
              <View style={[styles.add, (sending || reading) && styles.addOff]}>
                <Icon name="plus" size={28} color={colors.sub} />
              </View>
            )}
          />
          <TextInput
            ref={input}
            value={draft}
            onChangeText={setDraft}
            placeholder={placeholder ?? 'Say what you want to learn'}
            placeholderTextColor={colors.placeholder}
            multiline
            editable={!sending}
            style={styles.input}
          />
          <IconButton variant="primary" size="sm" label="Send"
            disabled={!draft.trim() || sending} loading={sending}
            onPress={() => void send(draft)}>
            {/* Up, not along: this sends what is in the box above it, and an
                arrow that points at the edge of the screen says the message goes
                somewhere else. */}
            <Icon name="arrowUp" size={20} color={colors.surf} />
          </IconButton>
          </View>
        </View>
      </View>
      </SayContext.Provider>
      </MenuLayer>

      {/* The app's own grid, with the system picker behind it as the way out when
          the library cannot be read. */}
      <PhotoSheet
        visible={picking}
        max={ATTACH_MAX - attached.length}
        onClose={() => setPicking(false)}
        onPick={(photos: PickedPhoto[]) => { setPicking(false); void upload(photos); }}
        onFallback={() => { setPicking(false); void pick('library'); }}
      />
    </KeyboardAvoidingView>
  );
}

/**
 * One thing riding on the next message.
 *
 * A photo shows itself, because that is how someone tells two photos apart; a
 * document cannot, so it gets its mark and as much of its name as fits. The
 * remove button sits on the corner with a generous hit area around it — the tile
 * is small, and a miss that sends the file instead of dropping it is the worse
 * mistake of the two.
 */
function kindOf(name: string): string {
  const dot = name.lastIndexOf('.');
  const extension = dot > 0 ? name.slice(dot + 1) : '';
  return (extension || 'file').toUpperCase().slice(0, 4);
}

function Attachment({ file, onRemove }: { file: Attached; onRemove: () => void }) {
  return (
    <View style={styles.thumb}>
      {file.kind === 'image' ? (
        <Image source={{ uri: file.preview }} style={styles.thumbImage} accessibilityLabel={file.name} />
      ) : (
        <View style={styles.thumbFile}>
          <Icon name="paperclip" size={24} color={colors.sub} />
          {/* The kind, not the name: at this size a name shows about six
              characters, which tells nobody which file this is. The whole name is
              on the button for a screen reader, and under the question once it
              has been sent. */}
          <Text style={styles.thumbKind}>{kindOf(file.name)}</Text>
        </View>
      )}
      <Pressable onPress={onRemove} hitSlop={10} accessibilityRole="button"
        accessibilityLabel={`Remove ${file.name}`} style={styles.thumbRemove}>
        <Icon name="close" size={14} color={colors.surf} />
      </Pressable>
    </View>
  );
}

type PartProps = {
  part: ChatPart;
  /** What was asked in the turn this part belongs to. */
  said: string;
  onKeep: (part: ComponentPart, said: string | undefined, state: unknown, note?: string) => void;
  renderComponent?: ChatShellProps['renderComponent'];
  onComponentLayout?: (y: number) => void;
};

function Part(props: PartProps) {
  if (props.part.kind === 'text') {
    return <Text style={styles.said}>{props.part.text}</Text>;
  }
  return <Drawn {...props} part={props.part} />;
}

function Drawn({ part, said, onKeep, renderComponent, onComponentLayout }: PartProps & { part: ComponentPart }) {
  /* The same object until this part changes, so a component that reads what was
   * kept is not redrawn every time a token lands somewhere else on the page. */
  const keeper = useMemo<Keeper>(() => ({
    state: part.state,
    // For a turn the app added, the tap is part of what is kept: it is the
    // question that turn is drawn under when the conversation comes back.
    keep: (state, note) => onKeep(part, part.local ? said : undefined, state, note),
  }), [onKeep, part, said]);
  const drawn = renderComponent?.({ name: part.name, props: part.props });
  if (drawn) {
    return (
      <KeptContext.Provider value={keeper}>
        <View style={styles.component} onLayout={(event) => onComponentLayout?.(event.nativeEvent.layout.y)}>
          {drawn}
        </View>
      </KeptContext.Provider>
    );
  }
  // An interface this build cannot draw — a newer server, or a screen that was not
  // given a renderer. Say so instead of leaving a gap.
  return <Text style={styles.unknown}>This needs a newer version of the app to show.</Text>;
}

/** Something honest on screen while the model has not spoken. The line breathes so
 *  it reads as working rather than stuck; it says what is happening, never a
 *  percentage it cannot know. */
function Waiting({ label, patient = false }: { label: string; patient?: boolean }) {
  const pulse = useRef(new Animated.Value(0.45)).current;
  const [waited, setWaited] = useState(0);
  useEffect(() => {
    if (!patient) return;
    const started = Date.now();
    const tick = setInterval(() => setWaited(Date.now() - started), 1000);
    return () => clearInterval(tick);
  }, [patient]);
  const said = PATIENCE.find((step) => waited >= step.after)?.label ?? label;
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
      <Animated.Text style={[styles.waitingText, { opacity: pulse }]}>{said}</Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  /* The pair breathes, and so does the page.
   *
   * A question and its answer used to sit 8 apart and two turns 24 apart: close
   * enough that a long answer ran into the next question, and the page read as one
   * column of text with no joints in it. Now 16 inside a turn and 32 between them.
   * Both grew, and the inner gap stays the smaller of the two — that difference is
   * the whole grouping: what belongs together is nearer than what comes next. */
  content: { padding: space[4], gap: space[8], paddingBottom: space[8] },
  opening: { ...type.body, fontFamily: fonts.regular, color: colors.sub },
  turn: { gap: space[4] },
  asked: {
    alignSelf: 'flex-end',
    maxWidth: '85%',
    backgroundColor: colors.limeSurface,
    paddingHorizontal: space[4],
    paddingVertical: space[2],
    borderRadius: radius.lg,
  },
  askedText: { ...type.body, fontFamily: fonts.medium, color: colors.text },
  askedFile: { flexDirection: 'row', alignItems: 'center', gap: space[1], marginTop: space[1] },
  askedFileText: { ...type.caption, fontFamily: fonts.regular, color: colors.sub, flexShrink: 1 },
  said: { ...type.body, fontFamily: fonts.regular, color: colors.text },
  component: { marginVertical: space[2] },
  unknown: { ...type.caption, fontFamily: fonts.regular, color: colors.faint },
  waiting: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  waitingText: { ...type.caption, fontFamily: fonts.regular, color: colors.sub },
  credits: { paddingHorizontal: space[4], paddingTop: space[1] },
  failed: { gap: space[2] },
  failedText: { ...type.caption, fontFamily: fonts.regular, color: colors.red },
  retry: { ...type.caption, fontFamily: fonts.semibold, color: colors.action },
  /* Over the conversation, not in the column.
   *
   * As a row of its own it was a band: full width, its own background, the box
   * pushed down a notch — a strip that appeared and disappeared as the page
   * moved. Taken out of the flow it is what it should have been, one mark
   * hovering over the last lines of the answer, and nothing else moves when it
   * comes and goes.
   *
   * `box-none` on the holder so only the disc itself catches a touch; the words
   * under it stay scrollable. */
  list: { flex: 1 },
  downHolder: {
    position: 'absolute',
    left: 0, right: 0,
    // Clear of the box below it, which is where the thumb already is.
    bottom: space[3],
    alignItems: 'center',
  },
  /* A disc, because it sits on top of text. A bare glyph over prose is two things
   * in the same place and neither reads; the surface gives it an edge to end at,
   * and the ring keeps it from looking like a hole in the page. */
  down: {
    width: 36, height: 36, borderRadius: radius.pill,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surf,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line,
  },
  downPressed: { opacity: 0.7 },
  bar: {
    padding: space[4],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    backgroundColor: colors.surf,
  },
  /* One row that scrolls sideways rather than a block that wraps.
   *
   * Wrapping showed everything at once, which sounded better and was worse: nine
   * photos at this size became three rows and most of a phone, and with the
   * keyboard up there was nothing left to type into. A row that is always one row
   * high keeps the conversation and the keyboard where they were, and the row
   * follows each new photo so nothing is added out of sight. */
  tray: { marginBottom: space[2] },
  trayRow: {
    flexDirection: 'row', gap: space[2],
    // Room for the remove buttons, which sit half off the top-right corner of
    // each tile and would be clipped at the ends of a scrolling row.
    paddingTop: space[2], paddingHorizontal: space[2],
  },
  /* Big enough to tell two photos of the same page apart, which is the whole job
   * a thumbnail has here, and big enough that the picture is worth looking at
   * rather than just counted. Four fit across a phone, so nine still land in
   * three rows; on a narrower one they wrap to three a row and take four. */
  thumb: { width: 88, height: 88, borderRadius: radius.md, backgroundColor: colors.surf },
  thumbWaiting: { alignItems: 'center', justifyContent: 'center' },
  thumbImage: { width: '100%', height: '100%', borderRadius: radius.md },
  thumbFile: {
    width: '100%', height: '100%', borderRadius: radius.md,
    alignItems: 'center', justifyContent: 'center', gap: space[0], padding: space[1],
  },
  thumbKind: { ...type.caption, color: colors.sub },
  /* Half off the corner, so it reads as attached to the tile rather than drawn on
   * top of the picture it is about to remove. */
  thumbRemove: {
    position: 'absolute', top: -7, right: -7,
    width: 24, height: 24, borderRadius: radius.pill,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.text, borderWidth: 2, borderColor: colors.panel,
  },
  /* The same 36 as the send button opposite it, so the two ends of the box match
   * and a single line of text sits level with both. The glyph inside is larger
   * than the send arrow on purpose: it has no disc behind it, so only the mark
   * itself carries the weight, and at the arrow's size it read as an afterthought.
   * At 28 in a 36 box it is nearly the whole square, which is the point.
   *
   * It is not an IconButton because the thing that opens the menu has to be the
   * thing the menu measures, and that is the menu's own pressable. */
  add: {
    width: 36, height: 36, borderRadius: radius.pill,
    alignItems: 'center', justifyContent: 'center',
  },
  addOff: { opacity: 0.4 },
  box: {
    paddingHorizontal: space[2],
    paddingVertical: space[2],
    borderRadius: radius.lg,
    backgroundColor: colors.panel,
  },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: space[2] },
  /* A multiline input already grows with what is in it, so it is given a floor and
   * a ceiling and left alone. Measuring the content and feeding the height back as
   * state is the obvious-looking version and it is a loop: the new height changes
   * the content size, which sets the height again.
   *
   * The padding is what centres a single line. A multiline field lays its text out
   * from the top whatever the box does, so `alignItems` cannot do it: the line is
   * placed by giving it equal room above and below, and the row stays bottom-aligned
   * so growth pushes the top up and leaves the buttons where they are. */
  input: {
    flex: 1,
    ...type.body,
    fontFamily: fonts.regular,
    color: colors.text,
    minHeight: INPUT_MIN,
    maxHeight: INPUT_MAX,
    paddingTop: INPUT_PAD,
    paddingBottom: INPUT_PAD,
    paddingHorizontal: space[1],
  },
});
