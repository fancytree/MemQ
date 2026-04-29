# RevenueCat Paywall 使用指南

## 概述

应用已集成 RevenueCat Paywall UI，支持 iOS 和 Android 平台。Paywall 会自动适配平台，使用你在 RevenueCat 后台配置的设计。

## 快速开始

### 1. 在组件中显示 Paywall

```typescript
import { useSubscription } from '@/context/SubscriptionContext';
import { TouchableOpacity, Text } from 'react-native';

function UpgradeButton() {
  const { showPaywall, isPro } = useSubscription();

  // 如果用户已经是 Pro，不显示升级按钮
  if (isPro) {
    return null;
  }

  return (
    <TouchableOpacity onPress={showPaywall}>
      <Text>Upgrade to Pro</Text>
    </TouchableOpacity>
  );
}
```

### 2. 显示 Customer Center

```typescript
import { useSubscription } from '@/context/SubscriptionContext';
import { TouchableOpacity, Text } from 'react-native';

function ManageSubscriptionButton() {
  const { showCustomerCenter } = useSubscription();

  return (
    <TouchableOpacity onPress={showCustomerCenter}>
      <Text>Manage Subscription</Text>
    </TouchableOpacity>
  );
}
```

## 功能说明

### showPaywall()

- **功能**: 显示 RevenueCat Paywall UI
- **平台支持**: iOS 和 Android（自动适配）
- **行为**:
  - 自动使用 RevenueCat 后台配置的 Paywall 设计
  - 显示当前可用的订阅套餐（monthly/yearly）
  - 处理购买流程（包括支付、错误处理等）
  - 购买完成后自动刷新订阅状态
  - 用户取消时不显示错误提示

### showCustomerCenter()

- **功能**: 显示 RevenueCat Customer Center
- **平台支持**: iOS 和 Android（自动适配）
- **功能**:
  - 查看订阅状态
  - 管理订阅（取消、更改计划等）
  - 恢复购买
  - 查看购买历史
  - 请求退款（iOS 仅）

## 在 Settings 页面集成示例

```typescript
import { useSubscription } from '@/context/SubscriptionContext';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

export default function SettingsScreen() {
  const { isPro, showPaywall, showCustomerCenter } = useSubscription();

  return (
    <View style={styles.container}>
      {!isPro ? (
        <TouchableOpacity 
          style={styles.upgradeButton}
          onPress={showPaywall}
        >
          <Text style={styles.upgradeButtonText}>Upgrade to Pro</Text>
        </TouchableOpacity>
      ) : (
        <>
          <View style={styles.proBadge}>
            <Text style={styles.proBadgeText}>Pro Member</Text>
          </View>
          <TouchableOpacity 
            style={styles.manageButton}
            onPress={showCustomerCenter}
          >
            <Text style={styles.manageButtonText}>Manage Subscription</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  upgradeButton: {
    backgroundColor: '#4E49FC',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  upgradeButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  proBadge: {
    backgroundColor: '#F5F3FF',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  proBadgeText: {
    color: '#4E49FC',
    fontSize: 14,
    fontWeight: '600',
  },
  manageButton: {
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 8,
    alignItems: 'center',
  },
  manageButtonText: {
    color: '#4E49FC',
    fontSize: 16,
    fontWeight: '600',
  },
});
```

## 注意事项

1. **RevenueCat 后台配置**: 确保在 RevenueCat 后台已正确配置：
   - Paywall 设计（iOS 和 Android）
   - 产品（monthly 和 yearly）
   - Offerings（当前 offering）
   - Entitlements（river_pro）

2. **测试环境**: 
   - 使用测试 API Key 时，确保在测试设备上登录了测试账号
   - iOS: 需要在 App Store Connect 中配置沙盒测试账号
   - Android: 需要在 Google Play Console 中配置测试账号

3. **错误处理**: 
   - 用户取消购买时不会显示错误提示
   - 其他错误会自动显示 Alert 提示

4. **订阅状态同步**: 
   - 购买完成后会自动刷新订阅状态
   - 订阅状态会同步到 Supabase 数据库（通过 Webhook）

## 技术实现

- **SDK**: `react-native-purchases-ui` v9.6.12
- **方法**: `RevenueCatUI.presentPaywall()` 和 `RevenueCatUI.presentCustomerCenter()`
- **平台适配**: 自动适配 iOS 和 Android 的原生 UI

## 相关文件

- `context/SubscriptionContext.tsx` - 订阅状态管理和 Paywall 调用
- `components/PaywallModal.tsx` - 自定义 Paywall 组件（备用方案）
- `docs/revenuecat-integration-complete.md` - 完整的集成文档

