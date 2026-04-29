# Chat Assistant Edge Function

这个 Edge Function 使用 OpenAI Assistants API 来管理多线程对话，无需在前端维护完整的聊天历史。

## 功能特点

- ✅ 使用 OpenAI Threads 管理对话状态
- ✅ 无需每次发送完整聊天历史
- ✅ 支持多线程对话（每个用户可以有多个对话线程）
- ✅ 自动提取 Terms 并分类到课程
- ✅ 与现有 UI 完全兼容

## 环境变量设置

```bash
# 必需
supabase secrets set OPENAI_API_KEY=your_openai_api_key

# 可选：Assistant ID（推荐预先创建并存储）
supabase secrets set OPENAI_ASSISTANT_ID=asst_xxxxx

# 可选：模型名称
supabase secrets set OPENAI_MODEL=gpt-4o-mini
```

## 预先创建 Assistant（推荐）

为了更好的性能和成本控制，建议预先创建 Assistant。详细步骤请参考：[设置 OpenAI Assistant 环境变量指南](../../docs/setup-openai-assistant.md)

**快速步骤**：
1. 访问 OpenAI Dashboard: https://platform.openai.com/assistants
2. 创建新的 Assistant，设置 Instructions（参考代码中的 systemPrompt）
3. 复制 Assistant ID（格式：`asst_xxxxx`）
4. 设置为环境变量：`supabase secrets set OPENAI_ASSISTANT_ID=asst_xxxxx`

如果不设置 `OPENAI_ASSISTANT_ID`，每次调用都会创建新的 Assistant（不推荐生产环境）。

## 部署

```bash
supabase functions deploy chat-assistant
```

## API 使用

### 请求格式

```typescript
POST /functions/v1/chat-assistant
Authorization: Bearer <user_token>

{
  "thread_id": "thread_xxxxx", // 可选，如果不存在则创建新线程
  "message": "用户消息",
  "user_lessons": [
    { "id": "uuid", "name": "课程名称" }
  ]
}
```

### 响应格式

```typescript
{
  "success": true,
  "data": {
    "thread_id": "thread_xxxxx", // 用于后续对话
    "reply_text": "AI 回复文本",
    "extracted_term": {
      "term": "术语",
      "definition": "定义",
      "suggested_action": "save_to_existing" | "create_new" | "save_to_default",
      "target_lesson_id": "uuid", // 仅当 suggested_action 为 save_to_existing
      "target_lesson_name": "课程名称"
    } | null
  }
}
```

## 与 chat-extractor 的区别

| 特性 | chat-extractor | chat-assistant |
|------|----------------|----------------|
| API 类型 | Chat Completions | Assistants API |
| 对话管理 | 前端维护完整历史 | OpenAI Threads 管理 |
| 每次请求 | 发送完整历史 | 只发送新消息 |
| 多线程支持 | ❌ | ✅ |
| 成本 | 每次发送完整历史 | 更高效（只处理新消息） |

## 迁移建议

1. 可以先同时保留两个 Edge Function
2. 在前端添加开关，可以选择使用哪个 API
3. 逐步迁移用户到新的 chat-assistant
4. 确认稳定后，可以移除 chat-extractor

