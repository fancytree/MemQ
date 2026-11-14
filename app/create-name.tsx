import { MASCOT_HANDS } from '@/components/mascot/figma-parts';
import { MascotCharacter } from '@/components/mascot/MascotCharacter';
import { LearningModeSelector } from '@/components/ui/LearningModeSelector';
import { homeColors } from '@/theme/colors';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { elevation as cardElevation } from '@/theme';
import { layout } from '@/theme/spacing';
import { EdBase } from '@/components/EdBase';
import { SectionLabel } from '@/components/SectionLabel';
import { clearCache } from '@/lib/cache';
import { clearPendingTerms, getPendingLearningMode, getPendingTerms } from '@/lib/createStore';
import { supabase } from '@/lib/supabase';
import { colors, fonts } from '@/theme';
import DateTimePicker from '@react-native-community/datetimepicker';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import {
  Alert,
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';

/** How wide the character stands over the card it is holding. */
const PERCH = 138;

/** Where the card's top edge crosses the character, read off the hands rather than
 *  typed in: a little below their middle, so their lower part laps onto the card and
 *  they read as resting on the edge instead of hovering above it. The sign-in screens
 *  and the first run perch on the same line. */
const HAND_LINE = MASCOT_HANDS.reduce((sum, h) => sum + (h.box[1] + h.box[3]) / 2, 0)
  / MASCOT_HANDS.length / 256;
const CARD_LIFT = -(1 - (HAND_LINE + 7 / 256)) * PERCH;

export default function CreateNameScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  // The card is nested inside the character's box, so it has to be pulled back out to
  // the width it would have had on its own. `body` insets it by 16 a side.
  const bleed = -((width - 32) - PERCH) / 2;
  const [lessonName, setLessonName] = useState('');
  const [description, setDescription] = useState('');
  const [learningMode, setLearningMode] = useState<'language' | 'knowledge'>(getPendingLearningMode());
  const [deadline, setDeadline] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [saving, setSaving] = useState(false);

  const nameInputRef = useRef<TextInput>(null);
  const slideAnim = useRef(new Animated.Value(300)).current;

  const canCreate = lessonName.trim().length > 0;

  const openDatePicker = () => {
    setShowDatePicker(true);
    Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }).start();
  };

  const closeDatePicker = () => {
    slideAnim.setValue(300);
    setShowDatePicker(false);
  };

  const formatDate = (date: Date | null) => {
    if (!date) return null;
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const handleCreate = async () => {
    const name = lessonName.trim();
    if (!name) { Alert.alert('Required', 'Please enter a lesson name.'); return; }
    if (saving) return;

    const terms = getPendingTerms();
    if (!terms || terms.length === 0) {
      Alert.alert('Error', 'No terms found. Please go back and add terms.');
      return;
    }

    setSaving(true);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData.user;
      if (!user) { Alert.alert('Error', 'Please log in first.'); return; }

      const { data: lesson, error: lessonError } = await supabase
        .from('lessons')
        .insert({
          user_id: user.id,
          name,
          description: description.trim() || null,
          deadline: deadline ? deadline.toISOString() : null,
          learning_mode: learningMode,
        })
        .select('id')
        .single();

      if (lessonError || !lesson) {
        Alert.alert('Error', lessonError?.message || 'Failed to create lesson.');
        return;
      }

      const { error: termsError } = await supabase.from('terms').insert(
        terms.map((t) => ({
          lesson_id: lesson.id,
          term: t.term,
          definition: t.definition,
          explanation: t.explanation,
          language_data: learningMode === 'language' ? t.language_data || null : null,
        }))
      );

      if (termsError) {
        Alert.alert('Error', termsError.message || 'Failed to save terms.');
        return;
      }

      clearPendingTerms();
      void clearCache('DASHBOARD', user.id);
      void clearCache('LESSONS', user.id);

      router.replace(`/lessons/${lesson.id}` as any);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSaving(false);
    }
  };

  return (
    <EdBase bottomInset={0} scroll={false}>
      <LinearGradient pointerEvents="none" colors={[homeColors.gradientStart, homeColors.gradientBright, homeColors.canvas]} style={[styles.headerGradient, { top: -insets.top, height: insets.top + 150 }]} />
      {/* Top bar */}
      <View style={styles.topbar}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.topbarSideBtn}>
          <Text style={styles.cancel}>← Back</Text>
        </Pressable>
        <Text style={styles.title}>New Lesson</Text>
        <Pressable accessibilityRole="button"
          onPress={() => void handleCreate()}
          disabled={!canCreate || saving}
          style={styles.topbarSideBtn}
        >
          <Text style={[styles.tag, (!canCreate || saving) && styles.tagDisabled]}>
            {saving ? 'Creating…' : 'Create'}
          </Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Body behind the card, hands over its front edge — the same perch the
              sign-in screens and the first run use. */}
          <MascotCharacter width={PERCH} mood="onboarding" calm style={styles.perch}
            behind={(
          <View style={[styles.formCard, { marginTop: CARD_LIFT, marginLeft: bleed, marginRight: bleed }]}>

            {/* Lesson Name */}
            <View style={styles.inputGroup}>
              <SectionLabel style={styles.label}>
                Lesson Name <Text style={styles.required}>*</Text>
              </SectionLabel>
              <TextInput accessibilityLabel="e.g. French Vocabulary, Biology Ch.3…"
                ref={nameInputRef}
                autoFocus
                style={[styles.input, styles.singleLineInput]}
                value={lessonName}
                onChangeText={setLessonName}
                placeholder="e.g. French Vocabulary, Biology Ch.3…"
                placeholderTextColor={homeColors.placeholder}
                autoCapitalize="words"
                returnKeyType="next"
                maxLength={80}
              />
            </View>

            {/* Description */}
            <View style={styles.inputGroup}>
              <SectionLabel style={styles.label}>Description</SectionLabel>
              <TextInput accessibilityLabel="Enter description (optional)"
                style={[styles.input, styles.textarea]}
                value={description}
                onChangeText={setDescription}
                placeholder="Enter description (optional)"
                placeholderTextColor={homeColors.placeholder}
                multiline
                textAlignVertical="top"
              />
            </View>

            {/* Learning mode */}
            <View style={styles.inputGroup}>
              <SectionLabel style={styles.label}>Learning mode</SectionLabel>
              <LearningModeSelector value={learningMode} onChange={setLearningMode} />
            </View>

            {/* Deadline */}
            <View style={[styles.inputGroup, styles.inputGroupLast]}>
              <View style={styles.labelRow}>
                <SectionLabel style={[styles.label, { marginBottom: 0 }]}>Deadline</SectionLabel>
                {deadline && (
                  <Pressable accessibilityRole="button" onPress={() => setDeadline(null)} style={styles.clearBtn}>
                    <Text style={styles.clearBtnText}>Clear</Text>
                  </Pressable>
                )}
              </View>
              <TouchableOpacity accessibilityRole="button"
                style={[styles.input, styles.singleLineInput, styles.dateBtn]}
                onPress={openDatePicker}
                activeOpacity={0.7}
              >
                <Text style={[styles.dateText, !deadline && styles.datePlaceholder]}>
                  {deadline ? formatDate(deadline) : 'Select deadline (optional)'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
            )} />

          {/* CTA */}
          <Pressable accessibilityRole="button"
            style={[styles.cta, (!canCreate || saving) && styles.ctaDisabled]}
            onPress={() => void handleCreate()}
            disabled={!canCreate || saving}
          >
            <Text style={styles.ctaText}>
              {saving ? 'Creating…' : 'Create Lesson →'}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Date picker */}
      {showDatePicker && Platform.OS === 'ios' && (
        <Modal visible transparent animationType="none" onRequestClose={closeDatePicker}>
          <TouchableOpacity accessibilityRole="button" style={styles.modalOverlay} activeOpacity={1} onPress={closeDatePicker}>
            <Animated.View style={[styles.modalContent, { paddingBottom: Math.max(24, insets.bottom), transform: [{ translateY: slideAnim }] }]}>
              <View style={styles.modalHeader}>
                <TouchableOpacity accessibilityRole="button" onPress={closeDatePicker} style={styles.modalBtn}>
                  <Text style={styles.modalCancel}>Cancel</Text>
                </TouchableOpacity>
                <Text style={styles.modalTitle}>Select Deadline</Text>
                <TouchableOpacity accessibilityRole="button" onPress={closeDatePicker} style={styles.modalBtn}>
                  <Text style={styles.modalDone}>Done</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={deadline || new Date()}
                mode="date"
                display="spinner"
                onChange={(_, d) => d && setDeadline(d)}
                minimumDate={new Date()}
                textColor={colors.text}
                themeVariant="light"
              />
            </Animated.View>
          </TouchableOpacity>
        </Modal>
      )}
      {showDatePicker && Platform.OS === 'android' && (
        <DateTimePicker
          value={deadline || new Date()}
          mode="date"
          display="default"
          onChange={(_, d) => { setShowDatePicker(false); if (d) setDeadline(d); }}
          minimumDate={new Date()}
        />
      )}
    </EdBase>
  );
}

const styles = StyleSheet.create({
  headerGradient: { position: 'absolute', left: 0, right: 0 },
  perch: { alignSelf: 'center' },
  topbar: {
    paddingHorizontal: layout.screenInline, paddingTop: 20, paddingBottom: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    position: 'relative',
  },
  topbarSideBtn: { minHeight: 44, minWidth: 64, zIndex: 2, justifyContent: 'center' },
  cancel: { fontSize: 14, color: homeColors.deep, fontFamily: fonts.medium },
  title: {
    fontSize: 23, lineHeight: 32,
    color: homeColors.deep, fontFamily: fonts.display,
    position: 'absolute', left: 0, right: 0, textAlign: 'center',
  },
  tag: {
    fontSize: 14, lineHeight: 20, color: homeColors.primary,
    fontWeight: '700', fontFamily: fonts.bold, textAlign: 'right',
  },
  tagDisabled: { opacity: 0.45 },

  body: { padding: 16, gap: 12 },

  formCard: {
    backgroundColor: colors.surf,
    borderWidth: 1, borderColor: colors.border, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8, ...cardElevation.card, },
  inputGroup: { marginBottom: 20 },
  inputGroupLast: { marginBottom: 8 },

  label: {
    fontSize: 12, lineHeight: 15.4, letterSpacing: -0.1,
    fontFamily: fonts.medium, fontWeight: '500',
    marginBottom: 8,
  },
  required: { color: colors.red },

  labelRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 8,
  },

  input: { minHeight: 44,
    backgroundColor: homeColors.nav, borderRadius: 14,
    paddingHorizontal: 14, fontSize: 15, lineHeight: 22,
    color: colors.text, fontFamily: fonts.regular,
    borderWidth: 1, borderColor: colors.border,
  },
  singleLineInput: { minHeight: 44, paddingVertical: 12 },
  textarea: { minHeight: 90, paddingVertical: 12, textAlignVertical: 'top' },

  dateBtn: { minHeight: 44, justifyContent: 'center' },
  dateText: { fontSize: 15, lineHeight: 22, color: colors.text, fontFamily: fonts.regular },
  datePlaceholder: { color: colors.muted },

  clearBtn: { minHeight: 44, paddingVertical: 4, paddingHorizontal: 8 },
  clearBtnText: { fontSize: 12, color: colors.red, fontFamily: fonts.semibold },

  switchRow: { flexDirection: 'row', alignItems: 'center' },
  switchDesc: {
    fontSize: 12, lineHeight: 17, color: colors.muted,
    fontFamily: fonts.regular, marginTop: 2,
  },
  switch: {
    width: 50, height: 30, borderRadius: 15,
    backgroundColor: colors.switchTrack, justifyContent: 'center', paddingHorizontal: 2,
  },
  switchActive: { backgroundColor: colors.action },
  switchThumb: {
    width: 26, height: 26, borderRadius: 13, backgroundColor: colors.surf,
  },

  cta: { minHeight: 44,
    backgroundColor: colors.action, borderRadius: 100,
    paddingVertical: 14, alignItems: 'center', boxShadow: `0px 4px 0px ${homeColors.deep}`,
  },
  ctaDisabled: { opacity: 0.45 },
  ctaText: { fontFamily: fonts.bold, fontSize: 15, color: colors.onAction, fontWeight: '700' },

  // Date picker modal
  modalOverlay: {
    flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.surf,
    borderTopLeftRadius: 16, borderTopRightRadius: 16,
    borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1,
    borderColor: colors.border, paddingBottom: 24,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: layout.screenInline, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  modalBtn: { minHeight: 44, paddingVertical: 8, paddingHorizontal: 12 },
  modalTitle: {
    fontSize: 13, color: colors.text,
    fontWeight: '700', fontFamily: fonts.bold,
  },
  modalCancel: { fontSize: 13, color: colors.muted, fontFamily: fonts.medium },
  modalDone: {
    fontSize: 13, color: colors.accentText,
    fontWeight: '700', fontFamily: fonts.bold,
  },
});
