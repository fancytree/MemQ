# RevenueCat 恢复完成

## ✅ 已完成的步骤

### 1. 文件恢复
- ✅ `context/SubscriptionContext.tsx` → 已恢复为 RevenueCat 版本
- ✅ `components/PaywallModal.tsx` → 已恢复为 RevenueCat 版本

### 2. 依赖安装
- ✅ 已安装 `react-native-purchases`
- ✅ 已安装 `react-native-purchases-ui`

### 3. 代码修复
- ✅ 修复了 `PaywallModal.tsx` 中缺少的 `supabase` 导入

## 📋 下一步操作

### 1. 配置 RevenueCat API Key

**⚠️ 重要**：RevenueCat API Key **不能配置在 Supabase 中**，因为它是客户端环境变量，需要在构建时打包到应用中。

#### 方式 1: 使用 `.env` 文件（本地开发推荐）

在项目根目录创建 `.env` 文件：

```bash
# RevenueCat Public API Keys（客户端使用）
EXPO_PUBLIC_REVENUECAT_API_KEY_IOS=appl_你的iOS密钥
EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID=goog_你的Android密钥
```

**如何获取 API Key**：
1. 登录 [RevenueCat Dashboard](https://app.revenuecat.com/)
2. 进入你的项目
3. 进入 **Settings** > **API Keys**
4. 复制 **Public API Key**（iOS 以 `appl_` 开头，Android 以 `goog_` 开头）

**重要**：
- ✅ 只能使用 Public API Key（`appl_` 或 `goog_` 开头）
- ❌ 不能使用 Secret API Key（`sk_` 开头）
- ✅ Public API Key 是安全的，可以暴露（设计就是给客户端使用的）

#### 方式 2: 使用 EAS Secrets（生产环境推荐）

如果你使用 EAS Build：

```bash
# 设置 iOS API Key
eas secret:create --scope project --name EXPO_PUBLIC_REVENUECAT_API_KEY_IOS --value appl_你的iOS密钥

# 设置 Android API Key
eas secret:create --scope project --name EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID --value goog_你的Android密钥
```

**为什么不能配置在 Supabase？**
- RevenueCat API Key 需要在**构建时**打包到应用中
- Supabase 是服务端，无法在应用启动时注入环境变量
- 即使从 Supabase 获取，也需要先有 API Key 来连接 Supabase

详细说明请查看 [RevenueCat API Key 配置指南](./REVENUECAT_API_KEY_CONFIG.md)

### 2. 配置 RevenueCat Dashboard

#### 2.1 创建 Entitlement

1. 在 RevenueCat Dashboard 中，进入 **Entitlements**
2. 创建新的 Entitlement：
   - **Identifier**: `river_pro`
   - **Display Name**: `River Pro`

#### 2.2 创建 Products

在 RevenueCat Dashboard 中创建两个产品：

**Monthly Product**:
- **Product ID**: `monthly`（或你选择的其他 ID）
- **Type**: Subscription
- **Store Product IDs**:
  - iOS: 在 App Store Connect 中创建的 Product ID（例如：`com.river.memq.monthly`）
  - Android: 在 Google Play Console 中创建的 Product ID

**Yearly Product**:
- **Product ID**: `yearly`（或你选择的其他 ID）
- **Type**: Subscription
- **Store Product IDs**:
  - iOS: 在 App Store Connect 中创建的 Product ID（例如：`com.river.memq.yearly`）
  - Android: 在 Google Play Console 中创建的 Product ID

#### 2.3 创建 Offering

1. 在 RevenueCat Dashboard 中，进入 **Offerings**
2. 创建新的 Offering：
   - **Identifier**: `ofrng7b0f22c470`（或更新代码中的 `OFFERING_ID`）
   - 添加上面创建的 `monthly` 和 `yearly` 产品

#### 2.4 关联 Entitlement

确保 `monthly` 和 `yearly` 产品都关联到 `river_pro` entitlement。

### 3. 重新构建应用

```bash
# 清理并重新构建
rm -rf ios android
npx expo prebuild
npx expo run:ios
```

### 4. 测试

- ✅ 测试购买流程
- ✅ 测试恢复购买
- ✅ 测试订阅状态检查
- ✅ 测试 Paywall 显示

## 📝 主要变化

### 恢复的功能
- ✅ RevenueCat SDK 集成
- ✅ RevenueCat Paywall UI（带降级到自定义 PaywallModal）
- ✅ RevenueCat Customer Center
- ✅ 自动订阅状态同步

### 移除的功能
- ❌ 原生 Apple In-App Purchase API（已完全移除）
- ❌ 手动收据验证（RevenueCat 自动处理）

## 📝 主要变化

### 恢复的功能
- ✅ RevenueCat SDK 集成
- ✅ RevenueCat Paywall UI（带降级到自定义 PaywallModal）
- ✅ RevenueCat Customer Center
- ✅ 自动订阅状态同步

### 移除的功能
- ❌ 原生 Apple In-App Purchase API
- ❌ 手动收据验证（RevenueCat 自动处理）

## ⚠️ 注意事项

1. **API Key 格式**：确保使用 Public API Key（`appl_` 或 `goog_` 开头），不是 Secret API Key
2. **环境变量**：确保 `.env` 文件已添加到 `.gitignore`，不要提交 API Key 到 Git
3. **RevenueCat Dashboard**：确保所有配置（Entitlement、Products、Offering）都已正确设置
4. **测试**：使用 Sandbox 测试账户进行测试

## 📚 相关文档

- [RevenueCat API Key 配置指南](./revenuecat-api-key-setup.md)
- [RevenueCat 完整集成指南](./revenuecat-integration-complete.md)
- [内购测试指南](./IAP_TESTING_GUIDE.md)

## 🎉 优势

使用 RevenueCat 的好处：
- ✅ 更简单的管理：统一的 Dashboard 管理所有订阅
- ✅ 跨平台支持：iOS 和 Android 使用同一套代码
- ✅ 自动同步：订阅状态自动同步到所有设备
- ✅ Webhook 支持：自动同步订阅状态到 Supabase
- ✅ 分析功能：详细的订阅分析和报告
- ✅ 客户支持：更好的客户管理和支持工具
