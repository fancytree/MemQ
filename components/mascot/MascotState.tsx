import type { StyleProp, ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';


import { RIG_INK } from './rig/art';
import { MascotRig } from './rig/MascotRig';
import { RIG_ORIGIN, RIG_VIEW } from './rig/rig';
import { MASCOT_STATES, type MascotStateKind, type StateInk } from './states';
import { colors } from '@/theme/colors';

/** An empty or error state, as a picture: the character and the one thing that
 * says which state it is (see ./states).
 *
 * It moves. These are the screens where nothing else does — no list, no numbers,
 * often only two lines and a button — and a still drawing on a still screen reads
 * as the app having stopped. A character that breathes and looks at the thing in
 * its hands says the app is here and knows. It is the same rig as everywhere else,
 * so the system's reduce-motion setting holds it in its rest pose, which is a
 * complete picture on its own.
 *
 * The thing is handed to the rig as what it sits behind, so it is drawn over the
 * body and under the hands and the face, and the hands come to rest on its edge.
 * It is laid over the character's square rather than placed after it, and like the
 * character it may overhang that square a little: the square is what lays out.
 */
const INK: Record<StateInk, string> = {
  outline: RIG_INK.outline,
  gold: RIG_INK.gold,
  paper: colors.surf,
  soft: colors.limeSurface,
  line: colors.faint,
  faint: colors.tint,
};

/** How far past the square the drawing may reach, as a fraction of its side. */
const BLEED = 0.14;

export function MascotState({ kind, width = 200, style }: {
  kind: MascotStateKind;
  /** The side of the square it is laid out in, in points. */
  width?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const spec = MASCOT_STATES[kind];
  const over = Math.round(width * BLEED);
  const overArt = over * RIG_VIEW / width;
  const side = RIG_VIEW + overArt * 2;

  const prop = (
    // Keyed by the state: when one picture is swapped for another in place, a dash
    // or a turn that the new shape does not have would otherwise stay on the old
    // native path, which is only ever told what is set, never what was dropped.
    <Svg key={kind} pointerEvents="none" width={width + over * 2} height={width + over * 2}
      style={{ position: 'absolute', left: -over, top: -over }}
      viewBox={`${-RIG_ORIGIN.x - overArt} ${-RIG_ORIGIN.y - overArt} ${side} ${side}`}>
      {spec.prop.map((shape, i) => (
        <Path key={i} d={shape.d}
          fill={shape.fill ? INK[shape.fill] : 'none'}
          stroke={shape.stroke ? INK[shape.stroke] : undefined}
          strokeWidth={shape.width}
          strokeLinecap="round" strokeLinejoin="round"
          strokeDasharray={shape.dash}
          rotation={shape.turn?.[0]} originX={shape.turn?.[1]} originY={shape.turn?.[2]} />
      ))}
    </Svg>
  );

  return (
    <MascotRig width={width} mood={spec.mood} look={spec.look} hands behind={prop}
      bleed={BLEED} style={style} />
  );
}
