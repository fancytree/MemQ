import { layout } from '@/theme/spacing';
import { fonts } from '@/theme/typography';
import Logo from '@/components/icons/Logo';
import { HomeAsset } from '@/components/HomeAsset';
import { MascotCharacter } from '@/components/mascot/MascotCharacter';
import { homeColors } from '@/theme/colors';
import { LinearGradient } from 'expo-linear-gradient';
import { MemQTheme } from '@/constants/theme';
import { useLoading } from '@/context/LoadingContext';
import { useSubscription } from '@/context/SubscriptionContext';
import { signInWithOAuth, startGoogleOAuthInSafari } from '@/lib/auth';
import { navigateAfterAuth } from '@/lib/navigation';
import { supabase } from '@/lib/supabase';
import { colors } from '@/theme';
import { Feather, FontAwesome5 } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { useWindowDimensions } from 'react-native';
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

const REMEMBER_EMAIL_KEY = 'remembered_email';
const REMEMBER_PASSWORD_KEY = 'remembered_password';
const REMEMBER_PASSWORD_ENABLED_KEY = 'remember_password_enabled';
const t = MemQTheme;
const SUBSCRIPTION_REFRESH_TIMEOUT_MS = 4000;

type SecureStoreModule = {
  getItemAsync: (key: string) => Promise<string | null>;
  setItemAsync: (key: string, value: string) => Promise<void>;
  deleteItemAsync: (key: string) => Promise<void>;
};

type AsyncStorageModule = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

type FileSystemModule = {
  documentDirectory: string | null;
  writeAsStringAsync: (uri: string, contents: string) => Promise<void>;
  readAsStringAsync: (uri: string) => Promise<string>;
  getInfoAsync: (uri: string) => Promise<{ exists: boolean }>;
  deleteAsync: (uri: string, options?: { idempotent?: boolean }) => Promise<void>;
};

const secureStoreMemory = new Map<string, string>();
const secureStoreFallback: SecureStoreModule = {
  getItemAsync: async (key: string) => secureStoreMemory.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => {
    secureStoreMemory.set(key, value);
  },
  deleteItemAsync: async (key: string) => {
    secureStoreMemory.delete(key);
  },
};

let cachedSecureStore: SecureStoreModule | null | undefined = undefined;
let cachedAsyncStorage: AsyncStorageModule | null | undefined = undefined;
let cachedFileSystem: FileSystemModule | null | undefined = undefined;
let fileStoreCache: Record<string, string> | null = null;

const getFileSystem = (): FileSystemModule | null => {
  if (cachedFileSystem !== undefined) return cachedFileSystem;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('expo-file-system');
    const resolved = (mod?.default ?? mod) as Partial<FileSystemModule> | undefined;
    if (
      resolved &&
      typeof resolved.writeAsStringAsync === 'function' &&
      typeof resolved.readAsStringAsync === 'function' &&
      typeof resolved.getInfoAsync === 'function' &&
      typeof resolved.deleteAsync === 'function'
    ) {
      cachedFileSystem = resolved as FileSystemModule;
      return cachedFileSystem;
    }
  } catch {
    // ignore
  }
  cachedFileSystem = null;
  return null;
};

const getCredentialsFileUri = (): string | null => {
  const fs = getFileSystem();
  const dir = fs?.documentDirectory;
  if (!fs || !dir) return null;
  return `${dir}memq-login-credentials.json`;
};

const ensureFileStoreLoaded = async (): Promise<Record<string, string>> => {
  if (fileStoreCache) return fileStoreCache;
  const fs = getFileSystem();
  const fileUri = getCredentialsFileUri();
  if (!fs || !fileUri) {
    fileStoreCache = {};
    return fileStoreCache;
  }
  try {
    const info = await fs.getInfoAsync(fileUri);
    if (!info.exists) {
      fileStoreCache = {};
      return fileStoreCache;
    }
    const raw = await fs.readAsStringAsync(fileUri);
    const parsed = JSON.parse(raw || '{}');
    fileStoreCache = parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    fileStoreCache = {};
  }
  return fileStoreCache ?? {};
};

const persistFileStore = async () => {
  const fs = getFileSystem();
  const fileUri = getCredentialsFileUri();
  if (!fs || !fileUri || !fileStoreCache) return;
  try {
    await fs.writeAsStringAsync(fileUri, JSON.stringify(fileStoreCache));
  } catch {
    // ignore file persistence errors
  }
};

const fileStoreAdapter: SecureStoreModule = {
  getItemAsync: async (key: string) => {
    const store = await ensureFileStoreLoaded();
    return store[key] ?? null;
  },
  setItemAsync: async (key: string, value: string) => {
    const store = await ensureFileStoreLoaded();
    store[key] = value;
    await persistFileStore();
  },
  deleteItemAsync: async (key: string) => {
    const store = await ensureFileStoreLoaded();
    if (key in store) {
      delete store[key];
      await persistFileStore();
    }
  },
};

const asyncStorageToSecureStoreAdapter = (asyncStorage: AsyncStorageModule): SecureStoreModule => ({
  getItemAsync: async (key: string) => {
    try {
      return await asyncStorage.getItem(key);
    } catch {
      return secureStoreMemory.get(key) ?? null;
    }
  },
  setItemAsync: async (key: string, value: string) => {
    try {
      await asyncStorage.setItem(key, value);
    } catch {
      secureStoreMemory.set(key, value);
    }
  },
  deleteItemAsync: async (key: string) => {
    try {
      await asyncStorage.removeItem(key);
    } catch {
      secureStoreMemory.delete(key);
    }
  },
});

const getAsyncStorage = (): AsyncStorageModule | null => {
  if (cachedAsyncStorage !== undefined) return cachedAsyncStorage;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('@react-native-async-storage/async-storage');
    const resolved = (mod?.default ?? mod) as Partial<AsyncStorageModule> | undefined;
    if (
      resolved &&
      typeof resolved.getItem === 'function' &&
      typeof resolved.setItem === 'function' &&
      typeof resolved.removeItem === 'function'
    ) {
      cachedAsyncStorage = resolved as AsyncStorageModule;
      return cachedAsyncStorage;
    }
  } catch {
    // ignore and fallback
  }
  cachedAsyncStorage = null;
  return null;
};

const getSecureStore = (): SecureStoreModule => {
  if (cachedSecureStore) return cachedSecureStore;
  if (cachedSecureStore === null) {
    const asyncStorage = getAsyncStorage();
    if (asyncStorage) {
      return asyncStorageToSecureStoreAdapter(asyncStorage);
    }
    return fileStoreAdapter;
  }
  // 当前运行时会在 require('expo-secure-store') 处直接抛 Metro 错误，
  // 因此这里完全跳过 SecureStore，仅使用可用的本地持久化后备方案。
  cachedSecureStore = null;
  const asyncStorage = getAsyncStorage();
  if (asyncStorage) {
    return asyncStorageToSecureStoreAdapter(asyncStorage);
  }
  return fileStoreAdapter;
};

export default function LoginScreen() {
  const [identifier, setIdentifier] = useState(''); // 邮箱输入框
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberPassword, setRememberPassword] = useState(false);
  const [loadingCredentials, setLoadingCredentials] = useState(true);
  const [oauthLoading, setOauthLoading] = useState<'google' | 'apple' | null>(null);
  const { refreshSubscriptionStatus } = useSubscription();
  const { setLoading: setAppLoading } = useLoading(); // 控制启动页面显示

  const safeRefreshSubscription = async () => {
    try {
      await Promise.race([
        refreshSubscriptionStatus(),
        new Promise((resolve) => setTimeout(resolve, SUBSCRIPTION_REFRESH_TIMEOUT_MS)),
      ]);
    } catch (error) {
      if (__DEV__) {
        console.warn('Subscription refresh failed, continue login flow:', error);
      }
    }
  };

  const tryGetExistingSession = async () => {
    try {
      const { data } = await supabase.auth.getSession();
      return data.session ?? null;
    } catch {
      return null;
    }
  };

  // 加载保存的凭据
  useEffect(() => {
    const loadSavedCredentials = async () => {
      try {
        const savedRememberEnabled = await getSecureStore().getItemAsync(REMEMBER_PASSWORD_ENABLED_KEY);
        if (savedRememberEnabled === 'true') {
          setRememberPassword(true);
          const savedEmail = await getSecureStore().getItemAsync(REMEMBER_EMAIL_KEY);
          const savedPassword = await getSecureStore().getItemAsync(REMEMBER_PASSWORD_KEY);
          if (savedEmail) {
            // 清理邮箱，去除可能的空格
            setIdentifier(savedEmail.trim());
          }
          if (savedPassword) {
            // 直接使用密码，不进行 trim（密码可能包含空格）
            setPassword(savedPassword);
          }
        }
      } catch (error) {
        console.error('Error loading saved credentials:', error);
        // 如果加载失败，清除可能损坏的凭据
        try {
          await getSecureStore().deleteItemAsync(REMEMBER_EMAIL_KEY);
          await getSecureStore().deleteItemAsync(REMEMBER_PASSWORD_KEY);
          await getSecureStore().deleteItemAsync(REMEMBER_PASSWORD_ENABLED_KEY);
        } catch (deleteError) {
          console.error('Error clearing credentials:', deleteError);
        }
      } finally {
        setLoadingCredentials(false);
        // 登录页面加载完成后，隐藏启动页面
        setAppLoading(false);
      }
    };

    loadSavedCredentials();
  }, [setAppLoading]);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      // INITIAL_SESSION は除外する：in-memory に残った古いセッションで
      // 自動的に /(tabs) へリダイレクトされるのを防ぐ。
      // 画面マウント時の既存セッション確認は index.tsx が担う。
      //
      // ⚠️ 回调内不能直接调 supabase.auth.*（会与 auth 锁循环等待而死锁）。
      // 传入 session.user 并 setTimeout(…, 0) 延后，详见 auth/callback.tsx 注释。
      if (event === 'SIGNED_IN' && session) {
        setOauthLoading(null);
        setTimeout(() => { void navigateAfterAuth(session.user); }, 0);
      }
    });
    return () => {
      subscription.unsubscribe();
    };
  }, []);


  // 保存或删除凭据
  const saveCredentials = async (identifier: string, password: string) => {
    try {
      if (rememberPassword) {
        await getSecureStore().setItemAsync(REMEMBER_EMAIL_KEY, identifier);
        await getSecureStore().setItemAsync(REMEMBER_PASSWORD_KEY, password);
        await getSecureStore().setItemAsync(REMEMBER_PASSWORD_ENABLED_KEY, 'true');
      } else {
        await getSecureStore().deleteItemAsync(REMEMBER_EMAIL_KEY);
        await getSecureStore().deleteItemAsync(REMEMBER_PASSWORD_KEY);
        await getSecureStore().deleteItemAsync(REMEMBER_PASSWORD_ENABLED_KEY);
      }
    } catch (error) {
      console.error('Error saving credentials:', error);
    }
  };

  // 验证邮箱格式（与 email.tsx 中的验证逻辑相同）
  const isValidEmail = (email: string) => {
    // 更严格的邮箱验证正则表达式
    // 要求：用户名部分至少1个字符，域名部分至少包含一个点，且点后至少2个字符
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

    // 基本检查
    if (!email || email.trim().length === 0) {
      return false;
    }

    // 检查长度（Supabase 通常限制邮箱长度）
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

  const signIn = async () => {
    if (!identifier || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    const trimmedIdentifier = identifier.trim();

    // 验证邮箱格式
    if (!isValidEmail(trimmedIdentifier)) {
      Alert.alert('Error', 'Please enter a valid email address');
      setLoading(false);
      return;
    }

    setLoading(true);
    let shouldHideAppLoading = true;
    try {
      // 调试日志（仅开发环境）
      if (__DEV__) {
        console.log('Attempting to sign in with:', trimmedIdentifier);
        console.log('Password length:', password.length);
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: trimmedIdentifier,
        password: password,
      });

      if (error) {
        // 检查是否使用了保存的凭据
        const savedRememberEnabled = await getSecureStore().getItemAsync(REMEMBER_PASSWORD_ENABLED_KEY);
        const savedEmail = savedRememberEnabled === 'true' ? await getSecureStore().getItemAsync(REMEMBER_EMAIL_KEY) : null;
        const isUsingSavedCredentials = savedEmail === trimmedIdentifier;

        // 检查是否是邮箱未验证错误
        if (error.message.includes('Email not confirmed') || error.message.includes('email_not_confirmed')) {
          Alert.alert(
            'Email Not Verified',
            'Please verify your email address before signing in. Check your inbox for the verification email.',
            [
              {
                text: 'Resend Verification Email',
                onPress: async () => {
                  // 重新发送验证邮件
                  const { error: resendError } = await supabase.auth.resend({
                    type: 'signup',
                    email: trimmedIdentifier,
                  });
                  if (resendError) {
                    Alert.alert('Error', 'Failed to resend verification email. ' + resendError.message);
                  } else {
                    Alert.alert('Success', 'Verification email sent! Please check your inbox.');
                  }
                },
              },
              { text: 'OK' },
            ]
          );
          return;
        }

        // 如果是因为凭据错误，且使用了保存的凭据，清除它们
        if (error.message.includes('Invalid login') || error.message.includes('Invalid credentials')) {
          if (isUsingSavedCredentials) {
            // 清除可能损坏的凭据
            try {
              await getSecureStore().deleteItemAsync(REMEMBER_EMAIL_KEY);
              await getSecureStore().deleteItemAsync(REMEMBER_PASSWORD_KEY);
              await getSecureStore().deleteItemAsync(REMEMBER_PASSWORD_ENABLED_KEY);
              setRememberPassword(false);
              // 清除输入框
              setIdentifier('');
              setPassword('');
            } catch (clearError) {
              console.error('Error clearing credentials:', clearError);
            }
          }

          // 统一显示通用的错误提示
          Alert.alert('Login Failed', 'Incorrect email or password', [{ text: 'OK' }]);
        } else {
          // 其他错误（如网络错误等）仍然显示具体错误信息
          Alert.alert('Error', error.message);
        }
        setLoading(false);
        return;
      }

      // 登录成功，保存或删除凭据
      await saveCredentials(trimmedIdentifier, password);
      // 订阅刷新后台进行，不阻塞跳转（首次登录可能较慢）
      void safeRefreshSubscription();
      // 注意：登录成功后跳转到首页，启动页会在首页数据加载完成后隐藏
      // 这里不隐藏启动页，让首页的 LoadingContext 来控制
      shouldHideAppLoading = false;
      await navigateAfterAuth();
    } catch (err: any) {
      const existingSession = await tryGetExistingSession();
      if (existingSession) {
        await safeRefreshSubscription();
        shouldHideAppLoading = false;
        await navigateAfterAuth();
        return;
      }
      const rawMessage = err?.message || 'Sign in failed. Please try again.';
      Alert.alert('Error', rawMessage);
      if (__DEV__) {
        console.error('Email sign in error:', err);
      }
    } finally {
      setLoading(false);
      if (shouldHideAppLoading) {
        setAppLoading(false);
      }
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
          // 立即跳转，订阅刷新后台进行，不阻塞导航
          void safeRefreshSubscription();
          // 传 user：resolveFinal 可能在 auth 锁仍被持有时同步触发，
          // 此处再调 supabase.auth.* 会死锁。
          await navigateAfterAuth(data.user ?? data.session?.user);
          return;
        }
        // data 和 error 都为 null：可能是用户取消，也可能是
        // openBrowserAsync.finally() 在 Linking 事件之前触发的竞态。
        // 兜底：检查是否已建立 session（由 auth/callback.tsx 或 onAuthStateChange 完成）。
        const { data: sessionCheck } = await supabase.auth.getSession();
        if (sessionCheck?.session) {
          void safeRefreshSubscription();
          await navigateAfterAuth(sessionCheck.session.user);
        }
        // 确实是用户取消：sessionCheck 也为空，什么都不做
        return;
      }

      // Android / Web：ASWebAuthenticationSession / Custom Tabs
      const { data, error } = await signInWithOAuth('google');
      if (error) {
        if (error.message === 'User cancelled authentication') return;
        Alert.alert('Error', error.message || 'Failed to sign in with Google');
        return;
      }
      if (data) {
        void safeRefreshSubscription();
        await navigateAfterAuth(data.user ?? data.session?.user);
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
        // 用户取消不显示错误
        if (error.message === 'User cancelled authentication') {
          return;
        }
        Alert.alert('Error', error.message || 'Failed to sign in with Apple');
        return;
      }

      if (data) {
        // 订阅刷新后台进行，不阻塞跳转
        void safeRefreshSubscription();
        await navigateAfterAuth();
      } else {
        // data 和 error 都为 null：用户取消或 OAuth 流程未完成
      }
    } catch (error: any) {
      if (__DEV__) {
        console.error('Apple sign in error:', error);
      }
      Alert.alert('Error', error.message || 'Failed to sign in with Apple');
    } finally {
      setOauthLoading(null);
    }
  };

  // The character wears the arriving face, and turns thinking while it waits on the
  // network — the same vocabulary the rest of the app uses, rather than a spinner
  // borrowed from the system.
  const busy = loading || oauthLoading !== null;
  const [typingPassword, setTypingPassword] = useState(false);
  // The card is nested inside the character's box, so it has to be pulled back out
  // to the width of the content column it would have had on its own.
  const { width: screenWidth } = useWindowDimensions();
  const cardBleed = -((screenWidth - layout.screenInline * 2) - PERCH_MASCOT) / 2;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}>
      <LinearGradient pointerEvents="none"
        colors={[homeColors.gradientStart, homeColors.gradientBright, homeColors.gradientSoft, homeColors.canvas]}
        locations={[0, 0.21154, 0.44712, 1]} style={styles.background} />
      <View pointerEvents="none" style={styles.waveBack}><HomeAsset name="waveBack" /></View>
      <View pointerEvents="none" style={styles.waveFront}><HomeAsset name="waveFront" /></View>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled">
        <View style={styles.content}>
          <View style={styles.hero}>
            <Logo width={190} />
            <Text style={styles.tagline}>Smart Quiz & Memory</Text>
          </View>

          {/* The character perches on the card: its body behind, its hands over the
              front edge. The card is nested inside it so it can sit between the two,
              and ridden up over the body by its own negative margin. */}
          <MascotCharacter width={PERCH_MASCOT}
            mood={busy ? 'thinking' : 'onboarding'}
            eyesShut={typingPassword}
            style={styles.perch}
            behind={(
              <View style={[styles.card, { marginHorizontal: cardBleed }]}>
                <View style={styles.cardFace}>
                  <View style={styles.field}>
                    <TextInput accessibilityLabel="Email"
                      style={styles.input}
                      placeholder="Email"
                      placeholderTextColor={homeColors.muted}
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
                      placeholderTextColor={homeColors.muted}
                      value={password}
                      onChangeText={setPassword}
                      onFocus={() => setTypingPassword(true)}
                      onBlur={() => setTypingPassword(false)}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      autoComplete="password"
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

                  <View style={styles.rememberRow}>
                    <TouchableOpacity accessibilityRole="checkbox"
                      accessibilityState={{ checked: rememberPassword }}
                      style={styles.remember}
                      onPress={() => setRememberPassword(!rememberPassword)}
                      activeOpacity={0.7}
                      disabled={loading}>
                      <View style={[styles.checkbox, rememberPassword && styles.checkboxChecked]}>
                        {rememberPassword && <Feather name="check" size={14} color={homeColors.white} />}
                      </View>
                      <Text style={styles.rememberText}>Remember password</Text>
                    </TouchableOpacity>

                    <TouchableOpacity accessibilityRole="button"
                      onPress={() => router.push('/forgot-password' as any)}
                      disabled={loading}
                      activeOpacity={0.7}>
                      <Text style={styles.forgotText}>Forgot password?</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )} />

          <TouchableOpacity accessibilityRole="button"
            accessibilityState={{ disabled: busy }}
            style={[styles.signIn, busy && styles.signInBusy]}
            onPress={signIn}
            activeOpacity={0.9}
            disabled={busy}>
            <View style={styles.signInFace}>
              {loading
                ? <MascotCharacter width={BUTTON_MASCOT} mood="excited" />
                : <Text style={styles.signInText}>Sign In</Text>}
            </View>
          </TouchableOpacity>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>OR</Text>
            <View style={styles.dividerLine} />
          </View>

          <View style={styles.socialRow}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Continue with Google"
              style={styles.social}
              onPress={handleGoogleSignIn}
              disabled={busy}
              activeOpacity={0.8}>
              <View style={styles.socialFace}>
                {oauthLoading === 'google'
                  ? <MascotCharacter width={SOCIAL_MASCOT} mood="thinking" />
                  : <FontAwesome5 name="google" size={20} color={colors.google} />}
              </View>
            </TouchableOpacity>

            {Platform.OS === 'ios' && (
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Continue with Apple"
                style={styles.social}
                onPress={handleAppleSignIn}
                disabled={busy}
                activeOpacity={0.8}>
                <View style={[styles.socialFace, styles.appleFace]}>
                  {oauthLoading === 'apple'
                    ? <MascotCharacter width={SOCIAL_MASCOT} mood="thinking" />
                    : <FontAwesome5 name="apple" size={22} color={homeColors.white} />}
                </View>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.signUpRow}>
            <Text style={styles.signUpText}>Don’t have an account? </Text>
            <TouchableOpacity accessibilityRole="button"
              onPress={() => router.replace('/signup')}
              activeOpacity={0.7}>
              <Text style={styles.signUpLink}>Sign Up</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** The character perched on the card, and the two sizes it appears at while it
 * waits. The card rides up over it by rather more than half, so what stays visible
 * above the top edge is a head, two horns and a pair of hands. */
const PERCH_MASCOT = 190;
const BUTTON_MASCOT = 72;
const SOCIAL_MASCOT = 54;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: homeColors.canvas },
  background: { position: 'absolute', top: 0, left: 0, right: 0, height: 874 },
  // The same hill the home screen rises from, so arriving at the app and signing in
  // to it are the same place.
  waveBack: { position: 'absolute', top: 96, left: -19 },
  waveFront: { position: 'absolute', top: 133, left: -19 },
  scrollContent: { flexGrow: 1, paddingTop: 56, paddingBottom: 32 },
  content: { flex: 1, paddingHorizontal: layout.screenInline, gap: 16 },

  hero: { alignItems: 'center', gap: 6 },
  perch: { alignSelf: 'center' },
  tagline: { fontFamily: 'Geist_500Medium', fontSize: 16, color: homeColors.muted },

  // Every surface in this language is a coloured shell with a white face sitting on
  // it, four points short of the bottom — that ledge is what gives the flat palette
  // its weight, and it is the one thing a card here must not skip.
  // Negative, and that number is the whole effect: it is how much of the character
  // the card swallows. The hands sit between 0.66 and 0.74 of the box, so the top
  // edge is put at 0.70 — through the middle of them, which is what reads as a grip
  // rather than as two paws dropped on the form.
  card: { marginTop: -PERCH_MASCOT * 0.30,
    backgroundColor: homeColors.border, borderRadius: 24, paddingBottom: 4 },
  cardFace: { backgroundColor: homeColors.white, borderRadius: 24, padding: 16, gap: 12 },
  field: { minHeight: 52, borderRadius: 16, backgroundColor: homeColors.canvas, justifyContent: 'center', paddingHorizontal: 16 },
  input: { fontFamily: 'Geist_500Medium', fontSize: 16, color: homeColors.darkest, paddingVertical: 14 },
  passwordInput: { paddingRight: 44 },
  eyeButton: { position: 'absolute', right: 4, top: 0, bottom: 0, width: 44, alignItems: 'center', justifyContent: 'center' },

  rememberRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  remember: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  checkbox: { width: 22, height: 22, borderRadius: 7, borderWidth: 2, borderColor: homeColors.streakBorder, alignItems: 'center', justifyContent: 'center' },
  checkboxChecked: { backgroundColor: homeColors.primary, borderColor: homeColors.primary },
  rememberText: { fontFamily: 'Geist_500Medium', fontSize: 14, color: homeColors.muted },
  forgotText: { fontFamily: 'Geist_600SemiBold', fontSize: 14, color: homeColors.primary },

  signIn: { height: 61, borderRadius: 42, backgroundColor: homeColors.deep, paddingBottom: 4 },
  signInBusy: { opacity: 0.75 },
  signInFace: { flex: 1, borderRadius: 42, backgroundColor: homeColors.primary, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  signInText: { fontFamily: 'Geist_500Medium', fontSize: 24, lineHeight: 32, color: homeColors.white },

  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  dividerLine: { flex: 1, height: 1, backgroundColor: homeColors.border },
  dividerText: { fontFamily: 'Geist_500Medium', fontSize: 13, color: homeColors.muted },

  socialRow: { flexDirection: 'row', justifyContent: 'center', gap: 16 },
  social: { width: 64, height: 60, borderRadius: 20, backgroundColor: homeColors.border, paddingBottom: 4 },
  socialFace: { flex: 1, borderRadius: 20, backgroundColor: homeColors.white, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  appleFace: { backgroundColor: homeColors.darkest },

  signUpRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minHeight: 44, marginTop: 'auto' },
  signUpText: { fontFamily: 'Geist_500Medium', fontSize: 14, color: homeColors.muted },
  signUpLink: { fontFamily: 'Geist_600SemiBold', fontSize: 14, color: homeColors.primary },
});
