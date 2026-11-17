/**
 * A surface that comes up over the screen you were on.
 *
 * Six of them, written six times. theme/sheet.ts already said what a sheet looks
 * like, but it was a bag of styles rather than a thing: every caller still wrote its
 * own Modal, its own scrim, its own press-to-dismiss, its own grab bar and its own
 * head, and then drifted. The grab bar was 36 points wide in four places and 38 in
 * another; it took the pill radius in two and the 8-point corner in the rest. The
 * sheet stopped at 75% of the screen, 86%, 88% and 92% — four answers to one
 * question. Two of them slid up, one faded and rose and scaled, and one ran its own
 * Animated.timing against a TouchableOpacity scrim.
 *
 * So the sheet is a component, and the styles it is made of stay where they were.
 * What a caller still chooses is what goes in the head and what goes in the body;
 * everything else — how it arrives, how far it comes up, how it is dismissed, where
 * the title sits — is the same sheet every time.
 *
 * `align` is the one real variation. A sheet that is a question ("Choose a lesson")
 * puts its title where reading starts; a sheet you can go back inside of centres the
 * title so the back arrow has the leading edge. Both are here because both exist on
 * screen, not because the component wanted a knob.
 */

import { CloseButton } from '@/components/ui/RoundButtons';
import { colors, fonts, layout, space, type } from '@/theme';
import { sheet as shape } from '@/theme/sheet';
import { oneLine } from '@/theme/typography';
import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Along the bottom edge when the phone has no home button of its own. A sheet that
 *  ends flush with the screen edge has its last row under the indicator. */
const FLOOR = 18;

export function Sheet({
  visible, onClose, onBack, closeLabel = 'Close',
  title, subtitle, eyebrow, align = 'start',
  lead, action, close = true, grab = true,
  style, children,
}: {
  visible: boolean;
  /** Pressing the scrim or the cross. */
  onClose: () => void;
  /** The system back gesture, when it should step back inside the sheet rather
   *  than close it. Defaults to closing. */
  onBack?: () => void;
  /** What is being put away, for anyone who cannot see the cross. */
  closeLabel?: string;
  title?: string;
  /** Under the title, in the quiet ink: what the sheet is asking for. */
  subtitle?: string;
  /** Above the title, tracked and small: what kind of thing this is. */
  eyebrow?: string;
  /** `start` reads from the leading edge; `center` gives that edge to `lead`. */
  align?: 'start' | 'center';
  /** Before the title — a way back into the sheet, rather than out of it. */
  lead?: ReactNode;
  /** Beside the cross: another thing this sheet can do to its subject. */
  action?: ReactNode;
  /** A sheet that commits rather than dismisses has a tick instead of a cross. */
  close?: boolean;
  /** The grab bar says the sheet can be pulled down, so it is only on ones that can. */
  grab?: boolean;
  /** Where the surface sits, for a sheet that has to be shorter than the rest. */
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent
      onRequestClose={onBack ?? onClose}>
      <View style={shape.scrim}>
        {/* The screen behind it is the way out, and says so to a screen reader. */}
        <Pressable accessibilityRole="button" accessibilityLabel={closeLabel}
          style={StyleSheet.absoluteFill} onPress={onClose} />
        <View accessibilityViewIsModal
          style={[styles.surface, { paddingBottom: Math.max(insets.bottom, FLOOR) }, style]}>
          {grab && <View accessible={false} style={shape.handle} />}
          <SheetHead onClose={onClose} closeLabel={closeLabel} title={title} subtitle={subtitle}
            eyebrow={eyebrow} align={align} lead={lead} action={action} close={close} tight={grab} />
          {children}
        </View>
      </View>
    </Modal>
  );
}

/** The same row, for the two sheets that are a whole page rather than a surface over
 *  one — the paywall and the practice settings. They are presented by the system
 *  instead of being drawn here, so they cannot use `Sheet`, but the title and the
 *  controls beside it are the same object and are no longer written out twice. */
export function SheetHead({
  onClose, closeLabel = 'Close', title, subtitle, eyebrow,
  align = 'start', lead, action, close = true, tight = false,
}: {
  onClose: () => void;
  closeLabel?: string;
  title?: string;
  subtitle?: string;
  eyebrow?: string;
  align?: 'start' | 'center';
  lead?: ReactNode;
  action?: ReactNode;
  close?: boolean;
  /** Something above has already left room — a grab bar, a status bar. */
  tight?: boolean;
}) {
  if (!title && !subtitle && !eyebrow && !lead && !action && !close) return null;
  const centred = align === 'center';
  return (
    <View style={[shape.head, !tight && styles.headLoose]}>
      {/* Centred, the title is measured against the sheet rather than against what
          is beside it, so the empty side keeps a control's width and the title
          stays in the middle. */}
      {lead ?? (centred ? <View style={styles.slot} /> : null)}
      <View style={[styles.copy, centred && styles.copyCentred]}>
        {!!eyebrow && <Text style={styles.eyebrow}>{eyebrow}</Text>}
        {!!title && <Text accessibilityRole="header" numberOfLines={centred ? 1 : 2}
          style={[styles.title, centred && styles.titleCentred]}>{title}</Text>}
        {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>
      <View style={styles.trailing}>
        {action}
        {close && <CloseButton onPress={onClose} label={closeLabel} />}
        {centred && !action && !close && <View style={styles.slot} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  /** One height for every sheet. High enough that a calendar or a long list has
   *  room, low enough that the screen it came from is still behind it — which is
   *  what makes it a sheet rather than a page. */
  surface: { ...shape.surface, maxHeight: '88%' },
  /** With a grab bar the head already has room above it; without one the head is
   *  the first thing on the sheet and has to make its own, or the title comes out
   *  pressed against the rounded top edge. */
  headLoose: { paddingTop: space[4] },
  /** As wide as the controls it stands in for, so a centred title is centred on
   *  the sheet and not on what is left over. */
  slot: { width: 44 },
  copy: { flex: 1, gap: space.hair },
  copyCentred: { alignItems: 'center' },
  eyebrow: { ...oneLine(type.caption), color: colors.sub, letterSpacing: 1.4 },
  title: { ...oneLine(type.page), color: colors.sub },
  titleCentred: { textAlign: 'center' },
  subtitle: { ...type.small, fontFamily: fonts.medium, color: colors.faint },
  trailing: { flexDirection: 'row', alignItems: 'center', gap: space[1] },
});

/** The side margin a sheet's body keeps, so that what is in it lines up with the
 *  title above it. The head takes the same one. */
export const sheetInline = layout.screenInline;
