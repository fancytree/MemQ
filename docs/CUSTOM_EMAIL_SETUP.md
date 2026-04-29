# 自定义邮件发送人配置指南

## 当前配置

| 用途 | 邮箱 |
|------|------|
| 系统邮件（密码重置、注册确认等） | `noreply@riverstudio.cc` |
| 客服联系 | `support@riverstudio.cc` |

**邮件服务**：Zoho Mail (EU)
**DNS 管理**：Namecheap

## Supabase SMTP 配置

Supabase Dashboard → Settings → Authentication → SMTP Settings:

```
Sender Email: noreply@riverstudio.cc
Sender Name: MemQ
Host: smtp.zoho.eu
Port: 587
Username: support@riverstudio.cc
Password: [Zoho 应用专用密码]
```

> `noreply@riverstudio.cc` 是 `support@riverstudio.cc` 的 alias，认证时使用主账号。

## Zoho Mail 配置

### 应用专用密码

1. 登录 [Zoho Accounts](https://accounts.zoho.eu/home#security/security_pwd)
2. **Security** → **App Passwords** → **Generate New Password**
3. 应用名称填 `Supabase`，复制生成的密码

### Email Alias

`noreply@riverstudio.cc` 已配置为 `support@riverstudio.cc` 的 alias（Settings → Email Routing）。

## Namecheap DNS 记录

确保以下 DNS 记录存在（Domain List → riverstudio.cc → Advanced DNS）：

**SPF 记录**：
```
Type: TXT
Host: @
Value: v=spf1 include:zoho.eu ~all
```

**DKIM 记录**：
从 Zoho 后台 Settings → Domain → Email Authentication → DKIM 获取。

## 自定义邮件模板

配置 SMTP 后，你还可以自定义邮件模板：

1. 在 Supabase Dashboard 中，进入 **Authentication** > **Email Templates**
2. 选择要自定义的模板：
   - **Confirm signup** - 注册确认邮件
   - **Reset Password** - 密码重置邮件
   - **Magic Link** - 魔法链接邮件
   - **Change Email Address** - 更改邮箱地址邮件
3. 自定义邮件内容，包括：
   - 邮件主题
   - 邮件正文
   - HTML 格式支持
   - 品牌颜色和 Logo

### 邮件模板变量

Supabase 提供以下模板变量：

- `{{ .SiteURL }}` - 网站 URL
- `{{ .ConfirmationURL }}` - 确认链接 URL
- `{{ .TokenHash }}` - 令牌哈希
- `{{ .Email }}` - 用户邮箱
- `{{ .RedirectTo }}` - 重定向 URL

### 密码重置邮件模板

在 Supabase Dashboard → Authentication → Email Templates → Reset Password 中配置：

```html
<h2>Reset Your Password</h2>
<p>Hello,</p>
<p>You requested to reset your MemQ account password. Click the link below to set a new password:</p>
<p>
  <a href="{{ .ConfirmationURL }}?redirect_to=memq://reset-password">
    Reset Password
  </a>
</p>
<p>If you did not request this, please ignore this email.</p>
<p>This link will expire in 24 hours.</p>
<p>— MemQ Team</p>
```

## 测试清单

- [ ] Supabase SMTP 配置完成（noreply@riverstudio.cc）
- [ ] 测试密码重置邮件发送
- [ ] 测试注册确认邮件发送
- [ ] 确认发件人显示为 `MemQ <noreply@riverstudio.cc>`
- [ ] 确认邮件进入收件箱而非垃圾箱
- [ ] Namecheap DNS 中 SPF/DKIM 记录正确
