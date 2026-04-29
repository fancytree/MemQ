# Update Term Progress Edge Function

这个 Supabase Edge Function 实现了 SRS (间隔重复系统) 算法，用于更新用户对词条的学习进度。

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
supabase functions deploy update-term-progress
```

## API 使用

### 请求

```typescript
POST https://your-project-ref.supabase.co/functions/v1/update-term-progress
Content-Type: application/json
Authorization: Bearer YOUR_ACCESS_TOKEN

{
  "term_id": "uuid-of-term",
  "is_correct": true
}
```

### 响应

成功：
```json
{
  "success": true,
  "data": {
    "term_id": "uuid-of-term",
    "previous_index": 2,
    "new_index": 3,
    "previous_status": "Familiar",
    "new_status": "Good",
    "next_review_at": "2024-12-16T10:00:00.000Z"
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
const { data, error } = await supabase.functions.invoke('update-term-progress', {
  body: {
    term_id: 'uuid-of-term',
    is_correct: true
  }
});
```

## SRS 算法逻辑

### 答对时 (is_correct === true)
- 索引 + 1（最大为 5）
- 根据新索引增加复习间隔：
  - Index 0 (New) -> 1天后
  - Index 1 (Learning) -> 3天后
  - Index 2 (Familiar) -> 7天后
  - Index 3 (Good) -> 14天后
  - Index 4 (Strong) -> 30天后
  - Index 5 (Mastered) -> 90天后

### 答错时 (is_correct === false)
- 索引降级到 1 (Learning)
- 下次复习时间设置为当前时间（立即复习）

## 特性

- 自动创建不存在的进度记录
- 使用 upsert 确保数据一致性
- 完整的错误处理
- 支持 CORS

