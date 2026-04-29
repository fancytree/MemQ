import { supabase } from '@/lib/supabase';
import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import BackIcon from '@/components/icons/BackIcon';
import { useNavigation } from '@react-navigation/native';
import React, { useCallback, useEffect, useState, useRef } from 'react';
import { updateNotificationSchedule } from '@/lib/notificationService';
import { useSubscription } from '@/context/SubscriptionContext';
import { getCacheSize, formatCacheSize, clearAllCache } from '@/lib/cache';
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
import MenuItem from '@/components/MenuItem';
import { MemQTheme } from '@/constants/theme';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import * as FileSystem from 'expo-file-system/legacy';
import DateTimePicker from '@react-native-community/datetimepicker';

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
  
  // 学习统计状态
  const [studyStats, setStudyStats] = useState<{
    studyDays: number;
    totalReviews: number;
    masteredTerms: number;
    totalTerms: number;
    currentStreak: number;
    recent7Days: Array<{ date: string; studied: boolean }>;
  } | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  
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

  // 获取学习统计
  const fetchStudyStats = useCallback(async () => {
    try {
      setLoadingStats(true);
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) return;

      // 获取所有学习记录
      const { data: progressData, error: progressError } = await supabase
        .from('user_term_progress')
        .select('last_reviewed_at, status')
        .eq('user_id', currentUser.id)
        .not('last_reviewed_at', 'is', null);

      if (progressError) {
        console.error('Error fetching progress:', progressError);
        return;
      }

      // 获取总词汇数
      // 先获取用户的所有 lesson IDs
      const { data: lessonsData, error: lessonsError } = await supabase
        .from('lessons')
        .select('id')
        .eq('user_id', currentUser.id);

      let totalTerms = 0;
      if (lessonsData && lessonsData.length > 0) {
        const lessonIds = lessonsData.map((lesson) => lesson.id);
        const { data: termsData, error: termsError } = await supabase
          .from('terms')
          .select('id')
          .in('lesson_id', lessonIds);

        if (!termsError && termsData) {
          totalTerms = termsData.length;
        }
      }

      // 获取今天的本地日期（避免时区问题）
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // 格式化日期为 YYYY-MM-DD（使用本地时间）
      const formatDateLocal = (date: Date): string => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };

      // 统计学习天数（根据 last_reviewed_at 去重，按日期）
      const studyDaysSet = new Set<string>();
      if (progressData) {
        progressData.forEach((record) => {
          if (record.last_reviewed_at) {
            const date = new Date(record.last_reviewed_at);
            date.setHours(0, 0, 0, 0);
            const dateStr = formatDateLocal(date);
            studyDaysSet.add(dateStr);
          }
        });
      }

      // 统计已掌握的词汇数
      const masteredTerms = progressData?.filter(
        (record) => record.status === 'Mastered'
      ).length || 0;

      // 计算连续学习天数
      const sortedDates = Array.from(studyDaysSet).sort().reverse();
      let currentStreak = 0;
      const todayStr = formatDateLocal(today);
      
      for (let i = 0; i < sortedDates.length; i++) {
        const date = new Date(sortedDates[i]);
        date.setHours(0, 0, 0, 0);
        const expectedDate = new Date(today);
        expectedDate.setDate(today.getDate() - i);
        
        if (date.getTime() === expectedDate.getTime()) {
          currentStreak++;
        } else {
          break;
        }
      }

      // 生成最近7天的学习记录（从6天前到今天，最后一天是今天）
      const recent7Days: Array<{ date: string; studied: boolean }> = [];
      
      // 循环从6天前到今天（i从6到0，最后一天i=0是今天）
      for (let i = 6; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(today.getDate() - i);
        const dateStr = formatDateLocal(date);
        recent7Days.push({
          date: dateStr,
          studied: studyDaysSet.has(dateStr),
        });
      }
      
      // 验证：最后一天应该是今天
      const lastDayDate = recent7Days[recent7Days.length - 1].date;
      if (lastDayDate !== todayStr) {
        console.error('Last day mismatch:', lastDayDate, 'expected:', todayStr);
      }

      setStudyStats({
        studyDays: studyDaysSet.size,
        totalReviews: progressData?.length || 0,
        masteredTerms,
        totalTerms,
        currentStreak,
        recent7Days,
      });
    } catch (error) {
      console.error('Error fetching study stats:', error);
    } finally {
      setLoadingStats(false);
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
    fetchStudyStats();
    fetchCacheSize();
  }, [fetchUser, fetchStudyStats, fetchCacheSize]);

  // 页面重新获得焦点时刷新数据（例如从编辑页面返回时）
  useFocusEffect(
    useCallback(() => {
      if (user) {
        // 只在已经有数据的情况下才刷新（避免初始加载时重复请求）
        fetchUser();
        fetchStudyStats();
      }
    }, [user, fetchUser, fetchStudyStats])
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
        {/* 自定义 Header */}
        <View style={styles.header}>
          {isTab ? (
            <View style={styles.backButton} />
          ) : (
            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.backButton}
              activeOpacity={0.7}
            >
              <BackIcon size={20} color="#0A0A0A" />
            </TouchableOpacity>
          )}
          <Text style={styles.headerTitle}>Profile</Text>
          <View style={styles.headerRight} />
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
              <Feather name="camera" size={14} color="#FFFFFF" />
            </View>
          </TouchableOpacity>
          <Text style={styles.userName}>{getUserDisplayName()}</Text>
        </View>

        {/* Pro Banner */}
        {!isPro && (
          <View style={styles.premiumBanner}>
            <View style={styles.premiumHeader}>
              <Feather name="star" size={20} color="#FFFFFF" />
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

        {/* STUDY STATISTICS Section */}
        {studyStats && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>STUDY STATISTICS</Text>
            <View style={styles.statsCard}>
              {/* Recent 7 Days Calendar */}
              <View style={styles.recentDaysContainer}>
                <Text style={styles.recentDaysTitle}>Recent 7 Days</Text>
                <View style={styles.recentDaysRow}>
                  {studyStats.recent7Days.map((day, index) => {
                    const date = new Date(day.date);
                    const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
                    const dayNumber = date.getDate();
                    const isToday = index === studyStats.recent7Days.length - 1;
                    
                    return (
                      <View key={day.date} style={styles.dayItem}>
                        <Text style={styles.dayName}>{dayName}</Text>
                        <View
                          style={[
                            styles.dayCircle,
                            day.studied && styles.dayCircleStudied,
                            isToday && styles.dayCircleToday,
                          ]}
                        >
                          <Text
                            style={[
                              styles.dayNumber,
                              day.studied && styles.dayNumberStudied,
                              isToday && styles.dayNumberToday,
                            ]}
                          >
                            {dayNumber}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
              
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{studyStats.studyDays}</Text>
                  <Text style={styles.statLabel}>Study Days</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{studyStats.totalReviews}</Text>
                  <Text style={styles.statLabel}>Total Reviews</Text>
                </View>
              </View>
              <View style={[styles.statsRow, styles.statsRowLast]}>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{studyStats.masteredTerms}</Text>
                  <Text style={styles.statLabel}>Mastered Terms</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{studyStats.currentStreak}</Text>
                  <Text style={styles.statLabel}>Day Streak</Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* PERSONAL INFO Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>PERSONAL INFO</Text>
          <View style={styles.menuCard}>
            <MenuItem
              icon="user"
              iconColor="#3B82F6"
              iconBgColor="#DBEAFE"
              title="User name"
              value={getUserDisplayName()}
              onPress={() => {
                router.push('/profile/username' as any);
              }}
            />
            <MenuItem
              icon="mail"
              iconColor="#10B981"
              iconBgColor="#D1FAE5"
              title="Email"
              value={getUserEmail()}
              onPress={() => {
                router.push('/profile/email' as any);
              }}
            />
            <MenuItem
              icon="lock"
              iconColor="#8B5CF6"
              iconBgColor="#EDE9FE"
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
              iconColor="#F97316"
              iconBgColor="#FFEDD5"
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
                        <Feather name="trash-2" size={16} color="#EF4444" />
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
              iconColor="#8B5CF6"
              iconBgColor="#EDE9FE"
              title="Sound Effects"
              subtitle="Audio feedback"
              type="toggle"
              toggleValue={soundEffectsEnabled}
              onToggle={setSoundEffectsEnabled}
            />
            <MenuItem
              icon="smartphone"
              iconColor="#EC4899"
              iconBgColor="#FCE7F3"
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
                <View style={[styles.cacheIconContainer, { backgroundColor: '#DBEAFE' }]}>
                  <Feather name="database" size={20} color="#3B82F6" />
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
                <Feather name="trash-2" size={18} color="#EF4444" />
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
              iconColor="#3B82F6"
              iconBgColor="#DBEAFE"
              title="Privacy policy"
              onPress={() => {
                router.push('/profile/privacy-policy');
              }}
            />
            <MenuItem
              icon="file-text"
              iconColor="#10B981"
              iconBgColor="#D1FAE5"
              title="Terms of service"
              onPress={() => {
                router.push('/profile/terms-of-service');
              }}
            />
            <MenuItem
              icon="help-circle"
              iconColor="#F97316"
              iconBgColor="#FFEDD5"
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
              <Feather name="log-out" size={20} color="#6B7280" />
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
              <Feather name="trash-2" size={20} color="#EF4444" />
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
    paddingTop: 12,
    paddingBottom: 20,
  },
  backButton: {
    width: 40,
    height: 40,
    backgroundColor: t.color.accentLight,
    borderRadius: t.radius.xl,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: t.color.textHigh,
  },
  headerRight: {
    width: 40,
  },
  userHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 24,
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
    fontWeight: '600',
    color: t.color.accent,
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: t.color.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: t.color.surface,
  },
  userName: {
    fontSize: 24,
    fontWeight: '700',
    color: t.color.textHigh,
    flex: 1,
  },
  premiumBanner: {
    marginHorizontal: 16,
    marginBottom: 32,
    borderRadius: t.radius.xxl,
    padding: 24,
    backgroundColor: t.color.accent,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  premiumHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  premiumLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    marginLeft: 8,
  },
  premiumTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 20,
  },
  premiumButton: {
    backgroundColor: t.color.surface,
    borderRadius: 9999,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignSelf: 'flex-start',
  },
  premiumButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: t.color.accent,
  },
  section: {
    marginBottom: 24,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: t.color.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  menuCard: {
    backgroundColor: t.color.surface,
    borderRadius: t.radius.lg,
    borderWidth: 1,
    borderColor: t.color.border,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  footerActions: {
    paddingHorizontal: 20,
    marginTop: 8,
    marginBottom: 24,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: t.color.surface,
    borderRadius: t.radius.lg,
    borderWidth: 1,
    borderColor: t.color.border,
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  actionButtonIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: t.color.inner,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  deleteIconContainer: {
    backgroundColor: '#FEE2E2',
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: t.color.textHigh,
  },
  deleteButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#EF4444',
  },
  versionText: {
    fontSize: 12,
    color: t.color.muted,
    textAlign: 'center',
    marginTop: 8,
  },
  timeItem: {
    backgroundColor: '#FFFFFF',
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
    fontSize: 14,
    color: '#111827',
    marginLeft: 8,
  },
  deleteTimeButton: {
    padding: 4,
  },
  addTimeButton: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  addTimeButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 68, // 与 MenuItem 的文字对齐
  },
  addTimeButtonText: {
    fontSize: 14,
    color: t.color.accent,
    marginLeft: 8,
    fontWeight: '500',
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
    fontSize: 16,
    color: t.color.muted,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: t.color.textHigh,
  },
  modalDoneText: {
    fontSize: 16,
    color: t.color.accent,
    fontWeight: '600',
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
    paddingVertical: 16,
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
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  cacheItemContent: {
    flex: 1,
  },
  cacheItemTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: t.color.textHigh,
    marginBottom: 2,
  },
  cacheItemSubtitle: {
    fontSize: 14,
    color: t.color.muted,
  },
  clearCacheButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

