import { Icon } from '@/components/ui/Icon';
import { oneLine } from '@/theme/typography';
import { DeadlineSheet } from '@/components/DeadlineSheet';
import { Card } from '@/components/ui/Card';
import { Field, FieldLabel, fieldGroup, fieldWell } from '@/components/ui/Field';
import { HomeAsset } from '@/components/HomeAsset';
import { dialog } from '@/lib/dialog';
import { BackButton, ConfirmButton } from '@/components/ui/RoundButtons';
import { MascotRig, RIG_HAND_LINE } from '@/components/mascot/rig/MascotRig';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { space, radius, type } from '@/theme';
import { ledge } from '@/theme/ledge';
import { layout } from '@/theme/spacing';
import { EdBase } from '@/components/EdBase';
import { clearCache } from '@/lib/cache';
import {
  clearPendingTerms, getPendingLearningMode, getPendingSource, getPendingTerms, lessonFromSource,
} from '@/lib/createStore';
import { supabase } from '@/lib/supabase';
import { asImported, saveImport } from '@/lib/cardImport';
import { notHeld } from '@/lib/lessonMatch';
import type { LessonChoice } from '@/lib/chatDrafts';
import { LessonNameField } from '@/components/LessonNameField';
import { colors, fonts } from '@/theme';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import {
  KeyboardAvoidingView,
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
const HAND_LINE = RIG_HAND_LINE;
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


  /* Where the cards go. Usually a new lesson, named here — but the name box also
   * finds the lessons they already have (components/LessonNameField, the same
   * box the chat asks this with), for the person who made cards and then saw
   * they belong with an old one. With one picked, this page stops being about a
   * new lesson: its description and deadline are that lesson's own business and
   * are not asked for. */
  const [existing, setExisting] = useState<LessonChoice | null>(null);
  const [cardCount] = useState(() => getPendingTerms()?.length ?? 0);
  const canCreate = !!existing || lessonName.trim().length > 0;
  const action = existing ? 'Add to lesson' : cardCount ? `Save ${cardCount} ${cardCount === 1 ? 'card' : 'cards'}` : 'Create lesson';

  const addToExisting = async (lesson: LessonChoice) => {
    const terms = getPendingTerms() ?? [];
    setSaving(true);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData.user;
      if (!user) { dialog('Error', 'Please log in first.'); return; }
      // A card the lesson already has is not added again: this is where the same
      // card arrives twice.
      const { data: held, error: heldError } = await supabase.from('terms').select('term').eq('lesson_id', lesson.id).limit(5000);
      if (heldError) { dialog('Error', 'That lesson could not be opened just now. Try again in a moment.'); return; }
      const fresh = notHeld(terms, ((held ?? []) as { term: unknown }[]).map((row) => (typeof row.term === 'string' ? row.term : '')));
      // The lesson is one kind or the other, and the cards go in as its kind.
      const mode = lesson.learning_mode ?? learningMode;
      if (fresh.length) {
        await saveImport(supabase as never, asImported(fresh), { kind: 'existing', lesson_id: lesson.id, learning_mode: mode });
      }
      clearPendingTerms();
      void clearCache('DASHBOARD', user.id);
      void clearCache('LESSONS', user.id);
      void clearCache('LESSON_DETAIL', lesson.id);
      const skipped = terms.length - fresh.length;
      if (skipped) {
        dialog(fresh.length ? 'Added' : 'Already there',
          fresh.length
            ? `${fresh.length} added. ${skipped} ${skipped === 1 ? 'was' : 'were'} already in “${lesson.name}”.`
            : `“${lesson.name}” already has ${terms.length === 1 ? 'this card' : 'all of these cards'}.`);
      }
      router.replace(`/lessons/${lesson.id}` as any);
    } catch (err) {
      dialog('Error', err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (date: Date | null) => {
    if (!date) return null;
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const handleCreate = async () => {
    if (saving) return;
    if (existing) return addToExisting(existing);
    const name = lessonName.trim();
    if (!name) { dialog('Required', 'Please enter a lesson name.'); return; }
    if (saving) return;

    // A lesson may start empty — see the note on handleSavePress in app/create.
    const terms = getPendingTerms() ?? [];

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

      if (terms.some((t) => t.questions?.length)) {
        // Cards pasted in from the person's own AI come with their questions, and
        // are saved with them (lib/cardImport): the same database functions the MCP
        // endpoint writes through, which take the plain cards beside them as well.
        await saveImport(supabase as never, asImported(terms), { kind: 'existing', lesson_id: lesson.id, learning_mode: learningMode });
      } else if (terms.length > 0) {
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
        colors={[colors.limePale, colors.limeBright, colors.limeSurface, colors.bg]}
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
        <Text style={styles.title}>{cardCount ? 'Save Cards' : 'New Lesson'}</Text>
        <ConfirmButton onPress={() => void handleCreate()} label={action}
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
          <MascotRig width={PERCH} mood="onboarding" calm style={styles.perch}
            behind={(
          <Card pad="none" gap={0} style={[styles.formCard, { marginTop: CARD_LIFT, marginLeft: bleed, marginRight: bleed }]}>
            <View style={styles.formFace}>

            <LessonNameField
              label={<>Lesson <Text style={styles.required}>*</Text></>}
              autoFocus
              value={lessonName}
              onChangeText={setLessonName}
              chosen={existing}
              onChoose={setExisting}
              // With no cards there is nothing to add to a lesson they have.
              search={cardCount > 0}
              style={existing ? styles.inputGroupLast : styles.inputGroup}
            />

            {!existing && <Field label="Description"
              accessibilityLabel="Enter description (optional)"
              value={description}
              onChangeText={setDescription}
              placeholder="Enter description (optional)"
              multiline
              style={styles.inputGroup}
            />}

            {/* Shaped like the two fields above it, because it belongs with them —
                but it opens a picker instead of taking a cursor, which is what the
                calendar glyph is there to say. */}
            {!existing && <View style={[fieldGroup, styles.inputGroup, styles.inputGroupLast]}>
              <View style={styles.labelRow}>
                <FieldLabel>Deadline</FieldLabel>
                {deadline && (
                  <Pressable accessibilityRole="button" onPress={() => setDeadline(null)} style={styles.clearBtn}>
                    <Text style={styles.clearBtnText}>Clear</Text>
                  </Pressable>
                )}
              </View>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Deadline"
                style={[fieldWell, styles.dateBtn]}
                onPress={() => setShowDatePicker(true)}
                activeOpacity={0.7}
              >
                <Text style={[styles.dateText, !deadline && styles.datePlaceholder]}>
                  {deadline ? formatDate(deadline) : 'Select deadline (optional)'}
                </Text>
                <Icon name="calendar" size={18}
                  color={deadline ? colors.sub : colors.faint} />
              </TouchableOpacity>
            </View>}
            </View>
          </Card>
            )} />

          {/* CTA */}
          <Button size="xl"
            label={saving ? 'Saving…' : `${action} →`}
            onPress={() => void handleCreate()}
            disabled={!canCreate || saving}
          />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* The same sheet the lesson's own settings use: one way to pick a deadline,
          not a hand-rolled spinner here and a calendar there. */}
      <DeadlineSheet visible={showDatePicker} value={deadline}
        onClose={() => setShowDatePicker(false)}
        onConfirm={(date) => { setDeadline(date); setShowDatePicker(false); }} />
    </EdBase>
  );
}

const styles = StyleSheet.create({
  background: { position: 'absolute', left: 0, right: 0, height: 874 },
  waveBack: { position: 'absolute', left: -19 },
  waveFront: { position: 'absolute', left: -19 },
  perch: { alignSelf: 'center' },
  topbar: {
    paddingHorizontal: layout.screenInline, paddingTop: space[5], paddingBottom: space[4],
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    position: 'relative',
  },
  title: {
    ...oneLine(type.page),
    color: colors.sub,
    // Centred on the bar rather than between the buttons, so it lies across both —
    // and a label has no business taking their taps.
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    pointerEvents: 'none',
  },

  body: { padding: space[4], gap: space[3] },

  formCard: {},
  formFace: { paddingHorizontal: space[4], paddingTop: space[4], paddingBottom: space[2] },
  inputGroup: { marginBottom: space[5] },
  inputGroupLast: { marginBottom: space[2] },

  required: { color: colors.red },

  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },


  dateBtn: { justifyContent: 'space-between' },
  dateText: { ...type.body, flex: 1, color: colors.text },
  datePlaceholder: { color: colors.placeholder },

  clearBtn: { minHeight: 44, paddingVertical: space[1], paddingHorizontal: space[2] },
  clearBtnText: { ...type.caption, fontFamily: 'Geist_600SemiBold', color: colors.red },

  switchRow: { flexDirection: 'row', alignItems: 'center' },
  switchDesc: {
    ...type.caption, fontFamily: fonts.regular,
    color: colors.sub,
    marginTop: space.hair,
  },
  switch: {
    width: 50, height: 30, borderRadius: radius.md,
    backgroundColor: colors.disabled, justifyContent: 'center', paddingHorizontal: space.hair,
  },
  switchActive: { backgroundColor: colors.action },
  switchThumb: {
    width: 26, height: 26, borderRadius: radius.md, backgroundColor: colors.surf,
  },

});
