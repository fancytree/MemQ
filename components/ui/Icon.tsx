/**
 * The app's icon.
 *
 * One set, one weight, one shape language: round and solid (components/iconArt.ts).
 * Before this there were three — seventeen solid shapes for the settings rows and
 * the tab bar, eleven hand-rolled strokes at 1.6, and twenty-four Feather glyphs
 * from a library at a third weight again — and which one you got depended on the
 * file you were in rather than on what the icon was for.
 *
 * There is no `strokeWidth` any more, because there is no stroke to set: a glyph is
 * either a filled body or a heavy rounded mark, and both are decided in the art, not
 * at the call site. That prop was how the old set ended up at 1.6 in a tab bar, 2 in
 * a row and 2.5 on a tick.
 *
 * `size` is the box the glyph is drawn in, and the only thing a screen chooses.
 */

import { ICON_ART } from '@/components/iconArt';
import { SvgXml } from 'react-native-svg';

export type IconName = keyof typeof ICON_ART;

/** A few artboards are padded differently from the rest, so their glyph is drawn a
 *  little larger or smaller to look the same size in a row as its neighbours. */
const OPTICAL: Partial<Record<IconName, number>> = {
  // Solar's figure is a small head on a low body, and reads a size down from the
  // rest at the same box.
  user: 1.1,
  // Material Symbols' marks are drawn to the edge of their artboard where Solar's
  // bodies keep a margin, so a tick or a cross next to a filled shape comes out
  // looking the larger of the two.
  check: 0.92,
  close: 0.92,
  plus: 0.92,
  chevronLeft: 0.92,
  chevronRight: 0.92,
  search: 0.92,
  code: 0.92,
  history: 0.92,
};

export function Icon({ name, color, size = 24 }: {
  name: IconName;
  color: string;
  size?: number;
}) {
  const { box, body } = ICON_ART[name];
  const drawn = Math.round(size * (OPTICAL[name] ?? 1));
  const xml = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${box} ${box}" fill="currentColor">${body}</svg>`;
  return <SvgXml xml={xml} width={drawn} height={drawn} color={color} />;
}
