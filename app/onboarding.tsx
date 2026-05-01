import { requestNotificationPermissions, scheduleDailyReminders } from '@/lib/notificationService';
import { supabase } from '@/lib/supabase';
import { colors } from '@/theme';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: SCREEN_W } = Dimensions.get('window');

const GOAL_OPTIONS = [5, 10, 15, 20, 30, 45, 60] as const;
type GoalMinutes = (typeof GOAL_OPTIONS)[number];

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

const TOTAL_STEPS = 4; // 0: Welcome, 1: Username, 2: Goal, 3: Reminder

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const [username, setUsername] = useState('');
  const [goalMinutes, setGoalMinutes] = useState<GoalMinutes | null>(null);
  const [reminderTime, setReminderTime] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const slideAnim = useRef(new Animated.Value(0)).current;

  // Pre-fill username from Supabase metadata on mount
  useState(() => {
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
  });

  const animateTo = (nextStep: number) => {
    const dir = nextStep > step ? 1 : -1;
    slideAnim.setValue(dir * SCREEN_W);
    setStep(nextStep);
    Animated.spring(slideAnim, {
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

      // Save user preferences to Supabase metadata
      await supabase.auth.updateUser({
        data: {
          full_name: username.trim() || undefined,
          daily_goal_minutes: goalMinutes ?? 20,
          reminder_time: finalReminder,
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
    <WelcomeStep key="welcome" onNext={goNext} />,
    <UsernameStep
      key="username"
      value={username}
      onChange={setUsername}
      onNext={goNext}
      onBack={goBack}
    />,
    <GoalStep
      key="goal"
      selected={goalMinutes}
      onSelect={setGoalMinutes}
      onNext={goNext}
      onBack={goBack}
    />,
    <ReminderStep
      key="reminder"
      selected={reminderTime}
      onSelect={setReminderTime}
      onFinish={() => void handleFinish(false)}
      onSkip={() => void handleFinish(true)}
      onBack={goBack}
      saving={saving}
    />,
  ];

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* Progress dots — hidden on welcome step */}
      {step > 0 && (
        <View style={styles.progressRow}>
          {Array.from({ length: TOTAL_STEPS - 1 }, (_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                i < step ? styles.dotFilled : styles.dotEmpty,
              ]}
            />
          ))}
        </View>
      )}

      <Animated.View style={[styles.stepContainer, { transform: [{ translateX: slideAnim }] }]}>
        {steps[step]}
      </Animated.View>
    </View>
  );
}

// ─── Step 0: Welcome ─────────────────────────────────────────────────────────

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <View style={styles.stepInner}>
      <View style={styles.welcomeIconWrap}>
        <Text style={styles.welcomeEmoji}>📚</Text>
      </View>
      <Text style={styles.welcomeTitle}>Welcome to MemQ</Text>
      <Text style={styles.welcomeSub}>
        Let's take a moment to set up your learning experience. It only takes a minute.
      </Text>
      <Pressable style={styles.primaryBtn} onPress={onNext}>
        <Text style={styles.primaryBtnText}>Get Started →</Text>
      </Pressable>
    </View>
  );
}

// ─── Step 1: Username ─────────────────────────────────────────────────────────

function UsernameStep({
  value,
  onChange,
  onNext,
  onBack,
}: {
  value: string;
  onChange: (v: string) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const canProceed = value.trim().length > 0;
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.stepInner}>
        <Pressable onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Back</Text>
        </Pressable>

        <View style={styles.stepTextBlock}>
          <Text style={styles.stepLabel}>01 / 03</Text>
          <Text style={styles.stepTitle}>What should we call you?</Text>
          <Text style={styles.stepSub}>
            This name will appear on your home screen.
          </Text>
        </View>

        <TextInput
          style={styles.textInput}
          value={value}
          onChangeText={onChange}
          placeholder="Your name"
          placeholderTextColor={colors.muted}
          autoCorrect={false}
          autoCapitalize="words"
          returnKeyType="done"
          onSubmitEditing={() => canProceed && onNext()}
          maxLength={40}
        />

        <Pressable
          style={[styles.primaryBtn, !canProceed && styles.primaryBtnDisabled]}
          onPress={canProceed ? onNext : undefined}
          disabled={!canProceed}
        >
          <Text style={styles.primaryBtnText}>Next →</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Step 2: Daily Goal ───────────────────────────────────────────────────────

function GoalStep({
  selected,
  onSelect,
  onNext,
  onBack,
}: {
  selected: GoalMinutes | null;
  onSelect: (v: GoalMinutes) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const canProceed = selected !== null;
  return (
    <View style={styles.stepInner}>
      <Pressable onPress={onBack} style={styles.backBtn}>
        <Text style={styles.backBtnText}>← Back</Text>
      </Pressable>

      <View style={styles.stepTextBlock}>
        <Text style={styles.stepLabel}>02 / 03</Text>
        <Text style={styles.stepTitle}>Daily study goal</Text>
        <Text style={styles.stepSub}>
          How many minutes do you want to study each day?
        </Text>
      </View>

      <View style={styles.chipGrid}>
        {GOAL_OPTIONS.map((min) => {
          const isSelected = selected === min;
          return (
            <Pressable
              key={min}
              style={[styles.chip, isSelected && styles.chipSelected]}
              onPress={() => onSelect(min)}
            >
              <Text style={[styles.chipNum, isSelected && styles.chipNumSelected]}>
                {min}
              </Text>
              <Text style={[styles.chipUnit, isSelected && styles.chipUnitSelected]}>
                min
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        style={[styles.primaryBtn, !canProceed && styles.primaryBtnDisabled]}
        onPress={canProceed ? onNext : undefined}
        disabled={!canProceed}
      >
        <Text style={styles.primaryBtnText}>Next →</Text>
      </Pressable>
    </View>
  );
}

// ─── Step 3: Daily Reminder ───────────────────────────────────────────────────

function ReminderStep({
  selected,
  onSelect,
  onFinish,
  onSkip,
  onBack,
  saving,
}: {
  selected: string | null;
  onSelect: (v: string) => void;
  onFinish: () => void;
  onSkip: () => void;
  onBack: () => void;
  saving: boolean;
}) {
  return (
    <View style={[styles.stepInner, { paddingBottom: 0 }]}>
      <Pressable onPress={onBack} style={styles.backBtn}>
        <Text style={styles.backBtnText}>← Back</Text>
      </Pressable>

      <View style={styles.stepTextBlock}>
        <Text style={styles.stepLabel}>03 / 03</Text>
        <Text style={styles.stepTitle}>Daily reminder</Text>
        <Text style={styles.stepSub}>
          Pick a time and we'll remind you to study. You can change this later.
        </Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.timeGrid}
      >
        {REMINDER_TIMES.map((t) => {
          const isSelected = selected === t.value;
          return (
            <Pressable
              key={t.value}
              style={[styles.timeChip, isSelected && styles.timeChipSelected]}
              onPress={() => onSelect(t.value)}
            >
              <Text style={[styles.timeChipText, isSelected && styles.timeChipTextSelected]}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.reminderActions}>
        <Pressable
          style={[styles.primaryBtn, { flex: 1 }, saving && styles.primaryBtnDisabled]}
          onPress={selected ? onFinish : onSkip}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.primaryBtnText}>
              {selected ? "Let's go →" : 'Done →'}
            </Text>
          )}
        </Pressable>
        {!selected && (
          <Pressable style={styles.skipBtn} onPress={onSkip} disabled={saving}>
            <Text style={styles.skipBtnText}>Skip</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingTop: 16,
    paddingBottom: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotFilled: {
    backgroundColor: colors.accent,
  },
  dotEmpty: {
    backgroundColor: colors.border,
  },
  stepContainer: {
    flex: 1,
  },
  stepInner: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 32,
    paddingBottom: 32,
  },

  // Welcome
  welcomeIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: colors.accentL,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  welcomeEmoji: {
    fontSize: 36,
  },
  welcomeTitle: {
    fontFamily: 'JetBrainsMono_700',
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.8,
    color: colors.text,
    marginBottom: 14,
    fontWeight: '400',
  },
  welcomeSub: {
    fontFamily: 'JetBrainsMono_400',
    fontSize: 14,
    lineHeight: 22,
    color: colors.muted,
    marginBottom: 48,
    fontWeight: '400',
  },

  // Back
  backBtn: {
    alignSelf: 'flex-start',
    marginBottom: 28,
  },
  backBtnText: {
    fontFamily: 'JetBrainsMono_400',
    fontSize: 13,
    color: colors.muted,
    fontWeight: '400',
  },

  // Step header
  stepTextBlock: {
    marginBottom: 28,
  },
  stepLabel: {
    fontFamily: 'JetBrainsMono_400',
    fontSize: 11,
    color: colors.muted,
    marginBottom: 8,
    letterSpacing: 0.5,
    fontWeight: '400',
  },
  stepTitle: {
    fontFamily: 'JetBrainsMono_700',
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: -0.6,
    color: colors.text,
    marginBottom: 8,
    fontWeight: '400',
  },
  stepSub: {
    fontFamily: 'JetBrainsMono_400',
    fontSize: 13,
    lineHeight: 20,
    color: colors.muted,
    fontWeight: '400',
  },

  // Text input
  textInput: {
    fontFamily: 'JetBrainsMono_400',
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.surf,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 24,
    fontWeight: '400',
  },

  // Goal chips
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 32,
  },
  chip: {
    backgroundColor: colors.surf,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 14,
    alignItems: 'center',
    minWidth: 78,
  },
  chipSelected: {
    backgroundColor: colors.accentL,
    borderColor: colors.accent,
  },
  chipNum: {
    fontFamily: 'JetBrainsMono_700',
    fontSize: 20,
    lineHeight: 24,
    color: colors.text,
    fontWeight: '400',
  },
  chipNumSelected: {
    color: colors.accent,
  },
  chipUnit: {
    fontFamily: 'JetBrainsMono_400',
    fontSize: 11,
    color: colors.muted,
    marginTop: 2,
    fontWeight: '400',
  },
  chipUnitSelected: {
    color: colors.accent,
  },

  // Time chips
  timeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingBottom: 16,
  },
  timeChip: {
    backgroundColor: colors.surf,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  timeChipSelected: {
    backgroundColor: colors.accentL,
    borderColor: colors.accent,
  },
  timeChipText: {
    fontFamily: 'JetBrainsMono_400',
    fontSize: 13,
    color: colors.sub,
    fontWeight: '400',
  },
  timeChipTextSelected: {
    fontFamily: 'JetBrainsMono_700',
    color: colors.accent,
    fontWeight: '400',
  },

  // Reminder actions
  reminderActions: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 12,
    paddingBottom: 16,
    alignItems: 'center',
  },
  skipBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  skipBtnText: {
    fontFamily: 'JetBrainsMono_400',
    fontSize: 13,
    color: colors.muted,
    fontWeight: '400',
  },

  // Primary button
  primaryBtn: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnDisabled: {
    opacity: 0.45,
  },
  primaryBtnText: {
    fontFamily: 'JetBrainsMono_700',
    fontSize: 15,
    color: '#fff',
    fontWeight: '400',
  },
});
