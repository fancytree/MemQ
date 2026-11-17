/**
 * Confirmation for something that cannot be undone.
 *
 * It is components/ui/Dialog with its two choices already decided, because that is
 * the whole of what it adds: the way out is always Cancel, and the other one is
 * always the destructive one. It drew its own card and its own pair of buttons
 * before this — the same card and the same pair the app's dialog host was drawing a
 * few files away, at a different height and a different corner.
 */

import { Dialog } from './Dialog';

export function ConfirmDialog({
  visible, title, subject, message, confirmLabel, loading = false, onCancel, onConfirm,
}: {
  visible: boolean;
  title: string;
  /** What is about to be destroyed, named on its own line. */
  subject?: string;
  message: string;
  confirmLabel: string;
  /** Mid-commit: the confirm button spins and neither choice can be pressed. */
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog visible={visible} title={title} subject={subject} message={message}
      // Not while it is committing: there would be nothing to go back to.
      onDismiss={() => { if (!loading) onCancel(); }}
      buttons={[
        { text: 'Cancel', style: 'cancel', onPress: onCancel },
        { text: confirmLabel, style: 'destructive', onPress: onConfirm, loading },
      ]} />
  );
}
