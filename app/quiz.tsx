import { EdBase } from '@/components/EdBase';
import { Icon } from '@/components/Icon';
import { SectionLabel } from '@/components/SectionLabel';
import { questions, type FlipQuestion, type MCQ, type RecallQuestion } from '@/data/questions';
import { colors, fonts } from '@/theme';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

/**
 * Quiz host. One screen handles three card modes (mcq / recall / flip)
 * by switching the body but keeping the same header + progress chrome.
 *
 * Local state (idx, selected, revealed, recallText, flipped) is reset
 * on every advance — there's no persistence between sessions, since this
 * is a UI port. Wire your real quiz engine on top.
 */
export default function QuizScreen() {
  const [idx, setIdx]                 = useState(0);
  const [selected, setSelected]       = useState<number | null>(null);
  const [revealed, setRevealed]       = useState(false);
  const [recallText, setRecallText]   = useState('');
  const [flipped, setFlipped]         = useState(false);

  const total = questions.length;
  const q = questions[idx]!;
  const progressPct = ((idx + (revealed ? 1 : 0)) / total) * 100;
  const recallCorrect = recallText.trim().toLowerCase().includes('miss');

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

  const onCheckOrNext = () => {
    if (!revealed) {
      if (q.mode === 'mcq'    && selected === null)  return;
      if (q.mode === 'recall' && !recallText.trim()) return;
      setRevealed(true);
    } else {
      next();
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
      {/* Progress */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
      </View>

      {/* Nav */}
      <View style={styles.nav}>
        <Pressable onPress={handleBack}>
          <Text style={styles.navBack}>← Back</Text>
        </Pressable>
        <Text style={styles.navCount}>{idx + 1} of {total}</Text>
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
        <FlipView q={q} flipped={flipped} onFlip={() => setFlipped(!flipped)} onConfidence={next} />
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
              {revealed ? (idx === total - 1 ? 'Restart' : 'Next question →') : 'Check answer'}
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

// Wrap TextInput so we can keep it inline-styled but typed
import { TextInput } from 'react-native';
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
  onConfidence: () => void;
}

const CONFIDENCE_BUTTONS = [
  { label: 'Again', color: colors.red },
  { label: 'Hard',  color: colors.warn },
  { label: 'Good',  color: colors.accent },
  { label: 'Easy',  color: colors.green },
] as const;

function FlipView({ q, flipped, onFlip, onConfidence }: FlipViewProps) {
  return (
    <View style={{ marginHorizontal: 20, marginTop: 20 }}>
      <Pressable onPress={onFlip} style={flipStyles.card}>
        <SectionLabel style={{ marginBottom: 10 }}>
          {flipped ? 'Back' : 'Front · tap to flip'}
        </SectionLabel>
        {flipped ? (
          <Text style={flipStyles.back}>{q.back}</Text>
        ) : (
          <Text style={flipStyles.front}>{q.q}</Text>
        )}
        <Text style={flipStyles.cornerHint}>{flipped ? '← Front' : 'Tap →'}</Text>
      </Pressable>

      {flipped && (
        <View style={flipStyles.confRow}>
          {CONFIDENCE_BUTTONS.map((b) => (
            <Pressable key={b.label} onPress={onConfidence} style={flipStyles.confBtn}>
              <Text style={[flipStyles.confLabel, { color: b.color }]}>{b.label}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const flipStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.surf,
    borderWidth: 1, borderColor: colors.border, borderRadius: 10,
    paddingHorizontal: 20, paddingVertical: 24,
    minHeight: 140, position: 'relative',
  },
  front: { fontSize: 18, fontWeight: '700', letterSpacing: -0.4, lineHeight: 25, color: colors.text, fontFamily: fonts.grotesk },
  back:  { fontSize: 14, lineHeight: 22, color: colors.sub, fontFamily: fonts.grotesk },
  cornerHint: {
    position: 'absolute', top: 14, right: 14,
    fontSize: 10.5, color: colors.muted,
    letterSpacing: 0.7, textTransform: 'uppercase', fontWeight: '600',
    fontFamily: fonts.grotesk,
  },
  confRow: { flexDirection: 'row', gap: 6, marginTop: 12 },
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
