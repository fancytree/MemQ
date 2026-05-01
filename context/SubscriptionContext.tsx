import {
  getRevenueCatAndroidApiKey,
  getRevenueCatDefaultApiKey,
  getRevenueCatIosApiKey,
} from '@/lib/revenuecatKeys';
import { supabase } from '@/lib/supabase';
import { router } from 'expo-router';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Alert, Platform } from 'react-native';

type CustomerInfo = any;

const LOG_LEVEL = {
  VERBOSE: 'VERBOSE',
  ERROR: 'ERROR',
} as const;

const noopPurchases = {
  setLogLevel: (_level: unknown) => {},
  configure: async (_args: unknown) => {},
  getCustomerInfo: async (): Promise<CustomerInfo> => ({
    entitlements: { active: {} },
  }),
  restorePurchases: async (): Promise<CustomerInfo> => ({
    entitlements: { active: {} },
  }),
  logIn: async (_userId: string) => {},
  logOut: async () => {},
  addCustomerInfoUpdateListener: (_listener: (customerInfo: CustomerInfo) => void) => {},
};

const noopRevenueCatUI = {
  presentCustomerCenter: async (_args?: unknown) => {},
};

let Purchases: typeof noopPurchases = noopPurchases;
let RevenueCatUI: typeof noopRevenueCatUI = noopRevenueCatUI;
let hasRevenueCatModule = false;
let Constants: any = { executionEnvironment: undefined, expoConfig: undefined };

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const constantsModule = require('expo-constants');
  Constants = constantsModule?.default ?? constantsModule;
} catch {
  Constants = { executionEnvironment: undefined, expoConfig: undefined };
}

// react-native-purchases（核心购买模块）和 react-native-purchases-ui（Customer Center UI）
// 分开 try/catch：UI 模块加载失败不能影响核心购买功能。
// 两个 require 放在同一个 try 里时，purchasesUI 的失败会让 Purchases 也变成 noop，
// 导致所有用户被判定为未订阅、paywall 失效。
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const purchasesModule = require('react-native-purchases');
  const resolvedPurchases = (purchasesModule?.default ?? purchasesModule) as Partial<typeof noopPurchases> | undefined;
  // 仅当关键方法都可用时才启用原生模块；否则回退 no-op，避免运行时崩溃。
  const hasRequiredPurchasesApi =
    !!resolvedPurchases &&
    typeof resolvedPurchases.setLogLevel === 'function' &&
    typeof resolvedPurchases.configure === 'function' &&
    typeof resolvedPurchases.getCustomerInfo === 'function' &&
    typeof resolvedPurchases.restorePurchases === 'function' &&
    typeof resolvedPurchases.logIn === 'function' &&
    typeof resolvedPurchases.logOut === 'function' &&
    typeof resolvedPurchases.addCustomerInfoUpdateListener === 'function';
  if (hasRequiredPurchasesApi) {
    Purchases = resolvedPurchases as typeof noopPurchases;
    hasRevenueCatModule = true;
  }
} catch {
  hasRevenueCatModule = false;
  Purchases = noopPurchases;
}

// react-native-purchases-ui はオプション：Customer Center UI のみ担当。
// 这个模块加载失败不影响核心购买/订阅检查功能。
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const purchasesUIModule = require('react-native-purchases-ui');
  const resolvedRevenueCatUI = (purchasesUIModule?.default ?? purchasesUIModule) as Partial<typeof noopRevenueCatUI> | undefined;
  if (resolvedRevenueCatUI && typeof resolvedRevenueCatUI.presentCustomerCenter === 'function') {
    RevenueCatUI = resolvedRevenueCatUI as typeof noopRevenueCatUI;
  }
} catch {
  RevenueCatUI = noopRevenueCatUI;
}

// RevenueCat API Key
// 重要：只能使用 Public API Key（以 appl_ 或 goog_ 开头），不能使用 Secret API Key（以 sk_ 开头）
// Secret API Key 只能在服务端使用，在客户端使用会导致错误
// 
// 获取 Public API Key 的方法：
// 1. 登录 RevenueCat Dashboard: https://app.revenuecat.com/
// 2. 进入项目设置
// 3. 在 "API Keys" 部分找到 "Public API Key"
// 4. iOS Public API Key 以 "appl_" 开头
// 5. Android Public API Key 以 "goog_" 开头
//
// 检测是否在 Expo Go 中运行（需要使用测试 API Key）
const isExpoGo = Constants.executionEnvironment === 'storeClient';

// API Key 通过 lib/revenuecatKeys.ts 在运行时解析（避免模块加载时 Constants.expoConfig 未就绪导致空 key）

// 调试：检查环境变量是否被正确读取（仅在开发环境）
if (__DEV__) {
  const iosK = getRevenueCatIosApiKey();
  const androidK = getRevenueCatAndroidApiKey();
  console.log('🔍 RevenueCat API Key Debug:', {
    ios: `${iosK.substring(0, 10)}...`,
    android: androidK ? `${androidK.substring(0, 10)}...` : 'NOT SET',
    extraIos: !!Constants.expoConfig?.extra?.revenueCatApiKeyIos,
    fromProcessEnv: !!process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_IOS,
  });
}

// Entitlement 标识符（在 RevenueCat 后台配置为 "River Pro"）
const PRO_ENTITLEMENT_ID = 'MemQ Pro';

// Offering ID（在 RevenueCat 后台配置的 Offering）
const OFFERING_ID = 'default';

// 订阅计划类型
export type SubscriptionPlanType = 'monthly' | 'yearly' | null;

// Context 类型定义
export type SubscriptionContextType = {
  isPro: boolean; // 核心状态：是否有权限
  planType: SubscriptionPlanType; // 具体的计划类型
  isLoading: boolean; // 检查中状态
  restorePurchases: () => Promise<void>; // 恢复购买功能
  refreshSubscriptionStatus: () => Promise<void>; // 手动刷新订阅状态
  customerInfo: CustomerInfo | null; // 客户信息
  showPaywall: () => Promise<void>; // 显示 Paywall
  showCustomerCenter: () => Promise<void>; // 显示 Customer Center
  showPaywallModal: boolean; // 是否显示自定义 PaywallModal
  setShowPaywallModal: (show: boolean) => void; // 控制自定义 PaywallModal 显示
};

// 创建 Context
const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

// Provider 组件
export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const [isPro, setIsPro] = useState(false);
  const [isConfiguring, setIsConfiguring] = useState(false); // 防止重复配置
  const [planType, setPlanType] = useState<SubscriptionPlanType>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [showPaywallModal, setShowPaywallModal] = useState(false);

  // 从 Supabase profiles 表读取订阅状态
  const fetchSubscriptionFromSupabase = useCallback(async (userId: string): Promise<{
    isPro: boolean;
    planType: SubscriptionPlanType;
  }> => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('is_pro, pro_expires_at, subscription_plan')
        .eq('id', userId)
        .maybeSingle(); // 使用 maybeSingle() 而不是 single()，这样当记录不存在时不会抛出错误

      // 如果查询出错且不是"记录不存在"的错误，记录错误
      if (error) {
        // PGRST116 表示查询结果包含 0 行，这是正常的（用户还没有 profile 记录）
        if (error.code !== 'PGRST116') {
          console.error('Error fetching subscription from Supabase:', error);
        }
        return { isPro: false, planType: null };
      }

      // 如果记录不存在，返回默认值
      if (!data) {
        return { isPro: false, planType: null };
      }

      // 检查是否过期
      const now = new Date();
      const expiresAt = data.pro_expires_at ? new Date(data.pro_expires_at) : null;
      const isExpired = expiresAt ? expiresAt < now : false;

      return {
        isPro: data.is_pro && !isExpired,
        planType: data.subscription_plan as SubscriptionPlanType,
      };
    } catch (error) {
      console.error('Error in fetchSubscriptionFromSupabase:', error);
      return { isPro: false, planType: null };
    }
  }, []);

  // 从 RevenueCat 读取订阅状态
  const fetchSubscriptionFromRevenueCat = useCallback(async (): Promise<{
    isPro: boolean;
    planType: SubscriptionPlanType;
    customerInfo: CustomerInfo | null;
  }> => {
    try {
      // 如果 RevenueCat 未初始化，直接返回
      if (!isInitialized) {
        return { isPro: false, planType: null, customerInfo: null };
      }
      
      const info: CustomerInfo = await Purchases.getCustomerInfo();
      setCustomerInfo(info);
      
      // 检查是否有活动的 entitlement
      const proEntitlement = info.entitlements.active[PRO_ENTITLEMENT_ID];
      
      if (!proEntitlement) {
        return { isPro: false, planType: null, customerInfo: info };
      }

      // 从 productIdentifier 判断是 monthly 还是 yearly
      const productIdentifier = proEntitlement.productIdentifier?.toLowerCase() || '';
      let detectedPlanType: SubscriptionPlanType = null;
      
      if (productIdentifier.includes('monthly') || productIdentifier.includes('month')) {
        detectedPlanType = 'monthly';
      } else if (productIdentifier.includes('yearly') || productIdentifier.includes('year') || productIdentifier.includes('annual')) {
        detectedPlanType = 'yearly';
      }

      return {
        isPro: true,
        planType: detectedPlanType,
        customerInfo: info,
      };
    } catch (error) {
      console.error('Error fetching subscription from RevenueCat:', error);
      return { isPro: false, planType: null, customerInfo: null };
    }
  }, [isInitialized]);

  // 检查订阅状态（综合 RevenueCat 和 Supabase）
  const checkSubscriptionStatus = useCallback(async () => {
    try {
      setIsLoading(true);

      // 1. 获取当前登录用户
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      if (userError || !user) {
        // 如果是会话缺失错误（用户未登录），静默处理
        if (!userError || userError.message?.includes('session missing') || userError.name === 'AuthSessionMissingError') {
          setIsPro(false);
          setPlanType(null);
          setIsLoading(false);
          return;
        }
        // 其他错误才记录
        if (__DEV__) {
          console.log('No user logged in, subscription check skipped');
        }
        setIsPro(false);
        setPlanType(null);
        setIsLoading(false);
        return;
      }

      // 2. 从 RevenueCat 检查（主要来源）
      const revenueCatStatus = await fetchSubscriptionFromRevenueCat();
      
      // 3. 从 Supabase 检查（备用/同步来源）
      const supabaseStatus = await fetchSubscriptionFromSupabase(user.id);

      // 4. 综合判断：优先使用 RevenueCat 的结果，如果 RevenueCat 没有，则使用 Supabase
      const finalIsPro = revenueCatStatus.isPro || supabaseStatus.isPro;
      const finalPlanType = revenueCatStatus.planType || supabaseStatus.planType;

      setIsPro(finalIsPro);
      setPlanType(finalPlanType);
      
      // 更新 customerInfo
      if (revenueCatStatus.customerInfo) {
        setCustomerInfo(revenueCatStatus.customerInfo);
      }

      // 5. 如果 RevenueCat 有订阅但 Supabase 没有，同步到 Supabase（可选）
      // 注意：这通常应该由 Webhook 处理，但这里可以作为备用同步机制
      if (revenueCatStatus.isPro && !supabaseStatus.isPro) {
        if (__DEV__) {
          console.log('RevenueCat has subscription but Supabase does not, syncing...');
        }
        // 这里可以调用一个 Edge Function 来同步状态
        // 或者直接调用 update_subscription_status 函数（需要服务端权限）
      }
    } catch (error) {
      console.error('Error checking subscription status:', error);
      setIsPro(false);
      setPlanType(null);
    } finally {
      setIsLoading(false);
    }
  }, [fetchSubscriptionFromRevenueCat, fetchSubscriptionFromSupabase]);

  // 恢复购买
  const restorePurchases = useCallback(async () => {
    try {
      setIsLoading(true);
      const customerInfo: CustomerInfo = await Purchases.restorePurchases();
      
      // 检查恢复的订阅
      const proEntitlement = customerInfo.entitlements.active[PRO_ENTITLEMENT_ID];
      
      if (proEntitlement) {
        // 重新检查订阅状态
        await checkSubscriptionStatus();
      } else {
        if (__DEV__) {
          console.log('No active subscriptions found to restore');
        }
        setIsPro(false);
        setPlanType(null);
      }
    } catch (error) {
      console.error('Error restoring purchases:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [checkSubscriptionStatus]);

  // 手动刷新订阅状态
  const refreshSubscriptionStatus = useCallback(async () => {
    await checkSubscriptionStatus();
  }, [checkSubscriptionStatus]);

  // 显示 Paywall（导航到 unlock-pro 页面）
  // 首先显示 unlock-pro.tsx 页面，然后用户点击 "Start Free Trial" 按钮后显示 PaywallModal
  const showPaywall = useCallback(async () => {
    try {
      // 不在此处拦截 isInitialized：审核/弱网下过早弹「Not Ready」会被拒；unlock-pro + PaywallModal 内会加载/重试
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        Alert.alert('Authentication Required', 'Please log in to subscribe.');
        return;
      }

      // 使用静态 import，避免动态 import 在 Metro asyncRequire 下抛错导致无法打开 paywall
      router.push('/unlock-pro');
    } catch (error: any) {
      if (__DEV__) console.error('Error showing paywall:', error);
      Alert.alert(
        'Error',
        error?.message || 'Failed to load paywall. Please try again later.'
      );
    }
  }, []);

  // 显示 Customer Center（使用 RevenueCat Paywall UI）
  const showCustomerCenter = useCallback(async () => {
    try {
      if (!isInitialized) {
        console.warn('RevenueCat not initialized. Cannot show customer center.');
        return;
      }

      // 使用 react-native-purchases-ui 的 Customer Center
      try {
        // 显示 Customer Center（自动适配 iOS 和 Android）
        await RevenueCatUI.presentCustomerCenter({
          callbacks: {
            // 可选：监听恢复购买完成事件
            onRestoreCompleted: async ({ customerInfo }: { customerInfo: CustomerInfo }) => {
              if (__DEV__) {
                console.log('Restore completed:', customerInfo);
              }
              await checkSubscriptionStatus();
            },
            // 可选：监听恢复购买失败事件
            onRestoreFailed: ({ error }: { error: any }) => {
              console.error('Restore failed:', error);
            },
          },
        });
        
        // Customer Center 关闭后，刷新订阅状态
        await checkSubscriptionStatus();
      } catch (uiError: any) {
        console.error('Error showing Customer Center:', uiError);
        Alert.alert(
          'Error',
          uiError?.message || 'Failed to show customer center. Please try again later.'
        );
      }
    } catch (error: any) {
      console.error('Error preparing customer center:', error);
      Alert.alert(
        'Error',
        error?.message || 'Failed to load customer center. Please try again later.'
      );
    }
  }, [isInitialized, checkSubscriptionStatus]);

  // 初始化 RevenueCat
  useEffect(() => {
    const initializeRevenueCat = async () => {
      // 防止重复初始化
      if (isConfiguring || isInitialized) {
        return;
      }

      setIsConfiguring(true);
      try {
        if (!hasRevenueCatModule) {
          if (__DEV__) {
            console.warn('RevenueCat native module unavailable in current runtime, skipping initialization.');
          }
          setIsInitialized(true);
          setIsConfiguring(false);
          await checkSubscriptionStatus();
          return;
        }

        // 设置日志级别（开发环境使用 VERBOSE，生产环境使用 ERROR）
        const isDevelopment = __DEV__;
        Purchases.setLogLevel(isDevelopment ? LOG_LEVEL.VERBOSE : LOG_LEVEL.ERROR);

        const iosKey = getRevenueCatIosApiKey();
        const androidKey = getRevenueCatAndroidApiKey();
        const apiKey =
          Platform.OS === 'ios' ? iosKey : Platform.OS === 'android' ? androidKey : getRevenueCatDefaultApiKey();


        if (!apiKey) {
          // 在开发环境中，如果没有配置 API Key，静默处理（应用仍可正常运行，只是订阅功能不可用）
          if (__DEV__) {
            console.warn(
              `⚠️ RevenueCat ${Platform.OS === 'ios' ? 'iOS' : 'Android'} Public API Key not configured. ` +
              `Subscription features will be limited. ` +
              `To enable: Set EXPO_PUBLIC_REVENUECAT_API_KEY_${Platform.OS === 'ios' ? 'IOS' : 'ANDROID'} in your environment variables. ` +
              `Get your Public API Key from: https://app.revenuecat.com/`
            );
          }
          
          setIsInitialized(true);
          setIsConfiguring(false);
          // 即使没有 RevenueCat，也尝试从 Supabase 检查订阅状态
          await checkSubscriptionStatus();
          return;
        }

        if (Platform.OS === 'ios' && !apiKey.startsWith('appl_')) {
          const errorMessage = `Invalid RevenueCat iOS API Key format. ` +
            `iOS Public API Key should start with "appl_". ` +
            `You may have accidentally used a Secret API Key (starts with "sk_"), which cannot be used in client apps. ` +
            `Get your Public API Key from RevenueCat Dashboard: https://app.revenuecat.com/`;
          console.error(errorMessage);
          setIsInitialized(true);
          setIsConfiguring(false);
          await checkSubscriptionStatus();
          return;
        }

        if (Platform.OS === 'android' && !apiKey.startsWith('goog_')) {
          const errorMessage = `Invalid RevenueCat Android API Key format. ` +
            `Android Public API Key should start with "goog_". ` +
            `You may have accidentally used a Secret API Key (starts with "sk_"), which cannot be used in client apps. ` +
            `Get your Public API Key from RevenueCat Dashboard: https://app.revenuecat.com/`;
          console.error(errorMessage);
          setIsInitialized(true);
          setIsConfiguring(false);
          await checkSubscriptionStatus();
          return;
        }

        // 配置 RevenueCat（根据平台）
        // 如果在 Expo Go 中运行，记录警告信息（仅开发环境）
        if (isExpoGo && __DEV__) {
          console.log('⚠️ Running in Expo Go - Using test API key');
          console.log('⚠️ For production features, create a development build: https://docs.expo.dev/development/introduction/');
        }
        
        // 检查是否已经配置过
        try {
          if (Platform.OS === 'ios') {
            await Purchases.configure({ apiKey: getRevenueCatIosApiKey() });
          } else if (Platform.OS === 'android') {
            const ak = getRevenueCatAndroidApiKey();
            if (!ak) throw new Error('Android RevenueCat API key not configured');
            await Purchases.configure({ apiKey: ak });
          } else {
            const dk = getRevenueCatDefaultApiKey();
            if (dk) await Purchases.configure({ apiKey: dk });
          }
        } catch (configError: any) {
          // 如果已经配置过，忽略错误
          if (configError?.message?.includes('already initialized') || configError?.message?.includes('already configured')) {
            if (__DEV__) {
              console.log('RevenueCat already configured, skipping...');
            }
          } else {
            if (/invalid\s+api\s*key/i.test(String(configError?.message ?? ''))) {
              // 服务端拒绝公钥：须在 RevenueCat Dashboard 核对 iOS Public Key（appl_）是否与 EAS/eas.json 一致后重新打包
              console.error(
                'RevenueCat: Invalid API key — 请在 Dashboard → API keys 复制 iOS App public key，更新 eas.json production.env 后重新构建。勿使用 sk_ / test_ / Web Billing key。'
              );
            }
            throw configError;
          }
        }

        // 用户登录后，关联 RevenueCat 用户 ID
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (user) {
          await Purchases.logIn(user.id);
        }
        // 如果用户未登录，静默忽略（不打印错误）

        setIsInitialized(true);
        setIsConfiguring(false);
        
        // 初始化后立即检查订阅状态
        await checkSubscriptionStatus();
      } catch (error) {
        if (__DEV__) {
          console.error('Error initializing RevenueCat:', error);
        }
        setIsInitialized(true);
        setIsConfiguring(false);
        setIsLoading(false);
      }
    };

    initializeRevenueCat();
  }, [checkSubscriptionStatus, isConfiguring, isInitialized]);

  // 监听用户登录状态变化
  useEffect(() => {
    if (!isInitialized) return;

    // 监听 Supabase Auth 状态变化
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        try {
          // 用户登录后，关联 RevenueCat 用户 ID
          await Purchases.logIn(session.user.id);
          // 重新检查订阅状态
          await checkSubscriptionStatus();
        } catch (error) {
          console.error('Error linking user to RevenueCat:', error);
        }
      } else if (event === 'SIGNED_OUT') {
        try {
          // 用户登出后，断开 RevenueCat 关联
          await Purchases.logOut();
          setIsPro(false);
          setPlanType(null);
        } catch (error) {
          console.error('Error logging out from RevenueCat:', error);
        }
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [isInitialized, checkSubscriptionStatus]);

  // 监听 RevenueCat 购买更新（实时同步）
  useEffect(() => {
    if (!isInitialized) return;
    if (typeof Purchases.addCustomerInfoUpdateListener !== 'function') return;

    const customerInfoUpdateListener = Purchases.addCustomerInfoUpdateListener(async (customerInfo: CustomerInfo) => {
      if (__DEV__) {
        console.log('Customer info updated:', customerInfo);
      }
      setCustomerInfo(customerInfo);
      // 当购买状态变化时，重新检查订阅状态
      await checkSubscriptionStatus();
    });

    return () => {
      // 移除监听器
      // 注意：addCustomerInfoUpdateListener 返回 void，所以不需要手动移除
      // RevenueCat SDK 会自动管理监听器的生命周期
    };
  }, [isInitialized, checkSubscriptionStatus]);

  const value: SubscriptionContextType = {
    isPro,
    planType,
    isLoading,
    restorePurchases,
    refreshSubscriptionStatus,
    customerInfo,
    showPaywall,
    showCustomerCenter,
    showPaywallModal,
    setShowPaywallModal,
  };

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
}

// Hook: 使用订阅状态
export function useSubscription(): SubscriptionContextType {
  const context = useContext(SubscriptionContext);
  
  if (context === undefined) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  
  return context;
}
