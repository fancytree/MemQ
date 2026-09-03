import { EdBase } from '@/components/EdBase';
import { SectionLabel } from '@/components/SectionLabel';
import { clearCache } from '@/lib/cache';
import { clearPendingTerms, getPendingTerms } from '@/lib/createStore';
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
  View,
} from 'react-native';

export default function CreateNameScreen() {
  const [lessonName, setLessonName] = useState('');
  const [description, setDescription] = useState('');
  const [isVocabMode, setIsVocabMode] = useState(false);
  const [deadline, setDeadline] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [saving, setSaving] = useState(false);

  const nameInputRef = useRef<TextInput>(null);
  const slideAnim = useRef(new Animated.Value(300)).current;
  const switchAnim = useRef(new Animated.Value(0)).current;

  const canCreate = lessonName.trim().length > 0;

  const openDatePicker = () => {
    setShowDatePicker(true);
    Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }).start();
  };

  const closeDatePicker = () => {
    slideAnim.setValue(300);
    setShowDatePicker(false);
  };

  const toggleVocabMode = () => {
    const next = !isVocabMode;
    setIsVocabMode(next);
    Animated.spring(switchAnim, { toValue: next ? 1 : 0, useNativeDriver: true, tension: 100, friction: 8 }).start();
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
          is_vocab_mode: isVocabMode,
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
      {/* Top bar */}
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()} style={styles.topbarSideBtn}>
          <Text style={styles.cancel}>← Back</Text>
        </Pressable>
        <Text style={styles.title}>New Lesson</Text>
        <Pressable
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
          <View style={styles.formCard}>

            {/* Lesson Name */}
            <View style={styles.inputGroup}>
              <SectionLabel style={styles.label}>
                Lesson Name <Text style={styles.required}>*</Text>
              </SectionLabel>
              <TextInput
                ref={nameInputRef}
                autoFocus
                style={[styles.input, styles.singleLineInput]}
                value={lessonName}
                onChangeText={setLessonName}
                placeholder="e.g. French Vocabulary, Biology Ch.3…"
                placeholderTextColor={colors.muted}
                autoCapitalize="words"
                returnKeyType="next"
                maxLength={80}
              />
            </View>

            {/* Description */}
            <View style={styles.inputGroup}>
              <SectionLabel style={styles.label}>Description</SectionLabel>
              <TextInput
                style={[styles.input, styles.textarea]}
                value={description}
                onChangeText={setDescription}
                placeholder="Enter description (optional)"
                placeholderTextColor={colors.muted}
                multiline
                textAlignVertical="top"
              />
            </View>

            {/* Vocabulary Mode */}
            <View style={styles.inputGroup}>
              <View style={styles.switchRow}>
                <View style={{ flex: 1, marginRight: 16 }}>
                  <SectionLabel style={styles.label}>Vocabulary Mode</SectionLabel>
                  <Text style={styles.switchDesc}>For words and phrases only. Not for grammar.</Text>
                </View>
                <TouchableOpacity
                  style={[styles.switch, isVocabMode && styles.switchActive]}
                  onPress={toggleVocabMode}
                  activeOpacity={0.8}
                >
                  <Animated.View
                    style={[
                      styles.switchThumb,
                      {
                        transform: [{
                          translateX: switchAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 20] }),
                        }],
                      },
                    ]}
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* Deadline */}
            <View style={[styles.inputGroup, styles.inputGroupLast]}>
              <View style={styles.labelRow}>
                <SectionLabel style={[styles.label, { marginBottom: 0 }]}>Deadline</SectionLabel>
                {deadline && (
                  <Pressable onPress={() => setDeadline(null)} style={styles.clearBtn}>
                    <Text style={styles.clearBtnText}>Clear</Text>
                  </Pressable>
                )}
              </View>
              <TouchableOpacity
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

          {/* CTA */}
          <Pressable
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
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={closeDatePicker}>
            <Animated.View style={[styles.modalContent, { transform: [{ translateY: slideAnim }] }]}>
              <View style={styles.modalHeader}>
                <TouchableOpacity onPress={closeDatePicker} style={styles.modalBtn}>
                  <Text style={styles.modalCancel}>Cancel</Text>
                </TouchableOpacity>
                <Text style={styles.modalTitle}>Select Deadline</Text>
                <TouchableOpacity onPress={closeDatePicker} style={styles.modalBtn}>
                  <Text style={styles.modalDone}>Done</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={deadline || new Date()}
                mode="date"
                display="spinner"
                onChange={(_, d) => d && setDeadline(d)}
                minimumDate={new Date()}
                textColor="#111827"
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
  topbar: {
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    position: 'relative', borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  topbarSideBtn: { minWidth: 64, zIndex: 2 },
  cancel: { fontSize: 13, color: colors.muted, fontFamily: fonts.grotesk },
  title: {
    fontSize: 16, lineHeight: 22.4, fontWeight: '400', letterSpacing: -0.1,
    color: colors.text, fontFamily: 'JetBrainsMono_800',
    position: 'absolute', left: 0, right: 0, textAlign: 'center',
  },
  tag: {
    fontSize: 13, lineHeight: 18, letterSpacing: -0.1, color: colors.accent,
    fontWeight: '400', fontFamily: 'JetBrainsMono_700', textAlign: 'right',
  },
  tagDisabled: { opacity: 0.45 },

  body: { padding: 16, gap: 12 },

  formCard: {
    backgroundColor: colors.surf,
    borderWidth: 1, borderColor: colors.border, borderRadius: 10,
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8,
  },
  inputGroup: { marginBottom: 20 },
  inputGroupLast: { marginBottom: 8 },

  label: {
    fontSize: 11, lineHeight: 15.4, letterSpacing: -0.1,
    fontFamily: 'JetBrainsMono_500', fontWeight: '400',
    marginBottom: 8,
  },
  required: { color: colors.red },

  labelRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 8,
  },

  input: {
    backgroundColor: colors.bg, borderRadius: 8,
    paddingHorizontal: 14, fontSize: 15, lineHeight: 22,
    color: colors.text, fontFamily: 'JetBrainsMono_400',
    borderWidth: 1, borderColor: colors.border,
  },
  singleLineInput: { paddingVertical: 12 },
  textarea: { minHeight: 90, paddingVertical: 12, textAlignVertical: 'top' },

  dateBtn: { justifyContent: 'center' },
  dateText: { fontSize: 15, lineHeight: 22, color: colors.text, fontFamily: 'JetBrainsMono_400' },
  datePlaceholder: { color: colors.muted },

  clearBtn: { paddingVertical: 4, paddingHorizontal: 8 },
  clearBtnText: { fontSize: 12, color: colors.red, fontFamily: 'JetBrainsMono_600' },

  switchRow: { flexDirection: 'row', alignItems: 'center' },
  switchDesc: {
    fontSize: 12, lineHeight: 17, color: colors.muted,
    fontFamily: 'JetBrainsMono_400', marginTop: 2,
  },
  switch: {
    width: 50, height: 30, borderRadius: 15,
    backgroundColor: colors.dim, justifyContent: 'center', paddingHorizontal: 2,
  },
  switchActive: { backgroundColor: colors.accent },
  switchThumb: {
    width: 26, height: 26, borderRadius: 13, backgroundColor: '#FFFFFF',
  },

  cta: {
    backgroundColor: colors.accent, borderRadius: 10,
    paddingVertical: 14, alignItems: 'center',
  },
  ctaDisabled: { opacity: 0.45 },
  ctaText: { fontFamily: 'JetBrainsMono_700', fontSize: 15, color: '#fff', fontWeight: '400' },

  // Date picker modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.surf,
    borderTopLeftRadius: 16, borderTopRightRadius: 16,
    borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1,
    borderColor: colors.border, paddingBottom: 24,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  modalBtn: { paddingVertical: 8, paddingHorizontal: 12 },
  modalTitle: {
    fontSize: 13, color: colors.text,
    fontWeight: '400', fontFamily: 'JetBrainsMono_700',
  },
  modalCancel: { fontSize: 13, color: colors.muted, fontFamily: 'JetBrainsMono_500' },
  modalDone: {
    fontSize: 13, color: colors.accent,
    fontWeight: '400', fontFamily: 'JetBrainsMono_700',
  },
});
