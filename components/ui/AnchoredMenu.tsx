/**
 * A short list of things to do, opening from the control that asked for it.
 *
 * The filter beside the library's search field does the same job, and the way it
 * places itself — measure the control, open on whichever side has the room, put it
 * away on a tap anywhere else — is what this is built on. Two things are different,
 * and both come from where this one is used.
 *
 * It does not use `Modal`. A modal on iOS takes first responder, which closes the
 * keyboard; this menu opens from a button inside a text field, where the keyboard
 * going away on every tap is the whole problem. So it draws into a layer in the
 * same view tree instead, and `MenuLayer` is what provides that layer. The cost is
 * that the layer has to be measured, because a view inside the tree is positioned
 * against its container and `measureInWindow` answers in window coordinates.
 *
 * And it is allowed to cover the control it came from. A menu that insisted on
 * sitting clear of the field would be squeezed into whatever the keyboard left,
 * which is usually not enough; springing from the button and covering the field is
 * both roomier and the more familiar shape.
 */

import { Icon, type IconName } from '@/components/ui/Icon';
import { colors } from '@/theme/colors';
import { ledge } from '@/theme/ledge';
import { radius, space } from '@/theme/spacing';
import { fonts, type } from '@/theme/typography';
import {
  createContext, useContext, useRef, useState, type ReactNode,
} from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, Keyframe, useReducedMotion } from 'react-native-reanimated';

export type MenuAction<T extends string> = {
  id: T;
  label: string;
  icon: IconName;
  /** Shown under the label, for an action that needs a word of warning. */
  note?: string;
};

const MENU_WIDTH = 232;
/** What a row costs, so the side it opens on can be decided before it is drawn.
 *  Measuring first would mean a frame in the wrong place. */
const ROW = 52;
const MENU_PADDING = space[1] * 2 + ledge.raised + 2;

/* It grows a little out of the control that opened it and settles, which says
 * where it came from, and it leaves faster than it arrived and without retracing
 * the path — an exit that plays the entrance backwards makes dismissing something
 * feel slower than it was. `scale` alone would swell from the middle, so a small
 * nudge along the axis it opened on pulls the growth towards the control. */
const opening = (up: boolean) => new Keyframe({
  0: { opacity: 0, transform: [{ scale: 0.94 }, { translateY: up ? 8 : -8 }] },
  100: {
    opacity: 1, transform: [{ scale: 1 }, { translateY: 0 }],
    easing: Easing.bezier(0.2, 0.9, 0.25, 1),
  },
}).duration(170);

const closing = new Keyframe({
  0: { opacity: 1, transform: [{ scale: 1 }] },
  100: { opacity: 0, transform: [{ scale: 0.97 }], easing: Easing.out(Easing.quad) },
}).duration(110);

type Frame = { x: number; y: number; width: number; height: number };
type Layer = {
  show: (node: ReactNode) => void;
  /** Where the layer sits in the window, and how big it is, so a control measured
   *  in window coordinates can be placed inside it.
   *
   *  Measured when the menu opens rather than kept in state. The keyboard changes
   *  this view's height, and a frame cached from before it went down puts the menu
   *  off the bottom of the screen — which looks exactly like a button that has
   *  stopped working. */
  measure: () => Promise<Frame>;
};
const LayerContext = createContext<Layer | null>(null);

/**
 * The surface an `AnchoredMenu` inside it draws on.
 *
 * Wrap the screen's own root in it. The menu becomes the last child of this view,
 * so it paints over everything in it, and its backdrop covers exactly this view —
 * which is why a tap anywhere on the screen closes the menu while the keyboard
 * stays where it is.
 */
export function MenuLayer({ children }: { children: ReactNode }) {
  const [node, setNode] = useState<ReactNode>(null);
  const box = useRef<View>(null);
  const measure = () => new Promise<Frame>((resolve) => {
    const view = box.current;
    if (!view) return resolve({ x: 0, y: 0, width: 0, height: 0 });
    view.measureInWindow((x, y, width, height) => resolve({ x, y, width, height }));
  });
  return (
    <LayerContext.Provider value={{ show: setNode, measure }}>
      <View ref={box} style={styles.layer}>
        {children}
        {node}
      </View>
    </LayerContext.Provider>
  );
}

export function AnchoredMenu<T extends string>({ actions, onSelect, label, trigger, disabled }: {
  actions: MenuAction<T>[];
  onSelect: (id: T) => void;
  /** What the control does, for screen readers. */
  label: string;
  /** What the control looks like. It is wrapped in the pressable that opens this. */
  trigger: ReactNode;
  disabled?: boolean;
}) {
  const still = useReducedMotion();
  const layer = useContext(LayerContext);
  const control = useRef<View>(null);
  const [open, setOpen] = useState(false);

  const close = () => { setOpen(false); layer?.show(null); };

  const show = async () => {
    if (!layer) return;
    const frame = await layer.measure();
    control.current?.measureInWindow((x, y, _width, height) => {
      // Window coordinates, moved into the layer's own.
      const left = Math.min(Math.max(space[3], x - frame.x), frame.width - MENU_WIDTH - space[3]);
      const top = y - frame.y;
      const wants = actions.length * ROW + (actions.length - 1) * space.hair + MENU_PADDING;
      // Below by preference, since that is where a menu is looked for; above when
      // there is not the room — which is the usual case for a control at the foot
      // of the screen with a keyboard under it.
      const up = wants > frame.height - (top + height);
      layer.show(
        <Menu
          key={Date.now()}
          actions={actions}
          still={still}
          up={up}
          // Flush with the control's own edge, so it springs from the button and
          // covers the field rather than being squeezed above it.
          place={{ left, ...(up ? { bottom: frame.height - (top + height) } : { top }) }}
          onPick={(id) => { close(); onSelect(id); }}
          onClose={close}
        />,
      );
      setOpen(true);
    });
  };

  return (
    <Pressable ref={control} onPress={() => void show()} disabled={disabled || !layer} accessibilityRole="button"
      accessibilityLabel={label} accessibilityState={{ expanded: open, disabled: !!disabled }}>
      {trigger}
    </Pressable>
  );
}

function Menu<T extends string>({ actions, place, up, still, onPick, onClose }: {
  actions: MenuAction<T>[];
  place: { left: number; top?: number; bottom?: number };
  up: boolean;
  still: boolean;
  onPick: (id: T) => void;
  onClose: () => void;
}) {
  return (
    <>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close menu" />
      <Animated.View
        style={[styles.menu, place]}
        /* Nothing moves at all when the system has been asked for less motion. */
        entering={still ? undefined : opening(up)}
        exiting={still ? undefined : closing}
      >
        <View style={styles.face}>
          {actions.map((action) => (
            <Pressable key={action.id} onPress={() => onPick(action.id)} accessibilityRole="menuitem"
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
              <View style={styles.mark}><Icon name={action.icon} size={18} color={colors.sub} /></View>
              <View style={styles.copy}>
                <Text style={styles.label}>{action.label}</Text>
                {action.note && <Text style={styles.note}>{action.note}</Text>}
              </View>
            </Pressable>
          ))}
        </View>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  layer: { flex: 1 },
  menu: {
    position: 'absolute', width: MENU_WIDTH, borderRadius: radius.lg,
    backgroundColor: colors.line, paddingBottom: ledge.raised,
  },
  // Its own edge as well as its lip: it opens over whatever is behind it, and
  // without one its side runs into the field underneath.
  face: {
    borderRadius: radius.lg, backgroundColor: colors.surf,
    borderWidth: 1, borderColor: colors.line, padding: space[1], gap: space.hair,
  },
  row: {
    minHeight: ROW, borderRadius: radius.md, paddingHorizontal: space[2],
    flexDirection: 'row', alignItems: 'center', gap: space[3],
  },
  rowPressed: { backgroundColor: colors.panel },
  // The mark sits in a disc, the way the rows of a settings list do: it keeps the
  // labels on one left edge however wide the glyphs are.
  mark: {
    width: 34, height: 34, borderRadius: radius.pill,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.panel,
  },
  copy: { flex: 1, gap: space[0] },
  label: { ...type.small, fontFamily: fonts.medium, color: colors.text },
  note: { ...type.caption, fontFamily: fonts.regular, color: colors.faint },
});
