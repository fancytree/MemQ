import { Icon } from '@/components/ui/Icon';
import { oneLine } from '@/theme/typography';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { OwnAiEntry } from '@/components/OwnAiEntry';
import { ImportedCards } from '@/components/ImportedCards';
import { Button } from '@/components/ui/Button';
import { addPasted, asImported, cardReplyCount, parseImport, saveImport, type ImportedCard } from '@/lib/cardImport';
import { ManualTermFields } from '@/components/ui/ManualTermFields';
import { confirmRemoveCard, dialog } from '@/lib/dialog';
import { CloseButton, ConfirmButton } from '@/components/ui/RoundButtons';
import { HomeAsset } from '@/components/HomeAsset';
import { MascotRig, RIG_HAND_LINE } from '@/components/mascot/rig/MascotRig';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { space, radius, type } from '@/theme';
import { layout } from '@/theme/spacing';
import { EdBase } from '@/components/EdBase';
import { SectionLabel } from '@/components/SectionLabel';
import { LanguageCardDetails, LanguageCardEditor } from '@/components/LanguageCardFields';
import { useSubscription } from '@/context/SubscriptionContext';
import { CreditsLine } from '@/components/CreditsLine';
import { canAfford } from '@/lib/aiCredits';
import { AIRefused, callAI } from '@/lib/aiUsage';
import { useCredits } from '@/lib/useCredits';
import { clearCache } from '@/lib/cache';
import { safeBack } from '@/lib/safeBack';
import { supabase } from '@/lib/supabase';
import { createPdfProcessingUrl } from '@/lib/pdfSignedUrl';
import { LanguageCardData, hasLanguageData, languageDataFromLegacyExplanation, normalizeLanguageData } from '@/lib/languageCard';
import { colors, fonts } from '@/theme';
import { IconButton } from '@/components/ui/IconButton';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';

/** The same perch as New Lesson's: this screen is that screen's twin, so the
 *  character stands at the same width and crosses the card on the same hand line. */
const PERCH = 132;
const HAND_LINE = RIG_HAND_LINE;
const CARD_LIFT = -(1 - (HAND_LINE + 7 / 256)) * PERCH;
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
    // 惰性加载，避免原生模块缺失时页面初始化崩溃
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('expo-document-picker');
    cachedDocumentPicker = (mod?.default ?? mod) as DocumentPickerModule;
  } catch {
    cachedDocumentPicker = null;
  }
  return cachedDocumentPicker;
};

export default function AddTermsScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  /** The card runs wider than the content column so the character, which is narrower
   *  than the card, still has card under both hands. */
  const bleed = -((width - layout.screenInline * 2) - PERCH) / 2;
  const { isPro, showPaywall } = useSubscription();
  const { id, termId } = useLocalSearchParams<{ id: string; termId?: string }>();
  const [prompt, setPrompt] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [cards, setCards] = useState<GeneratedCard[]>([]);
  const [saving, setSaving] = useState(false);
  const [loadingTerm, setLoadingTerm] = useState(false);
  const [learningMode, setLearningMode] = useState<'language' | 'knowledge'>('knowledge');
  const [loadingMode, setLoadingMode] = useState(true);
  const [modeLoadFailed, setModeLoadFailed] = useState(false);
  const [manualTerms, setManualTerms] = useState<ManualTermRow[]>([
    { id: '1', term: '', definition: '', explanation: '', languageData: {}, saved: false, editing: true },
  ]);
  const [nextManualId, setNextManualId] = useState(2);
  const [generatingManualId, setGeneratingManualId] = useState<string | null>(null);
  const [regeneratingCardId, setRegeneratingCardId] = useState<string | null>(null);
  const [generateDots, setGenerateDots] = useState('.');
  const [regenerateDots, setRegenerateDots] = useState('.');
  // What is left of the month's AI credits; a set of cards takes three (see app/create).
  const { credits, refresh: refreshCredits, spend } = useCredits();
  const genExhausted = !isPro && !canAfford(credits, 'lesson_generate');

  /* A reply from their own AI, pasted into this box. It is already cards, so it
   * is not sent to a model to be made into cards again — that would spend a
   * generation and lose its questions — it is read on the device instead, and
   * Generate is what reads it (see app/create), so a paste stays in the box to be
   * seen before it turns into cards. The cards are then listed under the box
   * (components/ImportedCards), and the box is given back empty. The lesson
   * already is one kind or the other, so here the cards are saved as its kind
   * whatever the reply calls itself. */
  const [imported, setImported] = useState<ImportedCard[]>([]);

  // The empty card for writing one by hand is folded to one line once there are
  // cards from somewhere else, and never over something typed (see app/create).
  const [manualOpen, setManualOpen] = useState(false);
  const manualStarted = manualTerms.some((row) => row.saved || row.term.trim() || row.definition.trim() || row.explanation.trim());
  const manualFolded = !manualOpen && !manualStarted && (imported.length > 0 || cards.length > 0);
  // Put back as new once emptied this way, so it does not keep the height the
  // pasted reply gave it (see app/create).
  const [boxKey, setBoxKey] = useState(0);
  const isSingleTermEdit = !!termId;

  useEffect(() => {
    if (!id) return;
    void supabase.from('lessons').select('learning_mode').eq('id', id).single()
      .then(({ data, error }) => {
        if (error) {
          setModeLoadFailed(true);
          dialog('Error', 'Failed to load lesson mode. Please reopen this page.');
        }
        else setLearningMode(data?.learning_mode === 'language' ? 'language' : 'knowledge');
        setLoadingMode(false);
      });
  }, [id]);

  /* A "no" from the server, shown in its own words (lib/aiRefusal.ts). The limits
   * live there now, so this is where running out is found out for certain: what
   * the screen counted was only ever a guess at it. Returns whether it was one. */
  const refused = (error: unknown): boolean => {
    if (!(error instanceof AIRefused)) return false;
    // Whatever the screen thought was left, the server has just said otherwise.
    refreshCredits();
    // Out of the free allowance: the one refusal that Pro answers.
    if (error.code === 'quota' && !isPro) {
      // Two ways on: pay, or let their own AI do the writing, which costs nothing
      // and has no limit (app/import-cards.tsx).
      dialog('That is all for now', error.message, [
        { text: 'Not now', style: 'cancel' },
        { text: 'Use my own AI', onPress: () => router.push(`/import-cards?lessonId=${id}` as never) },
        { text: 'See Pro', onPress: () => void showPaywall() },
      ]);
    } else {
      dialog('Not right now', error.message);
    }
    return true;
  };

  const generate = () => {
    const run = async () => {
      if (loadingMode || modeLoadFailed) return;
      if (!prompt.trim()) {
        dialog('Tip', 'Please enter text or a topic first');
        return;
      }
      // Already cards, so it is read here rather than sent: that spends nothing,
      // which is why it comes before the credit check.
      if (cardReplyCount(prompt)) {
        const reply = parseImport(prompt);
        setImported((listed) => addPasted(listed, reply));
        setPrompt('');
        setBoxKey((key) => key + 1);
        return;
      }
      if (genExhausted) { void showPaywall(); return; }
      setPhase('generating');
      try {
        const data = await callAI<{ results?: unknown }>(
          learningMode === 'language' ? 'generate-vocab-terms' : 'generate-terms',
          { type: 'topic', content: prompt.trim() }, 'Failed to generate cards',
        );

        const results: Array<{ term: string; definition: string; explanation?: string; language_data?: LanguageCardData }> =
          Array.isArray(data?.results) ? data.results : [];

        const nextCards: GeneratedCard[] = results.map((item, index) => ({
          n: String(index + 1).padStart(2, '0'),
          tag: 'AI Generated',
          title: item.term,
          body: item.definition,
          ex: item.explanation,
          languageData: normalizeLanguageData(item.language_data),
        }));

        setCards(nextCards);
        setPhase('done');
        // The server counted it; this keeps the number on screen in step.
        if (results.length) spend('lesson_generate');
      } catch (error) {
        if (!refused(error)) dialog('Error', error instanceof Error ? error.message : 'Something went wrong');
        setPhase('idle');
      }
    };
    run();
  };

  const applyGeneratedResults = (results: Array<{ term: string; definition: string; explanation?: string; language_data?: LanguageCardData }>) => {
    const nextCards: GeneratedCard[] = results.map((item, index) => ({
      n: String(index + 1).padStart(2, '0'),
      tag: 'AI Generated',
      title: item.term,
      body: item.definition,
      ex: item.explanation,
      languageData: normalizeLanguageData(item.language_data),
    }));
    setCards(nextCards);
    setPhase('done');
  };

  const handlePickPdfAndGenerate = async () => {
    if (loadingMode || modeLoadFailed) return;
    // Not gated on generated lessons: a PDF has an allowance of its own, and the
    // server says when that one is used up.
    try {
      const picker = getDocumentPicker();
      if (!picker) {
        dialog('Unavailable', 'Document picker is unavailable in current build.');
        return;
      }
      const picked = await picker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });
      if (picked.canceled || !picked.assets || picked.assets.length === 0) {
        return;
      }

      const asset = picked.assets[0];
      if (!asset.uri) {
        dialog('Error', 'Invalid file');
        return;
      }

      setPhase('generating');
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData.user?.id;
      if (!userId) throw new Error('Please sign in to upload a PDF.');
      const fileName = `${userId}/${Date.now()}-${asset.name || 'upload.pdf'}`;

      const fileResp = await fetch(asset.uri);
      const fileBlob = await fileResp.blob();

      const { error: uploadError } = await supabase.storage
        .from('pdfs')
        .upload(fileName, fileBlob, { contentType: 'application/pdf' });
      if (uploadError) {
        throw new Error(`Failed to upload file: ${uploadError.message}`);
      }

      const pdfUrl = await createPdfProcessingUrl(supabase.storage.from('pdfs'), fileName);
      const data = await callAI<{ results?: unknown }>('process-file', { pdf_url: pdfUrl }, 'Failed to process file');

      const results: Array<{ term: string; definition: string; explanation?: string }> =
        Array.isArray(data?.results) ? data.results : [];
      applyGeneratedResults(results);
      if (results.length) spend('pdf_process');
    } catch (error) {
      if (!refused(error)) dialog('Error', error instanceof Error ? error.message : 'Failed to process PDF');
      setPhase('idle');
    }
  };

  const isGenerating = phase === 'generating';

  useEffect(() => {
    if (!isGenerating) {
      setGenerateDots('.');
        return;
      }
    const timer = setInterval(() => {
      setGenerateDots((prev) => (prev === '...' ? '.' : `${prev}.`));
    }, 350);
    return () => clearInterval(timer);
  }, [isGenerating]);

  useEffect(() => {
    const isRegenerating = regeneratingCardId !== null || generatingManualId !== null;
    if (!isRegenerating) {
      setRegenerateDots('.');
          return;
        }
    const timer = setInterval(() => {
      setRegenerateDots((prev) => (prev === '...' ? '.' : `${prev}.`));
    }, 350);
    return () => clearInterval(timer);
  }, [regeneratingCardId, generatingManualId]);

  useEffect(() => {
    const loadEditingTerm = async () => {
      if (!termId) return;
      setLoadingTerm(true);
      try {
        const { data, error } = await supabase
          .from('terms')
          .select('id, term, definition, explanation, language_data')
          .eq('id', termId)
          .single();
        if (error || !data) {
          dialog('Error', 'Failed to load card');
          return;
        }
        const legacyLanguageData = languageDataFromLegacyExplanation(data.explanation);
        setManualTerms([
          {
            id: data.id,
            term: data.term || '',
            definition: data.definition || '',
            explanation: hasLanguageData(legacyLanguageData) ? '' : data.explanation || '',
            languageData: data.language_data ? normalizeLanguageData(data.language_data) : legacyLanguageData,
            saved: true,
            editing: true,
            },
          ]);
      } finally {
        setLoadingTerm(false);
      }
    };
    loadEditingTerm();
  }, [termId]);

  const updateManualTerm = (
    id: string,
    field: 'term' | 'definition' | 'explanation' | 'languageData',
    value: string | LanguageCardData
  ) => {
    setManualTerms((prev) =>
      prev.map((row) => (row.id === id ? { ...row, [field]: value } : row))
    );
  };

  const removeManualRow = (id: string) => {
    setManualTerms((prev) => {
      if (prev.length === 1) return prev;
      return prev.filter((row) => row.id !== id);
    });
  };

  const handleSaveManualRow = (
    rowId: string,
    next: Pick<ManualTermRow, 'term' | 'definition' | 'explanation' | 'languageData'>
  ) => {
    setManualTerms((prev) => {
      const updated = prev.map((row) => (row.id === rowId ? { ...row, ...next } : row));
      const finalized = updated.map((row) =>
        row.id === rowId ? { ...row, saved: true, editing: false } : row
      );
      if (isSingleTermEdit) return finalized;
      const hasEmptyCard = finalized.some(
        (row) => row.term.trim().length === 0 && row.definition.trim().length === 0
      );
      if (hasEmptyCard) return finalized;
      return [
        ...finalized,
        {
          id: String(nextManualId),
          term: '',
          definition: '',
          explanation: '',
          languageData: {},
          saved: false,
          editing: true,
        },
      ];
    });
    if (!isSingleTermEdit) {
      setNextManualId((prev) => prev + 1);
    }
  };

  const handleEditManualRow = (rowId: string) => {
    setManualTerms((prev) =>
      prev.map((row) => (row.id === rowId ? { ...row, editing: true } : row))
    );
  };

  const handleCancelManualEdit = (rowId: string) => {
    setManualTerms((prev) =>
      prev.map((row) => (row.id === rowId ? { ...row, editing: false } : row))
    );
    // Cancel on a card nothing was typed into puts it away again (see manualFolded).
    setManualOpen(false);
  };

  const handleManualDiscard = (rowId: string) => {
    setManualTerms((prev) => {
      const next = prev.filter((row) => row.id !== rowId);
      if (next.length > 0) return next;
      return [
        {
          id: String(nextManualId),
          term: '',
          definition: '',
          explanation: '',
          languageData: {},
          saved: false,
          editing: true,
        },
      ];
    });
    setNextManualId((prev) => prev + 1);
  };

  const handleManualRegenerate = async (rowId: string) => {
    const row = manualTerms.find((item) => item.id === rowId);
    if (!row || !row.term.trim()) {
      dialog('Tip', 'Please add a term first');
      return;
    }
    try {
      setGeneratingManualId(rowId);
      const generated = await generateManualFromTerm(row.term.trim());
      setManualTerms((prev) =>
        prev.map((item) =>
          item.id === rowId
            ? {
                ...item,
                definition: generated.definition,
                explanation: generated.explanation,
                languageData: generated.languageData,
                saved: true,
                editing: false,
              }
            : item
        )
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to regenerate';
      if (!refused(error)) dialog('Error', message);
    } finally {
      setGeneratingManualId((prev) => (prev === rowId ? null : prev));
    }
  };

  const handleDiscardGeneratedCard = (cardNo: string) => {
    setCards((prev) => prev.filter((card) => card.n !== cardNo));
  };

  const handleRegenerateGeneratedCard = async (cardNo: string) => {
    const card = cards.find((item) => item.n === cardNo);
    if (!card || !card.title.trim()) {
      dialog('Tip', 'This card has no term to regenerate');
      return;
    }
    try {
      setRegeneratingCardId(cardNo);
      const generated = await generateManualFromTerm(card.title.trim());
      setCards((prev) =>
        prev.map((item) =>
          item.n === cardNo
            ? {
                ...item,
                body: generated.definition,
                ex: generated.explanation,
                languageData: generated.languageData,
              }
            : item
        )
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to regenerate';
      if (!refused(error)) dialog('Error', message);
    } finally {
      setRegeneratingCardId((prev) => (prev === cardNo ? null : prev));
    }
  };

  const generateManualFromTerm = async (
    term: string
  ): Promise<{ definition: string; explanation: string; languageData: LanguageCardData }> => {
    if (loadingMode || modeLoadFailed) throw new Error('Lesson mode is unavailable');
    // `purpose: 'card'` asks for the one card and is counted as one, not as a
    // generated lesson.
    const data = await callAI<{ results?: Array<{ definition?: string; explanation?: string; language_data?: unknown }> }>(
      learningMode === 'language' ? 'generate-vocab-terms' : 'generate-terms',
      { type: 'topic', content: term, purpose: 'card' }, 'Failed to generate content',
    );

    const first = data?.results?.[0];
    if (!first || typeof first.definition !== 'string') {
      throw new Error('No generated result for this term');
    }
    spend('card_fill');

          return {
      definition: first.definition || '',
      explanation: first.explanation || '',
      languageData: normalizeLanguageData(first.language_data),
    };
  };

  const handleSave = async () => {
    if (loadingMode || modeLoadFailed) return;
    if (!id) {
      dialog('Error', 'Lesson ID is required');
      return;
    }
    if (saving) return;

    setSaving(true);
    try {
      if (isSingleTermEdit && termId) {
        const target = manualTerms[0];
        if (!target || !target.term.trim() || !target.definition.trim()) {
          dialog('Error', 'Please fill in Term and Definition');
      return;
    }
        const { error } = await supabase
          .from('terms')
          .update({
            term: target.term.trim(),
            definition: target.definition.trim(),
            explanation: target.explanation.trim() || null,
            language_data: learningMode === 'language' && hasLanguageData(target.languageData) ? target.languageData : null,
          })
          .eq('id', termId);
        if (error) {
          dialog('Error', `Failed to update card: ${error.message}`);
        return;
      }
        void clearCache('LESSON_DETAIL', id as string);
        router.replace(`/lessons/${id}` as any);
        return;
      }

      const validManualTerms = manualTerms.filter(
        (row) => row.term.trim().length > 0 && row.definition.trim().length > 0
      );
      const validGeneratedTerms = cards
        .filter((card) => card.title.trim().length > 0 && (card.body || '').trim().length > 0)
        .map((card) => ({
          term: card.title.trim(),
          definition: (card.body || '').trim(),
          explanation: (card.ex || '').trim() || null,
          language_data: learningMode === 'language' && card.languageData && hasLanguageData(card.languageData) ? card.languageData : null,
        }));
      // Pasted in with their questions, which are saved with them.
      const pastedTerms = imported.map((card) => {
        const details = normalizeLanguageData(card.language_data);
        return {
          term: card.term,
          definition: card.definition,
          explanation: card.explanation || null,
          language_data: learningMode === 'language' && hasLanguageData(details) ? details : null,
          ...(card.questions.length ? { questions: card.questions } : {}),
        };
      });

      const allTerms = [
        ...pastedTerms,
        ...validGeneratedTerms,
        ...validManualTerms.map((row) => ({
          term: row.term.trim(),
          definition: row.definition.trim(),
          explanation: row.explanation.trim() || null,
          language_data: learningMode === 'language' && hasLanguageData(row.languageData) ? row.languageData : null,
        })),
      ];

      if (allTerms.length === 0) {
        dialog('Error', 'Add at least one card first');
        return;
      }

      // Cards that came with their own questions are saved with them, through the
      // database functions the MCP endpoint uses (lib/cardImport): a card and its
      // questions go in together or not at all. Those functions take the plain
      // cards beside them too, so one call covers the lot.
      if (allTerms.some((row) => 'questions' in row)) {
        await saveImport(supabase as never, asImported(allTerms), { kind: 'existing', lesson_id: id as string, learning_mode: learningMode });
        void clearCache('LESSON_DETAIL', id as string);
        router.replace(`/lessons/${id}` as any);
        return;
      }

      const insertData = allTerms.map((row) => ({
        lesson_id: id,
        term: row.term,
        definition: row.definition,
        explanation: row.explanation,
        language_data: row.language_data,
      }));

      const { error } = await supabase.from('terms').insert(insertData);
      if (error) {
        dialog('Error', `Failed to save terms: ${error.message}`);
        return;
      }

      // 词条变了，让详情页和列表重新从服务端拉取最新数据
      void clearCache('LESSON_DETAIL', id as string);

      router.replace(`/lessons/${id}` as any);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Something went wrong';
      dialog('Error', message);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (id) {
      safeBack(`/lessons/${id}`);
        return;
      }
    safeBack('/(tabs)/library');
  };

    return (
    <EdBase bottomInset={0} scroll={false}>
      <LinearGradient pointerEvents="none" colors={[colors.limePale, colors.limeBright, colors.bg]} style={[styles.headerGradient, { top: -insets.top, height: insets.top + 150 }]} />
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
        <CloseButton onPress={handleCancel} label="Cancel" />
        <Text style={styles.title}>{isSingleTermEdit ? 'Edit Card' : 'New Cards'}</Text>
        <ConfirmButton onPress={handleSave} label="Save cards"
          disabled={loadingMode || modeLoadFailed} busy={saving} />
        </View>

      {!isSingleTermEdit && (
        <ScrollView
        style={styles.contentScroll}
        contentContainerStyle={styles.contentScrollBody}
        showsVerticalScrollIndicator={false}
      >
      {/* Prompt block, with the character resting on its top edge. It watches the
          box while it is empty and thinks while the cards are being written. */}
      <MascotRig width={PERCH} calm style={styles.perch} hands
        mood={isGenerating ? 'thinking' : 'onboarding'}
        look={isGenerating ? PROMPT_GAZE : undefined}
        behind={(
      <Card pad="none" gap={0} style={[styles.promptBlock, { marginTop: CARD_LIFT, marginLeft: bleed, marginRight: bleed }]}>
        <View style={{ paddingHorizontal: space[4], paddingTop: space[3], paddingBottom: space[1] }}>
          <SectionLabel
            style={styles.promptHeading}
          >
            What do you want to learn?
          </SectionLabel>
          <TextInput accessibilityLabel="Type what you want to learn, paste text, or enter a topic."
            key={boxKey}
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
              <Icon name="paperclip" size={13} color={colors.sub} />
              <Text style={styles.actionLabel}>Attach</Text>
            </View>
          </Pressable>
          <Pressable accessibilityRole="button"
            disabled={isGenerating || loadingMode || modeLoadFailed}
            onPress={genExhausted ? () => void showPaywall() : generate}
            style={[styles.actionBtn, { marginLeft: 'auto' }]}
          >
            <View style={styles.generateActionWrap}>
              {isGenerating ? (
                <>
                  <Text style={[styles.generateLabel, { color: colors.sub }]}>Generating</Text>
                  <Text style={[styles.generateLabel, styles.generateDots, { color: colors.sub }]}>
                    {generateDots}
                  </Text>
                </>
              ) : genExhausted ? (
                <Text style={[styles.generateLabel, { color: colors.sub }]}>🔒 Upgrade →</Text>
              ) : (
                <Text style={[styles.generateLabel, { color: colors.sub }]}>Generate →</Text>
              )}
            </View>
          </Pressable>
        </View>
        {/* What is left of the month's AI credits (components/CreditsLine). */}
        {credits && (credits.low || !credits.isPro) && (
          <View style={styles.quotaBar}>
            <CreditsLine credits={credits} always onUpgrade={() => void showPaywall()} style={styles.quotaLine} />
          </View>
        )}
        </Card>
      )} />

      {/* The way with no limit (components/OwnAiEntry). Opened from here it adds
          to this lesson rather than making a new one. */}
      <View style={styles.ownAi}><OwnAiEntry lessonId={id} topic={prompt} /></View>

      {/* What was pasted in from their own AI: short, and only removable. */}
      {imported.length > 0 && (
        <>
          <View style={styles.genHead}>
            <SectionLabel>{`Imported — ${imported.length} ${imported.length === 1 ? 'card' : 'cards'}`}</SectionLabel>
          </View>
          <View style={styles.importedList}>
            <ImportedCards cards={imported} onRemove={(cardId) => setImported((listed) => listed.filter((card) => card.id !== cardId))} />
          </View>
        </>
      )}

      {/* Nothing is said while the box is empty: the character is already watching
          it, and a heading over an empty dashed box only names the emptiness. */}
      {cards.length > 0 && (
        <View style={styles.genHead}>
          <SectionLabel>{`Generated — ${cards.length} cards`}</SectionLabel>
        </View>
      )}

      {/* Generated cards */}
      {cards.map((c) => (
        <FullCard
          key={c.n}
          card={c}
          isLanguage={learningMode === 'language'}
          isRegenerating={regeneratingCardId === c.n}
          regenerateDots={regenerateDots}
          onDiscard={() => handleDiscardGeneratedCard(c.n)}
          onRegenerate={() => handleRegenerateGeneratedCard(c.n)}
          onUpdate={(updated) =>
            setCards((prev) => prev.map((item) => (item.n === updated.n ? updated : item)))
          }
        />
      ))}

      {/* Manual terms */}
      {manualFolded && (
        <View style={styles.manualOffer}>
          <Button variant="quiet" size="sm" label="Add a card by hand"
            icon={<Icon name="plus" size={16} color={colors.action} />}
            onPress={() => setManualOpen(true)} />
        </View>
      )}
      {!manualFolded && <View style={styles.manualSection}>
        <View style={styles.manualList}>
          {manualTerms.map((row, index) => (
            <ManualCard
              key={row.id}
              index={index}
              row={row}
              isLanguage={learningMode === 'language'}
              disableDelete={manualTerms.length === 1}
              onDelete={() => removeManualRow(row.id)}
              onEdit={() => handleEditManualRow(row.id)}
              onCancelEdit={() => handleCancelManualEdit(row.id)}
              onDiscard={() => handleManualDiscard(row.id)}
              onRegenerate={() => handleManualRegenerate(row.id)}
              isGenerating={generatingManualId === row.id}
              regenerateDots={regenerateDots}
              hideInlineEditActions={isSingleTermEdit}
              hideDeleteButton={isSingleTermEdit}
              hideManualMeta={isSingleTermEdit}
              onDraftChange={(field, value) => updateManualTerm(row.id, field, value)}
              onGenerate={async (term) => {
                if (!term.trim()) {
                  dialog('Tip', 'Please enter a term first');
                  return null;
                }
                try {
                  setGeneratingManualId(row.id);
                  return await generateManualFromTerm(term.trim());
                } catch (error) {
                  const message =
                    error instanceof Error ? error.message : 'Failed to generate content';
                  if (!refused(error)) dialog('Error', message);
                  return null;
                } finally {
                  setGeneratingManualId((prev) => (prev === row.id ? null : prev));
                }
              }}
              onSave={(next) => handleSaveManualRow(row.id, next)}
            />
          ))}
        </View>
      </View>}

      <View style={{ height: 24 }} />
      </ScrollView>
      )}

      {loadingTerm && (
        <View style={styles.loadingWrap}>
          <Text style={styles.loadingText}>Loading card...</Text>
                </View>
                )}

      {isSingleTermEdit && !loadingTerm && (
        <ScrollView style={styles.singleEditWrap} contentContainerStyle={{ paddingBottom: space[8] }} keyboardShouldPersistTaps="handled">
          <View style={styles.manualSection}>
            <View style={styles.manualList}>
              {manualTerms.map((row, index) => (
                <ManualCard
                  key={row.id}
                  index={index}
                  row={row}
                  isLanguage={learningMode === 'language'}
                  disableDelete={true}
                  onDelete={() => {}}
                  onEdit={() => handleEditManualRow(row.id)}
                  onCancelEdit={() => handleCancelManualEdit(row.id)}
                  onDiscard={() => {}}
                  onRegenerate={() => handleManualRegenerate(row.id)}
                  isGenerating={generatingManualId === row.id}
                  regenerateDots={regenerateDots}
                  hideInlineEditActions={true}
                  hideDeleteButton={true}
                  hideManualMeta={true}
                  onDraftChange={(field, value) => updateManualTerm(row.id, field, value)}
                  onGenerate={async (term) => {
                    if (!term.trim()) {
                      dialog('Tip', 'Please enter a term first');
                      return null;
                    }
                    try {
                      setGeneratingManualId(row.id);
                      return await generateManualFromTerm(term.trim());
                    } catch (error) {
                      const message =
                        error instanceof Error ? error.message : 'Failed to generate content';
                      if (!refused(error)) dialog('Error', message);
                      return null;
                    } finally {
                      setGeneratingManualId((prev) => (prev === row.id ? null : prev));
                    }
                  }}
                  onSave={(next) => handleSaveManualRow(row.id, next)}
                />
              ))}
            </View>
          </View>
        </ScrollView>
      )}
    </EdBase>
  );
}

function FullCard({
  card: c,
  isLanguage,
  isRegenerating,
  regenerateDots,
  onDiscard,
  onRegenerate,
  onUpdate,
}: {
  card: GeneratedCard;
  isLanguage: boolean;
  isRegenerating: boolean;
  regenerateDots: string;
  onDiscard: () => void;
  onRegenerate: () => void;
  onUpdate: (card: GeneratedCard) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(c.title);
  const [editBody, setEditBody] = useState(c.body || '');
  const [editEx, setEditEx] = useState(c.ex || '');
  const [editLanguage, setEditLanguage] = useState<LanguageCardData>(c.languageData || {});

  const startEdit = () => {
    setEditTitle(c.title);
    setEditBody(c.body || '');
    setEditEx(c.ex || '');
    setEditLanguage(c.languageData || {});
    setIsEditing(true);
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setEditTitle(c.title);
    setEditBody(c.body || '');
    setEditEx(c.ex || '');
    setEditLanguage(c.languageData || {});
  };

  const saveEdit = () => {
    const nextCard: GeneratedCard = {
      ...c,
      title: editTitle.trim() || c.title,
      body: editBody.trim() || undefined,
      ex: editEx.trim() || undefined,
      languageData: editLanguage,
    };
    onUpdate(nextCard);
    setIsEditing(false);
  };

    return (
    <Card pad="none" gap={0} style={styles.fullCard}>
      <View style={[styles.fullCardHead, isEditing && styles.fullCardHeadEditing]}>
        <View style={{ flex: 1 }}>
          <SectionLabel style={{ marginBottom: space[1] }}>
            Card {c.n} · {c.tag}
          </SectionLabel>
          {!isEditing && <Text style={styles.fullCardTitle}>{c.title}</Text>}
        </View>
          {!isEditing && (
          <IconButton variant="quiet" size="sm" label={`Remove ${c.title}`}
            onPress={() => confirmRemoveCard(c.title, onDiscard)}>
            <Icon name="delete" size={18} color={colors.sub} />
          </IconButton>
        )}
      </View>
      <View style={styles.fullCardFace}>
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
          c.body && <View style={styles.meaning}><Text style={styles.fullCardBody}>{c.body}</Text></View>
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
          ? (['cancel', 'save'] as const).map((key, j, arr) => {
              const isSave = key === 'save';
              return (
                <Pressable accessibilityRole="button"
                  key={key}
                  onPress={isSave ? saveEdit : cancelEdit}
                  style={[
                    styles.manualCardAction,
                    j > 0 && styles.manualCardActionBorder,
                  ]}
                >
                  <Text
                    style={[
                      styles.manualCardActionLabel,
                      isSave
                        ? { color: colors.sub, fontFamily: fonts.bold }
                        : { color: colors.sub },
                    ]}
                  >
                    {isSave ? 'Save' : 'Cancel'}
                  </Text>
                </Pressable>
              );
            })
          : (['edit', 'regen'] as const).map((key, j, arr) => {
              const isRegen = key === 'regen';
              const label = key === 'edit' ? 'Edit' : isRegenerating ? `Regenerating${regenerateDots}` : 'Regenerate';
              return (
                <Pressable accessibilityRole="button"
                  key={key}
                  onPress={key === 'edit' ? startEdit : onRegenerate}
                  disabled={isRegenerating}
                  style={[
                    styles.fullCardAction,
                    j < arr.length - 1 && { borderRightWidth: 1, borderRightColor: colors.line },
                    isRegenerating && isRegen && { opacity: 0.6 },
                  ]}
                >
                  <Text
                    style={[
                      styles.fullCardActionLabel,
                      { color: isRegen ? colors.sub : colors.sub, fontWeight: isRegen ? '700' : '400' },
                    ]}
                  >
                    {label}
                </Text>
                </Pressable>
              );
            })}
              </View>
    </Card>
  );
}

function ManualCard({
  index,
  row,
  isLanguage,
  disableDelete,
  onDelete,
  onEdit,
  onCancelEdit,
  onDiscard,
  onRegenerate,
  isGenerating,
  regenerateDots,
  hideInlineEditActions,
  hideDeleteButton,
  hideManualMeta,
  onDraftChange,
  onGenerate,
  onSave,
}: {
  index: number;
  row: ManualTermRow;
  isLanguage: boolean;
  disableDelete: boolean;
  onDelete: () => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onDiscard: () => void;
  onRegenerate: () => void;
  isGenerating: boolean;
  regenerateDots: string;
  hideInlineEditActions?: boolean;
  hideDeleteButton?: boolean;
  hideManualMeta?: boolean;
  onDraftChange: (
    field: 'term' | 'definition' | 'explanation' | 'languageData',
    value: string | LanguageCardData
  ) => void;
  onGenerate: (term: string) => Promise<{ definition: string; explanation: string; languageData: LanguageCardData } | null>;
  onSave: (next: Pick<ManualTermRow, 'term' | 'definition' | 'explanation' | 'languageData'>) => void;
}) {
  const shouldRenderHeader =
    !hideManualMeta || !hideDeleteButton || (row.saved && !row.editing);

  const [termDraft, setTermDraft] = useState(row.term);
  const [definitionDraft, setDefinitionDraft] = useState(row.definition);
  const [explanationDraft, setExplanationDraft] = useState(row.explanation);
  const [languageDraft, setLanguageDraft] = useState<LanguageCardData>(row.languageData);

  useEffect(() => {
    setTermDraft(row.term);
    setDefinitionDraft(row.definition);
    setExplanationDraft(row.explanation);
    setLanguageDraft(row.languageData);
  }, [row.term, row.definition, row.explanation, row.languageData]);

  const handleCancelEdit = () => {
    setTermDraft(row.term);
    setDefinitionDraft(row.definition);
    setExplanationDraft(row.explanation);
    setLanguageDraft(row.languageData);
    onCancelEdit();
  };

  const handleSaveEdit = () => {
    onSave({
      term: termDraft,
      definition: definitionDraft,
      explanation: explanationDraft,
      languageData: languageDraft,
    });
  };

  const handleGenerate = async () => {
    const generated = await onGenerate(termDraft);
    if (!generated) return;
    setDefinitionDraft(generated.definition);
    setExplanationDraft(generated.explanation);
    setLanguageDraft(generated.languageData);
    onDraftChange('definition', generated.definition);
    onDraftChange('explanation', generated.explanation);
    onDraftChange('languageData', generated.languageData);
  };

    return (
    <Card pad="none" gap={0} style={styles.manualCard}>
      {shouldRenderHeader && (
        <View style={styles.manualCardHead}>
          <View style={{ flex: 1 }}>
            {!hideManualMeta && (
              <SectionLabel style={{ marginBottom: space[0] }}>Card M{index + 1} · Manual</SectionLabel>
            )}
            {row.saved && !row.editing && <Text style={styles.manualSavedTitle}>{row.term}</Text>}
                  </View>
          {row.saved && !row.editing ? (
            <IconButton variant="quiet" size="sm" label={`Remove ${row.term}`}
              onPress={() => confirmRemoveCard(row.term, onDiscard)}>
              <Icon name="delete" size={18} color={colors.sub} />
            </IconButton>
          ) : !hideDeleteButton && !disableDelete ? (
            <IconButton variant="quiet" size="sm" label="Remove draft card"
              onPress={() => (row.term.trim() || row.definition.trim() || row.explanation.trim()
                ? confirmRemoveCard(row.term.trim(), onDelete) : onDelete())}>
              <Icon name="close" size={18} color={colors.sub} />
            </IconButton>
          ) : null}
                      </View>
                    )}

      <View style={styles.manualCardBody}>
        {row.saved && !row.editing ? (
          <>
            <View style={styles.meaning}><Text style={styles.fullCardBody}>{row.definition}</Text></View>
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
      {!hideInlineEditActions && (!row.saved || row.editing) ? (
        <View style={styles.manualCardActions}>
          <Pressable accessibilityRole="button" style={styles.manualCardAction} onPress={handleCancelEdit}>
            <Text style={[styles.manualCardActionLabel, { color: colors.sub }]}>Cancel</Text>
          </Pressable>
          <Pressable accessibilityRole="button" style={[styles.manualCardAction, styles.manualCardActionBorder]} onPress={handleSaveEdit}>
            <Text style={[styles.manualCardActionLabel, { color: colors.sub, fontFamily: fonts.bold }]}>
              Save
                    </Text>
          </Pressable>
                      </View>
                    ) : (
        <View style={styles.fullCardActions}>
          {(['edit', 'regen'] as const).map((key, j, arr) => {
            const isRegen = key === 'regen';
            const label = key === 'edit' ? 'Edit' : isGenerating ? `Regenerating${regenerateDots}` : 'Regenerate';
            return (
              <Pressable accessibilityRole="button"
                key={key}
                onPress={key === 'edit' ? onEdit : onRegenerate}
                disabled={isGenerating}
                    style={[
                  styles.fullCardAction,
                  j < arr.length - 1 && { borderRightWidth: 1, borderRightColor: colors.line },
                  isGenerating && isRegen && { opacity: 0.6 },
                ]}
              >
                <Text
                  style={[
                    styles.fullCardActionLabel,
                    { color: isRegen ? colors.sub : colors.sub, fontWeight: isRegen ? '700' : '400' },
                  ]}
                >
                  {label}
                      </Text>
              </Pressable>
            );
          })}
            </View>
          )}
                </Card>
  );
}

const styles = StyleSheet.create({
  headerGradient: { position: 'absolute', left: 0, right: 0 },
  topbar: {
    paddingHorizontal: layout.screenInline,
    paddingTop: space[5],
    paddingBottom: space[4],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    position: 'relative',
  },
  contentScroll: {
    flex: 1,
  },
  contentScrollBody: {
    paddingBottom: space[6],
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    ...type.caption,
    color: colors.sub,
  },
  singleEditWrap: {
    flex: 1,
    paddingTop: space[2],
  },
  title: { ...oneLine(type.page), color: colors.sub, position: 'absolute', left: 0, right: 0, textAlign: 'center', pointerEvents: 'none' },

  perch: { alignSelf: 'center' },
  waveBack: { position: 'absolute', left: -19 },
  waveFront: { position: 'absolute', left: -19 },
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
  // Grows up to about six lines, then scrolls inside itself (see app/create).
  textarea: {
    ...type.body,
    minHeight: 76,
    maxHeight: 148,
    letterSpacing: -0.1,
    color: colors.text,
    padding: space[0],
  },
  promptActions: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  actionBtn: { minHeight: 44, paddingHorizontal: space[3], paddingVertical: space[3] },
  actionDisabled: { opacity: 0.5 },
  generateActionWrap: { flexDirection: 'row', alignItems: 'center' },
  generateDots: { width: 32, textAlign: 'left', flexShrink: 0 },
  quotaBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: space[3], paddingVertical: space[2],
    borderTopWidth: 1, borderTopColor: colors.line,
    backgroundColor: colors.bg,
  },
  quotaLine: { flex: 1 },
  // Its own side margin: on this page each block pads itself.
  ownAi: { paddingHorizontal: layout.screenInline, paddingTop: space[4] },
  importedList: { paddingHorizontal: layout.screenInline, paddingTop: space[2] },
  actionLabelRow: { flexDirection: 'row', alignItems: 'center', gap: space[1] },
  actionLabel: {
    ...type.caption, fontFamily: fonts.bold,
    color: colors.sub,
    letterSpacing: 0.5,
  },
  generateLabel: {
    ...type.small, fontFamily: fonts.bold,
  },

  genHead: {
    paddingHorizontal: space[4],
    paddingTop: space[4],
    paddingBottom: space.hair,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  skeletonCard: {
    backgroundColor: colors.surf,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    padding: space[4],
    marginBottom: space[1],
  },
  skeletonBar: { height: 8, backgroundColor: colors.line, borderRadius: radius.sm, opacity: 0.5 },

  fullCard: { marginHorizontal: layout.screenInline, marginTop: space[2] },
  // The measures every card on these two screens is drawn to; the one they came
  // from is components/ImportedCards, and app/create holds the same set.
  fullCardHead: {
    paddingHorizontal: space[4],
    paddingTop: space[4],
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  fullCardFace: { paddingHorizontal: space[4], paddingTop: space[3], paddingBottom: space[4] },
  /* What the card means, on the panel a card keeps for what is inside it. */
  meaning: { borderRadius: radius.md, backgroundColor: colors.panel, paddingHorizontal: space[3], paddingVertical: space[3] },
  fullCardHeadEditing: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  fullCardTitle: {
    ...type.body, fontFamily: fonts.semibold,
    color: colors.text,
  },
  editLink: { ...type.caption, fontFamily: fonts.semibold, color: colors.action, marginLeft: space[2] },

  fullCardBody: { ...type.small, color: colors.sub },
  exBlock: {
    borderRadius: radius.md,
    paddingHorizontal: space[3],
    paddingVertical: space[3],
    backgroundColor: colors.panel,
    marginTop: space[3],
  },
  exText: { ...type.caption, fontFamily: fonts.utility, color: colors.sub },

  fullCardActions: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.line },
  fullCardAction: { flex: 1, paddingVertical: space[4], alignItems: 'center' },
  fullCardActionLabel: { ...type.body, fontFamily: fonts.medium },

  manualSection: {
    marginTop: space[2],
    marginHorizontal: layout.screenInline,
  },
  manualOffer: { marginTop: space[3], alignItems: 'center' },
  manualSectionHead: {
    marginBottom: space[2],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  manualList: {
    gap: space[2],
  },
  manualCard: {},
  manualCardHead: {
    paddingHorizontal: space[4],
    paddingTop: space[4],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  manualSavedTitle: {
    ...type.body, fontFamily: fonts.semibold,
    marginTop: space[1],
    color: colors.text,
  },
  manualCardBody: {
    paddingHorizontal: space[4],
    paddingTop: space[3],
    paddingBottom: space[4],
  },
  manualCardActions: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
    flexDirection: 'row',
  },
  manualCardAction: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space[4],
  },
  manualCardActionBorder: {
    borderLeftWidth: 1,
    borderLeftColor: colors.line,
  },
  manualCardActionLabel: {
    ...type.body, fontFamily: fonts.medium,
  },
  manualCardIndex: {
    ...type.caption, fontFamily: fonts.bold,
    color: colors.sub,
  },
  manualInputGroup: {
    marginBottom: space[2],
  },
  manualInputLabelRow: {
    marginBottom: space[1],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  manualGenerateButtonDisabled: {
    opacity: 0.5,
  },
  manualGenerateButtonText: {
    ...type.caption, fontFamily: fonts.bold,
    color: colors.action,
  },
});

