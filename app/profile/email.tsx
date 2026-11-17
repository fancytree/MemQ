import { Icon } from '@/components/ui/Icon';
import { oneLine } from '@/theme/typography';
import { Card } from '@/components/ui/Card';
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
import { Field } from '@/components/ui/Field';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
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

export default function EmailEditScreen() {
  const navigation = useNavigation();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 隐藏系统导航栏
  useEffect(() => {
    navigation.setOptions({
      headerShown: false,
    });
  }, [navigation]);

  // 获取当前邮箱
  const fetchEmail = useCallback(async () => {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();

      if (userError || !user) {
        console.error('Error fetching user:', userError);
        setError('Failed to load user information');
        setLoading(false);
        return;
      }

      const currentEmail = user.email || '';
      console.log('Fetched current email from user:', currentEmail);
      setEmail(currentEmail);
    } catch (err) {
      console.error('Error:', err);
      setError('Something went wrong');
    } finally {
      setLoading(false);
    }
  }, []);

  // 只在组件首次挂载时获取邮箱，不在页面获得焦点时刷新（避免覆盖用户输入）
  useEffect(() => {
    fetchEmail();
  }, [fetchEmail]);

  // 验证邮箱格式（更严格的验证，匹配 Supabase 的要求）
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

  // 保存邮箱
  const handleSave = async () => {
    if (!email.trim()) {
      setError('Email cannot be empty');
      dialog('Error', 'Please enter an email address');
      return;
    }

    if (!isValidEmail(email.trim())) {
      setError('Please enter a valid email address');
      dialog('Error', 'Please enter a valid email address');
      return;
    }

    // 先获取 trimmedEmail
    const trimmedEmail = email.trim();

    // 调试：打印实际要发送的邮箱
    console.log('Current email state:', email);
    console.log('Trimmed email to send:', trimmedEmail);

    setError(null);
    setSaving(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError('User not authenticated');
        dialog('Error', 'User not authenticated');
        setSaving(false);
        return;
      }

      // 再次验证邮箱（在发送请求前）
      if (!isValidEmail(trimmedEmail)) {
        setError('Please enter a valid email address');
        dialog('Error', 'Please enter a valid email address');
        setSaving(false);
        return;
      }

      // 检查邮箱是否与当前邮箱相同
      if (user.email && trimmedEmail.toLowerCase() === user.email.toLowerCase()) {
        setError('New email must be different from current email');
        dialog('Error', 'New email must be different from current email');
        setSaving(false);
        return;
      }

      // 调试：在发送请求前再次确认
      console.log('About to update email to:', trimmedEmail);
      console.log('Current user email:', user.email);
      console.log('Email change request:', {
        from: user.email,
        to: trimmedEmail,
      });

      // 更新邮箱（Supabase 会发送确认邮件）
      const { error: updateError, data: updateData } = await supabase.auth.updateUser({
        email: trimmedEmail,
      });

      if (updateError) {
        console.error('Error updating email:', updateError);
        console.error('Error details:', {
          message: updateError.message,
          status: updateError.status,
          name: updateError.name,
        });

        // 显示更友好的错误信息
        let errorMessage = updateError.message || 'Failed to update email';

        // 检查错误是否与当前邮箱有关
        if (updateError.message?.includes('invalid') || updateError.message?.includes('Invalid')) {
          // 如果错误信息中提到的是当前邮箱，说明 Supabase 在验证当前邮箱时发现它无效
          // 这是 Supabase 的限制，我们无法绕过
          if (user.email && updateError.message.includes(user.email)) {
            errorMessage = `Unable to update email: Your current email address (${user.email}) is marked as invalid by Supabase. This is a server-side restriction. Please contact support to resolve this issue, or try updating your email through the Supabase Dashboard.`;
          } else if (updateError.message.includes(trimmedEmail)) {
            errorMessage = `The new email address "${trimmedEmail}" format is invalid. Please check and try again.`;
          } else {
            errorMessage = `Email address format is invalid. Please check the email address and try again.`;
          }
        } else if (updateError.message?.includes('already')) {
          errorMessage = 'This email address is already in use. Please use a different email address.';
        }

        setError(errorMessage);
        dialog('Error', errorMessage);
        setSaving(false);
        return;
      }

      // 调试：打印成功响应
      console.log('Email update successful:', updateData);

      // 成功：返回
      dialog(
        'Success',
        'Email update request sent. Please check your new email inbox for a confirmation link.',
        [
          {
            text: 'OK',
            onPress: () => safeBack('/profile/settings'),
          },
        ]
      );
    } catch (err) {
      console.error('Error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Something went wrong';
      setError(errorMessage);
      dialog('Error', errorMessage);
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <LinearGradient pointerEvents="none" colors={[colors.limePale, colors.limeBright, colors.bg]} locations={[0, 0.42, 1]} style={styles.pageGradient} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.sub} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <LinearGradient pointerEvents="none" colors={[colors.limePale, colors.limeBright, colors.bg]} locations={[0, 0.42, 1]} style={styles.pageGradient} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        {/* Above the scroll view, not in it: the way back stays where it is. */}
        <SecondaryPageNav onBack={() => safeBack('/profile/settings')} />
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >

          <View style={styles.bodyContent}>
            <Text accessibilityRole="header" style={styles.pageTitle}>Edit email</Text>
            {/* 错误提示 */}
            {error && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorBannerText}>{error}</Text>
              </View>
            )}

            {/* 表单区域 */}
            <Card pad="lg" gap={0} style={styles.formCard}>
              <Field label="Email" placeholder="Enter your email"
                accessibilityLabel="Enter your email"
                value={email}
                onChangeText={(text) => { setEmail(text); setError(null); }}
                editable={!saving}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.inputGroup} />
              <View style={styles.infoBox}>
              <Icon name="info" size={16} color={colors.sub} />
                <Text style={styles.infoText}>
                  A confirmation email will be sent to your new email address. Please check your inbox to confirm the change.
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
  infoBox: {
    flexDirection: 'row',
    backgroundColor: colors.tint,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space[3],
    borderRadius: radius.sm,
    alignItems: 'flex-start',
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

