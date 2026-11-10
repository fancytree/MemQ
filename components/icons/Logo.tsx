import { colors, fonts } from '@/theme';
import { StyleProp, ViewStyle, Text, View } from 'react-native';
import { DesignAsset } from '../DesignAsset';

interface LogoProps {
  width?: number;
  height?: number;
  style?: StyleProp<ViewStyle>;
  color?: string;
}

/** New wordmark treatment inside the existing logo slot; no parent geometry changes. */
export default function Logo({ width = 120, height, style, color = colors.wordmark }: LogoProps) {
  const finalHeight = height || width / 3.8;
  const scale = Math.min(width / 116, finalHeight / 36);
  return <View accessibilityRole="image" accessibilityLabel="MemQ" style={[{ width, height: finalHeight }, style]}>
    <View style={{ position: 'absolute', left: (width - 116) / 2, top: (finalHeight - 36) / 2,
      width: 116, height: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, transform: [{ scale }] }}>
      <Text style={{ fontFamily: fonts.extraBold, fontSize: 25, lineHeight: 32, letterSpacing: -1.1, color }}>MemQ</Text>
      <DesignAsset name="rays" />
    </View>
  </View>;
}
