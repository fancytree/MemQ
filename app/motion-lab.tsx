import { oneLine } from '@/theme/typography';
import { EdBase } from '@/components/EdBase';
import { MascotRig } from '@/components/mascot/rig/MascotRig';
import { MascotState } from '@/components/mascot/MascotState';
import { MASCOT_STATE_KINDS, MASCOT_STATES } from '@/components/mascot/states';
import {
  ALL_MASCOT_MOODS, CH, CHANNEL_COUNT, MASCOT_GROUPS, RIG_PARTS, RIG_VIEW,
  type Channel, type MascotMood, type PartControl, type RigPart,
} from '@/components/mascot/rig/rig';
import { SecondaryPageNav } from '@/components/SecondaryPageNav';
import { StreakPill } from '@/components/ui/StreakPill';
import { safeBack } from '@/lib/safeBack';
import { space, colors, componentTokens, fonts, layout, radius, type } from '@/theme';
import { Redirect, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSharedValue, withSpring } from 'react-native-reanimated';

/** The side of a state's picture on the lab's states page. */
const STATE_ART = 184;

/** Where the mascot is taken apart.
 *
 * The character on this screen is the rig in components/mascot/rig, the same one
 * every screen draws. The screen is here to answer two questions about it by
 * looking: can each part be moved on its own, and do the others feel it when one
 * does.
 */
const USED_BY: Partial<Record<MascotMood, string>> = {
  idle: 'Today · cards are due and the goal is not met',
  thinking: 'Today · the first lesson fetch has not returned',
  happy: 'Today · the daily goal is met',
  sleepy: 'Today · courses exist but nothing is due',
  onboarding: 'First run · the account has no courses yet',
  learningComplete: 'End of a session · the set is finished',
  studyReview: 'A review session in progress',
  streakReward: 'A streak milestone was reached',
};

/** What is attached to what. This is the rig's own account of itself, in the order
 * a movement travels through it. */
const LINKS: { part: string; follows: string }[] = [
  { part: 'Tail', follows: 'Three bones hung off the body. Each trails the one before it, so a hop travels down it.' },
  { part: 'Horns', follows: 'Blown back by the head’s movement, splayed when the body flattens.' },
  { part: 'Hands', follows: 'Carried on the outline, a beat late, tipping with their own speed.' },
  { part: 'Face', follows: 'Slips against the body when it jumps. Follows the eyes when they look.' },
  { part: 'Body', follows: 'Leans after a look, and is rocked a little by its own tail.' },
  { part: 'Marks', follows: 'Hang beside the body and keep a fraction of its travel.' },
];

const STAGE_WIDTH = 200;
/** How far the body can be pulled, in artwork units, before the stage clips it. */
const DRAG_LIMIT = 56;
/** The stage is wider than the character's square, and the character is dragged
 * about in it, so it is drawn well past its square: enough to reach the stage's edge. */
const STAGE_BLEED = 0.4;
const DRAG_RETURN = { damping: 11, stiffness: 150, mass: 1 } as const;
const NO_TWEAK: number[] = new Array(CHANNEL_COUNT).fill(0);

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}
function signed(n: number, unit = '') {
  const digits = Math.abs(n) < 2 && n % 1 !== 0 ? 2 : Math.abs(n) < 10 && n % 1 !== 0 ? 1 : 0;
  const text = n.toFixed(digits);
  return `${n > 0 ? '+' : ''}${text === '-0' ? '0' : text}${unit}`;
}

/** One channel, as a track to drag along. The value is an offset from the pose the
 * mood is holding, so the middle of nowhere is "as the mood has it". */
function Slider({ control, value, onChange, onHold }: {
  control: PartControl; value: number; onChange: (value: number) => void;
  /** Told when a finger takes the track and when it lets go. */
  onHold: (held: boolean) => void;
}) {
  const { min, max, label, unit } = control;
  const [width, setWidth] = useState(0);
  // The responder is made once, so what it needs is read through a ref.
  const live = useRef({ width, min, max, onChange, onHold });
  live.current = { width, min, max, onChange, onHold };
  const responder = useMemo(() => {
    let from = 0;
    const set = (x: number) => {
      const c = live.current;
      if (c.width <= 0) return;
      const raw = c.min + clamp(x / c.width, 0, 1) * (c.max - c.min);
      // Snap to nothing near the mood's own value, so it is easy to put back.
      c.onChange(Math.abs(raw) < (c.max - c.min) * 0.02 ? 0 : raw);
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // The page scrolls; a drag that began on a track belongs to the track.
      onPanResponderTerminationRequest: () => false,
      // Where the finger came down is read once, against the track. After that the
      // position is that plus how far the finger has travelled: a move event's own
      // location is measured against whatever it is over by then, which stops being
      // the track as soon as the thumb is redrawn under it.
      onPanResponderGrant: (e) => {
        live.current.onHold(true);
        from = e.nativeEvent.locationX;
        set(from);
      },
      onPanResponderMove: (_e, g) => set(from + g.dx),
      onPanResponderRelease: () => live.current.onHold(false),
      onPanResponderTerminate: () => live.current.onHold(false),
    });
  }, []);

  const span = max - min;
  const at = (clamp(value, min, max) - min) / span;
  const zero = clamp(-min / span, 0, 1);
  const nudge = span / 20;
  return (
    <View style={styles.slider}>
      <View style={styles.sliderHead}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowValue}>{value === 0 ? 'as posed' : signed(value, unit)}</Text>
      </View>
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ text: value === 0 ? 'as posed' : signed(value, unit) }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => {
          const step = e.nativeEvent.actionName === 'increment' ? nudge : -nudge;
          onChange(clamp(value + step, min, max));
        }}
        // The whole track takes the touch, so its position is measured against the
        // track and not against whichever piece of it was under the finger.
        pointerEvents="box-only"
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        style={styles.track}
        {...responder.panHandlers}
      >
        <View style={styles.trackLine} />
        <View style={[styles.trackFill, {
          left: `${Math.min(at, zero) * 100}%`, width: `${Math.abs(at - zero) * 100}%`,
        }]} />
        <View style={[styles.trackZero, { left: `${zero * 100}%` }]} />
        <View style={[styles.thumb, { left: `${at * 100}%` }]} />
      </View>
    </View>
  );
}

function Chip({ label, active, marked, onPress }: {
  label: string; active: boolean; onPress: () => void;
  /** This part has been moved off the pose by hand. */
  marked?: boolean;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: active }}
      accessibilityLabel={marked ? `${label}, moved by hand` : label} onPress={onPress}
      style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && styles.chipPressed]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
      {marked && <View style={[styles.chipMark, active && styles.chipMarkActive]} />}
    </Pressable>
  );
}

function Action({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled}
      style={({ pressed }) => [styles.action, disabled && styles.actionDisabled, pressed && styles.actionPressed]}>
      <Text style={[styles.actionText, disabled && styles.actionTextDisabled]}>{label}</Text>
    </Pressable>
  );
}

/** A design review tool, for development builds only. Its entry in Settings is
 * already hidden in a release — but a route is an address, and `memq://motion-lab`
 * would still open it. In a release the address leads home instead. */
export default function MotionLabRoute() {
  return __DEV__ ? <MotionLabScreen /> : <Redirect href="/" />;
}

function MotionLabScreen() {
  // `?mood=` makes any state reachable by deep link, which is how this screen gets
  // checked. It has to be an effect, not a `useState` initialiser — navigating to
  // the same route with a different parameter reuses the mounted screen, so an
  // initialiser runs once and every later link silently does nothing.
  const params = useLocalSearchParams<{ mood?: string; part?: string; at?: string }>();
  const [mood, setMood] = useState<MascotMood>('idle');
  useEffect(() => {
    const found = ALL_MASCOT_MOODS.find((m) => m === params.mood);
    if (found) setMood(found);
  }, [params.mood]);

  // The lab has two pages. The rig, with the character pinned over its controls;
  // and the states, which are finished pictures to be looked at, not taken apart,
  // and would only be half seen from under a pinned stage. `?at=states` opens the
  // second, from a link or on a screen that is already open.
  const [page, setPage] = useState<'rig' | 'states'>('rig');
  useEffect(() => {
    if (params.at === 'states') setPage('states');
    else if (params.at === 'rig') setPage('rig');
  }, [params.at]);
  const [linked, setLinked] = useState(true);
  const [bones, setBones] = useState(false);
  const [part, setPart] = useState<RigPart>('tail');
  useEffect(() => {
    const found = RIG_PARTS.find((p) => p.part === params.part);
    if (found) setPart(found.part);
  }, [params.part]);

  const [blinkSignal, setBlinkSignal] = useState(0);
  const [beatSignal, setBeatSignal] = useState(0);
  const [winkSignal, setWinkSignal] = useState(0);
  const [poke, setPoke] = useState<{ seq: number; part: RigPart }>({ seq: 0, part: 'tail' });
  // The streak pill, with a number that can be pushed up by hand: on Today it only
  // moves once a day.
  const [streak, setStreak] = useState(3);

  // The sliders. The numbers live twice: in state so the screen can show them, and in
  // a shared value so the character reads them on the frame they change. The ref
  // is the one both are written from, so neither is ever derived from the other
  // inside a render.
  const [tweak, setTweak] = useState<number[]>(NO_TWEAK);
  const tweakLive = useSharedValue<number[]>(NO_TWEAK);
  const tweakNow = useRef<number[]>(NO_TWEAK);
  const commit = (next: number[]) => {
    tweakNow.current = next;
    tweakLive.value = next;
    setTweak(next);
  };
  const setChannel = (channel: Channel, value: number) => {
    const next = tweakNow.current.slice();
    next[CH[channel]] = value;
    commit(next);
  };
  const reset = (channels: Channel[] | null) => {
    const next = channels ? tweakNow.current.slice() : NO_TWEAK.slice();
    if (channels) for (const c of channels) next[CH[c]] = 0;
    commit(next);
  };
  // Which parts are off the pose. A slider left where it was is invisible once its
  // part is no longer the one selected, and then what it did to the character looks
  // like the character's own pose — so the parts say so, and so does the stage.
  const moved = RIG_PARTS.filter((p) => p.controls.some((c) => tweak[CH[c.channel]] !== 0));
  const selected = RIG_PARTS.find((p) => p.part === part) ?? RIG_PARTS[0];
  const partTouched = selected.controls.some((c) => tweak[CH[c.channel]] !== 0);

  // A track or the character under a finger must not also scroll the page. The
  // scroll view is native and takes a vertical drag before any responder here is
  // asked about it, so it is switched off for as long as something is held.
  const [held, setHeld] = useState(false);

  // Dragging the character. The body goes where the finger is; nothing else is
  // told, and what the rest does about it is the thing being shown.
  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  const drag = useMemo(() => {
    const unit = RIG_VIEW / STAGE_WIDTH;
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => setHeld(true),
      onPanResponderMove: (_e, g) => {
        dragX.value = clamp(g.dx * unit, -DRAG_LIMIT, DRAG_LIMIT);
        dragY.value = clamp(g.dy * unit, -DRAG_LIMIT, DRAG_LIMIT);
      },
      onPanResponderRelease: () => {
        setHeld(false);
        dragX.value = withSpring(0, DRAG_RETURN);
        dragY.value = withSpring(0, DRAG_RETURN);
      },
      onPanResponderTerminate: () => {
        setHeld(false);
        dragX.value = withSpring(0, DRAG_RETURN);
        dragY.value = withSpring(0, DRAG_RETURN);
      },
    });
  }, [dragX, dragY]);

  return (
    <EdBase scroll={false} bottomInset={0}>
      {/* Swiping back is off here. The stack takes a sideways drag anywhere on the
          screen as the start of one, and a sideways drag is what a slider and the
          character both need; left on, moving the tail to the right left the lab. */}
      <Stack.Screen options={{ gestureEnabled: false }} />
      <SecondaryPageNav onBack={() => safeBack('/profile/settings')} />
      {/* The stage is the third child and sticks, so the character stays in view
          while the controls for it scroll underneath. */}
      <ScrollView showsVerticalScrollIndicator={false} scrollEnabled={!held}
        stickyHeaderIndices={page === 'rig' ? [2] : []} contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>Motion lab</Text>
        <View>
          <Text style={styles.lede}>
            {page === 'rig'
              ? 'The character as a rig: every part on its own controls, and linked, so that what one part does the others feel.'
              : 'What a screen shows when there is nothing to show, or when something failed: the character, and one thing that says which.'}
          </Text>
          <View style={[styles.chips, styles.pages]}>
            <Chip label="Rig" active={page === 'rig'} onPress={() => setPage('rig')} />
            <Chip label="States" active={page === 'states'} onPress={() => setPage('states')} />
          </View>
        </View>

        {page === 'states' ? (
          <View style={styles.states}>
            {MASCOT_STATE_KINDS.map((kind) => (
              <View key={kind} style={styles.state}>
                <MascotState kind={kind} width={STATE_ART} />
                <Text style={styles.stateTitle}>{MASCOT_STATES[kind].title}</Text>
                <Text style={styles.stateCopy}>{MASCOT_STATES[kind].copy}</Text>
                <Text style={styles.stateKind}>{kind} · {MASCOT_STATES[kind].mood}</Text>
              </View>
            ))}
          </View>
        ) : (
        <View style={styles.pinned}>
          <View style={styles.stage} {...drag.panHandlers}>
            <MascotRig width={STAGE_WIDTH} mood={mood} linked={linked} debug={bones} bleed={STAGE_BLEED}
              tweak={tweakLive} dragX={dragX} dragY={dragY}
              blinkSignal={blinkSignal} winkSignal={winkSignal} beatSignal={beatSignal} poke={poke} />
          </View>
          <View style={styles.status}>
            <Text style={[styles.hint, moved.length > 0 && styles.hintMoved]} numberOfLines={1}>
              {moved.length > 0
                ? `Moved by hand: ${moved.map((p) => p.label).join(', ')}`
                : 'Drag the character. Only the body is being moved.'}
            </Text>
            {moved.length > 0 && (
              <Pressable accessibilityRole="button" accessibilityLabel="Put every part back"
                hitSlop={10} onPress={() => reset(null)} style={styles.putBack}>
                <Text style={styles.putBackText}>Put back</Text>
              </Pressable>
            )}
          </View>
        </View>
        )}

        {page === 'rig' && <>
        <View style={[styles.chips, styles.toggles]}>
          <Chip label="Linked" active={linked} onPress={() => setLinked((v) => !v)} />
          <Chip label="Skeleton" active={bones} onPress={() => setBones((v) => !v)} />
        </View>

        {MASCOT_GROUPS.map((group) => (
          <View key={group.label}>
            <Text style={styles.groupLabel}>{group.label.toUpperCase()}</Text>
            <View style={styles.chips}>
              {group.moods.map((item) => (
                <Chip key={item} label={item} active={item === mood} onPress={() => setMood(item)} />
              ))}
            </View>
          </View>
        ))}
        {USED_BY[mood] && <Text style={styles.when}>{USED_BY[mood]}</Text>}

        <Text style={styles.groupLabel}>PARTS</Text>
        <View style={styles.chips}>
          {RIG_PARTS.map((p) => (
            <Chip key={p.part} label={p.label} active={p.part === part} marked={moved.includes(p)}
              onPress={() => setPart(p.part)} />
          ))}
        </View>
        <View style={styles.panel}>
          {selected.controls.map((control) => (
            <Slider key={control.channel} control={control} value={tweak[CH[control.channel]]}
              onChange={(value) => setChannel(control.channel, value)} onHold={setHeld} />
          ))}
          <View style={styles.actions}>
            <Action label={`Knock ${selected.label.toLowerCase()}`}
              onPress={() => setPoke((p) => ({ seq: p.seq + 1, part }))} />
            <Action label="Put back" disabled={!partTouched}
              onPress={() => reset(selected.controls.map((c) => c.channel))} />
          </View>
        </View>

        <Text style={styles.groupLabel}>WHAT FOLLOWS WHAT</Text>
        <View style={styles.readout}>
          {LINKS.map((link) => (
            <View key={link.part} style={styles.row}>
              <Text style={styles.rowLabel}>{link.part}</Text>
              <Text style={styles.rowValue}>{link.follows}</Text>
            </View>
          ))}
        </View>

        <View style={styles.actions}>
          <Action label="Blink" onPress={() => setBlinkSignal((n) => n + 1)} />
          <Action label="Wink" onPress={() => setWinkSignal((n) => n + 1)} />
          <Action label="Beat" onPress={() => setBeatSignal((n) => n + 1)} />
        </View>

        <Text style={styles.groupLabel}>STREAK</Text>
        <View style={styles.streakRow}>
          <StreakPill value={streak} />
          <Action label="Add a day" onPress={() => setStreak((n) => n + 1)} />
          <Action label="Add a week" onPress={() => setStreak((n) => n + 7)} />
        </View>

        </>}

        <Text style={styles.footnote}>
          With the system reduce-motion setting on, every part holds its rest pose. The
          sliders still move it; nothing else does.
        </Text>
      </ScrollView>
    </EdBase>
  );
}

const THUMB = 22;
const styles = StyleSheet.create({
  content: { paddingHorizontal: space[6], paddingBottom: space[10] },
  title: { ...oneLine(type.page), color: colors.text, marginTop: space[1] },
  lede: { ...type.small, color: colors.sub, marginTop: space[2] },
  // The page's own colour behind the stage, so what scrolls under it is hidden.
  pinned: { paddingTop: space[4], paddingBottom: space[1], backgroundColor: colors.bg },
  status: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 34, marginTop: space[1] },
  stage: {
    height: 232,
    borderRadius: radius.lg,
    backgroundColor: colors.panel,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  hint: { ...type.caption, color: colors.sub, flex: 1 },
  hintMoved: { color: colors.text },
  putBack: { minHeight: 34, justifyContent: 'center' },
  putBackText: { ...type.caption, color: colors.sub, textDecorationLine: 'underline' },
  groupLabel: { ...type.caption, color: colors.sub, marginTop: space[5], marginBottom: space[2], letterSpacing: 0.6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  toggles: { marginTop: space[2] },
  chip: {
    minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: space[1], paddingHorizontal: space[3],
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bg,
  },
  chipActive: { backgroundColor: colors.action, borderColor: colors.action },
  chipPressed: { backgroundColor: colors.panel },
  chipText: { ...type.caption, color: colors.sub },
  chipTextActive: { color: colors.onAction },
  chipMark: { width: 6, height: 6, borderRadius: radius.pill, backgroundColor: colors.action },
  chipMarkActive: { backgroundColor: colors.onAction },
  when: { ...type.caption, color: colors.sub, marginTop: space[3] },
  panel: {
    marginTop: space[3], paddingHorizontal: space[4], paddingTop: space[1], paddingBottom: space[4],
    borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surf,
  },
  slider: { paddingTop: space[2] },
  sliderHead: { flexDirection: 'row', justifyContent: 'space-between', gap: space[4] },
  track: { height: 44, justifyContent: 'center', marginHorizontal: THUMB / 2 },
  trackLine: { height: 4, borderRadius: radius.pill, backgroundColor: colors.line },
  trackFill: { position: 'absolute', height: 4, borderRadius: radius.pill, backgroundColor: colors.action },
  trackZero: {
    position: 'absolute', width: 2, height: 12, marginLeft: -1,
    borderRadius: radius.pill, backgroundColor: colors.faint,
  },
  thumb: {
    position: 'absolute', width: THUMB, height: THUMB, marginLeft: -THUMB / 2,
    borderRadius: radius.pill, backgroundColor: colors.action,
    borderWidth: 3, borderColor: colors.surf,
  },
  readout: { borderTopWidth: 1, borderTopColor: colors.line },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', gap: space[4],
    paddingVertical: space[3], borderBottomWidth: 1, borderBottomColor: colors.line,
  },
  rowLabel: { ...type.caption, color: colors.sub },
  rowValue: { ...type.caption, color: colors.text, flexShrink: 1, textAlign: 'right' },
  actions: { flexDirection: 'row', gap: space[2], marginTop: space[4] },
  streakRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  action: {
    flex: 1, minHeight: 48, borderRadius: radius.pill, paddingHorizontal: space[3],
    backgroundColor: colors.panel, alignItems: 'center', justifyContent: 'center',
  },
  actionPressed: { backgroundColor: colors.panel },
  actionDisabled: { backgroundColor: colors.panel },
  actionText: { ...type.caption, color: colors.text },
  actionTextDisabled: { color: colors.disabled },
  pages: { marginTop: space[3], marginBottom: space[3] },
  states: { gap: space[3] },
  state: {
    alignItems: 'center', paddingTop: space[5], paddingBottom: space[5], paddingHorizontal: space[5],
    borderRadius: radius.lg, backgroundColor: colors.surf,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line,
  },
  stateTitle: { ...type.body, fontFamily: fonts.semibold, color: colors.text, textAlign: 'center', marginTop: space[4] },
  stateCopy: { ...type.small, color: colors.sub, textAlign: 'center', marginTop: space[1] },
  stateKind: { ...type.caption, color: colors.sub, marginTop: space[2] },
  footnote: { ...type.caption, color: colors.sub, marginTop: space[5] },
});
