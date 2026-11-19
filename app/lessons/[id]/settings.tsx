import { Card } from '@/components/ui/Card';
import { FieldLabel, fieldGroup, fieldWell } from '@/components/ui/Field';
import { oneLine } from '@/theme/typography';
import { MascotState } from '@/components/mascot/MascotState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { dialog } from '@/lib/dialog';
import { CloseButton, RoundAction } from '@/components/ui/RoundButtons';
import { LessonCover } from '@/components/LessonCover';
import { encodeLessonCover, getStoredLessonCover, knowledgeSymbols, languageSymbols, removeStoredLessonCover, resolveLessonCover, setStoredLessonCover } from '@/lib/lessonCover';
import { lessonCoverPalettes } from '@/theme/colors';
import { LearningModeSelector } from '@/components/ui/LearningModeSelector';
import { LinearGradient } from 'expo-linear-gradient';
import { DeadlineSheet } from '@/components/DeadlineSheet';
import { DesignAsset } from '@/components/DesignAsset';
import { clearCache } from '@/lib/cache';
import { safeBack } from '@/lib/safeBack';
import { supabase } from '@/lib/supabase';
import { space, radius, colors, fonts, layout, type } from '@/theme';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/Button';
import { MascotLoading } from '@/components/mascot/MascotLoading';
import { Field } from '@/components/ui/Field';

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
  const [cardCount, setCardCount] = useState(0);
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
        // Only the count: the deadline sheet needs it to say what a date asks for
        // a day, and nothing on this screen needs the cards themselves.
        const { count } = await supabase.from('terms').select('id', { count: 'exact', head: true }).eq('lesson_id', id);
        if (!active) return;
        setCardCount(count ?? 0);
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
    } catch (failure) { dialog('Could not delete lesson', failure instanceof Error ? failure.message : 'Please try again.'); }
    finally { setDeleting(false); }
  };

  if (loading) return <SafeAreaView style={styles.screen}><MascotLoading /></SafeAreaView>;
  if (loadError) return <SafeAreaView style={styles.screen}>
    <View style={styles.status}>
      <MascotState kind="error" width={160} /><Text style={styles.message}>{loadError}</Text><Button size="md" label="Go back" onPress={goBack} />
    </View>
  </SafeAreaView>;

  return <SafeAreaView style={styles.screen} edges={['top']}>
    <LinearGradient pointerEvents="none" colors={[colors.limePale, colors.limeBright, colors.bg]} style={[styles.headerGradient, { top: -insets.top, height: insets.top + 170 }]} />
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.navigation}>
        <CloseButton onPress={goBack} label="Cancel lesson editing" />
        <Text accessibilityRole="header" style={styles.navTitle}>Edit lesson</Text>
        <RoundAction icon="delete" label="Delete lesson" disabled={busy}
          onPress={() => { Keyboard.dismiss(); setShowDelete(true); }} />
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}>
        {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        <Card pad="lg" gap={space[5]}>
        <View style={[fieldGroup, styles.group]}>
          <FieldLabel>Cover</FieldLabel>
          <View style={styles.coverRow}>
            <LessonCover id={id || ''} mode={learningMode} width={64} height={64} choice={coverChoice} />
            <View style={styles.coverCopy}><Text style={styles.coverTitle}>Make it yours</Text><Text style={styles.coverHint}>Choose a color and icon.</Text></View>
            <Pressable accessibilityRole="button" accessibilityLabel={showCoverPicker ? 'Close cover options' : 'Change cover'} disabled={busy} onPress={() => setShowCoverPicker(!showCoverPicker)} style={styles.coverButton}><Text style={styles.link}>{showCoverPicker ? 'Done' : 'Change'}</Text></Pressable>
          </View>
          {showCoverPicker && <View style={styles.coverOptions}>
            <Text style={styles.coverOptionLabel}>Color</Text>
            <ScrollView showsVerticalScrollIndicator={false} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.coverChoices}>
              {lessonCoverPalettes.map((palette) => <Pressable key={palette.id} accessibilityRole="radio" accessibilityLabel={palette.label} accessibilityState={{ selected: coverChoice.palette === palette.id }} onPress={() => setCoverStyle(encodeLessonCover({ ...coverChoice, palette: palette.id }))} style={[styles.coverChoice, coverChoice.palette === palette.id && styles.coverChoiceSelected]}><LinearGradient colors={palette.colors} style={styles.coverSwatch} /></Pressable>)}
            </ScrollView>
            <Text style={styles.coverOptionLabel}>{learningMode === 'language' ? 'Language' : 'Icon'}</Text>
            <ScrollView showsVerticalScrollIndicator={false} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.coverChoices}>
              {(learningMode === 'language' ? languageSymbols : knowledgeSymbols).map((symbol) => <Pressable key={symbol} accessibilityRole="radio" accessibilityLabel={symbol} accessibilityState={{ selected: coverChoice.symbol === symbol }} onPress={() => setCoverStyle(encodeLessonCover({ ...coverChoice, symbol }))} style={[styles.coverChoice, coverChoice.symbol === symbol && styles.coverChoiceSelected]}><LessonCover id={id || ''} mode={learningMode} width={38} height={38} choice={{ ...coverChoice, symbol }} /></Pressable>)}
            </ScrollView>
          </View>}
        </View>
        <Field label="Lesson Name *" accessibilityLabel="Lesson name, required" placeholder="Enter lesson name"
          value={lessonName} onChangeText={(value) => { setLessonName(value); setError(null); }} editable={!busy} />
        <Field label="Description (optional)" accessibilityLabel="Description, optional" placeholder="Add a description"
          value={description} onChangeText={setDescription} editable={!busy} multiline />
        {/* Shaped like the two fields above it, from the same tokens: it was drawn
            on the canvas colour and came out yellow beside them. */}
        <View style={[fieldGroup, styles.group]}>
          <FieldLabel>Deadline (optional)</FieldLabel>
          <View style={styles.deadlineRow}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Choose deadline, ${deadline ? deadline.toLocaleDateString('en-GB') : 'not set'}`}
              disabled={busy} onPress={() => { Keyboard.dismiss(); setShowDatePicker(true); }} style={[fieldWell, styles.dateField]}>
              <DesignAsset name="editCalendar" />
              <Text style={styles.dateText}>{deadline ? deadline.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not set'}</Text>
              <DesignAsset name="editDown" />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Clear deadline" disabled={busy || !deadline} onPress={() => setDeadline(null)} style={styles.clear}>
              <Text style={[styles.link, !deadline && styles.muted]}>Clear</Text>
            </Pressable>
          </View>
        </View>
        </Card>

        {/* Outside the card, on the page's own ground. Its surface is white and so is
            the card's, so within it the row showed only as its lip. */}
        <View style={styles.modeSection}>
          <Text style={styles.sectionLabel}>Learning mode</Text>
          <LearningModeSelector value={learningMode} onChange={setLearningMode} disabled={busy} />
        </View>
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: Math.max(8, insets.bottom) }]}>
        <Button size="xl" label="Save changes" loading={saving} disabled={busy || !lessonName.trim()} onPress={save} />
      </View>
    </KeyboardAvoidingView>
    <DeadlineSheet visible={showDatePicker} value={deadline} cards={cardCount}
      onClose={() => setShowDatePicker(false)} onConfirm={(date) => { setDeadline(date); setShowDatePicker(false); }} />
    <ConfirmDialog visible={showDelete} title="Delete lesson?" subject={lessonName}
      message="This lesson and its cards will be permanently deleted."
      confirmLabel="Delete lesson" loading={deleting}
      onCancel={() => setShowDelete(false)} onConfirm={deleteLesson} />
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  headerGradient: { position: 'absolute', left: 0, right: 0 },
  flex: { flex: 1 },
  navigation: { paddingHorizontal: layout.screenInline, paddingTop: space[3], minHeight: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navTitle: { ...type.page, color: colors.sub },
  link: { ...type.small, fontFamily: fonts.semibold, color: colors.text },
  save: { width: 80, paddingHorizontal: space[0] },
  content: { paddingHorizontal: layout.screenInline, paddingTop: space[3], paddingBottom: space[6], gap: space[4] },
  footer: { paddingHorizontal: layout.screenInline, paddingTop: space[2] },
  group: { gap: space[2] },
  coverRow: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  coverCopy: { flex: 1, gap: space.hair },
  coverTitle: { ...type.small, fontFamily: fonts.semibold, color: colors.sub },
  coverHint: { ...type.caption, fontFamily: fonts.regular, color: colors.faint },
  coverButton: { minHeight: 44, justifyContent: 'center' },
  coverOptions: { gap: space[2], paddingTop: space[2] },
  coverOptionLabel: { ...type.caption, fontFamily: fonts.semibold, color: colors.faint },
  coverChoices: { gap: space[2], paddingVertical: space.hair },
  coverChoice: { width: 46, height: 46, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.surf },
  coverChoiceSelected: { borderColor: colors.action },
  coverSwatch: { width: 38, height: 38, borderRadius: radius.sm },
  modeSection: { gap: space[2] },
  sectionLabel: { ...type.body, fontFamily: fonts.semibold, color: colors.text },
  deadlineRow: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  dateField: { flex: 1 },
  dateText: { ...oneLine(type.body), color: colors.text, flex: 1 },
  clear: { minHeight: 44, minWidth: 44, justifyContent: 'center' },
  muted: { color: colors.sub },
  deleteSection: { paddingHorizontal: space[1] },
  delete: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: space[2] },
  deleteLabel: { ...type.small, fontFamily: fonts.semibold, color: colors.red },
  status: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: layout.screenInline, gap: space[5] },
  message: { ...type.small, color: colors.text },
  error: { ...type.small, color: colors.red },
});
