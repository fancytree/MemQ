# Generate Questions Edge Function

这个 Supabase Edge Function 用于根据用户提供的 Terms 列表生成学习题目。

## 核心功能

### 双向混合提问 (Bidirectional Questions)

系统会生成两种方向的题目，确保全面测试学习效果：

**Direction A (Concept Check)**: 给定 Definition/Context，问 Term
- 示例: "Which term refers to the power house of the cell?" → 答案: "Mitochondria"

**Direction B (Definition Check)**: 给定 Term，问 Definition/Function
- 示例: "What is the primary function of Mitochondria?" → 答案: "Generates ATP"

系统会自动混合这两种方向，为每个术语生成多样化的题目。

## 部署

1. 确保已安装 Supabase CLI：
```bash
npm install -g supabase
```

2. 登录 Supabase：
```bash
supabase login
```

3. 链接到你的项目：
```bash
supabase link --project-ref your-project-ref
```

4. 设置环境变量：
```bash
supabase secrets set OPENAI_API_KEY=your_openai_api_key
supabase secrets set OPENAI_MODEL=gpt-4o-mini  # 可选，默认为 gpt-4o-mini
```

5. 部署函数：
```bash
supabase functions deploy generate-questions
```

## 环境变量

需要在 Supabase Dashboard 的 Edge Functions 设置中配置：

- `OPENAI_API_KEY`: OpenAI API 密钥（必需）
- `OPENAI_MODEL`: OpenAI 模型名称（可选，默认为 `gpt-4o-mini`）
- `SUPABASE_URL`: 自动提供
- `SUPABASE_SERVICE_ROLE_KEY`: 自动提供

## API 使用

### 请求

```typescript
POST https://your-project-ref.supabase.co/functions/v1/generate-questions
Content-Type: application/json
Authorization: Bearer YOUR_ANON_KEY

{
  "lessonId": "uuid-here",
  "terms": [
    {
      "id": "term-uuid-1",
      "term": "Photosynthesis",
      "definition": "The process by which plants convert sunlight into energy"
    },
    {
      "id": "term-uuid-2",
      "term": "Mitochondria",
      "definition": "The powerhouse of the cell"
    }
  ]
}
```

### 响应

成功：
```json
{
  "success": true,
  "questionsGenerated": 6
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
const { data, error } = await supabase.functions.invoke('generate-questions', {
  body: {
    lessonId: 'your-lesson-id',
    terms: [
      {
        id: 'term-id-1',
        term: 'Term 1',
        definition: 'Definition 1'
      }
    ]
  }
});
```

