import { EdBase } from '@/components/EdBase';
import { Icon } from '@/components/Icon';
import { SectionLabel } from '@/components/SectionLabel';
import { supabase } from '@/lib/supabase';
import { updateTermProgressSafe } from '@/lib/updateTermProgress';
import { colors, fonts } from '@/theme';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { TextInput } from 'react-native';

interface MCQ {
  termId: string;
  mode: 'mcq';
  topic: string;
  q: string;
  opts: string[];
  correct: number;
  explain?: string;
}

interface RecallQuestion {
  termId: string;
  mode: 'recall';
  topic: string;
  q: string;
  answer: string;
  explain?: string;
}

interface FlipQuestion {
  termId: string;
  mode: 'flip';
  topic: string;
  q: string;
  back: string;
  explain?: string;
}

type QuizQuestion = MCQ | RecallQuestion | FlipQuestion;

const RECALL_STOP_WORDS = new Set([
  'a', 'an', 'the', 'to', 'of', 'in', 'on', 'at', 'for', 'with', 'and', 'or',
  'is', 'are', 'was', 'were', 'be', 'being', 'been', 'it', 'this', 'that',
  'means', 'meaning', 'phrase', 'word', 'informal', 'formal',
]);

const normalizeRecallText = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const toKeywordTokens = (text: string) =>
  normalizeRecallText(text)
    .split(' ')
    .filter((token) => token.length > 1 && !RECALL_STOP_WORDS.has(token));

const isRecallAnswerCorrect = (userInput: string, expectedAnswer: string) => {
  const normalizedUser = normalizeRecallText(userInput);
  const normalizedExpected = normalizeRecallText(expectedAnswer);
  if (!normalizedUser || !normalizedExpected) return false;

  // 精确/包含匹配：覆盖短语型答案
  if (normalizedUser === normalizedExpected) return true;
  if (normalizedExpected.includes(normalizedUser) && normalizedUser.length >= 4) return true;
  if (normalizedUser.includes(normalizedExpected) && normalizedExpected.length >= 4) return true;

  // 关键词匹配：用户关键词大部分命中即可通过，避免长句定义导致误判
  const userTokens = toKeywordTokens(userInput);
  const expectedTokens = new Set(toKeywordTokens(expectedAnswer));
  if (userTokens.length === 0) return false;

  const overlap = userTokens.filter((token) => expectedTokens.has(token)).length;
  return overlap >= 2 && overlap / userTokens.length >= 0.75;
};

/**
 * Quiz host. One screen handles three card modes (mcq / recall / flip)
 * by switching the body but keeping the same header + progress chrome.
 *
 * Local state (idx, selected, revealed, recallText, flipped) is reset
 * on every advance — there's no persistence between sessions, since this
 * is a UI port. Wire your real quiz engine on top.
 */
export default function QuizScreen() {
  const { entry, lessonId } = useLocalSearchParams<{ entry?: string; lessonId?: string }>();
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [idx, setIdx]                 = useState(0);
  const [selected, setSelected]       = useState<number | null>(null);
  const [revealed, setRevealed]       = useState(false);
  const [recallText, setRecallText]   = useState('');
  const [flipped, setFlipped]         = useState(false);

  const updateTermProgress = async (termId: string, isCorrect: boolean) => {
    await updateTermProgressSafe(termId, isCorrect);
  };

  useEffect(() => {
    const loadRealQuizData = async () => {
      try {
        setLoading(true);
        setLoadError(null);

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setLoadError('Please log in first.');
          setQuizQuestions([]);
          return;
        }

        const { data: lessonsData, error: lessonsError } = await supabase
          .from('lessons')
          .select('id, name')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (lessonsError || !lessonsData || lessonsData.length === 0) {
          setLoadError('No lessons found. Please create one first.');
          setQuizQuestions([]);
          return;
        }

        const entryType = entry === 'lesson' ? 'lesson' : 'home';
        const targetLessons =
          entryType === 'lesson' && lessonId
            ? lessonsData.filter((lesson) => lesson.id === lessonId)
            : lessonsData;

        if (targetLessons.length === 0) {
          setLoadError(entryType === 'lesson' ? 'Lesson not found.' : 'No lessons found.');
          setQuizQuestions([]);
          return;
        }

        const lessonMap = new Map(targetLessons.map((lesson) => [lesson.id, lesson.name || 'Lesson']));
        const lessonIds = targetLessons.map((lesson) => lesson.id);

        const { data: termsData, error: termsError } = await supabase
          .from('terms')
          .select('id, lesson_id, term, definition, explanation')
          .in('lesson_id', lessonIds)
          .order('created_at', { ascending: false });

        if (termsError) {
          setLoadError('Failed to load terms.');
          setQuizQuestions([]);
          return;
        }

        const usableTerms = (termsData || []).filter(
          (term) => term.term?.trim() && term.definition?.trim()
        );

        let filteredTerms = usableTerms;
        if (entryType === 'home' && usableTerms.length > 0) {
          const termIds = usableTerms.map((term) => term.id);
          const { data: progressData } = await supabase
            .from('user_term_progress')
            .select('term_id, status, next_review_at')
            .eq('user_id', user.id)
            .in('term_id', termIds);

          const now = new Date();
          const progressMap = new Map(
            (progressData || []).map((p) => [p.term_id, p])
          );

          filteredTerms = usableTerms.filter((term) => {
            const progress = progressMap.get(term.id);
            if (!progress) return true;
            if (progress.status === 'New') return true;
            if (progress.next_review_at && new Date(progress.next_review_at) <= now) return true;
            return false;
          });
        }

        if (filteredTerms.length < 4) {
          setLoadError(
            entryType === 'home'
              ? 'Not enough cards due for review right now.'
              : 'Not enough terms in this lesson. Add at least 4 terms.'
          );
          setQuizQuestions([]);
          return;
        }

        const shuffledTerms = [...filteredTerms].sort(() => Math.random() - 0.5);
        const MAX_QUIZ_QUESTIONS = 12;
        const STEPS_PER_TERM = 3; // Flashcard -> MCQ -> Recall
        const maxTerms = Math.max(1, Math.floor(MAX_QUIZ_QUESTIONS / STEPS_PER_TERM));
        const pickedTerms = shuffledTerms.slice(0, Math.min(maxTerms, shuffledTerms.length));
        const generated: QuizQuestion[] = [];

        pickedTerms.forEach((term) => {
          const topic = lessonMap.get(term.lesson_id) || 'Lesson';
          const explainText = term.explanation || `Review: ${term.term} → ${term.definition}`;

          // 1) Flashcard
          generated.push({
            termId: term.id,
            mode: 'flip',
            topic,
            q: term.term,
            back: term.definition,
            explain:
              term.explanation?.trim() ||
              'No extra note yet. Try making your own sentence with this term.',
          });

          // 2) MCQ
          const distractors = shuffledTerms
            .filter((t) => t.id !== term.id)
            .slice(0, 3)
            .map((t) => t.definition);
          const opts = [term.definition, ...distractors].sort(() => Math.random() - 0.5);
          generated.push({
            termId: term.id,
            mode: 'mcq',
            topic,
            q: `What is the best definition of "${term.term}"?`,
            opts,
            correct: opts.indexOf(term.definition),
            explain: explainText,
          });

          // 3) Recall
          generated.push({
            termId: term.id,
            mode: 'recall',
            topic,
            q: `Define "${term.term}" in your own words.`,
            answer: term.definition,
            explain: explainText,
          });
        });

        setQuizQuestions(generated);
        setIdx(0);
      } catch {
        setLoadError('Failed to initialize quiz.');
        setQuizQuestions([]);
      } finally {
        setLoading(false);
      }
    };

    loadRealQuizData();
  }, [entry, lessonId]);

  const total = quizQuestions.length;
  const q = quizQuestions[idx];
  if (loading) {
    return (
      <EdBase bottomInset={0}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="small" color={colors.accent} />
          <Text style={styles.loadingText}>Loading quiz...</Text>
        </View>
      </EdBase>
    );
  }
  if (!q || total === 0) {
    return (
      <EdBase bottomInset={0}>
        <View style={styles.loadingWrap}>
          <Text style={styles.loadingText}>{loadError || 'No quiz data available.'}</Text>
        </View>
      </EdBase>
    );
  }

  const progressPct = ((idx + (revealed ? 1 : 0)) / total) * 100;
  const recallCorrect = q.mode === 'recall'
    ? isRecallAnswerCorrect(recallText, q.answer)
    : false;

  const reset = () => {
    setSelected(null);
    setRevealed(false);
    setRecallText('');
    setFlipped(false);
  };

  const next = () => {
    if (idx < total - 1) {
      setIdx(idx + 1);
    } else {
      setIdx(0);
    }
    reset();
  };

  const checkDisabled =
    !revealed &&
    ((q.mode === 'mcq' && selected === null) ||
      (q.mode === 'recall' && !recallText.trim()));

  const revealedIsCorrect =
    q.mode === 'mcq' ? selected === q.correct : q.mode === 'recall' ? recallCorrect : false;

  const onCheckOrNext = () => {
    if (!revealed) {
      if (q.mode === 'mcq'    && selected === null)  return;
      if (q.mode === 'recall' && !recallText.trim()) return;
      if (q.mode === 'mcq') {
        updateTermProgress(q.termId, selected === q.correct);
      }
      if (q.mode === 'recall') {
        updateTermProgress(q.termId, isRecallAnswerCorrect(recallText, q.answer));
      }
      setRevealed(true);
    } else {
      // 只有答对才进入下一样式；答错则留在当前样式重试
      if (revealedIsCorrect) {
        next();
      } else {
        setRevealed(false);
        if (q.mode === 'mcq') setSelected(null);
        if (q.mode === 'recall') setRecallText('');
      }
    }
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    // 兜底：如果当前是深链/首屏进入，没有可回退历史，则回到首页 Tab。
    router.replace('/(tabs)');
  };

  return (
    <EdBase bottomInset={0}>
      {/* Nav */}
      <View style={styles.nav}>
        <Pressable onPress={handleBack}>
          <Text style={styles.navBack}>← Back</Text>
        </Pressable>
        <Text style={styles.navCount}>{idx + 1} of {total}</Text>
      </View>

      {/* Progress */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
      </View>

      {/* Topic + question */}
      <View style={styles.qBlock}>
        <View style={styles.topicRow}>
          <SectionLabel size={10.5} color={colors.accent}>{q.topic}</SectionLabel>
          <View style={styles.modeChip}>
            <Text style={styles.modeChipText}>
              {q.mode === 'mcq' ? 'Choose' : q.mode === 'recall' ? 'Recall' : 'Flashcard'}
            </Text>
          </View>
        </View>
        <Text style={styles.qText}>{q.q}</Text>
      </View>

      {/* Body — per mode */}
      {q.mode === 'mcq' && (
        <MCQView
          q={q}
          selected={selected}
          revealed={revealed}
          onSelect={(i) => !revealed && setSelected(i)}
        />
      )}
      {q.mode === 'recall' && (
        <RecallView
          q={q}
          recallText={recallText}
          revealed={revealed}
          recallCorrect={recallCorrect}
          onChange={setRecallText}
        />
      )}
      {q.mode === 'flip' && (
        <FlipView
          q={q}
          flipped={flipped}
          onFlip={() => setFlipped(!flipped)}
          onConfidence={(level) => {
            const isCorrect = level === 'I got it';
            updateTermProgress(q.termId, isCorrect);
            // Flashcard 只有“会了”才进入下一个样式
            if (isCorrect) {
              next();
            } else {
              setFlipped(false);
            }
          }}
        />
      )}

      {/* Feedback (mcq + recall) */}
      {revealed && q.mode !== 'flip' && q.explain && (
        <FeedbackBlock
          q={q}
          recallCorrect={recallCorrect}
          mcqCorrect={q.mode === 'mcq' && selected === q.correct}
        />
      )}

      {/* CTA — flip uses confidence buttons instead */}
      {q.mode !== 'flip' && (
        <View style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 24 }}>
          <Pressable
            onPress={onCheckOrNext}
            disabled={checkDisabled}
            style={[styles.cta, checkDisabled && { backgroundColor: colors.dim }]}
          >
            <Text style={styles.ctaText}>
              {revealed
                ? (revealedIsCorrect
                    ? (idx === total - 1 ? 'Restart' : 'Next question →')
                    : 'Try again')
                : 'Check answer'}
            </Text>
          </Pressable>
        </View>
      )}
    </EdBase>
  );
}

// ── MCQ ─────────────────────────────────────────────────────────
interface MCQViewProps {
  q: MCQ;
  selected: number | null;
  revealed: boolean;
  onSelect: (i: number) => void;
}

function MCQView({ q, selected, revealed, onSelect }: MCQViewProps) {
  return (
    <View style={mcqStyles.wrap}>
      {q.opts.map((opt, i) => {
        const isSelected = selected === i;
        const isCorrect = i === q.correct;

        let leftColor: string = 'transparent';
        let bg: string = 'transparent';
        let textColor: string = colors.text;
        let labelColor: string = colors.muted;
        let labelBg: string = colors.bg;
        let labelBorderColor: string = colors.border;

        if (revealed && isCorrect) {
          leftColor = colors.green;
          bg = colors.greenL;
          textColor = colors.green;
          labelColor = '#fff';
          labelBg = colors.green;
          labelBorderColor = 'transparent';
        } else if (revealed && isSelected && !isCorrect) {
          leftColor = colors.red;
          bg = colors.redL;
          textColor = colors.red;
          labelColor = '#fff';
          labelBg = colors.red;
          labelBorderColor = 'transparent';
        } else if (!revealed && isSelected) {
          leftColor = colors.accent;
          labelColor = '#fff';
          labelBg = colors.accent;
          labelBorderColor = 'transparent';
        }

        return (
          <Pressable
            key={i}
            onPress={() => onSelect(i)}
            style={[
              mcqStyles.row,
              { backgroundColor: bg },
              i < q.opts.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
            ]}
          >
            <View style={[mcqStyles.leftRule, { backgroundColor: leftColor }]} />
            <View style={mcqStyles.body}>
              <View
                style={[
                  mcqStyles.labelBox,
                  { backgroundColor: labelBg, borderColor: labelBorderColor },
                ]}
              >
                {revealed && isCorrect ? (
                  <Icon name="check" color="#fff" size={12} strokeWidth={3} />
                ) : revealed && isSelected && !isCorrect ? (
                  <Icon name="close" color="#fff" size={11} strokeWidth={3} />
                ) : (
                  <Text style={[mcqStyles.labelChar, { color: labelColor }]}>
                    {String.fromCharCode(65 + i)}
                  </Text>
                )}
              </View>
              <Text
                style={[
                  mcqStyles.optText,
                  {
                    color: textColor,
                    fontWeight:
                      revealed && (isCorrect || (isSelected && !isCorrect)) ? '500' : '400',
                  },
                ]}
              >
                {opt}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const mcqStyles = StyleSheet.create({
  wrap: {
    marginHorizontal: 20, marginTop: 20,
    backgroundColor: colors.surf,
    borderWidth: 1, borderColor: colors.border, borderRadius: 10,
    overflow: 'hidden',
  },
  row: { flexDirection: 'row' },
  leftRule: { width: 3 },
  body: { flexDirection: 'row', gap: 11, paddingHorizontal: 14, paddingVertical: 13, flex: 1, alignItems: 'flex-start' },
  labelBox: {
    width: 22, height: 22, borderRadius: 5, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  labelChar: { fontSize: 11, fontWeight: '700', fontFamily: fonts.grotesk },
  optText:   { fontSize: 14, lineHeight: 21, flex: 1, paddingTop: 1, fontFamily: fonts.grotesk },
});

// ── Recall ──────────────────────────────────────────────────────
interface RecallViewProps {
  q: RecallQuestion;
  recallText: string;
  revealed: boolean;
  recallCorrect: boolean;
  onChange: (s: string) => void;
}

function RecallView({ q, recallText, revealed, recallCorrect, onChange }: RecallViewProps) {
  const borderColor = revealed
    ? recallCorrect
      ? `${colors.green}80`
      : `${colors.red}80`
    : colors.border;

  return (
    <View style={{ marginHorizontal: 20, marginTop: 20 }}>
      <View
        style={{
          backgroundColor: colors.surf,
          borderWidth: 1, borderColor, borderRadius: 10, overflow: 'hidden',
        }}
      >
        {/* Use TextInput from RN — keep it inline so styles co-locate */}
        <RecallInput value={recallText} onChange={onChange} disabled={revealed} />
        <View style={recallStyles.footer}>
          <Text style={recallStyles.charCount}>{recallText.length} characters</Text>
          {revealed && (
            <Text
              style={[
                recallStyles.statusText,
                { color: recallCorrect ? colors.green : colors.red },
              ]}
            >
              {recallCorrect ? '✓ Match' : '✗ No match'}
            </Text>
          )}
        </View>
      </View>
      {revealed && (
        <View style={recallStyles.answerCard}>
          <SectionLabel style={{ marginBottom: 5 }}>Answer</SectionLabel>
          <Text style={recallStyles.answerText}>{q.answer}</Text>
        </View>
      )}
    </View>
  );
}

function RecallInput({ value, onChange, disabled }: { value: string; onChange: (s: string) => void; disabled: boolean }) {
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      editable={!disabled}
      multiline
      placeholder="Type your answer…"
      placeholderTextColor={colors.muted}
      style={recallStyles.textarea}
    />
  );
}

const recallStyles = StyleSheet.create({
  textarea: {
    minHeight: 80, padding: 14, color: colors.text,
    fontSize: 15, lineHeight: 23, fontFamily: fonts.grotesk,
  },
  footer: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderTopWidth: 1, borderTopColor: colors.border,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: colors.bg,
  },
  charCount: { fontSize: 11, color: colors.muted, fontFamily: fonts.grotesk },
  statusText: {
    fontSize: 11, fontWeight: '700',
    letterSpacing: 0.5, textTransform: 'uppercase',
    fontFamily: fonts.grotesk,
  },
  answerCard: {
    marginTop: 12, paddingHorizontal: 14, paddingVertical: 12,
    backgroundColor: colors.surf,
    borderWidth: 1, borderColor: colors.border, borderRadius: 8,
  },
  answerText: { fontSize: 14, fontWeight: '600', color: colors.text, fontFamily: fonts.grotesk },
});

// ── Flip ────────────────────────────────────────────────────────
interface FlipViewProps {
  q: FlipQuestion;
  flipped: boolean;
  onFlip: () => void;
  onConfidence: (level: 'Need review' | 'I got it') => void;
}

const CONFIDENCE_BUTTONS = [
  { label: 'Need review', color: colors.red },
  { label: 'I got it',  color: colors.accent },
] as const;

function FlipView({ q, flipped, onFlip, onConfidence }: FlipViewProps) {
  return (
    <View style={flipStyles.wrap}>
      <Pressable onPress={onFlip} style={flipStyles.card}>
        <SectionLabel style={{ marginBottom: 10 }}>
          {flipped ? 'Back' : 'Front'}
        </SectionLabel>
        {flipped ? (
          <Text style={flipStyles.back}>
            {q.explain || 'No extra note yet. Try making your own sentence with this term.'}
          </Text>
        ) : (
          <Text style={flipStyles.front}>{q.back}</Text>
        )}
        <Text style={flipStyles.cornerHint}>{flipped ? '← Front' : 'Confidence ↓'}</Text>
      </Pressable>

      <View style={flipStyles.confRow}>
        {CONFIDENCE_BUTTONS.map((b) => (
          <Pressable key={b.label} onPress={() => onConfidence(b.label)} style={flipStyles.confBtn}>
            <Text style={[flipStyles.confLabel, { color: b.color }]}>{b.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const flipStyles = StyleSheet.create({
  wrap: {
    marginHorizontal: 20,
    marginTop: 20,
  },
  card: {
    backgroundColor: colors.surf,
    borderWidth: 1, borderColor: colors.border, borderRadius: 10,
    paddingHorizontal: 20, paddingVertical: 24,
    minHeight: 340, position: 'relative',
  },
  front: { fontSize: 18, fontWeight: '700', letterSpacing: -0.4, lineHeight: 25, color: colors.text, fontFamily: fonts.grotesk },
  back:  { fontSize: 14, lineHeight: 22, color: colors.sub, fontFamily: fonts.grotesk },
  cornerHint: {
    position: 'absolute', top: 14, right: 14,
    fontSize: 10.5, color: colors.muted,
    letterSpacing: 0.7, textTransform: 'uppercase', fontWeight: '600',
    fontFamily: fonts.grotesk,
  },
  confRow: { flexDirection: 'row', gap: 6, marginTop: 12, marginBottom: 10 },
  confBtn: {
    flex: 1, paddingVertical: 10, alignItems: 'center',
    backgroundColor: colors.surf,
    borderWidth: 1, borderColor: colors.border, borderRadius: 8,
  },
  confLabel: { fontSize: 12, fontWeight: '700', fontFamily: fonts.grotesk },
});

// ── Feedback ────────────────────────────────────────────────────
function FeedbackBlock({
  q,
  recallCorrect,
  mcqCorrect,
}: {
  q: MCQ | RecallQuestion;
  recallCorrect: boolean;
  mcqCorrect: boolean;
}) {
  const isWrong = q.mode === 'recall' ? !recallCorrect : !mcqCorrect;
  const tone = isWrong ? 'wrong' : 'right';
  const bg     = tone === 'right' ? colors.greenL : colors.redL;
  const accent = tone === 'right' ? colors.green  : colors.red;

  return (
    <View style={[fbStyles.block, { backgroundColor: bg, borderColor: `${accent}30` }]}>
      <Text style={[fbStyles.heading, { color: accent }]}>
        {tone === 'right' ? 'Correct' : q.mode === 'recall' ? 'Not quite' : 'Incorrect'}
      </Text>
      {q.explain && <Text style={fbStyles.body}>{q.explain}</Text>}
    </View>
  );
}

const fbStyles = StyleSheet.create({
  block: {
    marginHorizontal: 20, marginTop: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1, borderRadius: 8,
  },
  heading: { fontSize: 12, fontWeight: '700', marginBottom: 3, letterSpacing: 0.3, fontFamily: fonts.grotesk },
  body:    { fontSize: 12, color: colors.sub, lineHeight: 19, fontFamily: fonts.grotesk },
});

// ── Host styles ─────────────────────────────────────────────────
const styles = StyleSheet.create({
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
    fontFamily: fonts.grotesk,
  },
  progressTrack: { height: 2, backgroundColor: colors.dim },
  progressFill:  { height: '100%', backgroundColor: colors.accent },

  nav: {
    paddingHorizontal: 20, paddingVertical: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  navBack:  { fontSize: 13, color: colors.muted, fontFamily: fonts.grotesk },
  navCount: { fontSize: 12, color: colors.muted, fontFamily: fonts.mono },

  qBlock: { paddingHorizontal: 20, paddingTop: 20 },
  topicRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  modeChip: {
    paddingHorizontal: 7, paddingVertical: 2,
    backgroundColor: colors.bg,
    borderWidth: 1, borderColor: colors.border, borderRadius: 9,
  },
  modeChipText: {
    fontSize: 9.5, color: colors.muted,
    letterSpacing: 0.5, textTransform: 'uppercase', fontWeight: '600',
    fontFamily: fonts.grotesk,
  },
  qText: {
    fontSize: 19, fontWeight: '700', letterSpacing: -0.5, lineHeight: 26,
    color: colors.text, fontFamily: fonts.grotesk,
  },

  cta: { paddingVertical: 14, borderRadius: 8, backgroundColor: colors.accent, alignItems: 'center' },
  ctaText: { color: '#fff', fontSize: 14, fontWeight: '700', fontFamily: fonts.grotesk },
});
