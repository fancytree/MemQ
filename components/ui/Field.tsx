/**
 * Somewhere to type, with the label that says what goes in it.
 *
 * The label, the well, the hint and the error are one thing, so they are one
 * component: a screen that writes them separately writes them differently, which
 * is how the app ended up with eight kinds of text field.
 *
 * `trailing` is for what belongs inside the well on the right — showing a
 * password, clearing a value. Everything else a `TextInput` takes is passed
 * straight through.
 *
 * `FieldLabel` and `fieldWell` are for the one thing shaped like a field that is
 * not one: a row that opens a picker rather than taking a cursor. It should look
 * like its neighbours, so it is drawn from the same tokens instead of a copy of
 * them.
 */

import { componentTokens, colors, fonts, hairline } from '@/theme';
import { oneLine } from '@/theme/typography';
import type { ReactNode, Ref } from 'react';
import {
  StyleSheet, Text, TextInput, View,
  type StyleProp, type TextInputProps, type ViewStyle,
} from 'react-native';

type FieldProps = Omit<TextInputProps, 'style'> & {
  /** What goes in it. Omitted where the placeholder already says so. A node for
   *  the rare label that carries a mark of its own, such as a required asterisk. */
  label?: ReactNode;
  /** Beside the label: a small action belonging to this field. */
  labelAction?: ReactNode;
  /** Under the well, quietly. */
  hint?: string;
  /** Under the well, in red, announced. Replaces the hint while it is there. */
  error?: string;
  /** Inside the well, on the right. */
  trailing?: ReactNode;
  /** Reaches the TextInput, for a screen that focuses or clears it itself. */
  ref?: Ref<TextInput>;
  style?: StyleProp<ViewStyle>;
};

export function Field({
  label, labelAction, hint, error, trailing, multiline, style,
  accessibilityLabel, ref, ...input
}: FieldProps) {
  return (
    <View style={[styles.group, style]}>
      {(label || labelAction) && (
        <View style={styles.labelRow}>
          {!!label && <FieldLabel>{label}</FieldLabel>}
          {labelAction}
        </View>
      )}
      <View style={[styles.well, multiline && styles.tall, !!error && styles.wrong]}>
        <TextInput
          {...input}
          ref={ref}
          accessibilityLabel={accessibilityLabel ?? (typeof label === 'string' ? label : undefined)}
          multiline={multiline}
          textAlignVertical={multiline ? 'top' : undefined}
          placeholderTextColor={colors.placeholder}
          style={[styles.input, multiline && styles.inputTall]}
        />
        {trailing}
      </View>
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {!error && !!hint && <Text style={styles.hint}>{hint}</Text>}
    </View>
  );
}


const token = componentTokens.field;
const text = oneLine(token.text);
const styles = StyleSheet.create({
  group: { gap: token.gap },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: token.gap },
  label: { ...token.label, fontFamily: fonts.semibold, color: colors.text },
  well: {
    minHeight: token.minHeight,
    borderRadius: token.radius,
    borderWidth: hairline,
    borderColor: token.border,
    backgroundColor: token.fill,
    paddingHorizontal: token.paddingHorizontal,
    flexDirection: 'row',
    alignItems: 'center',
    gap: token.gap,
  },
  tall: { minHeight: token.multilineMinHeight, alignItems: 'stretch' },
  wrong: { borderColor: colors.red },
  // One line has nothing to lead; a textarea keeps it. See oneLine in
  // theme/typography.ts for why the leading lands where it does.
  input: { ...text, flex: 1, color: colors.text, paddingVertical: token.paddingVertical },
  inputTall: { lineHeight: token.text.lineHeight, minHeight: token.multilineMinHeight - token.paddingVertical * 2 },
  hint: { ...componentTokens.field.label, color: colors.faint },
  error: { ...componentTokens.field.label, fontFamily: fonts.medium, color: colors.red },
});

/** The label on its own, and the well on its own, for the one row that is shaped
 *  like a field but opens a picker instead of taking a cursor. */
export function FieldLabel({ children }: { children: ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}
export const fieldWell = styles.well;
export const fieldGroup = styles.group;
