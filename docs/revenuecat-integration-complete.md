# RevenueCat 完整集成指南

## 概述

本指南提供了在 Expo 应用中完整集成 RevenueCat SDK 的步骤，包括订阅管理、Paywall 显示和 Customer Center。

## 1. 安装依赖

```bash
# 安装 RevenueCat SDK
npx expo install react-native-purchases react-native-purchases-ui

# 安装 Expo 构建属性插件（如果还没有）
npx expo install expo-build-properties
```

## 2. 配置 RevenueCat API Key

### 在代码中配置（当前实现）

当前代码已配置测试 API Key：
- API Key: `test_trerGuRogEwSCrGzIKSqrLAvOAQ`
- 位置: `context/SubscriptionContext.tsx`

### 使用环境变量（推荐生产环境）

在 `.env` 文件中添加：

```env
EXPO_PUBLIC_REVENUECAT_API_KEY=your_production_api_key_here
EXPO_PUBLIC_REVENUECAT_API_KEY_IOS=your_ios_api_key_here
EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID=your_android_api_key_here
```

## 3. 配置 app.json

确保 `app.json` 包含以下配置：

```json
{
  "expo": {
    "plugins": [
      "expo-build-properties",
      // ... 其他插件
    ]
  }
}
```

## 4. RevenueCat Dashboard 配置

### 4.1 创建 Entitlement

1. 登录 [RevenueCat Dashboard](https://app.revenuecat.com/)
2. 进入你的项目
3. 导航到 **Entitlements** 部分
4. 创建新的 Entitlement：
   - **Identifier**: `river_pro`
   - **Display Name**: `River Pro`

### 4.2 创建 Products

在 RevenueCat Dashboard 中创建两个产品：

#### Monthly Product
- **Product ID**: `monthly` (或你选择的其他 ID)
- **Type**: Subscription
- **Store Product IDs**:
  - iOS: 在 App Store Connect 中创建的 Product ID
  - Android: 在 Google Play Console 中创建的 Product ID

#### Yearly Product
- **Product ID**: `yearly` (或你选择的其他 ID)
- **Type**: Subscription
- **Store Product IDs**:
  - iOS: 在 App Store Connect 中创建的 Product ID
  - Android: 在 Google Play Console 中创建的 Product ID

### 4.3 创建 Offering

1. 导航到 **Offerings** 部分
2. 创建新的 Offering：
   - **Identifier**: `default` (或自定义)
   - **Display Name**: `River Pro Subscription`
3. 将 Monthly 和 Yearly products 添加到 Offering
4. 将 Offering 设置为 **Current**

### 4.4 关联 Products 到 Entitlement

确保两个产品都关联到 `river_pro` entitlement。

## 5. App Store Connect / Google Play Console 配置

### iOS (App Store Connect)

1. 创建 In-App Purchase 产品：
   - **Product ID**: 与 RevenueCat 中配置的一致
   - **Type**: Auto-Renewable Subscription
   - **Subscription Group**: 创建或选择订阅组
   - **Price**: 设置月付和年付价格

2. 配置订阅信息：
   - 添加订阅描述
   - 设置本地化信息
   - 配置订阅期限

### Android (Google Play Console)

1. 创建订阅产品：
   - **Product ID**: 与 RevenueCat 中配置的一致
   - **Type**: Subscription
   - **Billing Period**: 设置月付和年付周期
   - **Price**: 设置价格

2. 配置订阅详情：
   - 添加产品描述
   - 设置本地化信息

## 6. 代码使用示例

### 6.1 检查订阅状态

```typescript
import { useSubscription } from '@/context/SubscriptionContext';

function MyComponent() {
  const { isPro, planType, isLoading } = useSubscription();

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!isPro) {
    return <UpgradePrompt />;
  }

  return (
    <View>
      <Text>Welcome, Pro User!</Text>
      <Text>Plan: {planType === 'monthly' ? 'Monthly' : 'Yearly'}</Text>
    </View>
  );
}
```

### 6.2 显示 Paywall

```typescript
import { useState } from 'react';
import { useSubscription } from '@/context/SubscriptionContext';
import PaywallModal from '@/components/PaywallModal';

function MyComponent() {
  const [showPaywall, setShowPaywall] = useState(false);
  const { isPro } = useSubscription();

  if (!isPro) {
    return (
      <>
        <TouchableOpacity onPress={() => setShowPaywall(true)}>
          <Text>Upgrade to Pro</Text>
        </TouchableOpacity>
        <PaywallModal
          visible={showPaywall}
          onClose={() => setShowPaywall(false)}
        />
      </>
    );
  }

  return <ProContent />;
}
```

### 6.3 恢复购买

```typescript
import { useSubscription } from '@/context/SubscriptionContext';
import { Alert } from 'react-native';

function RestoreButton() {
  const { restorePurchases, isLoading } = useSubscription();

  const handleRestore = async () => {
    try {
      await restorePurchases();
      Alert.alert('Success', 'Purchases restored successfully.');
    } catch (error) {
      Alert.alert('Error', 'No purchases found to restore.');
    }
  };

  return (
    <TouchableOpacity onPress={handleRestore} disabled={isLoading}>
      <Text>Restore Purchases</Text>
    </TouchableOpacity>
  );
}
```

### 6.4 显示 Customer Center

```typescript
import { useSubscription } from '@/context/SubscriptionContext';

function SettingsScreen() {
  const { showCustomerCenter } = useSubscription();

  return (
    <TouchableOpacity onPress={showCustomerCenter}>
      <Text>Manage Subscription</Text>
    </TouchableOpacity>
  );
}
```

## 7. 错误处理最佳实践

### 7.1 购买错误处理

```typescript
try {
  await handlePurchase(package);
} catch (error: any) {
  if (error.userCancelled) {
    // 用户取消，不显示错误
    return;
  }
  
  if (error.code === 'NETWORK_ERROR') {
    Alert.alert('Network Error', 'Please check your internet connection.');
  } else {
    Alert.alert('Error', error.message || 'Purchase failed.');
  }
}
```

### 7.2 网络错误重试

```typescript
const retryPurchase = async (pkg: PurchasesPackage, retries = 3) => {
  for (let i = 0; i < retries; i++) {
    try {
      return await Purchases.purchasePackage(pkg);
    } catch (error: any) {
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
};
```

## 8. 测试

### 8.1 iOS 测试

1. 在 App Store Connect 中创建 Sandbox 测试账号
2. 在设备上登录 Sandbox 账号
3. 使用测试产品进行购买测试

### 8.2 Android 测试

1. 在 Google Play Console 中创建内部测试轨道
2. 添加测试账号
3. 使用测试产品进行购买测试

### 8.3 测试检查清单

- [ ] 可以加载 offerings
- [ ] 可以显示 Paywall
- [ ] 可以成功购买月付订阅
- [ ] 可以成功购买年付订阅
- [ ] 可以恢复购买
- [ ] 订阅状态正确更新
- [ ] Customer Center 可以正常打开
- [ ] 订阅过期后正确降级

## 9. Webhook 集成（推荐）

为了确保订阅状态实时同步到 Supabase，建议设置 RevenueCat Webhook：

1. 在 RevenueCat Dashboard 中配置 Webhook URL
2. 创建 Supabase Edge Function 处理 Webhook 事件
3. 在 Webhook 中调用 `update_subscription_status` 函数更新数据库

### Webhook 事件处理示例

```typescript
// supabase/functions/revenuecat-webhook/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  const event = await req.json();
  
  // 处理订阅事件
  if (event.type === 'INITIAL_PURCHASE' || event.type === 'RENEWAL') {
    // 更新订阅状态
    await updateSubscriptionStatus(event.app_user_id, true, event.expiration_at, event.product_id);
  } else if (event.type === 'CANCELLATION' || event.type === 'EXPIRATION') {
    // 取消订阅
    await updateSubscriptionStatus(event.app_user_id, false, null, null);
  }
  
  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
```

## 10. 故障排除

### 问题：Offerings 加载失败

**解决方案**：
- 检查 API Key 是否正确
- 确认 RevenueCat Dashboard 中已创建 Current Offering
- 检查网络连接

### 问题：购买失败

**解决方案**：
- 确认产品已在 App Store Connect / Google Play Console 中创建
- 检查产品 ID 是否匹配
- 确认使用正确的测试账号（Sandbox / Test Track）

### 问题：订阅状态不同步

**解决方案**：
- 检查 Webhook 配置
- 手动调用 `refreshSubscriptionStatus()`
- 检查 Supabase profiles 表中的数据

## 11. 生产环境检查清单

- [ ] 使用生产环境 API Key
- [ ] 在 App Store Connect 和 Google Play Console 中创建真实产品
- [ ] 配置 Webhook 用于状态同步
- [ ] 测试所有购买流程
- [ ] 配置 Customer Center
- [ ] 设置订阅条款和隐私政策链接
- [ ] 测试订阅恢复功能
- [ ] 监控 RevenueCat Dashboard 中的指标

## 12. 相关资源

- [RevenueCat 官方文档](https://www.revenuecat.com/docs)
- [React Native 集成指南](https://www.revenuecat.com/docs/getting-started/installation/reactnative)
- [Expo 集成指南](https://www.revenuecat.com/docs/getting-started/installation/expo)
- [Paywall UI 文档](https://www.revenuecat.com/docs/tools/paywalls)
- [Customer Center 文档](https://www.revenuecat.com/docs/tools/customer-center)

