# RevenueCat API Key 配置指南

## 为什么不能配置在 Supabase？

**`EXPO_PUBLIC_REVENUECAT_API_KEY_IOS` 是一个客户端环境变量**，它需要：

1. **在构建时打包到应用中**：Expo 会在构建时将 `EXPO_PUBLIC_*` 开头的环境变量打包到应用中
2. **在客户端代码中使用**：应用启动时，RevenueCat SDK 需要这个密钥来初始化
3. **不能从服务端获取**：Supabase 是服务端，无法在应用运行时动态注入环境变量

## 正确的配置方式

### 方式 1: 使用 `.env` 文件（本地开发）

1. 在项目根目录创建 `.env` 文件：

```bash
EXPO_PUBLIC_REVENUECAT_API_KEY_IOS=appl_你的iOS密钥
EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID=goog_你的Android密钥
```

2. 确保 `.env` 文件已添加到 `.gitignore`（已自动配置）

3. 重启开发服务器：

```bash
npx expo start --clear
```

### 方式 2: 使用 EAS Secrets（生产环境推荐）

如果你使用 EAS Build 构建应用，推荐使用 EAS Secrets：

```bash
# 安装 EAS CLI（如果还没有）
npm install -g eas-cli

# 登录 EAS
eas login

# 设置 iOS API Key
eas secret:create --scope project --name EXPO_PUBLIC_REVENUECAT_API_KEY_IOS --value appl_你的iOS密钥

# 设置 Android API Key
eas secret:create --scope project --name EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID --value goog_你的Android密钥
```

**优势**：
- ✅ 密钥不会提交到 Git
- ✅ 不同环境可以使用不同的密钥
- ✅ 团队成员无需本地配置

### 方式 3: 直接硬编码（不推荐，但可行）

由于 Public API Key 是安全的（设计就是给客户端使用的），你也可以直接硬编码：

```typescript
// context/SubscriptionContext.tsx
const REVENUECAT_API_KEY_IOS = 'appl_你的iOS密钥';
const REVENUECAT_API_KEY_ANDROID = 'goog_你的Android密钥';
```

**注意**：虽然 Public API Key 可以暴露，但硬编码不利于管理不同环境的密钥。

## 为什么 Public API Key 是安全的？

1. **设计目的**：Public API Key 就是设计给客户端使用的
2. **权限限制**：只能读取数据，不能修改或删除
3. **RevenueCat 官方推荐**：官方文档明确说明可以在客户端使用

**对比 Secret API Key**：
- ❌ Secret API Key（`sk_` 开头）：只能在服务端使用，绝对不能暴露
- ✅ Public API Key（`appl_` 或 `goog_` 开头）：可以在客户端使用，是安全的

## 验证配置

### 检查环境变量是否生效

在 `context/SubscriptionContext.tsx` 中添加临时日志：

```typescript
console.log('RevenueCat API Key configured:', {
  ios: !!REVENUECAT_API_KEY_IOS,
  android: !!REVENUECAT_API_KEY_ANDROID,
});
```

### 检查应用日志

启动应用后，查看控制台：
- ✅ 如果看到 "RevenueCat configured successfully"，说明配置成功
- ⚠️ 如果看到 "RevenueCat API Key not configured" 警告，说明需要配置

## Invalid API key（SDK 报错）

若 Paywall 或控制台出现 **invalid API key**，说明当前密钥被 RevenueCat 拒绝，与「空密钥」不同。请逐项核对：

1. **在 RevenueCat 后台复制正确的 iOS Public Key**
   - 打开 [RevenueCat](https://app.revenuecat.com/) → 选中 **当前项目**
   - **Project settings** → **API keys** → **Apple App Store** 下的 **Public API key**（必须以 `appl_` 开头）
   - 不要使用 **Secret API keys**（`sk_` 开头），也不要用 **Google Play** 的 `goog_` 密钥

2. **Bundle ID 必须一致**
   - RevenueCat 里该 iOS App 的 **Bundle ID** 必须与 `app.json` 里一致：`com.river.memq`
   - 若曾在 RevenueCat 新建过另一个 App，密钥会不同，需用对应 App 下的 Public key

3. **密钥是否被轮换**
   - 若在 Dashboard 里 **Regenerate** 过 API key，旧 key 会立即失效，需把 `eas.json`（或 EAS Secret）里的值换成新 key 并 **重新构建** 应用

4. **EAS 构建使用的值**
   - `eas.json` 里 `production.env.EXPO_PUBLIC_REVENUECAT_API_KEY_IOS` 必须等于上一步复制的完整字符串（无空格、无换行）
   - 改完后执行新的 `eas build`，仅改本地 `.env` 不会影响已安装的 TestFlight 包

5. **本地 `.env` 与 EAS 分离**
   - `.env` 只在本地生效；TestFlight / App Store 包只认 **构建时** 注入的变量（`eas.json` 或 EAS Secrets）

更新密钥后请重新执行：`eas build --platform ios --profile production`。

## 常见问题

### Q: 为什么不能从 Supabase 获取？

**A**: 
- Supabase 是服务端，无法在应用启动时注入环境变量
- 环境变量需要在构建时打包到应用中
- 即使从 Supabase 获取，也需要先有 API Key 来连接 Supabase

### Q: 可以使用 Supabase Edge Function 来代理吗？

**A**: 技术上可以，但不推荐：
- 增加延迟（每次初始化都需要网络请求）
- 增加复杂度
- Public API Key 本身就是安全的，无需隐藏

### Q: 不同环境可以使用不同的密钥吗？

**A**: 可以：
- **开发环境**：使用 `.env` 文件
- **生产环境**：使用 EAS Secrets
- 或者使用不同的 `.env` 文件（`.env.development`, `.env.production`）

### Q: 密钥泄露了怎么办？

**A**: 
- Public API Key 泄露是安全的，因为：
  - 它只能读取数据，不能修改
  - 你可以随时在 RevenueCat Dashboard 中重新生成
  - 重新生成后，旧的密钥会失效

## 推荐配置流程

1. **本地开发**：
   ```bash
   # 创建 .env 文件
   cp .env.example .env
   # 编辑 .env，填入你的 API Key
   ```

2. **生产环境**：
   ```bash
   # 使用 EAS Secrets
   eas secret:create --scope project --name EXPO_PUBLIC_REVENUECAT_API_KEY_IOS --value appl_你的密钥
   ```

3. **验证**：
   - 启动应用
   - 检查控制台日志
   - 测试订阅功能

## 相关文档

- [RevenueCat 恢复指南](./REVENUECAT_RESTORATION.md)
- [RevenueCat API Key 设置](./revenuecat-api-key-setup.md)
