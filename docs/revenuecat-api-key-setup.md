# RevenueCat API Key 配置指南

## ⚠️ 重要：Secret API Key vs Public API Key

RevenueCat 有两种类型的 API Key：

1. **Public API Key**（公共密钥）
   - iOS: 以 `appl_` 开头
   - Android: 以 `goog_` 开头
   - ✅ **可以在客户端应用中使用**
   - ✅ **这是你应该在应用中使用的那种**

2. **Secret API Key**（秘密密钥）
   - 以 `sk_` 开头
   - ❌ **不能在客户端应用中使用**
   - ❌ **只能在服务端使用**
   - ⚠️ **如果在客户端使用会导致错误：`Secret API keys should not be used in your app`**

## 如何获取 Public API Key

### 步骤 1: 登录 RevenueCat Dashboard

1. 访问 [RevenueCat Dashboard](https://app.revenuecat.com/)
2. 使用你的账户登录

### 步骤 2: 找到 Public API Key

1. 在左侧菜单中，点击你的项目
2. 进入 **Settings**（设置）
3. 在 **API Keys** 部分，你会看到：
   - **Public API Key (iOS)**: 以 `appl_` 开头
   - **Public API Key (Android)**: 以 `goog_` 开头

### 步骤 3: 配置环境变量

在项目根目录创建或更新 `.env` 文件（如果使用 EAS Build，需要在 EAS Secrets 中配置）：

```bash
# RevenueCat Public API Keys（客户端使用）
EXPO_PUBLIC_REVENUECAT_API_KEY_IOS=appl_你的iOS密钥
EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID=goog_你的Android密钥

# 或者使用通用密钥（如果 iOS 和 Android 使用相同的密钥）
EXPO_PUBLIC_REVENUECAT_API_KEY=appl_你的密钥
```

### 步骤 4: 使用 EAS Secrets（生产环境推荐）

如果你使用 EAS Build，建议使用 EAS Secrets 来管理密钥：

```bash
# 设置 iOS Public API Key
eas secret:create --scope project --name EXPO_PUBLIC_REVENUECAT_API_KEY_IOS --value appl_你的iOS密钥

# 设置 Android Public API Key
eas secret:create --scope project --name EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID --value goog_你的Android密钥
```

## 验证配置

### 检查 API Key 格式

确保你的 API Key 格式正确：

- ✅ iOS: `appl_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
- ✅ Android: `goog_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
- ❌ 错误: `sk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` (这是 Secret Key，不能在客户端使用)

### 测试配置

1. 重新构建应用：
   ```bash
   eas build --platform ios --profile production
   ```

2. 在 TestFlight 中测试订阅功能

3. 检查控制台日志，确保没有 API Key 相关的错误

## 常见错误

### 错误: "Secret API keys should not be used in your app"

**原因**: 你使用了 Secret API Key (`sk_` 开头) 而不是 Public API Key

**解决方法**:
1. 从 RevenueCat Dashboard 获取 Public API Key（以 `appl_` 或 `goog_` 开头）
2. 更新环境变量
3. 重新构建应用

### 错误: "RevenueCat API Key not configured"

**原因**: 环境变量未设置或未正确加载

**解决方法**:
1. 检查 `.env` 文件是否存在且格式正确
2. 如果使用 EAS Build，确保在 EAS Secrets 中配置了密钥
3. 重新构建应用

## 安全提示

1. ✅ **使用 Public API Key** - 这是安全的，可以在客户端使用
2. ❌ **不要使用 Secret API Key** - 这会导致错误，且不安全
3. ✅ **使用环境变量** - 不要硬编码 API Key 到代码中
4. ✅ **使用 EAS Secrets** - 生产环境推荐使用 EAS Secrets 管理密钥

## 相关文档

- [RevenueCat 官方文档 - API Keys](https://www.revenuecat.com/docs/api-keys)
- [Expo EAS Secrets 文档](https://docs.expo.dev/build-reference/variables/)

