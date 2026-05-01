import Logo from '@/components/icons/Logo';
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
import {
    ActivityIndicator,
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
      if (event === 'SIGNED_IN' && session) {
        setOauthLoading(null);
        void navigateAfterAuth();
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
      // 刷新订阅状态
      await safeRefreshSubscription();
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
          await safeRefreshSubscription();
          await navigateAfterAuth();
        }
        // data 和 error 都为 null：用户取消，不做任何操作
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
        // 用户取消不显示错误
        if (error.message === 'User cancelled authentication') {
          return;
        }
        Alert.alert('Error', error.message || 'Failed to sign in with Apple');
        return;
      }

      if (data) {
        // 刷新订阅状态
        await safeRefreshSubscription();
        // 注意：登录成功后跳转到首页，启动页会在首页数据加载完成后隐藏
        // 这里不隐藏启动页，让首页的 LoadingContext 来控制
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

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled">
        <View style={styles.content}>
          {/* Logo */}
          <View style={styles.logoContainer}>
            <Logo width={200} />
            <Text style={styles.tagline}>Smart Quiz & Memory</Text>
          </View>

          {/* 邮箱输入 */}
          <View style={[styles.inputContainer, styles.firstInputContainer]}>
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor={colors.muted}
              value={identifier}
              onChangeText={setIdentifier}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              editable={!loading}
            />
          </View>

          <View style={styles.inputContainer}>
            <View style={styles.passwordInputWrapper}>
              <TextInput
                style={styles.passwordInput}
                placeholder="Password"
                placeholderTextColor={colors.muted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoComplete="password"
                editable={!loading}
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowPassword(!showPassword)}
                activeOpacity={0.7}
              >
                <Feather
                  name={showPassword ? 'eye-off' : 'eye'}
                  size={20}
                  color={colors.muted}
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* 记住密码和忘记密码 */}
          <View style={styles.rememberPasswordRow}>
            <TouchableOpacity
              style={styles.rememberPasswordContainer}
              onPress={() => setRememberPassword(!rememberPassword)}
              activeOpacity={0.7}
              disabled={loading}
            >
              <View style={styles.checkboxContainer}>
                <View style={[styles.checkbox, rememberPassword && styles.checkboxChecked]}>
                  {rememberPassword && (
                    <Feather name="check" size={14} color="#FFFFFF" />
                  )}
                </View>
                <Text style={styles.rememberPasswordText}>Remember password</Text>
              </View>
            </TouchableOpacity>

            {/* 忘记密码链接 */}
            <TouchableOpacity
              onPress={() => router.push('/forgot-password' as any)}
              disabled={loading}
              activeOpacity={0.7}
            >
              <Text style={styles.forgotPasswordText}>Forgot password?</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.button, styles.signInButton, loading && styles.buttonDisabled]}
            onPress={signIn}
            disabled={loading}>
            <Text style={styles.buttonText}>Sign In</Text>
          </TouchableOpacity>

          {/* 分隔线 */}
          <View style={styles.dividerContainer}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>OR</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* 第三方登录 */}
          <View style={styles.socialLoginContainer}>
            <View style={styles.socialIconsRow}>
              {/* Google 登录 */}
              <TouchableOpacity
                style={styles.socialIconButton}
                onPress={handleGoogleSignIn}
                disabled={loading || oauthLoading !== null}
                activeOpacity={0.7}
              >
                <View style={[styles.socialIconContainer, styles.googleIconContainer]}>
                  {oauthLoading === 'google' ? (
                    <ActivityIndicator size="small" color="#4285F4" />
                  ) : (
                    <FontAwesome5 name="google" size={20} color="#4285F4" />
                  )}
                </View>
              </TouchableOpacity>

              {/* Apple 登录 */}
              {Platform.OS === 'ios' && (
                <TouchableOpacity
                  style={styles.socialIconButton}
                  onPress={handleAppleSignIn}
                  disabled={loading || oauthLoading !== null}
                  activeOpacity={0.7}
                >
                  <View style={[styles.socialIconContainer, styles.appleIconContainer]}>
                    {oauthLoading === 'apple' ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <FontAwesome5 name="apple" size={22} color="#FFFFFF" />
                    )}
                  </View>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* 跳转到注册页面 */}
          <View style={styles.signUpLinkContainer}>
            <Text style={styles.signUpLinkText}>Don't have an account? </Text>
            <TouchableOpacity
              onPress={() => router.replace('/signup')}
              activeOpacity={0.7}
            >
              <Text style={styles.signUpLinkButton}>Sign Up</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}


const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'space-between',
    paddingTop: 72, // 24 + 48 = 72px (原24px + 下移48px)
    paddingBottom: 24,
  },
  content: {
    paddingHorizontal: 24,
    paddingVertical: 20,
    flex: 1,
    justifyContent: 'space-between',
  },
  logoContainer: {
    alignSelf: 'center',
    marginTop: 80,
    marginBottom: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagline: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '400',
    color: colors.muted,
    marginTop: 12,
    textAlign: 'center',
    fontFamily: 'JetBrainsMono_400',
  },
  logo: {
    width: 100,
    height: 100,
    borderRadius: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 40,
    textAlign: 'center',
  },
  inputContainer: {
    marginBottom: 16,
  },
  firstInputContainer: {
    marginTop: 80,
  },
  input: {
    backgroundColor: colors.surf,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 14,
    lineHeight: 20,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    fontFamily: 'JetBrainsMono_400',
    fontWeight: '400',
  },
  passwordInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surf,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 14,
    lineHeight: 20,
    color: colors.text,
    fontFamily: 'JetBrainsMono_400',
    fontWeight: '400',
  },
  eyeButton: {
    padding: 14,
    paddingRight: 16,
  },
  rememberPasswordRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  rememberPasswordContainer: {
    flex: 1,
  },
  clearButton: {
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  clearButtonText: {
    fontSize: 14,
    color: '#EF4444',
    fontWeight: '500',
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.muted,
    marginRight: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surf,
  },
  checkboxChecked: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  rememberPasswordText: {
    fontSize: 12,
    color: colors.muted,
    fontFamily: 'JetBrainsMono_400',
  },
  button: {
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  signInButton: {
    backgroundColor: colors.accent,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '400',
    fontFamily: 'JetBrainsMono_700',
  },
  forgotPasswordText: {
    fontSize: 12,
    color: colors.accent,
    fontWeight: '400',
    fontFamily: 'JetBrainsMono_700',
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    marginHorizontal: 16,
    fontSize: 12,
    color: colors.muted,
    fontWeight: '400',
    fontFamily: 'JetBrainsMono_500',
  },
  socialLoginContainer: {
    marginTop: 8,
    alignItems: 'center',
  },
  socialLoginTitle: {
    fontSize: 14,
    color: t.color.muted,
    textAlign: 'center',
    marginBottom: 16,
  },
  socialIconsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  socialIconButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  socialIconContainer: {
    width: 52,
    height: 52,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.accentShadow,
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  googleIconContainer: {
    backgroundColor: colors.surf,
    borderWidth: 1,
    borderColor: colors.border,
  },
  appleIconContainer: {
    backgroundColor: colors.text,
    borderWidth: 1,
    borderColor: colors.text,
  },
  signUpLinkContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  signUpLinkText: {
    fontSize: 12,
    color: colors.muted,
    fontFamily: 'JetBrainsMono_400',
  },
  signUpLinkButton: {
    fontSize: 12,
    color: colors.accent,
    fontWeight: '400',
    fontFamily: 'JetBrainsMono_700',
  },
});
