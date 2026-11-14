import { colors, fonts, layout } from '@/theme';
import { homeColors } from '@/theme/colors';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

type Props = {
  visible: boolean;
  title: string;
  subject?: string;
  message: string;
  confirmLabel: string;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

/** Confirmation for destructive actions; keep the two choices equally accessible. */
export function ConfirmDialog({ visible, title, subject, message, confirmLabel, loading = false, onCancel, onConfirm }: Props) {
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={() => { if (!loading) onCancel(); }}>
    <View style={styles.overlay}>
      <View accessibilityViewIsModal style={styles.cardBase}>
        <View style={styles.card}>
          <View style={styles.copy}>
            <Text accessibilityRole="header" style={styles.title}>{title}</Text>
            {!!subject && <Text style={styles.subject}>{subject}</Text>}
            <Text style={styles.message}>{message}</Text>
          </View>
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" accessibilityLabel="Cancel" disabled={loading} onPress={onCancel} style={({ pressed }) => [styles.button, styles.cancel, (pressed || loading) && styles.dimmed]}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={confirmLabel} accessibilityState={{ disabled: loading, busy: loading }} disabled={loading} onPress={onConfirm} style={({ pressed }) => [styles.button, styles.confirm, pressed && styles.dimmed]}>
              {loading ? <ActivityIndicator color={homeColors.white} /> : <Text numberOfLines={1} adjustsFontSizeToFit style={styles.confirmText}>{confirmLabel}</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: colors.modalScrim, paddingHorizontal: layout.screenInline, justifyContent: 'center' },
  cardBase: { width: '100%', maxWidth: 440, alignSelf: 'center', borderRadius: 28, paddingBottom: 5, backgroundColor: homeColors.border },
  card: { backgroundColor: homeColors.white, borderRadius: 28, padding: 24, gap: 24 },
  copy: { gap: 8 },
  title: { fontFamily: fonts.display, fontSize: 28, lineHeight: 36, color: homeColors.deep },
  subject: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 23, color: homeColors.deep },
  message: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: homeColors.muted },
  actions: { flexDirection: 'row', gap: 10 },
  button: { flex: 1, minWidth: 0, minHeight: 50, paddingHorizontal: 10, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  cancel: { backgroundColor: homeColors.nav },
  confirm: { backgroundColor: colors.red },
  cancelText: { fontFamily: fonts.semibold, fontSize: 15, color: homeColors.deep },
  confirmText: { fontFamily: fonts.semibold, fontSize: 15, color: homeColors.white },
  dimmed: { opacity: 0.6 },
});
