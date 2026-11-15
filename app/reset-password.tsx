import { AuthPerch, authField } from '@/components/auth/AuthPerch';
import { MascotRig } from '@/components/mascot/rig/MascotRig';
import { dialog } from '@/lib/dialog';
import { supabase } from '@/lib/supabase';
import { homeColors } from '@/theme/colors';
import { fonts } from '@/theme/typography';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';


export default function ResetPasswordScreen() {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [typing, setTyping] = useState(false);
  const [verifying, setVerifying] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    checkResetToken();
  }, []);

  const checkResetToken = async () => {
    try {
      // Wait briefly for _layout.tsx deep link handler to set the session
      await new Promise(resolve => setTimeout(resolve, 500));

      const { data: { session } } = await supabase.auth.getSession();

      if (session) {
        setVerifying(false);
        return;
      }

      // Listen for auth state change (session might arrive after navigation)
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) {
          setVerifying(false);
          subscription.unsubscribe();
        }
      });

      // Timeout: if no session after 5 seconds, show error
      setTimeout(() => {
        subscription.unsubscribe();
        setVerifying(current => {
          if (current) {
            dialog(
              'Invalid Link',
              'This password reset link is invalid or has expired. Please request a new one.',
              [{ text: 'OK', onPress: () => router.replace('/forgot-password') }]
            );
          }
          return false;
        });
      }, 5000);
    } catch (error) {
      if (__DEV__) console.error('Error checking reset token:', error);
      setVerifying(false);
    }
  };

  const handleResetPassword = async () => {
    // 验证输入
    if (!newPassword || !confirmPassword) {
      setError('Please fill in all fields');
      dialog('Error', 'Please fill in all fields');
      return;
    }

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters long');
      dialog('Error', 'Password must be at least 6 characters long');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      dialog('Error', 'Passwords do not match');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        throw new Error('No valid session found. Please use the link from your email.');
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        console.error('Error updating password:', updateError);
        throw updateError;
      }

      // 成功
      dialog(
        'Success',
        'Your password has been reset successfully. Please sign in with your new password.',
        [
          {
            text: 'OK',
            onPress: () => router.replace('/login'),
          },
        ]
      );
    } catch (err: any) {
      console.error('Error resetting password:', err);
      const errorMessage = err?.message || 'Failed to reset password. The link may have expired.';
      setError(errorMessage);
      dialog(
        'Error',
        errorMessage + '\n\nPlease request a new password reset link if this one has expired.',
        [
          {
            text: 'Request New Link',
            onPress: () => router.replace('/forgot-password'),
          },
          {
            text: 'Cancel',
            style: 'cancel',
          },
        ]
      );
    } finally {
      setLoading(false);
    }
  };

  if (verifying) {
    // The link is being checked: the character thinks it over in the page's own
    // light rather than a spinner on a white screen.
    return (
      <View style={styles.checking}>
        <LinearGradient pointerEvents="none"
          colors={[homeColors.gradientStart, homeColors.gradientBright, homeColors.gradientSoft, homeColors.canvas]}
          locations={[0, 0.21154, 0.44712, 1]} style={StyleSheet.absoluteFill} />
        <MascotRig width={150} mood="thinking" />
        <Text style={styles.checkingText}>Checking your link…</Text>
      </View>
    );
  }

  return (
    <AuthPerch title="Set a new password" copy="At least 6 characters."
      onBack={() => router.replace('/login')} backLabel="Back to sign in"
      mood={loading ? 'thinking' : 'onboarding'} eyesShut={typing}
      action={{ label: 'Save password', onPress: handleResetPassword, busy: loading }}
      footer={{ label: 'Back to sign in', onPress: () => router.replace('/login'), disabled: loading }}>
      <View style={authField.well}>
        <TextInput accessibilityLabel="New password"
          style={[authField.input, authField.secret]}
          placeholder="New password"
          placeholderTextColor={homeColors.placeholder}
          value={newPassword}
          onChangeText={(text) => { setNewPassword(text); setError(null); }}
          onFocus={() => setTyping(true)}
          onBlur={() => setTyping(false)}
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          autoComplete="password-new"
          editable={!loading}
        />
        <Pressable accessibilityRole="button" accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
          style={authField.eye} onPress={() => setShowPassword(!showPassword)}>
          <Feather name={showPassword ? 'eye-off' : 'eye'} size={20} color={homeColors.muted} />
        </Pressable>
      </View>
      <View style={authField.well}>
        <TextInput accessibilityLabel="Confirm new password"
          style={[authField.input, authField.secret]}
          placeholder="Confirm new password"
          placeholderTextColor={homeColors.placeholder}
          value={confirmPassword}
          onChangeText={(text) => { setConfirmPassword(text); setError(null); }}
          onFocus={() => setTyping(true)}
          onBlur={() => setTyping(false)}
          secureTextEntry={!showConfirmPassword}
          autoCapitalize="none"
          autoComplete="password-new"
          returnKeyType="done"
          onSubmitEditing={handleResetPassword}
          editable={!loading}
        />
        <Pressable accessibilityRole="button" accessibilityLabel={showConfirmPassword ? 'Hide password' : 'Show password'}
          style={authField.eye} onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
          <Feather name={showConfirmPassword ? 'eye-off' : 'eye'} size={20} color={homeColors.muted} />
        </Pressable>
      </View>
      {!!error && <Text accessibilityRole="alert" style={authField.error}>{error}</Text>}
    </AuthPerch>
  );
}

const styles = StyleSheet.create({
  checking: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: homeColors.canvas },
  checkingText: { fontFamily: fonts.medium, fontSize: 16, color: homeColors.muted },
});
