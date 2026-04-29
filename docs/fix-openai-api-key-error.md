# 修复 OpenAI API Key 错误

## 问题描述

如果遇到以下错误：
```
401 Incorrect API key provided
```

这表示 OpenAI API Key 配置不正确或已失效。

## 解决方案

### 步骤 1: 检查 API Key 格式

OpenAI API Key 应该：
- 以 `sk-` 开头（不是 `sk-sk-`）
- 长度约为 51 个字符
- 格式：`sk-proj-...` 或 `sk-...`

### 步骤 2: 获取新的 API Key

1. 访问 [OpenAI API Keys 页面](https://platform.openai.com/api-keys)
2. 登录你的 OpenAI 账号
3. 点击 "Create new secret key"
4. 复制新的 API Key（**只显示一次，请立即保存**）

### 步骤 3: 更新 Supabase Secrets

#### 方法 A: 使用 Supabase CLI（推荐）

```bash
# 确保已链接项目
supabase link --project-ref sbwkwfqjpbwmacmrprwn

# 设置新的 API Key（替换 YOUR_NEW_API_KEY）
supabase secrets set OPENAI_API_KEY=YOUR_NEW_API_KEY
```

#### 方法 B: 使用 Supabase Dashboard

1. 访问 [Supabase Dashboard](https://app.supabase.com)
2. 选择项目 `sbwkwfqjpbwmacmrprwn`
3. 进入 **Settings** → **Edge Functions** → **Secrets**
4. 找到 `OPENAI_API_KEY`
5. 点击编辑，输入新的 API Key
6. 保存

### 步骤 4: 验证设置

```bash
# 检查环境变量是否已设置（值会被隐藏）
supabase secrets list | grep OPENAI_API_KEY
```

### 步骤 5: 重新部署函数（如果需要）

```bash
supabase functions deploy chat-assistant
```

## 常见问题

### Q: API Key 格式正确但仍然报错？

**A:** 可能的原因：
1. API Key 已过期或被撤销
2. API Key 没有足够的权限
3. 账户余额不足
4. 网络问题

**解决方案：**
- 检查 [OpenAI Usage 页面](https://platform.openai.com/usage) 查看账户状态
- 确认 API Key 仍然有效
- 尝试创建新的 API Key

### Q: 如何确认 API Key 是否正确设置？

**A:** 可以通过以下方式验证：
1. 在 Supabase Dashboard 查看 Edge Functions 日志
2. 检查日志中是否有 "OPENAI_API_KEY is not set" 错误
3. 如果看到 API Key 相关的错误，说明 Key 已设置但可能无效

### Q: 设置后仍然报错？

**A:** 请确保：
1. API Key 没有多余的空格或换行符
2. 使用的是完整的 API Key（从 `sk-` 开始到结束）
3. 已经重新部署了 Edge Function
4. 等待几分钟让配置生效

## 测试

设置完成后，尝试在应用中发送一条消息。如果仍然报错，请检查：
1. Supabase Dashboard 中的 Edge Functions 日志
2. 前端控制台的错误信息
3. OpenAI Dashboard 中的 API Key 状态

