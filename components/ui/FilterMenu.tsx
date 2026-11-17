import { space, radius } from '@/theme/spacing';
import { useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut, useReducedMotion } from 'react-native-reanimated';

import { Icon } from '@/components/ui/Icon';
import { ledge } from '@/theme/ledge';
import { type, fonts } from '@/theme/typography';
import { colors } from '@/theme/colors';

/** One button that opens a short list of ways to narrow a list.
 *
 * It replaced a row of chips under the search field. Four chips took a whole row
 * for a choice made now and then, and read as part of the content; a button beside
 * the field keeps the choice one tap away and gives the row back to the list.
 *
 * A choice other than the first is the one thing the button must not hide, so
 * while one is on the button fills with the lime — the list under it is not the
 * whole list, and the person should not have to open the menu to find out. The
 * fill says that on its own; it also carried a dot, which was a second answer to
 * a question already answered.
 *
 * The menu opens under the button, as a card with a lip like every other raised
 * thing here, and a tap anywhere outside it puts it away. Where it will not fit
 * under the button — the button is low on the page, or the list is long — it opens
 * upward instead, and only scrolls when neither side has room. A menu that runs
 * off the bottom of the screen hides the very choice it was opened for.
 */
export type FilterOption<T extends string> = { id: T; label: string; count?: number };

const SIZE = 52;
const MENU_WIDTH = 224;
const GAP = 8;
/** What a row costs, so the menu can tell whether it fits before it is drawn:
 *  measuring it first would mean showing it in the wrong place for a frame. */
const ROW = 46;
const MENU_PADDING = space[1] * 2 + ledge.raised + 2;

export function FilterMenu<T extends string>({ options, value, onChange, label = 'Filter' }: {
  options: FilterOption<T>[];
  value: T;
  onChange: (id: T) => void;
  label?: string;
}) {
  const still = useReducedMotion();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const button = useRef<View>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number; height: number } | null>(null);
  const current = options.find((option) => option.id === value);
  const narrowed = value !== options[0]?.id;

  const open = () => {
    button.current?.measureInWindow((x, y, _width, height) => setAnchor({ x, y, height }));
  };
  const close = () => setAnchor(null);
  const choose = (id: T) => { onChange(id); close(); };

  // Where it will fit. Below the button by preference — that is where a menu is
  // looked for — and above it when the room below has run out.
  const wants = options.length * ROW + (options.length - 1) * space.hair + MENU_PADDING;
  const roomBelow = anchor ? windowHeight - insets.bottom - (anchor.y + anchor.height + GAP) : 0;
  const roomAbove = anchor ? anchor.y - insets.top - GAP : 0;
  const opensUp = anchor !== null && wants > roomBelow && roomAbove > roomBelow;
  const place = anchor === null ? null : {
    left: Math.min(Math.max(space[3], anchor.x), windowWidth - MENU_WIDTH - space[3]),
    ...(opensUp
      ? { bottom: windowHeight - anchor.y + GAP }
      : { top: anchor.y + anchor.height + GAP }),
  };
  const maxHeight = Math.max(ROW * 3, opensUp ? roomAbove : roomBelow);

  return (
    <>
      <Pressable ref={button} onPress={open} accessibilityRole="button"
        accessibilityLabel={`${label}: ${current?.label ?? ''}`} accessibilityState={{ expanded: anchor !== null }}
        style={[styles.button, narrowed && styles.buttonOn]}>
        <Icon name="filter" color={colors.sub} size={22} />
      </Pressable>
      <Modal visible={anchor !== null} transparent animationType="none" onRequestClose={close} statusBarTranslucent>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close filter" />
        {place && (
          <Animated.View entering={still ? undefined : FadeIn.duration(140)} exiting={still ? undefined : FadeOut.duration(100)}
            style={[styles.menu, place, { maxHeight }]} accessibilityViewIsModal>
            <ScrollView style={styles.menuFace} contentContainerStyle={styles.menuList} bounces={false}
              showsVerticalScrollIndicator={false}>
              {options.map((option) => {
                const on = option.id === value;
                return (
                  <Pressable key={option.id} onPress={() => choose(option.id)} accessibilityRole="menuitem"
                    accessibilityState={{ selected: on }} style={({ pressed }) => [styles.row, (on || pressed) && styles.rowOn]}>
                    <Text style={[styles.rowLabel, on && styles.rowLabelOn]}>{option.label}</Text>
                    {option.count !== undefined && <Text style={styles.count}>{option.count}</Text>}
                    <View style={styles.check}>{on && <Icon name="check" size={16} color={colors.sub} />}</View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </Animated.View>
        )}
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  // Drawn like the search field it sits beside: white, the same height, the same
  // hairline.
  button: {
    width: SIZE, height: SIZE, borderRadius: SIZE / 2, backgroundColor: colors.surf,
    borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center',
  },
  buttonOn: { backgroundColor: colors.limeSurface, borderColor: colors.limeSurface },
  menu: {
    position: 'absolute', width: MENU_WIDTH, borderRadius: radius.lg,
    backgroundColor: colors.line, paddingBottom: ledge.raised,
  },
  // Its own edge as well as its lip: it opens over white cards, and without one
  // its side ran into theirs.
  menuFace: { borderRadius: radius.lg, backgroundColor: colors.surf, borderWidth: 1, borderColor: colors.line },
  menuList: { padding: space[1], gap: space.hair },
  row: { minHeight: 46, borderRadius: radius.md, paddingHorizontal: space[3], flexDirection: 'row', alignItems: 'center', gap: space[2] },
  rowOn: { backgroundColor: colors.panel },
  rowLabel: { ...type.small, fontFamily: fonts.medium, flex: 1, color: colors.text },
  rowLabelOn: { fontFamily: fonts.semibold, color: colors.sub },
  count: { ...type.caption, color: colors.faint },
  check: { width: 18, alignItems: 'center' },
});
