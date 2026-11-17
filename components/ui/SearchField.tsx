/**
 * Looking through a list.
 *
 * The glass, the field and the way to clear it are one control: the library and a
 * lesson's cards are searched the same way, so they are searched with the same
 * thing. It sits on the page rather than inside a card, which is why it is white
 * with a hairline rather than a well.
 *
 * The clear button appears only once there is something to clear — an X beside an
 * empty field is a button that does nothing.
 */

import { Icon } from '@/components/ui/Icon';
import { colors, componentTokens, hairline } from '@/theme';
import { oneLine } from '@/theme/typography';
import { StyleSheet, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import { IconButton } from './IconButton';

type SearchFieldProps = Omit<TextInputProps, 'style' | 'value' | 'onChangeText'> & {
  value: string;
  onChangeText: (value: string) => void;
  /** What is being searched, for the field and for its clear button. */
  label: string;
  style?: StyleProp<ViewStyle>;
};

export function SearchField({ value, onChangeText, label, placeholder, style, ...input }: SearchFieldProps) {
  return (
    <View style={[styles.field, style]}>
      <Icon name="search" size={20} color={colors.faint} />
      <TextInput
        {...input}
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder ?? label}
        placeholderTextColor={colors.placeholder}
        returnKeyType="search"
        style={styles.input}
      />
      {value.length > 0 && (
        <IconButton variant="quiet" size="sm" label={`Clear ${label.toLowerCase()}`} onPress={() => onChangeText('')}>
          <Icon name="close" size={20} color={colors.sub} />
        </IconButton>
      )}
    </View>
  );
}

const token = componentTokens.search;
/** Without its leading: see oneLine in theme/typography.ts. */
const text = oneLine(componentTokens.field.text);
const styles = StyleSheet.create({
  field: {
    flex: 1,
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
  input: { ...text, flex: 1, color: colors.text, paddingVertical: 0 },
});
