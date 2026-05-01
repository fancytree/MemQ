import Logo from '@/components/icons/Logo';
import { useSubscription } from '@/context/SubscriptionContext';
import { signInWithOAuth, startGoogleOAuthInSafari } from '@/lib/auth';
import { navigateAfterAuth } from '@/lib/navigation';
import { supabase } from '@/lib/supabase';
import { colors } from '@/theme';
import { Feather, FontAwesome5 } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
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

const SUBSCRIPTION_REFRESH_TIMEOUT_MS = 4000;

export default function SignUpScreen() {
  const [identifier, setIdentifier] = useState(''); // 邮箱输入框
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<'google' | 'apple' | null>(null);
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
          router.replace('/(tabs)');
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
        router.replace('/(tabs)');
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
        router.replace('/(tabs)');
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
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled">
        <View style={styles.content}>
          {/* Logo */}
          <View style={styles.logoContainer}>
            <Logo width={200} />
            <Text style={styles.tagline}>Smart Quiz & Memory</Text>
          </View>

          <View style={styles.titleContainer}>
          <Text style={styles.title}>Create Account</Text>
          </View>

          {/* 邮箱输入 */}
          <View style={[styles.inputContainer, styles.firstInputContainer]}>
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor={colors.muted}
              value={identifier}
              onChangeText={setIdentifier}
              keyboardType="default"
              autoCapitalize="none"
              autoComplete="off"
              editable={!loading}
            />
          </View>

          {/* 密码输入 */}
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
                autoComplete="password-new"
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

          {/* 确认密码输入 */}
          <View style={styles.inputContainer}>
            <View style={styles.passwordInputWrapper}>
              <TextInput
                style={styles.passwordInput}
                placeholder="Confirm Password"
                placeholderTextColor={colors.muted}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showConfirmPassword}
                autoCapitalize="none"
                autoComplete="password-new"
                editable={!loading}
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                activeOpacity={0.7}
              >
                <Feather
                  name={showConfirmPassword ? 'eye-off' : 'eye'}
                  size={20}
                  color={colors.muted}
                />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.button, styles.signUpButton, loading && styles.buttonDisabled]}
            onPress={signUp}
            disabled={loading}>
            <Text style={styles.buttonText}>Sign Up</Text>
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

          {/* 跳转到登录页面 */}
          <View style={styles.signInLinkContainer}>
            <Text style={styles.signInLinkText}>Already have an account? </Text>
            <TouchableOpacity
              onPress={() => router.replace('/login')}
              activeOpacity={0.7}
            >
              <Text style={styles.signInLinkButton}>Sign In</Text>
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
    marginTop: 60,
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
  titleContainer: {
    marginTop: 60,
    marginBottom: 24,
    alignItems: 'flex-start',
  },
  title: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '400',
    color: colors.text,
    textAlign: 'left',
    fontFamily: 'JetBrainsMono_700',
  },
  inputContainer: {
    marginBottom: 16,
  },
  firstInputContainer: {
    marginTop: 0,
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
  button: {
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  signUpButton: {
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
    marginBottom: 8,
  },
  socialLoginTitle: {
    fontSize: 14,
    color: '#6B7280',
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
  signInLinkContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  signInLinkText: {
    fontSize: 12,
    color: colors.muted,
    fontFamily: 'JetBrainsMono_400',
  },
  signInLinkButton: {
    fontSize: 12,
    color: colors.accent,
    fontWeight: '400',
    fontFamily: 'JetBrainsMono_700',
  },
});

