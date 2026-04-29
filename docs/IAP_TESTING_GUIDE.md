# 内购测试指南

## 构建状态

✅ 构建命令已启动：`npx expo run:ios`

构建过程可能需要几分钟，请等待构建完成。

## 测试前准备

### 1. 确保 App Store Connect 中已创建产品

在 [App Store Connect](https://appstoreconnect.apple.com) 中确认：

- ✅ **产品 ID**: `com.river.memq.monthly` (月付订阅)
- ✅ **产品 ID**: `com.river.memq.yearly` (年付订阅)
- ✅ 两个产品都在同一个订阅组中
- ✅ 产品状态为"准备提交"或"已批准"

### 2. 创建沙盒测试账户

1. 在 App Store Connect 中，进入 **Users and Access** > **Sandbox Testers**
2. 点击 **+** 创建新的测试账户
3. **重要**：使用真实的邮箱地址（但不需要验证）
4. 记录测试账户的邮箱和密码

### 3. 在设备上登录沙盒账户

**重要**：不要在设备的 App Store 中登录，只在应用内购买时登录！

1. 在应用内触发购买流程
2. 当系统提示登录时，使用沙盒测试账户登录
3. 完成购买测试

## 测试步骤

### 步骤 1: 启动应用

构建完成后，应用会自动在模拟器或连接的设备上启动。

### 步骤 2: 登录应用

使用你的 Supabase 账户登录（不是沙盒账户）。

### 步骤 3: 触发购买流程

1. 导航到需要 Pro 功能的地方，或
2. 在首页点击测试按钮（如果有），或
3. 直接导航到 `/unlock-pro` 页面

### 步骤 4: 选择订阅计划

在 PaywallModal 中：
- 选择 **Monthly** 或 **Yearly** 计划
- 点击 **Try Free and Subscribe** 按钮

### 步骤 5: 完成购买

1. 系统会弹出 Apple 购买确认对话框
2. **使用沙盒测试账户登录**（如果提示）
3. 确认购买
4. 等待购买完成

### 步骤 6: 验证结果

检查以下几点：

1. **应用内**：
   - 应该显示"订阅激活成功"的提示
   - Pro 功能应该解锁
   - PaywallModal 应该自动关闭

2. **数据库**（Supabase Dashboard）：
   - 进入 **Table Editor** > **profiles**
   - 找到你的用户记录
   - 检查：
     - `is_pro` = `true`
     - `subscription_plan` = `monthly` 或 `yearly`
     - `pro_expires_at` = 未来的日期

3. **RevenueCat Dashboard**：
   - 登录 [RevenueCat Dashboard](https://app.revenuecat.com/)
   - 查看 **Events** 标签，应该能看到购买事件
   - 检查订阅状态是否正确更新

## 测试场景

### ✅ 场景 1: 正常购买流程

1. 用户未订阅 → 点击购买 → 完成购买 → 订阅激活

### ✅ 场景 2: 恢复购买

1. 在 Profile 页面点击"Restore Purchases"
2. 系统应该恢复之前的购买
3. 订阅状态应该更新

### ✅ 场景 3: 取消购买

1. 在购买确认对话框点击"取消"
2. 不应该显示错误提示
3. 订阅状态不应该改变

### ✅ 场景 4: 已订阅用户

1. 如果用户已经订阅，打开 PaywallModal
2. PaywallModal 应该自动关闭
3. 不应该显示购买选项

## 常见问题

### Q: 构建失败怎么办？

**A**: 检查：
- Xcode 是否正确安装
- CocoaPods 依赖是否正确安装
- 网络连接是否正常

```bash
# 清理并重新构建
rm -rf ios
npx expo prebuild --platform ios
cd ios && pod install
npx expo run:ios
```

### Q: 购买时提示"无法连接到 App Store"

**A**: 
- 确保设备/模拟器已登录 Apple ID（可以是测试账户）
- 检查网络连接
- 在模拟器中，确保已登录 iCloud

### Q: 产品列表为空

**A**: 检查：
- App Store Connect 中产品是否已创建
- 产品 ID 是否与代码中的完全一致
- 产品状态是否为"准备提交"或"已批准"

### Q: 购买成功但订阅未激活

**A**: 检查：
- RevenueCat Dashboard 中订阅状态是否正确
- 数据库更新是否成功（如果配置了 Webhook）
- 客户端是否正确刷新订阅状态
- RevenueCat API Key 是否正确配置

### Q: 沙盒账户无法登录

**A**: 
- 确保在应用内购买时登录，不是在系统设置中
- 使用真实的邮箱格式（但不需要验证）
- 确保账户在 App Store Connect 中已创建

## 调试技巧

### 1. 查看控制台日志

在 Xcode 中：
1. 打开 **Window** > **Devices and Simulators**
2. 选择你的设备
3. 点击 **Open Console**
4. 查看应用日志

### 2. 检查网络请求

在应用中添加日志：

```typescript
// 在 SubscriptionContext.tsx 中
console.log('Purchase data:', purchase);
console.log('Verification result:', verificationResult);
```

### 3. 检查 RevenueCat Dashboard

在 RevenueCat Dashboard 中查看：
- **Events** 标签：查看购买事件
- **Customers** 标签：查看用户订阅状态
- **Revenue** 标签：查看收入数据

## 测试清单

- [ ] 应用成功构建并启动
- [ ] 可以正常登录
- [ ] PaywallModal 正常显示
- [ ] 产品列表正常加载
- [ ] 可以触发购买流程
- [ ] 沙盒账户可以登录
- [ ] 购买流程可以完成
- [ ] 订阅状态正确更新
- [ ] Pro 功能正常解锁
- [ ] 恢复购买功能正常
- [ ] RevenueCat Dashboard 显示购买记录
- [ ] Webhook 同步正常（如果已配置）

## 下一步

测试完成后：

1. ✅ 确认所有功能正常
2. ✅ 检查数据库状态
3. ✅ 查看 Edge Function 日志
4. ✅ 准备提交到 App Store

## 相关文档

- [RevenueCat 恢复指南](./REVENUECAT_RESTORATION.md)
- [RevenueCat Webhook 配置](./REVENUECAT_WEBHOOK_SETUP.md)
- [App Store Connect IAP 内容](./APP_STORE_CONNECT_IAP_CONTENT.md)
