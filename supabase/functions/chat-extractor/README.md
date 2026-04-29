# Chat Extractor Edge Function

这个 Supabase Edge Function 用于处理 AI 对话和 Term 提取。它能够理解用户的聊天消息，提取其中的知识点，并智能地建议保存到现有课程或创建新课程。

## 部署

1. 确保已安装 Supabase CLI：
```bash
npm install -g supabase
```

2. 登录并链接项目（如果还没有）：
```bash
supabase login
supabase link --project-ref your-project-ref
```

3. 设置环境变量：
```bash
supabase secrets set OPENAI_API_KEY=your_openai_api_key
supabase secrets set OPENAI_MODEL=gpt-4o-mini  # 可选，默认为 gpt-4o-mini
```

4. 部署函数：
```bash
supabase functions deploy chat-extractor
```

## 环境变量

需要在 Supabase Dashboard 的 Edge Functions 设置中配置：

- `OPENAI_API_KEY`: OpenAI API 密钥（必需）
- `OPENAI_MODEL`: OpenAI 模型名称（可选，默认为 `gpt-4o-mini`）

## API 使用

### 请求

```typescript
POST https://your-project-ref.supabase.co/functions/v1/chat-extractor
Content-Type: application/json
Authorization: Bearer YOUR_ACCESS_TOKEN

{
  "messages": [
    { "role": "user", "content": "What is benzene?" },
    { "role": "assistant", "content": "Benzene is..." },
    { "role": "user", "content": "Tell me more about it" }
  ],
  "user_lessons": [
    { "id": "uuid-1", "name": "Organic Chemistry" },
    { "id": "uuid-2", "name": "Physics Basics" }
  ]
}
```

### 响应

成功：
```json
{
  "success": true,
  "data": {
    "reply_text": "Sure! Benzene is an organic chemical compound with the molecular formula C6H6...",
    "extracted_term": {
      "term": "Benzene",
      "definition": "An organic chemical compound with the molecular formula C6H6, consisting of a ring of six carbon atoms with alternating single and double bonds.",
      "suggested_action": "save_to_existing",
      "target_lesson_id": "uuid-1",
      "target_lesson_name": "Organic Chemistry"
    }
  }
}
```

无 Term 提取：
```json
{
  "success": true,
  "data": {
    "reply_text": "I'd be happy to help you with that!",
    "extracted_term": null
  }
}
```

错误：
```json
{
  "error": "Error message",
  "message": "Detailed error message"
}
```

## 从客户端调用

```typescript
const { data, error } = await supabase.functions.invoke('chat-extractor', {
  body: {
    messages: [
      { role: 'user', content: 'What is photosynthesis?' }
    ],
    user_lessons: [
      { id: 'lesson-uuid-1', name: 'Biology 101' }
    ]
  }
});

if (error) {
  console.error('Error:', error);
} else {
  const { reply_text, extracted_term } = data.data;
  console.log('AI Reply:', reply_text);
  if (extracted_term) {
    console.log('Extracted Term:', extracted_term.term);
    console.log('Suggested Action:', extracted_term.suggested_action);
  }
}
```

## 功能说明

### 1. 对话回复 (Chat)
AI 会自然地回复用户的查询，提供有帮助、友好且教育性的回答。

### 2. Term 提取 (Extract)
如果用户在对话中提到了特定的事实、概念或定义，系统会自动提取为：
- **Term**: 核心名词、概念、法律术语、事件名称或关键术语
- **Definition**: 客观且简洁的定义，解释该术语是什么

### 3. 智能分类 (Classify)

系统会比较提取的内容与用户现有的课程列表，并建议：

- **save_to_existing**: 如果找到语义相关的现有课程（例如，内容是 "Benzene"，课程是 "Organic Chemistry"），建议保存到该课程
- **create_new**: 如果没有匹配的课程，建议创建一个新课程，并提供一个合适的课程名称
- **save_to_default**: 如果主题过于通用或不明确，使用默认操作

### 响应格式

```typescript
interface ExtractedTerm {
  term: string;
  definition: string;
  suggested_action: 'save_to_existing' | 'create_new' | 'save_to_default';
  target_lesson_id?: string;  // 仅当 suggested_action 为 'save_to_existing' 时存在
  target_lesson_name: string;  // 现有课程名称或新课程名称建议
}

interface ChatExtractorResponse {
  reply_text: string;
  extracted_term: ExtractedTerm | null;  // 如果未检测到 Term，则为 null
}
```

## 特性

- 智能语义匹配：能够理解内容与课程名称之间的语义关系
- 自动分类：自动判断应该保存到现有课程还是创建新课程
- 自然对话：提供流畅、自然的对话体验
- 完整错误处理：包含输入验证和错误处理
- 支持 CORS：可在 Web 和移动应用中调用

## 注意事项

1. **消息格式**：确保 messages 数组中的每个消息都有 `role`（'user' 或 'assistant'）和 `content` 字段
2. **课程列表**：提供完整的用户课程列表有助于更准确的分类
3. **Token 限制**：如果对话历史很长，可能需要截断或总结
4. **提取准确性**：系统只会提取明确的、有定义的概念，避免过度提取

