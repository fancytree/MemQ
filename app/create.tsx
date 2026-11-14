import { ManualTermFields } from '@/components/ui/ManualTermFields';
import { LearningModeSelector } from '@/components/ui/LearningModeSelector';
import { homeColors } from '@/theme/colors';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ledge } from '@/theme/ledge';
import { layout } from '@/theme/spacing';
import { EdBase } from '@/components/EdBase';
import { HomeAsset } from '@/components/HomeAsset';
import { MASCOT_HANDS } from '@/components/mascot/figma-parts';
import { MascotCharacter } from '@/components/mascot/MascotCharacter';
import { SectionLabel } from '@/components/SectionLabel';
import { LanguageCardDetails, LanguageCardEditor } from '@/components/LanguageCardFields';
import { useSubscription } from '@/context/SubscriptionContext';
import { AI_LIMITS, getAIUsageCount, recordAIUsage } from '@/lib/aiUsage';
import { safeBack } from '@/lib/safeBack';
import { setPendingTerms } from '@/lib/createStore';
import { supabase } from '@/lib/supabase';
import { LanguageCardData, hasLanguageData, normalizeLanguageData } from '@/lib/languageCard';
import { fonts } from '@/theme';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

/** How wide the character stands over the card it is holding. */
const PERCH = 132;

/** Where the card's top edge crosses the character, read off the hands rather than
 *  typed in: a little below their middle, so their lower part laps onto the card and
 *  they read as resting on the edge instead of hovering above it. Every perch in the
 *  app sits on this line. */
const HAND_LINE = MASCOT_HANDS.reduce((sum, h) => sum + (h.box[1] + h.box[3]) / 2, 0)
  / MASCOT_HANDS.length / 256;
const CARD_LIFT = -(1 - (HAND_LINE + 7 / 256)) * PERCH;

/** The thinking face looks up and off into the middle distance on its own, which is
 *  right for a character working something out and wrong for one sitting on a card a
 *  person is reading. Brought down and centred, far enough below level that the
 *  state's own wander never carries it back above the line. */
const PROMPT_GAZE = { x: 0.5, y: 0.9 } as const;

type Phase = 'idle' | 'generating' | 'done';

interface GeneratedCard {
  n: string;
  tag: string;
  title: string;
  body?: string;
  ex?: string;
  languageData?: LanguageCardData;
}

interface ManualTermRow {
  id: string;
  term: string;
  definition: string;
  explanation: string;
  languageData: LanguageCardData;
  saved: boolean;
  editing: boolean;
}

type DocumentPickerModule = {
  getDocumentAsync: (options: {
    type?: string | string[];
    copyToCacheDirectory?: boolean;
  }) => Promise<{
    canceled: boolean;
    assets?: Array<{ uri?: string; name?: string }>;
  }>;
};

let cachedDocumentPicker: DocumentPickerModule | null | undefined = undefined;
const getDocumentPicker = (): DocumentPickerModule | null => {
  if (cachedDocumentPicker !== undefined) return cachedDocumentPicker;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('expo-document-picker');
    cachedDocumentPicker = (mod?.default ?? mod) as DocumentPickerModule;
  } catch {
    cachedDocumentPicker = null;
  }
  return cachedDocumentPicker;
};

export default function CreateScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  // The card is nested inside the character's box, so it has to be pulled back out to
  // the width it would have had on its own.
  const bleed = -((width - layout.screenInline * 2) - PERCH) / 2;
  const { isPro, showPaywall } = useSubscription();
  const [prompt, setPrompt] = useState('');
  const [learningMode, setLearningMode] = useState<'language' | 'knowledge'>('knowledge');
  const [phase, setPhase] = useState<Phase>('idle');
  const [cards, setCards] = useState<GeneratedCard[]>([]);
  const [generatedMode, setGeneratedMode] = useState<'language' | 'knowledge' | null>(null);
  const visibleCards = generatedMode === learningMode ? cards : [];
  const [manualTerms, setManualTerms] = useState<ManualTermRow[]>([
    { id: '1', term: '', definition: '', explanation: '', languageData: {}, saved: false, editing: true },
  ]);
  const [nextManualId, setNextManualId] = useState(2);
  const [generatingManualId, setGeneratingManualId] = useState<string | null>(null);
  const [regeneratingCardId, setRegeneratingCardId] = useState<string | null>(null);
  const [generateDots, setGenerateDots] = useState('.');
  const [regenerateDots, setRegenerateDots] = useState('.');
  const [genUsed, setGenUsed] = useState(0);
  const GEN_LIMIT = AI_LIMITS.generate_terms.free; // 3
  const genRemaining = Math.max(0, GEN_LIMIT - genUsed);
  const genExhausted = !isPro && genRemaining === 0;


  const isGenerating = phase === 'generating';

  useEffect(() => {
    if (!isGenerating) { setGenerateDots('.'); return; }
    const t = setInterval(() => setGenerateDots((p) => (p === '...' ? '.' : `${p}.`)), 350);
    return () => clearInterval(t);
  }, [isGenerating]);

  useEffect(() => {
    const busy = regeneratingCardId !== null || generatingManualId !== null;
    if (!busy) { setRegenerateDots('.'); return; }
    const t = setInterval(() => setRegenerateDots((p) => (p === '...' ? '.' : `${p}.`)), 350);
    return () => clearInterval(t);
  }, [regeneratingCardId, generatingManualId]);

  // Load this month's generate_terms usage count
  useEffect(() => {
    if (isPro) return;
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const count = await getAIUsageCount('generate_terms', user.id);
      setGenUsed(count);
    })();
  }, [isPro]);

  // ─── Generate from prompt ─────────────────────────────────────────────────

  const generate = () => {
    void (async () => {
      if (!prompt.trim()) { Alert.alert('Tip', 'Please enter text or a topic first'); return; }
      if (genExhausted) { void showPaywall(); return; }
      setPhase('generating');
      try {
        const { data: authData } = await supabase.auth.getUser();
        const { data, error } = await supabase.functions.invoke(learningMode === 'language' ? 'generate-vocab-terms' : 'generate-terms', {
          body: { type: 'topic', content: prompt.trim() },
        });
        if (error) throw new Error(error.message || 'Failed to generate terms');
        const results: Array<{ term: string; definition: string; explanation?: string; language_data?: LanguageCardData }> =
          Array.isArray(data?.results) ? data.results : [];
        setGeneratedMode(learningMode);
        setCards(results.map((item, i) => ({
          n: String(i + 1).padStart(2, '0'),
          tag: 'AI Generated',
          title: item.term,
          body: item.definition,
          ex: item.explanation,
          languageData: normalizeLanguageData(item.language_data),
        })));
        setPhase('done');
        if (!isPro && authData.user) {
          const ok = await recordAIUsage('generate_terms', authData.user.id);
          if (ok) setGenUsed((prev) => prev + 1);
        }
      } catch (err) {
        Alert.alert('Error', err instanceof Error ? err.message : 'Something went wrong');
        setPhase('idle');
      }
    })();
  };

  const handlePickPdfAndGenerate = async () => {
    if (genExhausted) { void showPaywall(); return; }
    try {
      const picker = getDocumentPicker();
      if (!picker) { Alert.alert('Unavailable', 'Document picker is unavailable in current build.'); return; }
      const picked = await picker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
      if (picked.canceled || !picked.assets?.length) return;
      const asset = picked.assets[0];
      if (!asset.uri) { Alert.alert('Error', 'Invalid file'); return; }
      setPhase('generating');
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData.user?.id ?? 'anonymous';
      const fileName = `${userId}/${Date.now()}-${asset.name || 'upload.pdf'}`;
      const fileBlob = await (await fetch(asset.uri)).blob();
      const { error: uploadError } = await supabase.storage
        .from('pdfs').upload(fileName, fileBlob, { contentType: 'application/pdf' });
      if (uploadError) throw new Error(`Failed to upload file: ${uploadError.message}`);
      const { data: urlData } = supabase.storage.from('pdfs').getPublicUrl(fileName);
      const { data, error } = await supabase.functions.invoke('process-file', {
        body: { pdf_url: urlData.publicUrl },
      });
      if (error) throw new Error(error.message || 'Failed to process file');
      const results: Array<{ term: string; definition: string; explanation?: string; language_data?: LanguageCardData }> =
        Array.isArray(data?.results) ? data.results : [];
      setGeneratedMode(learningMode);
      setCards(results.map((item, i) => ({
        n: String(i + 1).padStart(2, '0'),
        tag: 'AI Generated',
        title: item.term,
        body: item.definition,
        ex: item.explanation,
        languageData: normalizeLanguageData(item.language_data),
      })));
      setPhase('done');
      if (!isPro && authData.user) {
        const ok = await recordAIUsage('generate_terms', authData.user.id);
        if (ok) setGenUsed((prev) => prev + 1);
      }
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to process PDF');
      setPhase('idle');
    }
  };

  // ─── Manual term helpers ──────────────────────────────────────────────────

  const updateManualTerm = (id: string, field: 'term' | 'definition' | 'explanation' | 'languageData', value: string | LanguageCardData) => {
    setManualTerms((prev) => prev.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
  };

  const removeManualRow = (id: string) => {
    setManualTerms((prev) => prev.length === 1 ? prev : prev.filter((r) => r.id !== id));
  };

  const handleSaveManualRow = (rowId: string, next: Pick<ManualTermRow, 'term' | 'definition' | 'explanation' | 'languageData'>) => {
    setManualTerms((prev) => {
      const finalized = prev.map((row) =>
        row.id === rowId ? { ...row, ...next, saved: true, editing: false } : row
      );
      const hasEmpty = finalized.some((r) => !r.term.trim() && !r.definition.trim());
      if (hasEmpty) return finalized;
      return [...finalized, { id: String(nextManualId), term: '', definition: '', explanation: '', languageData: {}, saved: false, editing: true }];
    });
    setNextManualId((p) => p + 1);
  };

  const handleEditManualRow = (rowId: string) =>
    setManualTerms((prev) => prev.map((r) => (r.id === rowId ? { ...r, editing: true } : r)));

  const handleCancelManualEdit = (rowId: string) =>
    setManualTerms((prev) => prev.map((r) => (r.id === rowId ? { ...r, editing: false } : r)));

  const handleManualDiscard = (rowId: string) => {
    setManualTerms((prev) => {
      const next = prev.filter((r) => r.id !== rowId);
      if (next.length > 0) return next;
      return [{ id: String(nextManualId), term: '', definition: '', explanation: '', languageData: {}, saved: false, editing: true }];
    });
    setNextManualId((p) => p + 1);
  };

  const handleDiscardGeneratedCard = (cardNo: string) =>
    setCards((prev) => prev.filter((c) => c.n !== cardNo));

  const generateManualFromTerm = async (term: string): Promise<{ definition: string; explanation: string; languageData: LanguageCardData }> => {
    const { data, error } = await supabase.functions.invoke(learningMode === 'language' ? 'generate-vocab-terms' : 'generate-terms', {
      body: { type: 'topic', content: term },
    });
    if (error) throw new Error(error.message || 'Failed to generate content');
    const first = data?.results?.[0];
    if (!first || typeof first.definition !== 'string') throw new Error('No result for this term');
    return { definition: first.definition || '', explanation: first.explanation || '', languageData: normalizeLanguageData(first.language_data) };
  };

  const handleManualRegenerate = async (rowId: string) => {
    const row = manualTerms.find((r) => r.id === rowId);
    if (!row?.term.trim()) { Alert.alert('Tip', 'Please add a term first'); return; }
    try {
      setGeneratingManualId(rowId);
      const generated = await generateManualFromTerm(row.term.trim());
      setManualTerms((prev) => prev.map((r) =>
        r.id === rowId ? { ...r, definition: generated.definition, explanation: generated.explanation, languageData: generated.languageData, saved: true, editing: false } : r
      ));
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to regenerate');
    } finally {
      setGeneratingManualId((p) => (p === rowId ? null : p));
    }
  };

  const handleRegenerateGeneratedCard = async (cardNo: string) => {
    const card = cards.find((c) => c.n === cardNo);
    if (!card?.title.trim()) { Alert.alert('Tip', 'This card has no term to regenerate'); return; }
    try {
      setRegeneratingCardId(cardNo);
      const generated = await generateManualFromTerm(card.title.trim());
      setCards((prev) => prev.map((c) =>
        c.n === cardNo ? { ...c, body: generated.definition, ex: generated.explanation, languageData: generated.languageData } : c
      ));
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to regenerate');
    } finally {
      setRegeneratingCardId((p) => (p === cardNo ? null : p));
    }
  };

  // ─── Save flow ────────────────────────────────────────────────────────────

  const collectTerms = () => {
    const fromGenerated = visibleCards
      .filter((c) => c.title.trim() && (c.body || '').trim())
      .map((c) => ({ term: c.title.trim(), definition: (c.body || '').trim(), explanation: (c.ex || '').trim() || null,
        language_data: learningMode === 'language' && c.languageData && hasLanguageData(c.languageData) ? c.languageData : null }));
    const fromManual = (learningMode === 'knowledge' ? manualTerms : [])
      .filter((r) => r.term.trim() && r.definition.trim())
      .map((r) => ({ term: r.term.trim(), definition: r.definition.trim(), explanation: r.explanation.trim() || null,
        language_data: learningMode === 'language' && hasLanguageData(r.languageData) ? r.languageData : null }));
    return [...fromGenerated, ...fromManual];
  };

  const handleSavePress = () => {
    const terms = collectTerms();
    if (terms.length === 0) {
      Alert.alert('Empty', learningMode === 'language' ? 'Generate at least one language card first.' : 'Please add at least one term and definition.');
      return;
    }
    setPendingTerms(terms, learningMode);
    router.push('/create-name' as any);
  };

  // ─── Render ───────────────────────────────────────────────────────────────

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
        <Pressable accessibilityRole="button" onPress={() => safeBack('/(tabs)')} style={styles.topbarSideBtn}>
          <Text style={styles.cancel}>Cancel</Text>
        </Pressable>
        <Text style={styles.title}>New Lesson</Text>
        <Pressable accessibilityRole="button" onPress={handleSavePress} style={styles.topbarSideBtn}>
          <Text style={styles.tag}>Save</Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.contentScroll}
        contentContainerStyle={styles.contentScrollBody}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ paddingHorizontal: layout.screenInline, paddingTop: 14, paddingBottom: 12 }}>
          <SectionLabel style={styles.sectionLabel}>Learning mode</SectionLabel>
          <LearningModeSelector value={learningMode} onChange={setLearningMode} />
        </View>
        {/* Prompt block, with the character resting on its top edge. It watches the
            box while it is empty and thinks while the cards are being written. */}
        <MascotCharacter width={PERCH} calm style={styles.perch} hands
          mood={isGenerating ? 'thinking' : 'onboarding'}
          look={isGenerating ? PROMPT_GAZE : undefined}
          behind={(
        <View style={[styles.promptBlock, { marginTop: CARD_LIFT, marginLeft: bleed, marginRight: bleed }]}>
          <View style={{ paddingHorizontal: 18, paddingTop: 14, paddingBottom: 6 }}>
            <SectionLabel style={{ marginBottom: 10, fontSize: 12, lineHeight: 15.4, letterSpacing: -0.1, fontFamily: fonts.medium, fontWeight: '500' }}>
              What do you want to learn?
            </SectionLabel>
            <TextInput accessibilityLabel="Type what you want to learn, paste text, or enter a topic."
              value={prompt}
              onChangeText={setPrompt}
              placeholder="Type what you want to learn, paste text, or enter a topic."
              placeholderTextColor={homeColors.placeholder}
              multiline
              style={styles.textarea}
            />
          </View>
          <View style={styles.promptActions}>
            {(['Attach', 'Voice', 'Doc'] as const).map((label, i, arr) => (
              <Pressable accessibilityRole="button"
                key={label}
                onPress={() => {
                  if (isGenerating) return;
                  if (label === 'Voice') { Alert.alert('Coming soon', 'Voice input will be available soon.'); return; }
                  void handlePickPdfAndGenerate();
                }}
                disabled={isGenerating}
                style={[
                  styles.actionBtn,
                  i < arr.length - 1 && { borderRightWidth: 1, borderRightColor: homeColors.border },
                  isGenerating && styles.actionDisabled,
                ]}
              >
                {label === 'Attach' ? (
                  <View style={styles.actionLabelRow}>
                    <Feather name="paperclip" size={13} color={homeColors.muted} />
                    <Text style={styles.actionLabel}>Attach</Text>
                  </View>
                ) : (
                  <Text style={styles.actionLabel}>{label}</Text>
                )}
              </Pressable>
            ))}
            <Pressable accessibilityRole="button"
              disabled={isGenerating}
              onPress={genExhausted ? () => void showPaywall() : generate}
              style={[styles.actionBtn, { marginLeft: 'auto' }]}
            >
              <View style={styles.generateActionWrap}>
                {isGenerating ? (
                  <>
                    <Text style={[styles.generateLabel, { color: homeColors.muted }]}>Generating</Text>
                    <Text style={[styles.generateLabel, styles.generateDots, { color: homeColors.muted }]}>{generateDots}</Text>
                  </>
                ) : genExhausted ? (
                  <Text style={[styles.generateLabel, { color: homeColors.muted }]}>🔒 Upgrade →</Text>
                ) : (
                  <Text style={[styles.generateLabel, { color: homeColors.primary }]}>Generate →</Text>
                )}
              </View>
            </Pressable>
          </View>
          {/* Quota hint — only shown to free users */}
          {!isPro && (
            <View style={styles.quotaBar}>
              {genExhausted ? (
                <>
                  <Text style={styles.quotaBarText}>Monthly AI limit reached.</Text>
                  <Pressable accessibilityRole="button" onPress={() => void showPaywall()} style={styles.quotaUpgradeBtn}>
                    <Text style={styles.quotaUpgradeBtnText}>Upgrade to Pro →</Text>
                  </Pressable>
                </>
              ) : (
                <Text style={styles.quotaBarText}>
                  {genRemaining} AI generation{genRemaining !== 1 ? 's' : ''} left this month
                </Text>
              )}
            </View>
          )}
        </View>
          )} />

        {/* Generated header. Nothing stands here before there is something to head:
            an "Awaiting prompt" label over an empty panel was a caption for absence,
            and the character on the card above says the same thing by waiting. */}
        {visibleCards.length > 0 && (
          <View style={styles.genHead}>
            <SectionLabel>{`Generated — ${visibleCards.length} cards`}</SectionLabel>
          </View>
        )}

        {/* Generated cards */}
        {visibleCards.map((c) => (
          <FullCard
            key={c.n}
            card={c}
            isLanguage={learningMode === 'language'}
            isRegenerating={regeneratingCardId === c.n}
            regenerateDots={regenerateDots}
            onDiscard={() => handleDiscardGeneratedCard(c.n)}
            onRegenerate={() => void handleRegenerateGeneratedCard(c.n)}
            onUpdate={(updated) => setCards((prev) => prev.map((item) => (item.n === updated.n ? updated : item)))}
          />
        ))}

        {/* Manual terms */}
        {learningMode === 'knowledge' && <View style={styles.manualSection}>
          <View style={styles.manualList}>
            {manualTerms.map((row, index) => (
              <ManualCard
                key={row.id}
                index={index}
                row={row}
                isLanguage={false}
                disableDelete={manualTerms.length === 1}
                onDelete={() => removeManualRow(row.id)}
                onEdit={() => handleEditManualRow(row.id)}
                onCancelEdit={() => handleCancelManualEdit(row.id)}
                onDiscard={() => handleManualDiscard(row.id)}
                onRegenerate={() => void handleManualRegenerate(row.id)}
                isGenerating={generatingManualId === row.id}
                regenerateDots={regenerateDots}
                onDraftChange={(field, value) => updateManualTerm(row.id, field, value)}
                onGenerate={async (term) => {
                  if (!term.trim()) { Alert.alert('Tip', 'Please enter a term first'); return null; }
                  try {
                    setGeneratingManualId(row.id);
                    return await generateManualFromTerm(term.trim());
                  } catch (err) {
                    Alert.alert('Error', err instanceof Error ? err.message : 'Failed to generate content');
                    return null;
                  } finally {
                    setGeneratingManualId((p) => (p === row.id ? null : p));
                  }
                }}
                onSave={(next) => handleSaveManualRow(row.id, next)}
              />
            ))}
          </View>
        </View>}

        <View style={{ height: 24 }} />
      </ScrollView>

    </EdBase>
  );
}

// ─── FullCard ─────────────────────────────────────────────────────────────────

function FullCard({
  card: c, isLanguage, isRegenerating, regenerateDots, onDiscard, onRegenerate, onUpdate,
}: {
  card: GeneratedCard; isLanguage: boolean; isRegenerating: boolean; regenerateDots: string;
  onDiscard: () => void; onRegenerate: () => void; onUpdate: (card: GeneratedCard) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(c.title);
  const [editBody, setEditBody] = useState(c.body || '');
  const [editEx, setEditEx] = useState(c.ex || '');
  const [editLanguage, setEditLanguage] = useState<LanguageCardData>(c.languageData || {});

  const startEdit = () => { setEditTitle(c.title); setEditBody(c.body || ''); setEditEx(c.ex || ''); setEditLanguage(c.languageData || {}); setIsEditing(true); };
  const cancelEdit = () => { setIsEditing(false); setEditTitle(c.title); setEditBody(c.body || ''); setEditEx(c.ex || ''); setEditLanguage(c.languageData || {}); };
  const saveEdit = () => {
    onUpdate({ ...c, title: editTitle.trim() || c.title, body: editBody.trim() || undefined, ex: editEx.trim() || undefined, languageData: editLanguage });
    setIsEditing(false);
  };

  return (
    <View style={styles.fullCard}>
      <View style={[styles.fullCardHead, isEditing && styles.fullCardHeadEditing]}>
        <View style={{ flex: 1 }}>
          <SectionLabel style={{ marginBottom: 4 }}>Card {c.n} · {c.tag}</SectionLabel>
          {!isEditing && <Text style={styles.fullCardTitle}>{c.title}</Text>}
        </View>
        {!isEditing && <Pressable accessibilityRole="button" onPress={startEdit}><Text style={styles.editLink}>Edit</Text></Pressable>}
      </View>
      <View style={{ paddingHorizontal: 14, paddingVertical: 12 }}>
        {isEditing ? (
          <View>
            <View style={styles.manualInputGroup}>
              <Text style={styles.manualInputLabel}>Term</Text>
              <TextInput accessibilityLabel="e.g. Renaissance" style={styles.manualInput} value={editTitle} onChangeText={setEditTitle}
                placeholder="e.g. Renaissance" placeholderTextColor={homeColors.placeholder} />
            </View>
            <View style={styles.manualInputGroup}>
              <Text style={styles.manualInputLabel}>Definition</Text>
              <TextInput accessibilityLabel="e.g. Period of cultural revival in Europe" style={[styles.manualInput, styles.manualTextarea]} value={editBody} onChangeText={setEditBody}
                placeholder="e.g. Period of cultural revival in Europe" placeholderTextColor={homeColors.placeholder} multiline textAlignVertical="top" />
            </View>
            <View style={styles.manualInputGroup}>
              <Text style={styles.manualInputLabel}>{isLanguage ? 'Usage note (optional)' : 'Explanation (Optional)'}</Text>
              <TextInput accessibilityLabel="Add context, examples, or usage notes" style={[styles.manualInput, styles.manualTextarea]} value={editEx} onChangeText={setEditEx}
                placeholder="Add context, examples, or usage notes" placeholderTextColor={homeColors.placeholder} multiline textAlignVertical="top" />
            </View>
            {isLanguage && <LanguageCardEditor value={editLanguage} onChange={setEditLanguage} term={editTitle} />}
          </View>
        ) : (
          c.body && <Text style={styles.fullCardBody}>{c.body}</Text>
        )}
        {!isEditing && c.ex && (
          <View style={styles.exBlock}>
            <SectionLabel style={{ marginBottom: 5 }}>{isLanguage ? 'Usage note' : 'Explanation'}</SectionLabel>
            <Text style={styles.exText}>{c.ex}</Text>
          </View>
        )}
        {!isEditing && isLanguage && <LanguageCardDetails data={c.languageData || {}} term={c.title} />}
      </View>
      <View style={isEditing ? styles.manualCardActions : styles.fullCardActions}>
        {isEditing
          ? (['cancel', 'save'] as const).map((key, j) => (
              <Pressable accessibilityRole="button" key={key} onPress={key === 'save' ? saveEdit : cancelEdit}
                style={[styles.manualCardAction, j > 0 && styles.manualCardActionBorder]}>
                <Text style={[styles.manualCardActionLabel,
                  key === 'save' ? { color: homeColors.primary, fontFamily: fonts.semibold } : { color: homeColors.muted }]}>
                  {key === 'save' ? 'Save' : 'Cancel'}
                </Text>
              </Pressable>
            ))
          : (['discard', 'regen'] as const).map((key, j, arr) => (
              <Pressable accessibilityRole="button" key={key} onPress={key === 'discard' ? onDiscard : onRegenerate}
                disabled={isRegenerating}
                style={[styles.fullCardAction, j < arr.length - 1 && { borderRightWidth: 1, borderRightColor: homeColors.border },
                  isRegenerating && key === 'regen' && { opacity: 0.6 }]}>
                <Text style={[styles.fullCardActionLabel,
                  { color: key === 'regen' ? homeColors.primary : homeColors.muted,
                    fontFamily: key === 'regen' ? fonts.semibold : fonts.medium }]}>
                  {key === 'discard' ? 'Discard' : isRegenerating ? `Regenerating${regenerateDots}` : 'Regenerate'}
                </Text>
              </Pressable>
            ))}
      </View>
    </View>
  );
}

// ─── ManualCard ───────────────────────────────────────────────────────────────

function ManualCard({
  index, row, isLanguage, disableDelete, onDelete, onEdit, onCancelEdit, onDiscard,
  onRegenerate, isGenerating, regenerateDots, onDraftChange, onGenerate, onSave,
}: {
  index: number; row: ManualTermRow; isLanguage: boolean; disableDelete: boolean;
  onDelete: () => void; onEdit: () => void; onCancelEdit: () => void;
  onDiscard: () => void; onRegenerate: () => void; isGenerating: boolean;
  regenerateDots: string;
  onDraftChange: (field: 'term' | 'definition' | 'explanation' | 'languageData', value: string | LanguageCardData) => void;
  onGenerate: (term: string) => Promise<{ definition: string; explanation: string; languageData: LanguageCardData } | null>;
  onSave: (next: Pick<ManualTermRow, 'term' | 'definition' | 'explanation' | 'languageData'>) => void;
}) {
  const [termDraft, setTermDraft] = useState(row.term);
  const [definitionDraft, setDefinitionDraft] = useState(row.definition);
  const [explanationDraft, setExplanationDraft] = useState(row.explanation);
  const [languageDraft, setLanguageDraft] = useState<LanguageCardData>(row.languageData);

  useEffect(() => {
    setTermDraft(row.term); setDefinitionDraft(row.definition); setExplanationDraft(row.explanation); setLanguageDraft(row.languageData);
  }, [row.term, row.definition, row.explanation, row.languageData]);

  const handleCancelEdit = () => {
    setTermDraft(row.term); setDefinitionDraft(row.definition); setExplanationDraft(row.explanation); setLanguageDraft(row.languageData);
    onCancelEdit();
  };

  const handleSaveEdit = () => onSave({ term: termDraft, definition: definitionDraft, explanation: explanationDraft, languageData: languageDraft });

  const handleGenerate = async () => {
    const generated = await onGenerate(termDraft);
    if (!generated) return;
    setDefinitionDraft(generated.definition); setExplanationDraft(generated.explanation); setLanguageDraft(generated.languageData);
    onDraftChange('definition', generated.definition); onDraftChange('explanation', generated.explanation); onDraftChange('languageData', generated.languageData);
  };

  return (
    <View style={styles.manualCard}>
      <View style={styles.manualCardHead}>
        <View style={{ flex: 1 }}>
          <SectionLabel style={{ marginBottom: 0 }}>Card M{index + 1} · Manual</SectionLabel>
          {row.saved && !row.editing && <Text style={styles.manualSavedTitle}>{row.term}</Text>}
        </View>
        {row.saved && !row.editing ? (
          <Pressable accessibilityRole="button" onPress={onEdit}><Text style={styles.editLink}>Edit</Text></Pressable>
        ) : !disableDelete ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Remove draft card" onPress={onDelete} hitSlop={10} style={styles.manualRemoveBtn}>
            <Feather name="x" size={18} color={homeColors.muted} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.manualCardBody}>
        {row.saved && !row.editing ? (
          <>
            <Text style={styles.fullCardBody}>{row.definition}</Text>
            {!!row.explanation && (
              <View style={styles.exBlock}>
                <SectionLabel style={{ marginBottom: 5 }}>{isLanguage ? 'Usage note' : 'Explanation'}</SectionLabel>
                <Text style={styles.exText}>{row.explanation}</Text>
              </View>
            )}
            {isLanguage && <LanguageCardDetails data={row.languageData} term={row.term} />}
          </>
        ) : (
          <>
            <ManualTermFields term={termDraft} definition={definitionDraft} explanation={explanationDraft} languageData={languageDraft}
              isLanguage={isLanguage} isGenerating={isGenerating} onGenerate={() => void handleGenerate()}
              onTermChange={(value) => { setTermDraft(value); onDraftChange('term', value); }}
              onDefinitionChange={(value) => { setDefinitionDraft(value); onDraftChange('definition', value); }}
              onExplanationChange={(value) => { setExplanationDraft(value); onDraftChange('explanation', value); }}
              onLanguageChange={(value) => { setLanguageDraft(value); onDraftChange('languageData', value); }} />
          </>
        )}
      </View>

      {!row.saved || row.editing ? (
        <View style={styles.manualCardActions}>
          <Pressable accessibilityRole="button" style={styles.manualCardAction} onPress={handleCancelEdit}>
            <Text style={[styles.manualCardActionLabel, { color: homeColors.muted }]}>Cancel</Text>
          </Pressable>
          <Pressable accessibilityRole="button" style={[styles.manualCardAction, styles.manualCardActionBorder]} onPress={handleSaveEdit}>
            <Text style={[styles.manualCardActionLabel, { color: homeColors.primary, fontFamily: fonts.semibold }]}>Save</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.fullCardActions}>
          {(['discard', 'regen'] as const).map((key, j, arr) => (
            <Pressable accessibilityRole="button" key={key} onPress={key === 'discard' ? onDiscard : onRegenerate}
              disabled={isGenerating}
              style={[styles.fullCardAction, j < arr.length - 1 && { borderRightWidth: 1, borderRightColor: homeColors.border },
                isGenerating && key === 'regen' && { opacity: 0.6 }]}>
              <Text style={[styles.fullCardActionLabel,
                { color: key === 'regen' ? homeColors.primary : homeColors.muted,
                    fontFamily: key === 'regen' ? fonts.semibold : fonts.medium }]}>
                {key === 'discard' ? 'Discard' : isGenerating ? `Regenerating${regenerateDots}` : 'Regenerate'}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

/** The lip every raised surface here carries, drawn as a solid offset rather than a
 *  blur: in a palette with no shadows that band is the only depth there is. */
const lip = (depth: number) => ({ boxShadow: `0px ${depth}px 0px ${homeColors.border}` });

const styles = StyleSheet.create({
  background: { position: 'absolute', left: 0, right: 0, height: 874 },
  waveBack: { position: 'absolute', left: -19 },
  waveFront: { position: 'absolute', left: -19 },
  topbar: {
    paddingHorizontal: layout.screenInline, paddingTop: 14, paddingBottom: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    position: 'relative',
  },
  topbarSideBtn: { minHeight: 44, minWidth: 64, zIndex: 2, justifyContent: 'center' },
  contentScroll: { flex: 1 },
  contentScrollBody: { paddingBottom: 24 },
  cancel: { fontFamily: fonts.medium, fontSize: 15, color: homeColors.deep },
  title: {
    fontFamily: fonts.display, fontSize: 23, lineHeight: 32, color: homeColors.deep,
    position: 'absolute', left: 0, right: 0, textAlign: 'center',
  },
  tag: {
    fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20,
    color: homeColors.primary, textAlign: 'right',
  },
  tagDisabled: { opacity: 0.45 },

  sectionLabel: {
    fontFamily: fonts.semibold, fontSize: 18, lineHeight: 24,
    color: homeColors.darkest, marginBottom: 10,
  },
  perch: { alignSelf: 'center' },

  // Every card here carries a 4-unit lip that sits outside its layout box, so a
  // margin of 8 between two of them leaves 4 on screen. These are set so the gaps
  // read as 12 between cards and 20 between the prompt and the cards it makes.
  promptBlock: {
    marginHorizontal: layout.screenInline, marginTop: 8, marginBottom: 8,
    backgroundColor: homeColors.white, borderRadius: 28, ...lip(ledge.raised),
  },
  textarea: {
    minHeight: 76, fontFamily: fonts.regular, fontSize: 16, lineHeight: 24,
    color: homeColors.darkest, padding: 0,
  },
  // The one row of controls that still needs rules: four targets on one line, and
  // without them the labels read as loose words rather than as separate buttons.
  promptActions: {
    flexDirection: 'row', alignItems: 'center',
    borderTopWidth: 1, borderTopColor: homeColors.border,
  },
  actionBtn: { minHeight: 44, paddingHorizontal: 12, paddingVertical: 14 },
  actionDisabled: { opacity: 0.5 },
  generateActionWrap: { flexDirection: 'row', alignItems: 'center' },
  generateDots: { width: 32, textAlign: 'left', flexShrink: 0 },
  actionLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionLabel: {
    fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20, color: homeColors.deep,
  },
  generateLabel: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20 },

  quotaBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: homeColors.border,
  },
  quotaBarText: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: homeColors.muted },
  quotaUpgradeBtn: { minHeight: 44, paddingVertical: 2, paddingHorizontal: 4, justifyContent: 'center' },
  quotaUpgradeBtnText: {
    fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18, color: homeColors.primary,
  },

  genHead: {
    paddingHorizontal: layout.screenInline, paddingTop: 16, paddingBottom: 2,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  fullCard: {
    marginHorizontal: layout.screenInline, marginTop: 16,
    backgroundColor: homeColors.white, borderRadius: 28, ...lip(ledge.raised),
  },
  fullCardHead: {
    paddingHorizontal: 18, paddingVertical: 16,
    flexDirection: 'row', alignItems: 'flex-start',
  },
  fullCardHeadEditing: { flexDirection: 'column', alignItems: 'stretch' },
  fullCardTitle: {
    fontFamily: fonts.semibold, fontSize: 17, lineHeight: 24, color: homeColors.darkest,
  },
  editLink: {
    fontFamily: fonts.semibold, fontSize: 14, color: homeColors.primary, marginLeft: 10,
  },
  fullCardBody: {
    fontFamily: fonts.regular, fontSize: 15, lineHeight: 22,
    color: homeColors.muted, marginBottom: 12,
  },
  // A well sunk into the card's face, the way every other quoted block is drawn.
  exBlock: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: homeColors.canvas },
  exText: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, color: homeColors.muted },
  fullCardActions: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: homeColors.border },
  fullCardAction: { flex: 1, paddingVertical: 16, alignItems: 'center' },
  fullCardActionLabel: { fontFamily: fonts.medium, fontSize: 16 },

  manualSection: { marginTop: 16, marginHorizontal: layout.screenInline },
  manualList: { gap: 12 },
  manualCard: {
    backgroundColor: homeColors.white, borderRadius: 28, ...lip(ledge.raised),
  },
  manualCardHead: {
    paddingHorizontal: 18, paddingTop: 16, paddingBottom: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  manualSavedTitle: {
    marginTop: 4, fontFamily: fonts.semibold, fontSize: 17, lineHeight: 24,
    color: homeColors.darkest,
  },
  manualCardBody: { paddingHorizontal: 18, paddingBottom: 18 },
  manualCardActions: { borderTopWidth: 1, borderTopColor: homeColors.border, flexDirection: 'row' },
  manualCardAction: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 16 },
  manualCardActionBorder: { borderLeftWidth: 1, borderLeftColor: homeColors.border },
  manualCardActionLabel: { fontFamily: fonts.medium, fontSize: 16 },
  // A small control, so it carries the shallowest lip.
  manualRemoveBtn: {
    width: 30, height: 28 + ledge.control, borderRadius: 15,
    backgroundColor: homeColors.border, paddingBottom: ledge.control,
    alignItems: 'center', justifyContent: 'center',
  },
  manualInputGroup: { marginBottom: 14 },
  manualInputLabelRow: {
    marginBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  manualInputLabel: {
    fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20, color: homeColors.muted,
  },
  manualGenerateButtonDisabled: { opacity: 0.5 },
  manualGenerateButtonText: {
    fontFamily: fonts.semibold, fontSize: 14, lineHeight: 19, color: homeColors.primary,
  },
  manualInput: {
    minHeight: 52, borderRadius: 16, backgroundColor: homeColors.canvas,
    paddingHorizontal: 16, paddingVertical: 14,
    fontFamily: fonts.medium, fontSize: 16, lineHeight: 22, color: homeColors.darkest,
  },
  manualTextarea: { minHeight: 72, textAlignVertical: 'top' },
});
