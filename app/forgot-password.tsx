import { AuthPerch, authField } from '@/components/auth/AuthPerch';
import { dialog } from '@/lib/dialog';
import { safeBack } from '@/lib/safeBack';
import { supabase } from '@/lib/supabase';
import { homeColors } from '@/theme/colors';
import * as Linking from 'expo-linking';
import React, { useEffect, useRef, useState } from 'react';
import { TextInput, View } from 'react-native';

const COOLDOWN_SECONDS = 120;

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
      dialog('Error', 'Please enter your email address');
      return;
    }

    const trimmedEmail = email.trim();

    if (!isValidEmail(trimmedEmail)) {
      dialog('Error', 'Please enter a valid email address');
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

      dialog(
        'Email Sent',
        'If an account exists with this email, you will receive a password reset link within a few minutes. The link expires in 10 minutes. Please also check your spam folder.',
        [{ text: 'OK' }]
      );
    } catch (error) {
      if (__DEV__) console.error('Error:', error);
      setCooldown(COOLDOWN_SECONDS);
      dialog(
        'Email Sent',
        'If an account exists with this email, you will receive a password reset link within a few minutes. The link expires in 10 minutes. Please also check your spam folder.',
        [{ text: 'OK' }]
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthPerch title="Forgot password?" copy="We'll email you a reset link."
      onBack={() => safeBack('/login')} backLabel="Back to sign in"
      mood={loading ? 'thinking' : 'onboarding'}
      action={{
        label: cooldown > 0 ? `Resend in ${cooldown}s` : 'Send reset link',
        onPress: handleResetPassword, disabled: cooldown > 0, busy: loading,
      }}
      footer={{ label: 'Back to sign in', onPress: () => safeBack('/login'), disabled: loading }}>
      <View style={authField.well}>
        <TextInput accessibilityLabel="Email"
          style={authField.input}
          placeholder="Email"
          placeholderTextColor={homeColors.placeholder}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          returnKeyType="send"
          onSubmitEditing={handleResetPassword}
          editable={!loading}
        />
      </View>
    </AuthPerch>
  );
}
