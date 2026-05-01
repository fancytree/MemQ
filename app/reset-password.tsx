import { SecondaryPageNav } from '@/components/SecondaryPageNav';
import { MemQTheme } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { colors } from '@/theme';
import { Feather } from '@expo/vector-icons';
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

const t = MemQTheme;

export default function ResetPasswordScreen() {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
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
            Alert.alert(
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
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters long');
      Alert.alert('Error', 'Password must be at least 6 characters long');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      Alert.alert('Error', 'Passwords do not match');
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
      Alert.alert(
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
      Alert.alert(
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
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={t.color.accent} />
          <Text style={styles.loadingText}>Verifying reset link...</Text>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled">
        <View style={styles.content}>
          {/* Header */}
          <SecondaryPageNav onBack={() => router.replace('/login')} backLabel="← Back" />

          <Text style={styles.title}>Set New Password</Text>
          <Text style={styles.subtitle}>
            Please enter your new password below.
          </Text>

          {/* New Password */}
          <View style={styles.inputContainer}>
            <View style={styles.passwordInputWrapper}>
              <TextInput
                style={styles.passwordInput}
                placeholder="New Password"
                placeholderTextColor={colors.muted}
                value={newPassword}
                onChangeText={(text) => {
                  setNewPassword(text);
                  setError(null);
                }}
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

          {/* Confirm Password */}
          <View style={styles.inputContainer}>
            <View style={styles.passwordInputWrapper}>
              <TextInput
                style={styles.passwordInput}
                placeholder="Confirm New Password"
                placeholderTextColor={colors.muted}
                value={confirmPassword}
                onChangeText={(text) => {
                  setConfirmPassword(text);
                  setError(null);
                }}
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

          {error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleResetPassword}
            disabled={loading}>
            {loading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.buttonText}>Reset Password</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.backToLoginLink}
            onPress={() => router.replace('/login')}
            disabled={loading}
            activeOpacity={0.7}
          >
            <Text style={styles.backToLoginText}>Back to Sign In</Text>
          </TouchableOpacity>
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
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 13,
    color: colors.muted,
    fontFamily: 'JetBrainsMono_400',
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
    marginBottom: 16,
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
    color: colors.text,
    lineHeight: 20,
    fontFamily: 'JetBrainsMono_400',
    fontWeight: '400',
  },
  eyeButton: {
    padding: 14,
    paddingRight: 16,
  },
  errorContainer: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: colors.redL,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  errorText: {
    fontSize: 12,
    color: colors.red,
    fontFamily: 'JetBrainsMono_500',
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

