import { SvgXml } from 'react-native-svg';

import { ROW_ICON_ART } from '@/components/rowIconArt';

/** The icon that says what a settings row is.
 *
 * Solid and round, because everything else that names a place in this app is: the
 * tab bar's icons, the lesson covers, the character. A hairline glyph in a tinted
 * tile read as a stock settings screen next to them, and a solid one with square
 * corners read as somebody else's app. Only the row's own icon is like this — the
 * small icons that do something inside a row (a clock by a time, a bin, a chevron)
 * stay as outlines, so they read as controls and not as more labels.
 *
 * The shapes come from four sets (rowIconArt.ts). Their artboards are padded
 * differently, so a few are drawn a little larger or smaller to look the same size
 * in the tile as the rest.
 */
export type RowIconName = keyof typeof ROW_ICON_ART;

const OPTICAL: Partial<Record<RowIconName, number>> = {
  // Solar's figure is a small head on a low body, and reads a size down from the
  // rest at the same box.
  user: 1.1,
};

export function RowIcon({ name, color, size = 24 }: { name: RowIconName; color: string; size?: number }) {
  const { box, body } = ROW_ICON_ART[name];
  const drawn = Math.round(size * (OPTICAL[name] ?? 1));
  const xml = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${box} ${box}" fill="currentColor">${body}</svg>`;
  return <SvgXml xml={xml} width={drawn} height={drawn} color={color} />;
}
