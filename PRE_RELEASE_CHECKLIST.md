# App Store 发布前检查清单

## ✅ 已完成的优化

### 1. RevenueCat 配置
- ✅ 修复了重复初始化问题
- ✅ 添加了配置状态检查，防止重复调用 `configure()`
- ✅ 生产环境使用正确的 API Key
- ✅ 日志级别根据环境自动调整（开发：VERBOSE，生产：ERROR）

### 2. 应用配置
- ✅ 更新了 `app.json`，添加了 iOS `buildNumber`
- ✅ 更新了 `app.json`，添加了 Android `versionCode`
- ✅ 添加了 iOS 隐私权限配置

### 3. 隐私权限
- ✅ 优化了 Info.plist 中的隐私权限描述
  - 相机：用于扫描文档和创建学习材料
  - Face ID：用于安全认证
  - 麦克风：用于语音输入
  - 照片库：用于导入图片和文档

### 4. 代码优化
- ✅ 条件化了开发环境的 console.log
- ✅ 保留了错误日志（用于生产环境调试）

## 📋 发布前必须检查的事项

### 应用信息
- [ ] 确认 `app.json` 中的版本号（当前：1.0.0）
- [ ] 确认 iOS buildNumber（当前：1）
- [ ] 确认 Android versionCode（当前：1）
- [ ] 确认应用名称：MemQ: Smart Quiz & Memory
- [ ] 确认 Bundle ID：com.river.memq

### 图标和启动画面
- [ ] 确认所有图标文件存在且正确
  - `assets/images/icon.png` (1024x1024)
  - `assets/images/android-icon-foreground.png`
  - `assets/images/android-icon-background.png`
  - `assets/images/android-icon-monochrome.png`
- [ ] 确认启动画面配置正确
  - `assets/images/splash-icon.png`

### 功能测试
- [ ] 测试用户注册和登录流程
- [ ] 测试创建课程和添加术语
- [ ] 测试 AI 功能（生成术语、问题、聊天）
- [ ] 测试订阅功能（Paywall、购买、恢复购买）
- [ ] 测试 PDF 上传和处理
- [ ] 测试闪卡学习功能
- [ ] 测试进度跟踪功能
- [ ] 测试通知功能（如果启用）

### 订阅配置
- [ ] 确认 RevenueCat 生产环境 API Key 已配置
- [ ] 确认 App Store Connect 中的订阅产品已创建
- [ ] 确认 RevenueCat Dashboard 中的产品配置正确
- [ ] 测试订阅购买流程（使用 Sandbox 账号）
- [ ] 测试订阅恢复功能

### 隐私和合规
- [ ] 确认所有隐私权限描述清晰明确
- [ ] 确认隐私政策链接正确（support@riverstudio.cc）
- [ ] 确认服务条款链接正确
- [ ] 检查是否使用了加密（ITSAppUsesNonExemptEncryption: false）

### 环境变量和密钥
- [ ] 确认生产环境使用正确的 Supabase URL 和 Key
- [ ] 确认生产环境使用正确的 OpenAI API Key
- [ ] 确认 RevenueCat 生产 API Key 已配置
- [ ] 检查是否有硬编码的测试密钥需要移除

### 性能优化
- [ ] 检查是否有未使用的依赖
- [ ] 确认图片资源已优化
- [ ] 检查内存泄漏
- [ ] 测试应用启动速度

### App Store Connect 配置
- [ ] 准备应用截图（所有必需的尺寸）
- [ ] 准备应用描述和关键词
- [ ] 准备隐私政策 URL
- [ ] 准备支持 URL
- [ ] 配置应用分类和年龄分级
- [ ] 配置应用内购买产品

### 构建和提交
- [ ] 使用 EAS Build 创建生产构建
  ```bash
  eas build --platform ios --profile production
  ```
- [ ] 测试构建的应用
- [ ] 提交到 App Store Connect
- [ ] 填写 App Store 信息
- [ ] 提交审核

## 🔧 构建命令

### iOS 生产构建
```bash
eas build --platform ios --profile production
```

### Android 生产构建
```bash
eas build --platform android --profile production
```

### 同时构建 iOS 和 Android
```bash
eas build --platform all --profile production
```

## 📝 注意事项

1. **版本号管理**：
   - 每次提交到 App Store 时，需要增加 `buildNumber`（iOS）或 `versionCode`（Android）
   - 重大更新时，需要增加 `version`（如 1.0.0 → 1.1.0）

2. **测试账号**：
   - 使用 Sandbox 测试账号测试订阅功能
   - 确保测试账号在 App Store Connect 中已创建

3. **审核指南**：
   - 确保应用符合 App Store 审核指南
   - 检查是否有敏感内容
   - 确保所有功能正常工作

4. **回退计划**：
   - 准备回退方案，以防审核被拒
   - 保留之前的构建版本

## 🚨 常见问题

### RevenueCat 警告
如果看到 "PurchasesCommon.configure() called more than once" 警告：
- ✅ 已修复：添加了 `isConfiguring` 状态检查

### 控制台日志
生产环境中的 console.log 已条件化，只在开发环境显示。

### 隐私权限
所有隐私权限描述已更新为更清晰的中文描述。

## 📞 支持

如有问题，请联系：support@riverstudio.cc

