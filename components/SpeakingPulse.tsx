/**
 * What a speaking button does while it speaks.
 *
 * Two rings leave the button, one behind the other, and the icon breathes with
 * them, so a word being said looks different from one waiting to be. Both stop
 * where the person has asked the system for less motion: the button then simply
 * holds a steady ring for as long as it speaks.
 */

import { Icon } from '@/components/ui/Icon';
import { dismissSoundHint, onSoundHint, watchVolumeWhileHinting } from '@/lib/speech';
import { colors, radius, space } from '@/theme';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { ICON_ART } from '@/components/iconArt';
import Svg, { Path } from 'react-native-svg';

/** Whether animation is wanted at all. Asked once; the setting rarely changes
 *  mid-session and a listener per button is not worth it. */
export function useMotionAllowed() {
  const [allowed, setAllowed] = useState(true);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduced) => { if (live) setAllowed(!reduced); })
      .catch(() => {});
    return () => { live = false; };
  }, []);
  return allowed;
}

/** Roughly where the volume keys are.
 *
 *  They are on the upper left edge of every iPhone this app runs on, a little
 *  over a third of the way down to the middle of the screen. Measured from the
 *  top rather than from the safe area: the keys are on the hardware, and they
 *  do not move when a notch does.
 *
 *  Roughly is all it can be. The keys sit at different heights on different
 *  models, and a screen coordinate cannot be made to land on one. So the sign
 *  stands in the neighbourhood of the keys and leaves it at that — which is why
 *  it has no point on its left edge any more. A point says *this* one, and a
 *  point aimed between two keys is worse than no point at all. */
const VOLUME_KEY_TOP = 165;

/** The sign that asks for the volume, standing beside the key that gives it.
 *
 *  It used to be a line inside the card, naming two things — the volume and the
 *  silent switch — to everybody on their first word, because neither could be
 *  checked. The switch no longer silences speech (lib/speech plays through it)
 *  and the volume is read, so what is left is one thing, shown to the person it
 *  is true for, against the key that fixes it.
 *
 *  It is upright and wordless: a column the shape and size of the key pair it
 *  stands beside, with the muted speaker at the bottom — where you are — and a line
 *  standing out of it, with a light running the length of it. A
 *  sentence would have to be read, and read in the app's language; something
 *  travelling up beside the key you have to push up does not.
 *
 *  There was an arrow at the top of the line. It was the one part that had to be
 *  recognised rather than simply seen moving, and the line was already saying
 *  the same thing more quietly, so it went.
 *
 *  It leaves the moment the volume moves. That is the whole point of standing it
 *  there: the instruction and the result are in the same place, so nothing has
 *  to be dismissed to make it go away. A tap puts it away as well, for the
 *  phone that is quiet on purpose.
 */
export function SoundHint({ onDismiss, style }: { onDismiss: () => void; style?: StyleProp<ViewStyle> }) {
  const animate = useMotionAllowed();
  const rise = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!animate) { rise.setValue(0); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(rise, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.delay(240),
      Animated.timing(rise, { toValue: 0, duration: 0, useNativeDriver: true }),
    ]));
    loop.start();
    return () => { loop.stop(); rise.setValue(0); };
  }, [animate, rise]);

  // A light runs up the line, out of the speaker and into the arrow, and fades
  // at both ends so that it reads as travelling rather than as appearing and
  // being switched off. It starts below the line and finishes above it; the
  // line clips it, so only the stretch between the two is ever drawn.
  const travel = {
    transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [STEM, -SPARK] }) }],
    opacity: rise.interpolate({ inputRange: [0, 0.15, 0.85, 1], outputRange: [0, 1, 1, 0] }),
  };

  return (
    <View pointerEvents="box-none" style={[styles.hintLayer, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Turn the volume up"
        accessibilityLiveRegion="assertive"
        onPress={onDismiss}
        hitSlop={8}
        style={styles.hint}
      >
        <View style={styles.hintStem}>
          <View style={[styles.hintTrack, !animate && styles.hintTrackStill]} />
          {animate && <Animated.View style={[styles.hintSpark, travel]} />}
        </View>
        <Icon name="volumeOff" size={SPEAKER} color={colors.action} />
      </Pressable>
    </View>
  );
}

/** How wide the speaker is, and with it the column: about the width of the
 *  volume keys themselves, near enough that the sign reads as part of them. */
const SPEAKER = 16;
/** The line standing out of the speaker — the distance being asked for — and
 *  the length of light that travels it. */
const STEM = 38;
const SPARK = 14;

/** Mounted once, beside the dialogs, because the note belongs to the screen's
 *  edge and not to whichever card asked for a word. */
export function SoundHintHost() {
  const [showing, setShowing] = useState(false);
  useEffect(() => onSoundHint(setShowing), []);
  useEffect(() => (showing ? watchVolumeWhileHinting() : undefined), [showing]);
  if (!showing) return null;
  return <SoundHint onDismiss={dismissSoundHint} />;
}

const styles = StyleSheet.create({
  // Over everything, touching nothing it does not cover.
  hintLayer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'flex-start', zIndex: 20 },
  hint: {
    position: 'absolute', top: VOLUME_KEY_TOP, left: space[3],
    alignItems: 'center', gap: space[1],
    paddingHorizontal: space[2], paddingVertical: space[3],
    borderRadius: radius.pill, backgroundColor: colors.tint,
  },
  // The line, and the light that runs up it. The track is a sibling rather than
  // the parent it looks like: dimming a parent would dim the light inside it.
  hintStem: { width: 3, height: STEM, overflow: 'hidden' },
  hintTrack: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: radius.pill, backgroundColor: colors.action, opacity: 0.2,
  },
  // Nothing runs up it where motion is unwanted, so the line itself has to be
  // the mark: it is drawn plainly instead of as the ghost of a moving one.
  hintTrackStill: { opacity: 0.45 },
  hintSpark: {
    position: 'absolute', top: 0, left: 0, width: 3, height: SPARK,
    borderRadius: radius.pill, backgroundColor: colors.action,
  },
  // The bars stand on one line, middles aligned, so a tall one grows both ways.
  voice: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
});

/** A voice, while it is speaking: a band of bars keeping time with it.
 *
 * For the one place big enough to hold it — the question's play button, where
 * the whole screen is one instruction. A speaker icon says "press this to hear
 * it", which is what it has to say when nothing is playing. Once something IS
 * playing, the question has moved on: the only thing worth showing is that a
 * voice is coming out, and a row of bars moving says that at a glance.
 *
 * It took the place of the round play button, and then took its job as well:
 * pressing the sound to hear it again is how every player people already use
 * works, and it leaves one thing on the screen instead of two. Inside a
 * 76-point disc there was room for five bars a few points wide, which is a
 * detail; given the width of the card it is the screen, which is right, because
 * hearing the word IS the question.
 *
 * Each bar keeps its own time. They are deliberately not a tidy wave travelling
 * left to right: that reads as a loading bar. Different heights, each on its own
 * delay, read as a voice — uneven, which is what a voice is.
 *
 * Where motion is unwanted they stand at those different heights without moving:
 * still a voice print, just not a moving one.
 */
export function SpeakingWave({ width, height, color, active }: {
  width: number;
  height: number;
  color: string;
  /** Speaking now. At rest the bars stand still at their own heights, which is
   *  the same voice print not currently saying anything. */
  active: boolean;
}) {
  const moving = useMotionAllowed() && active;
  // Five rhythms, five hooks, written out: a hook cannot be called in a loop.
  // The bars share them around — seventeen separate loops would be seventeen
  // timers for something the eye reads as "uneven".
  const beats = [
    useBeat(moving, 0, 260),
    useBeat(moving, 110, 220),
    useBeat(moving, 40, 300),
    useBeat(moving, 160, 240),
    useBeat(moving, 80, 280),
  ];

  const bar = width / (BARS.length * 2 - 1);
  return (
    <View style={[styles.voice, { width, height, gap: bar }]}>
      {BARS.map((shape, index) => (
        <Animated.View key={index} style={{
          width: bar, height, borderRadius: radius.pill, backgroundColor: color,
          transform: [{
            scaleY: moving
              ? beats[shape.beat].interpolate({ inputRange: [0, 1], outputRange: [shape.low, shape.high] })
              : shape.high,
          }],
        }} />
      ))}
    </View>
  );
}

/** A value that runs 0 → 1 → 0 for ever, on its own delay and its own pace. */
function useBeat(active: boolean, delay: number, beat: number) {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) { value.setValue(0); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.delay(delay),
      Animated.timing(value, { toValue: 1, duration: beat, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(value, { toValue: 0, duration: beat, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => { loop.stop(); value.setValue(0); };
  }, [active, delay, beat, value]);
  return value;
}

/** How tall each bar stands, and which of the five rhythms it keeps.
 *
 *  The heights were an arch — a clean half-sine, tallest in the middle. Standing
 *  still, which is how this is seen most of the time, that reads as an ornament:
 *  a symmetrical lozenge, obviously drawn by an equation. A voice is not
 *  symmetrical. These are set by hand, loud and quiet by turns, tapering at both
 *  ends so the band finishes rather than being cut off — the silhouette of
 *  somebody saying a word, which is what the screen is about.
 *
 *  The rhythms are dealt out in no order either: a repeating run of five across
 *  twenty-one bars would march.
 */
const BARS = [
  [0.16, 2], [0.30, 0], [0.52, 3], [0.38, 1], [0.74, 4], [0.60, 0], [0.90, 2],
  [0.46, 4], [0.68, 1], [1.00, 3], [0.56, 0], [0.82, 4], [0.34, 2], [0.70, 1],
  [0.88, 3], [0.44, 0], [0.62, 2], [0.28, 4], [0.48, 1], [0.22, 3], [0.14, 0],
].map(([high, beat]) => ({ high, beat, low: high * 0.28 }));

/** The speaker, drawn in parts so the sound can come out of it.
 *
 * The small speaking buttons — a card's pronunciation button, the "Listen" row
 * under a term. The cone is the set's own `volumeOn`, taken at load: it is the
 * half that never moves, so it is the half that has to match every other
 * speaker in the app exactly.
 *
 * Before this there were three different speakers in the app for one job: the
 * card rows used an SVG asset with its own hardcoded ink, the Listen row used
 * the filled set glyph, and the question's play button used a hand-drawn
 * outline. And the motion was the whole icon breathing — scaling a glyph grows
 * and shrinks all of it, which reads as the BUTTON pulsing rather than as
 * something being said. Here the cone is still and the waves do the speaking.
 */
export function SpeakingGlyph({ size, color, active }: {
  size: number;
  color: string;
  /** Speaking now. At rest the icon is drawn whole and still. */
  active: boolean;
}) {
  const animate = useMotionAllowed();
  const wave = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active || !animate) { wave.setValue(0); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(wave, { toValue: 1, duration: 1000, easing: Easing.linear, useNativeDriver: true }),
      Animated.timing(wave, { toValue: 0, duration: 0, useNativeDriver: true }),
    ]));
    loop.start();
    return () => { loop.stop(); wave.setValue(0); };
  }, [active, animate, wave]);

  // Everything is measured against the glyph's own box, so the motion is the
  // same gesture at sixteen points as at thirty.
  const unit = size / VOLUME_BOX;
  const still = !active || !animate;

  /** One wave's turn: it arrives out of the cone, holds, and is gone.
   *
   *  All the way to nothing, not down to a dimmer version of itself. At sixteen
   *  points a wave is a stroke about a point and a half wide, and dimming
   *  something that small is a change nobody sees — it was there, lighter. Taken
   *  away and put back, it is unmistakable, and what is left in between is the
   *  cone on its own, which is the shape of a speaker not currently saying
   *  anything. The small outward shift is what makes it a wave leaving rather
   *  than a light switching: it is a point and a half of travel, more felt than
   *  seen, and it is why these two arcs are drawn here. */
  const turn = (index: number) => {
    if (still) return {};
    const start = index * 0.2;
    return {
      opacity: wave.interpolate({
        inputRange: [0, start, start + 0.1, start + 0.38, start + 0.5, 1],
        outputRange: [0, 0, 1, 1, 0, 0],
      }),
      transform: [{
        translateX: wave.interpolate({
          inputRange: [0, start, start + 0.5, 1],
          outputRange: [-TRAVEL * unit, -TRAVEL * unit, TRAVEL * unit, TRAVEL * unit],
        }),
      }],
    };
  };

  const layer = { position: 'absolute' as const, top: 0, left: 0 };
  const sheet = (child: ReactNode) => (
    <Svg width={size} height={size} viewBox={`0 0 ${VOLUME_BOX} ${VOLUME_BOX}`}>{child}</Svg>
  );
  const arc = (d: string) => sheet(
    <Path d={d} fill="none" stroke={color} strokeWidth={WAVE_WEIGHT} strokeLinecap="round" />,
  );

  return (
    <View style={{ width: size, height: size }}>
      <View style={layer}>{sheet(<Path d={CONE} fill={color} />)}</View>
      <Animated.View style={[layer, turn(0)]}>{arc(WAVE_INNER)}</Animated.View>
      <Animated.View style={[layer, turn(1)]}>{arc(WAVE_OUTER)}</Animated.View>
    </View>
  );
}

/** The cone: the set's own `volumeOn`, first path, read off the glyph rather
 *  than copied out of it. A second copy of a path that long would be wrong
 *  within a release, and the whole point is that the speaker standing still is
 *  the set's icon, to the point. */
const VOLUME_BOX = ICON_ART.volumeOn.box;
export const VOLUME_PARTS = [...ICON_ART.volumeOn.body.matchAll(/d="([^"]+)"/g)].map((match) => match[1]);
const [CONE] = VOLUME_PARTS;

/** The two waves, drawn here instead of taken from the glyph.
 *
 *  Solar draws them as filled wedges, which can only be faded — and a fade is
 *  what was not showing. As arcs they are two circles about the mouth of the
 *  cone, so each one can be moved along its own radius, given a round end that
 *  survives being shrunk to sixteen points, and set to a weight that holds up
 *  against the filled cone beside it. They are placed and weighted to sit where
 *  Solar's wedges sat, so a speaker at rest still looks like the set's icon.
 */
const WAVE_INNER = 'M16.4 9A4.1 4.1 0 0 1 16.4 15';
const WAVE_OUTER = 'M19.4 6.4A7.6 7.6 0 0 1 19.4 17.6';
const WAVE_WEIGHT = 2.1;
/** How far a wave travels, each way, in glyph units. */
const TRAVEL = 0.8;
