/**
 * Choosing photos without leaving the app.
 *
 * The system picker is the safer thing and is still here as the way out: it runs
 * outside the app, so it needs no permission at all and the app only ever sees
 * what was handed to it. This one is the opposite trade — to draw a grid we have
 * to be allowed to read the library — and it exists because being able to see the
 * conversation behind the sheet, and keep picking while the thumbnails fill in, is
 * worth a lot in a chat. If the permission is refused, the system picker takes
 * over and nothing is lost but the grid.
 *
 * The numbers are the point of the design, not decoration: they say what order the
 * photos will arrive in, which is the order the answer will talk about them in.
 * So selection is an ordered list, not a set.
 */

import { Button } from '@/components/ui/Button';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Sheet } from '@/components/ui/Sheet';
import { colors, componentTokens, fonts, radius, space, type } from '@/theme';
import { ledge } from '@/theme/ledge';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View,
  useWindowDimensions,
} from 'react-native';

export type PickedPhoto = { uri: string; name: string; type: string };

/** How many of the most recent photos the grid offers. Enough to scroll through
 *  without turning the sheet into a photo manager; anything older is what the
 *  system picker, with its search and its albums, is for. */
const RECENT = 120;

/* The foot keeps this height whether or not the Add button is in it.
 *
 * Without it the row is as tall as its tallest child, so the first photo chosen
 * made the row grow and — since it is anchored to the bottom — shunted the two
 * round buttons upward. Choosing a photo should change what the row says, not
 * where it is. The number is the button's own standing height, taken from the
 * tokens rather than written out, so it still matches if the scale moves. */
const FOOT = componentTokens.button.lg.height + ledge.control;
const COLUMNS = 3;
const GAP = 2;

/* Loaded on first use, like the pickers: a native module missing from a build
 * should degrade to the system picker, not take the screen down. */
type Library = {
  getPermissionsAsync: () => Promise<Access>;
  requestPermissionsAsync: () => Promise<Access>;
  presentPermissionsPicker: () => Promise<void>;
  /** Taken from the module rather than written out here. The value is `image`,
   *  not `photo`, and a string of our own would be a guess that only fails at
   *  runtime — as this one did. */
  MediaType: { IMAGE: string };
  Query: new () => {
    eq: (field: string, value: unknown) => any;
    orderBy: (sort: { key: string; ascending?: boolean }) => any;
    limit: (n: number) => any;
    exe: () => Promise<LibraryAsset[]>;
  };
};
type Access = { granted: boolean; accessPrivileges?: 'all' | 'limited' | 'none' };
type LibraryAsset = { getInfo: () => Promise<{ id: string; uri: string; filename: string }> };
let library: Library | null | undefined;
export function loadLibrary(): Library | null {
  if (library === undefined) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    try { library = require('expo-media-library') as Library; }
    catch { library = null; }
  }
  return library;
}

type Photo = { id: string; uri: string; name: string };

export function PhotoSheet({ visible, max, onClose, onPick, onFallback }: {
  visible: boolean;
  /** How many more this message can carry. */
  max: number;
  onClose: () => void;
  onPick: (photos: PickedPhoto[]) => void;
  /** Called instead of showing the grid when the library cannot be read. */
  onFallback: () => void;
}) {
  const { width } = useWindowDimensions();
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [limited, setLimited] = useState(false);

  const tile = Math.floor((width - GAP * (COLUMNS - 1)) / COLUMNS);

  const read = useCallback(async () => {
    const media = loadLibrary();
    if (!media) return onFallback();
    const granted = await media.getPermissionsAsync()
      .then((access) => (access.granted ? access : media.requestPermissionsAsync()))
      .catch(() => null);
    // Refused, or a build where this cannot be asked: hand over to the picker that
    // needs no permission rather than showing an empty grid and an explanation.
    if (!granted?.granted) return onFallback();
    setLimited(granted.accessPrivileges === 'limited');

    /* The whole chain, not just `exe`. The builder's methods reach native code and
     * throw where they stand, so catching only the promise leaves a synchronous
     * failure to escape as an unhandled rejection and the grid spinning for ever. */
    try {
      const assets: LibraryAsset[] = await new media.Query()
        .eq('mediaType', media.MediaType.IMAGE)
        .orderBy({ key: 'creationTime', ascending: false })
        .limit(RECENT)
        .exe();
      // One round trip each, in parallel: the uri and the name come from the same
      // call, and the grid cannot draw anything until it has them.
      const info = await Promise.all(assets.map((asset: LibraryAsset) => asset.getInfo().catch(() => null)));
      setPhotos(info.filter((one): one is { id: string; uri: string; filename: string } => !!one)
        .map((one) => ({ id: one.id, uri: one.uri, name: one.filename || 'photo.jpg' })));
    } catch {
      // Permission is there but the library will not answer. The picker that needs
      // no permission is still a way to get a photo, so take it.
      onFallback();
    }
  }, [onFallback]);

  useEffect(() => {
    if (!visible) { setPhotos(null); setChosen([]); return; }
    void read();
  }, [visible, read]);

  const toggle = (id: string) => setChosen((previous) => {
    if (previous.includes(id)) return previous.filter((one) => one !== id);
    // Silently ignoring the tap past the limit would look broken; the tile simply
    // does not take, and the button already says how many are going.
    return previous.length >= max ? previous : [...previous, id];
  });

  const add = () => {
    const byId = new Map((photos ?? []).map((photo) => [photo.id, photo]));
    onPick(chosen.flatMap((id) => {
      const photo = byId.get(id);
      // Sent as JPEG whatever the library holds, because the photo is redrawn
      // before it goes anywhere (lib/chatAttach).
      return photo ? [{ uri: photo.uri, name: photo.name, type: 'image/jpeg' }] : [];
    }));
  };

  const full = chosen.length >= max;

  return (
    /* No title, no subtitle, no cross. A grid of photographs says what it is, and
     * every line of furniture above it costs a row of them. What the header was
     * carrying has moved: dismissing is the button at the foot, the count is in
     * the button beside it, and the note about limited access is the mark on the
     * right — the three things to do, all within reach of a thumb. */
    <Sheet visible={visible} onClose={onClose} close={false} closeLabel="Close photos">
      {photos === null ? (
        <View style={styles.waiting}><ActivityIndicator color={colors.sub} /></View>
      ) : photos.length === 0 ? (
        <View style={styles.waiting}><Text style={styles.empty}>No photos to show.</Text></View>
      ) : (
        <ScrollView contentContainerStyle={styles.grid} showsVerticalScrollIndicator={false}>
          {photos.map((photo) => {
            const at = chosen.indexOf(photo.id);
            return (
              <Pressable key={photo.id} onPress={() => toggle(photo.id)}
                accessibilityRole="checkbox" accessibilityState={{ checked: at >= 0 }}
                accessibilityLabel={at >= 0 ? `Photo ${at + 1} of ${chosen.length}, chosen` : 'Photo'}
                style={{ width: tile, height: tile }}>
                <Image source={{ uri: photo.uri }} style={styles.photo} />
                {/* Chosen photos step back a little, so the grid reads as a set of
                    choices rather than a wall with marks on it. Once the message is
                    full the ones not going step back too, which is how a tap that
                    will not take says so before it is made. */}
                {(at >= 0 || full) && <View style={styles.chosenWash} />}
                <View style={[styles.badge, at >= 0 && styles.badgeOn]}>
                  {at >= 0 && <Text style={styles.badgeText}>{at + 1}</Text>}
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {/* Over the grid rather than under it: the thumb is already down there, and a
          band of its own would cost a row of photos to say nothing. The grid's last
          row scrolls out from behind it. */}
      <View style={styles.foot} pointerEvents="box-none">
        <Round icon="chevronLeft" label="Close photos" onPress={onClose} />
        <View style={styles.footMiddle}>
          {/* No `width`: `hug` is `alignSelf` underneath, so in a row that already
              centres its children it would only drag the button to the start —
              which is what the prop's own doc warns about. */}
          {!!chosen.length && (
            <Button label={chosen.length === 1 ? 'Add 1 photo' : `Add ${chosen.length} photos`}
              onPress={add} />
          )}
        </View>
        {limited ? (
          // Read again afterwards: the whole point of that screen is to change
          // which photos we can see, so the grid behind it is now out of date.
          <Round icon="photo" label="Choose which photos are shared"
            onPress={() => void loadLibrary()?.presentPermissionsPicker().then(read)} />
        ) : <View style={styles.roundSlot} />}
      </View>
    </Sheet>
  );
}

/** The small dark discs either side of the button. They sit over photographs, so
 *  they carry their own ground rather than borrowing the sheet's. */
function Round({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => [styles.round, pressed && styles.roundPressed]}>
      <Icon name={icon} size={20} color={colors.surf} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  round: {
    width: 44, height: 44, borderRadius: radius.pill,
    // Solid rather than a veil: these discs scroll over photographs as often as
    // over the sheet, and a white mark on 31% black is unreadable against a pale
    // one. The same ground as the remove button on an attachment, for the same
    // reason.
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.text,
  },
  roundPressed: { opacity: 0.7 },
  /** Keeps the button centred when there is no mark on the right. */
  roundSlot: { width: 44 },
  waiting: { height: 240, alignItems: 'center', justifyContent: 'center' },
  empty: { ...type.body, fontFamily: fonts.regular, color: colors.faint },
  // Edge to edge: the photographs are the content, and a margin around them only
  // makes each one smaller.
  grid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: GAP,
    // Room for the floating controls to sit over, so the last row can still be
    // reached and tapped.
    paddingBottom: space[10] + space[6],
  },
  photo: { width: '100%', height: '100%', borderRadius: radius.sm, backgroundColor: colors.panel },
  chosenWash: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: radius.sm, backgroundColor: colors.scrim,
  },
  /* An empty ring on every tile rather than only on the chosen ones: the mark is
   * where the tap lands, and a target that appears only after it has been hit is
   * one nobody aims at.
   *
   * Along the bottom edge, with the button: the numbers and the count they add up
   * to are one thought, and keeping them on the same side of the screen means the
   * eye does not have to cross the grid to check its own work. */
  badge: {
    position: 'absolute', bottom: space[2], right: space[2],
    width: 24, height: 24, borderRadius: radius.pill,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: colors.surf,
  },
  badgeOn: { backgroundColor: colors.action, borderColor: colors.surf },
  badgeText: { ...type.caption, fontFamily: fonts.semibold, color: colors.surf },
  foot: {
    position: 'absolute', left: space[4], right: space[4], bottom: space[6],
    height: FOOT,
    flexDirection: 'row', alignItems: 'center', gap: space[3],
  },
  footMiddle: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
