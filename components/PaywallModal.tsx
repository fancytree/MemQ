/**
 * PaywallModal — 套餐选择与购买（与全局 editorial + JetBrains Mono 一致）
 */

import Logo from '@/components/icons/Logo';
import { useSubscription } from '@/context/SubscriptionContext';
import { MemQTheme } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { colors } from '@/theme';
import { Feather } from '@expo/vector-icons';
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
const t = MemQTheme;

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

        <SafeAreaView style={styles.sheet} edges={['top', 'bottom']}>
          <View style={styles.toolbar}>
            <View style={styles.grabber} />

            <View style={styles.toolbarContent}>
              <TouchableOpacity onPress={onClose} style={styles.closeButton} accessibilityRole="button">
                <Feather name="x" size={22} color={colors.muted} />
              </TouchableOpacity>

              <View style={styles.titleContainer}>
                <Text style={styles.title}>Choose your plan</Text>
              </View>
            </View>
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.accent} />
              <Text style={styles.loadingText}>Loading subscription options…</Text>
            </View>
          ) : offering ? (
            <View style={styles.contentContainer}>
              {/* Logo - fills remaining space */}
              <View style={styles.logoContainer}>
                <Logo width={112} />
              </View>

              {/* Plan Options + Footer */}
              <View style={styles.bottomSection}>
              <View style={styles.plansContainer}>
                {/* Yearly Option */}
                {yearlyPackage && (
                  <TouchableOpacity
                    style={[
                      styles.planCard,
                      styles.planCardYearly,
                      selectedPlan === 'yearly' ? styles.planCardSelected : styles.planCardUnselected,
                    ]}
                    onPress={() => setSelectedPlan('yearly')}
                    activeOpacity={0.7}
                  >
                    <View style={styles.planCardContent}>
                      <View style={styles.planCardLeft}>
                        <View style={styles.planCardHeader}>
                          <Text style={styles.planCardTitle}>MemQ Pro Yearly</Text>
                          {savingsPercent && (
                            <View style={styles.savingsBadge}>
                              <Text style={styles.savingsBadgeText}>Save {savingsPercent}%</Text>
                            </View>
                          )}
                        </View>
                        <View style={styles.planCardPriceRow}>
                          <Text style={styles.planCardPrice}>
                            {yearlyPackage.product.priceString}
                          </Text>
                          <Text style={styles.planCardPriceUnit}>/year</Text>
                        </View>
                      </View>
                      
                      {/* 选中图标 */}
                      <View style={[
                        styles.planCardCheckbox,
                        selectedPlan === 'yearly' ? styles.planCardCheckboxSelected : styles.planCardCheckboxUnselected,
                      ]}>
                        {selectedPlan === 'yearly' && (
                          <Feather name="check" size={12} color="#FFFFFF" />
                        )}
                      </View>
                    </View>
                  </TouchableOpacity>
                )}

                {/* Monthly Option */}
                {monthlyPackage && (
                  <TouchableOpacity
                    style={[
                      styles.planCard,
                      styles.planCardMonthly,
                      selectedPlan === 'monthly' ? styles.planCardSelectedMonthly : styles.planCardUnselected,
                    ]}
                    onPress={() => setSelectedPlan('monthly')}
                    activeOpacity={0.7}
                  >
                    <View style={styles.planCardContent}>
                      <View style={styles.planCardLeft}>
                        <View style={styles.planCardHeader}>
                          <Text style={styles.planCardTitle}>MemQ Pro Monthly</Text>
                        </View>
                        <View style={styles.planCardPriceRow}>
                          <Text style={styles.planCardPrice}>
                            {monthlyPackage.product.priceString}
                          </Text>
                          <Text style={styles.planCardPriceUnit}>/month</Text>
                        </View>
                      </View>
                      
                      {/* 选中图标 */}
                      <View style={[
                        styles.planCardCheckbox,
                        selectedPlan === 'monthly' ? styles.planCardCheckboxSelected : styles.planCardCheckboxUnselected,
                      ]}>
                        {selectedPlan === 'monthly' && (
                          <Feather name="check" size={12} color="#FFFFFF" />
                        )}
                      </View>
                    </View>
                  </TouchableOpacity>
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

                <TouchableOpacity
                  style={[
                    styles.subscribeButton,
                    (!selectedPlan || purchasing) && styles.subscribeButtonDisabled,
                  ]}
                  onPress={handlePurchase}
                  disabled={!selectedPlan || !!purchasing}
                  activeOpacity={0.8}
                >
                  {purchasing ? (
                    <View style={styles.subscribeButtonContent}>
                      <ActivityIndicator size="small" color="#FFFFFF" />
                      <Text style={styles.subscribeButtonText}>Processing…</Text>
                    </View>
                  ) : (
                    <Text style={styles.subscribeButtonText}>Start free trial</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
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
                <TouchableOpacity onPress={() => Linking.openURL(APPLE_EULA_URL)}>
                  <Text style={styles.legalLinkText}>Terms of Use (EULA)</Text>
                </TouchableOpacity>
                <Text style={styles.legalLinkSeparator}>|</Text>
                <TouchableOpacity onPress={() => { onClose(); router.push('/profile/privacy-policy'); }}>
                  <Text style={styles.legalLinkText}>Privacy Policy</Text>
                </TouchableOpacity>
              </View>
              </View>
            </View>
          ) : (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{loadError || 'No subscription options available.'}</Text>
              <TouchableOpacity onPress={loadOfferings} style={styles.errorButton}>
                <Text style={styles.errorButtonText}>Retry</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onClose} style={styles.restoreButton}>
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
  sheetBackdrop: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  sheet: {
    flex: 1,
    backgroundColor: colors.surf,
    borderTopLeftRadius: t.radius.xxl,
    borderTopRightRadius: t.radius.xxl,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    shadowColor: colors.accentShadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
  },
  toolbar: {
    paddingTop: t.space.xs,
    paddingBottom: t.space.sm,
    backgroundColor: colors.surf,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderS,
  },
  grabber: {
    width: 40,
    height: 4,
    backgroundColor: colors.dim,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: t.space.md,
  },
  toolbarContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: t.space.pageX,
    position: 'relative',
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: t.radius.lg,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 17,
    fontFamily: 'JetBrainsMono_700',
    fontWeight: '400',
    letterSpacing: -0.4,
    color: colors.text,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 48,
  },
  loadingText: {
    marginTop: t.space.lg,
    fontSize: 14,
    fontFamily: 'JetBrainsMono_400',
    color: colors.muted,
    textAlign: 'center',
  },
  contentContainer: {
    flex: 1,
    paddingHorizontal: t.space.pageX,
  },
  logoContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: t.space.lg,
  },
  bottomSection: {
    paddingBottom: 0,
  },
  plansContainer: {
    gap: t.space.md,
    marginBottom: t.space.md,
  },
  planCard: {
    borderRadius: t.radius.xl,
    padding: t.space.lg,
    borderWidth: 1,
  },
  planCardYearly: {
    backgroundColor: colors.accentL,
  },
  planCardMonthly: {
    backgroundColor: colors.surf,
  },
  planCardSelected: {
    backgroundColor: colors.accentL,
    borderColor: colors.accent,
  },
  planCardUnselected: {
    backgroundColor: colors.surf,
    borderColor: colors.border,
  },
  planCardSelectedMonthly: {
    backgroundColor: colors.surf,
    borderColor: colors.accent,
  },
  planCardContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  planCardLeft: {
    flex: 1,
  },
  planCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
    flexWrap: 'wrap',
  },
  planCardTitle: {
    fontSize: 15,
    fontFamily: 'JetBrainsMono_600',
    fontWeight: '400',
    letterSpacing: -0.35,
    color: colors.text,
  },
  savingsBadge: {
    backgroundColor: colors.greenL,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: t.radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  savingsBadgeText: {
    fontSize: 11,
    fontFamily: 'JetBrainsMono_500',
    color: colors.green,
    lineHeight: 14,
  },
  planCardPriceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  planCardPrice: {
    fontSize: 16,
    fontFamily: 'JetBrainsMono_700',
    fontWeight: '400',
    letterSpacing: -0.35,
    color: colors.accent,
  },
  planCardPriceUnit: {
    fontSize: 13,
    fontFamily: 'JetBrainsMono_500',
    fontWeight: '400',
    color: colors.muted,
    letterSpacing: -0.2,
  },
  planCardCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planCardCheckboxUnselected: {
    backgroundColor: 'transparent',
    borderColor: colors.border,
  },
  planCardCheckboxSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  footer: {
    paddingTop: t.space.md,
    gap: 0,
  },
  // 定价 + 合规：两行贴近；与下方主按钮仍用 marginBottom 拉开
  footerCopy: {
    marginBottom: t.space.lg,
    gap: 3,
    paddingHorizontal: 4,
  },
  footerLead: {
    fontSize: 15,
    fontFamily: 'JetBrainsMono_600',
    fontWeight: '400',
    letterSpacing: -0.35,
    color: colors.text,
    textAlign: 'center',
    lineHeight: 20,
  },
  autoRenewText: {
    fontSize: 11,
    fontFamily: 'JetBrainsMono_400',
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 14,
    paddingHorizontal: t.space.xs,
  },
  subscribeButton: {
    backgroundColor: colors.accent,
    borderRadius: t.radius.lg,
    paddingVertical: 16,
    paddingHorizontal: t.space.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 0,
  },
  subscribeButtonDisabled: {
    opacity: 0.5,
  },
  subscribeButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  subscribeButtonText: {
    fontSize: 14,
    fontFamily: 'JetBrainsMono_700',
    fontWeight: '400',
    color: '#FFFFFF',
    letterSpacing: -0.15,
  },
  restoreButton: {
    paddingVertical: 4,
    alignItems: 'center',
    marginTop: 2,
    marginBottom: 0,
  },
  restoreButtonText: {
    fontSize: 12,
    fontFamily: 'JetBrainsMono_500',
    fontWeight: '400',
    color: colors.muted,
    letterSpacing: -0.15,
  },
  legalLinks: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingTop: 10,
    paddingBottom: 0,
  },
  legalLinkText: {
    fontSize: 11,
    fontFamily: 'JetBrainsMono_400',
    color: colors.muted,
    textDecorationLine: 'underline',
  },
  legalLinkSeparator: {
    fontSize: 11,
    color: colors.dim,
    fontFamily: 'JetBrainsMono_400',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 48,
  },
  errorText: {
    fontSize: 14,
    fontFamily: 'JetBrainsMono_400',
    color: colors.sub,
    marginBottom: 24,
    textAlign: 'center',
    lineHeight: 22,
  },
  errorButton: {
    backgroundColor: colors.accent,
    borderRadius: t.radius.lg,
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  errorButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'JetBrainsMono_700',
    fontWeight: '400',
  },
});
