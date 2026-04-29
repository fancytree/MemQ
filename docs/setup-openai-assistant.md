# 设置 OpenAI Assistant 环境变量指南

本指南将帮助你设置 OpenAI Assistants API 所需的环境变量。

## 步骤 1: 获取 OpenAI API Key

1. 访问 [OpenAI Platform](https://platform.openai.com/)
2. 登录你的账户
3. 进入 [API Keys 页面](https://platform.openai.com/api-keys)
4. 点击 "Create new secret key"
5. 复制生成的 API Key（格式类似：`sk-...`）

## 步骤 2: 预先创建 Assistant（推荐）

### 2.1 访问 Assistants Dashboard

1. 访问 [OpenAI Assistants 页面](https://platform.openai.com/assistants)
2. 点击右上角的 "Create" 按钮

### 2.2 配置 Assistant

填写以下信息：

- **Name**: `Study Assistant`（或你喜欢的名称）
- **Instructions**: 复制以下内容：

```
You are a smart study assistant. Your goal is to help users capture knowledge.

Analysis Logic:

1. Chat: Reply naturally to the user's query. Be helpful, friendly, and educational.

2. Extract: If the user mentions a specific fact, concept, or definition, EXTRACT it as a 'Term' and 'Definition'.
   - Term: Must be a core noun, concept, legal term, event name, or key terminology
   - Definition: Must be objective and concise, explaining WHAT the term IS
   - Only extract if there's a clear concept with a definition

3. Classify (The most important part):
   - Compare the extracted content with the provided user_lessons list (provided in each message)
   - If a lesson name is semantically relevant (e.g., content is 'Benzene', lesson is 'Organic Chemistry'), suggest that lesson ID
   - If NO lesson matches, suggest creating a new lesson with a suitable name based on the topic
   - If the topic is too general or unclear, use 'save_to_default' action

Response Format (STRICT JSON):
{
  "reply_text": "Your natural reply to the user's query",
  "extracted_term": {
    "term": "Term Name",
    "definition": "Objective definition",
    "suggested_action": "save_to_existing" | "create_new" | "save_to_default",
    "target_lesson_id": "uuid" (only if suggested_action is "save_to_existing"),
    "target_lesson_name": "Lesson Name" (existing lesson name or new lesson name suggestion)
  }
}

IMPORTANT RULES:
- If no term is detected in the conversation, set extracted_term to null
- Only extract terms when there's a clear concept with a definition
- Be smart about matching topics to existing lessons (semantic matching)
- If creating a new lesson, suggest a concise, descriptive name
- Always return valid JSON
```

- **Model**: 选择 `gpt-4o-mini`（或你偏好的模型）
- **Tools**: 可以留空，或根据需要添加

### 2.3 保存并获取 Assistant ID

1. 点击 "Save" 保存 Assistant
2. 在 Assistant 详情页面，你会看到 Assistant ID（格式类似：`asst_xxxxx`）
3. **复制这个 ID**，稍后会用到

## 步骤 3: 使用 Supabase CLI 设置环境变量

### 3.1 安装 Supabase CLI（如果还没有）

```bash
# macOS
brew install supabase/tap/supabase

# 或使用 npm
npm install -g supabase
```

### 3.2 登录 Supabase

```bash
supabase login
```

### 3.3 链接到你的项目

```bash
# 在项目根目录执行
supabase link --project-ref your-project-ref
```

你可以在 Supabase Dashboard 的项目设置中找到 `project-ref`。

### 3.4 设置环境变量

```bash
# 设置 OpenAI API Key（必需）
supabase secrets set OPENAI_API_KEY=sk-your-api-key-here

# 设置 Assistant ID（推荐，使用步骤 2.3 中复制的 ID）
supabase secrets set OPENAI_ASSISTANT_ID=asst_xxxxx

# 设置模型名称（可选，默认为 gpt-4o-mini）
supabase secrets set OPENAI_MODEL=gpt-4o-mini
```

**注意**：
- 将 `sk-your-api-key-here` 替换为你在步骤 1 中获取的 API Key
- 将 `asst_xxxxx` 替换为你在步骤 2.3 中复制的 Assistant ID
- 如果不设置 `OPENAI_ASSISTANT_ID`，每次调用都会创建新的 Assistant（不推荐生产环境）

### 3.5 验证环境变量

```bash
# 查看已设置的环境变量（注意：出于安全考虑，值不会完全显示）
supabase secrets list
```

## 步骤 4: 部署 Edge Function

```bash
# 部署 chat-assistant 函数
supabase functions deploy chat-assistant
```

## 步骤 5: 测试

部署完成后，你可以通过 AIChatModal 测试功能。如果一切正常，你应该能够：

1. 打开 AI Chat Modal
2. 发送消息
3. 收到 AI 回复
4. 看到 Term 建议（如果有）

## 故障排除

### 问题：`OPENAI_API_KEY environment variable is not set`

**解决方案**：
- 确保你已经运行了 `supabase secrets set OPENAI_API_KEY=...`
- 确保你已经部署了函数：`supabase functions deploy chat-assistant`
- 检查项目是否正确链接：`supabase link --project-ref your-project-ref`

### 问题：每次调用都创建新的 Assistant

**解决方案**：
- 确保设置了 `OPENAI_ASSISTANT_ID` 环境变量
- 确保 Assistant ID 格式正确（以 `asst_` 开头）
- 检查 Assistant 是否在 OpenAI Dashboard 中仍然存在

### 问题：无法找到 Assistant

**解决方案**：
- 确认 Assistant ID 是否正确
- 确认你使用的 OpenAI API Key 有权限访问该 Assistant
- 尝试在 OpenAI Dashboard 中重新创建 Assistant

## 本地开发

如果你在本地开发，可以使用 `.env` 文件（但不要提交到 Git）：

```bash
# .env.local（不要提交到 Git）
SUPABASE_URL=your-supabase-url
SUPABASE_ANON_KEY=your-anon-key
```

但 Edge Functions 的环境变量必须通过 `supabase secrets set` 设置，不能使用本地 `.env` 文件。

## 参考资源

- [OpenAI Assistants API 文档](https://platform.openai.com/docs/assistants/overview)
- [Supabase Edge Functions 文档](https://supabase.com/docs/guides/functions)
- [Supabase Secrets 管理](https://supabase.com/docs/guides/functions/secrets)

