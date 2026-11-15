import { homeColors } from '@/theme/colors';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HomeAsset } from '../HomeAsset';

export const destinations = [
  { id: 'today', label: 'Today' },
  { id: 'create', label: 'Create' },
  { id: 'library', label: 'Library' },
] as const;
export type Destination = typeof destinations[number]['id'];

const ITEM = 54;
const INSET = 12;
/** The highlight's trip from one tab to the other. Under-damped on purpose: it
 * arrives a little past the tab and comes back, which is what makes it read as a
 * thing with weight rather than a fill that changed places. */
const TRAVEL = { damping: 15, stiffness: 190, mass: 0.9 } as const;
/** How much longer it gets at the middle of the trip, and how much it is squeezed
 * when it runs past either end. */
const STRETCH = 0.22;
const SQUEEZE = 0.6;
/** The arriving tab's icon ducks and springs back up. */
const DUCK = { duration: 90, easing: Easing.out(Easing.quad) } as const;
const RISE = { damping: 8, stiffness: 260, mass: 0.7 } as const;

/** One destination. Its content gives a little under a finger, and bounces once
 * when it becomes the tab that is showing. */
function Item({ selected, label, bare, onPress, children, tab, marked }: {
  selected?: boolean; label?: string; bare?: boolean; tab?: boolean;
  /** Carries the highlight itself, for the one frame before the bar is measured. */
  marked?: boolean;
  onPress: () => void; children: ReactNode;
}) {
  const still = useReducedMotion();
  const scale = useSharedValue(1);
  useEffect(() => {
    if (selected && !still) scale.value = withSequence(withTiming(0.84, DUCK), withSpring(1, RISE));
  }, [scale, selected, still]);
  const bounce = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Pressable
      accessibilityRole={tab ? 'tab' : 'button'}
      accessibilityState={tab ? { selected: !!selected } : undefined}
      accessibilityLabel={bare ? label : undefined}
      onPress={onPress}
      onPressIn={() => { if (!still) scale.value = withTiming(0.9, DUCK); }}
      onPressOut={() => { if (!still) scale.value = withSpring(1, RISE); }}
      style={[styles.homeItem, marked && styles.homeSelected]}>
      <Animated.View style={[styles.homeContent, bounce]}>
        {children}
        {!bare && <Text style={styles.homeLabel}>{label}</Text>}
      </Animated.View>
    </Pressable>
  );
}

/** Today 96:704 geometry for the two tab destinations. Create keeps the product's
 * prominent centre action instead of the reference frame's flat third item.
 *
 * The highlight under the selected tab is its own layer, so that changing tabs
 * moves it rather than repainting two backgrounds: it slides across on a spring,
 * stretching as it goes and squeezing where it overshoots.
 */
export function BottomNavigation({ active, onNavigate }: { active: Destination; onNavigate: (id: Destination) => void }) {
  const insets = useSafeAreaInsets();
  const still = useReducedMotion();
  const [face, setFace] = useState({ width: 0, height: 0 });
  /** Where the highlight is: 0 under Today, 1 under Library, and briefly outside
   * that when it overshoots. */
  const at = active === 'library' ? 1 : 0;
  const pos = useSharedValue(at);
  useEffect(() => {
    pos.value = still ? at : withSpring(at, TRAVEL);
  }, [at, pos, still]);

  const item = (face.width - INSET * 2) / 3;
  const highlight = useAnimatedStyle(() => {
    const p = pos.value;
    const inside = Math.min(1, Math.max(0, p));
    const past = Math.abs(p - inside);
    // Longest half way across; shorter than itself where it has run past an end.
    const long = 1 + STRETCH * Math.sin(Math.PI * inside) - Math.min(0.1, past * SQUEEZE);
    return { transform: [{ translateX: p * item * 2 }, { scaleX: long }] };
  });

  const measured = face.width > 0;
  return (
    <View style={[styles.homeOuter, { paddingBottom: Math.max(8, insets.bottom) }]}>
      <View style={styles.homeBar}>
        <View style={styles.homeBarFace}
          onLayout={(e) => setFace({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}>
          {measured && (
            <Animated.View pointerEvents="none"
              style={[styles.highlight, { left: INSET, top: (face.height - ITEM) / 2, width: item }, highlight]} />
          )}
          <Item tab selected={active === 'today'} marked={!measured && active === 'today'} label="Today"
            onPress={() => onNavigate('today')}><HomeAsset name="homeSolid" /></Item>
          <Item bare label="Create a new lesson" onPress={() => onNavigate('create')}><HomeAsset name="add" /></Item>
          <Item tab selected={active === 'library'} marked={!measured && active === 'library'} label="Library"
            onPress={() => onNavigate('library')}><HomeAsset name="librarySolid" /></Item>
        </View>
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  homeOuter: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16 },
  homeBar: { height: 71, backgroundColor: homeColors.border, borderRadius: 44, paddingBottom: 4 },
  homeBarFace: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: INSET, backgroundColor: homeColors.nav, borderRadius: 44 },
  homeItem: { flex: 1, height: ITEM, alignItems: 'center', justifyContent: 'center' },
  homeContent: { alignItems: 'center', justifyContent: 'center', gap: 2 },
  homeSelected: { backgroundColor: homeColors.selected, borderRadius: 999 },
  highlight: { position: 'absolute', height: ITEM, borderRadius: 999, backgroundColor: homeColors.selected },
  homeLabel: { fontFamily: 'Geist_500Medium', fontSize: 12, color: homeColors.deep },
});
