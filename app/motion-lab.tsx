import { EdBase } from '@/components/EdBase';
import {
  ALL_MASCOT_MOODS, MASCOT_GROUPS, MASCOT_STATES, MascotCharacter, type MascotMood,
} from '@/components/mascot/MascotCharacter';
import { SecondaryPageNav } from '@/components/SecondaryPageNav';
import { safeBack } from '@/lib/safeBack';
import { colors, componentTokens, layout, radius, type } from '@/theme';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

/** Preview screen for the mascot. Every number shown is read back from the state
 * table, so this page cannot drift out of step with the real behaviour.
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

const PREVIEW_WIDTH = 190;

function secs([min, max]: readonly [number, number]) {
  return min === max ? `${(min / 1000).toFixed(1)}s` : `${(min / 1000).toFixed(1)}–${(max / 1000).toFixed(1)}s`;
}
function signed(n: number, unit = '') {
  return `${n > 0 ? '+' : ''}${n}${unit}`;
}
/** Translations are fractions of the square canvas; showing them as a percentage of
 * the character's own box is the only form that means anything on screen. */
function pct(n: number) {
  return `${(Math.abs(n) * 100).toFixed(1)}%`;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

export default function MotionLabScreen() {
  // `?mood=` makes any state reachable by deep link, which is how this screen gets
  // checked: tapping twenty-three chips means scrolling the character out of frame.
  // It has to be an effect, not a `useState` initialiser — navigating to the same
  // route with a different parameter reuses the mounted screen, so an initialiser
  // runs once and every later link silently does nothing.
  const params = useLocalSearchParams<{ mood?: string }>();
  const [mood, setMood] = useState<MascotMood>('idle');
  useEffect(() => {
    const found = ALL_MASCOT_MOODS.find((m) => m === params.mood);
    if (found) setMood(found);
  }, [params.mood]);
  const [blinkSignal, setBlinkSignal] = useState(0);
  const [beatSignal, setBeatSignal] = useState(0);
  const pose = MASCOT_STATES[mood];
  const gaze = pose.gaze;
  const beat = pose.beat;
  const blinkEvery = pose.blink;
  const eyes = Array.isArray(pose.eyes) ? pose.eyes : [pose.eyes];

  return (
    <EdBase scroll={false} bottomInset={0}>
      <SecondaryPageNav onBack={() => safeBack('/profile/settings')} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>Motion lab</Text>
        <Text style={styles.lede}>
          Six expressions and four product moments. Posture, rhythm and arm carriage come from
          the state; the blink, the gaze, the eye art and the beat each run on their own random
          interval, so no two viewings look alike. A product moment is one illustration and
          drifts as a unit.
        </Text>

        <View style={styles.stage}>
          <MascotCharacter width={PREVIEW_WIDTH} mood={mood} blinkSignal={blinkSignal} beatSignal={beatSignal} />
        </View>
        <View style={styles.stageWhite}>
          <MascotCharacter width={PREVIEW_WIDTH * 0.6} mood={mood} blinkSignal={blinkSignal} beatSignal={beatSignal} />
        </View>

        {MASCOT_GROUPS.map((group) => (
          <View key={group.label}>
            <Text style={styles.groupLabel}>{group.label.toUpperCase()}</Text>
            <View style={styles.chips}>
              {group.moods.map((item) => {
                const active = item === mood;
                return (
                  <Pressable key={item} accessibilityRole="button" accessibilityState={{ selected: active }}
                    onPress={() => setMood(item)}
                    style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && styles.chipPressed]}>
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{item}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}

        {USED_BY[mood] && <Text style={styles.when}>{USED_BY[mood]}</Text>}

        <View style={styles.readout}>
          <Row label="Lean" value={`${signed(pose.roll[0], '°')} ± ${pose.roll[1]}°`} />
          <Row label="Height" value={pose.ty[0] === 0 ? 'level' : `${pose.ty[0] < 0 ? 'lifted' : 'sunk'} ${pct(Math.abs(pose.ty[0]))}`} />
          <Row label="Squash" value={`${pose.squash[0]} ± ${pose.squash[1]}`} />
          {pose.hop && <Row label="Hop" value={`${pct(pose.hop.height)} at ${pose.hop.rate}/s · crouch ${pct(pose.hop.crouch)} · squash ${pose.hop.squash}`} />}
          {pose.shake && <Row label="Shake" value={`${pct(pose.shake[0])} at ${pose.shake[1]} Hz`} />}
          {pose.scene
            ? <Row label="Form" value="one illustration, drifting as a unit" />
            : <Row label="Arms" value={`droop ${signed(pose.arm[0], '°')} · swing ± ${pose.arm[1]}° · ${pose.arm[2]}× · ${pose.reach ? 'reaching' : 'at rest'}`} />}
          <Row label="Lid" value={pose.lid >= 1 ? 'open' : `${Math.round(pose.lid * 100)}% open`} />
          <Row label="Eye size" value={pose.eyeScale === 1 ? 'normal' : `${pose.eyeScale}×`} />
          <Row label="Eye art" value={eyes.join(', ') + (pose.eyeHold ? ` · held ${secs(pose.eyeHold)}` : '')} />
          {pose.prop && <Row label="Accent" value={`${pose.prop}, ${pose.propMotion ?? 'static'}`} />}
          {!pose.scene && <Row label="Ear lag" value={pose.earLag === 0 ? 'rigid' : `${Math.round(pose.earLag * 100)}%`} />}
          <Row label="Looks" value={`${gaze.x === 0 ? '' : gaze.x > 0 ? 'right ' : 'left '}${gaze.y === 0 ? (gaze.x === 0 ? 'straight out' : '') : gaze.y < 0 ? 'and up' : 'and down'} · held ${secs(gaze.hold)}`} />
          <Row label="Blink" value={blinkEvery ? `every ${secs(blinkEvery)}` : 'held, never blinks'} />
          <Row label="Beat" value={beat ? `${pct(beat.ty)} lift · ${signed(beat.roll, '°')} every ${secs(beat.every)}` : 'none'} />
        </View>

        <View style={styles.actions}>
          <Pressable accessibilityRole="button" onPress={() => setBlinkSignal((n) => n + 1)}
            disabled={!blinkEvery}
            style={({ pressed }) => [styles.action, !blinkEvery && styles.actionDisabled, pressed && styles.actionPressed]}>
            <Text style={[styles.actionText, !blinkEvery && styles.actionTextDisabled]}>Blink now</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => setBeatSignal((n) => n + 1)}
            disabled={!beat}
            style={({ pressed }) => [styles.action, !beat && styles.actionDisabled, pressed && styles.actionPressed]}>
            <Text style={[styles.actionText, !beat && styles.actionTextDisabled]}>Beat now</Text>
          </Pressable>
        </View>

        <Text style={styles.footnote}>
          With the system reduce-motion setting on, every layer holds its rest pose and none of
          these controls do anything.
        </Text>
      </ScrollView>
    </EdBase>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: layout.listInline, paddingBottom: 40 },
  title: { ...type.page, color: colors.text, marginTop: 4 },
  lede: { ...type.bodyReading, color: colors.supporting, marginTop: 8 },
  stage: {
    marginTop: 20, height: 230,
    borderRadius: componentTokens.todayHero.borderRadius,
    backgroundColor: colors.surfaceSubtle,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  stageWhite: {
    marginTop: 10, height: 140,
    borderRadius: componentTokens.todayHero.borderRadius,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  groupLabel: { ...type.meta, color: colors.muted, marginTop: 20, marginBottom: 8, letterSpacing: 0.6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: {
    minHeight: 40, justifyContent: 'center', paddingHorizontal: 13,
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg,
  },
  chipActive: { backgroundColor: colors.action, borderColor: colors.action },
  chipPressed: { backgroundColor: colors.surfaceSubtle },
  chipText: { ...type.meta, color: colors.sub },
  chipTextActive: { color: colors.onAction },
  when: { ...type.meta, color: colors.muted, marginTop: 18 },
  readout: { marginTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', gap: 16,
    paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  rowLabel: { ...type.meta, color: colors.muted },
  rowValue: { ...type.meta, color: colors.text, flexShrink: 1, textAlign: 'right' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  action: {
    flex: 1, minHeight: 48, borderRadius: radius.pill,
    backgroundColor: colors.surfaceSubtle, alignItems: 'center', justifyContent: 'center',
  },
  actionPressed: { backgroundColor: colors.selectionNeutral },
  actionDisabled: { backgroundColor: colors.disabledBg },
  actionText: { ...type.meta, color: colors.text },
  actionTextDisabled: { color: colors.disabledText },
  footnote: { ...type.meta, color: colors.muted, marginTop: 20 },
});
