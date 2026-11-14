import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { CloseButton, RoundAction } from '@/components/ui/RoundButtons';
import { LessonCover } from '@/components/LessonCover';
import { encodeLessonCover, getStoredLessonCover, knowledgeSymbols, languageSymbols, removeStoredLessonCover, resolveLessonCover, setStoredLessonCover } from '@/lib/lessonCover';
import { lessonCoverPalettes } from '@/theme/colors';
import { LearningModeSelector } from '@/components/ui/LearningModeSelector';
import { homeColors } from '@/theme/colors';
import { ledge } from '@/theme/ledge';
import { LinearGradient } from 'expo-linear-gradient';
import { DeadlineSheet } from '@/components/DeadlineSheet';
import { DesignAsset } from '@/components/DesignAsset';
import { ActionButton } from '@/components/ui/ActionButton';
import { clearCache } from '@/lib/cache';
import { safeBack } from '@/lib/safeBack';
import { supabase } from '@/lib/supabase';
import { colors, componentTokens, fonts, layout, type } from '@/theme';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

export const options = { headerShown: false };


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
  const [coverStyle, setCoverStyle] = useState<string | null>(null);
  const [coverSupported, setCoverSupported] = useState(false);
  const [showCoverPicker, setShowCoverPicker] = useState(false);
  const coverChoice = resolveLessonCover(id || '', learningMode, coverStyle);
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
        const localCover = data.cover_style ? null : await getStoredLessonCover(id);
        if (!active) return;
        setCoverSupported(Object.prototype.hasOwnProperty.call(data, 'cover_style'));
        setCoverStyle(data.cover_style || localCover);
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
        ...(coverSupported ? { cover_style: encodeLessonCover(coverChoice) } : {}),
      }).eq('id', id).eq('user_id', user.id);
      if (failure) throw failure;
      if (coverSupported) await removeStoredLessonCover(id);
      else await setStoredLessonCover(id, encodeLessonCover(coverChoice));
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
    <LinearGradient pointerEvents="none" colors={[homeColors.gradientStart, homeColors.gradientBright, homeColors.canvas]} style={[styles.headerGradient, { top: -insets.top, height: insets.top + 170 }]} />
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.navigation}>
        <CloseButton onPress={goBack} label="Cancel lesson editing" />
        <Text accessibilityRole="header" style={styles.navTitle}>Edit lesson</Text>
        <RoundAction icon="trash-2" label="Delete lesson" disabled={busy}
          onPress={() => { Keyboard.dismiss(); setShowDelete(true); }} />
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}>
        {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        <View style={styles.formBase}><View style={styles.formCard}>
        <View style={styles.group}>
          <Text style={styles.label}>Cover</Text>
          <View style={styles.coverRow}>
            <LessonCover id={id || ''} mode={learningMode} width={64} height={64} choice={coverChoice} />
            <View style={styles.coverCopy}><Text style={styles.coverTitle}>Make it yours</Text><Text style={styles.coverHint}>Choose a color and icon.</Text></View>
            <Pressable accessibilityRole="button" accessibilityLabel={showCoverPicker ? 'Close cover options' : 'Change cover'} disabled={busy} onPress={() => setShowCoverPicker(!showCoverPicker)} style={styles.coverButton}><Text style={styles.link}>{showCoverPicker ? 'Done' : 'Change'}</Text></Pressable>
          </View>
          {showCoverPicker && <View style={styles.coverOptions}>
            <Text style={styles.coverOptionLabel}>Color</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.coverChoices}>
              {lessonCoverPalettes.map((palette) => <Pressable key={palette.id} accessibilityRole="radio" accessibilityLabel={palette.label} accessibilityState={{ selected: coverChoice.palette === palette.id }} onPress={() => setCoverStyle(encodeLessonCover({ ...coverChoice, palette: palette.id }))} style={[styles.coverChoice, coverChoice.palette === palette.id && styles.coverChoiceSelected]}><LinearGradient colors={palette.colors} style={styles.coverSwatch} /></Pressable>)}
            </ScrollView>
            <Text style={styles.coverOptionLabel}>{learningMode === 'language' ? 'Language' : 'Icon'}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.coverChoices}>
              {(learningMode === 'language' ? languageSymbols : knowledgeSymbols).map((symbol) => <Pressable key={symbol} accessibilityRole="radio" accessibilityLabel={symbol} accessibilityState={{ selected: coverChoice.symbol === symbol }} onPress={() => setCoverStyle(encodeLessonCover({ ...coverChoice, symbol }))} style={[styles.coverChoice, coverChoice.symbol === symbol && styles.coverChoiceSelected]}><LessonCover id={id || ''} mode={learningMode} width={38} height={38} choice={{ ...coverChoice, symbol }} /></Pressable>)}
            </ScrollView>
          </View>}
        </View>
        <View style={styles.group}>
          <Text style={styles.label}>Lesson Name *</Text>
          <TextInput accessibilityLabel="Lesson name, required" placeholder="Enter lesson name" placeholderTextColor={homeColors.placeholder}
            value={lessonName} onChangeText={(value) => { setLessonName(value); setError(null); }} editable={!busy} style={styles.input} />
        </View>
        <View style={styles.group}>
          <Text style={styles.label}>Description (optional)</Text>
          <TextInput accessibilityLabel="Description, optional" placeholder="Add a description" placeholderTextColor={homeColors.placeholder}
            value={description} onChangeText={setDescription} editable={!busy} multiline textAlignVertical="top" style={[styles.input, styles.description]} />
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
        </View></View>

        {/* Outside the card, on the page's own ground. Its surface is white and so is
            the card's, so within it the row showed only as its lip. */}
        <View style={styles.modeSection}>
          <Text style={styles.sectionLabel}>Learning mode</Text>
          <LearningModeSelector value={learningMode} onChange={setLearningMode} disabled={busy} />
        </View>
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: Math.max(8, insets.bottom) }]}>
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy || !lessonName.trim(), busy: saving }} disabled={busy || !lessonName.trim()} onPress={save} style={[styles.saveBase, (busy || !lessonName.trim()) && styles.saveDisabled]}><View style={styles.saveFace}>{saving ? <ActivityIndicator color={homeColors.white} /> : <Text style={styles.saveText}>Save changes</Text>}</View></Pressable>
      </View>
    </KeyboardAvoidingView>
    <DeadlineSheet visible={showDatePicker} value={deadline} onClose={() => setShowDatePicker(false)} onConfirm={(date) => { setDeadline(date); setShowDatePicker(false); }} />
    <ConfirmDialog visible={showDelete} title="Delete lesson?" subject={lessonName}
      message="This lesson and its cards will be permanently deleted."
      confirmLabel="Delete lesson" loading={deleting}
      onCancel={() => setShowDelete(false)} onConfirm={deleteLesson} />
  </SafeAreaView>;
}
const t = componentTokens.lessonEditor;
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  headerGradient: { position: 'absolute', left: 0, right: 0 },
  flex: { flex: 1 },
  navigation: { paddingHorizontal: layout.screenInline, paddingTop: 12, minHeight: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navTitle: { fontFamily: fonts.display, fontSize: 23, lineHeight: 32, color: homeColors.deep },
  link: { ...type.controlLink, color: colors.text },
  save: { width: 80, paddingHorizontal: 0 },
  content: { paddingHorizontal: layout.screenInline, paddingTop: 12, paddingBottom: 24, gap: 16 },
  formBase: { borderRadius: 28, backgroundColor: homeColors.border, paddingBottom: ledge.raised },
  formCard: { borderRadius: 28, backgroundColor: homeColors.white, padding: 20, gap: 20 },
  footer: { paddingHorizontal: layout.screenInline, paddingTop: 8 },
  saveBase: { height: 59 + ledge.lead, borderRadius: 42, backgroundColor: homeColors.deep, paddingBottom: ledge.lead },
  saveFace: { flex: 1, borderRadius: 42, backgroundColor: homeColors.primary, alignItems: 'center', justifyContent: 'center' },
  saveText: { fontFamily: fonts.medium, fontSize: 22, lineHeight: 30, color: homeColors.white },
  saveDisabled: { opacity: 0.45 },
  group: { gap: 8 },
  coverRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  coverCopy: { flex: 1, gap: 3 },
  coverTitle: { fontFamily: fonts.semibold, fontSize: 15, color: homeColors.deep },
  coverHint: { fontFamily: fonts.regular, fontSize: 13, color: homeColors.muted },
  coverButton: { minHeight: 44, justifyContent: 'center' },
  coverOptions: { gap: 8, paddingTop: 8 },
  coverOptionLabel: { fontFamily: fonts.semibold, fontSize: 13, color: homeColors.muted },
  coverChoices: { gap: 8, paddingVertical: 2 },
  coverChoice: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: homeColors.white },
  coverChoiceSelected: { borderColor: homeColors.primary },
  coverSwatch: { width: 38, height: 38, borderRadius: 10 },
  label: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20, color: homeColors.muted },
  // A well sunk into the card's face, not a bordered box — the same field the create
  // screens use.
  input: {
    minHeight: 52, borderRadius: 16, backgroundColor: homeColors.canvas,
    paddingHorizontal: 16, paddingVertical: 14,
    fontFamily: fonts.medium, fontSize: 16, lineHeight: 22, color: homeColors.darkest,
  },
  description: { minHeight: 96 },
  modeSection: { gap: 10 },
  sectionLabel: {
    fontFamily: fonts.semibold, fontSize: 18, lineHeight: 24, color: homeColors.darkest,
  },
  deadlineRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dateField: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  dateText: { fontFamily: fonts.medium, fontSize: 16, color: homeColors.darkest, flex: 1 },
  clear: { minHeight: 44, minWidth: 44, justifyContent: 'center' },
  muted: { color: colors.muted },
  deleteSection: { paddingHorizontal: 4 },
  delete: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 },
  deleteLabel: { ...type.controlLink, color: colors.red },
  status: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: layout.screenInline, gap: 20 },
  message: { ...type.bodyReading, color: colors.text },
  error: { ...type.bodySmall, color: colors.red },
});
