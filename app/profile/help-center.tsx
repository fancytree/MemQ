import BackIcon from '@/components/icons/BackIcon';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import React, { useEffect } from 'react';
import {
    Linking,
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

export default function HelpCenterScreen() {
  const navigation = useNavigation();

  // 隐藏系统导航栏
  useEffect(() => {
    navigation.setOptions({
      headerShown: false,
    });
  }, [navigation]);

  // WhatsApp 联系链接（你可以使用短链接或自定义链接来保护隐私）
  // 例如：https://wa.me/your-number 的短链接，或者自定义域名的链接
  const whatsappLink = 'https://wa.me/YOUR_NUMBER'; // 请替换为你的 WhatsApp 链接或短链接

  // 或者使用二维码图片（如果已添加到 assets）
  const qrCodeImage = require('@/assets/images/whatsapp-qr.png');

  const handleOpenWhatsApp = async () => {
    try {
      const canOpen = await Linking.canOpenURL(whatsappLink);
      if (canOpen) {
        await Linking.openURL(whatsappLink);
      } else {
        // 备用方案：使用浏览器打开
        await Linking.openURL(whatsappLink);
      }
    } catch (error) {
      console.error('Error opening WhatsApp:', error);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backButtonHeader}
            activeOpacity={0.7}
          >
            <BackIcon size={20} color="#0A0A0A" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Help Center</Text>
          <View style={styles.headerRight} />
        </View>

        {/* Content */}
        <View style={styles.content}>
          <Text style={styles.title}>Need Help?</Text>
          <Text style={styles.description}>
            We're here to help! Contact us via WhatsApp for quick support.
          </Text>

          {/* WhatsApp Contact Button */}
          <TouchableOpacity
            style={styles.whatsappButton}
            onPress={handleOpenWhatsApp}
            activeOpacity={0.8}
          >
            <Feather name="message-circle" size={24} color="#FFFFFF" />
            <Text style={styles.whatsappButtonText}>Contact via WhatsApp</Text>
          </TouchableOpacity>

          {/* QR Code */}
          <View style={styles.qrCodeContainer}>
            <Text style={styles.qrCodeTitle}>Or scan the QR code</Text>
            <Image
              source={qrCodeImage}
              style={styles.qrCodeImage}
              contentFit="contain"
            />
          </View>

          {/* Alternative: Email Support */}
          <View style={styles.emailContainer}>
            <Text style={styles.emailLabel}>Email Support:</Text>
            <TouchableOpacity
              onPress={() => Linking.openURL('mailto:support@riverstudio.cc')}
            >
              <Text style={styles.emailLink}>support@riverstudio.cc</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
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
  backButtonHeader: {
    width: 40,
    height: 40,
    backgroundColor: 'rgba(120,116,150,0.08)',
    borderRadius: 16.4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  headerRight: {
    width: 40,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },
  description: {
    fontSize: 16,
    lineHeight: 24,
    color: '#6B7280',
    marginBottom: 32,
  },
  whatsappButton: {
    backgroundColor: '#25D366',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 32,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  whatsappButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  qrCodeContainer: {
    alignItems: 'center',
    marginBottom: 32,
    padding: 24,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
  },
  qrCodeTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16,
  },
  qrCodeImage: {
    width: 200,
    height: 200,
  },
  emailContainer: {
    padding: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    alignItems: 'center',
  },
  emailLabel: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 8,
  },
  emailLink: {
    fontSize: 16,
    color: '#6366F1',
    fontWeight: '600',
  },
});

