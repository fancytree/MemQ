# RevenueCat 配置检查清单

## ✅ 配置步骤

### 1. API Key 配置

- [ ] 在 `.env` 文件中添加了 `EXPO_PUBLIC_REVENUECAT_API_KEY_IOS`
- [ ] 在 `.env` 文件中添加了 `EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID`
- [ ] API Key 格式正确（iOS 以 `appl_` 开头，Android 以 `goog_` 开头）

### 2. 重启开发服务器

**重要**：修改 `.env` 文件后，必须重启开发服务器才能生效！

```bash
# 停止当前服务器（Ctrl+C）
# 然后重新启动，并清除缓存
npx expo start --clear
```

### 3. 验证配置

启动应用后，检查控制台日志：

**成功标志**：
- ✅ 看到 "RevenueCat configured successfully"
- ✅ 没有看到 "RevenueCat API Key not configured" 警告
- ✅ 可以正常加载产品信息

**失败标志**：
- ⚠️ 看到 "RevenueCat API Key not configured" 警告
- ⚠️ 产品列表为空
- ⚠️ Paywall 无法显示

### 4. RevenueCat Dashboard 配置

- [ ] 创建了 Entitlement：`river_pro`
- [ ] 创建了 Product：`monthly` 和 `yearly`
- [ ] 创建了 Offering：`ofrng7b0f22c470`（或更新代码中的 `OFFERING_ID`）
- [ ] 产品已关联到 Entitlement
- [ ] Offering 中包含了 `monthly` 和 `yearly` 产品

### 5. App Store Connect 配置

- [ ] 创建了产品：`com.river.memq.monthly`
- [ ] 创建了产品：`com.river.memq.yearly`
- [ ] 产品状态为 "准备提交" 或 "已批准"
- [ ] 在 RevenueCat Dashboard 中关联了 Store Product IDs

## 🔍 验证方法

### 方法 1: 检查控制台日志

启动应用后，在控制台中查找：

```
✅ RevenueCat configured successfully
```

如果看到警告：

```
⚠️ RevenueCat iOS Public API Key not configured
```

说明环境变量未生效，需要：
1. 检查 `.env` 文件格式
2. 重启开发服务器
3. 确保使用 `npx expo start --clear`

### 方法 2: 测试 Paywall

1. 在应用中触发 Paywall（导航到 `/unlock-pro` 或点击相关按钮）
2. 如果 Paywall 正常显示产品，说明配置成功
3. 如果显示 "No subscription packages available"，检查 RevenueCat Dashboard 配置

### 方法 3: 检查 RevenueCat Dashboard

1. 登录 [RevenueCat Dashboard](https://app.revenuecat.com/)
2. 进入 **Events** 标签
3. 如果应用已连接，应该能看到初始化事件

## 🐛 常见问题

### Q: 环境变量不生效

**解决方案**：
1. 确保 `.env` 文件在项目根目录
2. 确保变量名以 `EXPO_PUBLIC_` 开头
3. 重启开发服务器：`npx expo start --clear`
4. 检查 `.env` 文件格式（没有多余的空格或引号）

### Q: API Key 格式错误

**检查**：
- iOS: 必须以 `appl_` 开头
- Android: 必须以 `goog_` 开头
- 不能使用 Secret API Key（`sk_` 开头）

### Q: 产品列表为空

**检查**：
1. RevenueCat Dashboard 中是否创建了 Offering
2. Offering 中是否添加了 Products
3. Products 是否关联了 Store Product IDs
4. App Store Connect 中产品状态是否为可用

## 📝 下一步

配置完成后：
1. ✅ 测试 Paywall 显示
2. ✅ 测试购买流程（使用 Sandbox 账户）
3. ✅ 测试恢复购买
4. ✅ 配置 Webhook（可选，用于自动同步到 Supabase）

## 相关文档

- [RevenueCat API Key 配置指南](./REVENUECAT_API_KEY_CONFIG.md)
- [RevenueCat 恢复指南](./REVENUECAT_RESTORATION.md)
- [RevenueCat Webhook 配置](./REVENUECAT_WEBHOOK_SETUP.md)
