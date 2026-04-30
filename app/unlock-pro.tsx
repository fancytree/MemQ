/**
 * Unlock MemQ Pro 全屏页面
 * 匹配 Figma 设计
 */

import { useSubscription } from '@/context/SubscriptionContext';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { safeBack } from '@/lib/safeBack';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import {
    Linking,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const APPLE_EULA_URL = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';

export default function UnlockProScreen() {
  const { showPaywallModal, setShowPaywallModal } = useSubscription();

  const handleStartFreeTrial = () => {
    // 直接打开 Paywall Modal，不关闭当前页面
    setShowPaywallModal(true);
  };

  const handleClose = () => {
    safeBack('/(tabs)/profile');
  };

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Header with Close Button */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
            <Feather name="x" size={24} color="#787496" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Title Section */}
        <View style={styles.titleSection}>
          <View style={styles.titleRow}>
            <View style={styles.iconContainer}>
              <Feather name="star" size={24} color="#4E49FC" />
            </View>
            <Text style={styles.title}>Unlock MemQ Pro</Text>
          </View>
          <Text style={styles.subtitle}>
            Break the limits and study without boundaries.
          </Text>
        </View>

        {/* Features */}
        <View style={styles.featuresContainer}>
          {/* Feature 1: Unlimited PDF Uploads */}
          <View style={styles.featureItem}>
            <View style={styles.featureIconContainer}>
              <Feather name="check" size={16} color="#008236" />
            </View>
            <View style={styles.featureContent}>
              <Text style={styles.featureTitle}>Unlimited PDF Uploads</Text>
              <Text style={styles.featureDescription}>
                Break the 5-file lifetime limit. Upload every lecture slide, textbook, and note without worrying about quotas.
              </Text>
            </View>
          </View>

          {/* Feature 2: Unlimited AI Chat */}
          <View style={styles.featureItem}>
            <View style={styles.featureIconContainer}>
              <Feather name="check" size={16} color="#008236" />
            </View>
            <View style={styles.featureContent}>
              <Text style={styles.featureTitle}>Unlimited AI Chat</Text>
              <Text style={styles.featureDescription}>
                Remove the 8-message daily cap. Ask follow-up questions freely until you fully understand the concept.
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Footer */}
      <SafeAreaView style={styles.footerContainer} edges={['bottom']}>
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            7-day free trial • Cancel anytime
          </Text>
          <TouchableOpacity 
            style={styles.startTrialButton}
            onPress={handleStartFreeTrial}
            activeOpacity={0.8}
          >
            <Text style={styles.startTrialButtonText}>Start Free Trial</Text>
          </TouchableOpacity>
          <View style={styles.legalLinks}>
            <TouchableOpacity onPress={() => Linking.openURL(APPLE_EULA_URL)}>
              <Text style={styles.legalLinkText}>Terms of Use (EULA)</Text>
            </TouchableOpacity>
            <Text style={styles.legalLinkSeparator}>|</Text>
            <TouchableOpacity onPress={() => router.push('/profile/privacy-policy')}>
              <Text style={styles.legalLinkText}>Privacy Policy</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  safeArea: {
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 24,
    paddingBottom: 24,
  },
  titleSection: {
    marginBottom: 24,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  iconContainer: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: '#4E49FC',
    letterSpacing: 0.0703,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: '400',
    color: '#737373',
    lineHeight: 25.6,
    letterSpacing: -0.3125,
  },
  featuresContainer: {
    gap: 16,
  },
  featureItem: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  featureIconContainer: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  featureContent: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#0A0A0A',
    lineHeight: 25.6,
    letterSpacing: -0.3125,
    marginBottom: 4,
  },
  featureDescription: {
    fontSize: 16,
    fontWeight: '400',
    color: '#6A7282',
    lineHeight: 25.6,
    letterSpacing: -0.3125,
  },
  footerContainer: {
    backgroundColor: '#FFFFFF',
  },
  footer: {
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 48,
    gap: 8,
  },
  footerText: {
    fontSize: 16,
    fontWeight: '400',
    color: '#6A7282',
    textAlign: 'center',
    lineHeight: 25.6,
    letterSpacing: -0.3125,
    marginBottom: 8,
  },
  startTrialButton: {
    backgroundColor: '#4E49FC',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  startTrialButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#FFFFFF',
    letterSpacing: -0.1504,
  },
  legalLinks: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  legalLinkText: {
    fontSize: 11,
    fontWeight: '400',
    color: '#9CA3AF',
    textDecorationLine: 'underline',
  },
  legalLinkSeparator: {
    fontSize: 11,
    color: '#D1D5DB',
  },
});
