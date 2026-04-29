import AppleIcon from '@/components/icons/AppleIcon';
import GoogleIcon from '@/components/icons/GoogleIcon';
import Logo from '@/components/icons/Logo';
import { MemQTheme } from '@/constants/theme';
import { useLoading } from '@/context/LoadingContext';
import { useSubscription } from '@/context/SubscriptionContext';
import { signInWithOAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
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

  // 加载保存的凭据
  useEffect(() => {
    const loadSavedCredentials = async () => {
      try {
        const savedRememberEnabled = await SecureStore.getItemAsync(REMEMBER_PASSWORD_ENABLED_KEY);
        if (savedRememberEnabled === 'true') {
          setRememberPassword(true);
          const savedEmail = await SecureStore.getItemAsync(REMEMBER_EMAIL_KEY);
          const savedPassword = await SecureStore.getItemAsync(REMEMBER_PASSWORD_KEY);
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
          await SecureStore.deleteItemAsync(REMEMBER_EMAIL_KEY);
          await SecureStore.deleteItemAsync(REMEMBER_PASSWORD_KEY);
          await SecureStore.deleteItemAsync(REMEMBER_PASSWORD_ENABLED_KEY);
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


  // 保存或删除凭据
  const saveCredentials = async (identifier: string, password: string) => {
    try {
      if (rememberPassword) {
        await SecureStore.setItemAsync(REMEMBER_EMAIL_KEY, identifier);
        await SecureStore.setItemAsync(REMEMBER_PASSWORD_KEY, password);
        await SecureStore.setItemAsync(REMEMBER_PASSWORD_ENABLED_KEY, 'true');
      } else {
        await SecureStore.deleteItemAsync(REMEMBER_EMAIL_KEY);
        await SecureStore.deleteItemAsync(REMEMBER_PASSWORD_KEY);
        await SecureStore.deleteItemAsync(REMEMBER_PASSWORD_ENABLED_KEY);
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
    setAppLoading(true); // 显示启动页
    
    // 调试日志（仅开发环境）
    if (__DEV__) {
      console.log('Attempting to sign in with:', trimmedIdentifier);
      console.log('Password length:', password.length);
    }

    // 邮箱登录
    const { data, error } = await supabase.auth.signInWithPassword({
      email: trimmedIdentifier,
      password: password, // 确保使用原始密码，不进行 trim
    });

    if (error) {
      // 检查是否使用了保存的凭据
      const savedRememberEnabled = await SecureStore.getItemAsync(REMEMBER_PASSWORD_ENABLED_KEY);
      const savedEmail = savedRememberEnabled === 'true' ? await SecureStore.getItemAsync(REMEMBER_EMAIL_KEY) : null;
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
        setLoading(false);
        setAppLoading(false); // 隐藏启动页
        return;
      }
      
      // 如果是因为凭据错误，且使用了保存的凭据，清除它们
      if (error.message.includes('Invalid login') || error.message.includes('Invalid credentials')) {
        if (isUsingSavedCredentials) {
          // 清除可能损坏的凭据
          try {
            await SecureStore.deleteItemAsync(REMEMBER_EMAIL_KEY);
            await SecureStore.deleteItemAsync(REMEMBER_PASSWORD_KEY);
            await SecureStore.deleteItemAsync(REMEMBER_PASSWORD_ENABLED_KEY);
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
      setAppLoading(false); // 隐藏启动页
    } else {
      // 检查用户邮箱是否已验证
      if (data.user && data.user.email_confirmed_at === null) {
        // 邮箱未验证，但 Supabase 允许登录（可能配置为不需要验证）
        // 这里可以选择是否强制验证
        Alert.alert(
          'Email Not Verified',
          'Please verify your email address. We\'ve sent a verification email to ' + trimmedIdentifier + '.',
          [
            {
              text: 'Resend Email',
              onPress: async () => {
                const { error: resendError } = await supabase.auth.resend({
                  type: 'signup',
                  email: trimmedIdentifier,
                });
                if (resendError) {
                  Alert.alert('Error', 'Failed to resend verification email.');
                } else {
                  Alert.alert('Success', 'Verification email sent!');
                }
              },
            },
            {
              text: 'Continue',
              onPress: async () => {
                setAppLoading(true); // 重新显示启动页，因为即将跳转到首页
                await saveCredentials(trimmedIdentifier, password);
                await refreshSubscriptionStatus();
                // 注意：登录成功后跳转到首页，启动页会在首页数据加载完成后隐藏
                // 这里不隐藏启动页，让首页的 LoadingContext 来控制
                router.replace('/(tabs)');
              },
            },
          ]
        );
        setLoading(false);
        // 注意：如果用户选择"Continue"，启动页会在首页数据加载完成后隐藏
        // 如果用户选择"Resend Email"或关闭弹窗，启动页应该隐藏
        // 但这里我们无法区分，所以先隐藏，如果用户选择Continue，会在跳转时重新显示
        // 实际上，用户选择Continue时，会跳转到首页，首页会控制启动页
        // 但为了安全，这里先隐藏，如果用户真的选择Continue，首页会重新显示启动页（如果需要）
        setAppLoading(false);
        return;
      }
      
      // 登录成功，保存或删除凭据
      await saveCredentials(trimmedIdentifier, password);
      // 刷新订阅状态
      await refreshSubscriptionStatus();
      // 注意：登录成功后跳转到首页，启动页会在首页数据加载完成后隐藏
      // 这里不隐藏启动页，让首页的 LoadingContext 来控制
      router.replace('/(tabs)');
    }
  };

  // Google 登录
  const handleGoogleSignIn = async () => {
    setOauthLoading('google');
    setAppLoading(true); // 显示启动页
    try {
      const { data, error } = await signInWithOAuth('google');
      
      if (error) {
        // 用户取消不显示错误
        if (error.message === 'User cancelled authentication') {
          setAppLoading(false);
          return;
        }
        Alert.alert('Error', error.message || 'Failed to sign in with Google');
        setAppLoading(false); // 隐藏启动页
        return;
      }

      if (data) {
        // 刷新订阅状态
        await refreshSubscriptionStatus();
        // 注意：登录成功后跳转到首页，启动页会在首页数据加载完成后隐藏
        // 这里不隐藏启动页，让首页的 LoadingContext 来控制
        router.replace('/(tabs)');
      } else {
        // data 和 error 都为 null：用户取消或 OAuth 流程未完成
        setAppLoading(false);
      }
    } catch (error: any) {
      if (__DEV__) {
        console.error('Google sign in error:', error);
      }
      Alert.alert('Error', error.message || 'Failed to sign in with Google');
      setAppLoading(false); // 隐藏启动页
    } finally {
      setOauthLoading(null);
    }
  };

  // Apple 登录
  const handleAppleSignIn = async () => {
    setOauthLoading('apple');
    setAppLoading(true); // 显示启动页
    try {
      const { data, error } = await signInWithOAuth('apple');
      
      if (error) {
        // 用户取消不显示错误
        if (error.message === 'User cancelled authentication') {
          setAppLoading(false);
          return;
        }
        Alert.alert('Error', error.message || 'Failed to sign in with Apple');
        setAppLoading(false); // 隐藏启动页
        return;
      }

      if (data) {
        // 刷新订阅状态
        await refreshSubscriptionStatus();
        // 注意：登录成功后跳转到首页，启动页会在首页数据加载完成后隐藏
        // 这里不隐藏启动页，让首页的 LoadingContext 来控制
        router.replace('/(tabs)');
      } else {
        // data 和 error 都为 null：用户取消或 OAuth 流程未完成
        setAppLoading(false);
      }
    } catch (error: any) {
      if (__DEV__) {
        console.error('Apple sign in error:', error);
      }
      Alert.alert('Error', error.message || 'Failed to sign in with Apple');
      setAppLoading(false); // 隐藏启动页
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
              placeholderTextColor="#9CA3AF"
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
                placeholderTextColor="#9CA3AF"
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
                  color="#6B7280"
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
                    <GoogleIcon size={24} />
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
                      <AppleIcon size={24} color="#FFFFFF" />
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
    backgroundColor: t.color.bg,
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
    fontSize: 18,
    fontWeight: '500',
    color: t.color.muted,
    marginTop: 12,
    textAlign: 'center',
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
    backgroundColor: t.color.surface,
    borderRadius: t.radius.lg,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: t.color.textHigh,
    borderWidth: 1,
    borderColor: t.color.border,
  },
  passwordInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: t.color.surface,
    borderRadius: t.radius.lg,
    borderWidth: 1,
    borderColor: t.color.border,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: t.color.textHigh,
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
    borderRadius: t.radius.sm,
    borderWidth: 1,
    borderColor: t.color.muted,
    marginRight: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.color.surface,
  },
  checkboxChecked: {
    backgroundColor: t.color.accent,
    borderColor: t.color.accent,
  },
  rememberPasswordText: {
    fontSize: 14,
    color: t.color.muted,
  },
  button: {
    borderRadius: t.radius.md,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  signInButton: {
    backgroundColor: t.color.accent,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  forgotPasswordText: {
    fontSize: 14,
    color: t.color.accent,
    fontWeight: '500',
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: t.color.border,
  },
  dividerText: {
    marginHorizontal: 16,
    fontSize: 14,
    color: t.color.muted,
    fontWeight: '500',
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
    gap: 16,
  },
  socialIconButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  socialIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  googleIconContainer: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: t.color.border,
  },
  appleIconContainer: {
    backgroundColor: '#000000',
  },
  signUpLinkContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  signUpLinkText: {
    fontSize: 14,
    color: t.color.muted,
  },
  signUpLinkButton: {
    fontSize: 14,
    color: t.color.accent,
    fontWeight: '600',
  },
});
