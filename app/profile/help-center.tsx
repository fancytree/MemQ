import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Image } from 'expo-image';
import { safeBack } from '@/lib/safeBack';
import { SecondaryPageNav } from '@/components/SecondaryPageNav';
import { colors } from '@/theme';
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
      <SecondaryPageNav onBack={() => safeBack('/(tabs)/profile')} />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
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
    backgroundColor: colors.bg,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  title: {
    fontSize: 20,
    lineHeight: 28,
    letterSpacing: -0.2,
    fontWeight: '400',
    fontFamily: 'JetBrainsMono_700',
    color: colors.text,
    marginBottom: 10,
  },
  description: {
    fontSize: 13,
    lineHeight: 20,
    letterSpacing: -0.1,
    fontFamily: 'JetBrainsMono_400',
    fontWeight: '400',
    color: colors.muted,
    marginBottom: 20,
  },
  whatsappButton: {
    backgroundColor: colors.accent,
    borderWidth: 1,
    borderColor: '#146B59',
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 20,
  },
  whatsappButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: -0.1,
    fontFamily: 'JetBrainsMono_700',
    fontWeight: '400',
  },
  qrCodeContainer: {
    alignItems: 'center',
    marginBottom: 20,
    padding: 16,
    backgroundColor: colors.surf,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  qrCodeTitle: {
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: -0.1,
    fontFamily: 'JetBrainsMono_500',
    fontWeight: '400',
    color: colors.text,
    marginBottom: 12,
  },
  qrCodeImage: {
    width: 180,
    height: 180,
  },
  emailContainer: {
    padding: 16,
    backgroundColor: colors.surf,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  emailLabel: {
    fontSize: 12,
    lineHeight: 17,
    letterSpacing: -0.1,
    fontFamily: 'JetBrainsMono_400',
    fontWeight: '400',
    color: colors.muted,
    marginBottom: 8,
  },
  emailLink: {
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: -0.1,
    fontFamily: 'JetBrainsMono_600',
    fontWeight: '400',
    color: colors.accent,
  },
});

