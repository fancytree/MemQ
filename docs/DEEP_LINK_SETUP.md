# Deep Link 设置指南

## 当前配置状态

你的应用已经配置了基本的 deep link 支持：

### 1. app.json 配置

```json
{
  "expo": {
    "scheme": "memq",
    ...
  }
}
```

这意味着你的应用可以通过以下格式的 URL 打开：
- `memq://` - 打开应用
- `memq://reset-password` - 打开重置密码页面
- `memq://login` - 打开登录页面

## 完整设置步骤

### 步骤 1: 确认 app.json 配置

确保 `app.json` 中有以下配置：

```json
{
  "expo": {
    "scheme": "memq",
    "ios": {
      "bundleIdentifier": "com.river.memq"
    },
    "android": {
      "package": "com.river.memq"
    }
  }
}
```

### 步骤 2: 配置 Supabase 重定向 URL

在 Supabase Dashboard 中配置允许的重定向 URL：

1. 登录 [Supabase Dashboard](https://app.supabase.com)
2. 选择你的项目
3. 进入 **Authentication** > **URL Configuration**
4. 在 **Redirect URLs** 中添加以下 URL：

```
memq://reset-password
memq://auth/callback
```

**重要**：Supabase 会验证重定向 URL，只有添加到允许列表的 URL 才能使用。

### 步骤 3: 配置邮件模板（密码重置）**重要**

Supabase 的密码重置邮件默认使用 Site URL，需要配置才能使用 deep link：

**方法 1：修改邮件模板（推荐）**

1. 在 Supabase Dashboard 中，进入 **Authentication** > **Email Templates**
2. 选择 **Reset Password** 模板
3. 找到链接部分，修改为：

```
{{ .ConfirmationURL }}?redirect_to=memq://reset-password
```

或者使用完整格式：

```
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&redirect_to=memq://reset-password
```

**方法 2：配置 Site URL**

1. 在 Supabase Dashboard 中，进入 **Authentication** > **URL Configuration**
2. 将 **Site URL** 设置为：`memq://`（注意：这可能会影响其他功能）
3. 或者保持 Site URL 为 web URL，但确保邮件模板使用 `redirect_to` 参数

**方法 3：使用代码参数（已在代码中实现）**

代码中已经设置了 `emailRedirectTo` 参数，但 Supabase 可能仍需要使用邮件模板配置。

### 步骤 4: 测试 Deep Link

#### 在 iOS 模拟器中测试

```bash
# 打开应用
xcrun simctl openurl booted "memq://reset-password?token=test123&type=recovery"

# 或者使用 adb（Android）
adb shell am start -W -a android.intent.action.VIEW -d "memq://reset-password?token=test123&type=recovery" com.river.memq
```

#### 在真实设备上测试

1. **iOS**：
   - 在 Safari 中输入：`memq://reset-password`
   - 或者在 Notes 中创建一个链接，点击打开

2. **Android**：
   - 在浏览器中输入：`memq://reset-password`
   - 或者使用 ADB 命令

#### 在开发环境中测试

使用 Expo Go 时，deep link 可能有限制。建议使用原生构建：

```bash
npx expo run:ios
# 或
npx expo run:android
```

## Deep Link 格式说明

### 基本格式

```
memq://[path]?[query-params]
```

### 示例

1. **密码重置**：
   ```
   memq://reset-password?token=xxx&type=recovery
   ```

2. **OAuth 回调**：
   ```
   memq://auth/callback?access_token=xxx&refresh_token=xxx
   ```

3. **打开特定页面**：
   ```
   memq://lessons/123
   ```

## 代码中的使用

### 创建 Deep Link URL

```typescript
import * as Linking from 'expo-linking';

// 创建 deep link
const url = Linking.createURL('/reset-password');
// 结果: memq://reset-password

// 带参数
const urlWithParams = Linking.createURL('/reset-password', {
  queryParams: { token: 'xxx', type: 'recovery' }
});
// 结果: memq://reset-password?token=xxx&type=recovery
```

### 接收 Deep Link 参数

在 Expo Router 中，使用 `useLocalSearchParams`：

```typescript
import { useLocalSearchParams } from 'expo-router';

export default function ResetPasswordScreen() {
  const params = useLocalSearchParams<{ token?: string; type?: string }>();
  
  // params.token 和 params.type 包含 URL 参数
}
```

### 监听 Deep Link 事件

如果需要全局监听 deep link：

```typescript
import * as Linking from 'expo-linking';
import { useEffect } from 'react';

useEffect(() => {
  // 处理应用启动时的 deep link
  Linking.getInitialURL().then((url) => {
    if (url) {
      handleDeepLink(url);
    }
  });

  // 监听 deep link 事件（应用运行时）
  const subscription = Linking.addEventListener('url', (event) => {
    handleDeepLink(event.url);
  });

  return () => {
    subscription.remove();
  };
}, []);
```

## 常见问题排查

### 1. Deep Link 无法打开应用

**检查项**：
- ✅ `app.json` 中是否配置了 `scheme`
- ✅ 是否使用了原生构建（Expo Go 可能不支持）
- ✅ URL 格式是否正确

**解决方案**：
```bash
# 重新构建应用
npx expo prebuild --clean
npx expo run:ios
```

### 2. Supabase 重定向失败

**检查项**：
- ✅ Supabase Dashboard 中是否添加了重定向 URL
- ✅ URL 格式是否完全匹配（包括协议和路径）
- ✅ 是否在邮件模板中正确配置了 `redirect_to`

**解决方案**：
1. 在 Supabase Dashboard 中添加完整的 deep link URL
2. 检查 `forgot-password.tsx` 中的 `redirectTo` 值
3. 查看 Supabase 日志中的错误信息

### 3. 参数无法接收

**检查项**：
- ✅ URL 参数格式是否正确
- ✅ `useLocalSearchParams` 是否正确使用
- ✅ 参数名称是否匹配

**解决方案**：
```typescript
// 添加日志查看接收到的参数
const params = useLocalSearchParams();
console.log('Received params:', params);
```

### 4. Session 未创建

**问题**：通过 deep link 打开应用时，Supabase session 未自动创建。

**解决方案**：
- Supabase 的密码重置流程会自动处理 session
- 如果 session 未创建，检查：
  1. URL 中是否包含有效的 token
  2. Token 是否已过期
  3. Supabase 配置是否正确

## 生产环境注意事项

1. **URL Scheme 唯一性**：确保 `memq` 不会与其他应用冲突
2. **安全性**：不要在 deep link 中传递敏感信息（如密码）
3. **错误处理**：始终处理无效或过期的链接
4. **用户体验**：提供清晰的错误提示和重试选项

## 相关文件

- `app.json` - Deep link scheme 配置
- `app/forgot-password.tsx` - 密码重置请求
- `app/reset-password.tsx` - 密码重置页面（接收 deep link）
- `lib/auth.ts` - OAuth 回调处理

## 相关文档

- [自定义邮件发送人配置指南](./CUSTOM_EMAIL_SETUP.md) - 如何配置自定义 SMTP 服务，更改邮件发件人地址

## 测试清单

- [ ] 在 iOS 模拟器中测试 deep link
- [ ] 在 Android 模拟器中测试 deep link
- [ ] 在真实设备上测试 deep link
- [ ] 测试密码重置流程
- [ ] 测试 OAuth 回调
- [ ] 验证 Supabase 重定向 URL 配置
- [ ] 检查错误处理逻辑
