import { Asset } from 'expo-asset';
import { View } from 'react-native';
import { SvgUri } from 'react-native-svg';

const assets = {
  waveBack: [require('../assets/home-figma/wave-back.svg'), 449.597, 250.941],
  waveFront: [require('../assets/home-figma/wave-front.svg'), 462, 313],
  happy: [require('../assets/home-figma/happy.svg'), 220.205, 220.205],
  target: [require('../assets/home-figma/target.svg'), 16, 16],
  // Exported at its own size. The pill beside 16-point text asks for it much
  // smaller, which is what the height prop below is for.
  focusTarget: [require('../assets/home-figma/focus-target.svg'), 63.6858, 60],
  play: [require('../assets/home-figma/play.svg'), 27.2558, 24.9114],
  sparkRight: [require('../assets/home-figma/spark-right.svg'), 39, 35],
  sparkLeft: [require('../assets/home-figma/spark-left.svg'), 38.2263, 34.7567],
  time: [require('../assets/home-figma/time.svg'), 42, 42],
  goal: [require('../assets/home-figma/goal.svg'), 30, 30],
  chevron: [require('../assets/home-figma/chevron.svg'), 15, 15],
  home: [require('../assets/home-figma/home.svg'), 24, 24],
  add: [require('../assets/home-figma/add.svg'), 50, 50],
  library: [require('../assets/home-figma/library.svg'), 24, 24],
  flame: [require('../assets/home-figma/flame.svg'), 17.024, 21.1051],
} as const;

/** @param height Draw it this tall instead of at the size it was exported, the
 *  width following so the drawing keeps its proportions. These files carry
 *  `preserveAspectRatio="none"`, so a width and a height that do not match the
 *  viewBox stretch the artwork — deriving one from the other is what stops that.
 *  Use it when a slot wants a different size from the export, rather than
 *  re-exporting or editing the asset. */
export function HomeAsset({ name, height: want }: { name: keyof typeof assets; height?: number }) {
  const [module, w, h] = assets[name];
  const scale = want === undefined ? 1 : want / h;
  // Whole points on both axes. Asked for 16.98 by 16 the renderer drew 16 by 16,
  // and with `preserveAspectRatio="none"` that squashed the drawing sideways by
  // a sixteenth — a ring measured 15.0 across where it should have been 16.0.
  // Rounding both edges leaves an aspect error of about a tenth of a percent
  // instead, and nothing for the renderer to trim.
  const width = Math.round(w * scale), height = Math.round(h * scale);
  return <View accessible={false} pointerEvents="none" style={{ width, height }}><SvgUri uri={Asset.fromModule(module).uri} width={width} height={height} /></View>;
}
