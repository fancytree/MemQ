import { layout } from '@/theme/spacing';
import Logo from '@/components/icons/Logo';
import { HomeAsset } from '@/components/HomeAsset';
import { MascotCharacter } from '@/components/mascot/MascotCharacter';
import { MASCOT_ART, MASCOT_HANDS } from '@/components/mascot/figma-parts';
import { homeColors, referenceColors } from '@/theme/colors';
import { LinearGradient } from 'expo-linear-gradient';
import { useSubscription } from '@/context/SubscriptionContext';
import { signInWithOAuth, startGoogleOAuthInSafari } from '@/lib/auth';
import { navigateAfterAuth } from '@/lib/navigation';
import { supabase } from '@/lib/supabase';
import { colors } from '@/theme';
import { Feather, FontAwesome5 } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming,
} from 'react-native-reanimated';
import {
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

/** The same two drifting hills the login screen stands on; see Flow there. */
function Flow({ name, style, seconds, shiftX, shiftY }: {
  name: 'waveBack' | 'waveFront'; style: object;
  seconds: number; shiftX: number; shiftY: number;
}) {
  const reduceMotion = useReducedMotion();
  const phase = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) { phase.value = 0.5; return; }
    phase.value = withRepeat(
      withTiming(1, { duration: seconds * 1000, easing: Easing.inOut(Easing.sin) }), -1, true);
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

/** The character perched on the card, and where the card's top edge crosses it —
 * read off the hands rather than typed, as on the login screen. */
const PERCH_MASCOT = 190;
const HAND_LINE = MASCOT_HANDS.reduce((sum, h) => sum + (h.box[1] + h.box[3]) / 2, 0)
  / MASCOT_HANDS.length / 256;
/** The character stands on the golden section of the screen rather than its middle:
 * 0.618 across, which is 0.118 of the width right of centre. Off-centre by a little
 * reads as a mistake; this is far enough to read as a decision.
 *
 * The card is nested in its box, so whatever this moves the box, the card's two
 * margins give back — one loses what the other gains. */
/** Right of the golden section rather than on it: with the header left-aligned
 * there is weight on both sides now, and the character can sit further over
 * without the page leaning. */
const PERCH_AT = 0.69;

/** The drawing is not centred in its own square. Taking the body and the hands —
 * the mass the eye reads, the tail being a thin thing off to one side — their middle
 * sits seven units left of the square's, so aiming the box at a point leaves the
 * character short of it. Measured on screen before this correction: 0.604 across
 * where 0.618 was asked for, which is the same seven units.
 */
const INK_OFFSET = (() => {
  const boxes = [
    ...MASCOT_ART.neutral.parts.filter((p) => p.name === 'body').map((p) => p.box),
    ...MASCOT_HANDS.map((p) => p.box),
  ];
  const mid = (Math.min(...boxes.map((b) => b[0])) + Math.max(...boxes.map((b) => b[2]))) / 2;
  return (128 - mid) / 256;
})();

const CARD_LIFT = -(1 - (HAND_LINE + 7 / 256)) * PERCH_MASCOT;
const SOCIAL_MASCOT = 54;
const BUTTON_MASCOT = 72;

/** Placeholder ink. A hint is not content: `muted` measures 5.3:1 against the field
 * it sits in, which is body-text contrast, and that is why it read as something
 * already typed. This is 2.5:1 — a light grey, still readable, and plainly behind
 * anything the person enters. The next lighter thing in the palette is 1.4:1, which
 * is not readable at all.
 *
 * The palette has no placeholder ink of its own, so this borrows the lightest grey
 * in it. The name belongs to the palette; the use is this, and it is worth giving it
 * a name of its own next time theme/colors.ts is being edited anyway. */
const HINT = referenceColors.planeTrail;

const SUBSCRIPTION_REFRESH_TIMEOUT_MS = 4000;

export default function SignUpScreen() {
  const [identifier, setIdentifier] = useState(''); // 邮箱输入框
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<'google' | 'apple' | null>(null);
  const [typingPassword, setTypingPassword] = useState(false);
  const { width: screenWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const cardBleed = -((screenWidth - layout.screenInline * 2) - PERCH_MASCOT) / 2;
  const perchShift = screenWidth * (PERCH_AT - 0.5);
  const busy = loading || oauthLoading !== null;
  const { refreshSubscriptionStatus } = useSubscription();

  const safeRefreshSubscription = async () => {
    try {
      await Promise.race([
        refreshSubscriptionStatus(),
        new Promise((resolve) => setTimeout(resolve, SUBSCRIPTION_REFRESH_TIMEOUT_MS)),
      ]);
    } catch (error) {
      if (__DEV__) {
        console.warn('Subscription refresh failed, continue signup flow:', error);
      }
    }
  };

  // 验证邮箱格式（与 login.tsx 中的验证逻辑相同）
  const isValidEmail = (email: string) => {
    // 更严格的邮箱验证正则表达式
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

    // 基本检查
    if (!email || email.trim().length === 0) {
      return false;
    }

    // 检查长度
    if (email.length > 255) {
      return false;
    }

    // 检查是否包含 @ 符号
    const atIndex = email.indexOf('@');
    if (atIndex === -1 || atIndex === 0 || atIndex === email.length - 1) {
      return false;
    }

    // 检查域名部分
    const domain = email.substring(atIndex + 1);
    if (domain.length === 0 || !domain.includes('.')) {
      return false;
    }

    // 检查域名部分是否至少有一个有效的顶级域名（至少2个字符）
    const domainParts = domain.split('.');
    if (domainParts.length < 2) {
      return false;
    }

    const tld = domainParts[domainParts.length - 1];
    if (tld.length < 2) {
      return false;
    }

    // 使用正则表达式验证
    return emailRegex.test(email.trim());
  };

  // 判断输入类型（目前只支持邮箱）
  const detectIdentifierType = (input: string): 'email' | 'phone' => {
    // 暂时只支持邮箱注册
    return 'email';
  };

  const signUp = async () => {
    if (!identifier || !password || !confirmPassword) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    const trimmedIdentifier = identifier.trim();
    // 暂时只支持邮箱注册

    // 验证邮箱格式
    if (!isValidEmail(trimmedIdentifier)) {
      Alert.alert('Error', 'Please enter a valid email address. The email must have a valid format (e.g., user@example.com)');
      return;
    }

    // 验证密码长度
    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters long');
      return;
    }

    // 验证密码确认
    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: trimmedIdentifier,
      password,
      options: {
        emailRedirectTo: undefined, // 移动端不需要重定向
      },
    });

    if (error) {
      Alert.alert('Error', error.message);
      setLoading(false);
    } else {
      // 检查是否需要邮箱验证
      if (data.user && !data.session) {
        // 需要邮箱验证
        Alert.alert(
          'Verification Email Sent',
          'We\'ve sent a verification email to ' + trimmedIdentifier + '. Please check your inbox and click the verification link to activate your account.',
          [
            {
              text: 'OK',
              onPress: () => router.replace('/login'),
            },
          ]
        );
      } else if (data.session) {
        // 邮箱已验证，直接登录
        Alert.alert('Success', 'Account created successfully!', [
          {
            text: 'OK',
            onPress: () => {
              safeRefreshSubscription();
              void navigateAfterAuth();
            },
          },
        ]);
      } else {
        // 其他情况
      Alert.alert('Success', 'Account created! Please sign in.', [
        {
          text: 'OK',
          onPress: () => router.replace('/login'),
        },
      ]);
      }
      setLoading(false);
    }
  };

  // Google 登录
  const handleGoogleSignIn = async () => {
    setOauthLoading('google');
    try {
      if (Platform.OS === 'ios') {
        // iOS：SFSafariViewController（应用内，无 Apple 确认框）
        const { data, error } = await startGoogleOAuthInSafari();
        if (error) {
          Alert.alert('Error', error.message || 'Failed to sign in with Google');
          return;
        }
        if (data) {
          await safeRefreshSubscription();
          await navigateAfterAuth();
        }
        // data 和 error 都为 null：用户取消，不做任何操作
        return;
      }

      // Android / Web
      const { data, error } = await signInWithOAuth('google');
      if (error) {
        if (error.message === 'User cancelled authentication') return;
        Alert.alert('Error', error.message || 'Failed to sign in with Google');
        return;
      }
      if (data) {
        await safeRefreshSubscription();
        await navigateAfterAuth();
      }
    } catch (error: any) {
      if (__DEV__) console.error('Google sign in error:', error);
      Alert.alert('Error', error.message || 'Failed to sign in with Google');
    } finally {
      setOauthLoading(null);
    }
  };

  // Apple 登录
  const handleAppleSignIn = async () => {
    setOauthLoading('apple');
    try {
      const { data, error } = await signInWithOAuth('apple');

      if (error) {
        Alert.alert('Error', error.message || 'Failed to sign in with Apple');
        return;
      }

      if (data) {
        // 刷新订阅状态
        await safeRefreshSubscription();
        await navigateAfterAuth();
      }
    } catch (error: any) {
      console.error('Apple sign in error:', error);
      Alert.alert('Error', error.message || 'Failed to sign in with Apple');
    } finally {
      setOauthLoading(null);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}>
      <LinearGradient pointerEvents="none"
        colors={[homeColors.gradientStart, homeColors.gradientBright, homeColors.gradientSoft, homeColors.canvas]}
        locations={[0, 0.21154, 0.44712, 1]} style={styles.background} />
      <Flow name="waveBack" style={styles.waveBack} seconds={13} shiftX={-15} shiftY={16} />
      <Flow name="waveFront" style={styles.waveFront} seconds={9} shiftX={15} shiftY={-20} />
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 76 }]}
        keyboardShouldPersistTaps="handled">
        <View style={styles.content}>
          <View style={styles.hero}>
            <Logo width={190} align="left" />
            <Text style={styles.tagline}>Create your account</Text>
          </View>

          <MascotCharacter width={PERCH_MASCOT}
            mood={busy ? 'thinking' : 'onboarding'}
            calm
            eyesShut={typingPassword}
            style={[styles.perch, { marginLeft: (perchShift + INK_OFFSET * PERCH_MASCOT) * 2 }]}
            behind={(
              <View style={[styles.card, { marginLeft: cardBleed - perchShift, marginRight: cardBleed + perchShift }]}>
                <View style={styles.cardFace}>
                  <View style={styles.field}>
                    <TextInput accessibilityLabel="Email"
                      style={styles.input}
                      placeholder="Email"
                      placeholderTextColor={HINT}
                      value={identifier}
                      onChangeText={setIdentifier}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoComplete="email"
                      editable={!loading}
                    />
                  </View>

                  <View style={styles.field}>
                    <TextInput accessibilityLabel="Password"
                      style={[styles.input, styles.passwordInput]}
                      placeholder="Password"
                      placeholderTextColor={HINT}
                      value={password}
                      onChangeText={setPassword}
                      onFocus={() => setTypingPassword(true)}
                      onBlur={() => setTypingPassword(false)}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      editable={!loading}
                    />
                    <TouchableOpacity accessibilityRole="button"
                      accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                      style={styles.eyeButton}
                      onPress={() => setShowPassword(!showPassword)}
                      activeOpacity={0.7}>
                      <Feather name={showPassword ? 'eye-off' : 'eye'} size={20} color={homeColors.muted} />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.field}>
                    <TextInput accessibilityLabel="Confirm Password"
                      style={[styles.input, styles.passwordInput]}
                      placeholder="Confirm Password"
                      placeholderTextColor={HINT}
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      onFocus={() => setTypingPassword(true)}
                      onBlur={() => setTypingPassword(false)}
                      secureTextEntry={!showConfirmPassword}
                      autoCapitalize="none"
                      editable={!loading}
                    />
                    <TouchableOpacity accessibilityRole="button"
                      accessibilityLabel={showConfirmPassword ? 'Hide password' : 'Show password'}
                      style={styles.eyeButton}
                      onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                      activeOpacity={0.7}>
                      <Feather name={showConfirmPassword ? 'eye-off' : 'eye'} size={20} color={homeColors.muted} />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )} />

          <TouchableOpacity accessibilityRole="button"
            accessibilityState={{ disabled: busy }}
            style={[styles.signUp, busy && styles.signUpBusy]}
            onPress={signUp}
            activeOpacity={0.9}
            disabled={busy}>
            <View style={styles.signUpFace}>
              {loading
                ? <MascotCharacter width={BUTTON_MASCOT} mood="excited" />
                : <Text style={styles.signUpText}>Sign Up</Text>}
            </View>
          </TouchableOpacity>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>OR</Text>
            <View style={styles.dividerLine} />
          </View>

          <View style={styles.socialCol}>
            {Platform.OS === 'ios' && (
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Sign in with Apple"
                style={[styles.social, styles.appleBtn]}
                onPress={handleAppleSignIn} disabled={busy} activeOpacity={0.85}>
                {oauthLoading === 'apple'
                  ? <MascotCharacter width={BUTTON_MASCOT} mood="thinking" />
                  : (
                    <>
                      <FontAwesome5 name="apple" size={20} color={homeColors.white} />
                      <Text style={[styles.socialText, styles.appleText]}>Sign in with Apple</Text>
                    </>
                  )}
              </TouchableOpacity>
            )}

            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Sign in with Google"
              style={[styles.social, styles.googleBtn]}
              onPress={handleGoogleSignIn} disabled={busy} activeOpacity={0.85}>
              {oauthLoading === 'google'
                ? <MascotCharacter width={BUTTON_MASCOT} mood="thinking" />
                : (
                  <>
                    <FontAwesome5 name="google" size={19} color={colors.google} />
                    <Text style={[styles.socialText, styles.googleText]}>Sign in with Google</Text>
                  </>
                )}
            </TouchableOpacity>
          </View>

          <View style={styles.signInRow}>
            <Text style={styles.signInText}>Already have an account? </Text>
            <TouchableOpacity accessibilityRole="button"
              onPress={() => router.replace('/login')} activeOpacity={0.7}>
              <Text style={styles.signInLink}>Sign In</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: homeColors.canvas },
  background: { position: 'absolute', top: 0, left: 0, right: 0, height: 874 },
  waveBack: { position: 'absolute', top: 96, left: -19 },
  waveFront: { position: 'absolute', top: 133, left: -19 },
  scrollContent: { flexGrow: 1, paddingBottom: 32 },
  content: { flex: 1, paddingHorizontal: layout.screenInline, gap: 16 },

  // Left-aligned, so the page has mass on both sides: the wordmark answers the
  // character rather than sitting above it. Nothing decorative was added to
  // balance the composition — balancing ornament with ornament is how a screen
  // fills up.
  hero: { alignItems: 'flex-start', gap: 6 },
  perch: { alignSelf: 'center' },
  tagline: { fontFamily: 'Geist_500Medium', fontSize: 16, color: homeColors.muted },

  card: { marginTop: CARD_LIFT, backgroundColor: homeColors.border, borderRadius: 32, paddingBottom: 3 },
  cardFace: { backgroundColor: homeColors.white, borderRadius: 32, padding: 16, gap: 12 },
  field: { minHeight: 52, borderRadius: 16, backgroundColor: homeColors.canvas, justifyContent: 'center', paddingHorizontal: 16 },
  input: { fontFamily: 'Geist_500Medium', fontSize: 16, color: homeColors.darkest, paddingVertical: 14 },
  passwordInput: { paddingRight: 44 },
  eyeButton: { position: 'absolute', right: 4, top: 0, bottom: 0, width: 44, alignItems: 'center', justifyContent: 'center' },

  signUp: { height: 61, borderRadius: 42, backgroundColor: homeColors.deep, paddingBottom: 2 },
  signUpBusy: { opacity: 0.75 },
  signUpFace: { flex: 1, borderRadius: 42, backgroundColor: homeColors.primary, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  signUpText: { fontFamily: 'Geist_500Medium', fontSize: 24, lineHeight: 32, color: homeColors.white },

  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  dividerLine: { flex: 1, height: 1, backgroundColor: homeColors.border },
  dividerText: { fontFamily: 'Geist_500Medium', fontSize: 13, color: homeColors.muted },

  // Two doors to the same room, so they are the same door: one height, one radius,
  // one type size, one gap between mark and words. Only the colours differ, because
  // those belong to Apple and to Google and are not this app's to restyle.
  socialCol: { gap: 12 },
  social: { height: 52, borderRadius: 14, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 8, overflow: 'hidden' },
  appleBtn: { backgroundColor: homeColors.black },
  googleBtn: { backgroundColor: homeColors.white, borderWidth: 1, borderColor: homeColors.border },
  socialText: { fontFamily: 'Geist_500Medium', fontSize: 18 },
  appleText: { color: homeColors.white },
  googleText: { color: homeColors.darkest },

  signInRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minHeight: 44, marginTop: 'auto' },
  signInText: { fontFamily: 'Geist_500Medium', fontSize: 14, color: homeColors.muted },
  signInLink: { fontFamily: 'Geist_600SemiBold', fontSize: 14, color: homeColors.primary },
});
