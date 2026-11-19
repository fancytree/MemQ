import { Icon } from '@/components/ui/Icon';
import { oneLine } from '@/theme/typography';
import { Card } from '@/components/ui/Card';
import { LinearGradient } from 'expo-linear-gradient';
import { Button } from '@/components/ui/Button';
import { layout } from '@/theme/spacing';
import { fonts } from '@/theme/typography';
import { useNavigation } from 'expo-router/react-navigation';
import { safeBack } from '@/lib/safeBack';
import { SecondaryPageNav } from '@/components/SecondaryPageNav';
import { space, radius, type, colors } from '@/theme';
import React, { useEffect } from 'react';
import {
    Image,
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

  // WhatsApp 联系链接。用 wa.me/qr 短链而非手机号，避免号码暴露在客户端代码里。
  // 该短链与下方 assets/images/whatsapp-qr.png 二维码指向同一个账号。
  const whatsappLink = 'https://wa.me/qr/3WSKP2BYWGFDF1';

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
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <LinearGradient pointerEvents="none" colors={[colors.limePale, colors.limeBright, colors.bg]} locations={[0, 0.42, 1]} style={styles.pageGradient} />
      <SecondaryPageNav onBack={() => safeBack('/profile/settings')} />
      <ScrollView showsVerticalScrollIndicator={false}
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
          <Button size="md" label="Contact via WhatsApp" onPress={handleOpenWhatsApp} style={styles.whatsappButton}
            icon={<Icon name="message" size={20} color={colors.surf} />} />

          {/* QR Code */}
          <Card style={styles.qrCodeContainer} faceStyle={styles.centred}>
            <Text style={styles.qrCodeTitle}>Or scan the QR code</Text>
            <Image
              source={qrCodeImage}
              style={styles.qrCodeImage}
              resizeMode="contain"
            />
          </Card>

          {/* Alternative: Email Support */}
          <Card faceStyle={styles.centred}>
            <Text style={styles.emailLabel}>Email Support:</Text>
            <TouchableOpacity accessibilityRole="button"
              onPress={() => Linking.openURL('mailto:support@riverstudio.cc')}
            >
              <Text style={styles.emailLink}>support@riverstudio.cc</Text>
            </TouchableOpacity>
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  pageGradient: { position: 'absolute', top: 0, left: 0, right: 0, height: 250 },
  pageTitle: { ...type.title, color: colors.sub, marginHorizontal: layout.screenInline, marginBottom: space[5] },
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: space[10],
  },
  content: {
    paddingHorizontal: layout.screenInline,
    paddingTop: space[4],
  },
  title: {
    ...oneLine(type.title),
    color: colors.text,
    marginBottom: space[2],
  },
  description: {
    ...type.caption, fontFamily: fonts.regular,
    letterSpacing: -0.1,
    color: colors.sub,
    marginBottom: space[5],
  },
  whatsappButton: { marginBottom: space[5] },
  qrCodeContainer: { marginBottom: space[5] },
  centred: { alignItems: 'center' },
  qrCodeTitle: {
    ...type.caption,
    letterSpacing: -0.1,
    color: colors.text,
    marginBottom: space[3],
  },
  qrCodeImage: {
    width: 180,
    height: 180,
  },
  emailLabel: {
    ...type.caption, fontFamily: fonts.regular,
    letterSpacing: -0.1,
    color: colors.sub,
    marginBottom: space[2],
  },
  emailLink: {
    ...type.small, fontFamily: fonts.semibold,
    letterSpacing: -0.1,
    color: colors.action,
  },
});

