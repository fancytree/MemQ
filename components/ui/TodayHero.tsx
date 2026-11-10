import { colors, componentTokens, elevation, interaction, type } from '@/theme';
import { Pressable, PressableProps, StyleSheet, Text, View } from 'react-native';
import { DesignAsset } from '../DesignAsset';
import { InklingCharacter, type InklingMood } from '../InklingCharacter';

type TodayHeroProps = Omit<PressableProps, 'children'> & {
  dueCount: number;
  /** Omitted when nothing is due; the reference frame has no empty state. */
  estimateMinutes: number | null;
  actionLabel: string;
  showPlayIcon?: boolean;
  /** How the character should feel about the state of the card. */
  mood?: InklingMood;
};

/** Today 96:762: neutral card with the due count, a time estimate and a pill action.
 * The Inkling deliberately overflows the card's top-right corner, as in the reference.
 */
export function TodayHero({ dueCount, estimateMinutes, actionLabel, showPlayIcon = true, mood = 'idle', style, ...props }: TodayHeroProps) {
  return (
    <View style={styles.card}>
      <View style={styles.copy}>
        <View>
          <Text style={styles.count} maxFontSizeMultiplier={1.4}>{dueCount}</Text>
          <Text style={styles.unit} maxFontSizeMultiplier={1.4}>{dueCount === 1 ? 'card due today' : 'cards due today'}</Text>
        </View>
        <Text style={styles.estimate}>
          {estimateMinutes === null ? 'Nothing due right now.' : `Estimate· ${estimateMinutes}min`}
        </Text>
      </View>
      <InklingCharacter width={hero.inklingWidth} mood={mood} style={styles.inkling} />
      <Pressable {...props} accessibilityRole="button"
        accessibilityLabel={props.accessibilityLabel ?? actionLabel}
        style={(state) => [styles.action, state.pressed && styles.actionPressed,
          typeof style === 'function' ? style(state) : style]}>
        {showPlayIcon && <View accessible={false} style={styles.playSlot}><DesignAsset name="play" /></View>}
        <Text style={styles.actionLabel}>{actionLabel}</Text>
      </Pressable>
    </View>
  );
}

const hero = componentTokens.todayHero;
const action = componentTokens.heroAction;
const styles = StyleSheet.create({
  card: {
    ...elevation.none,
    minHeight: hero.minHeight,
    borderRadius: hero.borderRadius,
    padding: hero.padding,
    backgroundColor: hero.backgroundColor,
    justifyContent: 'space-between',
    gap: hero.padding,
  },
  copy: { gap: hero.textGap, alignItems: 'flex-start' },
  count: { ...type.dueCount, color: colors.text },
  unit: { ...type.dueLabel, color: colors.text },
  estimate: { ...type.dueEstimate, color: colors.supporting },
  inkling: {
    position: 'absolute',
    top: hero.inklingTop,
    right: hero.inklingRight,
    transform: [{ scaleX: -1 }],
  },
  action: {
    alignSelf: 'flex-start',
    minHeight: action.minHeight,
    borderRadius: action.borderRadius,
    paddingHorizontal: action.paddingHorizontal,
    paddingVertical: action.paddingVertical,
    backgroundColor: action.backgroundColor,
    flexDirection: 'row',
    alignItems: 'center',
    gap: action.gap,
  },
  actionPressed: { backgroundColor: interaction.pressed },
  actionLabel: { ...action.label, color: colors.onAction },
  playSlot: { width: 16, height: 18, justifyContent: 'center' },
});
