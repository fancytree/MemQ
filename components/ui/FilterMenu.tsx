import { useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, useReducedMotion } from 'react-native-reanimated';

import { Icon } from '@/components/Icon';
import { RowIcon } from '@/components/RowIcon';
import { homeColors } from '@/theme/colors';
import { ledge } from '@/theme/ledge';
import { fonts } from '@/theme/typography';

/** One button that opens a short list of ways to narrow a list.
 *
 * It replaced a row of chips under the search field. Four chips took a whole row
 * for a choice made now and then, and read as part of the content; a button beside
 * the field keeps the choice one tap away and gives the row back to the list.
 *
 * A choice other than the first is the one thing the button must not hide, so
 * while one is on the button is filled and carries a dot — the list under it is
 * not the whole list, and the person should not have to open the menu to find out.
 *
 * The menu opens under the button, as a card with a lip like every other raised
 * thing here, and a tap anywhere outside it puts it away.
 */
export type FilterOption<T extends string> = { id: T; label: string; count?: number };

const SIZE = 52;
const MENU_WIDTH = 224;
const GAP = 8;

export function FilterMenu<T extends string>({ options, value, onChange, label = 'Filter' }: {
  options: FilterOption<T>[];
  value: T;
  onChange: (id: T) => void;
  label?: string;
}) {
  const still = useReducedMotion();
  const button = useRef<View>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const current = options.find((option) => option.id === value);
  const narrowed = value !== options[0]?.id;

  const open = () => {
    button.current?.measureInWindow((x, y, _width, height) => setAnchor({ x, y: y + height + GAP }));
  };
  const close = () => setAnchor(null);
  const choose = (id: T) => { onChange(id); close(); };

  return (
    <>
      <Pressable ref={button} onPress={open} accessibilityRole="button"
        accessibilityLabel={`${label}: ${current?.label ?? ''}`} accessibilityState={{ expanded: anchor !== null }}
        style={[styles.button, narrowed && styles.buttonOn]}>
        <RowIcon name="filter" color={homeColors.deep} size={22} />
        {narrowed && <View style={styles.dot} />}
      </Pressable>
      <Modal visible={anchor !== null} transparent animationType="none" onRequestClose={close} statusBarTranslucent>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close filter" />
        {anchor && (
          <Animated.View entering={still ? undefined : FadeIn.duration(140)} exiting={still ? undefined : FadeOut.duration(100)}
            style={[styles.menu, { top: anchor.y, left: anchor.x }]} accessibilityViewIsModal>
            <View style={styles.menuFace}>
              {options.map((option) => {
                const on = option.id === value;
                return (
                  <Pressable key={option.id} onPress={() => choose(option.id)} accessibilityRole="menuitem"
                    accessibilityState={{ selected: on }} style={({ pressed }) => [styles.row, (on || pressed) && styles.rowOn]}>
                    <Text style={[styles.rowLabel, on && styles.rowLabelOn]}>{option.label}</Text>
                    {option.count !== undefined && <Text style={styles.count}>{option.count}</Text>}
                    <View style={styles.check}>{on && <Icon name="check" size={16} color={homeColors.deep} strokeWidth={2.5} />}</View>
                  </Pressable>
                );
              })}
            </View>
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
    width: SIZE, height: SIZE, borderRadius: SIZE / 2, backgroundColor: homeColors.white,
    borderWidth: 1, borderColor: homeColors.border, alignItems: 'center', justifyContent: 'center',
  },
  buttonOn: { backgroundColor: homeColors.selected, borderColor: homeColors.selected },
  dot: {
    position: 'absolute', top: 10, right: 10, width: 9, height: 9, borderRadius: 5,
    backgroundColor: homeColors.primary, borderWidth: 1.5, borderColor: homeColors.selected,
  },
  menu: {
    position: 'absolute', width: MENU_WIDTH, borderRadius: 22,
    backgroundColor: homeColors.border, paddingBottom: ledge.raised,
  },
  // Its own edge as well as its lip: it opens over white cards, and without one
  // its side ran into theirs.
  menuFace: { borderRadius: 22, backgroundColor: homeColors.white, padding: 6, gap: 2, borderWidth: 1, borderColor: homeColors.border },
  row: { minHeight: 46, borderRadius: 16, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowOn: { backgroundColor: homeColors.nav },
  rowLabel: { flex: 1, fontFamily: fonts.medium, fontSize: 15, color: homeColors.darkest },
  rowLabelOn: { fontFamily: fonts.semibold, color: homeColors.deep },
  count: { fontFamily: fonts.medium, fontSize: 13, color: homeColors.muted },
  check: { width: 18, alignItems: 'center' },
});
