import { Icon } from '@/components/ui/Icon';
import { oneLine } from '@/theme/typography';
import { Card } from '@/components/ui/Card';
import { EyeToggle } from '@/components/ui/EyeToggle';
import { Field } from '@/components/ui/Field';
import { LinearGradient } from 'expo-linear-gradient';
import { Button } from '@/components/ui/Button';
import { dialog } from '@/lib/dialog';
import { space, radius, type } from '@/theme';
import { layout } from '@/theme/spacing';
import { fonts } from '@/theme/typography';
import { supabase } from '@/lib/supabase';
import { safeBack } from '@/lib/safeBack';
import { SecondaryPageNav } from '@/components/SecondaryPageNav';
import { useNavigation } from 'expo-router/react-navigation';
import { colors } from '@/theme';
import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
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
      dialog('Error', 'Please enter your current password');
      return;
    }

    if (!newPassword) {
      setError('Please enter a new password');
      dialog('Error', 'Please enter a new password');
      return;
    }

    if (!isValidPassword(newPassword)) {
      setError('Password must be at least 6 characters long');
      dialog('Error', 'Password must be at least 6 characters long');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      dialog('Error', 'New passwords do not match');
      return;
    }

    if (currentPassword === newPassword) {
      setError('New password must be different from current password');
      dialog('Error', 'New password must be different from current password');
      return;
    }

    setError(null);
    setSaving(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        dialog('Error', 'User not authenticated');
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
        dialog('Error', 'Current password is incorrect');
        setSaving(false);
        return;
      }

      // 更新密码
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        console.error('Error updating password:', updateError);
        dialog('Error', updateError.message || 'Failed to update password');
        setSaving(false);
        return;
      }

      // 成功：清空表单并返回
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      dialog('Success', 'Password updated successfully', [
        {
          text: 'OK',
          onPress: () => safeBack('/profile/settings'),
        },
      ]);
    } catch (err) {
      console.error('Error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Something went wrong';
      dialog('Error', errorMessage);
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <LinearGradient pointerEvents="none" colors={[colors.limePale, colors.limeBright, colors.bg]} locations={[0, 0.42, 1]} style={styles.pageGradient} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        {/* Above the scroll view, not in it: the way back stays where it is. */}
        <SecondaryPageNav onBack={() => safeBack('/profile/settings')} />
        <ScrollView showsVerticalScrollIndicator={false}
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >

          <View style={styles.bodyContent}>
            <Text accessibilityRole="header" style={styles.pageTitle}>Change password</Text>
            {/* 错误提示 */}
            {error && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorBannerText}>{error}</Text>
              </View>
            )}

            {/* 表单区域 */}
            <Card pad="lg" gap={0} style={styles.formCard}>
            <Field style={styles.inputGroup}
              label={<>Current Password <Text style={styles.required}>*</Text></>}
              accessibilityLabel="Enter current password"
              placeholder="Enter current password"
              value={currentPassword}
              onChangeText={(text) => { setCurrentPassword(text); setError(null); }}
              editable={!saving}
              secureTextEntry={!showCurrentPassword}
              autoCapitalize="none"
              autoCorrect={false}
              trailing={<EyeToggle shown={showCurrentPassword} onPress={() => setShowCurrentPassword(!showCurrentPassword)} />}
            />

            <Field style={styles.inputGroup}
              label={<>New Password <Text style={styles.required}>*</Text></>}
              accessibilityLabel="Enter new password"
              placeholder="Enter new password"
              value={newPassword}
              onChangeText={(text) => { setNewPassword(text); setError(null); }}
              editable={!saving}
              secureTextEntry={!showNewPassword}
              autoCapitalize="none"
              autoCorrect={false}
              trailing={<EyeToggle shown={showNewPassword} onPress={() => setShowNewPassword(!showNewPassword)} />}
            />

            <Field style={styles.inputGroup}
              label={<>Confirm New Password <Text style={styles.required}>*</Text></>}
              accessibilityLabel="Confirm new password"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChangeText={(text) => { setConfirmPassword(text); setError(null); }}
              editable={!saving}
              secureTextEntry={!showConfirmPassword}
              autoCapitalize="none"
              autoCorrect={false}
              trailing={<EyeToggle shown={showConfirmPassword} onPress={() => setShowConfirmPassword(!showConfirmPassword)} />}
            />

            <View style={styles.infoBox}>
              <Icon name="info" size={16} color={colors.sub} />
              <Text style={styles.infoText}>
                Password must be at least 6 characters long.
              </Text>
            </View>
            </Card>

            {/* Save Changes 按钮 */}
            <Button label="Save Changes" loading={saving} onPress={handleSave} style={styles.saveButton} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  pageGradient: { position: 'absolute', top: 0, left: 0, right: 0, height: 250 },
  pageTitle: { ...oneLine(type.title), color: colors.sub, marginHorizontal: layout.screenInline, marginBottom: space[5] },
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
    paddingBottom: space[10],
  },
  bodyContent: {
    paddingTop: space[4],
  },
  errorBanner: {
    backgroundColor: colors.redL,
    padding: space[3],
    marginHorizontal: layout.screenInline,
    marginBottom: space[4],
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.red,
  },
  errorBannerText: {
    ...type.caption,
    color: colors.red,
    letterSpacing: -0.1,
  },
  formCard: { marginHorizontal: layout.screenInline, marginBottom: space[6] },
  inputGroup: {
    marginBottom: space[4],
  },
  required: {
    color: colors.red,
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: colors.tint,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space[3],
    borderRadius: radius.sm,
    alignItems: 'flex-start',
    marginTop: space[2],
  },
  infoText: {
    ...type.caption, fontFamily: fonts.regular,
    flex: 1,
    letterSpacing: -0.1,
    color: colors.sub,
    marginLeft: space[2],
  },
  // The one thing this page wants pressed: a shell with the face on it, and the
  // deepest lip, which pressing uses up.
  saveButton: { marginHorizontal: layout.screenInline },
});

