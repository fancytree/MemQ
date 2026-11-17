import { oneLine } from '@/theme/typography';
import { Card } from '@/components/ui/Card';
import { LinearGradient } from 'expo-linear-gradient';
import { Button } from '@/components/ui/Button';
import { dialog } from '@/lib/dialog';
import { space, radius, type } from '@/theme';
import { layout } from '@/theme/spacing';
import { supabase } from '@/lib/supabase';
import { useFocusEffect } from 'expo-router';
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

export default function UsernameEditScreen() {
  const navigation = useNavigation();
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 隐藏系统导航栏
  useEffect(() => {
    navigation.setOptions({
      headerShown: false,
    });
  }, [navigation]);

  // 获取当前用户名
  const fetchUsername = useCallback(async () => {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();

      if (userError || !user) {
        console.error('Error fetching user:', userError);
        setError('Failed to load user information');
        setLoading(false);
        return;
      }

      // 从 user_metadata 获取用户名，如果没有则从 email 提取
      const currentUsername = user.user_metadata?.full_name || user.email?.split('@')[0] || '';
      setUsername(currentUsername);
    } catch (err) {
      console.error('Error:', err);
      setError('Something went wrong');
    } finally {
      setLoading(false);
    }
  }, []);

  // 页面获得焦点时刷新数据
  useFocusEffect(
    useCallback(() => {
      fetchUsername();
    }, [fetchUsername])
  );

  // 保存用户名
  const handleSave = async () => {
    if (!username.trim()) {
      setError('Username cannot be empty');
      dialog('Error', 'Please enter a username');
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

      // 更新 user_metadata 中的 full_name
      const { error: updateError } = await supabase.auth.updateUser({
        data: {
          full_name: username.trim(),
        },
      });

      if (updateError) {
        console.error('Error updating username:', updateError);
        dialog('Error', updateError.message || 'Failed to update username');
        setSaving(false);
        return;
      }

      // 成功：返回
      dialog('Success', 'Username updated successfully', [
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
            <Text accessibilityRole="header" style={styles.pageTitle}>Edit user name</Text>
            {/* 错误提示 */}
            {error && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorBannerText}>{error}</Text>
              </View>
            )}

            {/* 表单区域 */}
            <Card pad="lg" gap={0} style={styles.formCard}>
              <Field label="User name" placeholder="Enter your username"
                accessibilityLabel="Enter your username"
                hint="This name is shown on your profile and greeting."
                value={username}
                onChangeText={(text) => { setUsername(text); setError(null); }}
                editable={!saving}
                autoCapitalize="words"
                style={styles.inputGroup} />
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
    marginBottom: space.hair,
  },
  // The one thing this page wants pressed: a shell with the face on it, and the
  // deepest lip, which pressing uses up.
  saveButton: { marginHorizontal: layout.screenInline },
});

