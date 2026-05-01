import { SecondaryPageNav } from '@/components/SecondaryPageNav';
import { safeBack } from '@/lib/safeBack';
import { MemQTheme } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { colors } from '@/theme';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
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
import { SafeAreaView } from 'react-native-safe-area-context';

const COOLDOWN_SECONDS = 120;
const t = MemQTheme;

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (cooldown > 0) {
      timerRef.current = setInterval(() => {
        setCooldown(prev => {
          if (prev <= 1) {
            if (timerRef.current) clearInterval(timerRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [cooldown > 0]);

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

  const handleResetPassword = async () => {
    if (!email || !email.trim()) {
      Alert.alert('Error', 'Please enter your email address');
      return;
    }

    const trimmedEmail = email.trim();

    if (!isValidEmail(trimmedEmail)) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }

    setLoading(true);

    try {
      const redirectTo = Linking.createURL('/reset-password');

      const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
        redirectTo: redirectTo,
      });

      setCooldown(COOLDOWN_SECONDS);

      if (error) {
        if (__DEV__) console.error('Error sending reset password email:', error);
      }

      Alert.alert(
        'Email Sent',
        'If an account exists with this email, you will receive a password reset link within a few minutes. The link expires in 10 minutes. Please also check your spam folder.',
        [{ text: 'OK' }]
      );
    } catch (error) {
      if (__DEV__) console.error('Error:', error);
      setCooldown(COOLDOWN_SECONDS);
      Alert.alert(
        'Email Sent',
        'If an account exists with this email, you will receive a password reset link within a few minutes. The link expires in 10 minutes. Please also check your spam folder.',
        [{ text: 'OK' }]
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}>
      <ScrollView
          style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled">
          <SecondaryPageNav onBack={() => safeBack('/login')} backLabel="← Back" />

          <View style={styles.content}>

          <Text style={styles.title}>Forgot Password?</Text>
          <Text style={styles.subtitle}>
            Enter your email address and we'll send you a link to reset your password.
          </Text>

          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor={colors.muted}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              editable={!loading}
            />
          </View>

          <TouchableOpacity
            style={[styles.button, (loading || cooldown > 0) && styles.buttonDisabled]}
            onPress={handleResetPassword}
            disabled={loading || cooldown > 0}>
            {loading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : cooldown > 0 ? (
              <Text style={styles.buttonText}>Resend in {cooldown}s</Text>
            ) : (
              <Text style={styles.buttonText}>Send Reset Link</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.backToLoginLink}
            onPress={() => safeBack('/login')}
            disabled={loading}
            activeOpacity={0.7}
          >
            <Text style={styles.backToLoginText}>Back to Sign In</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  keyboardView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  content: {
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '400',
    color: colors.text,
    marginBottom: 12,
    fontFamily: 'JetBrainsMono_800',
  },
  subtitle: {
    fontSize: 13,
    color: colors.muted,
    marginBottom: 32,
    lineHeight: 19,
    fontFamily: 'JetBrainsMono_400',
  },
  inputContainer: {
    marginBottom: 24,
  },
  input: {
    backgroundColor: colors.surf,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 14,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    fontFamily: 'JetBrainsMono_400',
    fontWeight: '400',
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 16,
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
  backToLoginLink: {
    alignItems: 'center',
    marginTop: 8,
  },
  backToLoginText: {
    fontSize: 12,
    color: colors.accent,
    fontWeight: '400',
    fontFamily: 'JetBrainsMono_700',
  },
});

