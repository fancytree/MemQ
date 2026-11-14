/**
 * The app's own dialog, in place of the system one.
 *
 * `Alert.alert` draws iOS's dialog: its font, its blur, its blue. It was the one
 * surface in the app that belonged to no palette — and it is the surface people see
 * when something has gone wrong, which is exactly when the app should still look
 * like itself.
 *
 * The call signature is the one it replaces, on purpose, so a call site changes by
 * its name alone:
 *
 *     dialog('Error', 'Please log in first.')
 *     dialog('Delete card?', 'This cannot be undone.', [
 *       { text: 'Cancel', style: 'cancel' },
 *       { text: 'Delete', style: 'destructive', onPress: remove },
 *     ])
 *
 * Like the system one it can be raised from anywhere — a catch block, a callback,
 * code that is not a component — so a host listens and the module-level function
 * hands it the next one.
 *
 * One rule for anything new: a component that opens a Modal and can raise a dialog
 * from inside it must render a <DialogHost /> within that Modal. iOS will not bring
 * a Modal up over another Modal it is not inside of, so without it the dialog is
 * raised, taken, and never seen.
 */

import { colors, fonts, layout } from '@/theme';
import { homeColors } from '@/theme/colors';
import { ledge } from '@/theme/ledge';
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

export type DialogButton = {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
};

type Dialog = { title: string; message?: string; buttons: DialogButton[] };

const OK: DialogButton[] = [{ text: 'OK' }];

/** One queue for the whole app, kept on the global rather than in this module's
 *  scope: under Fast Refresh a module can be re-evaluated while a mounted host still
 *  holds the old copy, and a caller would then be posting into a queue nobody reads.
 *
 *  There is a stack of hosts rather than one, because of how iOS presents modals: a
 *  Modal cannot come up over another Modal it is not inside of. A dialog raised from
 *  a sheet, with only a host at the root, sets its state and then shows nothing. So
 *  every sheet mounts a host of its own, and the newest one — the one deepest inside
 *  whatever is on screen — takes the next dialog. */
type Store = { queue: Dialog[]; hosts: (() => void)[] };
const store: Store = ((globalThis as unknown as { __memqDialog?: Store }).__memqDialog
  ??= { queue: [], hosts: [] });
// A store left on the global by an earlier version of this module survives a reload
// with whatever shape it had then, so fill in anything it is missing.
store.queue ??= [];
store.hosts ??= [];

/** Raise a dialog. Same arguments as the system one it replaces. */
export function dialog(title: string, message?: string, buttons?: DialogButton[]) {
  store.queue.push({ title, message, buttons: buttons?.length ? buttons : OK });
  store.hosts[store.hosts.length - 1]?.();
}

/** Mounted once, at the root. */
export function DialogHost() {
  const [current, setCurrent] = useState<Dialog | null>(null);
  // What is on screen, readable synchronously: the queue is taken from outside the
  // state updater, since React may run an updater more than once and taking from the
  // queue twice would drop a dialog on the floor.
  const showing = useRef<Dialog | null>(null);

  useEffect(() => {
    const pull = () => {
      if (showing.current) return;
      const next = store.queue.shift();
      if (!next) return;
      showing.current = next;
      setCurrent(next);
    };
    store.hosts.push(pull);
    pull();
    return () => {
      store.hosts = store.hosts.filter((host) => host !== pull);
      // A sheet can be dismissed while its dialog is up — by the back gesture, or by
      // the sheet's own code. The dialog has not been answered, so it goes back to
      // the front of the queue for whoever is still standing.
      if (showing.current) store.queue.unshift(showing.current);
      store.hosts[store.hosts.length - 1]?.();
    };
  }, []);

  const dismiss = (button?: DialogButton) => {
    showing.current = null;
    setCurrent(null);
    button?.onPress?.();
    // Anything raised while this one was up waits its turn, the way the system
    // dialog stacks them rather than dropping them.
    setTimeout(() => store.hosts[store.hosts.length - 1]?.(), 0);
  };

  if (!current) return null;

  const { title, message, buttons } = current;
  // Two short choices sit side by side; anything else stacks, because a row of
  // three squeezes every label into something unreadable.
  const side = buttons.length === 2 && buttons.every((b) => b.text.length <= 14);
  const ordered = side
    ? [...buttons].sort((a, b) => Number(b.style === 'cancel') - Number(a.style === 'cancel'))
    : [...buttons].sort((a, b) => Number(a.style === 'cancel') - Number(b.style === 'cancel'));
  const escape = buttons.find((b) => b.style === 'cancel') ?? (buttons.length === 1 ? buttons[0] : undefined);

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent
      onRequestClose={() => dismiss(escape)}>
      <View style={styles.scrim}>
        <View accessibilityViewIsModal style={styles.shell}>
          <View style={styles.face}>
            <ScrollView bounces={false} contentContainerStyle={styles.copy}>
              <Text accessibilityRole="header" style={styles.title}>{title}</Text>
              {!!message && <Text style={styles.message}>{message}</Text>}
            </ScrollView>
            <View style={[styles.actions, side ? styles.actionsRow : styles.actionsColumn]}>
              {ordered.map((button, i) => {
                const quiet = button.style === 'cancel';
                const harm = button.style === 'destructive';
                return (
                  <Pressable key={`${button.text}-${i}`} accessibilityRole="button"
                    accessibilityLabel={button.text}
                    onPress={() => dismiss(button)}
                    style={({ pressed }) => [
                      styles.button, side && styles.buttonShare,
                      quiet ? styles.quiet : harm ? styles.harm : styles.lead,
                      pressed && styles.pressed,
                    ]}>
                    <Text numberOfLines={1} style={quiet ? styles.quietText : styles.leadText}>
                      {button.text}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1, justifyContent: 'center',
    paddingHorizontal: layout.screenInline, backgroundColor: colors.modalScrim,
  },
  // The same shell-and-face a card carries, at the depth of a raised surface.
  shell: {
    width: '100%', maxWidth: 440, alignSelf: 'center',
    borderRadius: 28, backgroundColor: homeColors.border, paddingBottom: ledge.raised,
  },
  face: { borderRadius: 28, backgroundColor: homeColors.white, padding: 24, gap: 22 },

  copy: { gap: 8 },
  title: { fontFamily: fonts.display, fontSize: 25, lineHeight: 33, color: homeColors.deep },
  message: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: homeColors.muted },

  actions: { gap: 10 },
  actionsRow: { flexDirection: 'row' },
  actionsColumn: { flexDirection: 'column' },
  button: {
    minHeight: 50, paddingHorizontal: 16, borderRadius: 25,
    alignItems: 'center', justifyContent: 'center',
  },
  buttonShare: { flex: 1, minWidth: 0 },
  lead: { backgroundColor: homeColors.primary },
  harm: { backgroundColor: colors.red },
  quiet: { backgroundColor: homeColors.nav },
  pressed: { opacity: 0.7 },
  leadText: { fontFamily: fonts.semibold, fontSize: 15, color: homeColors.white },
  quietText: { fontFamily: fonts.semibold, fontSize: 15, color: homeColors.deep },
});
