/**
 * Unlock MemQ Pro — 与全局 editorial 设计语言一致（JetBrains Mono + teal accent）
 */

import { SecondaryPageNav } from '@/components/SecondaryPageNav';
import { useSubscription } from '@/context/SubscriptionContext';
import { MemQTheme } from '@/constants/theme';
import { safeBack } from '@/lib/safeBack';
import { colors } from '@/theme';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
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

const t = MemQTheme;
const APPLE_EULA_URL = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';

export default function UnlockProScreen() {
  const { setShowPaywallModal } = useSubscription();

  const handleStartFreeTrial = () => {
    setShowPaywallModal(true);
  };

  const handleClose = () => {
    safeBack('/(tabs)/profile');
  };

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.safeTop} edges={['top']}>
        <SecondaryPageNav onBack={handleClose} backLabel="← Back" />
      </SafeAreaView>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={styles.badgeRow}>
            <View style={styles.badgeIcon}>
              <Feather name="zap" size={18} color={colors.accent} />
            </View>
            <Text style={styles.kicker}>MemQ Pro</Text>
          </View>
          <Text style={styles.title}>Unlock the full stack</Text>
          <Text style={styles.subtitle}>
            Break the limits and study without boundaries.
          </Text>
        </View>

        <View style={styles.features}>
          <View style={styles.featureItem}>
            <View style={styles.featureMark}>
              <Feather name="check" size={14} color={colors.green} />
            </View>
            <View style={styles.featureBody}>
              <Text style={styles.featureTitle}>Unlimited PDF uploads</Text>
              <Text style={styles.featureDescription}>
                Break the 5-file lifetime limit. Upload every lecture slide, textbook, and note
                without worrying about quotas.
              </Text>
            </View>
          </View>

          <View style={styles.featureItem}>
            <View style={styles.featureMark}>
              <Feather name="check" size={14} color={colors.green} />
            </View>
            <View style={styles.featureBody}>
              <Text style={styles.featureTitle}>Unlimited AI chat</Text>
              <Text style={styles.featureDescription}>
                Remove the 8-message daily cap. Ask follow-up questions freely until you fully
                understand the concept.
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      <SafeAreaView style={styles.footerWrap} edges={['bottom']}>
        <View style={styles.footer}>
          <Text style={styles.footerHint}>7-day free trial · Cancel anytime</Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleStartFreeTrial}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryButtonText}>Start free trial</Text>
          </TouchableOpacity>
          <View style={styles.legalRow}>
            <TouchableOpacity onPress={() => Linking.openURL(APPLE_EULA_URL)}>
              <Text style={styles.legalLink}>Terms of Use (EULA)</Text>
            </TouchableOpacity>
            <Text style={styles.legalSep}>|</Text>
            <TouchableOpacity onPress={() => router.push('/profile/privacy-policy')}>
              <Text style={styles.legalLink}>Privacy Policy</Text>
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
    backgroundColor: colors.bg,
  },
  safeTop: {
    backgroundColor: colors.bg,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: t.space.pageX,
    paddingTop: t.space.sm,
    paddingBottom: t.space.lg,
  },
  hero: {
    marginBottom: t.space.xl,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: t.space.md,
  },
  badgeIcon: {
    width: 36,
    height: 36,
    borderRadius: t.radius.md,
    backgroundColor: colors.accentL,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kicker: {
    fontSize: 11,
    fontFamily: 'JetBrainsMono_500',
    fontWeight: '500',
    letterSpacing: 0.45,
    textTransform: 'uppercase',
    color: colors.muted,
  },
  title: {
    fontSize: 22,
    lineHeight: 28,
    fontFamily: 'JetBrainsMono_800',
    fontWeight: '800',
    letterSpacing: -0.6,
    color: colors.text,
    marginBottom: t.space.sm,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 22,
    fontFamily: 'JetBrainsMono_400',
    fontWeight: '400',
    color: colors.sub,
  },
  features: {
    gap: t.space.lg,
  },
  featureItem: {
    flexDirection: 'row',
    gap: t.space.md,
    alignItems: 'flex-start',
  },
  featureMark: {
    width: 28,
    height: 28,
    borderRadius: t.radius.md,
    backgroundColor: colors.greenL,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  featureBody: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 15,
    lineHeight: 22,
    fontFamily: 'JetBrainsMono_600',
    fontWeight: '600',
    letterSpacing: -0.35,
    color: colors.text,
    marginBottom: 4,
  },
  featureDescription: {
    fontSize: 13,
    lineHeight: 20,
    fontFamily: 'JetBrainsMono_400',
    fontWeight: '400',
    color: colors.sub,
  },
  footerWrap: {
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footer: {
    paddingHorizontal: t.space.pageX,
    paddingTop: t.space.md,
    // 底部仅依赖 SafeAreaView（Home Indicator），不再额外垫高
    paddingBottom: 0,
    gap: t.space.sm,
  },
  footerHint: {
    fontSize: 13,
    lineHeight: 20,
    fontFamily: 'JetBrainsMono_400',
    fontWeight: '400',
    color: colors.muted,
    textAlign: 'center',
    marginBottom: 4,
  },
  primaryButton: {
    backgroundColor: colors.accent,
    borderRadius: t.radius.lg,
    paddingVertical: 16,
    paddingHorizontal: t.space.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  primaryButtonText: {
    fontSize: 14,
    fontFamily: 'JetBrainsMono_700',
    fontWeight: '400',
    color: '#FFFFFF',
  },
  legalRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    paddingBottom: 0,
  },
  legalLink: {
    fontSize: 11,
    fontFamily: 'JetBrainsMono_400',
    fontWeight: '400',
    color: colors.muted,
    textDecorationLine: 'underline',
  },
  legalSep: {
    fontSize: 11,
    color: colors.dim,
    fontFamily: 'JetBrainsMono_400',
  },
});
