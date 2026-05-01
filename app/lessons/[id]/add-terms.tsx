import { EdBase } from '@/components/EdBase';
import { SectionLabel } from '@/components/SectionLabel';
import { clearCache } from '@/lib/cache';
import { safeBack } from '@/lib/safeBack';
import { supabase } from '@/lib/supabase';
import { colors, fonts } from '@/theme';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

type Phase = 'idle' | 'generating' | 'done';

interface GeneratedCard {
  n: string;
  tag: string;
  title: string;
  body?: string;
  ex?: string;
}

interface ManualTermRow {
  id: string;
  term: string;
  definition: string;
  explanation: string;
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

export default function CreateScreen() {
  const { id, termId } = useLocalSearchParams<{ id: string; termId?: string }>();
  const [prompt, setPrompt] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [cards, setCards] = useState<GeneratedCard[]>([]);
  const [saving, setSaving] = useState(false);
  const [loadingTerm, setLoadingTerm] = useState(false);
  const [manualTerms, setManualTerms] = useState<ManualTermRow[]>([
    { id: '1', term: '', definition: '', explanation: '', saved: false, editing: true },
  ]);
  const [nextManualId, setNextManualId] = useState(2);
  const [generatingManualId, setGeneratingManualId] = useState<string | null>(null);
  const [regeneratingCardId, setRegeneratingCardId] = useState<string | null>(null);
  const [generateDots, setGenerateDots] = useState('.');
  const [regenerateDots, setRegenerateDots] = useState('.');
  const isSingleTermEdit = !!termId;

  const generate = () => {
    const run = async () => {
      if (!prompt.trim()) {
        Alert.alert('Tip', 'Please enter text or a topic first');
      return;
    }
      setPhase('generating');
      try {
        const { data, error } = await supabase.functions.invoke('generate-terms', {
          body: {
            type: 'topic',
            content: prompt.trim(),
          },
        });

        if (error) {
          throw new Error(error.message || 'Failed to generate terms');
        }

        const results: Array<{ term: string; definition: string; explanation?: string }> =
          Array.isArray(data?.results) ? data.results : [];

        const nextCards: GeneratedCard[] = results.map((item, index) => ({
          n: String(index + 1).padStart(2, '0'),
          tag: 'AI Generated',
          title: item.term,
          body: item.definition,
          ex: item.explanation,
        }));

        setCards(nextCards);
        setPhase('done');
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Something went wrong';
        Alert.alert('Error', message);
        setPhase('idle');
      }
    };
    run();
  };

  const applyGeneratedResults = (results: Array<{ term: string; definition: string; explanation?: string }>) => {
    const nextCards: GeneratedCard[] = results.map((item, index) => ({
      n: String(index + 1).padStart(2, '0'),
      tag: 'AI Generated',
      title: item.term,
      body: item.definition,
      ex: item.explanation,
    }));
    setCards(nextCards);
    setPhase('done');
  };

  const handlePickPdfAndGenerate = async () => {
    try {
      const picker = getDocumentPicker();
      if (!picker) {
        Alert.alert('Unavailable', 'Document picker is unavailable in current build.');
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
        Alert.alert('Error', 'Invalid file');
          return;
        }

      setPhase('generating');
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData.user?.id ?? 'anonymous';
      const fileName = `${userId}/${Date.now()}-${asset.name || 'upload.pdf'}`;

      const fileResp = await fetch(asset.uri);
      const fileBlob = await fileResp.blob();

      const { error: uploadError } = await supabase.storage
        .from('pdfs')
        .upload(fileName, fileBlob, { contentType: 'application/pdf' });
      if (uploadError) {
        throw new Error(`Failed to upload file: ${uploadError.message}`);
      }

      const { data: urlData } = supabase.storage.from('pdfs').getPublicUrl(fileName);
      const { data, error } = await supabase.functions.invoke('process-file', {
        body: {
          pdf_url: urlData.publicUrl,
        },
      });
      if (error) {
        throw new Error(error.message || 'Failed to process file');
      }

      const results: Array<{ term: string; definition: string; explanation?: string }> =
        Array.isArray(data?.results) ? data.results : [];
      applyGeneratedResults(results);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to process PDF';
      Alert.alert('Error', message);
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
          .select('id, term, definition, explanation')
          .eq('id', termId)
          .single();
        if (error || !data) {
          Alert.alert('Error', 'Failed to load term');
          return;
        }
        setManualTerms([
          {
            id: data.id,
            term: data.term || '',
            definition: data.definition || '',
            explanation: data.explanation || '',
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
    field: 'term' | 'definition' | 'explanation',
    value: string
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
    next: Pick<ManualTermRow, 'term' | 'definition' | 'explanation'>
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
      Alert.alert('Tip', 'Please add a term first');
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
                saved: true,
                editing: false,
              }
            : item
        )
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to regenerate';
      Alert.alert('Error', message);
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
      Alert.alert('Tip', 'This card has no term to regenerate');
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
              }
            : item
        )
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to regenerate';
      Alert.alert('Error', message);
    } finally {
      setRegeneratingCardId((prev) => (prev === cardNo ? null : prev));
    }
  };

  const generateManualFromTerm = async (
    term: string
  ): Promise<{ definition: string; explanation: string }> => {
    const { data, error } = await supabase.functions.invoke('generate-terms', {
        body: {
          type: 'topic',
        content: term,
        },
      });

      if (error) {
      throw new Error(error.message || 'Failed to generate content');
    }

    const first = data?.results?.[0];
    if (!first || typeof first.definition !== 'string') {
      throw new Error('No generated result for this term');
    }

          return {
      definition: first.definition || '',
      explanation: first.explanation || '',
    };
  };

  const handleSave = async () => {
    if (!id) {
      Alert.alert('Error', 'Lesson ID is required');
      return;
    }
    if (saving) return;

    setSaving(true);
    try {
      if (isSingleTermEdit && termId) {
        const target = manualTerms[0];
        if (!target || !target.term.trim() || !target.definition.trim()) {
          Alert.alert('Error', 'Please fill in Term and Definition');
      return;
    }
        const { error } = await supabase
          .from('terms')
          .update({
            term: target.term.trim(),
            definition: target.definition.trim(),
            explanation: target.explanation.trim() || null,
          })
          .eq('id', termId);
        if (error) {
          Alert.alert('Error', `Failed to update term: ${error.message}`);
        return;
      }
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
        }));

      const allTerms = [
        ...validGeneratedTerms,
        ...validManualTerms.map((row) => ({
          term: row.term.trim(),
          definition: row.definition.trim(),
          explanation: row.explanation.trim() || null,
        })),
      ];

      if (allTerms.length === 0) {
        Alert.alert('Error', 'Please add at least one Term and Definition');
        return;
      }

      const insertData = allTerms.map((row) => ({
        lesson_id: id,
        term: row.term,
        definition: row.definition,
        explanation: row.explanation,
      }));

      const { error } = await supabase.from('terms').insert(insertData);
      if (error) {
        Alert.alert('Error', `Failed to save terms: ${error.message}`);
        return;
      }

      // 词条变了，让详情页和列表重新从服务端拉取最新数据
      void clearCache('LESSON_DETAIL', id as string);

      router.replace(`/lessons/${id}` as any);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Something went wrong';
      Alert.alert('Error', message);
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
      {/* Top bar */}
      <View style={styles.topbar}>
        <Pressable onPress={handleCancel} style={styles.topbarSideBtn}>
          <Text style={styles.cancel}>Cancel</Text>
        </Pressable>
        <Text style={styles.title}>{isSingleTermEdit ? 'Edit Term' : 'Add Terms'}</Text>
        <Pressable onPress={handleSave} disabled={saving} style={styles.topbarSideBtn}>
          <Text style={[styles.tag, saving && styles.tagDisabled]}>{saving ? 'Saving...' : 'Save'}</Text>
        </Pressable>
        </View>

      {!isSingleTermEdit && (
        <ScrollView
        style={styles.contentScroll}
        contentContainerStyle={styles.contentScrollBody}
        showsVerticalScrollIndicator={false}
      >
      {/* Prompt block */}
      <View style={styles.promptBlock}>
        <View style={{ paddingHorizontal: 18, paddingTop: 14, paddingBottom: 6 }}>
          <SectionLabel
            style={{
              marginBottom: 10,
              fontSize: 11,
              lineHeight: 15.4,
              letterSpacing: -0.1,
              fontFamily: 'JetBrainsMono_500',
              fontWeight: '400',
            }}
          >
            What do you want to learn?
          </SectionLabel>
          <TextInput
            value={prompt}
            onChangeText={setPrompt}
            placeholder="Type what you want to learn, paste text, or enter a topic."
            placeholderTextColor={colors.muted}
            multiline
            style={styles.textarea}
          />
        </View>
        <View style={styles.promptActions}>
          {(['Attach', 'Voice', 'Doc'] as const).map((label, i, arr) => (
            <Pressable
              key={label}
              onPress={() => {
                if (isGenerating) return;
                if (label === 'Voice') {
                  Alert.alert('Coming soon', 'Voice input will be available soon.');
                  return;
                }
                handlePickPdfAndGenerate();
              }}
              disabled={isGenerating}
              style={[
                styles.actionBtn,
                i < arr.length - 1 && { borderRightWidth: 1, borderRightColor: colors.border },
                isGenerating && styles.actionDisabled,
              ]}
            >
              {label === 'Attach' ? (
                <View style={styles.actionLabelRow}>
                  <Feather name="paperclip" size={13} color={colors.muted} />
                  <Text style={styles.actionLabel}>Attach</Text>
                </View>
              ) : (
                <Text style={styles.actionLabel}>{label}</Text>
              )}
            </Pressable>
          ))}
          <Pressable
            disabled={isGenerating}
            onPress={generate}
            style={[styles.actionBtn, { marginLeft: 'auto' }]}
          >
            <View style={styles.generateActionWrap}>
              {isGenerating ? (
                <>
                  <Text style={[styles.generateLabel, { color: colors.muted }]}>Generating</Text>
                  <Text style={[styles.generateLabel, styles.generateDots, { color: colors.muted }]}>
                    {generateDots}
                  </Text>
                    </>
                  ) : (
                <Text style={[styles.generateLabel, { color: colors.accent }]}>Generate →</Text>
                  )}
              </View>
          </Pressable>
            </View>
          </View>

      {/* Generated header */}
      <View style={styles.genHead}>
        <SectionLabel>
          {cards.length === 0 ? 'Awaiting prompt' : `Generated - ${cards.length} cards`}
        </SectionLabel>
      </View>

      {/* Empty state */}
      {cards.length === 0 && (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            Cards will appear here.{'\n'}
            Try: "Verb conjugation in Spanish," or paste a paragraph.
              </Text>
          </View>
          )}

      {/* Generated cards */}
      {cards.map((c) => (
        <FullCard
          key={c.n}
          card={c}
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
      <View style={styles.manualSection}>
        <View style={styles.manualList}>
          {manualTerms.map((row, index) => (
            <ManualCard
              key={row.id}
              index={index}
              row={row}
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
                  Alert.alert('Tip', 'Please enter a term first');
                  return null;
                }
                try {
                  setGeneratingManualId(row.id);
                  return await generateManualFromTerm(term.trim());
                } catch (error) {
                  const message =
                    error instanceof Error ? error.message : 'Failed to generate content';
                  Alert.alert('Error', message);
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

      <View style={{ height: 24 }} />
      </ScrollView>
      )}

      {loadingTerm && (
        <View style={styles.loadingWrap}>
          <Text style={styles.loadingText}>Loading term...</Text>
                </View>
                )}

      {isSingleTermEdit && !loadingTerm && (
        <View style={styles.singleEditWrap}>
          <View style={styles.manualSection}>
            <View style={styles.manualList}>
              {manualTerms.map((row, index) => (
                <ManualCard
                  key={row.id}
                  index={index}
                  row={row}
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
                      Alert.alert('Tip', 'Please enter a term first');
                      return null;
                    }
                    try {
                      setGeneratingManualId(row.id);
                      return await generateManualFromTerm(term.trim());
                    } catch (error) {
                      const message =
                        error instanceof Error ? error.message : 'Failed to generate content';
                      Alert.alert('Error', message);
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
                        </View>
                        )}
    </EdBase>
  );
}

function FullCard({
  card: c,
  isRegenerating,
  regenerateDots,
  onDiscard,
  onRegenerate,
  onUpdate,
}: {
  card: GeneratedCard;
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

  const startEdit = () => {
    setEditTitle(c.title);
    setEditBody(c.body || '');
    setEditEx(c.ex || '');
    setIsEditing(true);
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setEditTitle(c.title);
    setEditBody(c.body || '');
    setEditEx(c.ex || '');
  };

  const saveEdit = () => {
    const nextCard: GeneratedCard = {
      ...c,
      title: editTitle.trim() || c.title,
      body: editBody.trim() || undefined,
      ex: editEx.trim() || undefined,
    };
    onUpdate(nextCard);
    setIsEditing(false);
  };

    return (
    <View style={styles.fullCard}>
      <View style={[styles.fullCardHead, isEditing && styles.fullCardHeadEditing]}>
        <View style={{ flex: 1 }}>
          <SectionLabel style={{ marginBottom: 4 }}>
            Card {c.n} · {c.tag}
          </SectionLabel>
          {!isEditing && <Text style={styles.fullCardTitle}>{c.title}</Text>}
        </View>
          {!isEditing && (
          <Pressable onPress={startEdit}>
            <Text style={styles.editLink}>Edit</Text>
          </Pressable>
        )}
      </View>
      <View style={{ paddingHorizontal: 14, paddingVertical: 12 }}>
        {isEditing ? (
              <View>
            <View style={styles.manualInputGroup}>
              <Text style={styles.manualInputLabel}>Term</Text>
                          <TextInput
                style={styles.manualInput}
                value={editTitle}
                onChangeText={setEditTitle}
                placeholder="e.g. Renaissance"
                placeholderTextColor={colors.muted}
                          />
                        </View>

            <View style={styles.manualInputGroup}>
              <Text style={styles.manualInputLabel}>Definition</Text>
                          <TextInput
                style={[styles.manualInput, styles.manualTextarea]}
                value={editBody}
                onChangeText={setEditBody}
                placeholder="e.g. Period of cultural revival in Europe"
                placeholderTextColor={colors.muted}
                            multiline
                            textAlignVertical="top"
                          />
                        </View>

            <View style={styles.manualInputGroup}>
              <Text style={styles.manualInputLabel}>Explanation (Optional)</Text>
                          <TextInput
                style={[styles.manualInput, styles.manualTextarea]}
                value={editEx}
                onChangeText={setEditEx}
                placeholder="Add context, examples, or usage notes"
                placeholderTextColor={colors.muted}
                            multiline
                            textAlignVertical="top"
                          />
                        </View>
                      </View>
        ) : (
          c.body && <Text style={styles.fullCardBody}>{c.body}</Text>
        )}
        {!isEditing && c.ex && (
          <View style={styles.exBlock}>
            <SectionLabel style={{ marginBottom: 5 }}>Example</SectionLabel>
            <Text style={styles.exText}>{c.ex}</Text>
              </View>
                    )}
                  </View>
      <View style={isEditing ? styles.manualCardActions : styles.fullCardActions}>
        {isEditing
          ? (['cancel', 'save'] as const).map((key, j, arr) => {
              const isSave = key === 'save';
              return (
                <Pressable
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
                        ? { color: colors.accent, fontFamily: 'JetBrainsMono_700' }
                        : { color: colors.muted },
                    ]}
                  >
                    {isSave ? 'Save' : 'Cancel'}
                  </Text>
                </Pressable>
              );
            })
          : (['discard', 'regen'] as const).map((key, j, arr) => {
              const isRegen = key === 'regen';
              const label = key === 'discard' ? 'Discard' : isRegenerating ? `Regenerating${regenerateDots}` : 'Regenerate';
              return (
                <Pressable
                  key={key}
                  onPress={key === 'discard' ? onDiscard : onRegenerate}
                  disabled={isRegenerating}
                  style={[
                    styles.fullCardAction,
                    j < arr.length - 1 && { borderRightWidth: 1, borderRightColor: colors.border },
                    isRegenerating && isRegen && { opacity: 0.6 },
                  ]}
                >
                  <Text
                    style={[
                      styles.fullCardActionLabel,
                      { color: isRegen ? colors.accent : colors.muted, fontWeight: isRegen ? '700' : '400' },
                    ]}
                  >
                    {label}
                </Text>
                </Pressable>
              );
            })}
              </View>
    </View>
  );
}

function ManualCard({
  index,
  row,
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
    field: 'term' | 'definition' | 'explanation',
    value: string
  ) => void;
  onGenerate: (term: string) => Promise<{ definition: string; explanation: string } | null>;
  onSave: (next: Pick<ManualTermRow, 'term' | 'definition' | 'explanation'>) => void;
}) {
  const shouldRenderHeader =
    !hideManualMeta || !hideDeleteButton || (row.saved && !row.editing);

  const [termDraft, setTermDraft] = useState(row.term);
  const [definitionDraft, setDefinitionDraft] = useState(row.definition);
  const [explanationDraft, setExplanationDraft] = useState(row.explanation);

  useEffect(() => {
    setTermDraft(row.term);
    setDefinitionDraft(row.definition);
    setExplanationDraft(row.explanation);
  }, [row.term, row.definition, row.explanation]);

  const handleCancelEdit = () => {
    setTermDraft(row.term);
    setDefinitionDraft(row.definition);
    setExplanationDraft(row.explanation);
    onCancelEdit();
  };

  const handleSaveEdit = () => {
    onSave({
      term: termDraft,
      definition: definitionDraft,
      explanation: explanationDraft,
    });
  };

  const handleGenerate = async () => {
    const generated = await onGenerate(termDraft);
    if (!generated) return;
    setDefinitionDraft(generated.definition);
    setExplanationDraft(generated.explanation);
    onDraftChange('definition', generated.definition);
    onDraftChange('explanation', generated.explanation);
  };

    return (
    <View style={styles.manualCard}>
      {shouldRenderHeader && (
        <View style={styles.manualCardHead}>
          <View style={{ flex: 1 }}>
            {!hideManualMeta && (
              <SectionLabel style={{ marginBottom: 0 }}>Card M{index + 1} · Manual</SectionLabel>
            )}
            {row.saved && !row.editing && <Text style={styles.manualSavedTitle}>{row.term}</Text>}
                  </View>
          {row.saved && !row.editing ? (
            <Pressable onPress={onEdit}>
              <Text style={styles.editLink}>Edit</Text>
            </Pressable>
          ) : !hideDeleteButton ? (
            <Pressable
              onPress={onDelete}
              disabled={disableDelete}
              style={[styles.manualRemoveBtn, disableDelete && styles.manualRemoveBtnDisabled]}
            >
              <Feather name="x" size={14} color={disableDelete ? colors.dim : colors.red} />
            </Pressable>
          ) : null}
                      </View>
                    )}

      <View style={styles.manualCardBody}>
        {row.saved && !row.editing ? (
          <>
            <Text style={styles.fullCardBody}>{row.definition}</Text>
            {!!row.explanation && (
              <View style={styles.exBlock}>
                <SectionLabel style={{ marginBottom: 5 }}>Example</SectionLabel>
                <Text style={styles.exText}>{row.explanation}</Text>
          </View>
          )}
                      </>
                    ) : (
                      <>
            <View style={styles.manualInputGroup}>
              <View style={styles.manualInputLabelRow}>
                <Text style={styles.manualInputLabel}>Term</Text>
                {termDraft.trim().length > 0 && (
                  <Pressable
                    onPress={handleGenerate}
                    disabled={isGenerating}
                    style={isGenerating ? styles.manualGenerateButtonDisabled : undefined}
                  >
                    <Text style={styles.manualGenerateButtonText}>
                      {isGenerating ? 'Generating...' : 'Generate'}
                      </Text>
                  </Pressable>
                  )}
                </View>
                          <TextInput
                style={styles.manualInput}
                placeholder="e.g. Renaissance"
                placeholderTextColor={colors.muted}
                value={termDraft}
                onChangeText={(text) => {
                  setTermDraft(text);
                  onDraftChange('term', text);
                }}
                          />
              </View>

            <View style={styles.manualInputGroup}>
              <Text style={styles.manualInputLabel}>Definition</Text>
                          <TextInput
                style={[styles.manualInput, styles.manualTextarea]}
                placeholder="e.g. Period of cultural revival in Europe"
                placeholderTextColor={colors.muted}
                            multiline
                value={definitionDraft}
                onChangeText={(text) => {
                  setDefinitionDraft(text);
                  onDraftChange('definition', text);
                }}
                          />
          </View>

            <View style={styles.manualInputGroup}>
              <Text style={styles.manualInputLabel}>Explanation (Optional)</Text>
                  <TextInput
                style={[styles.manualInput, styles.manualTextarea]}
                placeholder="Add context, examples, or usage notes"
                placeholderTextColor={colors.muted}
                multiline
                value={explanationDraft}
                onChangeText={(text) => {
                  setExplanationDraft(text);
                  onDraftChange('explanation', text);
                }}
                  />
                  </View>
                    </>
                  )}
              </View>
      {!hideInlineEditActions && (!row.saved || row.editing) ? (
        <View style={styles.manualCardActions}>
          <Pressable style={styles.manualCardAction} onPress={handleCancelEdit}>
            <Text style={[styles.manualCardActionLabel, { color: colors.muted }]}>Cancel</Text>
          </Pressable>
          <Pressable style={[styles.manualCardAction, styles.manualCardActionBorder]} onPress={handleSaveEdit}>
            <Text style={[styles.manualCardActionLabel, { color: colors.accent, fontFamily: 'JetBrainsMono_700' }]}>
              Save
                    </Text>
          </Pressable>
                      </View>
                    ) : (
        <View style={styles.fullCardActions}>
          {(['discard', 'regen'] as const).map((key, j, arr) => {
            const isRegen = key === 'regen';
            const label = key === 'discard' ? 'Discard' : isGenerating ? `Regenerating${regenerateDots}` : 'Regenerate';
            return (
              <Pressable
                key={key}
                onPress={key === 'discard' ? onDiscard : onRegenerate}
                disabled={isGenerating}
                    style={[
                  styles.fullCardAction,
                  j < arr.length - 1 && { borderRightWidth: 1, borderRightColor: colors.border },
                  isGenerating && isRegen && { opacity: 0.6 },
                ]}
              >
                <Text
                  style={[
                    styles.fullCardActionLabel,
                    { color: isRegen ? colors.accent : colors.muted, fontWeight: isRegen ? '700' : '400' },
                  ]}
                >
                  {label}
                      </Text>
              </Pressable>
            );
          })}
            </View>
          )}
                </View>
  );
}

const styles = StyleSheet.create({
  topbar: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    position: 'relative',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  topbarSideBtn: {
    minWidth: 64,
    zIndex: 2,
  },
  contentScroll: {
    flex: 1,
  },
  contentScrollBody: {
    paddingBottom: 24,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 13,
    color: colors.muted,
    fontFamily: 'JetBrainsMono_500',
  },
  singleEditWrap: {
    flex: 1,
    paddingTop: 8,
  },
  cancel: { fontSize: 13, color: colors.muted, fontFamily: fonts.grotesk },
  title: {
    fontSize: 16,
    lineHeight: 22.4,
    fontWeight: '400',
    letterSpacing: -0.1,
    color: colors.text,
    fontFamily: 'JetBrainsMono_800',
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
  },
  tag: {
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: -0.1,
    color: colors.accent,
    fontWeight: '400',
    fontFamily: 'JetBrainsMono_700',
    textAlign: 'right',
  },
  tagDisabled: { opacity: 0.6 },

  promptBlock: { backgroundColor: colors.surf, borderBottomWidth: 1, borderBottomColor: colors.border },
  textarea: {
    minHeight: 76,
    fontSize: 16,
    lineHeight: 24,
    letterSpacing: -0.1,
    color: colors.text,
    fontFamily: fonts.grotesk,
    fontWeight: '400',
    padding: 0,
  },
  promptActions: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  actionBtn: { paddingHorizontal: 14, paddingVertical: 12 },
  actionDisabled: { opacity: 0.5 },
  generateActionWrap: { flexDirection: 'row', alignItems: 'center' },
  generateDots: { width: 32, textAlign: 'left', flexShrink: 0 },
  actionLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionLabel: {
    fontSize: 12,
    lineHeight: 16.8,
    color: colors.muted,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    fontWeight: '400',
    fontFamily: 'JetBrainsMono_700',
  },
  generateLabel: {
    fontSize: 14,
    lineHeight: 19.6,
    fontWeight: '400',
    fontFamily: 'JetBrainsMono_700',
  },

  genHead: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  empty: {
    marginHorizontal: 16,
    marginBottom: 16,
    paddingHorizontal: 18,
    paddingVertical: 28,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.dim,
    borderRadius: 10,
    alignItems: 'center',
  },
  emptyText: { fontSize: 13, color: colors.muted, lineHeight: 21, textAlign: 'center', fontFamily: fonts.grotesk },

  skeletonCard: {
    backgroundColor: colors.surf,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 16,
    marginBottom: 6,
  },
  skeletonBar: { height: 8, backgroundColor: colors.dim, borderRadius: 2, opacity: 0.5 },

  fullCard: {
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: colors.surf,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
  },
  fullCardHead: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  fullCardHeadEditing: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  fullCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.3,
    lineHeight: 20,
    color: colors.text,
    fontFamily: fonts.grotesk,
  },
  editLink: { fontSize: 12, color: colors.accent, fontWeight: '600', marginLeft: 10, fontFamily: fonts.grotesk },

  fullCardBody: { fontSize: 13, color: colors.sub, lineHeight: 21, marginBottom: 12, fontFamily: fonts.grotesk },
  exBlock: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: colors.bg,
  },
  exText: { fontSize: 12, color: colors.sub, lineHeight: 19, fontFamily: fonts.mono },

  fullCardActions: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.border },
  fullCardAction: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  fullCardActionLabel: { fontSize: 12, fontFamily: fonts.grotesk },

  manualSection: {
    marginTop: 8,
    marginHorizontal: 16,
  },
  manualSectionHead: {
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  manualList: {
    gap: 8,
  },
  manualCard: {
    backgroundColor: colors.surf,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
  },
  manualCardHead: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  manualSavedTitle: {
    marginTop: 4,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.3,
    lineHeight: 20,
    color: colors.text,
    fontFamily: fonts.grotesk,
  },
  manualCardBody: {
    padding: 12,
  },
  manualCardActions: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    flexDirection: 'row',
  },
  manualCardAction: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
  },
  manualCardActionBorder: {
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
  },
  manualCardActionLabel: {
    fontSize: 12,
    fontFamily: 'JetBrainsMono_500',
  },
  manualCardIndex: {
    fontSize: 11,
    color: colors.accent,
    fontFamily: 'JetBrainsMono_700',
  },
  manualRemoveBtn: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  manualRemoveBtnDisabled: {
    opacity: 0.5,
  },
  manualInputGroup: {
    marginBottom: 10,
  },
  manualInputLabelRow: {
    marginBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  manualInputLabel: {
    fontSize: 11,
    lineHeight: 15.4,
    color: colors.muted,
    letterSpacing: -0.1,
    fontFamily: 'JetBrainsMono_500',
  },
  manualGenerateButtonDisabled: {
    opacity: 0.5,
  },
  manualGenerateButtonText: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.accent,
    fontFamily: 'JetBrainsMono_700',
  },
  manualInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.surf,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    lineHeight: 20,
    color: colors.text,
    fontFamily: 'JetBrainsMono_400',
  },
  manualTextarea: {
    minHeight: 62,
    textAlignVertical: 'top',
  },
});

