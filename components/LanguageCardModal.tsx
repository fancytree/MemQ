import { layout } from '@/theme/spacing';
import { CloseButton } from '@/components/ui/RoundButtons';
import { sheet as sheetShape } from '@/theme/sheet';
import { fonts } from '@/theme/typography';
import { LanguageCardDetails, PlayButton } from '@/components/LanguageCardFields';
import { hasLanguageData, languageDataFromLegacyExplanation, normalizeLanguageData } from '@/lib/languageCard';
import { colors, type } from '@/theme';
import { Feather } from '@expo/vector-icons';
import React, { useEffect, useRef } from 'react';
import { Animated, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface LanguageTerm {
  id: string;
  term: string;
  definition: string;
  explanation: string | null;
  language_data?: unknown;
}

export function LanguageCardModal({ term, onClose, isLanguage = true, onEdit, onDelete }: {
  term: LanguageTerm | null;
  onClose: () => void;
  isLanguage?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const cardProgress = useRef(new Animated.Value(0)).current;
  const closing = useRef(false);

  useEffect(() => {
    if (!term) return;
    closing.current = false;
    backdropOpacity.setValue(0);
    cardProgress.setValue(0);
    Animated.parallel([
      Animated.timing(backdropOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.spring(cardProgress, { toValue: 1, damping: 23, stiffness: 260, mass: 0.9, useNativeDriver: true }),
    ]).start();
  }, [term?.id, backdropOpacity, cardProgress]);

  const close = (afterClose?: () => void) => {
    if (closing.current) return;
    closing.current = true;
    Animated.parallel([
      Animated.timing(backdropOpacity, { toValue: 0, duration: 170, useNativeDriver: true }),
      Animated.timing(cardProgress, { toValue: 0, duration: 190, useNativeDriver: true }),
    ]).start(() => { onClose(); afterClose?.(); });
  };

  const legacyData = languageDataFromLegacyExplanation(term?.explanation);
  const data = term?.language_data ? normalizeLanguageData(term.language_data) : legacyData;
  const showExplanation = !!term?.explanation?.trim() && (!isLanguage || !hasLanguageData(legacyData));

  return (
    <Modal visible={!!term} transparent animationType="none" statusBarTranslucent onRequestClose={() => close()}>
      <View style={styles.overlay}>
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]} />
        <Pressable accessibilityRole="button" style={StyleSheet.absoluteFill} onPress={() => close()} accessibilityLabel="Close card details" />
        <Animated.View
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom, 18) },
            {
              opacity: cardProgress,
              transform: [
                { translateY: cardProgress.interpolate({ inputRange: [0, 1], outputRange: [65, 0] }) },
                { scale: cardProgress.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
              ],
            },
          ]}
        >
          <View style={styles.handle} />
          <View style={styles.topRow}>
            <Text style={styles.eyebrow}>{isLanguage ? 'LANGUAGE CARD' : 'CARD DETAILS'}</Text>
            <View style={styles.headerActions}>
              {!!onDelete && <Pressable accessibilityRole="button" accessibilityLabel="Delete card" onPress={onDelete} style={styles.closeButton}>
                <Feather name="trash-2" size={20} color={colors.red} />
              </Pressable>}
              <CloseButton onPress={() => close()} label="Close card" size={20} />
            </View>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            <Text style={styles.term}>{term?.term}</Text>
            {isLanguage && !!term && <View style={styles.pronunciationRow}>
              {!!data.pronunciation && <Text style={styles.pronunciation}>{data.pronunciation}</Text>}
              <PlayButton iconOnly iconSize={24} text={term.term} languageCode={data.language_code} label={`Play ${term.term}`} />
            </View>}
            <View style={styles.definitionBox}>
              <Text style={styles.sectionLabel}>Definition</Text>
              <Text style={styles.definition}>{term?.definition}</Text>
            </View>
            {showExplanation && (
              <View style={styles.noteBox}>
                <Text style={styles.sectionLabel}>Usage note</Text>
                <Text style={styles.note}>{term?.explanation}</Text>
              </View>
            )}
            {isLanguage && !!term && <LanguageCardDetails data={{ ...data, pronunciation: '' }} term={term.term} showTermPlay={false} />}
            {!isLanguage && !!onEdit && <View style={styles.actions}>
              {!isLanguage && !!onEdit && <Pressable accessibilityRole="button" accessibilityLabel="Edit card" onPress={() => close(onEdit)} style={styles.action}>
                <Feather name="edit-2" size={18} color={colors.text} /><Text style={styles.actionLabel}>Edit</Text>
              </Pressable>}
            </View>}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: 12, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 16, marginTop: 24 },
  action: { flex: 1, minHeight: 44, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: colors.surfaceSubtle },
  actionLabel: { ...type.controlLink, color: colors.text },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.modalScrim },
  sheet: {
    ...sheetShape.surface,
    maxHeight: '88%',
    paddingHorizontal: layout.screenInline,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0,
    shadowRadius: 24,
    elevation: 0,
  },
  handle: { alignSelf: 'center', width: 38, height: 4, borderRadius: 4, backgroundColor: colors.dim, marginTop: 10, marginBottom: 12 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { color: colors.accentText, fontSize: 12, fontWeight: '700', letterSpacing: 1.4 },
  closeButton: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 17, backgroundColor: colors.bg },
  scrollContent: { paddingBottom: 20 },
  term: { color: colors.text, fontSize: 36, lineHeight: 44, fontWeight: '700', fontFamily: fonts.bold, marginTop: 12 },
  pronunciationRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginTop: 3 },
  pronunciation: { color: colors.muted, fontSize: 17, fontFamily: fonts.regular, flexShrink: 1 },
  definitionBox: { backgroundColor: colors.accentL, borderRadius: 17, padding: 17, marginTop: 20 },
  sectionLabel: { ...type.detailLabel, color: colors.text, marginBottom: 10 },
  definition: { ...type.body, color: colors.text },
  noteBox: { marginTop: 17, paddingLeft: 13, borderLeftWidth: 2, borderLeftColor: colors.border },
  note: { ...type.body, color: colors.text },
});
