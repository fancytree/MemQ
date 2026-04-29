# 设置 Supabase Secrets

## 方法 1: 使用 Supabase CLI（推荐）

### 步骤 1: 链接项目
```bash
supabase login
supabase link --project-ref your-project-ref
```

### 步骤 2: 设置 Secrets
```bash
supabase secrets set OPENAI_API_KEY=your_openai_api_key_here
supabase secrets set OPENAI_MODEL=gpt-4o-mini  # 可选
```

## 方法 2: 使用 Supabase Dashboard（更简单）

1. 登录 [Supabase Dashboard](https://app.supabase.com)
2. 选择你的项目
3. 进入 **Settings** → **Edge Functions** → **Secrets**
4. 添加以下 secrets：
   - `OPENAI_API_KEY`: 你的 OpenAI API Key
   - `OPENAI_MODEL`: `gpt-4o-mini` (可选，默认为 gpt-4o-mini)

## 重要安全提示

⚠️ **请立即撤销刚才在聊天中分享的 API Key！**

1. 前往 [OpenAI API Keys](https://platform.openai.com/api-keys)
2. 找到对应的 API Key
3. 点击 "Revoke" 撤销它
4. 创建一个新的 API Key
5. 使用新 Key 设置 Supabase Secret

## 验证设置

部署函数后，可以通过日志验证环境变量是否正确加载：
```bash
supabase functions logs generate-questions
```

