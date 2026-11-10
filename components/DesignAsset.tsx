import { Asset } from 'expo-asset';
import { View } from 'react-native';
import { SvgUri } from 'react-native-svg';

/** Original SVG root dimensions stay unchanged. Any fitting is a proportional wrapper transform. */
export const designAssets = {
  editRadio: { module: require('../assets/design-system/edit-radio-selected.svg'), width: 22, height: 22 },
  editCalendar: { module: require('../assets/design-system/edit-calendar.svg'), width: 18, height: 18 },
  editDown: { module: require('../assets/design-system/edit-chevron-down.svg'), width: 18, height: 18 },
  editTrash: { module: require('../assets/design-system/edit-trash.svg'), width: 18, height: 18 },
  editClose: { module: require('../assets/design-system/edit-close.svg'), width: 18, height: 18 },
  editLeft: { module: require('../assets/design-system/edit-chevron-left.svg'), width: 18, height: 18 },
  editRight: { module: require('../assets/design-system/edit-chevron-right.svg'), width: 18, height: 18 },

  reviewArrow: { module: require('../assets/design-system/review-arrow.svg'), width: 20.0521, height: 19.7 },
  termPlus: { module: require('../assets/design-system/term-plus.svg'), width: 18, height: 18 },
  termSearch: { module: require('../assets/design-system/term-search.svg'), width: 18, height: 18 },
  termChevronDown: { module: require('../assets/design-system/term-chevron-down.svg'), width: 16, height: 16 },
  termVolume: { module: require('../assets/design-system/term-volume.svg'), width: 18, height: 18 },
  libraryChevron: { module: require('../assets/design-system/library-chevron.svg'), width: 17, height: 17 },
  paper: { module: require('../assets/design-system/notebook-paper.svg'), width: 212, height: 100 },
  flame: { module: require('../assets/design-system/streak-flame.svg'), width: 25, height: 29 },
  chevron: { module: require('../assets/design-system/chevron-right.svg'), width: 17, height: 17 },
  curious: { module: require('../assets/design-system/inkling-curious.svg'), width: 160, height: 148 },
  thinking: { module: require('../assets/design-system/inkling-thinking.svg'), width: 160, height: 148 },
  happy: { module: require('../assets/design-system/inkling-happy.svg'), width: 160, height: 148 },
  sleepy: { module: require('../assets/design-system/inkling-sleepy.svg'), width: 160, height: 148 },
  rays: { module: require('../assets/design-system/wordmark-rays.svg'), width: 18, height: 26 },
  play: { module: require('../assets/design-system/start-play.svg'), width: 14.9603, height: 16.5832 },
  arrow: { module: require('../assets/design-system/arrow-right.svg'), width: 18, height: 18 },
  today: { module: require('../assets/design-system/nav-today.svg'), width: 21, height: 21 },
  todayInactive: { module: require('../assets/design-system/nav-today-inactive.svg'), width: 21, height: 21 },
  library: { module: require('../assets/design-system/nav-library-active.svg'), width: 21, height: 21 },
  libraryInactive: { module: require('../assets/design-system/nav-library.svg'), width: 21, height: 21 },
} as const;
export type DesignAssetName = keyof typeof designAssets;

export function DesignAsset({ name }: { name: DesignAssetName }) {
  const asset = designAssets[name];
  return <View accessible={false} style={{ width: asset.width, height: asset.height }}>
    <SvgUri uri={Asset.fromModule(asset.module).uri} width={asset.width} height={asset.height} />
  </View>;
}

export function FittedDesignAsset({ name, width, height }: { name: DesignAssetName; width: number; height: number }) {
  const asset = designAssets[name];
  const scale = Math.min(width / asset.width, height / asset.height);
  return <View accessible={false} pointerEvents="none" style={{ width, height, overflow: 'visible' }}>
    <View style={{ position: 'absolute', left: (width - asset.width) / 2, top: (height - asset.height) / 2, transform: [{ scale }] }}>
      <DesignAsset name={name} />
    </View>
  </View>;
}
