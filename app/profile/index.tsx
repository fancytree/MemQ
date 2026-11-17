import { oneLine } from '@/theme/typography';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { SecondaryPageNav } from '@/components/SecondaryPageNav';
import { space, radius, type } from '@/theme';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { IconButton } from '@/components/ui/IconButton';
import { dialog } from '@/lib/dialog';
import { mcpEnabled } from '@/lib/mcp';
import { layout } from '@/theme/spacing';
import { Sheet } from '@/components/ui/Sheet';
import { CloseButton, ConfirmButton } from '@/components/ui/RoundButtons';
import { fonts } from '@/theme/typography';
import { colors } from '@/theme/colors';
import { LinearGradient } from 'expo-linear-gradient';
import MenuItem from '@/components/MenuItem';
import { MemQTheme } from '@/constants/theme';
import { useSubscription } from '@/context/SubscriptionContext';
import { clearAllCache, formatCacheSize, getCacheSize } from '@/lib/cache';
import { updateNotificationSchedule } from '@/lib/notificationService';
import { safeBack } from '@/lib/safeBack';
import { supabase } from '@/lib/supabase';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useNavigation } from 'expo-router/react-navigation';
import * as FileSystem from 'expo-file-system';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MascotLoading } from '@/components/mascot/MascotLoading';

export const options = {
  headerShown: false,
};

const t = MemQTheme;

type ImagePickerModule = {
  requestMediaLibraryPermissionsAsync: () => Promise<{ status: string }>;
  launchImageLibraryAsync: (options: {
    mediaTypes?: string[];
    allowsEditing?: boolean;
    aspect?: [number, number];
    quality?: number;
  }) => Promise<{
    canceled: boolean;
    assets?: Array<{ uri?: string; mimeType?: string | null }>;
  }>;
};

let cachedImagePicker: ImagePickerModule | null | undefined = undefined;
const getImagePicker = (): ImagePickerModule | null => {
  if (cachedImagePicker !== undefined) return cachedImagePicker;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('expo-image-picker');
    cachedImagePicker = (mod?.default ?? mod) as ImagePickerModule;
  } catch {
    cachedImagePicker = null;
  }
  return cachedImagePicker;
};

export default function ProfileScreen({ isTab = false }: { isTab?: boolean }) {
  const navigation = useNavigation();
  const { isPro, showPaywall } = useSubscription();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // 偏好设置状态
  const [notificationEnabled, setNotificationEnabled] = useState(true);
  const [notificationTimes, setNotificationTimes] = useState<string[]>([]); // 存储多个时间，格式为 "HH:mm"
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [editingTimeIndex, setEditingTimeIndex] = useState<number | null>(null); // null 表示添加新时间，数字表示编辑索引
  const [tempTime, setTempTime] = useState<Date>(new Date()); // 临时时间，用于时间选择器
  const notificationInitialized = useRef(false); // 用于跟踪是否已初始化 notification 状态
  const [dailyStudyMinutes, setDailyStudyMinutes] = useState(30);
  const [dailyGoalCards, setDailyGoalCards] = useState(20);
  const [showDailyStudyOptions, setShowDailyStudyOptions] = useState(false);
  const [showDailyGoalOptions, setShowDailyGoalOptions] = useState(false);

  // 缓存大小状态
  const [cacheSize, setCacheSize] = useState<string>('0 B');
  const [loadingCacheSize, setLoadingCacheSize] = useState(false);

  // 时间选择器动画

  // 隐藏系统导航栏
  useEffect(() => {
    navigation.setOptions({
      headerShown: false,
    });
  }, [navigation]);

  // 获取用户信息
  const fetchUser = useCallback(async () => {
    try {
      const { data: { user: currentUser }, error: userError } = await supabase.auth.getUser();

      if (userError || !currentUser) {
        console.error('Error fetching user:', userError);
        setLoading(false);
        return;
      }

      setUser(currentUser);

      // 加载偏好设置（只在初始加载时设置，避免覆盖用户正在进行的操作）
      const metadata = currentUser.user_metadata || {};
      // 只在状态未初始化时设置（避免覆盖用户正在切换的开关状态）
      if (!notificationInitialized.current) {
        const enabled = metadata.notification_enabled !== false; // 默认为 true
        setNotificationEnabled(enabled);

        // 加载多个提醒时间
        let times: string[] = [];
        if (metadata.notification_times && Array.isArray(metadata.notification_times)) {
          times = metadata.notification_times;
        } else if (metadata.notification_time) {
          // 兼容旧版本的单时间格式
          times = [metadata.notification_time];
        } else {
          // 默认时间为早上 9 点
          times = ['09:00'];
        }
        setNotificationTimes(times);

        setDailyStudyMinutes(
          typeof metadata.daily_study_minutes === 'number' ? metadata.daily_study_minutes : 30
        );
        setDailyGoalCards(
          typeof metadata.daily_goal_cards === 'number' ? metadata.daily_goal_cards : 20
        );
        notificationInitialized.current = true;

        // 如果通知已启用，同步通知计划
        if (enabled && times.length > 0) {
          try {
            await updateNotificationSchedule(enabled, times);
            console.log('Notification schedule synced on load');
          } catch (error) {
            console.error('Error syncing notification schedule on load:', error);
            // 静默失败，不影响用户体验
          }
        }
      }

      // 获取用户头像 URL（从 user_metadata 或 Storage）
      const avatarPath = currentUser.user_metadata?.avatar_url;
      if (avatarPath) {
        // 如果 avatar_url 是完整 URL，直接使用
        if (avatarPath.startsWith('http')) {
          setAvatarUrl(avatarPath);
        } else {
          // 如果 avatar_url 是路径，从 Storage 获取公开 URL
          const { data } = supabase.storage.from('avatars').getPublicUrl(avatarPath);
          setAvatarUrl(data.publicUrl);
        }
      } else {
        setAvatarUrl(null);
      }
    } catch (error) {
      console.error('Error fetching user:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // 获取缓存大小
  const fetchCacheSize = useCallback(async () => {
    try {
      setLoadingCacheSize(true);
      const size = await getCacheSize();
      setCacheSize(formatCacheSize(size));
    } catch (error) {
      console.error('Error fetching cache size:', error);
      setCacheSize('0 B');
    } finally {
      setLoadingCacheSize(false);
    }
  }, []);

  // 清空缓存
  const handleClearCache = () => {
    dialog(
      'Clear Local Data',
      'Are you sure you want to clear all local cached data? This will not affect your account data, but pages may load slower next time.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              await clearAllCache();
              await fetchCacheSize();
              dialog('Success', 'Local data cleared successfully.');
            } catch (error) {
              console.error('Error clearing cache:', error);
              dialog('Error', 'Failed to clear local data.');
            }
          },
        },
      ]
    );
  };

  // 组件挂载时获取数据
  useEffect(() => {
    fetchUser();
    fetchCacheSize();
  }, [fetchUser, fetchCacheSize]);

  // 页面重新获得焦点时刷新数据（例如从编辑页面返回时）
  useFocusEffect(
    useCallback(() => {
      if (user) {
        // 只在已经有数据的情况下才刷新（避免初始加载时重复请求）
        fetchUser();
      }
    }, [user, fetchUser])
  );


  // 登出
  const handleSignOut = async () => {
    dialog(
      'Logout',
      'Are you sure you want to logout?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            setSigningOut(true);
            try {
              // 先清理本地缓存
              try {
                const { clearCache } = await import('@/lib/cache');
                await clearCache('DASHBOARD');
                await clearCache('LESSONS');
              } catch (cacheError) {
                // 忽略缓存清理错误
                if (__DEV__) {
                  console.warn('Error clearing cache:', cacheError);
                }
              }

              // 登出
              const { error } = await supabase.auth.signOut();
              if (error) {
                dialog('Error', error.message);
                setSigningOut(false);
                return;
              }

              // 登出成功，直接导航到登录页面
              // 使用 replace 确保无法返回
              router.replace('/login');
            } catch (error) {
              console.error('Error signing out:', error);
              dialog('Error', 'Failed to logout');
              setSigningOut(false);
            }
          },
        },
      ]
    );
  };

  // 删除账户
  const handleDeleteAccount = () => {
    dialog(
      'Delete Account',
      'Are you sure you want to delete your account? This action cannot be undone. All your data including lessons, terms, progress, and conversations will be permanently deleted.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            // 二次确认
            dialog(
              'Final Confirmation',
              'This is your last chance to cancel. Your account and all data will be permanently deleted.',
              [
                {
                  text: 'Cancel',
                  style: 'cancel',
                },
                {
                  text: 'Delete Forever',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      setSigningOut(true);

                      // RevenueCat 已移除，不再需要登出

                      // 调用 Edge Function 删除账号
                      const { data: { session } } = await supabase.auth.getSession();
                      if (!session) {
                        dialog('Error', 'Session expired. Please sign in again.');
                        setSigningOut(false);
                        return;
                      }

                      const { data, error } = await supabase.functions.invoke('delete-account', {
                        headers: {
                          Authorization: `Bearer ${session.access_token}`,
                        },
                      });

                      if (error) {
                        console.error('Error deleting account:', error);
                        dialog(
                          'Error',
                          error.message || 'Failed to delete account. Please try again or contact support.'
                        );
                        setSigningOut(false);
                        return;
                      }

                      if (data?.success) {
                        // 账号已删除，跳转到登录页面
                        dialog(
                          'Account Deleted',
                          'Your account has been successfully deleted.',
                          [
                            {
                              text: 'OK',
                              onPress: () => {
                                router.replace('/login');
                              },
                            },
                          ]
                        );
                      } else {
                        throw new Error('Unexpected response from server');
                      }
                    } catch (err) {
                      console.error('Error:', err);
                      const errorMessage = err instanceof Error ? err.message : 'Something went wrong';
                      dialog('Error', `Failed to delete account: ${errorMessage}`);
                      setSigningOut(false);
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  // 获取用户显示名称
  const getUserDisplayName = () => {
    return user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User name';
  };

  // 获取用户邮箱
  const getUserEmail = () => {
    return user?.email || 'Not set';
  };

  // 获取用户头像首字母
  const getUserInitial = () => {
    const name = getUserDisplayName();
    return name.charAt(0).toUpperCase();
  };

  // 处理 notification 开关切换
  const handleNotificationToggle = async (value: boolean) => {
    // 先更新本地状态
    setNotificationEnabled(value);

    // 如果打开且没有设置过时间，显示时间选择器
    if (value && notificationTimes.length === 0) {
      setEditingTimeIndex(null);
      setTempTime(new Date());
      setShowTimePicker(true);
    } else if (!value) {
      // 如果关闭，立即保存设置
      await saveNotificationSettings(false, notificationTimes);
    }
  };

  const savePreferenceMetadata = async (updates: Record<string, any>) => {
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) return false;
      const metadata = currentUser.user_metadata || {};
      const { error } = await supabase.auth.updateUser({
        data: {
          ...metadata,
          ...updates,
        },
      });
      if (error) {
        dialog('Error', 'Failed to save preference');
        return false;
      }
      return true;
    } catch {
      dialog('Error', 'Failed to save preference');
      return false;
    }
  };

  const handleSetDailyStudyMinutes = async (mins: number) => {
    const ok = await savePreferenceMetadata({ daily_study_minutes: mins });
    if (ok) setDailyStudyMinutes(mins);
  };

  const handleSetDailyGoal = async (cards: number) => {
    const ok = await savePreferenceMetadata({ daily_goal_cards: cards });
    if (ok) setDailyGoalCards(cards);
  };

  // 保存 notification 设置
  const saveNotificationSettings = async (enabled: boolean, times: string[]) => {
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) return;

      const metadata = currentUser.user_metadata || {};

      // 更新用户元数据
      const { error } = await supabase.auth.updateUser({
        data: {
          ...metadata,
          notification_enabled: enabled,
          notification_times: times.length > 0 ? times : null,
          // 保留旧字段以兼容
          notification_time: times.length > 0 ? times[0] : null,
        },
      });

      if (error) {
        console.error('Error saving notification settings:', error);
        dialog('Error', 'Failed to save notification settings');
        // 恢复原状态
        setNotificationEnabled(!enabled);
        return;
      }

      // 更新通知计划
      try {
        await updateNotificationSchedule(enabled, times);
        console.log('Notification schedule updated successfully');
      } catch (notificationError) {
        console.error('Error updating notification schedule:', notificationError);
        // 通知计划更新失败不影响设置保存，只记录错误
        dialog(
          'Warning',
          'Settings saved, but failed to update notification schedule. Please check notification permissions in your device settings.'
        );
      }
    } catch (error) {
      console.error('Error saving notification settings:', error);
      dialog('Error', 'Failed to save notification settings');
      setNotificationEnabled(!enabled);
    }
  };

  // 处理时间选择
  const handleTimeChange = (event: any, selectedTime?: Date) => {
    if (selectedTime) {
      setTempTime(selectedTime);
      if (Platform.OS === 'android') {
        handleTimePickerDone(selectedTime);
      }
    }
  };

  // 确认时间选择
  const handleTimePickerDone = async (selectedTime?: Date) => {
    const timeToSave = selectedTime || tempTime;
    const timeStr = `${timeToSave.getHours().toString().padStart(2, '0')}:${timeToSave.getMinutes().toString().padStart(2, '0')}`;

    setShowTimePicker(false);

    // 确保开关是打开状态
    setNotificationEnabled(true);

    let newTimes: string[];
    if (editingTimeIndex !== null) {
      // 编辑现有时间
      newTimes = [...notificationTimes];
      newTimes[editingTimeIndex] = timeStr;
    } else {
      // 添加新时间
      newTimes = [...notificationTimes, timeStr].sort(); // 排序以便显示
    }

    setNotificationTimes(newTimes);
    setEditingTimeIndex(null);
    await saveNotificationSettings(true, newTimes);
  };

  // 取消时间选择
  const handleTimePickerCancel = () => {
    setShowTimePicker(false);
    setEditingTimeIndex(null);
    // 如果用户还没有设置过时间，关闭开关
    if (notificationTimes.length === 0) {
      setNotificationEnabled(false);
    }
  };

  // 添加新时间
  const handleAddTime = () => {
    setEditingTimeIndex(null);
    setTempTime(new Date());
    setShowTimePicker(true);
  };

  // 编辑时间
  const handleEditTime = (index: number) => {
    const timeStr = notificationTimes[index];
    const [hours, minutes] = timeStr.split(':').map(Number);
    const time = new Date();
    time.setHours(hours, minutes, 0, 0);
    setEditingTimeIndex(index);
    setTempTime(time);
    setShowTimePicker(true);
  };

  // 删除时间
  const handleDeleteTime = async (index: number) => {
    const newTimes = notificationTimes.filter((_, i) => i !== index);
    setNotificationTimes(newTimes);

    // 如果删除后没有时间了，关闭开关
    if (newTimes.length === 0) {
      setNotificationEnabled(false);
      await saveNotificationSettings(false, []);
    } else {
      await saveNotificationSettings(true, newTimes);
    }
  };

  // 格式化时间显示
  const formatTime = (timeStr: string) => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  // 选择并上传头像
  const handleAvatarPress = async () => {
    try {
      const imagePicker = getImagePicker();
      if (!imagePicker) {
        dialog('Unavailable', 'Image picker is unavailable in current build.');
        return;
      }
      // 请求权限
      const { status } = await imagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        dialog('Permission Required', 'Please grant camera roll permissions to upload an avatar.');
        return;
      }

      // 打开图片选择器
      const result = await imagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      const asset = result.assets[0];
      if (!asset.uri) {
        return;
      }

      setUploadingAvatar(true);

      // 获取当前用户
      const { data: { user: currentUser }, error: userError } = await supabase.auth.getUser();
      if (userError || !currentUser) {
        dialog('Error', 'User not authenticated');
        setUploadingAvatar(false);
        return;
      }

      // 读取图片文件
      const base64Data = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: 'base64',
      });

      if (!base64Data) {
        dialog('Error', 'Failed to read image file');
        setUploadingAvatar(false);
        return;
      }

      // 将 base64 转换为二进制
      const byteCharacters = globalThis.atob ? globalThis.atob(base64Data) : atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);

      // 生成文件名
      const fileExt = asset.uri.split('.').pop() || 'jpg';
      const fileName = `${currentUser.id}/avatar.${fileExt}`;

      // 上传到 Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, byteArray, {
          contentType: asset.mimeType || 'image/jpeg',
          upsert: true, // 如果已存在则覆盖
        });

      if (uploadError) {
        console.error('Error uploading avatar:', uploadError);
        dialog('Error', uploadError.message || 'Failed to upload avatar');
        setUploadingAvatar(false);
        return;
      }

      // 获取公开 URL
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(fileName);
      const publicUrl = urlData.publicUrl;

      // 更新 user_metadata 中的 avatar_url
      const { error: updateError } = await supabase.auth.updateUser({
        data: {
          avatar_url: fileName, // 存储路径，而不是完整 URL
        },
      });

      if (updateError) {
        console.error('Error updating user metadata:', updateError);
        dialog('Error', 'Failed to update avatar');
        setUploadingAvatar(false);
        return;
      }

      // 更新本地状态
      setAvatarUrl(publicUrl);

      // 刷新用户信息
      await fetchUser();

      dialog('Success', 'Avatar updated successfully');
    } catch (error) {
      console.error('Error uploading avatar:', error);
      dialog('Error', 'Failed to upload avatar');
    } finally {
      setUploadingAvatar(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <MascotLoading />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <LinearGradient pointerEvents="none" colors={[colors.limePale, colors.limeBright, colors.bg]} locations={[0, 0.42, 1]} style={styles.pageGradient} />
      {/* The way back stays above the scroll view. No page name under it: the person's
          own name and picture open the page, and a heading saying "Profile" over a
          profile only repeats what is already the first thing on it. */}
      {isTab ? <View style={styles.tabTop} /> : <SecondaryPageNav onBack={() => safeBack('/you')} backLabel="← You" />}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topHeaderBlock}>
          {/* 用户信息头部 */}
          <View style={styles.userHeader}>
            <TouchableOpacity accessibilityRole="button"
              onPress={handleAvatarPress}
              disabled={uploadingAvatar}
              activeOpacity={0.7}
              style={styles.avatarContainer}
            >
              {uploadingAvatar ? (
                <View style={styles.avatar}>
                  <ActivityIndicator size="small" color={colors.sub} />
                </View>
              ) : avatarUrl ? (
                <Image
                  source={{ uri: avatarUrl }}
                  style={styles.avatarImage}
                />
              ) : (
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{getUserInitial()}</Text>
                </View>
              )}
              <View style={styles.avatarEditBadge}>
                <Icon name="camera" size={14} color={colors.sub} />
              </View>
            </TouchableOpacity>
            <Text style={styles.userName}>{getUserDisplayName()}</Text>
          </View>
        </View>

        {/* Pro Banner */}
        {!isPro && (
          <Card pad="lg" gap={0} style={styles.premiumBanner}>
            <View style={styles.premiumHeader}>
              <Icon name="star" size={20} color={t.color.muted} />
              <Text style={styles.premiumLabel}>Pro</Text>
            </View>
            <Text style={styles.premiumTitle}>Unlock Your Full Potential</Text>
            <Button size="sm" width="hug" label="Start Free Trial" onPress={showPaywall} />
          </Card>
        )}

        {/* PERSONAL INFO Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Personal info</Text>
          <Card pad="none" gap={0} faceStyle={styles.menuRows}>
            <MenuItem
              icon="user"
              iconColor={t.color.muted}
              iconBgColor={t.color.bg}
              title="User name"
              value={getUserDisplayName()}
              onPress={() => {
                router.push('/profile/username' as any);
              }}
            />
            <MenuItem
              icon="mail"
              iconColor={t.color.muted}
              iconBgColor={t.color.bg}
              title="Email"
              value={getUserEmail()}
              onPress={() => {
                router.push('/profile/email' as any);
              }}
            />
            <MenuItem
              icon="lock"
              iconColor={t.color.muted}
              iconBgColor={t.color.bg}
              title="Password"
              value="••••••••"
              onPress={() => {
                router.push('/profile/password' as any);
              }}
              showDivider={mcpEnabled}
            />
            {mcpEnabled && <MenuItem
              icon="connections" iconColor={t.color.muted} iconBgColor={t.color.bg} title="Connected apps"
              subtitle="Manage AI and other connections" onPress={() => router.push('/profile/connections')} showDivider={false}
            />}
          </Card>
        </View>

        {/* PREFERENCE Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Preferences</Text>
          <Card pad="none" gap={0} faceStyle={styles.menuRows}>
            <MenuItem
              icon="bell"
              iconColor={t.color.muted}
              iconBgColor={t.color.bg}
              title="Notification"
              subtitle={notificationEnabled && notificationTimes.length > 0
                ? `${notificationTimes.length} reminder${notificationTimes.length > 1 ? 's' : ''}`
                : "Get study reminders"}
              type="toggle"
              toggleValue={notificationEnabled}
              onToggle={handleNotificationToggle}
              showDivider={!notificationEnabled}
            />
            {notificationEnabled && (
              <>
                {notificationTimes.map((timeStr, index) => (
                  <TouchableOpacity accessibilityRole="button"
                    key={index}
                    style={styles.timeItem}
                    onPress={() => handleEditTime(index)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.timeItemContent}>
                      <Icon name="clock" size={16} color={t.color.muted} />
                      <Text style={styles.timeItemText}>
                        {formatTime(timeStr)}
                      </Text>
                      <IconButton size="sm" label="Delete reminder" onPress={(event) => {
                          event.stopPropagation();
                          handleDeleteTime(index);
                        }}>
                        <Icon name="delete" size={16} color={t.color.muted} />
                      </IconButton>
                    </View>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity accessibilityRole="button"
                  style={styles.addTimeButton}
                  onPress={handleAddTime}
                  activeOpacity={0.7}
                >
                  <View style={styles.addTimeButtonContent}>
                    <Icon name="plus" size={16} color={colors.sub} />
                    <Text style={styles.addTimeButtonText}>Add reminder time</Text>
                  </View>
                </TouchableOpacity>
                <View style={styles.divider} />
              </>
            )}
            <MenuItem
              icon="duration"
              iconColor={t.color.muted}
              iconBgColor={t.color.bg}
              title="Daily study duration"
              subtitle={`${dailyStudyMinutes} min / day`}
              onPress={() => setShowDailyStudyOptions((prev) => !prev)}
            />
            {showDailyStudyOptions && (
              <>
                <View style={styles.inlineOptionWrap}>
                  {[15, 30, 45, 60, 90].map((mins) => (
                    <Chip key={mins} label={`${mins} min`} selected={dailyStudyMinutes === mins}
                      onPress={() => handleSetDailyStudyMinutes(mins)} />
                  ))}
                </View>
                <View style={styles.divider} />
              </>
            )}
            <MenuItem
              icon="goal"
              iconColor={t.color.muted}
              iconBgColor={t.color.bg}
              title="Daily goal"
              subtitle={`${dailyGoalCards} cards / day`}
              onPress={() => setShowDailyGoalOptions((prev) => !prev)}
              showDivider={showDailyGoalOptions}
            />
            {showDailyGoalOptions && (
              <>
                <View style={styles.inlineOptionWrap}>
                  {[10, 20, 30, 50, 80].map((cards) => (
                    <Chip key={cards} label={`${cards} cards`} selected={dailyGoalCards === cards}
                      onPress={() => handleSetDailyGoal(cards)} />
                  ))}
                </View>
                <View style={styles.divider} />
              </>
            )}
          </Card>
        </View>

        {/* STORAGE Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Storage</Text>
          <Card pad="none" gap={0} faceStyle={styles.menuRows}>
            <View style={styles.cacheItem}>
              <View style={styles.cacheItemLeft}>
                <View style={styles.cacheIconContainer}>
                  <Icon name="storage" color={colors.sub} />
                </View>
                <View style={styles.cacheItemContent}>
                  <Text style={styles.cacheItemTitle}>Local Data</Text>
                  <Text style={styles.cacheItemSubtitle}>
                    {loadingCacheSize ? 'Calculating...' : cacheSize}
                  </Text>
                </View>
              </View>
              <IconButton size="sm" label="Clear local data" onPress={handleClearCache}>
                <Icon name="delete" size={16} color={t.color.muted} />
              </IconButton>
            </View>
          </Card>
        </View>

        {/* ABOUT Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <Card pad="none" gap={0} faceStyle={styles.menuRows}>
            <MenuItem
              icon="privacy"
              iconColor={t.color.muted}
              iconBgColor={t.color.bg}
              title="Privacy policy"
              onPress={() => {
                router.push('/profile/privacy-policy');
              }}
            />
            <MenuItem
              icon="terms"
              iconColor={t.color.muted}
              iconBgColor={t.color.bg}
              title="Terms of service"
              onPress={() => {
                router.push('/profile/terms-of-service');
              }}
            />
            <MenuItem
              icon="help"
              iconColor={t.color.muted}
              iconBgColor={t.color.bg}
              title="Help center"
              onPress={() => {
                try {
                  router.push('/profile/help-center' as any);
                } catch (error) {
                  console.error('Error navigating to help-center:', error);
                }
              }}
              showDivider={__DEV__}
            />
            {/* Design review tool. Gated so it cannot ship in a release build. */}
            {__DEV__ && (
              <MenuItem
                icon="motion"
                iconColor={t.color.muted}
                iconBgColor={t.color.bg}
                title="Motion lab"
                subtitle="Preview every mood of the Today character"
                onPress={() => {
                  router.push('/motion-lab' as any);
                }}
              />
            )}
            {__DEV__ && (
              <MenuItem
                icon="library"
                iconColor={t.color.muted}
                iconBgColor={t.color.bg}
                title="Design system"
                subtitle="Colour, type, space and every component"
                onPress={() => {
                  router.push('/design-system' as any);
                }}
                showDivider={false}
              />
            )}
          </Card>
        </View>

        {/* Footer Actions */}
        <View style={styles.footerActions}>
          <Card onPress={handleSignOut} disabled={signingOut} accessibilityLabel="Logout"
            style={styles.actionButton} faceStyle={styles.actionRow}>
            <View style={styles.actionButtonIconContainer}>
              <Icon name="signOut" color={colors.sub} />
            </View>
            <Text style={styles.actionButtonText}>Logout</Text>
          </Card>

          <Card onPress={handleDeleteAccount} disabled={signingOut} accessibilityLabel="Delete account"
            style={styles.actionButton} faceStyle={styles.actionRow}>
            <View style={[styles.actionButtonIconContainer, styles.deleteIconContainer]}>
              <Icon name="delete" color={t.color.danger} />
            </View>
            <Text style={styles.deleteButtonText}>Delete account</Text>
          </Card>
        </View>

        {/* Version */}
        <Text style={styles.versionText}>Version 1.0.0</Text>
      </ScrollView>

      {/* When to be reminded. */}
      {showTimePicker && (
        <>
          {Platform.OS === 'ios' ? (
            /* Cancel and Done were two words in a bar nothing else in the app has:
               every other sheet dismisses with the cross and commits with the tick,
               and this one ran its own spring against a TouchableOpacity scrim. */
            <Sheet visible={showTimePicker} onClose={handleTimePickerCancel}
              align="center" grab={false} close={false}
              closeLabel="Cancel"
              lead={<CloseButton onPress={handleTimePickerCancel} label="Cancel" />}
              action={<ConfirmButton onPress={() => handleTimePickerDone()} label="Save this time" />}
              title={editingTimeIndex !== null ? 'Edit Study Time' : 'Add Study Time'}>
              <View style={styles.timePickerContainer}>
                <DateTimePicker
                  value={tempTime}
                  mode="time"
                  display="spinner"
                  onChange={handleTimeChange}
                  textColor={colors.text}
                  themeVariant="light"
                />
              </View>
            </Sheet>
          ) : (
            <DateTimePicker
              value={tempTime}
              mode="time"
              display="default"
              onChange={handleTimeChange}
            />
          )}
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: t.color.bg,
  },
  pageGradient: { position: 'absolute', top: 0, left: 0, right: 0, height: 300 },
  tabTop: { height: 14 },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 56,
  },
  topHeaderBlock: {
  },
  userHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: layout.screenInline,
    paddingVertical: space[4],
    marginBottom: space[5],
  },
  avatarContainer: {
    marginRight: space[4],
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: radius.xl,
    backgroundColor: t.color.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: 64,
    height: 64,
    borderRadius: radius.xl,
  },
  avatarText: {
    ...type.page, fontFamily: fonts.bold,
    color: colors.sub,
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: radius.md,
    backgroundColor: t.color.bg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: t.color.surface,
  },
  // Under the page's own title now, so a step down from it.
  userName: {
    ...type.page,
    color: colors.sub,
    flex: 1,
  },
  premiumBanner: { marginHorizontal: layout.screenInline, marginBottom: space[5] },
  premiumHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: space[3],
  },
  premiumLabel: {
    ...type.caption, fontFamily: fonts.semibold,
    color: t.color.muted,
    marginLeft: space[2],
  },
  premiumTitle: {
    ...type.heading, fontFamily: fonts.bold,
    letterSpacing: -0.2,
    color: t.color.textHigh,
    marginBottom: space[3],
  },
  section: {
    marginBottom: space[5],
    paddingHorizontal: layout.screenInline,
  },
  sectionTitle: {
    ...oneLine(type.body), fontFamily: fonts.semibold,
    color: colors.text,
    marginBottom: space[2],
  },
  // A list, not a padded card: the rows pad themselves and are clipped to the corner.
  menuRows: { overflow: 'hidden' },
  footerActions: {
    paddingHorizontal: layout.screenInline,
    marginTop: space[1],
    marginBottom: space[5],
  },
  actionButton: { marginBottom: space[2] },
  actionRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center' },
  // The same tile every settings row's icon sits in.
  actionButtonIconContainer: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.panel,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: space[3],
  },
  deleteIconContainer: {
    backgroundColor: t.color.dangerBg,
  },
  actionButtonText: {
    ...type.small, fontFamily: fonts.medium,
    color: t.color.textHigh,
  },
  deleteButtonText: {
    ...type.small, fontFamily: fonts.medium,
    color: t.color.danger,
  },
  versionText: {
    ...type.caption, fontFamily: fonts.regular,
    color: t.color.muted,
    textAlign: 'center',
    marginTop: space[2],
  },
  timeItem: {
    backgroundColor: t.color.surface,
    paddingVertical: space[3],
    paddingHorizontal: space[4],
  },
  timeItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 68, // 与 MenuItem 的文字对齐
  },
  timeItemText: {
    ...type.caption, fontFamily: fonts.regular,
    flex: 1,
    letterSpacing: -0.1,
    color: t.color.textHigh,
    marginLeft: space[2],
  },
  addTimeButton: { minHeight: 44,
    backgroundColor: t.color.surface,
    paddingVertical: space[3],
    paddingHorizontal: space[4],
  },
  addTimeButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 68, // 与 MenuItem 的文字对齐
  },
  addTimeButtonText: {
    ...type.caption,
    letterSpacing: -0.1,
    color: t.color.muted,
    marginLeft: space[2],
  },
  inlineOptionWrap: {
    marginLeft: 68,
    marginRight: space[4],
    marginTop: space[2],
    marginBottom: space[2],
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space[2],
  },
  divider: {
    height: 1,
    backgroundColor: t.color.border,
    marginLeft: 68, // 对齐文字部分，与 MenuItem 的分割线对齐
  },
  // No fill of its own: a white block under the sheet's head drew a seam across
  // the sheet and squared off what the corners had just rounded.
  timePickerContainer: {
    paddingHorizontal: layout.screenInline,
    paddingVertical: space[5],
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: space[4],
  },
  statsRowLast: {
    marginBottom: space[0],
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    ...type.page,
    color: t.color.textHigh,
    marginBottom: space[1],
  },
  statLabel: {
    ...type.caption,
    color: t.color.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: t.color.border,
    marginHorizontal: space[5],
  },
  recentDaysContainer: {
    marginBottom: space[5],
    paddingBottom: space[5],
    borderBottomWidth: 1,
    borderBottomColor: t.color.border,
  },
  recentDaysTitle: {
    ...type.small,
    color: t.color.textHigh,
    marginBottom: space[3],
  },
  recentDaysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dayItem: {
    alignItems: 'center',
    flex: 1,
  },
  dayName: {
    ...type.caption,
    color: t.color.muted,
    marginBottom: space[2],
    textTransform: 'uppercase',
  },
  dayCircle: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: t.color.inner,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: t.color.border,
  },
  dayCircleStudied: {
    backgroundColor: colors.action,
    borderColor: colors.action,
  },
  dayCircleToday: {
    borderWidth: 2,
    borderColor: colors.action,
  },
  dayNumber: {
    ...type.small,
    color: t.color.muted,
  },
  dayNumberStudied: {
    color: colors.onAction,
  },
  dayNumberToday: {
    color: colors.sub,
  },
  cacheItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space[3],
    paddingHorizontal: space[4],
  },
  cacheItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  cacheIconContainer: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.panel,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: space[3],
  },
  cacheItemContent: {
    flex: 1,
  },
  cacheItemTitle: {
    ...type.small, fontFamily: fonts.medium,
    color: t.color.textHigh,
    marginBottom: space.hair,
  },
  cacheItemSubtitle: {
    ...type.caption, fontFamily: fonts.regular,
    color: t.color.muted,
  },
});

