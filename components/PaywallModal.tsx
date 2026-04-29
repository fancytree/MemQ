/**
 * PaywallModal - Choose Your Plan
 * 基于 Figma 设计实现 (node-id: 87-3334)
 */

import Logo from '@/components/icons/Logo';
import { useSubscription } from '@/context/SubscriptionContext';
import { supabase } from '@/lib/supabase';
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
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import Purchases, { CustomerInfo, PurchasesOffering, PurchasesPackage } from 'react-native-purchases';
import { SafeAreaView } from 'react-native-safe-area-context';

const APPLE_EULA_URL = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';

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
      const yearlyPackage = offering.availablePackages.find(pkg => {
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

    const selectedPackage = offering.availablePackages.find(pkg => {
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
    return offering.availablePackages.find(pkg => {
      const identifier = pkg.identifier.toLowerCase();
      return identifier.includes('monthly') || identifier.includes('month');
    }) || null;
  };

  const getYearlyPackage = (): PurchasesPackage | null => {
    if (!offering) return null;
    return offering.availablePackages.find(pkg => {
      const identifier = pkg.identifier.toLowerCase();
      return identifier.includes('yearly') || identifier.includes('year') || identifier.includes('annual');
    }) || null;
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
      {/* 深色背景 */}
      <View style={styles.darkBackground}>
        <StatusBar style="light" />
        
        {/* 白色卡片 */}
        <SafeAreaView style={styles.sheet} edges={['top', 'bottom']}>
          {/* Toolbar */}
          <View style={styles.toolbar}>
            {/* Grabber */}
            <View style={styles.grabber} />
            
            {/* Title and Controls */}
            <View style={styles.toolbarContent}>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <Feather name="x" size={24} color="#787496" />
              </TouchableOpacity>
              
              <View style={styles.titleContainer}>
                <Text style={styles.title}>Choose Your Plan</Text>
              </View>
            </View>
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#4E49FC" />
              <Text style={styles.loadingText}>Loading subscription options...</Text>
            </View>
          ) : offering ? (
            <View style={styles.contentContainer}>
              {/* Logo - fills remaining space */}
              <View style={styles.logoContainer}>
                <Logo width={120} height={175} color="#4E49FC" />
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

              {/* Footer */}
              <View style={styles.footer}>
                <Text style={styles.footerText}>
                  {selectedPlan === 'monthly'
                    ? `${monthlyPackage?.product.priceString || '$5.99'}/month after 7-day free trial`
                    : `${yearlyPackage?.product.priceString || '$49.99'}/year after 7-day free trial`}
                </Text>
                <Text style={styles.autoRenewText}>
                  Subscription auto-renews. Cancel anytime at least 24 hours before the end of the current period in your App Store settings.
                </Text>
                
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
                      <Text style={styles.subscribeButtonText}>Processing...</Text>
                    </View>
                  ) : (
                    <Text style={styles.subscribeButtonText}>Try Free and Subscribe</Text>
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
                  <Text style={styles.restoreButtonText}>Restore Purchase</Text>
                </TouchableOpacity>

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
  darkBackground: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  sheet: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 15 },
    shadowOpacity: 0.18,
    shadowRadius: 75,
    elevation: 10,
    overflow: 'hidden',
  },
  toolbar: {
    paddingTop: 10,
    paddingBottom: 10,
    backgroundColor: '#FFFFFF',
  },
  grabber: {
    width: 36,
    height: 4,
    backgroundColor: '#E5E7EB',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  toolbarContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    position: 'relative',
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
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
    fontSize: 20,
    fontWeight: '600',
    color: '#0A0A0A',
    letterSpacing: 0.07,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 48,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666666',
  },
  contentContainer: {
    flex: 1,
    paddingHorizontal: 18,
  },
  logoContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomSection: {
    paddingBottom: 40,
  },
  plansContainer: {
    gap: 12,
    marginBottom: 12,
  },
  planCard: {
    borderRadius: 16.4,
    padding: 18,
    borderWidth: 1.846,
  },
  planCardYearly: {
    backgroundColor: '#FAF5FF',
  },
  planCardMonthly: {
    backgroundColor: '#FFFFFF',
  },
  planCardSelected: {
    backgroundColor: '#FAF5FF',
    borderColor: '#4E49FC',
  },
  planCardUnselected: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
  },
  planCardSelectedMonthly: {
    backgroundColor: '#FFFFFF',
    borderColor: '#4E49FC',
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
  },
  planCardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0A0A0A',
    letterSpacing: -0.44,
  },
  savingsBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 20,
  },
  savingsBadgeText: {
    fontSize: 12,
    fontWeight: '400',
    color: '#008236',
    lineHeight: 16,
  },
  planCardPriceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  planCardPrice: {
    fontSize: 16,
    fontWeight: '700',
    color: '#4E49FC',
    letterSpacing: -0.31,
  },
  planCardPriceUnit: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6A7282',
    letterSpacing: -0.15,
  },
  planCardCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.846,
    borderColor: '#4E49FC',
    backgroundColor: '#4E49FC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  planCardCheckboxUnselected: {
    backgroundColor: 'transparent',
    borderColor: '#D1D5DC',
  },
  planCardCheckboxSelected: {
    backgroundColor: '#4E49FC',
    borderColor: '#4E49FC',
  },
  footer: {
    gap: 8,
    paddingTop: 8,
  },
  footerText: {
    fontSize: 16,
    fontWeight: '400',
    color: '#6A7282',
    textAlign: 'center',
    letterSpacing: -0.31,
    lineHeight: 25.6,
  },
  autoRenewText: {
    fontSize: 11,
    fontWeight: '400',
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 16,
    paddingHorizontal: 8,
  },
  subscribeButton: {
    backgroundColor: '#4E49FC',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
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
    fontWeight: '500',
    color: '#FFFFFF',
    letterSpacing: -0.15,
  },
  restoreButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  restoreButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6A7282',
    letterSpacing: -0.31,
  },
  legalLinks: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 8,
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 48,
  },
  errorText: {
    fontSize: 16,
    color: '#666666',
    marginBottom: 24,
    textAlign: 'center',
  },
  errorButton: {
    backgroundColor: '#4E49FC',
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  errorButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
