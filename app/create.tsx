import { Icon } from '@/components/ui/Icon';
import { oneLine } from '@/theme/typography';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { ManualTermFields } from '@/components/ui/ManualTermFields';
import { dialog } from '@/lib/dialog';
import { LearningModeSelector } from '@/components/ui/LearningModeSelector';
import { McpSetupSheet } from '@/components/McpSetupSheet';
import { mcpEnabled, mcpGuidanceDismissed } from '@/lib/mcp';
import { CloseButton, ConfirmButton } from '@/components/ui/RoundButtons';
import { colors } from '@/theme/colors';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { layout } from '@/theme/spacing';
import { EdBase } from '@/components/EdBase';
import { HomeAsset } from '@/components/HomeAsset';
import { MascotRig, RIG_HAND_LINE } from '@/components/mascot/rig/MascotRig';
import { SectionLabel } from '@/components/SectionLabel';
import { LanguageCardDetails, LanguageCardEditor } from '@/components/LanguageCardFields';
import { useSubscription } from '@/context/SubscriptionContext';
import { AI_LIMITS, getAIUsageCount, recordAIUsage } from '@/lib/aiUsage';
import { safeBack } from '@/lib/safeBack';
import { setPendingTerms } from '@/lib/createStore';
import { supabase } from '@/lib/supabase';
import { createPdfProcessingUrl } from '@/lib/pdfSignedUrl';
import { LanguageCardData, hasLanguageData, normalizeLanguageData } from '@/lib/languageCard';
import { space, radius, type, fonts } from '@/theme';
import { IconButton } from '@/components/ui/IconButton';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
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
const HAND_LINE = RIG_HAND_LINE;
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
  // Said once, the first time someone comes to make a lesson, because that is the
  // moment it is about — and not again unless they ask for it.
  const [showMcp, setShowMcp] = useState(false);
  useEffect(() => {
    if (!mcpEnabled) return;
    let alive = true;
    void mcpGuidanceDismissed().then((dismissed) => { if (alive && !dismissed) setShowMcp(true); });
    return () => { alive = false; };
  }, []);
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
  // What these cards were made from, handed to the naming screen so it can open with
  // a title already in the box rather than an empty one.
  const [sourceName, setSourceName] = useState('');

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
      if (!prompt.trim()) { dialog('Tip', 'Please enter text or a topic first'); return; }
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
        dialog('Error', err instanceof Error ? err.message : 'Something went wrong');
        setPhase('idle');
      }
    })();
  };

  const handlePickPdfAndGenerate = async () => {
    if (genExhausted) { void showPaywall(); return; }
    try {
      const picker = getDocumentPicker();
      if (!picker) { dialog('Unavailable', 'Document picker is unavailable in current build.'); return; }
      const picked = await picker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
      if (picked.canceled || !picked.assets?.length) return;
      const asset = picked.assets[0];
      if (!asset.uri) { dialog('Error', 'Invalid file'); return; }
      // The file's own name, minus its extension: on a PDF run there is nothing else
      // to call the lesson, and it is usually what the person would have typed.
      if (asset.name) setSourceName(asset.name.replace(/\.[^.]+$/, '').trim());
      setPhase('generating');
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData.user?.id;
      if (!userId) throw new Error('Please sign in to upload a PDF.');
      const fileName = `${userId}/${Date.now()}-${asset.name || 'upload.pdf'}`;
      const fileBlob = await (await fetch(asset.uri)).blob();
      const { error: uploadError } = await supabase.storage
        .from('pdfs').upload(fileName, fileBlob, { contentType: 'application/pdf' });
      if (uploadError) throw new Error(`Failed to upload file: ${uploadError.message}`);
      const pdfUrl = await createPdfProcessingUrl(supabase.storage.from('pdfs'), fileName);
      const { data, error } = await supabase.functions.invoke('process-file', {
        body: { pdf_url: pdfUrl },
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
      dialog('Error', err instanceof Error ? err.message : 'Failed to process PDF');
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
    if (!row?.term.trim()) { dialog('Tip', 'Please add a term first'); return; }
    try {
      setGeneratingManualId(rowId);
      const generated = await generateManualFromTerm(row.term.trim());
      setManualTerms((prev) => prev.map((r) =>
        r.id === rowId ? { ...r, definition: generated.definition, explanation: generated.explanation, languageData: generated.languageData, saved: true, editing: false } : r
      ));
    } catch (err) {
      dialog('Error', err instanceof Error ? err.message : 'Failed to regenerate');
    } finally {
      setGeneratingManualId((p) => (p === rowId ? null : p));
    }
  };

  const handleRegenerateGeneratedCard = async (cardNo: string) => {
    const card = cards.find((c) => c.n === cardNo);
    if (!card?.title.trim()) { dialog('Tip', 'This card has no term to regenerate'); return; }
    try {
      setRegeneratingCardId(cardNo);
      const generated = await generateManualFromTerm(card.title.trim());
      setCards((prev) => prev.map((c) =>
        c.n === cardNo ? { ...c, body: generated.definition, ex: generated.explanation, languageData: generated.languageData } : c
      ));
    } catch (err) {
      dialog('Error', err instanceof Error ? err.message : 'Failed to regenerate');
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

  // An empty lesson is a lesson: a name and a deadline are a plan, and the cards
  // can be added later from the lesson's own page. Refusing to make one meant the
  // only way to start was to have the content already.
  const handleSavePress = () => {
    setPendingTerms(collectTerms(), learningMode, prompt.trim() || sourceName);
    router.push('/create-name' as any);
  };

  // ─── Render ───────────────────────────────────────────────────────────────

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
        <CloseButton onPress={() => safeBack('/(tabs)')} label="Cancel new lesson" />
        <Text style={styles.title}>New Lesson</Text>
        <ConfirmButton onPress={handleSavePress} label="Save lesson" />
      </View>

      <ScrollView
        style={styles.contentScroll}
        contentContainerStyle={styles.contentScrollBody}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ paddingHorizontal: layout.screenInline, paddingTop: space[3], paddingBottom: space[3] }}>
          <SectionLabel style={styles.sectionLabel}>Learning mode</SectionLabel>
          <LearningModeSelector value={learningMode} onChange={setLearningMode} />
        </View>
        {/* Prompt block, with the character resting on its top edge. It watches the
            box while it is empty and thinks while the cards are being written. */}
        <MascotRig width={PERCH} calm style={styles.perch} hands
          mood={isGenerating ? 'thinking' : 'onboarding'}
          look={isGenerating ? PROMPT_GAZE : undefined}
          behind={(
        <Card pad="none" gap={0} style={[styles.promptBlock, { marginTop: CARD_LIFT, marginLeft: bleed, marginRight: bleed }]}>
          <View style={{ paddingHorizontal: space[4], paddingTop: space[3], paddingBottom: space[1] }}>
            <SectionLabel style={styles.promptHeading}>
              What do you want to learn?
            </SectionLabel>
            <TextInput accessibilityLabel="Type what you want to learn, paste text, or enter a topic."
              value={prompt}
              onChangeText={setPrompt}
              placeholder="Type what you want to learn, paste text, or enter a topic."
              placeholderTextColor={colors.placeholder}
              multiline
              style={styles.textarea}
            />
          </View>
          <View style={styles.promptActions}>
            {/* One way in for a file. "Doc" opened the same picker as Attach, and voice
                input is not coming, so both are gone rather than left as dead ends. */}
            <Pressable accessibilityRole="button"
              onPress={() => { if (!isGenerating) void handlePickPdfAndGenerate(); }}
              disabled={isGenerating}
              style={[styles.actionBtn, isGenerating && styles.actionDisabled]}
            >
              <View style={styles.actionLabelRow}>
                <Icon name="paperclip" size={13} color={colors.faint} />
                <Text style={styles.actionLabel}>Attach</Text>
              </View>
            </Pressable>
            {/* For when one line is not enough: it can ask what you mean and look at
                the lessons you already have. Quiet, and beside Attach rather than
                opposite Generate, because Generate is still the way through. */}
            <Pressable accessibilityRole="button"
              accessibilityLabel="Talk it through instead of typing one line"
              disabled={isGenerating}
              onPress={() => router.push('/create-chat' as never)}
              style={[styles.actionBtn, isGenerating && styles.actionDisabled]}
            >
              <View style={styles.actionLabelRow}>
                {/* Not `zap`: that one already means Pro here (unlock-pro, you), and
                    this entry would read as a paid feature. Not `message` either —
                    that is the help centre, which is a person. `star` was wrong as
                    well: a five-point star is a rating, not a machine writing
                    something for you. */}
                <Icon name="sparkle" size={13} color={colors.faint} />
                <Text style={styles.actionLabel}>Talk it through</Text>
              </View>
            </Pressable>
            <Pressable accessibilityRole="button"
              disabled={isGenerating}
              onPress={genExhausted ? () => void showPaywall() : generate}
              style={[styles.actionBtn, { marginLeft: 'auto' }]}
            >
              <View style={styles.generateActionWrap}>
                {isGenerating ? (
                  <>
                    <Text style={[styles.generateLabel, { color: colors.faint }]}>Generating</Text>
                    <Text style={[styles.generateLabel, styles.generateDots, { color: colors.faint }]}>{generateDots}</Text>
                  </>
                ) : genExhausted ? (
                  <Text style={[styles.generateLabel, { color: colors.faint }]}>🔒 Upgrade →</Text>
                ) : (
                  <Text style={[styles.generateLabel, { color: colors.action }]}>Generate →</Text>
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
        </Card>
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
                  if (!term.trim()) { dialog('Tip', 'Please enter a term first'); return null; }
                  try {
                    setGeneratingManualId(row.id);
                    return await generateManualFromTerm(term.trim());
                  } catch (err) {
                    dialog('Error', err instanceof Error ? err.message : 'Failed to generate content');
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
      <McpSetupSheet visible={showMcp} offerDismiss onClose={() => setShowMcp(false)} />

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
    <Card pad="none" gap={0} style={styles.fullCard}>
      <View style={[styles.fullCardHead, isEditing && styles.fullCardHeadEditing]}>
        <View style={{ flex: 1 }}>
          <SectionLabel style={{ marginBottom: space[1] }}>Card {c.n} · {c.tag}</SectionLabel>
          {!isEditing && <Text style={styles.fullCardTitle}>{c.title}</Text>}
        </View>
        {!isEditing && <Pressable accessibilityRole="button" onPress={startEdit}><Text style={styles.editLink}>Edit</Text></Pressable>}
      </View>
      <View style={{ paddingHorizontal: space[3], paddingVertical: space[3] }}>
        {isEditing ? (
          <View>
            <Field label="Term" style={styles.manualInputGroup}
              value={editTitle} onChangeText={setEditTitle} placeholder="e.g. Renaissance" />
            <Field label="Definition" style={styles.manualInputGroup} multiline
              value={editBody} onChangeText={setEditBody} placeholder="e.g. Period of cultural revival in Europe" />
            <Field label={isLanguage ? 'Usage note (optional)' : 'Explanation (Optional)'}
              style={styles.manualInputGroup} multiline
              value={editEx} onChangeText={setEditEx} placeholder="Add context, examples, or usage notes" />
            {isLanguage && <LanguageCardEditor value={editLanguage} onChange={setEditLanguage} term={editTitle} />}
          </View>
        ) : (
          c.body && <Text style={styles.fullCardBody}>{c.body}</Text>
        )}
        {!isEditing && c.ex && (
          <View style={styles.exBlock}>
            <SectionLabel style={{ marginBottom: space[1] }}>{isLanguage ? 'Usage note' : 'Explanation'}</SectionLabel>
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
                  key === 'save' ? { color: colors.action, fontFamily: fonts.semibold } : { color: colors.faint }]}>
                  {key === 'save' ? 'Save' : 'Cancel'}
                </Text>
              </Pressable>
            ))
          : (['discard', 'regen'] as const).map((key, j, arr) => (
              <Pressable accessibilityRole="button" key={key} onPress={key === 'discard' ? onDiscard : onRegenerate}
                disabled={isRegenerating}
                style={[styles.fullCardAction, j < arr.length - 1 && { borderRightWidth: 1, borderRightColor: colors.line },
                  isRegenerating && key === 'regen' && { opacity: 0.6 }]}>
                <Text style={[styles.fullCardActionLabel,
                  { color: key === 'regen' ? colors.action : colors.faint,
                    fontFamily: key === 'regen' ? fonts.semibold : fonts.medium }]}>
                  {key === 'discard' ? 'Discard' : isRegenerating ? `Regenerating${regenerateDots}` : 'Regenerate'}
                </Text>
              </Pressable>
            ))}
      </View>
    </Card>
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
    <Card pad="none" gap={0} style={styles.manualCard}>
      <View style={styles.manualCardHead}>
        <View style={{ flex: 1 }}>
          <SectionLabel style={{ marginBottom: space[0] }}>Card M{index + 1} · Manual</SectionLabel>
          {row.saved && !row.editing && <Text style={styles.manualSavedTitle}>{row.term}</Text>}
        </View>
        {row.saved && !row.editing ? (
          <Pressable accessibilityRole="button" onPress={onEdit}><Text style={styles.editLink}>Edit</Text></Pressable>
        ) : !disableDelete ? (
          <IconButton variant="quiet" size="sm" label="Remove draft card" onPress={onDelete}>
            <Icon name="close" size={18} color={colors.faint} />
          </IconButton>
        ) : null}
      </View>

      <View style={styles.manualCardBody}>
        {row.saved && !row.editing ? (
          <>
            <Text style={styles.fullCardBody}>{row.definition}</Text>
            {!!row.explanation && (
              <View style={styles.exBlock}>
                <SectionLabel style={{ marginBottom: space[1] }}>{isLanguage ? 'Usage note' : 'Explanation'}</SectionLabel>
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
            <Text style={[styles.manualCardActionLabel, { color: colors.faint }]}>Cancel</Text>
          </Pressable>
          <Pressable accessibilityRole="button" style={[styles.manualCardAction, styles.manualCardActionBorder]} onPress={handleSaveEdit}>
            <Text style={[styles.manualCardActionLabel, { color: colors.action, fontFamily: fonts.semibold }]}>Save</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.fullCardActions}>
          {(['discard', 'regen'] as const).map((key, j, arr) => (
            <Pressable accessibilityRole="button" key={key} onPress={key === 'discard' ? onDiscard : onRegenerate}
              disabled={isGenerating}
              style={[styles.fullCardAction, j < arr.length - 1 && { borderRightWidth: 1, borderRightColor: colors.line },
                isGenerating && key === 'regen' && { opacity: 0.6 }]}>
              <Text style={[styles.fullCardActionLabel,
                { color: key === 'regen' ? colors.action : colors.faint,
                    fontFamily: key === 'regen' ? fonts.semibold : fonts.medium }]}>
                {key === 'discard' ? 'Discard' : isGenerating ? `Regenerating${regenerateDots}` : 'Regenerate'}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </Card>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  background: { position: 'absolute', left: 0, right: 0, height: 874 },
  waveBack: { position: 'absolute', left: -19 },
  waveFront: { position: 'absolute', left: -19 },
  topbar: {
    paddingHorizontal: layout.screenInline, paddingTop: space[3], paddingBottom: space[3],
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    position: 'relative',
  },
  contentScroll: { flex: 1 },
  contentScrollBody: { paddingBottom: space[6] },
  title: {
    ...oneLine(type.page),
    color: colors.sub,
    // Centred on the bar rather than between the buttons, so it stays centred
    // whatever sits beside it — which means it lies over both of them, and would
    // swallow their taps if it took any.
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    pointerEvents: 'none',
  },

  sectionLabel: {
    ...type.body, fontFamily: fonts.semibold,
    color: colors.text,
    marginBottom: space[2],
  },
  perch: { alignSelf: 'center' },

  // A card's lip is part of it now — components/ui/Card draws it as a real layer
  // inside the card's own box — so the margins here are the gaps you see.
  promptBlock: {
    marginHorizontal: layout.screenInline, marginTop: space[2], marginBottom: space[2],
  },
  // The question above the box is the screen's instruction, so it is set as one.
  // At 12 points it sat under the placeholder it was meant to introduce.
  promptHeading: {
    ...type.body, fontFamily: fonts.semibold,
    marginBottom: space[2],
    letterSpacing: -0.1,
    color: colors.text,
  },
  textarea: {
    ...type.body,
    minHeight: 76,
    color: colors.text,
    padding: space[0],
  },
  // The one row of controls that still needs rules: four targets on one line, and
  // without them the labels read as loose words rather than as separate buttons.
  promptActions: {
    flexDirection: 'row', alignItems: 'center',
    borderTopWidth: 1, borderTopColor: colors.line,
  },
  actionBtn: { minHeight: 44, paddingHorizontal: space[3], paddingVertical: space[3] },
  actionDisabled: { opacity: 0.5 },
  generateActionWrap: { flexDirection: 'row', alignItems: 'center' },
  generateDots: { width: 32, textAlign: 'left', flexShrink: 0 },
  actionLabelRow: { flexDirection: 'row', alignItems: 'center', gap: space[1] },
  actionLabel: { ...type.small, fontFamily: fonts.semibold, color: colors.sub },
  generateLabel: { ...type.small, fontFamily: fonts.semibold },

  quotaBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: space[4], paddingVertical: space[2],
    borderTopWidth: 1, borderTopColor: colors.line,
  },
  quotaBarText: { ...type.caption, fontFamily: fonts.regular, color: colors.faint },
  quotaUpgradeBtn: { minHeight: 44, paddingVertical: space.hair, paddingHorizontal: space[1], justifyContent: 'center' },
  quotaUpgradeBtnText: { ...type.caption, fontFamily: fonts.semibold, color: colors.action },

  genHead: {
    paddingHorizontal: layout.screenInline, paddingTop: space[4], paddingBottom: space.hair,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  fullCard: {
    marginHorizontal: layout.screenInline, marginTop: space[4],
  },
  fullCardHead: {
    paddingHorizontal: space[4], paddingVertical: space[4],
    flexDirection: 'row', alignItems: 'flex-start',
  },
  fullCardHeadEditing: { flexDirection: 'column', alignItems: 'stretch' },
  fullCardTitle: { ...type.body, fontFamily: fonts.semibold, color: colors.text },
  editLink: { ...type.small, fontFamily: fonts.semibold, color: colors.action, marginLeft: space[2] },
  fullCardBody: {
    ...type.small,
    color: colors.faint,
    marginBottom: space[3],
  },
  // A well sunk into the card's face, the way every other quoted block is drawn.
  exBlock: { borderRadius: radius.md, paddingHorizontal: space[3], paddingVertical: space[3], backgroundColor: colors.bg },
  exText: { ...type.small, color: colors.faint },
  fullCardActions: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.line },
  fullCardAction: { flex: 1, paddingVertical: space[4], alignItems: 'center' },
  fullCardActionLabel: { ...type.body, fontFamily: fonts.medium },

  manualSection: { marginTop: space[4], marginHorizontal: layout.screenInline },
  manualList: { gap: space[3] },
  manualCard: {
  },
  manualCardHead: {
    paddingHorizontal: space[4], paddingTop: space[4], paddingBottom: space[3],
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  manualSavedTitle: {
    ...type.body, fontFamily: fonts.semibold,
    marginTop: space[1],
    color: colors.text,
  },
  manualCardBody: { paddingHorizontal: space[4], paddingBottom: space[4] },
  manualCardActions: { borderTopWidth: 1, borderTopColor: colors.line, flexDirection: 'row' },
  manualCardAction: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: space[4] },
  manualCardActionBorder: { borderLeftWidth: 1, borderLeftColor: colors.line },
  manualCardActionLabel: { ...type.body, fontFamily: fonts.medium },
  // A small control, so it carries the shallowest lip.
  manualInputGroup: { marginBottom: space[3] },
  manualInputLabelRow: {
    marginBottom: space[2], flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  manualGenerateButtonDisabled: { opacity: 0.5 },
  manualGenerateButtonText: { ...type.small, fontFamily: fonts.semibold, color: colors.action },
});
