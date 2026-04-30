import { supabase } from '@/lib/supabase';
import { useFocusEffect } from 'expo-router';
import { safeBack } from '@/lib/safeBack';
import { SecondaryPageNav } from '@/components/SecondaryPageNav';
import { useNavigation } from '@react-navigation/native';
import { colors } from '@/theme';
import React, { useCallback, useEffect, useState } from 'react';
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
      Alert.alert('Error', 'Please enter a username');
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

      // 更新 user_metadata 中的 full_name
      const { error: updateError } = await supabase.auth.updateUser({
        data: {
          full_name: username.trim(),
        },
      });

      if (updateError) {
        console.error('Error updating username:', updateError);
        Alert.alert('Error', updateError.message || 'Failed to update username');
        setSaving(false);
        return;
      }

      // 成功：返回
      Alert.alert('Success', 'Username updated successfully', [
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

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

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
              <View style={styles.inputGroup}>
                <Text style={styles.label}>
                  User name <Text style={styles.required}>*</Text>
                </Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter your username"
                  placeholderTextColor="#9CA3AF"
                  value={username}
                  onChangeText={(text) => {
                    setUsername(text);
                    setError(null);
                  }}
                  editable={!saving}
                  autoCapitalize="words"
                />
                <Text style={styles.helperText}>
                  This name is shown on your profile and greeting.
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
    marginBottom: 2,
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
  input: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 16,
    lineHeight: 22,
    letterSpacing: -0.1,
    fontFamily: 'JetBrainsMono_700',
    fontWeight: '400',
    color: colors.text,
  },
  helperText: {
    marginTop: 8,
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: -0.1,
    fontFamily: 'JetBrainsMono_400',
    fontWeight: '400',
    color: colors.muted,
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

