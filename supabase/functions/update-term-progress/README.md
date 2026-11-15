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
    is_correct: true,
    tz_offset_minutes: -new Date().getTimezoneOffset()
  }
});
```

## SRS 算法逻辑

算法本身写在 `../_shared/scheduler.ts`，App 的离线兜底（`lib/updateTermProgress.ts`）调用同一份代码，
单元测试在 `tests/scheduler.test.mjs`。

请求体可选带 `tz_offset_minutes`（相对 UTC 的分钟数，东为正）。带了以后，间隔 ≥ 1 天的卡片在
用户当地"学习日"开始时（凌晨 4 点）到期，而不是在上次作答的那个钟点到期。

### 答对时 (is_correct === true)
- **只有到期的卡（或从未学过的卡）答对才升一级**（最大为 5）。未到期时答对算练习：
  阶段和下次复习时间都不变（返回 `outcome: "held"`）。因此一轮练习里对同一张卡问几道题，只会升一次。
- 升级后的等待时间（到达该阶段后等多久）：
  - Learning -> 1 天
  - Familiar -> 3 天
  - Good -> 7 天
  - Strong -> 14 天
  - Mastered -> 30 天，之后每次答对翻倍，最长 180 天
- 每张卡有自己的 `ease`（0.6–1.3，间隔的乘数）：学会后又答错会降低，每次按期答对略微回升。
- 过期很久才复习仍答对，间隔有最多 +50% 的加成。

### Deadline
- 课程有未来的 deadline 时，剩余各阶段的等待时间**按同一比例整体压缩**，保持"越来越长"的形状，
  让最后一级落在 deadline 之前；单次等待最短 4 小时。
- 任何卡都不会被排到 deadline 之后而不再看一眼：会被拉回到 deadline 前一天做最后一次复习。
- deadline 过后恢复正常的长期间隔。

### 答错时 (is_correct === false)
- 降一级（最低 New），10 分钟后再看（`outcome: "lapsed"`）。
- 同一次练习里再答错不会继续降级（`outcome: "relearning"`）。
- 卡片在 Familiar 及以上时答错才记一次 `lapses` 并降低 `ease`；刚学的卡答错不算遗忘。

### 数据库
`ease` 和 `lapses` 两列由迁移 `20261115111719_add_review_memory.sql` 添加。迁移未执行时函数会
自动退回到不写这两列，部署顺序不受限制。

## 特性

- 自动创建不存在的进度记录
- 使用 upsert 确保数据一致性
- 完整的错误处理
- 支持 CORS

