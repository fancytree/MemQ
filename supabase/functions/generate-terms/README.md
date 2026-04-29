# Generate Terms Edge Function

这个 Supabase Edge Function 用于从主题或文本中提取/生成知识点（Terms 和 Definitions）。

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

3. 部署函数：
```bash
supabase functions deploy generate-terms
```

## 环境变量

需要在 Supabase Dashboard 的 Edge Functions 设置中配置：

- `OPENAI_API_KEY`: OpenAI API 密钥（必需）
- `OPENAI_MODEL`: OpenAI 模型名称（可选，默认为 `gpt-4o-mini`）

## API 使用

### 请求

**从主题生成：**
```typescript
POST https://your-project-ref.supabase.co/functions/v1/generate-terms
Content-Type: application/json
Authorization: Bearer YOUR_ANON_KEY

{
  "type": "topic",
  "content": "Quantum Physics"
}
```

**从文本提取：**
```typescript
POST https://your-project-ref.supabase.co/functions/v1/generate-terms
Content-Type: application/json
Authorization: Bearer YOUR_ANON_KEY

{
  "type": "text",
  "content": "Photosynthesis is the process by which plants convert sunlight into energy. Mitochondria are the powerhouse of the cell..."
}
```

### 响应

成功：
```json
{
  "success": true,
  "results": [
    {
      "term": "Mitochondria",
      "definition": "A double-membrane-bound organelle found in most eukaryotic organisms that generates most of the cell's supply of adenosine triphosphate (ATP)."
    },
    {
      "term": "Photosynthesis",
      "definition": "The process by which plants and some bacteria convert light energy into chemical energy stored in glucose molecules."
    }
  ],
  "count": 2
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
// 从主题生成
const { data, error } = await supabase.functions.invoke('generate-terms', {
  body: {
    type: 'topic',
    content: 'Quantum Physics'
  }
});

// 从文本提取
const { data, error } = await supabase.functions.invoke('generate-terms', {
  body: {
    type: 'text',
    content: 'Your long text content here...'
  }
});
```

## 特性

- 支持两种模式：主题生成和文本提取
- 严格的定义格式（不包含解释或例子）
- 适应多种领域（医学、法律、历史、编程等）
- 自动验证和清理结果

