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

import { Dialog, type DialogButton, type DialogChoice } from '@/components/ui/Dialog';
import { useEffect, useRef, useState } from 'react';

export type { DialogButton, DialogChoice };

type Dialog = { title: string; message?: string; buttons: DialogButton[]; choices?: DialogChoice[] };

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

/** Raise a dialog. The first three arguments are the system one's, so a call site
 *  changes by its name alone.
 *
 *  `choices` is the one thing the system dialog has no equivalent for: several
 *  things to pick between, drawn as a list above the buttons rather than as more
 *  buttons. It is a question with answers, not a pile of actions. */
export function dialog(title: string, message?: string, buttons?: DialogButton[], choices?: DialogChoice[]) {
  store.queue.push({ title, message, buttons: buttons?.length ? buttons : OK, choices });
  store.hosts[store.hosts.length - 1]?.();
}

/** The question the bin asks before a card is thrown away.
 *
 * A card on a create screen has not been saved anywhere yet, so taking it off
 * the list is the end of it: there is no lesson to find it in again and no undo.
 * The bin is also small and sits beside the words of the card, which is exactly
 * where a thumb lands on the way past. Every bin on those screens asks this —
 * generated, typed by hand, pasted in (app/create, app/lessons/[id]/add-terms,
 * components/ImportedCards) — so the answer never depends on which kind of card
 * it was. */
export function confirmRemoveCard(term: string, remove: () => void) {
  dialog('Remove this card?', term ? `“${term}” will not be kept.` : 'It will not be kept.', [
    { text: 'Keep', style: 'cancel' },
    { text: 'Remove', style: 'destructive', onPress: remove },
  ]);
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

  // The answer's own handler is run by the button in the dialog, so this only
  // takes the dialog down — except when the back gesture answers for it, which
  // nothing else has run.
  const dismiss = (button?: DialogButton, run = false) => {
    showing.current = null;
    setCurrent(null);
    if (run) button?.onPress?.();
    // Anything raised while this one was up waits its turn, the way the system
    // dialog stacks them rather than dropping them.
    setTimeout(() => store.hosts[store.hosts.length - 1]?.(), 0);
  };

  if (!current) return null;

  const { title, message, buttons, choices } = current;
  const escape = buttons.find((b) => b.style === 'cancel')
    ?? (buttons.length === 1 ? buttons[0] : undefined);

  return (
    <Dialog visible title={title} message={message} buttons={buttons}
      // Picking one answers the dialog, the same as pressing a button does, so it
      // comes down before the choice's own work runs.
      choices={choices?.map((choice) => ({ ...choice, onPress: () => { dismiss(); choice.onPress(); } }))}
      onAnswer={(button) => dismiss(button)}
      onDismiss={() => dismiss(escape, true)} />
  );
}
