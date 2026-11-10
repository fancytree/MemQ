import { Manrope_400Regular } from '@expo-google-fonts/manrope/400Regular';
import { Manrope_500Medium } from '@expo-google-fonts/manrope/500Medium';
import { Manrope_600SemiBold } from '@expo-google-fonts/manrope/600SemiBold';
import { Manrope_700Bold } from '@expo-google-fonts/manrope/700Bold';
import { Manrope_800ExtraBold } from '@expo-google-fonts/manrope/800ExtraBold';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Caveat_400Regular } from '@expo-google-fonts/caveat/400Regular';

/** Packaged assets: render only after loading, so native and web use the same faces. */
export const fontAssets = {
  Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold,
  Inter_400Regular, Inter_600SemiBold, Caveat_400Regular,
  JetBrainsMono_400Regular: require('../assets/fonts/JetBrainsMono-Regular.ttf'),
};
