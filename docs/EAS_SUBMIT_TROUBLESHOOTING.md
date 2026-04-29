# EAS Submit 问题排查指南

## 问题：卡在 "waiting for an available submitter"

这个错误通常表示 EAS 提交服务正在排队等待。以下是几种解决方案：

### 解决方案 1：使用交互模式（推荐）

```bash
eas submit --platform ios --latest
```

交互模式会引导你完成提交过程，包括选择 App Store Connect 应用。

### 解决方案 2：指定构建 ID

如果你知道具体的构建 ID，可以直接指定：

```bash
eas submit --platform ios --id 25af4b00-7178-4674-87a9-d6531a22eb24
```

### 解决方案 3：配置 ascAppId

在 `eas.json` 中配置 App Store Connect App ID：

```json
{
  "submit": {
    "production": {
      "ios": {
        "ascAppId": "YOUR_APP_STORE_CONNECT_APP_ID"
      }
    }
  }
}
```

**如何获取 App Store Connect App ID：**
1. 登录 [App Store Connect](https://appstoreconnect.apple.com)
2. 进入你的应用
3. 在应用信息页面，URL 中可以看到 App ID，例如：`https://appstoreconnect.apple.com/apps/1234567890/appstore`
4. `1234567890` 就是你的 App ID

### 解决方案 4：使用 Transporter 手动提交

如果 EAS Submit 一直卡住，可以使用 Transporter 手动提交：

1. **下载构建文件**：
   ```bash
   # 从构建日志中获取 Application Archive URL
   # 例如：https://expo.dev/artifacts/eas/5DUhfK7dfiqHNbpr2PSkbm.ipa
   ```

2. **使用 Transporter 提交**：
   - 下载 [Transporter](https://apps.apple.com/us/app/transporter/id1450874784)
   - 打开 Transporter
   - 拖拽 `.ipa` 文件到 Transporter
   - 点击"交付"按钮

### 解决方案 5：检查网络和重试

有时是网络问题导致的：

1. **检查网络连接**
2. **重试提交**：
   ```bash
   eas submit --platform ios --latest --non-interactive
   ```

3. **如果还是卡住，等待一段时间后重试**（EAS 服务可能有临时负载）

### 解决方案 6：检查 App Store Connect API 密钥

确保你的 App Store Connect API 密钥配置正确：

1. 在 App Store Connect 中创建 API 密钥
2. 在 EAS 中配置：
   ```bash
   eas credentials
   ```

### 常见原因

1. **EAS 服务负载高**：高峰期可能需要等待
2. **网络问题**：检查网络连接
3. **API 密钥问题**：检查 App Store Connect API 密钥配置
4. **应用未创建**：确保在 App Store Connect 中已创建应用

### 推荐流程

1. 首先尝试交互模式：
   ```bash
   eas submit --platform ios --latest
   ```

2. 如果交互模式也卡住，等待 5-10 分钟后重试

3. 如果还是不行，使用 Transporter 手动提交

### 检查提交状态

提交后，可以在 App Store Connect 中查看提交状态：
- 登录 [App Store Connect](https://appstoreconnect.apple.com)
- 进入你的应用
- 查看"TestFlight"或"App Store"标签页
