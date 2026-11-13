/**
 * PaywallModal — what each plan costs, and the purchase itself.
 *
 * Drawn in the language the rest of the app is drawn in: the gradient and the two
 * drifting hills behind it, and surfaces that are a coloured shell with a lighter face
 * sitting on it, the band along the bottom edge standing in for a shadow
 * (theme/ledge.ts). It was the older editorial style — hairline rules, outlined boxes,
 * a flat filled button — which made the screen that asks for money the one screen that
 * did not look like the app.
 */

import { HomeAsset } from '@/components/HomeAsset';
import { MascotCharacter } from '@/components/mascot/MascotCharacter';
import { useSubscription } from '@/context/SubscriptionContext';
import { supabase } from '@/lib/supabase';
import { homeColors } from '@/theme/colors';
import { ledge } from '@/theme/ledge';
import { layout } from '@/theme/spacing';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Purchases, { CustomerInfo, PurchasesOffering, PurchasesPackage } from 'react-native-purchases';
import { SafeAreaView } from 'react-native-safe-area-context';

const APPLE_EULA_URL = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';

/** One plan: a shell with a lighter face on it, so it reads as a thing you can press
 *  rather than an outlined box. Chosen, the shell darkens and the face takes the pale
 *  purple — the same move a chosen chip makes on the first run. */
function PlanCard({ title, price, unit, badge, selected, onPress }: {
  title: string;
  price: string;
  unit: string;
  badge?: string | null;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity accessibilityRole="button" accessibilityState={{ selected }}
      style={[styles.plan, selected && styles.planOn]} onPress={onPress} activeOpacity={0.9}>
      <View style={[styles.planFace, selected && styles.planFaceOn]}>
        <View style={styles.planLeft}>
          <View style={styles.planHead}>
            <Text style={styles.planTitle}>{title}</Text>
            {!!badge && (
              <View style={styles.badge}><Text style={styles.badgeText}>{badge}</Text></View>
            )}
          </View>
          <View style={styles.priceRow}>
            <Text style={styles.price}>{price}</Text>
            <Text style={styles.priceUnit}>{unit}</Text>
          </View>
        </View>
        <View style={[styles.tick, selected ? styles.tickOn : styles.tickOff]}>
          {selected && <Feather name="check" size={13} color={homeColors.white} />}
        </View>
      </View>
    </TouchableOpacity>
  );
}

/** RevenueCat Dashboard 的 Offering ID；若改名则回退到 current 或任意含套餐的 Offering（避免审核/线上空白） */
const PREFERRED_OFFERING_ID = 'default';

/** 将 SDK 原始错误转为对用户可读的英文提示（项目 UI 为英文） */
function userFacingLoadError(raw: string): string {
  if (/invalid\s+api\s*key/i.test(raw)) {
    return (
      'Subscription service could not verify the app configuration. ' +
      'Please install the latest build from the developer. ' +
      'If this persists, contact support.'
    );
  }
  return raw;
}

function pickBestOffering(offerings: {
  all: Record<string, PurchasesOffering>;
  current: PurchasesOffering | null;
}): PurchasesOffering | null {
  const preferred = offerings.all[PREFERRED_OFFERING_ID];
  if (preferred?.availablePackages?.length) return preferred;
  if (offerings.current?.availablePackages?.length) return offerings.current;
  for (const id of Object.keys(offerings.all)) {
    const o = offerings.all[id];
    if (o?.availablePackages?.length) return o;
  }
  if (preferred) return preferred;
  if (offerings.current) return offerings.current;
  const keys = Object.keys(offerings.all);
  return keys.length ? offerings.all[keys[0]] ?? null : null;
}

interface PaywallModalProps {
  visible: boolean;
  onClose: () => void;
}

export default function PaywallModal({ visible, onClose }: PaywallModalProps) {
  const { isPro, refreshSubscriptionStatus } = useSubscription();
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'yearly' | null>(null);

  // 加载 offerings
  useEffect(() => {
    if (visible) {
      loadOfferings();
    }
  }, [visible]);

  // 如果用户已经是 Pro，关闭 Paywall
  useEffect(() => {
    if (visible && isPro) {
      onClose();
    }
  }, [visible, isPro, onClose]);

  // 自动选择 Yearly 套餐（默认选中）
  useEffect(() => {
    if (offering && offering.availablePackages.length > 0 && !selectedPlan) {
      const yearlyPackage = offering.availablePackages.find((pkg: PurchasesPackage) => {
        const identifier = pkg.identifier.toLowerCase();
        return identifier.includes('yearly') || identifier.includes('year') || identifier.includes('annual');
      });
      setSelectedPlan(yearlyPackage ? 'yearly' : 'monthly');
    }
  }, [offering, selectedPlan]);

  const [loadError, setLoadError] = useState<string | null>(null);

  const loadOfferings = async () => {
    setLoading(true);
    setLoadError(null);
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const offerings = await Purchases.getOfferings();
        const info = await Purchases.getCustomerInfo();
        setCustomerInfo(info);
        const targetOffering = pickBestOffering(offerings);
        if (targetOffering) {
          setOffering(targetOffering);
          setLoading(false);
          return;
        }
        if (__DEV__) console.error('No offering with packages found.');
        setLoadError('No subscription packages available at this time.');
        setLoading(false);
        return;
      } catch (error: unknown) {
        lastError = error;
        if (__DEV__) console.error('Error loading offerings:', error);
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
        }
      }
    }
    const rawMsg =
      lastError instanceof Error
        ? lastError.message
        : 'Failed to load subscription options. Please try again.';
    setLoadError(userFacingLoadError(rawMsg));
    setLoading(false);
  };

  const handlePurchase = async () => {
    if (!offering || !selectedPlan) return;

    const selectedPackage = offering.availablePackages.find((pkg: PurchasesPackage) => {
      const identifier = pkg.identifier.toLowerCase();
      if (selectedPlan === 'yearly') {
        return identifier.includes('yearly') || identifier.includes('year') || identifier.includes('annual');
      } else {
        return identifier.includes('monthly') || identifier.includes('month');
      }
    });

    if (!selectedPackage) {
      Alert.alert('Error', 'Selected plan not available.');
      return;
    }

    try {
      setPurchasing(selectedPackage.identifier);

      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        Alert.alert(
          'Authentication Required',
          'Please log in to complete your purchase.'
        );
        setPurchasing(null);
        return;
      }

      const { customerInfo: updatedInfo } = await Purchases.purchasePackage(selectedPackage);

      setCustomerInfo(updatedInfo);
      await refreshSubscriptionStatus();

      Alert.alert(
        'Success!',
        'Your subscription is now active. Thank you for subscribing!',
        [{ text: 'OK', onPress: onClose }]
      );
    } catch (error: any) {
      // 用户取消购买 - 静默处理
      const isUserCancelled =
        error.userCancelled ||
        error.code === '1' ||
        error.message?.includes('cancelled') ||
        error.message?.includes('Purchase was cancelled');

      if (isUserCancelled) {
        setPurchasing(null);
        return;
      }

      if (__DEV__) {
        console.error('Purchase error:', error);
      }
      Alert.alert(
        'Purchase Failed',
        error.message || 'An error occurred during purchase. Please try again.',
        [{ text: 'OK' }]
      );
      setPurchasing(null);
    }
  };

  const getMonthlyPackage = (): PurchasesPackage | null => {
    if (!offering) return null;
    return (
      offering.availablePackages.find((pkg: PurchasesPackage) => {
        const identifier = pkg.identifier.toLowerCase();
        return identifier.includes('monthly') || identifier.includes('month');
      }) || null
    );
  };

  const getYearlyPackage = (): PurchasesPackage | null => {
    if (!offering) return null;
    return (
      offering.availablePackages.find((pkg: PurchasesPackage) => {
        const identifier = pkg.identifier.toLowerCase();
        return identifier.includes('yearly') || identifier.includes('year') || identifier.includes('annual');
      }) || null
    );
  };

  const monthlyPackage = getMonthlyPackage();
  const yearlyPackage = getYearlyPackage();

  // 计算节省百分比（用于显示 "Save 30%"）
  const calculateSavings = () => {
    if (!monthlyPackage || !yearlyPackage) return null;
    const monthlyPrice = monthlyPackage.product.price;
    const yearlyPrice = yearlyPackage.product.price;
    if (monthlyPrice > 0) {
      const monthlyYearlyTotal = monthlyPrice * 12;
      const savings = ((monthlyYearlyTotal - yearlyPrice) / monthlyYearlyTotal) * 100;
      return Math.round(savings);
    }
    return null;
  };

  const savingsPercent = calculateSavings();

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
      onRequestClose={onClose}
      transparent={false}
    >
      <View style={styles.sheetBackdrop}>
        <StatusBar style="dark" />
        <LinearGradient pointerEvents="none"
          colors={[homeColors.gradientStart, homeColors.gradientBright, homeColors.gradientSoft, homeColors.canvas]}
          locations={[0, 0.21154, 0.44712, 1]}
          style={styles.background} />
        {/* Two hills, not one: a single one ends on a straight horizontal edge partway
            down, which reads as the background stopping rather than as a landscape. */}
        <View pointerEvents="none" style={styles.waveBack}><HomeAsset name="waveBack" /></View>
        <View pointerEvents="none" style={styles.waveFront}><HomeAsset name="waveFront" /></View>

        <SafeAreaView style={styles.sheet} edges={['top', 'bottom']}>
          <View style={styles.toolbar}>
            <View style={styles.grabber} />

            <View style={styles.toolbarContent}>
              <TouchableOpacity accessibilityLabel="Close" onPress={onClose} style={styles.closeButton} accessibilityRole="button">
                <View style={styles.closeFace}>
                  <Feather name="x" size={22} color={homeColors.deep} />
                </View>
              </TouchableOpacity>

              <View style={styles.titleContainer}>
                <Text style={styles.title}>Choose your plan</Text>
              </View>
            </View>
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={homeColors.primary} />
              <Text style={styles.loadingText}>Loading subscription options…</Text>
            </View>
          ) : offering ? (
            <View style={styles.contentContainer}>
              {/* The character, filling the room above the plans, and answering what
                  is chosen under it: pleased at the year, which is the one that saves
                  money, plainly waiting at the month, and wearing the question mark
                  while neither has been picked. A black wordmark stood here,
                  left over from the older style — the one mark on the sheet that did
                  not belong to this palette, floating in an empty band.

                  No paws. It is standing over the plans rather than holding them, and
                  paws reaching out of a frame nothing fills read as a crop. */}
              <View style={styles.logoContainer}>
                <MascotCharacter width={168} hands={false} calm
                  mood={selectedPlan === 'yearly' ? 'happy' : selectedPlan === 'monthly' ? 'idle' : 'thinking'} />
              </View>

              {/* Plan Options + Footer */}
              <View style={styles.bottomSection}>
              <View style={styles.plansContainer}>
                {yearlyPackage && (
                  <PlanCard
                    title="MemQ Pro Yearly"
                    price={yearlyPackage.product.priceString}
                    unit="/year"
                    badge={savingsPercent ? `Save ${savingsPercent}%` : null}
                    selected={selectedPlan === 'yearly'}
                    onPress={() => setSelectedPlan('yearly')} />
                )}

                {monthlyPackage && (
                  <PlanCard
                    title="MemQ Pro Monthly"
                    price={monthlyPackage.product.priceString}
                    unit="/month"
                    selected={selectedPlan === 'monthly'}
                    onPress={() => setSelectedPlan('monthly')} />
                )}
              </View>

              {/* Footer：定价摘要 → 合规说明 → 主 CTA → 恢复购买 */}
              <View style={styles.footer}>
                <View style={styles.footerCopy}>
                  <Text style={styles.footerLead}>
                    {selectedPlan === 'monthly'
                      ? `7 days on us, then ${monthlyPackage?.product.priceString || '$5.99'}/month`
                      : `7 days on us, then ${yearlyPackage?.product.priceString || '$49.99'}/year`}
                  </Text>
                  <Text style={styles.autoRenewText}>
                    Auto-renews. Cancel in App Store settings at least 24 hours before renewal.
                  </Text>
                </View>

                <TouchableOpacity accessibilityRole="button"
                  style={[
                    styles.subscribeButton,
                    (!selectedPlan || purchasing) && styles.subscribeButtonDisabled,
                  ]}
                  onPress={handlePurchase}
                  disabled={!selectedPlan || !!purchasing}
                  activeOpacity={0.8}
                >
                  <View style={styles.subscribeFace}>
                    {purchasing ? (
                      <View style={styles.subscribeButtonContent}>
                        <ActivityIndicator size="small" color={homeColors.white} />
                        <Text style={styles.subscribeButtonText}>Processing…</Text>
                      </View>
                    ) : (
                      <Text style={styles.subscribeButtonText}>Start free trial</Text>
                    )}
                  </View>
                </TouchableOpacity>

                <TouchableOpacity accessibilityRole="button"
                  onPress={async () => {
                    try {
                      await Purchases.restorePurchases();
                      await refreshSubscriptionStatus();
                      Alert.alert('Success', 'Purchases restored successfully.');
                    } catch (error) {
                      Alert.alert('Error', 'No purchases found to restore.');
                    }
                  }}
                  style={styles.restoreButton}
                >
                  <Text style={styles.restoreButtonText}>Restore purchases</Text>
                </TouchableOpacity>
              </View>

              {/* 法律链接贴底：仅保留 SafeAreaView 的 Home Indicator 间距，不再额外垫高 */}
              <View style={styles.legalLinks}>
                <TouchableOpacity accessibilityRole="button" onPress={() => Linking.openURL(APPLE_EULA_URL)}>
                  <Text style={styles.legalLinkText}>Terms of Use (EULA)</Text>
                </TouchableOpacity>
                <Text style={styles.legalLinkSeparator}>|</Text>
                <TouchableOpacity accessibilityRole="button" onPress={() => { onClose(); router.push('/profile/privacy-policy'); }}>
                  <Text style={styles.legalLinkText}>Privacy Policy</Text>
                </TouchableOpacity>
              </View>
              </View>
            </View>
          ) : (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{loadError || 'No subscription options available.'}</Text>
              <TouchableOpacity accessibilityRole="button" onPress={loadOfferings} style={styles.errorButton}>
                <View style={styles.errorButtonFace}>
                  <Text style={styles.errorButtonText}>Retry</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity accessibilityRole="button" onPress={onClose} style={styles.restoreButton}>
                <Text style={styles.restoreButtonText}>Close</Text>
              </TouchableOpacity>
            </View>
          )}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheetBackdrop: { flex: 1, backgroundColor: homeColors.canvas },
  background: { position: 'absolute', top: 0, left: 0, right: 0, height: 874 },
  waveBack: { position: 'absolute', top: 113, left: -19 },
  waveFront: { position: 'absolute', top: 150, left: -19 },
  // Transparent, so the hills behind it are the sheet's own background rather than
  // something glimpsed around a white panel.
  sheet: { flex: 1 },

  toolbar: { paddingTop: 8, paddingBottom: 12 },
  grabber: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: homeColors.border, alignSelf: 'center', marginBottom: 14,
  },
  toolbarContent: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: layout.screenInline, position: 'relative',
  },
  // A small control, so it carries the shallowest lip of the three.
  closeButton: {
    width: 44, height: 42 + ledge.control, borderRadius: 22,
    backgroundColor: homeColors.border, paddingBottom: ledge.control,
  },
  closeFace: {
    flex: 1, borderRadius: 22, backgroundColor: homeColors.white,
    alignItems: 'center', justifyContent: 'center',
  },
  titleContainer: {
    position: 'absolute', left: 0, right: 0, alignItems: 'center', justifyContent: 'center',
  },
  title: {
    fontFamily: 'Geist_700Bold', fontSize: 20, lineHeight: 26,
    letterSpacing: -0.5, color: homeColors.darkest,
  },

  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 48 },
  loadingText: {
    marginTop: 20, fontFamily: 'Geist_500Medium', fontSize: 15,
    color: homeColors.muted, textAlign: 'center',
  },

  contentContainer: { flex: 1, paddingHorizontal: layout.screenInline },
  logoContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 20 },
  bottomSection: { paddingBottom: 0 },
  plansContainer: { gap: 12, marginBottom: 18 },

  // A shell with a lighter face on it, offset so a band of the shell shows along the
  // bottom edge. In a palette with no shadows that band is the only depth there is.
  plan: {
    borderRadius: 24, backgroundColor: homeColors.border, paddingBottom: ledge.raised,
  },
  planOn: { backgroundColor: homeColors.deep },
  planFace: {
    borderRadius: 24, backgroundColor: homeColors.white,
    paddingVertical: 16, paddingHorizontal: 18,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  planFaceOn: { backgroundColor: homeColors.track },
  planLeft: { flex: 1, gap: 4 },
  planHead: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  planTitle: {
    fontFamily: 'Geist_600SemiBold', fontSize: 17, lineHeight: 24, color: homeColors.darkest,
  },
  // The hills' own yellow, which is what this palette shouts with.
  badge: {
    paddingHorizontal: 9, paddingVertical: 3, borderRadius: 100,
    backgroundColor: homeColors.hill,
  },
  badgeText: {
    fontFamily: 'Geist_600SemiBold', fontSize: 12, lineHeight: 16, color: homeColors.darkest,
  },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 5 },
  price: {
    fontFamily: 'Oswald_600SemiBold', fontSize: 26, lineHeight: 32, color: homeColors.deep,
  },
  priceUnit: {
    fontFamily: 'Geist_500Medium', fontSize: 14, color: homeColors.muted,
  },
  tick: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  tickOn: { backgroundColor: homeColors.primary },
  tickOff: { backgroundColor: homeColors.border },

  footer: { paddingTop: 2 },
  footerCopy: { marginBottom: 16, gap: 4 },
  footerLead: {
    fontFamily: 'Geist_600SemiBold', fontSize: 16, lineHeight: 22,
    color: homeColors.darkest, textAlign: 'center',
  },
  autoRenewText: {
    fontFamily: 'Geist_400Regular', fontSize: 12, lineHeight: 17,
    color: homeColors.muted, textAlign: 'center',
  },

  // The one thing the sheet wants pressed, so it carries the deepest lip.
  subscribeButton: {
    height: 59 + ledge.lead, borderRadius: 42,
    backgroundColor: homeColors.deep, paddingBottom: ledge.lead,
  },
  subscribeFace: {
    flex: 1, borderRadius: 42, backgroundColor: homeColors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  subscribeButtonDisabled: { opacity: 0.45 },
  subscribeButtonContent: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  subscribeButtonText: {
    fontFamily: 'Geist_500Medium', fontSize: 22, lineHeight: 30, color: homeColors.white,
  },

  restoreButton: { minHeight: 44, paddingVertical: 10, alignItems: 'center' },
  restoreButtonText: {
    fontFamily: 'Geist_500Medium', fontSize: 14, color: homeColors.muted,
  },

  legalLinks: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, paddingTop: 4,
  },
  legalLinkText: {
    fontFamily: 'Geist_400Regular', fontSize: 13, color: homeColors.muted,
    textDecorationLine: 'underline',
  },
  legalLinkSeparator: {
    fontFamily: 'Geist_400Regular', fontSize: 13, color: homeColors.muted,
  },

  errorContainer: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 48, gap: 20,
  },
  errorText: {
    fontFamily: 'Geist_500Medium', fontSize: 15, lineHeight: 22,
    color: homeColors.deep, textAlign: 'center',
  },
  errorButton: {
    height: 50 + ledge.lead, borderRadius: 42, minWidth: 160,
    backgroundColor: homeColors.deep, paddingBottom: ledge.lead,
  },
  errorButtonFace: {
    flex: 1, borderRadius: 42, backgroundColor: homeColors.primary,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24,
  },
  errorButtonText: {
    fontFamily: 'Geist_500Medium', fontSize: 18, lineHeight: 24, color: homeColors.white,
  },
});
