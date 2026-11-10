import { DeadlineSheet } from '@/components/DeadlineSheet';
import { DesignAsset } from '@/components/DesignAsset';
import { ActionButton } from '@/components/ui/ActionButton';
import { clearCache } from '@/lib/cache';
import { safeBack } from '@/lib/safeBack';
import { supabase } from '@/lib/supabase';
import { colors, componentTokens, layout, radius, type } from '@/theme';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

export const options = { headerShown: false };
const modes = [
  { id: 'knowledge', label: 'Knowledge', description: 'Concepts, facts, and explanations.' },
  { id: 'language', label: 'Language', description: 'Words, phrases, pronunciation, and grammar.' },
] as const;

export default function LessonSettingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [lessonName, setLessonName] = useState('');
  const [description, setDescription] = useState('');
  const [deadline, setDeadline] = useState<Date | null>(null);
  const [learningMode, setLearningMode] = useState<'language' | 'knowledge'>('knowledge');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const busy = saving || deleting;
  const goBack = () => safeBack(id ? `/lessons/${id}` : '/(tabs)/library');

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        if (!id) throw new Error('Lesson ID is required');
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('User not authenticated');
        const { data, error: failure } = await supabase.from('lessons').select('*').eq('id', id).eq('user_id', user.id).single();
        if (failure || !data) throw new Error('Failed to load lesson');
        if (!active) return;
        setLessonName(data.name || ''); setDescription(data.description || '');
        setLearningMode(data.learning_mode === 'language' ? 'language' : 'knowledge');
        const date = data.deadline ? new Date(data.deadline) : null;
        setDeadline(date && !Number.isNaN(date.getTime()) ? date : null);
      } catch (failure) { if (active) setLoadError(failure instanceof Error ? failure.message : 'Failed to load lesson'); }
      finally { if (active) setLoading(false); }
    };
    void load();
    return () => { active = false; };
  }, [id]);

  const invalidate = async (userId: string) => {
    await Promise.all([clearCache('LESSON_DETAIL', id), clearCache('DASHBOARD', userId), clearCache('LESSONS', userId)]);
  };
  const save = async () => {
    if (busy || !id) return;
    if (!lessonName.trim()) { setError('Please enter a lesson name.'); return; }
    Keyboard.dismiss(); setSaving(true); setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');
      const { error: failure } = await supabase.from('lessons').update({
        name: lessonName.trim(), description: description.trim() || null,
        learning_mode: learningMode, deadline: deadline?.toISOString() || null,
      }).eq('id', id).eq('user_id', user.id);
      if (failure) throw failure;
      await invalidate(user.id); goBack();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Failed to save lesson.'); }
    finally { setSaving(false); }
  };
  const deleteLesson = async () => {
    if (busy || !id) return;
    setDeleting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');
      const { error: failure } = await supabase.from('lessons').delete().eq('id', id).eq('user_id', user.id);
      if (failure) throw failure;
      await invalidate(user.id); setShowDelete(false);
      router.dismissTo('/(tabs)/library');
    } catch (failure) { Alert.alert('Could not delete lesson', failure instanceof Error ? failure.message : 'Please try again.'); }
    finally { setDeleting(false); }
  };

  if (loading || loadError) return <SafeAreaView style={styles.screen}>
    <View style={styles.status}>
      {loading ? <ActivityIndicator color={colors.text} /> : <><Text style={styles.message}>{loadError}</Text><ActionButton label="Go back" onPress={goBack} /></>}
    </View>
  </SafeAreaView>;

  return <SafeAreaView style={styles.screen} edges={['top']}>
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.navigation}>
        <Pressable accessibilityRole="button" accessibilityLabel="Cancel lesson editing" disabled={busy} onPress={goBack} style={styles.cancel}><Text style={styles.link}>Cancel</Text></Pressable>
        <ActionButton label="Save" loading={saving} disabled={deleting} onPress={save} style={styles.save} />
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(24, insets.bottom) }]}>
        <Text accessibilityRole="header" style={styles.title}>Edit Lesson</Text>
        {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        <View style={styles.group}>
          <Text style={styles.label}>Lesson Name *</Text>
          <TextInput accessibilityLabel="Lesson name, required" placeholder="Enter lesson name" placeholderTextColor={colors.muted}
            value={lessonName} onChangeText={(value) => { setLessonName(value); setError(null); }} editable={!busy} style={styles.input} />
        </View>
        <View style={styles.group}>
          <Text style={styles.label}>Description (optional)</Text>
          <TextInput accessibilityLabel="Description, optional" placeholder="Add a description" placeholderTextColor={colors.muted}
            value={description} onChangeText={setDescription} editable={!busy} multiline textAlignVertical="top" style={[styles.input, styles.description]} />
        </View>
        <View style={styles.group}>
          <Text style={styles.label}>Learning mode</Text>
          {modes.map((mode) => <Pressable key={mode.id} accessibilityRole="radio" accessibilityLabel={`${mode.label}. ${mode.description}`}
            accessibilityState={{ checked: learningMode === mode.id, disabled: busy }} disabled={busy} onPress={() => setLearningMode(mode.id)}
            style={[styles.mode, learningMode === mode.id && styles.selectedMode]}>
            {learningMode === mode.id ? <DesignAsset name="editRadio" /> : <View accessible={false} style={styles.radio} />}
            <View style={styles.modeCopy}><Text style={styles.link}>{mode.label}</Text><Text style={styles.meta}>{mode.description}</Text></View>
          </Pressable>)}
        </View>
        <View style={styles.group}>
          <Text style={styles.label}>Deadline (optional)</Text>
          <View style={styles.deadlineRow}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Choose deadline, ${deadline ? deadline.toLocaleDateString('en-GB') : 'not set'}`}
              disabled={busy} onPress={() => { Keyboard.dismiss(); setShowDatePicker(true); }} style={[styles.input, styles.dateField]}>
              <DesignAsset name="editCalendar" />
              <Text style={styles.dateText}>{deadline ? deadline.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not set'}</Text>
              <DesignAsset name="editDown" />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Clear deadline" disabled={busy || !deadline} onPress={() => setDeadline(null)} style={styles.clear}>
              <Text style={[styles.link, !deadline && styles.muted]}>Clear</Text>
            </Pressable>
          </View>
        </View>
        <View style={styles.deleteSection}>
          <Pressable accessibilityRole="button" accessibilityLabel="Delete lesson" disabled={busy}
            onPress={() => { Keyboard.dismiss(); setShowDelete(true); }} style={styles.delete}>
            <DesignAsset name="editTrash" /><Text style={styles.deleteLabel}>Delete Lesson</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
    <DeadlineSheet visible={showDatePicker} value={deadline} onClose={() => setShowDatePicker(false)} onConfirm={(date) => { setDeadline(date); setShowDatePicker(false); }} />
    <Modal visible={showDelete} transparent animationType="fade" onRequestClose={() => { if (!deleting) setShowDelete(false); }}>
      <View style={styles.dialogOverlay}>
        <View accessibilityViewIsModal style={styles.dialog}>
          <View style={styles.dialogCopy}>
            <Text accessibilityRole="header" style={styles.dialogTitle}>Delete Lesson</Text>
            <Text style={styles.dialogLesson}>{lessonName}</Text>
            <Text style={styles.message}>Are you sure? This cannot be undone.</Text>
          </View>
          <View style={styles.dialogActions}>
            <ActionButton label="Delete Lesson" accessibilityLabel="Confirm delete lesson" loading={deleting} onPress={deleteLesson} />
            <ActionButton label="Cancel" accessibilityLabel="Cancel lesson deletion" secondary disabled={deleting} onPress={() => setShowDelete(false)} />
          </View>
        </View>
      </View>
    </Modal>
  </SafeAreaView>;
}
const t = componentTokens.lessonEditor;
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  navigation: { paddingHorizontal: layout.screenInline, paddingTop: 12, minHeight: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cancel: { minHeight: 44, minWidth: 44, justifyContent: 'center' },
  link: { ...type.controlLink, color: colors.text },
  save: { width: 80, paddingHorizontal: 0 },
  content: { paddingHorizontal: layout.screenInline, paddingTop: 12, gap: t.groupGap },
  title: { ...type.page, color: colors.text },
  group: { gap: 8 },
  label: { ...type.formLabel, color: colors.text },
  input: { ...type.input, minHeight: t.fieldMinHeight, padding: t.fieldPadding, borderRadius: t.fieldRadius, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSubtle, color: colors.text },
  description: { minHeight: t.descriptionMinHeight },
  mode: { minHeight: 64, padding: t.optionPadding, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: t.fieldRadius, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg },
  selectedMode: { borderColor: colors.action, backgroundColor: colors.selectionNeutral },
  radio: { width: t.radioSize, height: t.radioSize, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.controlBorder },
  modeCopy: { flex: 1, gap: 4 },
  meta: { ...type.meta, color: colors.supporting },
  deadlineRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dateField: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  dateText: { ...type.input, color: colors.supporting, flex: 1 },
  clear: { minHeight: 44, minWidth: 44, justifyContent: 'center' },
  muted: { color: colors.muted },
  deleteSection: { paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border },
  delete: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 },
  deleteLabel: { ...type.controlLink, color: colors.supporting },
  status: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: layout.screenInline, gap: 20 },
  message: { ...type.bodyReading, color: colors.text },
  error: { ...type.bodySmall, color: colors.red },
  dialogOverlay: { flex: 1, backgroundColor: colors.modalScrim, paddingHorizontal: layout.screenInline, justifyContent: 'center' },
  dialog: { backgroundColor: colors.bg, padding: t.dialogPadding, borderRadius: t.sheetRadius, gap: 20 },
  dialogCopy: { gap: 12 },
  dialogTitle: { ...type.section, color: colors.text },
  dialogLesson: { ...type.controlLink, color: colors.supporting },
  dialogActions: { gap: 12 },
});
