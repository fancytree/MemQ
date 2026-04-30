import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// 配置通知行为
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * 请求通知权限
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.warn('Notification permissions not granted');
      return false;
    }

    // Android 需要额外的通知渠道设置
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('study-reminders', {
        name: 'Study Reminders',
        description: 'Reminders for your daily study sessions',
        importance: Notifications.AndroidImportance.HIGH,
        sound: 'default',
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
    }

    return true;
  } catch (error) {
    console.error('Error requesting notification permissions:', error);
    return false;
  }
}

/**
 * 取消所有已计划的提醒通知
 */
export async function cancelAllScheduledNotifications(): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    console.log('All scheduled notifications cancelled');
  } catch (error) {
    console.error('Error cancelling notifications:', error);
  }
}

/**
 * 获取所有已计划的通知
 */
export async function getAllScheduledNotifications(): Promise<Notifications.NotificationRequest[]> {
  try {
    return await Notifications.getAllScheduledNotificationsAsync();
  } catch (error) {
    console.error('Error getting scheduled notifications:', error);
    return [];
  }
}

/**
 * 计划每日提醒通知
 * @param times 时间数组，格式为 ["09:00", "18:00"]
 */
export async function scheduleDailyReminders(times: string[]): Promise<void> {
  try {
    // 先取消所有现有的通知
    await cancelAllScheduledNotifications();

    if (times.length === 0) {
      console.log('No reminder times provided, notifications cancelled');
      return;
    }

    // 请求权限
    const hasPermission = await requestNotificationPermissions();
    if (!hasPermission) {
      throw new Error('Notification permissions not granted');
    }

    // 为每个时间创建每日重复通知
    for (let i = 0; i < times.length; i++) {
      const timeStr = times[i];
      const [hours, minutes] = timeStr.split(':').map(Number);

      // 计划每日重复通知
      // 使用 DailyTriggerInput 类型，明确指定每日重复
      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: '📚 Time to Study!',
          body: 'Don\'t forget to review your vocabulary today!',
          sound: 'default',
          priority: Notifications.AndroidNotificationPriority.HIGH,
          data: {
            type: 'study-reminder',
            time: timeStr,
          },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: hours,
          minute: minutes,
        },
      });

      console.log(`Scheduled notification for ${timeStr} with ID: ${notificationId}`);
    }

    console.log(`Successfully scheduled ${times.length} daily reminder(s)`);
  } catch (error) {
    console.error('Error scheduling notifications:', error);
    throw error;
  }
}

/**
 * 更新通知计划（当用户修改设置时调用）
 */
export async function updateNotificationSchedule(
  enabled: boolean,
  times: string[]
): Promise<void> {
  try {
    if (!enabled || times.length === 0) {
      // 如果关闭或没有时间，取消所有通知
      await cancelAllScheduledNotifications();
      console.log('Notifications disabled or no times set, all notifications cancelled');
      return;
    }

    // 重新计划通知
    await scheduleDailyReminders(times);
  } catch (error) {
    console.error('Error updating notification schedule:', error);
    throw error;
  }
}

