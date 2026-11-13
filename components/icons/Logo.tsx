import { colors, fonts } from '@/theme';
import { StyleProp, ViewStyle, Text, View } from 'react-native';
import { DesignAsset } from '../DesignAsset';

interface LogoProps {
  width?: number;
  height?: number;
  style?: StyleProp<ViewStyle>;
  color?: string;
  /** Where the wordmark sits in its box. The box is about 15% wider than the glyphs
   * at any size, so a left-aligned caller that aligns the box still gets the
   * wordmark indented by half of that — 14 points at a width of 190.
   *
   * There are two indents, not one. The box is wider than the 116-unit row, and the
   * row is wider than the glyphs in it (about 91 of the 116), so left-aligning has
   * to undo both: the row moves to the box's visual left edge — the transform scales
   * it about its own centre, hence the 58(scale - 1) — and its contents stop being
   * centred inside it. Centre stays the default, so callers that centre it are
   * unaffected. */
  align?: 'center' | 'left';
}

/** New wordmark treatment inside the existing logo slot; no parent geometry changes. */
export default function Logo({ width = 120, height, style, color = colors.wordmark, align = 'center' }: LogoProps) {
  const finalHeight = height || width / 3.8;
  const scale = Math.min(width / 116, finalHeight / 36);
  return <View accessibilityRole="image" accessibilityLabel="MemQ" style={[{ width, height: finalHeight }, style]}>
    <View style={{ position: 'absolute', top: (finalHeight - 36) / 2,
      left: align === 'left' ? (116 * scale - 116) / 2 : (width - 116) / 2,
      width: 116, height: 36, flexDirection: 'row', alignItems: 'center', gap: 3,
      justifyContent: align === 'left' ? 'flex-start' : 'center', transform: [{ scale }] }}>
      <Text style={{ fontFamily: fonts.extraBold, fontSize: 25, lineHeight: 32, letterSpacing: -1.1, color }}>MemQ</Text>
      <DesignAsset name="rays" />
    </View>
  </View>;
}
