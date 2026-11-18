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
import { useKept, useSay } from '@/components/chat/ChatShell';
import { Icon } from '@/components/ui/Icon';
import { initialSelection, readCardDrafts, type DraftCard } from '@/lib/chatDrafts';
import { colors, fonts, radius, space, type } from '@/theme';
import { useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

/**
 * Where a card lies, by how far back in the deck it is.
 *
 * 0 is the front: square, white, full size. The rest are stepped back, and each
 * one is set by hand rather than multiplied out of a single step — a deck that
 * has been through someone's hands is never square, so one card is further left,
 * the next is turned the other way, and none of them is quite straight. Fixed and
 * not random: a stack that reshuffles itself on every render is not a stack of
 * cards, it is a glitch, and these have to stay put while the front one is being
 * dragged about.
 *
 * Mostly upward, because downward is where the count and the arrows are.
 *
 * Each one is also a step darker than the slot in front of it — white, `panel`,
 * then `line`. Further away is less lit, and that is the whole of the distance
 * here: this app's depth is a painted lip and never a shadow, and the same rule
 * that makes a lip the face's own colour with the light taken out makes the card
 * behind the front one a shade down from it. One family; a second hue back there
 * would read as a different kind of card rather than the same card further away.
 *
 * The last slot is off-stage. Nothing rests there: it is where the card arriving
 * at the back of the deck comes from, so it fades in from somewhere rather than
 * appearing out of nothing.
 */
const SLOTS = [
  { rise: 0, slip: 0, tilt: 0, shrink: 0, face: colors.surf },
  { rise: 9, slip: -7, tilt: -4.5, shrink: 0.03, face: colors.panel },
  { rise: 17, slip: 6, tilt: 3, shrink: 0.06, face: colors.line },
  { rise: 24, slip: -2, tilt: -6.5, shrink: 0.09, face: colors.line },
] as const;

/** How far the front card has to be pulled for the deck behind it to have come
 *  all the way forward. Wider than the throw, so most of the promotion happens
 *  while the card is flying off rather than while it is still in the hand. */
const PULL = 240;
/** How many cards are drawn: the front one, the two lying under it, and the one
 *  waiting off-stage to take the back place. */
const FACES = SLOTS.length;
/**
 * The shape of a card: upright, and the same shape whatever is written on it.
 *
 * A box as tall as its own words is a row with a border round it. A card is a
 * card because of its proportions — portrait, taller than it is wide, the shape
 * of the thing in a hand — so the frame is given the shape and the words are
 * fitted into it, rather than the other way round. It also means the stack does
 * not change height as it is dealt through, and that the two under it can simply
 * be told to fill the same box.
 */
const CARD_WIDTH = 0.72;
const CARD_RATIO = 0.72;

/**
 * How tall the board is, in both views.
 *
 * The deck's height falls out of the card's: the card is a share of the width and
 * a fixed shape, so the room it needs is arithmetic rather than something to be
 * measured after the fact. Working it out here rather than leaving it to
 * `aspectRatio` means the list can be told the same number — the two views are
 * the same object seen two ways, and a switch between them that changes the height
 * of the page moves everything under it, including the button being aimed at.
 *
 * A list longer than the board scrolls inside it. That is the point of giving it
 * a height at all: ten cards as ten rows used to make this block as long as the
 * conversation it was sitting in.
 */
const BOARD_PAD = space[3];
/** The pager under the deck: the chevrons' own height, plus the gap above them. */
const PAGER = 20 + space[3];

function boardHeight(room: number): number {
  const inner = room - BOARD_PAD * 2;
  const lift = Math.max(...SLOTS.map((slot) => slot.rise)) + space[2];
  return lift + (inner * CARD_WIDTH) / CARD_RATIO + BOARD_PAD;
}
/** How far a drag has to go before it is a deal rather than a tap. */
const GRAB = 8;
/** How far it has to end up before the card leaves rather than springs back. */
const THROW = 90;
/** Far enough off that the card is gone before it is put back under the stack. */
const AWAY = 520;

export function CardDrafts({ raw }: { raw: unknown }) {
  const drafts = useMemo(() => readCardDrafts(raw), [raw]);
  const say = useSay();
  /* What this card did the last time it was on screen. A conversation comes back
   * when the screen is reopened, and drafts that were already handed over must
   * come back handed over — ticked as they were, with the button spent — or they
   * would offer to be kept again, and be saved twice. */
  const [before, keep] = useKept<{ handed?: boolean; picked?: unknown }>();
  const [picked, setPicked] = useState<string[]>(() => {
    if (!drafts) return [];
    const known = new Set(drafts.cards.map((card) => card.id));
    return before?.handed && Array.isArray(before.picked)
      ? before.picked.filter((id): id is string => typeof id === 'string' && known.has(id))
      : initialSelection(drafts);
  });
  /** Handed over once: the cards are answered, and where they go is the next
   *  thing said rather than another part of this card. */
  const [sent, setSent] = useState(() => before?.handed === true);
  /** How wide this block is. Both views are sized from it, so neither is measured
   *  against the other and switching cannot change the height of the page. */
  const [room, setRoom] = useState(0);
  /* Ten cards is a page of list and a page of scrolling. The deck shows one at a
   * time, the size a card actually is, which is how they will be met later — and
   * the list shows all of them at once, which is how you decide what to drop.
   * Neither is the right one for both jobs, so it is a switch. */
  const [deck, setDeck] = useState(false);
  /** Which card the deck is showing. Kept here so flipping views and coming back
   *  does not start again from the top. */
  const [at, setAt] = useState(0);

  // Not a draft this build can draw. The shell says so rather than leaving a gap.
  if (!drafts) return null;

  const toggle = (id: string) =>
    setPicked((current) => (current.includes(id) ? current.filter((at) => at !== id) : [...current, id]));
  const allPicked = picked.length === drafts.cards.length;

  /* The tap is what the person said, and the answer to it is the next turn.
   * Nothing is written here: this card drafts and ticks, and the turn it hands
   * over to is the one that saves. */
  const hand = () => {
    if (sent) return;
    setSent(true);
    keep({ handed: true, picked });
    const chosen = drafts.cards.filter((card) => picked.includes(card.id));
    say(chosen.length === 1 ? 'Keep 1 card' : `Keep ${chosen.length} cards`, {
      kind: 'component',
      name: 'show_lesson_target',
      props: { cards: chosen, target: drafts.target },
    },
    // For the record, and so the model knows which of its drafts were wanted.
    // Not yet saved: that is the next card's to say.
    `The person chose to keep ${chosen.length} of the drafted cards: ${chosen.map((card) => card.term).join('; ').slice(0, 400)}. The app is asking which lesson they go in; nothing is saved yet.`);
  };

  return (
    <>
    <Card pad="md" gap={space[3]}>
      {/* The cards, and nothing in front of them.
       *
       * This used to open with where they were going — a lesson name and a line
       * about why, above cards nobody had looked at yet. It answered the second
       * question first. What was drafted is what there is to decide about; where
       * it lands is a question for after "yes, keep these". */}
      <View style={styles.head}>
        <Text style={styles.drafted}>
          {drafts.cards.length === 1 ? '1 card drafted' : `${drafts.cards.length} cards drafted`}
        </Text>
        {/* Up here with the count, not under the cards. It acts on all of them at
            once, which is a thing to do to the set rather than a step after
            reading them — and under the deck it sat between the cards and the
            button that keeps them, in the one place a decision is being made. */}
        <Pressable
          accessibilityRole="button"
          onPress={() => setPicked(allPicked ? [] : drafts.cards.map((card) => card.id))}
          hitSlop={10}
        >
          <Text style={styles.all}>{allPicked ? 'Clear all' : 'Select all'}</Text>
        </Pressable>
        {/* The mark of the view you are going to, not the one you are in: this is
            a door, and a door shows where it leads. One card is enough to make
            the switch pointless, so it only appears when there is a stack. */}
        {drafts.cards.length > 1 && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={deck ? 'Show them as a list' : 'Show them as a deck'}
            onPress={() => setDeck((on) => !on)}
            hitSlop={10}
            style={({ pressed }) => [styles.switch, pressed && styles.switchPressed]}
          >
            <Icon name={deck ? 'list' : 'layers'} size={18} color={colors.sub} />
          </Pressable>
        )}
      </View>

      {/* Measured once, used by both views: the deck's height comes out of this
          width, and the list is then given the same height to scroll inside. */}
      <View onLayout={(event) => setRoom(event.nativeEvent.layout.width)}>
        {!room ? null : deck ? (
          <Deck
            room={room}
            cards={drafts.cards}
            at={Math.min(at, drafts.cards.length - 1)}
            picked={picked}
            onToggle={toggle}
            onGo={setAt}
          />
        ) : (
          <ScrollView
            style={{ height: boardHeight(room) + PAGER }}
            contentContainerStyle={styles.rows}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
          >
            {drafts.cards.map((card) => (
              <Row key={card.id} card={card} picked={picked.includes(card.id)} onToggle={() => toggle(card.id)} />
            ))}
          </ScrollView>
        )}
      </View>

      <Button
        label={picked.length === 1 ? 'Keep 1 card' : `Keep ${picked.length} cards`}
        size="sm"
        width="full"
        disabled={!picked.length || sent}
        onPress={hand}
      />
    </Card>

    </>
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

/**
 * The same cards, as a deck you deal through.
 *
 * A list answers "what is in here"; a deck answers "what is this one". Ten rows of
 * two lines is a wall you skim and tick, which is right when you are dropping the
 * ones you do not want — but the thing being made is a card, and a card is read one
 * at a time, at the size of a card. So the front one is drawn at that size, tall
 * enough to be a card rather than a row, with two more showing as edges behind it.
 *
 * It goes round. Swiping the front card throws it off to the side and it comes back
 * at the bottom of the pile, which is what a deck does in a hand — there is no end
 * to walk off, and the two behind it are always the next two, wrapping at the last
 * one. That is also why the stack never shrinks as you go: in a loop there is always
 * something under the card you are holding.
 *
 * Two fakes behind, not nine. Past the second the edges stop reading as depth and
 * start reading as stripes, and "3 of 10" under it says how many there really are.
 *
 * Tapping keeps or drops, exactly as tapping a row does — the gesture does not
 * change with the view, only the layout does. The pan only takes over once a drag
 * is clearly sideways, so a tap on the card is still a tap; a deck where the same
 * touch sometimes turns the card and sometimes unticks it is a deck you stop
 * trusting.
 *
 * `PanResponder` and React Native's own Animated rather than the gesture library:
 * nothing in this app has driven a gesture by hand before, and this needs one view
 * to follow a finger and then fly away. That does not earn a root-level provider
 * and a second animation runtime in a component this size.
 */
function Deck({ room, cards, at, picked, onToggle, onGo }: {
  /** The width this deck has to lie in. */
  room: number;
  cards: DraftCard[];
  at: number;
  picked: string[];
  onToggle: (id: string) => void;
  onGo: (at: number) => void;
}) {
  const count = cards.length;
  /** Where the front card is, relative to the stack. Driven by the finger, then
   *  by whichever animation finishes the gesture. */
  const slide = useRef(new Animated.Value(0)).current;
  /* The responder is made once and reads the rest through a ref, because a new
   * responder mid-gesture loses the gesture. */
  const dealt = useRef<() => void>(() => {});
  dealt.current = () => onGo((at + 1) % count);

  /** Back where it came from, with the spring that says it was never going
   *  anywhere. Also the way out of every gesture that does not finish. */
  const settle = useRef(() => {
    Animated.spring(slide, { toValue: 0, useNativeDriver: false, bounciness: 6 }).start();
  }).current;

  const pan = useRef(
    PanResponder.create({
      // Only once it is clearly a sideways drag. Below this a touch is still a
      // tap, and the card is a button.
      onMoveShouldSetPanResponder: (_event, gesture) =>
        Math.abs(gesture.dx) > GRAB && Math.abs(gesture.dx) > Math.abs(gesture.dy),
      /* Once the card is being dragged it keeps the gesture.
       *
       * This deck lives inside the conversation, which scrolls, and the default
       * answer here is yes — so the moment a sideways drag picked up any vertical
       * drift at all, the scroll view asked for the touch and got it. The release
       * handler then never ran and the card was left mid-flight, tilted and half
       * off the stack, with nothing to put it back. */
      onPanResponderTerminationRequest: () => false,
      // A new drag starts from wherever the card is, not from the middle of an
      // animation that is still running.
      onPanResponderGrant: () => slide.stopAnimation(),
      onPanResponderMove: (_event, gesture) => slide.setValue(gesture.dx),
      // Taken anyway — a call, a system gesture. The card goes back rather than
      // staying where the finger left it.
      onPanResponderTerminate: () => settle(),
      onPanResponderRelease: (_event, gesture) => {
        const thrown = Math.abs(gesture.dx) > THROW || Math.abs(gesture.vx) > 0.4;
        if (!thrown) return settle();
        Animated.timing(slide, {
          toValue: Math.sign(gesture.dx || 1) * AWAY,
          duration: 180,
          useNativeDriver: false,
        }).start(({ finished }) => {
          // Only on a flight that actually landed. An animation cut short by the
          // next drag would otherwise deal a card nobody threw.
          if (!finished) return;
          // Put it back under the stack before the next card is shown, so the
          // card arriving at the front never flies in from the edge.
          slide.setValue(0);
          dealt.current();
        });
      },
    }),
  ).current;

  /* The front card and the two under it, wrapping. Drawn back to front, so the one
   * being held is last and sits on top of the others. */
  const shown = Array.from({ length: Math.min(count, FACES) }, (_, depth) => depth).reverse();

  /* How far through being dealt the deck is, straight off the front card's own
   * position: pulled to one side is the stack coming forward, let go is the stack
   * settling back. One value, so there is nothing to keep in step — the cards
   * behind cannot be mid-promotion while the card in front has sprung home.
   *
   * Keyed by depth rather than by card, so the views stay put as the deck turns
   * and only their contents change. A card is at a place in the stack here, and
   * the place is the thing that is being animated. */
  const deal = slide.interpolate({
    inputRange: [-PULL, 0, PULL],
    outputRange: [1, 0, 1],
    extrapolate: 'clamp',
  });

  return (
    <View style={styles.deck}>
      {/* The room the fan needs above the card, so the ones behind are not clipped
          and nothing else on the page moves when the deck is dealt. */}
      <View style={[styles.stack, { height: boardHeight(room) }]}>
        {/* This is the card's shape, and all three of them fill it. Nothing here
            is sized by its own text, so a long phrase changes how the words sit
            and never how the deck is built. */}
        <View style={[styles.frame, {
          width: (room - BOARD_PAD * 2) * CARD_WIDTH,
          height: ((room - BOARD_PAD * 2) * CARD_WIDTH) / CARD_RATIO,
        }]}>
        {shown.map((depth) => {
          const card = cards[(at + depth) % count];
          const kept = picked.includes(card.id);
          const front = depth === 0;
          const number = at + 1;
          const face = (
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: kept }}
              accessibilityLabel={`${card.term}: ${card.definition}`}
              disabled={!front}
              onPress={() => onToggle(card.id)}
              style={({ pressed }) => [styles.face, !kept && styles.faceOff, pressed && styles.rowPressed]}
            >
              {/* Three bands, not one block.
                  Everything used to stand on the bottom edge, which left the top
                  two thirds of the card empty and the words crushed into the
                  corner. A card has a head, a middle and a foot: what you do with
                  it at the top, the thing itself in the middle, and what it means
                  underneath. The middle takes the room that is left, so the term
                  sits in the body of the card however long the other two are. */}
              <View style={styles.headRow}>
                <View style={[styles.box, kept && styles.boxOn]}>
                  {kept && <Icon name="check" size={13} color={colors.text} />}
                </View>
                {/* Which one of them this is, in the corner where a card carries
                    its number. The row under the deck says it too, in words; this
                    says it on the card, where the eye already is. */}
                <Text style={styles.index}>{String(number).padStart(2, '0')}</Text>
              </View>

              <View style={styles.middle}>
                {/* `type.page` — the token whose own description is "the term on
                    a card being studied". This is that card, a few seconds early. */}
                <Text numberOfLines={3} style={[styles.deckTerm, !kept && styles.dimmed]}>{card.term}</Text>
              </View>

              {/* Capped, because the shape is fixed: anything this clips is on the
                  card itself once it is kept, and what is here is enough to
                  decide by. */}
              <View style={styles.saying}>
                <Text numberOfLines={2} style={[styles.deckDefinition, !kept && styles.dimmed]}>{card.definition}</Text>
                {detail(card) && (
                  <Text numberOfLines={2} style={[styles.detail, !kept && styles.dimmed]}>{detail(card)}</Text>
                )}
              </View>
            </Pressable>
          );

          if (!front) {
            /* Under the front one, and only ever seen as a corner and an edge:
               no text, nothing to press. It fills the same frame as the card in
               front and is then lifted, turned and shrunk out from behind it, so
               the fan does not depend on how long any card's words are.

               It also moves up one place as the front card is pulled away: every
               property reads from its own slot towards the slot in front of it,
               driven by `deal`. Taking the front card off a deck is the rest of
               the deck coming forward — it used to simply be somewhere else on
               the next frame, which is a cut, not a deal.

               The deepest one comes from the slot that is off-stage and fades in,
               so the card joining the back of the deck arrives from somewhere. */
            const from = SLOTS[depth];
            const to = SLOTS[depth - 1];
            const between = (a: number, b: number) =>
              deal.interpolate({ inputRange: [0, 1], outputRange: [a, b] });
            return (
              <Animated.View
                key={depth}
                pointerEvents="none"
                style={[styles.under, {
                  backgroundColor: deal.interpolate({
                    inputRange: [0, 1], outputRange: [from.face, to.face],
                  }),
                  opacity: depth === FACES - 1 ? deal : 1,
                  transform: [
                    { translateY: between(-from.rise, -to.rise) },
                    { translateX: between(from.slip, to.slip) },
                    { rotate: deal.interpolate({
                      inputRange: [0, 1], outputRange: [`${from.tilt}deg`, `${to.tilt}deg`],
                    }) },
                    { scale: between(1 - from.shrink, 1 - to.shrink) },
                  ],
                }]}
              />
            );
          }
          return (
            <Animated.View
              key={depth}
              {...pan.panHandlers}
              style={{
                ...fill,
                transform: [
                  { translateX: slide },
                  // A few degrees of tilt as it goes: a card leaving a hand turns.
                  { rotate: slide.interpolate({
                    inputRange: [-AWAY, 0, AWAY],
                    outputRange: ['-8deg', '0deg', '8deg'],
                  }) },
                ],
              }}
            >
              {face}
            </Animated.View>
          );
        })}
        </View>
      </View>

      {/* Under the stack, clear of its edges. The count is the point of the row —
          the arrows are just how you move, and in a loop neither of them ever runs
          out, so neither ever goes quiet. */}
      <View style={styles.pager}>
        <Pressable accessibilityRole="button" accessibilityLabel="Previous card"
          hitSlop={10} onPress={() => onGo((at - 1 + count) % count)}
          style={({ pressed }) => [pressed && styles.rowPressed]}>
          <Icon name="chevronLeft" size={20} color={colors.sub} />
        </Pressable>
        <Text style={styles.count}>{at + 1} of {count}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Next card"
          hitSlop={10} onPress={() => onGo((at + 1) % count)}
          style={({ pressed }) => [pressed && styles.rowPressed]}>
          <Icon name="chevronRight" size={20} color={colors.sub} />
        </Pressable>
      </View>
    </View>
  );
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
      {/* Centred on the line it ticks, not hung off the top of the block.
          Aligned to the top of the row it sat above the term's first line by the
          leading — the box started where the line box starts and the letters
          start a few points lower than that. A box the height of one line, with
          the tick centred in it, lands on the term however many lines follow. */}
      <View style={styles.boxLine}>
        <View style={[styles.box, picked && styles.boxOn]}>
          {picked && <Icon name="check" size={13} color={colors.text} />}
        </View>
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

/** The card box, for the three views that have to be exactly it. */
const fill = { position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0 };

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  drafted: { ...type.caption, fontFamily: fonts.regular, color: colors.sub, flex: 1 },
  choiceList: { flexShrink: 1 },
  choices: { gap: space[1], paddingBottom: space[2] },
  /* The destination, between the cards and the button that commits them: the last
   * thing read before the decision, which is what it is. */
  going: { gap: space[2] },
  goingRow: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  goingText: { flex: 1 },
  goingLabel: { ...type.caption, fontFamily: fonts.regular, color: colors.sub },
  goingName: { ...type.body, fontFamily: fonts.semibold, color: colors.text },
  choice: {
    flexDirection: 'row', alignItems: 'center', gap: space[3],
    paddingVertical: space[3], paddingHorizontal: space[3],
    borderRadius: radius.lg,
    backgroundColor: colors.panel,
  },
  choiceOff: { opacity: 0.5 },
  choiceText: { flex: 1, gap: space[0] },
  choiceNote: { ...type.caption, fontFamily: fonts.medium, color: colors.faint },
  choiceName: { ...type.body, fontFamily: fonts.semibold, color: colors.text },
  waiting: { paddingVertical: space[4] },
  switch: {
    width: 32, height: 32, borderRadius: radius.pill,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  switchPressed: { opacity: 0.6 },
  deck: { gap: space[3] },
  /* A tray for the deck to lie on.
   *
   * White cards on a white card were two surfaces of the same colour with a
   * hairline between them: the shape was there and the object was not. The tray
   * is the ground the whole ramp is measured from, so it is the page's own
   * colour rather than `panel` — `panel` is now the card lying directly under
   * the front one, and a tray in the same tone would swallow it.
   *
   * The top padding is the room the stack needs to lean into. */
  stack: {
    paddingTop: Math.max(...SLOTS.map((slot) => slot.rise)) + space[2],
    paddingBottom: BOARD_PAD,
    paddingHorizontal: BOARD_PAD,
    alignItems: 'center',
    borderRadius: radius.lg,
    backgroundColor: colors.bg,
  },
  frame: { position: 'relative' },
  face: {
    flex: 1,
    padding: space[4],
    gap: space[3],
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line,
    backgroundColor: colors.surf,
  },
  /* One of the cards under the front one: the same frame, lifted and turned out
   * from behind it. Absolute, so dealing never changes the height of anything. */
  under: {
    ...fill,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line,
  },
  faceOff: { backgroundColor: colors.bg },
  /* The head holds the two things that are about the card rather than on it. */
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  index: { ...type.page, fontFamily: fonts.display, color: colors.line },
  /* Takes whatever the other two bands leave, so the term sits in the body of
   * the card and not wherever the text above it happens to end. */
  middle: { flex: 1, justifyContent: 'center' },
  saying: { gap: space[1] },
  deckTerm: { ...type.page, fontFamily: fonts.display, color: colors.text },
  deckDefinition: { ...type.body, fontFamily: fonts.regular, color: colors.sub },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space[4] },
  count: { ...type.caption, fontFamily: fonts.medium, color: colors.faint },
  rows: { gap: space[1] },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space[3], paddingVertical: space[2] },
  rowPressed: { opacity: 0.6 },
  box: {
    width: 22, height: 22, borderRadius: radius.sm,
    borderWidth: 1.5, borderColor: colors.line,
    alignItems: 'center', justifyContent: 'center',
  },
  boxOn: { backgroundColor: colors.limeSurface, borderColor: colors.action },
  boxLine: { height: type.body.lineHeight, justifyContent: 'center' },
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
