import { supabase } from '@/lib/supabase';
import { Feather } from '@expo/vector-icons';
import { safeBack } from '@/lib/safeBack';
import { SecondaryPageNav } from '@/components/SecondaryPageNav';
import { useNavigation } from '@react-navigation/native';
import { colors } from '@/theme';
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
import { SafeAreaView } from 'react-native-safe-area-context';

export const options = {
  headerShown: false,
};

export default function PasswordEditScreen() {
  const navigation = useNavigation();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 隐藏系统导航栏
  useEffect(() => {
    navigation.setOptions({
      headerShown: false,
    });
  }, [navigation]);

  // 验证密码强度
  const isValidPassword = (password: string) => {
    // 至少 6 个字符
    return password.length >= 6;
  };

  // 保存密码
  const handleSave = async () => {
    if (!currentPassword) {
      setError('Please enter your current password');
      Alert.alert('Error', 'Please enter your current password');
      return;
    }

    if (!newPassword) {
      setError('Please enter a new password');
      Alert.alert('Error', 'Please enter a new password');
      return;
    }

    if (!isValidPassword(newPassword)) {
      setError('Password must be at least 6 characters long');
      Alert.alert('Error', 'Password must be at least 6 characters long');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      Alert.alert('Error', 'New passwords do not match');
      return;
    }

    if (currentPassword === newPassword) {
      setError('New password must be different from current password');
      Alert.alert('Error', 'New password must be different from current password');
      return;
    }

    setError(null);
    setSaving(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Error', 'User not authenticated');
        setSaving(false);
        return;
      }

      // 首先验证当前密码（通过重新登录）
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email!,
        password: currentPassword,
      });

      if (signInError) {
        console.error('Error verifying current password:', signInError);
        Alert.alert('Error', 'Current password is incorrect');
        setSaving(false);
        return;
      }

      // 更新密码
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        console.error('Error updating password:', updateError);
        Alert.alert('Error', updateError.message || 'Failed to update password');
        setSaving(false);
        return;
      }

      // 成功：清空表单并返回
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      Alert.alert('Success', 'Password updated successfully', [
        {
          text: 'OK',
          onPress: () => safeBack('/(tabs)/profile'),
        },
      ]);
    } catch (err) {
      console.error('Error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Something went wrong';
      Alert.alert('Error', errorMessage);
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <SecondaryPageNav onBack={() => safeBack('/(tabs)/profile')} />

          <View style={styles.bodyContent}>
            {/* 错误提示 */}
            {error && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorBannerText}>{error}</Text>
              </View>
            )}

            {/* 表单区域 */}
            <View style={styles.formCard}>
            {/* Current Password */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>
                Current Password <Text style={styles.required}>*</Text>
              </Text>
              <View style={styles.passwordInputContainer}>
                <TextInput
                  style={styles.passwordInput}
                  placeholder="Enter current password"
                  placeholderTextColor="#9CA3AF"
                  value={currentPassword}
                  onChangeText={(text) => {
                    setCurrentPassword(text);
                    setError(null);
                  }}
                  editable={!saving}
                  secureTextEntry={!showCurrentPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity
                  onPress={() => setShowCurrentPassword(!showCurrentPassword)}
                  style={styles.eyeButton}
                >
                  <Feather
                    name={showCurrentPassword ? 'eye-off' : 'eye'}
                    size={20}
                    color={colors.muted}
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* New Password */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>
                New Password <Text style={styles.required}>*</Text>
              </Text>
              <View style={styles.passwordInputContainer}>
                <TextInput
                  style={styles.passwordInput}
                  placeholder="Enter new password"
                  placeholderTextColor="#9CA3AF"
                  value={newPassword}
                  onChangeText={(text) => {
                    setNewPassword(text);
                    setError(null);
                  }}
                  editable={!saving}
                  secureTextEntry={!showNewPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity
                  onPress={() => setShowNewPassword(!showNewPassword)}
                  style={styles.eyeButton}
                >
                  <Feather
                    name={showNewPassword ? 'eye-off' : 'eye'}
                    size={20}
                    color={colors.muted}
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* Confirm Password */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>
                Confirm New Password <Text style={styles.required}>*</Text>
              </Text>
              <View style={styles.passwordInputContainer}>
                <TextInput
                  style={styles.passwordInput}
                  placeholder="Confirm new password"
                  placeholderTextColor="#9CA3AF"
                  value={confirmPassword}
                  onChangeText={(text) => {
                    setConfirmPassword(text);
                    setError(null);
                  }}
                  editable={!saving}
                  secureTextEntry={!showConfirmPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity
                  onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                  style={styles.eyeButton}
                >
                  <Feather
                    name={showConfirmPassword ? 'eye-off' : 'eye'}
                    size={20}
                    color={colors.muted}
                  />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.infoBox}>
              <Feather name="info" size={16} color={colors.accent} />
              <Text style={styles.infoText}>
                Password must be at least 6 characters long.
              </Text>
            </View>
            </View>

            {/* Save Changes 按钮 */}
            <TouchableOpacity
              style={[styles.saveButton, saving && styles.saveButtonDisabled]}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.8}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.saveButtonText}>Save Changes</Text>
              )}
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
  bodyContent: {
    paddingTop: 16,
  },
  errorBanner: {
    backgroundColor: '#FEF2F2',
    padding: 12,
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.red,
  },
  errorBannerText: {
    color: colors.red,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: -0.1,
    fontFamily: 'JetBrainsMono_500',
    fontWeight: '400',
  },
  formCard: {
    backgroundColor: colors.surf,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginHorizontal: 20,
    marginBottom: 24,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 12,
    lineHeight: 17,
    letterSpacing: -0.1,
    fontFamily: 'JetBrainsMono_500',
    fontWeight: '400',
    color: colors.muted,
    marginBottom: 8,
  },
  required: {
    color: colors.red,
  },
  passwordInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 16,
    lineHeight: 22,
    letterSpacing: -0.1,
    fontFamily: 'JetBrainsMono_700',
    fontWeight: '400',
    color: colors.text,
  },
  eyeButton: {
    padding: 12,
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: colors.accentL,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    borderRadius: 8,
    alignItems: 'flex-start',
    marginTop: 8,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    letterSpacing: -0.1,
    color: colors.sub,
    fontFamily: 'JetBrainsMono_400',
    fontWeight: '400',
    marginLeft: 8,
  },
  saveButton: {
    backgroundColor: colors.accent,
    borderWidth: 1,
    borderColor: '#146B59',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 20,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: -0.1,
    fontFamily: 'JetBrainsMono_700',
    fontWeight: '400',
  },
});

