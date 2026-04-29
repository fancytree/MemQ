# 订阅功能设置指南

## 概述

本项目使用 RevenueCat 来管理应用内订阅。`SubscriptionContext` 提供了全局的订阅状态管理。

## 安装依赖

首先，需要安装 `react-native-purchases` 包：

```bash
npm install react-native-purchases
# 或
yarn add react-native-purchases
```

对于 Expo 项目，还需要安装 Expo 插件：

```bash
npx expo install expo-build-properties
```

## 配置 RevenueCat

### 1. 获取 API Keys

1. 登录 [RevenueCat Dashboard](https://app.revenuecat.com/)
2. 创建或选择你的项目
3. 在项目设置中，找到 **API Keys** 部分
4. 复制 **iOS API Key** 和 **Android API Key**

### 2. 配置环境变量

在项目根目录创建或更新 `.env` 文件：

```env
EXPO_PUBLIC_REVENUECAT_API_KEY_IOS=your_ios_api_key_here
EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID=your_android_api_key_here
```

### 3. 配置 app.json

在 `app.json` 中添加 RevenueCat 配置：

```json
{
  "expo": {
    "plugins": [
      [
        "expo-build-properties",
        {
          "ios": {
            "useFrameworks": "static"
          }
        }
      ]
    ]
  }
}
```

### 4. 在 RevenueCat Dashboard 中配置

1. **创建 Entitlement**:
   - 名称: `pro_access`
   - 这是我们在代码中使用的标识符

2. **创建 Products**:
   - 创建两个产品：
     - `monthly_pro` (月付订阅)
     - `yearly_pro` (年付订阅)
   - 在 App Store Connect 和 Google Play Console 中创建对应的 IAP 产品

3. **关联 Products 到 Entitlement**:
   - 将 `monthly_pro` 和 `yearly_pro` 都关联到 `pro_access` entitlement

## 使用 SubscriptionContext

### 在组件中使用

```typescript
import { useSubscription } from '@/context/SubscriptionContext';

function MyComponent() {
  const { isPro, planType, isLoading, restorePurchases } = useSubscription();

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

### API 说明

- `isPro: boolean` - 用户是否有 Pro 订阅权限
- `planType: 'monthly' | 'yearly' | null` - 订阅计划类型
- `isLoading: boolean` - 是否正在检查订阅状态
- `restorePurchases(): Promise<void>` - 恢复购买（用于用户更换设备后恢复订阅）
- `refreshSubscriptionStatus(): Promise<void>` - 手动刷新订阅状态

## 订阅状态同步

`SubscriptionContext` 会同时从两个来源检查订阅状态：

1. **RevenueCat** (主要来源) - 实时订阅状态
2. **Supabase profiles 表** (备用来源) - 数据库中的订阅记录

当用户登录时，会自动：
- 将 Supabase 用户 ID 关联到 RevenueCat
- 检查并同步订阅状态

## Webhook 集成（推荐）

为了确保订阅状态实时同步到 Supabase，建议设置 RevenueCat Webhook：

1. 在 RevenueCat Dashboard 中配置 Webhook URL
2. 创建一个 Supabase Edge Function 来处理 Webhook 事件
3. 在 Webhook 中调用 `update_subscription_status` 函数更新数据库

这样可以确保：
- 新订阅立即生效
- 订阅取消/过期及时更新
- 跨设备同步订阅状态

## 测试

### iOS (Sandbox)
1. 在 App Store Connect 中创建 Sandbox 测试账号
2. 在设备上登录 Sandbox 账号
3. 测试购买流程

### Android (Test Track)
1. 在 Google Play Console 中创建内部测试轨道
2. 添加测试账号
3. 测试购买流程

## 故障排除

### RevenueCat 未初始化
- 检查 API Key 是否正确配置
- 检查网络连接
- 查看控制台错误日志

### 订阅状态不同步
- 检查 Supabase profiles 表中的数据
- 检查 RevenueCat Dashboard 中的订阅状态
- 调用 `refreshSubscriptionStatus()` 手动刷新

### 恢复购买失败
- 确保用户使用相同的 Apple ID / Google 账号
- 检查 RevenueCat Dashboard 中的订阅记录
- 查看控制台错误日志

