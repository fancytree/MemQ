import { HomeAsset } from '@/components/HomeAsset';
import { dialog } from '@/lib/dialog';
import { BackButton, ConfirmButton } from '@/components/ui/RoundButtons';
import { MASCOT_HANDS } from '@/components/mascot/figma-parts';
import { MascotCharacter } from '@/components/mascot/MascotCharacter';
import { homeColors } from '@/theme/colors';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { elevation as cardElevation } from '@/theme';
import { ledge } from '@/theme/ledge';
import { sheet } from '@/theme/sheet';
import { layout } from '@/theme/spacing';
import { EdBase } from '@/components/EdBase';
import { SectionLabel } from '@/components/SectionLabel';
import { clearCache } from '@/lib/cache';
import {
  clearPendingTerms, getPendingLearningMode, getPendingSource, getPendingTerms, lessonFromSource,
} from '@/lib/createStore';
import { supabase } from '@/lib/supabase';
import { colors, fonts } from '@/theme';
import DateTimePicker from '@react-native-community/datetimepicker';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import {
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
  // Opened with a suggestion rather than two empty boxes: the person already said
  // what they wanted to learn one screen ago, or picked a file that says it. Both
  // stay editable, and a wrong guess costs a keystroke.
  const [suggested] = useState(() => lessonFromSource(getPendingSource()));
  const [lessonName, setLessonName] = useState(suggested.name);
  const [description, setDescription] = useState(suggested.description);
  // Chosen on the previous screen and carried here with the cards. This page only
  // has to write it onto the lesson; asking for it a second time, one screen later
  // and with the answer already filled in, is asking the same question twice.
  const [learningMode] = useState<'language' | 'knowledge'>(getPendingLearningMode());
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
    if (!name) { dialog('Required', 'Please enter a lesson name.'); return; }
    if (saving) return;

    const terms = getPendingTerms();
    if (!terms || terms.length === 0) {
      dialog('Error', 'No terms found. Please go back and add terms.');
      return;
    }

    setSaving(true);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData.user;
      if (!user) { dialog('Error', 'Please log in first.'); return; }

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
        dialog('Error', lessonError?.message || 'Failed to create lesson.');
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
        dialog('Error', termsError.message || 'Failed to save terms.');
        return;
      }

      clearPendingTerms();
      void clearCache('DASHBOARD', user.id);
      void clearCache('LESSONS', user.id);

      router.replace(`/lessons/${lesson.id}` as any);
    } catch (err) {
      dialog('Error', err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSaving(false);
    }
  };

  return (
    <EdBase bottomInset={0} scroll={false}>
      <LinearGradient pointerEvents="none"
        colors={[homeColors.gradientStart, homeColors.gradientBright, homeColors.gradientSoft, homeColors.canvas]}
        locations={[0, 0.21154, 0.44712, 1]}
        style={[styles.background, { top: -insets.top }]} />
      {/* Two hills, not one: a single one ends on a straight horizontal edge partway
          down, which reads as the background stopping rather than as a landscape. */}
      <View pointerEvents="none" style={[styles.waveBack, { top: 113 - insets.top }]}>
        <HomeAsset name="waveBack" />
      </View>
      <View pointerEvents="none" style={[styles.waveFront, { top: 150 - insets.top }]}>
        <HomeAsset name="waveFront" />
      </View>
      {/* Top bar */}
      <View style={styles.topbar}>
        <BackButton onPress={() => router.back()} label="Back to the first step" />
        <Text style={styles.title}>New Lesson</Text>
        <ConfirmButton onPress={() => void handleCreate()} label="Create lesson"
          disabled={!canCreate} busy={saving} />
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
            <View style={styles.formFace}>

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
                {/* The one field here that opens something instead of taking typing,
                    and nothing else said so: it looked like the two text boxes above
                    it and read as a third one that would not accept a cursor. */}
                <Feather name="calendar" size={18}
                  color={deadline ? homeColors.deep : homeColors.muted} />
              </TouchableOpacity>
            </View>
            </View>
          </View>
            )} />

          {/* CTA */}
          <Pressable accessibilityRole="button"
            style={[styles.cta, (!canCreate || saving) && styles.ctaDisabled]}
            onPress={() => void handleCreate()}
            disabled={!canCreate || saving}
          >
            <View style={styles.ctaFace}>
              <Text style={styles.ctaText}>
                {saving ? 'Creating…' : 'Create Lesson →'}
              </Text>
            </View>
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
  background: { position: 'absolute', left: 0, right: 0, height: 874 },
  waveBack: { position: 'absolute', left: -19 },
  waveFront: { position: 'absolute', left: -19 },
  perch: { alignSelf: 'center' },
  topbar: {
    paddingHorizontal: layout.screenInline, paddingTop: 20, paddingBottom: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    position: 'relative',
  },
  title: {
    fontSize: 23, lineHeight: 32,
    color: homeColors.deep, fontFamily: fonts.display,
    // Centred on the bar rather than between the buttons, so it lies across both —
    // and a label has no business taking their taps.
    position: 'absolute', left: 0, right: 0, textAlign: 'center', pointerEvents: 'none',
  },

  body: { padding: 16, gap: 12 },

  // A shell with a lighter face on it, offset so a band of the shell shows along the
  // bottom edge — the same depth every other raised surface in the app carries. It was
  // a hairline outline and a boxShadow, which is the older style.
  formCard: {
    backgroundColor: homeColors.border, borderRadius: 28, paddingBottom: ledge.raised,
  },
  formFace: {
    backgroundColor: homeColors.white, borderRadius: 28,
    paddingHorizontal: 18, paddingTop: 18, paddingBottom: 10,
  },
  inputGroup: { marginBottom: 20 },
  inputGroupLast: { marginBottom: 8 },

  label: {
    fontFamily: 'Geist_600SemiBold', fontSize: 15, lineHeight: 20,
    letterSpacing: 0, color: homeColors.muted, marginBottom: 8,
  },
  required: { color: colors.red },

  labelRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 8,
  },

  // Canvas, not a bordered box: the field is a well sunk into the card's white face,
  // which is how every other input in the app is drawn.
  input: {
    minHeight: 52, backgroundColor: homeColors.canvas, borderRadius: 16,
    paddingHorizontal: 16, fontSize: 16, lineHeight: 22,
    color: homeColors.darkest, fontFamily: 'Geist_500Medium',
  },
  singleLineInput: { minHeight: 52, paddingVertical: 14 },
  textarea: { minHeight: 96, paddingVertical: 14, textAlignVertical: 'top' },

  dateBtn: {
    minHeight: 52, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', gap: 12,
  },
  dateText: { fontFamily: 'Geist_500Medium', fontSize: 16, lineHeight: 22, color: homeColors.darkest },
  datePlaceholder: { color: homeColors.placeholder },

  clearBtn: { minHeight: 44, paddingVertical: 4, paddingHorizontal: 8 },
  clearBtnText: { fontFamily: 'Geist_600SemiBold', fontSize: 13, color: colors.red },

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

  // The one thing this screen wants pressed, so it carries the deepest lip.
  cta: {
    height: 59 + ledge.lead, borderRadius: 42,
    backgroundColor: homeColors.deep, paddingBottom: ledge.lead,
  },
  ctaFace: {
    flex: 1, borderRadius: 42, backgroundColor: homeColors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  ctaDisabled: { opacity: 0.45 },
  ctaText: {
    fontFamily: 'Geist_500Medium', fontSize: 22, lineHeight: 30, color: homeColors.white,
  },

  // Date picker sheet. Shape and scrim come from theme/sheet.ts, which every sheet
  // in the app now reads, so they stop disagreeing about their own corners.
  modalOverlay: sheet.scrim,
  modalContent: { ...sheet.surface, paddingTop: 18, paddingBottom: 24 },
  modalHeader: sheet.head,
  modalBtn: { minHeight: 44, paddingVertical: 8, justifyContent: 'center' },
  modalTitle: {
    fontFamily: fonts.semibold, fontSize: 17, lineHeight: 24, color: homeColors.darkest,
  },
  modalCancel: { fontFamily: fonts.medium, fontSize: 16, color: homeColors.muted },
  modalDone: { fontFamily: fonts.semibold, fontSize: 16, color: homeColors.primary },
});
