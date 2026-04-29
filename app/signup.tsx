import AppleIcon from '@/components/icons/AppleIcon';
import GoogleIcon from '@/components/icons/GoogleIcon';
import Logo from '@/components/icons/Logo';
import { useSubscription } from '@/context/SubscriptionContext';
import { signInWithOAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Feather } from '@expo/vector-icons';
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

export default function SignUpScreen() {
  const [identifier, setIdentifier] = useState(''); // 邮箱输入框
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<'google' | 'apple' | null>(null);
  const { refreshSubscriptionStatus } = useSubscription();

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
              refreshSubscriptionStatus();
              router.replace('/(tabs)');
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
      const { data, error } = await signInWithOAuth('google');
      
      if (error) {
        Alert.alert('Error', error.message || 'Failed to sign in with Google');
        return;
      }

      if (data) {
        // 刷新订阅状态
        await refreshSubscriptionStatus();
        router.replace('/(tabs)');
      }
    } catch (error: any) {
      console.error('Google sign in error:', error);
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
        await refreshSubscriptionStatus();
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
              placeholderTextColor="#9CA3AF"
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
                placeholderTextColor="#9CA3AF"
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
                  color="#6B7280"
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
                placeholderTextColor="#9CA3AF"
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
                  color="#6B7280"
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
    backgroundColor: '#FFFFFF',
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
    fontSize: 18,
    fontWeight: '500',
    color: '#6B7280',
    marginTop: 12,
    textAlign: 'center',
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
    fontWeight: '600',
    color: '#111827',
    textAlign: 'left',
  },
  inputContainer: {
    marginBottom: 16,
  },
  firstInputContainer: {
    marginTop: 0,
  },
  input: {
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#111827',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  passwordInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#111827',
  },
  eyeButton: {
    padding: 14,
    paddingRight: 16,
  },
  button: {
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  signUpButton: {
    backgroundColor: '#4E49FC',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E5E7EB',
  },
  dividerText: {
    marginHorizontal: 16,
    fontSize: 14,
    color: '#9CA3AF',
    fontWeight: '500',
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
    borderColor: '#E5E7EB',
  },
  appleIconContainer: {
    backgroundColor: '#000000',
  },
  signInLinkContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  signInLinkText: {
    fontSize: 14,
    color: '#6B7280',
  },
  signInLinkButton: {
    fontSize: 14,
    color: '#4E49FC',
    fontWeight: '600',
  },
});

