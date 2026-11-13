/**
 * The first run.
 *
 * This used to be three setup questions behind a book emoji: a name, a daily goal,
 * a reminder time. It collected settings from somebody who had not yet been told
 * what the app does, which is the wrong order — the goal question in particular
 * only makes sense once you know a card takes seconds and that the app, not you,
 * decides which ones come back.
 *
 * So three beats come first, and they are the three things a first run has to
 * answer: who this is for, why reading something once is not enough, and what the
 * daily loop actually is. Then the same three questions, now answerable.
 *
 * It is drawn in the language the rest of the app is drawn in — the gradient and
 * the two drifting hills, the character, and surfaces that are a coloured shell
 * with a lighter face sitting on it (theme/ledge.ts). The one picture on the screen
 * is the forgetting curve on the second beat, and it is there because that claim is
 * the whole argument for the product and a sentence makes it sound like an opinion.
 */
import { HomeAsset } from '@/components/HomeAsset';
import LoadingScreen from '@/components/LoadingScreen';
import { MascotCharacter } from '@/components/mascot/MascotCharacter';
import { Carry, Forgetting, Loop } from '@/components/OnboardingArt';
import type { MascotMood } from '@/components/mascot/state';
import { requestNotificationPermissions, scheduleDailyReminders } from '@/lib/notificationService';
import { supabase } from '@/lib/supabase';
import { homeColors } from '@/theme/colors';
import { ledge } from '@/theme/ledge';
import { layout } from '@/theme/spacing';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated as RNAnimated,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, {
  Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: SCREEN_W } = Dimensions.get('window');

const GOAL_OPTIONS = [10, 20, 30, 50, 80] as const;
type GoalCards = (typeof GOAL_OPTIONS)[number];

const REMINDER_TIMES = [
  { label: '6:00 AM', value: '06:00' },
  { label: '7:00 AM', value: '07:00' },
  { label: '8:00 AM', value: '08:00' },
  { label: '9:00 AM', value: '09:00' },
  { label: '12:00 PM', value: '12:00' },
  { label: '2:00 PM', value: '14:00' },
  { label: '5:00 PM', value: '17:00' },
  { label: '6:00 PM', value: '18:00' },
  { label: '7:00 PM', value: '19:00' },
  { label: '8:00 PM', value: '20:00' },
  { label: '9:00 PM', value: '21:00' },
  { label: '10:00 PM', value: '22:00' },
] as const;

// 0: who 1: why 2: how 3: name 4: goal 5: reminder
const TOTAL_STEPS = 6;

/** The same two hills the sign-in screens and Today stand on, each on its own slow
 * sine. The periods do not divide into one another, so the pair never returns to
 * the same arrangement and the background reads as moving rather than as looping. */
function Flow({ name, style, seconds, shiftX, shiftY }: {
  name: 'waveBack' | 'waveFront';
  style: object;
  seconds: number;
  shiftX: number;
  shiftY: number;
}) {
  const reduceMotion = useReducedMotion();
  const phase = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) { phase.value = 0.5; return; }
    phase.value = withRepeat(
      withTiming(1, { duration: seconds * 1000, easing: Easing.inOut(Easing.sin) }),
      -1, true);
  }, [phase, reduceMotion, seconds]);
  const drift = useAnimatedStyle(() => ({
    transform: [
      { translateX: (phase.value - 0.5) * 2 * shiftX },
      { translateY: (phase.value - 0.5) * 2 * shiftY },
    ],
  }));
  return (
    <Animated.View pointerEvents="none" style={[style, drift]}>
      <HomeAsset name={name} />
    </Animated.View>
  );
}

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const [username, setUsername] = useState('');
  const [goalCards, setGoalCards] = useState<GoalCards | null>(null);
  const [reminderTime, setReminderTime] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const slideAnim = useRef(new RNAnimated.Value(0)).current;

  // Pre-fill username from Supabase metadata on mount
  useEffect(() => {
    const loadUser = async () => {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user) return;
      const meta = user.user_metadata as Record<string, unknown> | undefined;
      const existingName =
        (meta?.full_name as string | undefined) ||
        (meta?.name as string | undefined) ||
        user.email?.split('@')[0] ||
        '';
      setUsername(existingName);
    };
    void loadUser();
  }, []);

  const animateTo = (nextStep: number) => {
    const dir = nextStep > step ? 1 : -1;
    slideAnim.setValue(dir * SCREEN_W);
    setStep(nextStep);
    RNAnimated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 80,
      friction: 14,
    }).start();
  };

  const goNext = () => {
    if (step < TOTAL_STEPS - 1) animateTo(step + 1);
  };

  const goBack = () => {
    if (step > 0) animateTo(step - 1);
  };

  const handleFinish = async (skip = false) => {
    setSaving(true);
    try {
      const finalReminder = skip ? null : reminderTime;

      // Save user preferences to Supabase metadata.
      // Field names must match what profile/index.tsx reads:
      //   notification_times (string[]), daily_study_minutes (number), notification_enabled (bool)
      await supabase.auth.updateUser({
        data: {
          full_name: username.trim() || undefined,
          daily_goal_cards: goalCards ?? 20,
          notification_enabled: !!finalReminder,
          notification_times: finalReminder ? [finalReminder] : [],
          onboarding_complete: true,
        },
      });

      // Schedule notification if reminder time is set
      if (finalReminder) {
        try {
          const granted = await requestNotificationPermissions();
          if (granted) {
            await scheduleDailyReminders([finalReminder]);
          }
        } catch {
          // Notification failure is non-blocking
        }
      }

      router.replace('/(tabs)');
    } catch (err) {
      console.error('Onboarding save error:', err);
      // Still navigate even if save fails
      router.replace('/(tabs)');
    } finally {
      setSaving(false);
    }
  };

  const steps = [
    <WhoStep key="who" onNext={goNext} />,
    <WhyStep key="why" onNext={goNext} />,
    <HowStep key="how" onNext={goNext} />,
    <NameStep key="name" value={username} onChange={setUsername} onNext={goNext} />,
    <GoalStep key="goal" selected={goalCards} onSelect={setGoalCards} onNext={goNext} />,
    <ReminderStep
      key="reminder"
      selected={reminderTime}
      onSelect={setReminderTime}
      onFinish={() => void handleFinish(false)}
      onSkip={() => void handleFinish(true)}
    />,
  ];

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.root}>
      <LoadingScreen visible={saving} />
      <LinearGradient pointerEvents="none"
        colors={[homeColors.gradientStart, homeColors.gradientBright, homeColors.gradientSoft, homeColors.canvas]}
        locations={[0, 0.21154, 0.44712, 1]} style={styles.background} />
      <Flow name="waveBack" style={styles.waveBack} seconds={13} shiftX={-15} shiftY={16} />
      <Flow name="waveFront" style={styles.waveFront} seconds={9} shiftX={15} shiftY={-20} />

      <View style={[styles.frame, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.topRow}>
          <Pressable accessibilityRole="button" accessibilityLabel="Go back"
            onPress={goBack} disabled={step === 0}
            style={[styles.back, step === 0 && styles.backHidden]}>
            <Feather name="arrow-left" size={18} color={homeColors.deep} />
          </Pressable>
          <View style={styles.dots}>
            {Array.from({ length: TOTAL_STEPS }, (_, i) => (
              <View key={i} style={[
                styles.dot,
                i === step ? styles.dotHere : i < step ? styles.dotPast : styles.dotAhead,
              ]} />
            ))}
          </View>
          {/* The back button's twin, so the dots sit on the centre of the screen
              and not on the centre of what is left over beside it. */}
          <View style={styles.back} />
        </View>

        <RNAnimated.View style={[styles.stage, { transform: [{ translateX: slideAnim }] }]}>
          {steps[step]}
        </RNAnimated.View>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── The shape every step has ────────────────────────────────────────────────

/** Character, the picture, then a card with the few words that picture needs, then
 * one button. The character is held on one face (`calm`): what moves is the tail
 * and the eyes. A face that keeps switching above a page that is already moving is
 * one moving thing too many. */
function Step({ mood, mascot = 128, hero, bare, title, line, children, footer }: {
  mood: MascotMood;
  mascot?: number;
  hero?: React.ReactNode;
  /** No card: the words sit on the background and the picture is the screen. The
   *  first beat is a welcome, not a question, and a card under a fan of cards read
   *  as one more card in the pile. */
  bare?: boolean;
  title: string;
  line?: string;
  children?: React.ReactNode;
  footer: React.ReactNode;
}) {
  const words = (
    <>
      <Text style={[styles.title, bare && styles.titleBare]}>{title}</Text>
      {!!line && <Text style={[styles.body, bare && styles.bodyBare]}>{line}</Text>}
    </>
  );
  return (
    <View style={styles.step}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
        <MascotCharacter width={mascot} mood={mood} calm style={styles.mascot} />
        {bare && <View style={styles.bareWords}>{words}</View>}
        {hero}
        {!bare && (
          <View style={styles.card}>
            <View style={styles.cardFace}>
              {words}
              {children}
            </View>
          </View>
        )}
      </ScrollView>
      <View style={styles.footer}>{footer}</View>
    </View>
  );
}

function Lead({ label, onPress, off }: { label: string; onPress: () => void; off?: boolean }) {
  return (
    <Pressable accessibilityRole="button"
      style={[styles.lead, off && styles.leadOff]}
      onPress={off ? undefined : onPress}
      disabled={off}>
      <View style={styles.leadFace}>
        <Text style={styles.leadText}>{label}</Text>
      </View>
    </Pressable>
  );
}

// ─── 1: Who it is for ────────────────────────────────────────────────────────

function WhoStep({ onNext }: { onNext: () => void }) {
  return (
    <Step mood="onboarding" mascot={120} hero={<Carry />} bare
      title="For what you still need next month"
      footer={<Lead label="Why it works" onPress={onNext} />} />
  );
}

// ─── 2: Why it is needed ─────────────────────────────────────────────────────

function WhyStep({ onNext }: { onNext: () => void }) {
  return (
    <Step mood="sleepy" mascot={110}
      title="A week later, most of it is gone"
      line="MemQ works out the day each card is about to slip, and brings it back then."
      footer={<Lead label="Next" onPress={onNext} />}>
      <Forgetting />
    </Step>
  );
}

// ─── 3: How it is used ───────────────────────────────────────────────────────

function HowStep({ onNext }: { onNext: () => void }) {
  return (
    <Step mood="happy" mascot={110}
      title="Three steps. Two of them are ours."
      line="A card takes seconds, so a day is a couple of minutes."
      footer={<Lead label="Set it up" onPress={onNext} />}>
      <Loop />
    </Step>
  );
}

// ─── 4: Name ─────────────────────────────────────────────────────────────────

function NameStep({ value, onChange, onNext }: {
  value: string;
  onChange: (v: string) => void;
  onNext: () => void;
}) {
  const ready = value.trim().length > 0;
  return (
    <Step mood="onboarding" mascot={112} title="What should we call you?"
      line="It goes at the top of your home screen."
      footer={<Lead label="Next" onPress={onNext} off={!ready} />}>
      <View style={styles.field}>
        <TextInput accessibilityLabel="Your name"
          style={styles.input}
          value={value}
          onChangeText={onChange}
          placeholder="Your name"
          placeholderTextColor={homeColors.placeholder}
          autoCorrect={false}
          autoCapitalize="words"
          returnKeyType="done"
          onSubmitEditing={() => ready && onNext()}
          maxLength={40}
        />
      </View>
    </Step>
  );
}

// ─── 5: Daily goal ───────────────────────────────────────────────────────────

function GoalStep({ selected, onSelect, onNext }: {
  selected: GoalCards | null;
  onSelect: (v: GoalCards) => void;
  onNext: () => void;
}) {
  return (
    <Step mood="excited" mascot={112} title="How many cards a day?"
      line="Twenty is about two minutes. Pick one you would still do on a bad day."
      footer={<Lead label="Next" onPress={onNext} off={selected === null} />}>
      <View style={styles.chips}>
        {GOAL_OPTIONS.map((cards) => {
          const on = selected === cards;
          return (
            <Pressable accessibilityRole="button" key={cards}
              style={[styles.chip, on && styles.chipOn]}
              onPress={() => onSelect(cards)}>
              <View style={[styles.chipFace, on && styles.chipFaceOn]}>
                <Text style={[styles.chipNum, on && styles.chipTextOn]}>{cards}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </Step>
  );
}

// ─── 6: Reminder ─────────────────────────────────────────────────────────────

function ReminderStep({ selected, onSelect, onFinish, onSkip }: {
  selected: string | null;
  onSelect: (v: string) => void;
  onFinish: () => void;
  onSkip: () => void;
}) {
  return (
    <Step mood="idle" mascot={112} title="When should we remind you?"
      footer={(
        <View style={styles.footerStack}>
          <Lead label={selected ? 'Start learning' : 'Skip for now'}
            onPress={selected ? onFinish : onSkip} />
        </View>
      )}
      line="One a day, at a time you are usually free. You can change it later.">
      <View style={styles.times}>
        {REMINDER_TIMES.map((t) => {
          const on = selected === t.value;
          return (
            <Pressable accessibilityRole="button" key={t.value}
              style={[styles.time, on && styles.chipOn]}
              onPress={() => onSelect(t.value)}>
              <View style={[styles.timeFace, on && styles.chipFaceOn]}>
                <Text style={[styles.timeText, on && styles.chipTextOn]}>{t.label}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </Step>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: homeColors.canvas },
  background: { position: 'absolute', top: 0, left: 0, right: 0, height: 874 },
  waveBack: { position: 'absolute', top: 150, left: -19 },
  waveFront: { position: 'absolute', top: 187, left: -19 },
  frame: { flex: 1 },

  topRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: layout.screenInline, paddingBottom: 4,
  },
  back: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  backHidden: { opacity: 0 },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  dotHere: { width: 20, backgroundColor: homeColors.primary },
  dotPast: { backgroundColor: homeColors.streakBorder },
  dotAhead: { backgroundColor: homeColors.border },

  stage: { flex: 1 },
  step: { flex: 1 },
  scroll: { flex: 1 },
  // Centred, so a short step sits in the middle of the screen rather than pinned
  // to the top with the button a long way below it. A step taller than the screen
  // (the twelve reminder times) overflows and scrolls as usual.
  scrollContent: {
    flexGrow: 1, justifyContent: 'center',
    paddingHorizontal: layout.screenInline, paddingBottom: 12, gap: 4,
  },
  mascot: { alignSelf: 'center' },

  // A shell with a lighter face on it, offset so a band shows along the bottom.
  // In a palette with no shadows that band is the only depth there is — see
  // theme/ledge.ts for the scale.
  card: {
    backgroundColor: homeColors.border, borderRadius: 32, paddingBottom: ledge.raised,
  },
  cardFace: {
    backgroundColor: homeColors.white, borderRadius: 32, padding: 20, gap: 14,
  },
  bareWords: { alignItems: 'center', gap: 8, paddingHorizontal: 8, paddingBottom: 4 },
  title: {
    fontFamily: 'Geist_600SemiBold', fontSize: 24, lineHeight: 30,
    color: homeColors.darkest,
  },
  titleBare: { fontSize: 27, lineHeight: 34, textAlign: 'center' },
  bodyBare: { textAlign: 'center' },
  body: {
    fontFamily: 'Geist_500Medium', fontSize: 15, lineHeight: 22, color: homeColors.muted,
  },

  field: {
    minHeight: 52, borderRadius: 16, backgroundColor: homeColors.canvas,
    justifyContent: 'center', paddingHorizontal: 16,
  },
  input: {
    fontFamily: 'Geist_500Medium', fontSize: 16, color: homeColors.darkest,
    paddingVertical: 14,
  },

  // One row of five, each taking an equal share of it. Wrapped, the fifth sat alone
  // on a second row, which reads as a mistake rather than as a set. The unit went
  // into the question — "How many cards a day?" — so the chips carry the number
  // alone and fit.
  chips: { flexDirection: 'row', gap: 8 },
  chip: {
    flex: 1, borderRadius: 18, backgroundColor: homeColors.border, paddingBottom: ledge.control,
  },
  chipOn: { backgroundColor: homeColors.deep },
  // The face is canvas, not white: a white face on a white card showed only as its
  // ledge, which is not enough to read as a thing you can press.
  chipFace: {
    borderRadius: 18, backgroundColor: homeColors.canvas,
    alignItems: 'center', justifyContent: 'center', paddingVertical: 14,
  },
  chipFaceOn: { backgroundColor: homeColors.primary },
  chipNum: { fontFamily: 'Geist_600SemiBold', fontSize: 20, color: homeColors.darkest },
  chipTextOn: { color: homeColors.white },

  times: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  time: {
    borderRadius: 16, backgroundColor: homeColors.border, paddingBottom: ledge.control,
  },
  timeFace: {
    borderRadius: 16, backgroundColor: homeColors.canvas,
    alignItems: 'center', justifyContent: 'center', paddingVertical: 9, paddingHorizontal: 14,
  },
  timeText: { fontFamily: 'Geist_500Medium', fontSize: 14, color: homeColors.darkest },

  footer: { paddingHorizontal: layout.screenInline, paddingTop: 12 },
  footerStack: { gap: 10 },
  lead: {
    height: 59 + ledge.lead, borderRadius: 42, backgroundColor: homeColors.deep,
    paddingBottom: ledge.lead,
  },
  leadOff: { opacity: 0.45 },
  leadFace: {
    flex: 1, borderRadius: 42, backgroundColor: homeColors.primary,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  leadText: {
    fontFamily: 'Geist_500Medium', fontSize: 22, lineHeight: 30, color: homeColors.white,
  },
});
