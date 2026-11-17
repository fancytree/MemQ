import { Card } from '@/components/ui/Card';
import { EyeToggle } from '@/components/ui/EyeToggle';
import { Field } from '@/components/ui/Field';
import { layout } from '@/theme/spacing';
import { dialog } from '@/lib/dialog';
import Logo from '@/components/icons/Logo';
import { HomeAsset } from '@/components/HomeAsset';
import { MascotRig, RIG_HAND_LINE, RIG_INK_OFFSET } from '@/components/mascot/rig/MascotRig';
import LoadingScreen from '@/components/LoadingScreen';
import { ledge } from '@/theme/ledge';
import { LinearGradient } from 'expo-linear-gradient';
import { useSubscription } from '@/context/SubscriptionContext';
import { signInWithOAuth, startGoogleOAuthInSafari } from '@/lib/auth';
import { navigateAfterAuth } from '@/lib/navigation';
import { supabase } from '@/lib/supabase';
import { space, radius, type, colors } from '@/theme';
import { FontAwesome5 } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/Button';
import { LedgePressable } from '@/components/ui/LedgePressable';
import Animated, {
  Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming,
} from 'react-native-reanimated';
import {
      KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
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
const HAND_LINE = RIG_HAND_LINE;
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

/** The drawing is not centred in its own square: the body and the hands — the mass
 * the eye reads, the tail being a thin thing off to one side — sit left of its
 * middle, so aiming the box at a point leaves the character short of it. The rig
 * measures how far, from its own parts. */
const INK_OFFSET = RIG_INK_OFFSET;

const CARD_LIFT = -(1 - (HAND_LINE + 7 / 256)) * PERCH_MASCOT;
const SOCIAL_MASCOT = 54;

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
      dialog('Error', 'Please fill in all fields');
      return;
    }

    const trimmedIdentifier = identifier.trim();
    // 暂时只支持邮箱注册

    // 验证邮箱格式
    if (!isValidEmail(trimmedIdentifier)) {
      dialog('Error', 'Please enter a valid email address. The email must have a valid format (e.g., user@example.com)');
      return;
    }

    // 验证密码长度
    if (password.length < 6) {
      dialog('Error', 'Password must be at least 6 characters long');
      return;
    }

    // 验证密码确认
    if (password !== confirmPassword) {
      dialog('Error', 'Passwords do not match');
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
      dialog('Error', error.message);
      setLoading(false);
    } else {
      // 检查是否需要邮箱验证
      if (data.user && !data.session) {
        // 需要邮箱验证
        dialog(
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
        dialog('Success', 'Account created successfully!', [
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
      dialog('Success', 'Account created! Please sign in.', [
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
          dialog('Error', error.message || 'Failed to sign in with Google');
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
        dialog('Error', error.message || 'Failed to sign in with Google');
        return;
      }
      if (data) {
        await safeRefreshSubscription();
        await navigateAfterAuth();
      }
    } catch (error: any) {
      if (__DEV__) console.error('Google sign in error:', error);
      dialog('Error', error.message || 'Failed to sign in with Google');
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
        dialog('Error', error.message || 'Failed to sign in with Apple');
        return;
      }

      if (data) {
        // 刷新订阅状态
        await safeRefreshSubscription();
        await navigateAfterAuth();
      }
    } catch (error: any) {
      console.error('Apple sign in error:', error);
      dialog('Error', error.message || 'Failed to sign in with Apple');
    } finally {
      setOauthLoading(null);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}>
      <LoadingScreen visible={busy} />
      <LinearGradient pointerEvents="none"
        colors={[colors.limePale, colors.limeBright, colors.limeSurface, colors.bg]}
        locations={[0, 0.21154, 0.44712, 1]} style={styles.background} />
      <Flow name="waveBack" style={styles.waveBack} seconds={13} shiftX={-15} shiftY={16} />
      <Flow name="waveFront" style={styles.waveFront} seconds={9} shiftX={15} shiftY={-20} />
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 28, paddingBottom: insets.bottom + 16 }]}
        keyboardShouldPersistTaps="handled">
        <View style={styles.content}>
          <View style={styles.hero}>
            <Logo width={190} align="left" />
            <Text style={styles.tagline}>Create your account</Text>
          </View>

          <MascotRig width={PERCH_MASCOT}
            mood={busy ? 'thinking' : 'onboarding'}
            calm
            eyesShut={typingPassword}
            style={[styles.perch, { marginLeft: (perchShift + INK_OFFSET * PERCH_MASCOT) * 2 }]}
            behind={(
              <Card corner="xl" style={[styles.card, { marginLeft: cardBleed - perchShift, marginRight: cardBleed + perchShift }]}>
                  <Field accessibilityLabel="Email"
                    placeholder="Email"
                    value={identifier}
                    onChangeText={setIdentifier}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoComplete="email"
                    editable={!loading}
                  />

                  <Field accessibilityLabel="Password"
                    placeholder="Password"
                    value={password}
                    onChangeText={setPassword}
                    onFocus={() => setTypingPassword(true)}
                    onBlur={() => setTypingPassword(false)}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    editable={!loading}
                    trailing={<EyeToggle shown={showPassword} onPress={() => setShowPassword(!showPassword)} />}
                  />

                  <Field accessibilityLabel="Confirm Password"
                    placeholder="Confirm Password"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    onFocus={() => setTypingPassword(true)}
                    onBlur={() => setTypingPassword(false)}
                    secureTextEntry={!showConfirmPassword}
                    autoCapitalize="none"
                    editable={!loading}
                    trailing={<EyeToggle shown={showConfirmPassword} onPress={() => setShowConfirmPassword(!showConfirmPassword)} />}
                  />
              </Card>
            )} />

          <Button size="xl" label="Sign Up" onPress={signUp} disabled={busy} />

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>OR</Text>
            <View style={styles.dividerLine} />
          </View>

          <View style={styles.socialRow}>
            <LedgePressable accessibilityRole="button" accessibilityLabel="Sign in with Google"
              style={styles.social} onPress={handleGoogleSignIn} disabled={busy}>
              <View style={styles.socialFace}>
                {oauthLoading === 'google'
                  ? <MascotRig width={SOCIAL_MASCOT} mood="thinking" />
                  : <FontAwesome5 name="google" size={20} color={colors.google} />}
              </View>
            </LedgePressable>

            {Platform.OS === 'ios' && (
              <LedgePressable accessibilityRole="button" accessibilityLabel="Sign in with Apple"
                style={styles.social} onPress={handleAppleSignIn} disabled={busy}>
                <View style={styles.socialFace}>
                  {oauthLoading === 'apple'
                    ? <MascotRig width={SOCIAL_MASCOT} mood="thinking" />
                    : <FontAwesome5 name="apple" size={22} color={colors.text} />}
                </View>
              </LedgePressable>
            )}
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
  // Ridden up under the character's hands, so it reads as the thing being held.
  card: { marginTop: CARD_LIFT },
  container: { flex: 1, backgroundColor: colors.bg },
  background: { position: 'absolute', top: 0, left: 0, right: 0, height: 874 },
  waveBack: { position: 'absolute', top: 96, left: -19 },
  waveFront: { position: 'absolute', top: 133, left: -19 },
  scrollContent: { flexGrow: 1 },
  content: { flex: 1, paddingHorizontal: layout.screenInline, gap: space[4] },

  // Left-aligned, so the page has mass on both sides: the wordmark answers the
  // character rather than sitting above it. Nothing decorative was added to
  // balance the composition — balancing ornament with ornament is how a screen
  // fills up.
  hero: { alignItems: 'flex-start', gap: space[1], paddingTop: space[6] },
  perch: { alignSelf: 'center' },
  tagline: { ...type.body, fontFamily: 'Geist_500Medium', color: colors.faint },


  signUp: { height: 59 + ledge.lead, borderRadius: radius.pill, backgroundColor: colors.actionShell, paddingBottom: ledge.lead },
  signUpBusy: { opacity: 0.75 },
  signUpFace: { flex: 1, borderRadius: radius.pill, backgroundColor: colors.action, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  signUpText: { ...type.page, fontFamily: 'Geist_500Medium', color: colors.surf },

  divider: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[1] },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.line },
  dividerText: { ...type.caption, fontFamily: 'Geist_500Medium', color: colors.faint },

  // Side by side and identical: two doors to the same room, neither of them the
  // main one. The shell is the face plus its lip, so a square face needs a shell
  // two points taller — see theme/ledge.ts.
  socialRow: { flexDirection: 'row', justifyContent: 'center', gap: space[4] },
  social: { width: 60, height: 60 + ledge.control, borderRadius: radius.lg, backgroundColor: colors.line, paddingBottom: ledge.control },
  socialFace: { flex: 1, borderRadius: radius.lg, backgroundColor: colors.surf,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },

  signInRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minHeight: 44, marginTop: 'auto' },
  signInText: { ...type.small, fontFamily: 'Geist_500Medium', color: colors.faint },
  signInLink: { ...type.small, fontFamily: 'Geist_600SemiBold', color: colors.action },
});
