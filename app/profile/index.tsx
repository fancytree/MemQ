import MenuItem from '@/components/MenuItem';
import { MemQTheme } from '@/constants/theme';
import { useSubscription } from '@/context/SubscriptionContext';
import { clearAllCache, formatCacheSize, getCacheSize } from '@/lib/cache';
import { updateNotificationSchedule } from '@/lib/notificationService';
import { safeBack } from '@/lib/safeBack';
import { supabase } from '@/lib/supabase';
import { Feather } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useNavigation } from '@react-navigation/native';
import * as FileSystem from 'expo-file-system/legacy';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export const options = {
  headerShown: false,
};

const t = MemQTheme;

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
  const [soundEffectsEnabled, setSoundEffectsEnabled] = useState(true);
  const [hapticEffectEnabled, setHapticEffectEnabled] = useState(true);
  
  // 缓存大小状态
  const [cacheSize, setCacheSize] = useState<string>('0 B');
  const [loadingCacheSize, setLoadingCacheSize] = useState(false);
  
  // 时间选择器动画
  const slideAnim = useRef(new Animated.Value(300)).current;

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
        
        setSoundEffectsEnabled(metadata.sound_effects_enabled !== false);
        setHapticEffectEnabled(metadata.haptic_effect_enabled !== false);
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
    Alert.alert(
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
              Alert.alert('Success', 'Local data cleared successfully.');
            } catch (error) {
              console.error('Error clearing cache:', error);
              Alert.alert('Error', 'Failed to clear local data.');
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
    Alert.alert(
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
                Alert.alert('Error', error.message);
                setSigningOut(false);
                return;
              }

              // 登出成功，直接导航到登录页面
              // 使用 replace 确保无法返回
              router.replace('/login');
            } catch (error) {
              console.error('Error signing out:', error);
              Alert.alert('Error', 'Failed to logout');
              setSigningOut(false);
            }
          },
        },
      ]
    );
  };

  // 删除账户
  const handleDeleteAccount = () => {
    Alert.alert(
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
            Alert.alert(
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
                        Alert.alert('Error', 'Session expired. Please sign in again.');
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
                        Alert.alert(
                          'Error',
                          error.message || 'Failed to delete account. Please try again or contact support.'
                        );
                        setSigningOut(false);
                        return;
                      }

                      if (data?.success) {
                        // 账号已删除，跳转到登录页面
                        Alert.alert(
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
                      Alert.alert('Error', `Failed to delete account: ${errorMessage}`);
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

  // 时间选择器动画
  useEffect(() => {
    if (showTimePicker) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 65,
        friction: 11,
      }).start();
    } else {
      slideAnim.setValue(300);
    }
  }, [showTimePicker, slideAnim]);

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
        Alert.alert('Error', 'Failed to save notification settings');
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
        Alert.alert(
          'Warning',
          'Settings saved, but failed to update notification schedule. Please check notification permissions in your device settings.'
        );
      }
    } catch (error) {
      console.error('Error saving notification settings:', error);
      Alert.alert('Error', 'Failed to save notification settings');
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
      // 请求权限
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant camera roll permissions to upload an avatar.');
        return;
      }

      // 打开图片选择器
      const result = await ImagePicker.launchImageLibraryAsync({
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
        Alert.alert('Error', 'User not authenticated');
        setUploadingAvatar(false);
        return;
      }

      // 读取图片文件
      const base64Data = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: 'base64',
      });

      if (!base64Data) {
        Alert.alert('Error', 'Failed to read image file');
        setUploadingAvatar(false);
        return;
      }

      // 将 base64 转换为二进制
      const byteCharacters = global.atob ? global.atob(base64Data) : atob(base64Data);
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
        Alert.alert('Error', uploadError.message || 'Failed to upload avatar');
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
        Alert.alert('Error', 'Failed to update avatar');
        setUploadingAvatar(false);
        return;
      }

      // 更新本地状态
      setAvatarUrl(publicUrl);
      
      // 刷新用户信息
      await fetchUser();

      Alert.alert('Success', 'Avatar updated successfully');
    } catch (error) {
      console.error('Error uploading avatar:', error);
      Alert.alert('Error', 'Failed to upload avatar');
    } finally {
      setUploadingAvatar(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={t.color.accent} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topHeaderBlock}>
          {/* 二级页导航（参考 deck 内页） */}
          <View style={styles.header}>
            {isTab ? (
              <Text style={styles.navBack}>Profile</Text>
            ) : (
              <TouchableOpacity onPress={() => safeBack('/(tabs)')} activeOpacity={0.7}>
                <Text style={styles.navBack}>← Profile</Text>
              </TouchableOpacity>
            )}
            <View style={styles.navRightSpacer} />
          </View>

          {/* 用户信息头部 */}
          <View style={styles.userHeader}>
            <TouchableOpacity
              onPress={handleAvatarPress}
              disabled={uploadingAvatar}
              activeOpacity={0.7}
              style={styles.avatarContainer}
            >
              {uploadingAvatar ? (
                <View style={styles.avatar}>
                  <ActivityIndicator size="small" color={t.color.accent} />
                </View>
              ) : avatarUrl ? (
                <Image
                  source={{ uri: avatarUrl }}
                  style={styles.avatarImage}
                  contentFit="cover"
                />
              ) : (
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{getUserInitial()}</Text>
                </View>
              )}
              <View style={styles.avatarEditBadge}>
                <Feather name="camera" size={14} color={t.color.accent} />
              </View>
            </TouchableOpacity>
            <Text style={styles.userName}>{getUserDisplayName()}</Text>
          </View>
        </View>

        {/* Pro Banner */}
        {!isPro && (
          <View style={styles.premiumBanner}>
            <View style={styles.premiumHeader}>
              <Feather name="star" size={20} color={t.color.muted} />
              <Text style={styles.premiumLabel}>Pro</Text>
            </View>
            <Text style={styles.premiumTitle}>Unlock Your Full Potential</Text>
            <TouchableOpacity
              style={styles.premiumButton}
              activeOpacity={0.8}
              onPress={showPaywall}
            >
              <Text style={styles.premiumButtonText}>Start Free Trial</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* PERSONAL INFO Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>PERSONAL INFO</Text>
          <View style={styles.menuCard}>
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
              showDivider={false}
            />
          </View>
        </View>

        {/* PREFERENCE Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>PREFERENCE</Text>
          <View style={styles.menuCard}>
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
                  <TouchableOpacity
                    key={index}
                    style={styles.timeItem}
                    onPress={() => handleEditTime(index)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.timeItemContent}>
                      <Feather name="clock" size={16} color={t.color.muted} />
                      <Text style={styles.timeItemText}>
                        {formatTime(timeStr)}
                      </Text>
                      <TouchableOpacity
                        onPress={(e) => {
                          e.stopPropagation();
                          handleDeleteTime(index);
                        }}
                        style={styles.deleteTimeButton}
                        activeOpacity={0.7}
                      >
                        <Feather name="trash-2" size={16} color={t.color.muted} />
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  style={styles.addTimeButton}
                  onPress={handleAddTime}
                  activeOpacity={0.7}
                >
                  <View style={styles.addTimeButtonContent}>
                    <Feather name="plus" size={16} color={t.color.accent} />
                    <Text style={styles.addTimeButtonText}>Add reminder time</Text>
                  </View>
                </TouchableOpacity>
                <View style={styles.divider} />
              </>
            )}
            <MenuItem
              icon="volume-2"
              iconColor={t.color.muted}
              iconBgColor={t.color.bg}
              title="Sound Effects"
              subtitle="Audio feedback"
              type="toggle"
              toggleValue={soundEffectsEnabled}
              onToggle={setSoundEffectsEnabled}
            />
            <MenuItem
              icon="smartphone"
              iconColor={t.color.muted}
              iconBgColor={t.color.bg}
              title="Haptic effect"
              subtitle="Vibration feedback"
              type="toggle"
              toggleValue={hapticEffectEnabled}
              onToggle={setHapticEffectEnabled}
              showDivider={false}
            />
          </View>
        </View>

        {/* STORAGE Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>STORAGE</Text>
          <View style={styles.menuCard}>
            <View style={styles.cacheItem}>
              <View style={styles.cacheItemLeft}>
                <View style={styles.cacheIconContainer}>
                  <Feather name="database" size={20} color={t.color.muted} />
                </View>
                <View style={styles.cacheItemContent}>
                  <Text style={styles.cacheItemTitle}>Local Data</Text>
                  <Text style={styles.cacheItemSubtitle}>
                    {loadingCacheSize ? 'Calculating...' : cacheSize}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={handleClearCache}
                style={styles.clearCacheButton}
                activeOpacity={0.7}
              >
                <Feather name="trash-2" size={18} color={t.color.muted} />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* ABOUT Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ABOUT</Text>
          <View style={styles.menuCard}>
            <MenuItem
              icon="shield"
              iconColor={t.color.muted}
              iconBgColor={t.color.bg}
              title="Privacy policy"
              onPress={() => {
                router.push('/profile/privacy-policy');
              }}
            />
            <MenuItem
              icon="file-text"
              iconColor={t.color.muted}
              iconBgColor={t.color.bg}
              title="Terms of service"
              onPress={() => {
                router.push('/profile/terms-of-service');
              }}
            />
            <MenuItem
              icon="help-circle"
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
              showDivider={false}
            />
          </View>
        </View>

        {/* Footer Actions */}
        <View style={styles.footerActions}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleSignOut}
            disabled={signingOut}
            activeOpacity={0.7}
          >
            <View style={styles.actionButtonIconContainer}>
              <Feather name="log-out" size={20} color={t.color.muted} />
            </View>
            <Text style={styles.actionButtonText}>Logout</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleDeleteAccount}
            disabled={signingOut}
            activeOpacity={0.7}
          >
            <View style={[styles.actionButtonIconContainer, styles.deleteIconContainer]}>
              <Feather name="trash-2" size={20} color={t.color.danger} />
            </View>
            <Text style={styles.deleteButtonText}>Delete account</Text>
          </TouchableOpacity>
        </View>

        {/* Version */}
        <Text style={styles.versionText}>Version 1.0.0</Text>
      </ScrollView>

      {/* 时间选择器 Modal */}
      {showTimePicker && (
        <>
          {Platform.OS === 'ios' ? (
            <Modal
              visible={showTimePicker}
              transparent
              animationType="none"
              onRequestClose={() => setShowTimePicker(false)}
            >
              <TouchableOpacity
                style={styles.modalOverlay}
                activeOpacity={1}
                onPress={handleTimePickerCancel}
              >
                <Animated.View
                  style={[
                    styles.modalContent,
                    {
                      transform: [{ translateY: slideAnim }],
                    },
                  ]}
                >
                  <View style={styles.modalHeader}>
                    <TouchableOpacity
                      onPress={handleTimePickerCancel}
                      style={styles.modalButton}
                    >
                      <Text style={styles.modalCancelText}>Cancel</Text>
                    </TouchableOpacity>
                    <Text style={styles.modalTitle}>
                      {editingTimeIndex !== null ? 'Edit Study Time' : 'Add Study Time'}
                    </Text>
                    <TouchableOpacity
                      onPress={() => handleTimePickerDone()}
                      style={styles.modalButton}
                    >
                      <Text style={styles.modalDoneText}>Done</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.timePickerContainer}>
                    <DateTimePicker
                      value={tempTime}
                      mode="time"
                      display="spinner"
                      onChange={handleTimeChange}
                      textColor="#111827"
                      themeVariant="light"
                    />
                  </View>
                </Animated.View>
              </TouchableOpacity>
            </Modal>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 14,
  },
  topHeaderBlock: {
  },
  navBack: {
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: -0.1,
    color: t.color.muted,
    fontFamily: 'JetBrainsMono_400',
    fontWeight: '400',
  },
  navRightSpacer: {
    width: 52,
  },
  userHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 18,
    marginBottom: 22,
  },
  avatarContainer: {
    marginRight: 16,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: t.color.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  avatarText: {
    fontSize: 24,
    fontWeight: '400',
    fontFamily: 'JetBrainsMono_700',
    color: t.color.accent,
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: t.color.bg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: t.color.surface,
  },
  userName: {
    fontSize: 20,
    lineHeight: 28,
    letterSpacing: -0.1,
    fontWeight: '400',
    fontFamily: 'JetBrainsMono_700',
    color: t.color.textHigh,
    flex: 1,
  },
  premiumBanner: {
    marginHorizontal: 20,
    marginBottom: 22,
    borderRadius: 10,
    padding: 18,
    backgroundColor: t.color.surface,
    borderWidth: 1,
    borderColor: t.color.border,
  },
  premiumHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  premiumLabel: {
    fontSize: 12,
    fontWeight: '400',
    fontFamily: 'JetBrainsMono_600',
    color: t.color.muted,
    marginLeft: 8,
  },
  premiumTitle: {
    fontSize: 20,
    lineHeight: 28,
    letterSpacing: -0.2,
    fontWeight: '400',
    fontFamily: 'JetBrainsMono_700',
    color: t.color.textHigh,
    marginBottom: 14,
  },
  premiumButton: {
    backgroundColor: t.color.accent,
    borderWidth: 1,
    borderColor: t.color.accentDark,
    borderRadius: 8,
    paddingVertical: 11,
    paddingHorizontal: 16,
    alignSelf: 'flex-start',
  },
  premiumButtonText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400',
    fontFamily: 'JetBrainsMono_700',
    color: '#FFFFFF',
  },
  section: {
    marginBottom: 20,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '400',
    fontFamily: 'JetBrainsMono_500',
    color: t.color.muted,
    textTransform: 'uppercase',
    letterSpacing: -0.1,
    marginBottom: 10,
  },
  menuCard: {
    backgroundColor: t.color.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: t.color.border,
    overflow: 'hidden',
  },
  footerActions: {
    paddingHorizontal: 20,
    marginTop: 4,
    marginBottom: 20,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: t.color.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: t.color.border,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  actionButtonIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: t.color.bg,
    borderWidth: 1,
    borderColor: t.color.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  deleteIconContainer: {
    backgroundColor: t.color.dangerBg,
    borderWidth: 1,
    borderColor: t.color.dangerBorder,
  },
  actionButtonText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400',
    fontFamily: 'JetBrainsMono_500',
    color: t.color.textHigh,
  },
  deleteButtonText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400',
    fontFamily: 'JetBrainsMono_500',
    color: t.color.danger,
  },
  versionText: {
    fontSize: 12,
    fontFamily: 'JetBrainsMono_400',
    color: t.color.muted,
    textAlign: 'center',
    marginTop: 8,
  },
  timeItem: {
    backgroundColor: t.color.surface,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  timeItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 68, // 与 MenuItem 的文字对齐
  },
  timeItemText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: -0.1,
    color: t.color.textHigh,
    fontFamily: 'JetBrainsMono_400',
    fontWeight: '400',
    marginLeft: 8,
  },
  deleteTimeButton: {
    padding: 4,
  },
  addTimeButton: {
    backgroundColor: t.color.surface,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  addTimeButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 68, // 与 MenuItem 的文字对齐
  },
  addTimeButtonText: {
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: -0.1,
    color: t.color.muted,
    marginLeft: 8,
    fontWeight: '400',
    fontFamily: 'JetBrainsMono_500',
  },
  divider: {
    height: 1,
    backgroundColor: t.color.border,
    marginLeft: 68, // 对齐文字部分，与 MenuItem 的分割线对齐
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: t.color.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: t.color.border,
  },
  modalButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  modalCancelText: {
    fontSize: 14,
    fontFamily: 'JetBrainsMono_400',
    color: t.color.muted,
  },
  modalTitle: {
    fontSize: 16,
    letterSpacing: -0.2,
    fontWeight: '400',
    fontFamily: 'JetBrainsMono_700',
    color: t.color.textHigh,
  },
  modalDoneText: {
    fontSize: 14,
    color: t.color.muted,
    fontWeight: '400',
    fontFamily: 'JetBrainsMono_700',
  },
  timePickerContainer: {
    paddingHorizontal: 20,
    paddingVertical: 20,
    backgroundColor: t.color.surface,
  },
  statsCard: {
    backgroundColor: t.color.surface,
    borderRadius: t.radius.lg,
    borderWidth: 1,
    borderColor: t.color.border,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  statsRowLast: {
    marginBottom: 0,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 28,
    fontWeight: '700',
    color: t.color.textHigh,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: t.color.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: t.color.border,
    marginHorizontal: 20,
  },
  recentDaysContainer: {
    marginBottom: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: t.color.border,
  },
  recentDaysTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: t.color.textHigh,
    marginBottom: 12,
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
    fontSize: 11,
    fontWeight: '500',
    color: t.color.muted,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  dayCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: t.color.inner,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: t.color.border,
  },
  dayCircleStudied: {
    backgroundColor: t.color.accent,
    borderColor: t.color.accent,
  },
  dayCircleToday: {
    borderWidth: 2,
    borderColor: t.color.accent,
  },
  dayNumber: {
    fontSize: 14,
    fontWeight: '600',
    color: t.color.muted,
  },
  dayNumberStudied: {
    color: '#FFFFFF',
  },
  dayNumberToday: {
    color: t.color.accent,
  },
  cacheItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  cacheItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  cacheIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: t.color.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  cacheItemContent: {
    flex: 1,
  },
  cacheItemTitle: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400',
    fontFamily: 'JetBrainsMono_500',
    color: t.color.textHigh,
    marginBottom: 2,
  },
  cacheItemSubtitle: {
    fontSize: 12,
    lineHeight: 17,
    fontFamily: 'JetBrainsMono_400',
    color: t.color.muted,
  },
  clearCacheButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: t.color.bg,
    borderWidth: 1,
    borderColor: t.color.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

