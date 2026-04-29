# API 路由说明

## 环境变量配置

在项目根目录创建 `.env.local` 文件（或 `.env`），添加以下环境变量：

```env
# OpenAI API Key
OPENAI_API_KEY=your_openai_api_key_here

# OpenAI Model (可选，默认为 gpt-4o-mini)
OPENAI_MODEL=gpt-4o-mini

# Supabase 配置
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

## 安装依赖

由于这是 Expo Router 项目，如果你想要使用这个 API 路由，你需要：

### 选项 1: 使用 Supabase Edge Functions（推荐）

对于 Expo 项目，推荐使用 Supabase Edge Functions 而不是 Next.js API 路由。

1. 在 Supabase Dashboard 中创建 Edge Function
2. 将 `app/api/generate/route.ts` 的逻辑迁移到 Edge Function
3. 从客户端调用 Edge Function

### 选项 2: 创建独立的 API 服务器

1. 安装必要的依赖：
```bash
npm install openai @supabase/supabase-js
npm install --save-dev @types/node
```

2. 如果你使用 Next.js，这个路由文件可以直接使用
3. 如果你使用 Expo，需要创建一个独立的 Node.js/Express 服务器

## API 使用示例

### 请求

```typescript
POST /api/generate
Content-Type: application/json

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

```json
{
  "success": true,
  "questionsGenerated": 6
}
```

## 错误处理

- `400`: 请求参数错误（缺少字段或 terms 为空）
- `500`: 服务器错误（OpenAI API 错误或数据库错误）

