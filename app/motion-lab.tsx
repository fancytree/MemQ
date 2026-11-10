import { EdBase } from '@/components/EdBase';
import {
  BEAT, BLINK_EVERY, EYE_HOLD, EYE_PLAYLIST, GAZE, InklingCharacter, MOOD_GROUPS, POSES,
  type InklingMood,
} from '@/components/InklingCharacter';
import { SecondaryPageNav } from '@/components/SecondaryPageNav';
import { safeBack } from '@/lib/safeBack';
import { colors, componentTokens, layout, radius, type } from '@/theme';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

/** Preview screen for the Inkling. Every number shown is read back from the motion
 * tables, so this page cannot drift out of step with the real behaviour.
 */
const USED_BY: Partial<Record<InklingMood, string>> = {
  idle: 'Today · cards are due and the goal is not met',
  curious: 'Today · the account has no courses yet',
  thinking: 'Today · the first lesson fetch has not returned',
  happy: 'Today · the daily goal is met',
  drowsy: 'Today · courses exist but nothing is due',
};

const PREVIEW_WIDTH = 190;

function secs([min, max]: readonly [number, number]) {
  return min === max ? `${(min / 1000).toFixed(1)}s` : `${(min / 1000).toFixed(1)}–${(max / 1000).toFixed(1)}s`;
}
function signed(n: number, unit = '') {
  return `${n > 0 ? '+' : ''}${n}${unit}`;
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
  const [mood, setMood] = useState<InklingMood>('idle');
  const [blinkSignal, setBlinkSignal] = useState(0);
  const [beatSignal, setBeatSignal] = useState(0);
  const pose = POSES[mood];
  const gaze = GAZE[mood];
  const beat = BEAT[mood];
  const blinkEvery = BLINK_EVERY[mood];

  return (
    <EdBase scroll={false} bottomInset={0}>
      <SecondaryPageNav onBack={() => safeBack('/profile/settings')} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>Motion lab</Text>
        <Text style={styles.lede}>
          Every state the character can hold. Posture, rhythm and arm carriage come from the
          state; the blink, the gaze, the eye shape and the beat each run on their own random
          interval, so no two viewings look alike.
        </Text>

        <View style={styles.stage}>
          <InklingCharacter width={PREVIEW_WIDTH} mood={mood} blinkSignal={blinkSignal} beatSignal={beatSignal} />
        </View>
        <View style={styles.stageWhite}>
          <InklingCharacter width={PREVIEW_WIDTH * 0.6} mood={mood} blinkSignal={blinkSignal} beatSignal={beatSignal} />
        </View>

        {MOOD_GROUPS.map((group) => (
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
          <Row label="Height" value={pose.ty[0] === 0 ? 'level' : pose.ty[0] < 0 ? `lifted ${-pose.ty[0]}` : `sunk ${pose.ty[0]}`} />
          <Row label="Squash" value={`${pose.squash[0]} ± ${pose.squash[1]}`} />
          {pose.bounce && <Row label="Bounce" value={`${pose.bounce[0]} units at ${pose.bounce[1]} Hz`} />}
          {pose.shake && <Row label="Shake" value={`${pose.shake[0]}° at ${pose.shake[1]} Hz`} />}
          <Row label="Arms" value={`droop ${signed(pose.arm[0], '°')} · swing ± ${pose.arm[1]}° · ${pose.arm[2]}×`} />
          <Row label="Lid" value={pose.lid >= 1 ? 'open' : `${Math.round(pose.lid * 100)}% open`} />
          <Row label="Eye size" value={pose.eyeScale === 1 ? 'normal' : `${pose.eyeScale}×`} />
          <Row label="Eye shapes" value={`${EYE_PLAYLIST[mood].join(', ')} · held ${secs(EYE_HOLD[mood])}`} />
          <Row label="Looks" value={`${gaze.x === 0 ? '' : gaze.x > 0 ? 'right ' : 'left '}${gaze.y === 0 ? (gaze.x === 0 ? 'straight out' : '') : gaze.y < 0 ? 'and up' : 'and down'} · held ${secs(gaze.hold)}`} />
          <Row label="Blink" value={blinkEvery ? `every ${secs(blinkEvery)}` : 'held, never blinks'} />
          <Row label="Beat" value={beat ? `${signed(beat.tx)} / ${signed(beat.ty)} / ${signed(beat.roll, '°')} every ${secs(beat.every)}` : 'none'} />
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
