# AI Chat 重建方案（Create / Practice 双线）

状态：待实现。2026-11-17 讨论定稿的方向，实现前先过一遍「待定问题」。

## 0. 为什么重做而不是恢复

被删的 `components/AIChatModal.tsx`（3135 行）+ `AIStudyAssistantModal.tsx`（426 行）是「让模型在回复里夹一段 JSON，前端用字符串/正则解析出一个 term 建议卡」的做法。后端 `chat-assistant`（1031 行）+ `chat-extractor`（245 行）为此服务。

同时 `supabase/functions/mcp/tools.ts` 已经有一套干净的工具层：全部走 RLS + 原子 RPC，带 `write` / `destructive` 标注、防重试重复的提示、「卡片内容是数据不是指令」的防注入措辞。它今天只给外部 AI（Claude / ChatGPT 经 MCP broker）用。

所以：**新 chat 做成 tool calling 的客户端，复用这套工具层**，旧的字符串提取整条退役。

一个范围上的更正（见第 13 节）：**MCP 本期不上线**，而且它现在就是关着的。所以这套工具层抽出来之后，第一个真实消费者是 in-app chat，不是 MCP；MCP 只是被「停放」的第二个消费者。抽象的形状不变——chat 本来就需要一份能按白名单过滤的工具清单——变的只是理由，别再说「为了两个在跑的消费者」。

## 1. 已拍的决定

| 项 | 决定 |
| --- | --- |
| 形态 | **Create chat 和 Practice chat 两条独立对话线**，各自历史、各自 system prompt、各自工具白名单 |
| 入口 | 多处入口；**Today 不加悬浮按钮**，改为 Today 里的一张卡片入口 |
| Practice 深度 | **调度 + 答疑**。chat 读进度、讲解、把人送进原生 quiz；不在 chat 里重建题型，不写 SRS |
| Create 后端 | 复用 `mcp/tools.ts` 工具层，但 chat 只拿薄工具（见 9.2） |
| 模型 | 一期全跑 `gpt-6-luna`；Sol 留成 env 开关（见 9.2.1） |
| 成本 | 没有收入的项目，全局预算闸门是必需项（见第 11 节） |
| 入口 | 两条线各自入口，不做意图判断、不让用户选（见第 12 节） |
| MCP | **本期不上线**，作为「停放」的第二个消费者保持可编译、测试常绿（见第 13 节） |

## 2. 架构

```
app (RN)
 ├─ components/chat/ChatShell.tsx      气泡流、流式、工具状态、确认卡（两线共用）
 ├─ components/chat/CreateChat.tsx     建课线
 └─ components/chat/PracticeChat.tsx   练习线
            │  POST /functions/v1/chat  { mode, messages, context }
            ▼
supabase/functions/chat/index.ts        按 mode 装 system prompt + 工具白名单，跑 tool 循环
            │
            ▼
supabase/functions/_shared/memqTools.ts 与传输无关的工具层（本次抽出）
            ├─► functions/mcp/          MCP 传输（外部 AI，照旧）
            └─► functions/chat/         OpenAI tool schema（app 内 chat）
```

### 2.1 Phase 0：抽出工具层（零行为变化）

`mcp/tools.ts` 现在是 `createMemqServer(supabase, userId) → McpServer`，定义和 MCP 传输焊在一起。改成：

```ts
// _shared/memqTools.ts
export type MemqTool = {
  name: string;
  title: string;
  description: string;
  input: z.ZodType;          // 现有 zod schema 原样搬过来
  annotations: { readOnlyHint?: boolean; destructiveHint?: boolean; ... };
  run: (args: unknown) => Promise<unknown>;
};
export function memqTools(supabase: SupabaseClient, userId: string): MemqTool[];
```

- `functions/mcp/tools.ts` 变成薄壳：遍历 `memqTools()` 调 `server.registerTool`。外部行为一字不变。
- `functions/chat/` 把同一批 zod 转 JSON Schema（`zod-to-json-schema`）喂给模型，按白名单过滤。

这是本次最有价值的结构改动，一次做对两边都干净。现有 MCP 工具的单测（若有）必须继续绿。

### 2.2 Phase 1：`chat` edge function

替代 `chat-assistant`。

**入参**
```ts
{
  mode: 'create' | 'practice',
  thread_id?: string,
  message: string,
  context?: {
    lesson_id?: string;          // 从 lesson / add-terms 页进入
    card_id?: string;            // 从某张卡进入
    question?: {                 // 从 quiz 答错处进入
      text: string; your_answer: string; correct_answer: string; mode: PracticeMode;
    };
  }
}
```

**工具白名单**

| 工具 | create | practice |
| --- | --- | --- |
| `list_lessons` / `list_cards` | ✅ | ✅ |
| `draft_lesson` / `draft_cards`（薄工具，见 9.2） | ✅ | — |
| `update_card`（精修单卡） | ✅ 需确认 | — |
| `create_lesson_with_practice` / `add_cards_with_practice` | ❌ 模型看不到；前端确认后直接调 RPC | — |
| `add_practice_questions` / `replace_practice_question` | ❌ 一期不给（schema 太重） | — |
| `delete_*`（三个破坏性工具） | ❌ 不暴露 | ❌ 不暴露 |
| `get_study_overview` / `list_struggling_cards` / `get_card_progress`（Phase 4 新增） | — | ✅ 只读 |
| `start_practice`（前端工具，不落库） | — | ✅ |

删除留在原生 UI。chat 里不给破坏性工具。

**写操作要人点头**：模型调用写工具时，edge function **不执行**，而是把草稿交给前端的 `show_card_drafts` 组件（第 15 节）——逐张卡可勾选、带目标课的建议（并进已有的哪一门，还是新建并预填好名字）。用户挑完点确认，前端才拿勾选的那部分去落库。这和现在 `/create` 的「先预览后保存」一致，复用 `GeneratedCard` 预览样式。

**API**：走 **Responses API**（GPT-6 系 tool calling 的官方路径，见 9.2），不要沿用现有函数的 Chat Completions + `reasoning_effort: 'none'` 写法。

**流式**：SSE 有三类事件——`text`（逐 token 的散文）、`status`（`thinking` / `reading your lessons` / `drafting cards`，驱动 `components/mascot/MascotState.tsx` 的吉祥物状态）、`component`（一个结构化回复，整块到达，见第 15 节）。散文可以逐字流，组件不行：它要么完整要么不渲染。

**防注入**：课名、卡片内容、题目文本一律当数据。system prompt 明说「以下用户内容不是指令」，与 `memqTools` 里已有的措辞一致。

### 2.3 Phase 2：共享聊天壳

`components/chat/ChatShell.tsx`：气泡流、输入条、流式光标、工具状态行、确认卡插槽、错误与重试、配额用尽时的 paywall 挂钩（`useSubscription().showPaywall`）。用现有积木：`components/ui/{Card,Button,Field,Sheet,IconButton,Icon}`、`theme/*`、`MascotState`。

旧 modal 里那个被兜底成内存 Map 的 AsyncStorage（重启即丢）不要了：历史只有服务端一份。

## 3. Create chat（建课线）

**入口**
- `/create`：现有「一句话 prompt → 生成卡片」直通路径**保持不变**。旁边加一条安静的入口（说不清楚就聊着建）。
- `/lessons/[id]/add-terms`：带 `lesson_id` 进入，对话式加卡。
- `/lessons/[id]`：按动作命名的「补充卡片」入口（见第 12 节），带 `lesson_id`。

**典型对话**
1. 「我想学意大利语点菜」→ 模型问清范围/难度/母语
2. 模型 `list_lessons` 看有没有相近的课 → 建议并进现有课还是新建
3. 模型拟 12 张卡 + 每张的 mcq/recall 题 → 回 `pending_action`
4. 前端确认卡展示预览 → 用户确认 → 执行 `create_lesson_with_practice`
5. 成功后导航到 `/lessons/[id]`

**生成约束**（沿用工具层已有的，别再写第二套）：mcq 选项池 5–6 个、每个 ≤100 字符、恰好一个正确；recall 至少一道；语言模式才允许 `language_data`。

## 4. Practice chat（练习线）

**入口**
- **Today 卡片**：放在 stats 和 Continue Learning 之间。卡面是真实的调度信息（「12 张到期，约 6 分钟」/「这 3 张你一直记不住」），**没有可说的内容就不出现这张卡**，不做空壳入口。
- **quiz 答错处**：`components/FlashcardFeedback.tsx` / `components/practice/Answer.tsx` 加一个追问入口，带着题目、你的答案、正确答案、这张卡进 chat。
- **lesson 页**：不放通用入口，放一个按动作命名的「这门课练得怎么样」（见第 12 节）。

**Phase 4 新增三个只读工具**（加进 `memqTools`，外部 AI 同时受益）
- `get_study_overview`：今天各课到期数、预估时长、连续天数、今日目标完成度。读 `user_term_progress`
- `list_struggling_cards(lesson_id?)`：错误率高、长期停在 learning 的卡。读 `review_events` + `user_term_progress`
- `get_card_progress(card_id)`：这张卡的作答历史

**`start_practice`（前端工具）**：模型调用后不走后端，前端把它渲染成一个真实按钮，点了 `router.push('/quiz?entry=chat&lessonId=…')`。`app/quiz.tsx:136` 已经收 `entry` / `lessonId`，加一个 `entry=chat` 即可。

**不做**：chat 里出题判分、写 SRS 进度。六种题型和调度留在 `app/quiz.tsx`。

## 5. 配额与历史

- **历史**：复用 `chat_threads`（已有 `mode` 列，见 `20251225160000_add_mode_to_chat_threads.sql`）+ `chat_messages`。create / practice 各自一条线。`chat-history` / `chat-thread-messages` / `chat-delete-thread` 三个 function 留用，只把 mode 取值从 `ask|vocab_lookup|practice` 改成 `create|practice`（需要一条迁移处理历史数据）。
- **配额**：两条线分开计，落库另算——见第 9.4 节。工具循环不额外计。

## 6. 旧代码处置

| 文件 | 处置 |
| --- | --- |
| `supabase/functions/chat-assistant/` | 删（1031 行字符串提取退役） |
| `supabase/functions/chat-extractor/` | 删 |
| `supabase/functions/chat-history|chat-thread-messages|chat-delete-thread` | 留用，改 mode 取值 |
| `components/AIChatModal.tsx` / `AIStudyAssistantModal.tsx` | 不恢复；新写两个小组件 + 共享壳 |
| `components/icons/{SendIcon,FloatingAIButtonIcon}.tsx` | SendIcon 留；FloatingAIButtonIcon 不要了（不做悬浮按钮） |

## 7. 分期与验收

设计系统规矩：一次一个 family，做完在模拟器跑一遍，再问下一步。

| Phase | 内容 | 验收 |
| --- | --- | --- |
| 0 | ✅ **已完成**：抽出 `memqTools`，MCP 改薄壳，加 `existingLessonRule` | `npm run test:functions` 30 passed / 0 failed，`tools_test.ts` 未改动 |
| 1 | ⚠️ **部分验证**：`chat` edge function、三个迁移、共享契约 | 59 单测 + `deno check` + 迁移在真 Postgres 上验过 + 函数真启过并回了 SSE；**模型调用那段没跑过**，见 16.5 |
| 2 | ✅ `ChatShell` + SSE 客户端 + turn reducer + dev lab | 11 个新测试；模拟器里验过流式、中断、配额三条分支 |
| 3 | **Create chat**（`/create` + add-terms 入口、确认卡、落地导航） | 模拟器：聊着建出一门带练习题的课 → 停下来问 |
| 4 | 三个只读进度工具 | MCP 侧也能查到 |
| 5 | **Practice chat**（Today 卡片、quiz 追问、`start_practice`） | 模拟器：答错→追问→送进 quiz → 停下来问 |
| 6 | 删旧 function，更新 `PRODUCT_WORKFLOW.md` 第 5 节 | — |

边注：edge function 的测试要用 `npm run test:functions`（即 `deno test --allow-all --node-modules-dir=none supabase/functions`）。仓库根有 Expo 的 `package.json` 却没有 `deno.json`，Deno 2 因此默认去 `node_modules` 找 npm 包，而 `@modelcontextprotocol/server` 只有 edge function 用、npm 侧没装，所以不带 `--node-modules-dir=none` 会直接报解析失败。没有加 `supabase/functions/deno.json` 是故意的——那会改变已上线函数的解析根，不值得为跑测试去碰部署路径。

两条贯穿全程、不单独列 Phase 的事：**延迟**（第 10 节，Phase 1–3 每一步都要看 TTFT）和**成本闸门**（第 11 节，`ai_budget` 和防刷必须和 Phase 1 同时上线，不能留到最后）。另外**结构化回复的组件契约**（第 15 节）嵌在 Phase 1–3 和 5 里，见 15.5。

## 8. 待定问题

1. ~~模型~~、~~免费额度口径~~ → 已定，见第 9 节。
2. **Today 卡片的文案与视觉**：到了 Phase 5 要单独定，它和 hero 的主按钮争注意力。
3. **「这道题出得不对」**：Practice chat 要不要允许提议修正并走 `replace_practice_question`（需确认）？倾向二期。
4. **PDF / 文件**：Create chat 里能不能直接丢文件？现有 PDF 链路在 `/create`（MinerU）。倾向一期不做，入口仍在 `/create`。

## 9. 模型与成本

### 9.1 现状

全部 edge function 共用**一个** `OPENAI_MODEL` 环境变量，默认 `gpt-6-luna`，走 Chat Completions，并且每处都硬写了 `reasoning_effort: 'none'`（`grade-answer`、`generate-terms`、`generate-questions`、`process-file`、`chat-assistant` …）。没有任何一处用流式。

那个 `reasoning_effort: 'none'` 不是随便写的——在 Chat Completions 里，`gpt-6-luna` / `gpt-6-sol` 的 function calling **只在 effort 为 none 时可用**。也就是说现有这套代码想做 tool calling，就只能在「推理关掉」的状态下做。而一个要连着调几次工具、读完你的课再决定存哪里的 agent，恰恰是 `none` 最不适合的场景。

### 9.2 决定：谁生成内容，谁定价

先说一个最初方案里被我漏掉的区别：

- **MCP 那条路（外部 AI）**：卡片和题目是 Claude / ChatGPT 生成的，**算在用户自己的额度上**。所以 `create_lesson_with_practice` 把「你自己生成 12 张卡和每张的题」当成工具契约，完全合理——生成越重，我们越不花钱。
- **App 内 chat**：模型调用是**我们付**。照抄同一个工具形状，等于把 12 张卡 + 24 道题的 output token 全压在我们选的那个 chat 模型的输出单价上。

这就是 $0.08/课 的来源，它是方案的设计问题，不是 Sol 的问题。改法：

> **Sol 管对话和决策，Luna 管批量生成。**

chat 模型只做它真正值钱的事——问清楚你要什么、看一眼你已有哪些课、决定并进去还是新建。真正生成 12 张卡和题目，走**现有的** `generate-terms` / `generate-questions`（Luna，已经调好、已经在跑）。

落到工具上，给 chat 的是一个薄工具，而不是那几个深层嵌套的：

```ts
draft_lesson({ topic, card_count, learning_mode, source?, lesson_id? })
  // 内部：调 generate-terms + generate-questions（Luna）
  // 返回：草稿（不落库），交给前端渲染确认卡
```

于是模型既不用在 prompt 里背 `cardsWithPractice` 那套深 schema（create 白名单从约 5k tokens 瘦到约 1.2k），也不用自己吐几千 token 的卡片内容。用户点确认之后，由**前端**拿草稿去调 `create_lesson_with_practice` / `add_cards_with_practice` 的 RPC——模型从头到尾没见过这两个大 schema。

工具层抽象（Phase 0）不受影响：`memqTools` 照旧是那一套，MCP 侧一字不变（外部 AI 继续用重工具，那是它的强项且不花我们钱），in-app chat 只是**另一份白名单 + 一个薄工具**。

**代价要说清楚**：chat 对卡片内容的精修能力变弱了。「把第三张的例句换一个」靠保留 `update_card`（schema 小，1.3k 字符，给）；「重出这道题」一期不支持，要改就整批重新生成。这是真实的功能取舍，我觉得换 71% 的成本值。

### 9.2.1 模型分层

前提：这是个人开发、没有收入的项目，承担不起按用户线性增长的模型账单。所以**一期全部跑 Luna**，Sol 只作为一个随时能打开的 env 开关。

| 用途 | 一期模型 | 升级路径 | API |
| --- | --- | --- | --- |
| **Create chat**（对话、决策、调薄工具） | **`gpt-6-luna`** | 体感不行再切 `gpt-6.1-sol` | **Responses** |
| **Practice chat**（讲解 + 1–2 次只读工具） | `gpt-6-luna` | 不打算升 | Responses |
| **批量生成**（卡、题）+ 现有单发任务（判分、PDF） | `gpt-6-luna` **不动** | — | Chat Completions 不动 |

为什么 Luna 这次够用：9.2 的薄工具已经把 create chat 的活从「自己生成 12 张卡和 24 道题」降成「问清楚要什么 + 看一眼已有的课 + 调一个工具」。难的那部分（结构化批量生成）本来就交给现有的 `generate-terms` / `generate-questions` 了。真正吃模型能力的只剩多轮对话里的工具调用时机，Luna 在 Responses 上做单步工具调用没问题。

拆 env 的价值正在这里：**升级是改一个环境变量，不是改代码**。先用 Luna 发出去，真有人抱怨「它听不懂我要什么」，再把 `OPENAI_CHAT_CREATE_MODEL` 切 Sol，成本从 $0.004/课 变 $0.023/课，届时你已经知道有多少人在用、值不值。

GPT-6 系的 tool calling 官方要求走 Responses；在 Chat Completions 里 Luna / Sol 的 function calling **只在 `reasoning_effort: 'none'` 时可用**，而一个要连着调工具的 agent 恰恰是 `none` 最不适合的场景。

**必须拆 env**，这条比选哪个模型更重要：

```
OPENAI_MODEL=gpt-6-luna                      # 现状，单发任务 + 批量生成，不要碰
OPENAI_CHAT_CREATE_MODEL=gpt-6.1-sol         # 新，只给 create chat 的对话层
OPENAI_CHAT_PRACTICE_MODEL=gpt-6-luna        # 新
```

图省事直接把 `OPENAI_MODEL` 改成 Sol，建卡/出题/判分/PDF 全部跟着贵 20 倍——那才是真正的成本事故。

两个连带注意：
- Astra **不支持** `reasoning_effort: 'none'`（会 400），Sol / Luna 支持。chat 走 Responses 后不再需要这个 flag，但现有单发函数里的 `none` 要留着。
- 想吃到 cached input，请求前缀必须稳定：system prompt + 工具 schema 放最前、顺序固定，**不要在一轮对话中途改 effort**。下面的成本表完全依赖这一点。

### 9.3 成本估算

口径：工具 schema 由 zod 转 JSON Schema（源码实测字符数 × 1.6 膨胀）。单价取 2026-11 第三方汇总（**非官方页面，上线前要核**）：Sol $2/$10、Luna $0.10/$0.50，cached input 约为 input 的 1/20。

**建成一门 12 张卡的课**

| 方案 | 构成 | 单课成本 |
| --- | --- | --- |
| **全 Luna + 薄工具（一期方案）** | Luna 对话 + Luna 生成 | **$0.004** |
| Sol 对话 + Luna 生成（升级路径） | Sol：fresh 8k $0.016 + cached 8k $0.001 + 400 output $0.004；Luna 生成 $0.0014 | $0.023 |
| ~~Sol 全包（初版方案）~~ | ~~fresh 21k $0.042 + cached 29k $0.003 + 3.5k output $0.035~~ | ~~$0.08~~ |
| Astra 全包 | — | $0.41 |

**实测**（见 16.5）：chat 模型这半边一轮建课 **$0.000444**，缓存命中 58.6%。加上 `generate-terms` 那次 Luna 调用（估 $0.0014），整轮约 **$0.0019**——比下表估的 $0.004 还便宜一半。下表保留作估算方法的记录。

一期的 $0.004 相对初版的 $0.08 降 **95%**：一半来自薄工具（不让 chat 模型吐卡片内容），一半来自改用 Luna。Sol 那一档随时可以用 env 打开。

**Practice chat 单条消息**（input ≈ 3.5k，其中 1.6k 缓存；output ≈ 350）

| 模型 | 单条 | 10 条/天 → 每月 |
| --- | --- | --- |
| **Luna** | **$0.0004** | **$0.12** |
| Sol | $0.0075 | $2.25 |

**按人看（真正要关心的）**

**按人看（全 Luna，一期口径）**

大头不在 create，在 practice——因为日配额的月上限是 30 倍：

| 免费用户每月 | 量 | 成本 |
| --- | --- | --- |
| create：3 门课/月 | 3 次 | $0.012 |
| practice：**10 条/天** | **300 条** | **$0.12** |
| 合计 | | **≈ $0.13** |

所以「把免费额度从 3 降到 2」省的是 $0.004/人/月，1000 个活跃免费用户省 $4/月；而把 create chat 从 Sol 换成 Luna 同样 1000 人省 $57/月。**先动模型，再动 practice 的日配额，最后才轮到那个 3。**

调整后（见 9.4）：practice 改成按月计 60 条，免费用户降到 **≈$0.036/月**。

| 规模（活跃免费用户） | 调整前 | 调整后 |
| --- | --- | --- |
| 100 | $13 | **$3.6** |
| 1,000 | $130 | **$36** |
| 10,000 | $1,300 | **$360** |

1000 人 $36/月，对没有收入的项目仍然不是零。所以 9.6 那个全局闸门不是可选项。

### 9.4 配额口径（定）

| 动作 | 计入 | 免费额度 |
| --- | --- | --- |
| Practice chat 发一条消息 | `ai_chat` | **60 / 月**（原 10/天 → 月配额） |
| Create chat 发一条消息 | `ai_chat_create`（新增） | **30 / 月** |
| Create chat **落库**一门课 / 一批卡 | `generate_terms` | **3 / 月**（不动） |

- **日配额换月配额**，这是本节最实际的一条。10 条/天 的月上限是 300 条，而 60 条/月 既砍掉 80% 的总量暴露，又允许用户在想用的那天集中用——体感反而更好。`lib/aiUsage.ts` 的 `getPeriodStart` 已经支持 `'month'`，改一行配置即可。
- `generate_terms` 的 3 次**保持不动**。它是转化漏斗：3 次能建成 3 门真课，砍到 2 次省 $0.004/人/月，但可能让人还没感觉到价值就走了。这是我不建议动的地方。
- 真正的闸门还是落库那一下（3/月）。对话额度给得宽一点无所谓，因为对话便宜。
- `AIFeature` 加 `'ai_chat_create'`，`AI_LIMITS` 加一行。表结构不用动（`feature` 是 text）。
- Pro 不设收费闸门，但要有防失控的软上限：`checkAIQuota` 现在对 Pro 直接 `allowed: true` 不查库，得加一条 Pro 专用的宽上限分支（比如 `draft_lesson` 30 次/天），撞到了提示而不是静默扣费。

### 9.5 先埋度量，别靠这张表做决定

上面每个数字都是估的。Phase 1 必须做的一件事：**把每次模型调用的真实用量写下来**。

给 `ai_usage` 加列（一条迁移）：

```sql
alter table ai_usage
  add column model            text,
  add column mode             text,   -- create | practice
  add column prompt_tokens    integer,
  add column cached_tokens    integer,
  add column completion_tokens integer,
  add column tool_calls       integer;
```

Responses API 的 `usage` 里有 `input_tokens` / `output_tokens` / `input_tokens_details.cached_tokens`，照抄进去。跑一两周之后用真实数据回来调 9.4 的三个数字——那时候再谈定价感，比现在拍板靠谱。

顺带一个要盯的指标：**缓存命中率**。如果实际 cached_tokens 远低于估算，说明前缀被什么东西弄不稳定了（工具顺序、effort 中途变、system prompt 里塞了时间戳之类），成本会直接翻几倍。

## 10. 延迟：为什么连「打个招呼」都要等很久

这不是模型慢，是旧链路在首个字之前串了十几个往返。按一条用户消息数：

**客户端**（`AIChatModal.tsx`，已删）
1. `supabase.auth.getUser()`（:783）——一次网络往返
2. 查 lessons 列表（:788）——为了拼「存到哪门课」的下拉
3. `supabase.auth.getSession()`（:807）
4. 才开始 invoke `chat-assistant`

**服务端**（`chat-assistant/index.ts`）
5. `auth.getUser()` 被调了**三次**（:436、:449、:490），每次都是打 Auth 服务的网络调用
6. `chat_threads` 三次往返：insert（:471）、select（:490）、update（:508）
7. 取 `chat_messages` 历史（:515）
8. **然后才**调模型，`openai.chat.completions.create`（:653），**非流式**——全文生成完才返回。全仓库 `grep stream:` 零结果
9. 回来再写两条 `chat_messages`（:952、:962），卡在返回路径上

**然后客户端**再单独调一次 `chat-extractor` 做 term 提取——同一条用户消息的**第二次**模型调用。

一句「你好」要穿完 1–9 再加第二次模型往返。4–6 秒是正常的，跟模型一点关系都没有。

### 10.1 新架构怎么治

| 做法 | 省掉什么 |
| --- | --- |
| **SSE 流式输出** | 最大的一项。现在是等全文，改完是等第一个字 |
| **extractor 退役** | 整个第二次模型调用消失（工具层本来就不需要它） |
| **auth 只验一次** | 旧版 3 次 `getUser()` → 1 次，往下传 `userId` |
| **客户端不做 preflight** | 删掉上面 1–3：token 本地就有，lessons 交给模型的 `list_lessons` 按需取 |
| **thread 三次往返合一** | insert/select/update → 一个 RPC 或一次 upsert |
| **消息写入后置** | 用 `EdgeRuntime.waitUntil()`（仓库里还没用过）放到流结束后，不占返回路径 |
| **卡组边流边渲染** | 12 张卡约 2–3k output token，等全生成完是十几秒的白屏；逐张出现就从「等待」变成「在生成」 |

### 10.2 TTFT 预算（热启动）

| 环节 | 目标 |
| --- | --- |
| JWT 验证（1 次） | ~100ms |
| thread + 历史（1 次并行查询） | ~50ms |
| 模型 prefill（约 6k 前缀，命中缓存） | 200–400ms |
| **首个 token** | **< 600ms** |

**这张表只描述「不调工具就能答」的回合**（寒暄、答疑）。实测一个 create 回合完全不是这个形状：首 token **2008ms**，整轮 **7.4 秒**，因为首 token 要等模型决定开口、后面还有三轮工具调用。两者不该用同一个预算衡量，见 16.5。

冷启动另加 300–800ms，躲不掉，但把 chat 函数的运行时依赖压到最小能缩一点。

### 10.3 两个要盯的风险

1. **5k 的工具 schema 压在每一轮前面**，是新架构自己引进来的。寒暄那一轮其实一个工具都不需要。缓解靠 prompt caching 把这段 prefill 变便宜（前缀必须稳定，见 9.2）；practice 线只有约 1k，天然轻。真要治就得首轮不带写工具、模型要动手时再带——但那会破坏缓存前缀。**一期不做，先量 TTFT，确认 prefill 真是瓶颈再说。**
2. **Create 线用 Sol 会比 Luna 慢**（带推理）。所以流式对 create 线不是加分项而是前提：没有流式，Sol 的体感会比现在更差。

### 10.4 一个单独的决定（不要捎带着做）

`auth.getUser()` 那 100ms 想省掉，就得在本地验 JWT 签名。注意 `_shared/directSession.ts` 开头写得很清楚：它**不是**签名验证，必须在 `getUser()` 验过之后才能用它的 claims。真要改成本地验签（JWKS / JWT secret），那是一次安全相关的改动，应该单独评审，不要混在 chat 这摊里。**本方案的默认是：老实调一次 `getUser()`。**

## 11. 全局预算闸门（没有收入就必须有）

9.3 那张表的问题不是单价，是**乘法**。个人开发、没有收入的情况下，真正能伤到你的不是某个用户贵，是用户数突然变多，或者有人故意刷。

### 11.1 必须有的三道闸

**1. 全局每日预算（保命开关）**

一张表记当天全平台累计花费，超过阈值就对免费用户关掉 AI 功能，降级到手动建卡和现有 `/create` 路径，Pro 不受影响。

```sql
create table ai_budget (
  day         date primary key default current_date,
  spend_cents integer not null default 0
);
-- 每次模型调用后按 9.5 记下的 token 数折算成分，累加到今天
```

阈值先设一个你睡得着的数（比如 $2/天 = $60/月 上限）。撞到之后前端要有体面的说法，不是报错——「今天的 AI 额度用完了，明天再来，或者手动加卡」。

没有这道闸，一次 Product Hunt 推荐或者一个刷接口的脚本就能烧掉你一个月的生活费。

**2. 防刷：现在按 user_id 计数，注册新号就能重置**

`ai_usage` 只看 `user_id`。注册免费、邮箱随便填，额度就重置了。至少再加一个维度：按设备（`expo-application` 的 install id）或按 IP 的日上限。这条不做，上面所有额度都是装饰。

**3. 新用户冷静期**

注册当天不给 AI 额度（或只给 1 次），避免「注册 → 刷满 → 弃号」。代价是伤害真实新用户的首次体验，所以这条我列出来但**不建议一期做**——先上 1 和 2，看 9.5 的数据里有没有刷的痕迹。

### 11.2 优先级

| | 做什么 | 1000 活跃免费用户的月成本 |
| --- | --- | --- |
| 现状（初版方案） | Sol 全包 + 10条/天 | ~$200 |
| **① 换 Luna** | 省得最多 | ~$130 |
| **② practice 改月配额 60** | 省第二多 | **~$36** |
| ③ 全局预算闸门 | 不省钱，但封住上限 | 硬顶在你设的阈值 |
| ④ 额度 3→2 | 省 $4 | ~$32 |

①②③ 做完，④ 就没必要了——留着那 3 次去换转化。

## 12. 入口：分开，不做意图判断，不让用户选

问题：practice chat 既然只做调度 + 答疑，不在对话里真的出题，那它还需要和 create 分开入口吗？还是一个入口靠模型判断意图，或者进来让用户选一次？

**结论：入口分开。** 理由不是「两件事感觉不一样」，是三个机械上的硬约束。

### 12.1 为什么不能合成一个

| | 合并之后会怎样 |
| --- | --- |
| **工具白名单** | 模型得同时带 create 的薄写工具和 practice 的只读工具，前缀从约 1.2k / 1k 变成 2.2k+，每轮都重发 |
| **prompt caching** | 两条线的前缀合一，缓存块更大、更容易被上下文差异打散。9.3 的成本表完全建立在前缀稳定上 |
| **配额归属** | 这是最硬的一条：9.4 把两条线分成 `ai_chat_create` 30/月 和 `ai_chat` 60/月，就是因为成本不同。合并之后，一条消息进来时**根本不知道该扣哪个池子**——用模型判断的结果来扣，用户换个措辞就能绕过去 |

分池的前提是进门时就知道这是哪条线。意图判断把这个「知道」推迟到了模型跑完之后，而扣费必须发生在跑之前。

### 12.2 为什么不用让用户选一次

**这个设计在旧版里已经做过了，而且整个被删了。**

`AIChatModal.tsx`（已删）有一个 `mode === 'initial'` 的前置选择屏，三个 tab：Q&A / Vocabulary / Quiz（`:95` `ChatEntryType`、`:96` `InitialTabType`），外加每个类型各自的会话存储（`loadChatSession` / `saveChatSession` 按 entryType 分）、各自的欢迎语（`getWelcomeMessage`）、各自的 placeholder（`:1750`）、还有 `handleInitialTabChange` 时的会话切换。一堆机械开销，换来的是**在用户最想说话的那一刻先让他给自己的需求分类**。

我不确定当初删它是不是因为这个，但这条路走过。

### 12.3 真正的理由：入口位置本身就是意图

五个入口，四个零歧义：

| 入口 | 线 | 歧义 |
| --- | --- | --- |
| quiz 答错处的追问 | practice | 无 |
| Today 的卡片（卡面写着「这 3 张你一直记不住」） | practice | 无 |
| `/create` 页 | create | 无 |
| `/lessons/[id]/add-terms` | create（带 `lesson_id`） | 无 |
| lesson 详情页 | ? | **有** |

为一个有歧义的入口去做意图判断，是用全局复杂度解决一个局部问题。

**lesson 页怎么办**：不放「AI 助手」这种万能入口，放两个按动作命名的——「补充卡片」（→ create，带 `lesson_id`）和「这门课练得怎么样」（→ practice，带 `lesson_id`）。按动作命名而不是按功能命名，歧义自己就消失了。

附带的结论：**「chat」这个词不出现在 UI 上**。每个入口都说它要做的那件事。

### 12.4 跨线的真实需求：单向按钮，不是合并

有一个场景是真的：practice chat 里聊着聊着，用户说「这个知识点我没卡片，加一张」。

不为此合并两条线。做一个**单向交接**——practice chat 认出这个意图时不自己动手，给一个按钮「去补充卡片」，带上当前上下文（那个词、那个知识点）跳进 create 线。

这和 `start_practice` 是对称的：

```
practice ──[按钮]──> quiz        （start_practice）
practice ──[按钮]──> create      （新增，同样是前端工具）
create   ──[跳转]──> lesson 详情  （落库成功后）
```

两条线之间只有按钮，没有共享的工具白名单。配额归属因此永远清晰：跳过去之后的消息才算 create。

### 12.5 一个呈现上的细节

practice 的两个入口，呈现不该一样：

- **quiz 里的追问**：浮在练习之上的 sheet，答完收起来继续练。**不要把人从练习流里拽出去**——他正在一轮里，跳到全屏会话就等于中断了这一轮。
- **Today 的卡片**：全屏会话，因为那本来就是「我来看看该练什么」的时刻。

同一个 `ChatShell`，两种容器。`components/ui/Sheet.tsx` 已经有了。

## 13. MCP 本期不上线

### 13.1 它现在就是关着的

`supabase/functions/mcp/index.ts` 的 `isLocalPreviewEnabled` 要求 `MEMQ_UNSAFE_LOCAL_OAUTH_PREVIEW=true` **且** `SUPABASE_URL` 是 localhost / 127.0.0.1 / kong / host.docker.internal 的 **http** 地址，否则 503。换句话说这个 endpoint 在任何托管环境都起不来，只能对着本地 Supabase 跑（注释写了原因：那个 OAuth 原型会把 bearer token 暴露给 Auth API）。

但 app 侧是开着的：`.env` 里 `EXPO_PUBLIC_MCP_ENABLED=true`，于是 `/create` 首次进入会弹 `McpSetupSheet`，引导用户去连一个在托管环境必然 503 的服务。**这是一个确定的问题**：前端在宣传一个后端拒绝提供的能力。至少要让这两个开关由同一个事实决定。

MCP 的需求已经收到，按「是否影响本期 chat」分过类了，见第 14 节。

### 13.2 对 Phase 0 的影响：形状不变，理由变了

Phase 0（抽出 `_shared/memqTools.ts`，`mcp/tools.ts` 变薄壳）**照做，而且风险比原先更低**：它改的是一段当前不服务任何流量的代码。

变的是叙述：抽象的第一个真实消费者是 in-app chat。chat 需要一份「能按名字过滤、能自己校验参数、handler 与传输无关」的工具清单——这个需求独立于 MCP 存在。MCP 薄壳是顺带的好处，不是理由。

把 MCP 保留成一个停放的消费者，而不是直接删掉，是因为它几乎不要钱：
- `mcp/tools.ts` 现在 28 行，没有逻辑
- `mcp/tools_test.ts`（192 行，覆盖 14 个工具 + 目录形状）继续当 `memqTools` 的回归网——**这是本期真正用得上的部分**，它测的是工具层的行为，而工具层现在是 chat 在用
- 真要重启 MCP，不会发现工具层在这半年里烂掉了

### 13.3 为什么要先把 MCP 的问题列出来

工具层现在是**共用**的。如果 MCP 的问题有一部分在工具层里（权限模型、幂等、`uncertainWrite` 的语义、schema 对客户端的友好度……），那 chat 会**直接继承**这些问题，而且是在本期上线。

所以这件事不能等 MCP 重启再说。请把已知问题列一下，我按「在工具层 / 在传输层 / 在 OAuth 与网关」分三类：
- **在工具层** → 本期必须处理，因为 chat 要用
- **在传输层或 OAuth** → 本期不碰，记在这里等 MCP 重启
- **在 app 侧入口**（比如 13.1 那个开关不一致）→ 本期顺手修掉，一行的事

### 13.4 9.2 那段话要打个补丁

9.2 用「MCP 那条路的生成算在用户自己的额度上，所以重工具合理」来解释为什么 in-app chat 要用薄工具。MCP 不上线之后这个对比暂时没有现实的一侧了。

**薄工具的决定不受影响**：它站得住的理由是成本本身（$0.08/课 → $0.004/课，见 9.3），跟 MCP 在不在跑没关系。那段对比就当成「这个工具层为什么会长成现在这样」的来历来读。

## 14. MCP 的需求，和它们与 chat 的关系

四条需求，**只有一条真的影响本期**，而且是一句话的事。下面逐条。

### 14.1 需求 1：创建卡片 → 查看 → 多选导入 lesson

> MCP 可以创建卡片。创建的卡片可以在 chat 中查看，可以多选/单选批量选择导入到 lesson。这个 lesson 可以创建也可以新建（AI 要识别是不是已经有了合适的 lesson 来放这些卡片。没有的话才推荐创建，推荐创建的话要预填写好字段）

拆成三件事，影响完全不同。

**(a)「先看有没有合适的 lesson，没有才建新的」→ 共享层的缺口，本期就修**

这和 in-app create chat 的行为**是同一件事**（见 §3 典型对话第 2 步）。而且我查了：**这条规则现在哪儿都没写**。`create_lesson` 的描述只说了「优先用 create_lesson_with_practice」，`list_lessons` 的描述只说了怎么分页，没有任何一个工具的描述提到「建课之前先查一下已有的」——`list_lessons` 这个名字从没在别的工具描述里出现过。

规则写在**工具描述**里（而不是各自的 system prompt 里），两个消费者就都遵守：外部 AI 读工具描述，in-app chat 也把描述喂给模型。一个地方，一句话。

**✅ 已做**（Phase 0）：`_shared/memqTools.ts` 加了 `existingLessonRule`，挂在 `create_lesson` 和 `create_lesson_with_practice` 上；`list_lessons` 的描述补了一句说明为什么该先读它。三条描述变更，其余 11 个工具和全部 14 个 input schema 逐字未变。

**(b)「多选批量导入」→ 草稿只活在对话里，不加表**

「先看再导入」这个流程两边都要（MCP 的宿主对话、app 内的 chat），这点没有疑问。要定的是**草稿存在哪里**。

| 方案 | 含义 | 代价 |
| --- | --- | --- |
| **各自的对话里**（采用） | 每个 chat 展示自己产出的草稿，自己导入。草稿活在那次对话的上下文/前端状态里 | **零 schema 改动** |
| 跨进程共享 | MCP 建的草稿要出现在 **app 的** chat 里等人挑 | 新表 + RLS + 过期清理 + 草稿收件箱界面 |

硬障碍在这：`terms.lesson_id` 是 `NOT NULL`（`reset_all_tables.sql:23`），`mcp_create_lesson_with_practice` 连课带卡原子落库，**数据库里不存在「还没归属的卡片」这个状态**，整个仓库也没有 draft 概念。所以「跨进程共享」不是改个字段，是一个独立功能。

采用「各自的对话里」。多选这件事落在第 15 节的 `show_card_drafts` 组件上，不落在数据库。

**(c) 一个前向兼容的小动作（无论哪个读法）**

§2.2 给 in-app chat 设计的 `pending_action` 草稿是**前端内存里**的，不落库。如果将来读法 B 成立，它得升级成落库的草稿。所以现在就把 `draft_lesson` 返回的草稿结构，定成「以后能直接当表行用」的形状（每张卡一个稳定 id、带 lesson 归属建议、带来源）。零成本，省一次返工。

**(d) 「预填写好字段」不需要共享代码**

`lib/createStore.ts` 的 `lessonFromSource()` 会从来源文本推出课名和描述，但它存在的理由是 `/create` 那条**不调模型**的直通路径需要一个确定性的建议。MCP 和 in-app chat 两边都有模型，起名是模型的本职。所以这里没有要共享的代码，只有要共享的**规则**，而规则已经在 (a) 里解决了。

### 14.2 需求 2：批量管理卡片、批量重生成问题 — 零关联

> MCP 可以管理卡片。对已有的卡片批量管理。批量重生成问题。（chat 中可以不允许。）

你已经把 chat 排除了，而这和 §2.2 的白名单本来就一致（`add_practice_questions` / `replace_practice_question` 一期不给 chat）。**零关联，停放。**

两条备忘，留给 MCP 重启时：
- 工具层**还没有**批量重生成的工具。现有的是 `add_practice_questions`（追加）和 `replace_practice_question`（单个替换），要加一个 `regenerate_practice(lesson_id, card_ids[])`，语义上得先删后加。
- 但判断依据**已经有了**：`list_practice_questions` 会算 `is_stale`（`source_revision !== content_revision`），这正好就是「哪些题该重生成」。基础设施在，差的只是批量入口。

### 14.3 需求 3：读宿主对话上下文，总结知识点建卡 — 零关联，但锁定一个约束

> MCP 用户调用这个工具的时候，可以对当前对话上下文读取，然后总结对话中的知识点，创建卡片

MCP 协议下这**不需要新工具**：宿主对话的上下文本来就在外部 AI 的 context 里，它总结完直接把卡片当参数传进 `create_lesson_with_practice` 就行。

**但这条锁定了一个决定**：§9.2 把 in-app chat 换成薄工具之后，**`create_lesson_with_practice` / `add_cards_with_practice` 这两个重工具不能删**。它们正是为这个场景存在的——生成由外部 AI 完成，算在用户自己的额度上，重工具在这里是最优形状。

所以工具层最终是：**重工具给 MCP，薄工具给 in-app chat，两份白名单，一套 handler**。这也正好回答了 §13.4 那个「对比暂时没有现实一侧」的担心——需求 3 就是那一侧。

### 14.4 需求 4：沿用 app 视觉语言 + intelligence 界面 — **强关联，本期要做**

> MCP 的视觉语言要沿用我们 APP 的。使用 A2UI 生成动态的可交互的界面。
>
> 澄清：A2UI 指 intelligence 界面——AI 生成的界面，但**我们的产品只给几个已经做好的界面即可**。我们的 chat 中也需要，不能所有的回答都是纯文本。

这条我一开始归成「弱关联」是错的。关键在「**我们的 chat 中也需要**」：in-app chat 的回答不能全是纯文本，那就不是 MCP 侧的事，是本期 chat 的核心交互。

而「只给几个已经做好的界面」这个约束非常重要——模型**不生成界面**，它从一个固定的组件集里挑一个并填数据。这是一份契约，不是代码生成。完整设计见第 15 节。

**复用点照旧成立**：设计 token 已有到 CSS 的管道（`app/colors_and_type.css` 导入 `theme/colors.css` + `theme/foundations.css`，`scripts/sync-color-tokens.cjs` 同步，`npm run check:ui` 校验不漂移）。MCP 侧的 web 渲染直接吃这份变量。

**陷阱照旧要避**：别在 RN 和 web 之间共享渲染代码。共享**组件契约**（第 15 节的 props schema）和**token**，各自渲染。两边长得一样是因为 token 和契约一样，不是因为代码一样。

### 14.5 结论

| 需求 | 影响本期 chat？ | 本期动作 |
| --- | --- | --- |
| 1(a) 先查已有 lesson 再建 | **是** | **✅ 已做**：`existingLessonRule` 进共享层 |
| 1(b) 多选批量导入 | **是** | 草稿活在对话里，不加表；多选交给 `show_card_drafts` 组件（第 15 节） |
| 1(c) 草稿结构 | 前向兼容 | 把草稿定成「以后能当表行」的形状 |
| 1(d) 预填字段 | 否 | 规则已由 1(a) 覆盖，无共享代码 |
| 2 批量管理/重生成 | 否 | 停放；记下缺一个批量工具，`is_stale` 已有 |
| 3 读宿主上下文建卡 | 否 | 停放；但**锁定**：重工具不许删 |
| 4 intelligence 界面 | **是** | 本期核心交互之一，见第 15 节；token 直接复用，渲染代码不共享 |

## 15. 结构化回复：intelligence 界面

需求 4 澄清之后，这是本期 chat 的核心交互之一，不是 MCP 的附属品。

### 15.1 约束就是设计

> 我们的产品只给几个已经做好的界面即可。

这句话定下了全部架构：**模型不生成界面，它从一个固定组件集里挑一个并填数据。** 不是代码生成，不是让模型吐 HTML/JSX，是一份 props 契约。

好处很具体：
- 渲染结果永远在设计系统里，不会出现一个模型即兴发挥的界面
- props 用 zod 校验，坏数据不会渲染出一个崩掉的卡片
- 同一份契约，RN 渲一遍、web（MCP 侧）渲一遍，长得一样是因为契约和 token 一样

### 15.2 组件就是前端工具

不需要新协议。`start_practice` 本来就是按「前端工具」设计的（§4：模型调用它，后端不执行，前端渲染成一个按钮）。把这个做法推广开：

> **每个 intelligence 组件就是一个 run 在前端的工具。**

模型调 `show_card_drafts({...})`，edge function 不执行，把 props 原样作为 `component` 事件推给前端，前端渲染对应组件。校验走 `memqTools` 同一套 zod，流式走第 2.2 节那三类事件，一行新协议都不用加。

散文和组件可以同一轮出现——tool calling 天然允许「先说一句话，再调一个工具」。

### 15.3 组件集（一期，已定）

组件少一个，prompt 前缀就小一点，所以这份清单刻意压到最小。**五个，定了。**

| 组件 | 线 | 内容 | 交互 |
| --- | --- | --- | --- |
| `show_card_drafts` | create | 草稿卡片列表 + 目标课建议（并进哪一门 / 新建并预填名字和描述） | **逐张勾选** + 选目标 + 确认落库 |
| `show_study_overview` | practice | 今天各课到期数、预估时长、连续天数、今日目标 | 点某一课 → 进那门课的练习 |
| `show_struggling_cards` | practice | 一直记不住的卡 + 错次 | 点一张 → 看解释 |
| `show_card_explainer` | practice | 一张卡的正解、为什么你那个答案不对、换一种说法 | 无（纯展示） |
| `start_practice` | practice | 一个按钮 | 点 → `/quiz?entry=chat&lessonId=…` |
| （默认）散文 | 两条线 | 纯文本 | — |

五个组件。`show_card_drafts` 把「卡片列表」和「存到哪」合在一起，而不是拆成两个——拆开会多一轮往返，也多一份 schema。

**没有的东西**，免得范围漂移：没有图表、没有自由布局、没有模型自定义的表单。要加组件，先问它是否值那份 prompt 前缀。

### 15.4 成本影响

组件 schema 会进 prompt 前缀：五个组件约 **800–1200 tokens**。

- 它是**稳定前缀**，命中 cached input（见 9.2 对前缀稳定的要求），所以按缓存价算，可以忽略
- 它让 output **变便宜**：一个 `show_study_overview` 的 props 比把同样内容写成散文短得多
- 两条线各带自己那几个：create 只带 `show_card_drafts`，practice 带另外四个。白名单本来就是分开的

净效果大概是中性偏省，不改 9.3 的结论。

### 15.5 对分期的影响

组件契约必须和 `ChatShell` 一起做，不能留到后面——它决定 shell 的消息模型（一条消息可以是散文、组件，或两者）。

| Phase | 补充 |
| --- | --- |
| 1 | SSE 三类事件（`text` / `status` / `component`）；组件工具的 props schema 放进共享层，和 `memqTools` 同一套 zod |
| 2 | `ChatShell` 的消息模型支持散文 + 组件；先实现散文和 `start_practice`（最简单的组件，验证整条链路） |
| 3 | ⏳ `show_card_drafts` 组件 ✅ 已完成并验证；入口接线和落库后补题尚未做 |
| 5 | `show_study_overview`、`show_struggling_cards`、`show_card_explainer` → 模拟器验证 |

按「一次一个 family」的规矩：Phase 3 做完 create 线那一个组件，在模拟器里跑一遍，再问下一步。

### 15.6 MCP 侧怎么复用

同一份 props schema，web 渲染器另写一份，吃 `theme/colors.css` + `theme/foundations.css` 的 CSS 变量。

但这是 **MCP 重启时的工作**（第 13 节：本期不上线）。本期只要保证一件事：**组件契约放在共享层，不要塞进 RN 组件文件里**。契约和渲染分开，MCP 那天来了就只写渲染器。

## 16. Phase 1 实装记录

代码写完了，**但没有端到端跑过**。第 7 节的验收条件（curl 跑完一轮建课）**未达成**：本机没起 Supabase 栈，也没部署，所以模型调用、SSE、配额闸门、用量落库这几条真实路径一次都没走过。已有的保障是 59 个单测和对每个新模块的 `deno check`，覆盖的是纯逻辑，不是集成。

### 16.1 落地的文件

| 文件 | 作用 |
| --- | --- |
| `migrations/20261117100000_measure_ai_usage.sql` | `ai_usage` 加 model/mode/token 三件套 + `client_hash` |
| `migrations/20261117100001_create_ai_budget.sql` | 全局日预算表 + 两个 service-role-only 函数 |
| `migrations/20261117100002_chat_thread_modes.sql` | `mode` 的 CHECK 放宽到含 create/practice |
| `_shared/chatComponents.ts` | 五个组件的 props 契约 |
| `_shared/chatModes.ts` | 两条线的白名单、配额、模型、system prompt |
| `_shared/chatCost.ts` | 单价表、成本计算、预算判定 |
| `_shared/chatStream.ts` | 三类 SSE 事件的编解码 |
| `_shared/chatRequest.ts` | 请求解析 + 上下文拼装（处理不可信输入） |
| `_shared/chatToolset.ts` | 三个来源装配成一份工具清单 |
| `_shared/draftLesson.ts` | 薄工具 |
| `chat/index.ts` | 函数本体 |

### 16.2 实装推翻了方案里的五处

**(a) 薄工具不能顺带出题。** §9.2 写的是「内部调 generate-terms + generate-questions」。但 `generate-questions` 会用 `checkQuestionAccess` 拿 `lessonId` 和卡片 id 去库里校验——它只能对**已落库**的卡片出题，而草稿的全部意义就是还没落库。所以 `draft_lesson` 只调 `generate-terms` / `generate-vocab-terms`（和 `/create` 选的是同两个），出题留到卡片落库之后。顺带发现：出题现在是 lesson 页上一个**手动按钮**（`handleGenerateQuestions`），不是存完自动跑。落库后自动补题是 Phase 3 该做的事。

**(b) `pending_action` 这个机制不需要存在。** §2.2 设计它是为了「模型要写 → 先问人」。但薄工具之后模型根本不发起写：`draft_lesson` 只生成，`show_card_drafts` 只展示，真正的落库是**前端**在人勾选并确认之后发起的。确认就是那个组件本身。所以 `ChatToolKind` 只有 `server` 和 `client` 两种，没有第三种。

**(c) 客户端工具终结这一轮。** 模型调出一个组件后，不再把「已展示」喂回去让它补一句话——那要再付一整个 prefix 换一句废话。组件发出去，这轮就结束；开场那句话本来就在同一次响应的流里先到了。

**(d) practice 线本期没有任何 server 工具。** 三个只读进度工具在 Phase 4。`show_study_overview` 和 `show_struggling_cards` 这两个组件**定义了但故意没进白名单**——没有数据工具，模型只能编数字，那比没有这个界面更糟。`chat_test.ts` 里有一条测试专门钉住这个状态，Phase 4 接上时它会要求你改掉。

**(e) `chat_threads.mode` 是放宽而不是改写。** 原 CHECK 只允许 `('ask','vocab_lookup','practice')`。把老值重新归类到新值会悄悄改变别人真实发生过的对话，所以迁移是把 CHECK 扩成四个值，老行原样留着，新代码只写 create/practice。

### 16.3 另外两处实现层的决定

- **客户端类型统一到 `npm:`**。函数本来从 `https://esm.sh/@supabase/supabase-js@2` 导入，但共享工具层的 `SupabaseClient` 来自 `npm:@supabase/supabase-js@^2`，同一个库的两份类型对编译器是两个类型，client 传不进 `chatToolset`。统一到 `npm:`（MCP 函数已经在运行时用 `npm:`，说明边缘运行时支持）。
- **不设 `reasoning` 参数**。Luna 支持 `effort: 'none'`、Astra 不支持（会 400），而 Responses API 的 tool calling 本来就不需要这个 flag。不传就是不会因为取值不被支持而失败；现有单发函数里的 `none` 要留着。

### 16.4 要达成验收还差什么

```
supabase start
supabase functions serve chat --env-file supabase/.env.local   # 要有 OPENAI_API_KEY
curl -N -X POST http://localhost:54321/functions/v1/chat \
  -H "Authorization: Bearer <一个真实用户的 access token>" \
  -H "Content-Type: application/json" \
  -d '{"mode":"create","message":"我想学意大利语点菜"}'
```

要看的东西，按重要性：
1. **TTFT**（第 10 节的预算是热启动 600ms 内）
2. 事件顺序是否是 `status` → `text` → `component`
3. `ai_usage` 里的 `cached_tokens` —— 如果远低于 §9.3 的估算，说明 prefix 不稳定，成本会翻几倍
4. `ai_budget.spend_micros` 有没有在涨
5. 配额撞线时回的是 `error` 事件而不是 HTTP 错误

### 16.5 端到端验证做到了哪一步

分两类说，因为结论很不一样。

**真跑过、通过的**

| 验了什么 | 怎么验的 |
| --- | --- |
| 三个迁移能应用 | 起一次性 Postgres，手搭最小前置（三个角色、`auth.users`、`profiles`、`ai_usage`、带内联命名旧 CHECK 的 `chat_threads`），按序应用 |
| 预算累加正确 | `ai_budget_add(206)` → 206，再 `(294)` → 500，`ai_budget_today()` 同为 500，`calls` 为 2 |
| 负数被拒 | `ai_budget_add(-1000)` 抛异常——不能把已花的额度倒回去 |
| **预算函数只有 service_role 能执行** | `has_function_privilege` 断言 `anon` / `authenticated` 都不能 execute、`service_role` 能；`ai_budget` 开了 RLS 且**没有任何 policy** |
| `mode` 约束放宽正确 | 接受 create/practice，保留 ask，仍拒绝非法值；**而且只剩一个 CHECK 约束**（证明 DO 块真的找到并删掉了自动命名的旧约束） |
| 三个迁移可重复应用 | 全部再应用一遍，干净通过；之后约束仍在且仍只有一个 |
| 模块图运行时能加载 | 用假环境变量 `deno run` 真把函数启起来——`deno check` 只证明类型，这一步证明 `jsr:` 类型导入和 `npm:` 说明符在运行时不炸 |
| CORS、HTTP 方法、401 | preflight 回 200 带头；GET 回 `bad_request`；无 token 和伪造 bearer 都回 `unauthorized`，且**auth 在 mode 校验之前**拦住 |
| SSE 封帧 | 以上拒绝都是真实 HTTP 上的单事件 `data: {...}` 流，不是 HTTP 错误码 |

**模型那一段：真跑过了，用隔离 harness**

绕开了卡住的数据库问题——harness 用真实的 system prompt、真实的工具定义（走 `chatToolset`）、真实的 Responses API 调用和事件解析、真实的工具循环，只把 Supabase 和卡片生成打桩。每种配置各跑一次（**n=1，下面的差异不能当因果结论**）。

验到的：
- Responses API 的请求形状正确（`tools` 数组、`instructions`、`store: false`、流式事件名）
- **`existingLessonRule` 真的起作用**：模型第一步就调 `list_lessons`，最后选了 `kind: 'existing'` 把卡片并进已有的那门课并给出理由，而不是新建
- `show_card_drafts` 的 props **一次过 zod**，包括那个容易填错的 `target` union
- `draft_lesson` 的参数推断正确（`learning_mode: 'language'`、`card_count: 5`）
- 真实用量：prompt 4117（cached 2412）、completion 497 → **$0.000444**，缓存命中 **58.6%**，和 §9.3 假设的量级一致

| | 修改前 | 修改后 |
| --- | --- | --- |
| 开场白 | 一个字都没有 | 2008ms 出现 |
| 工具轮次 | 4（含一次无用的 `list_cards`） | 3 |
| 总耗时 | 14.1s | 7.4s |
| TTFT | n/a | 2008ms |

**仍然没跑过的**：token 用量落库、`ai_budget` 真的涨、配额撞线和预算撞线分支——这些都要真 token 和真数据库，卡在 16.6。

### 16.8 harness 抓到的两个缺陷（已修）

**(a) `MAX_TOOL_ROUNDS` 设小了，会误报「卡住了」。** 原值 3，是按「读一下再起草 = 2 轮」猜的。实测正常路径是 3 轮服务端工具 + 第 4 轮出组件，正好用光、零余量。再多一次探索调用，或者 props 填错触发重试分支（也占一轮），用户就会收到「我卡住了，换个说法」——而实际什么都没错。改成 6：容得下那次重试和两次多看。没用到的轮次不花钱，循环在模型停止调工具时就结束。

**(b) 模型一个字都不说。** 第一次跑整轮 14 秒、零散文输出，人只能看到 status 事件。往 create 的 prompt 加了一句「第一次调工具前先说一句你要做什么，别让人干等」。代价约 15 个 token 的前缀（会命中缓存）。

### 16.6 挡路的东西：迁移链从零应用是坏的（既有问题）

`supabase start` 起不来，不是端口的事（端口已经让开了）。是迁移链本身：

```
Applying migration 20260430195800_seed_llm_curated_lessons.sql...
ERROR: relation "public.lessons" does not exist (SQLSTATE 42P01)
```

`migrations/` 里有 9 个**没有时间戳前缀**的文件（`reset_all_tables.sql`、`create_srs_schema.sql`、`create_chat_messages_table.sql`、`add_mode_to_chat_threads.sql`、`add_is_vocab_mode_to_lessons.sql`、`create_avatars_storage_bucket.sql`、`create_chat_threads_table.sql`、`create_pdfs_storage_bucket.sql`、`reset_all_tables.sql`）。Supabase CLI 只认 `<timestamp>_name.sql`，这些全被跳过——而 `public.lessons` 就建在 `reset_all_tables.sql` 里。

**这不是本次引入的**，但后果是本地没法复现数据库，于是函数的运行时验证全卡住：没有本地栈就没有 auth，拿不到真 token，配额、预算、工具调用都走不到。

修法有三条，哪条都不该顺手做：
1. **给那 9 个文件补时间戳前缀**，让它们排在依赖它们的迁移之前。最彻底，但要确认远端 `supabase_migrations.schema_migrations` 里的记录不会因此错位——弄错会让托管库以为有迁移没应用。
2. **`supabase db pull`** 从远端拉一份当前 schema 作为基线迁移，老文件归档。干净，但要连生产库，而且会往仓库里加一个大文件。
3. **本期不修**，函数验证改为部署到一个独立的 Supabase 项目上做。绕开问题而不是解决它。

### 16.7 本地端口改动

`supabase/config.toml` 新增了 `[functions.chat]` 和一段 `[api]/[db]/[studio]/[inbucket]/[analytics]` 的端口（54721+）。默认的 54321+ 被本机另一个无关项目 `def-platform` 占着，另有两个 MemQ 栈在 554xx / 564xx。`[functions.chat]` 要留（部署需要），端口那段只影响本地，改回去也行。

## 17. Phase 2 实装记录

### 17.1 落地的文件

| 文件 | 作用 |
| --- | --- |
| `lib/chatEvents.ts` | 事件契约 + **增量** SSE 解析器（chunk 不按事件边界到达） |
| `lib/chatTurn.ts` | 一个回合的 reducer：parts、status、错误、断流收尾 |
| `lib/chatClient.ts` | `expo/fetch` 流式调用，**数据源可注入** |
| `components/chat/ChatShell.tsx` | 聊天面；不认识任何组件名 |
| `app/chat-lab.tsx` | dev-only 实验页，6 个脚本化场景 |
| `lib/supabase.ts` | +2 个导出（`functionsUrl`、`publishableKey`） |
| `tests/chatTurn.test.mjs` | 11 个测试 |

### 17.2 第一个技术风险：RN 的 fetch 不能流式

React Native 自带的 `fetch` 走 XMLHttpRequest，响应体要等完整才给——整个 SSE 设计会直接落空。Expo SDK 57 带了 `expo/fetch`（WinterCG 版，`response.body` 是真正的 `ReadableStream`），用它解决。`supabase.functions.invoke` 同样不能流式，所以端点是直接调的，为此从 `lib/supabase.ts` 导出了基址。

### 17.3 三个值得单独测的点

- **tokens 要并进同一个 part**，否则一段话会变成上千个气泡
- **组件要关掉它前面的散文**，这样组件后面的话另起一段，而不是贴到卡片上方的文字里
- **断流要有归宿**：流没说 done 就停了，半句话留着、等待停掉、给重试。否则思考中的脸会一直转

还有一个解析器的坑：CRLF。我的服务端发 `\n\n`，但代理可能改写行尾，而 `\r\n\r\n` 里没有相邻的 `\n\n`。修法是规范化**整个 buffer** 而不是单个 chunk——逐 chunk 规范化会把被切断的 CRLF 变成两个 `\n`，伪造出一个事件边界。

### 17.4 模拟器里验过的

| 场景 | 结果 |
| --- | --- |
| 正常回答 | 流式逐字长出、`\n\n` 正确分段、组件由 `renderComponent` 画出、Send 的 loading 态正确 |
| 流中断 | 半句话留着、等待停止、红色说明 + Try again |
| 配额用尽 | 红色说明，**没有** Try again（这条重试不掉） |

另外三个场景（无散文、未知组件、线路噪声）写在 lab 里但**没有逐个点过**。

修掉一个视觉缺陷：返回栏压在状态栏上——根容器要用 `EdBase`（它管安全区），我原来用了裸 `View`。

### 17.5 一处有意的重复

事件契约在 `lib/chatEvents.ts` 和 `supabase/functions/_shared/chatStream.ts` 各写了一份。app 和 edge function 是两个 TypeScript 世界（`tsconfig.json` 排除了 `supabase/functions`，Deno 也解析不了 `@/` 别名），互相 import 不了。两边类型名保持一致，这样漂移在 diff 里看得见。

## 18. Phase 3 进度：show_card_drafts

### 18.1 已完成

| 文件 | 作用 |
| --- | --- |
| `lib/chatDrafts.ts` | 草稿的读取（防御式）、初始勾选、以及**落库** |
| `components/chat/CardDrafts.tsx` | 组件本身 |
| `tests/chatDrafts.test.mjs` | 9 个测试 |

**落库抽成了可测的函数**，不写在组件里——这步出错会丢用户数据（存错课、漏卡），值得被钉住。测到的：新建课是「先 lessons 后 terms」两步、并入已有课**不会**多建一门、只写勾选的那些、空选在任何写入之前就被拒、lessons 失败时 terms 不会被尝试。

落库路径和现有 `/create-name`、`add-terms` 完全一致（同样的表、同样的 `clearCache` 调用），没有另起一套。

**模拟器里验过**：组件头部（去哪、为什么）、五张卡的勾选态、`preselected` 生效、未选置灰、计数跟随（3 → 4）、Select all。

### 18.2 修掉一个滚动缺陷

组件一到，聊天流就滚到底，把组件**头部顶出了屏幕**——而「这些卡要去哪」正是做决定前最该读的一行。改成组件布局完成时滚到**它的顶部**：`ChatShell` 记下每个回合的 y 和组件在回合内的 y，两者相加得到内容坐标。散文仍然滚到末尾。

### 18.3 ~~一个真的功能缺口：语言卡的细节会丢~~ → 已补上，但不是用显而易见的办法

`draft_lesson` 只带 term / definition / explanation，所以**通过 chat 建的语言卡没有发音、例句、词形、近义词**——而同样的卡从 `/create` 走 `generate-vocab-terms` 是有的。

要补就得把 language_data 贯穿整条链路：工具的返回、`show_card_drafts` 的 props schema、客户端类型。代价是组件的 prompt 前缀会明显变大（§15.4 的前提是组件集保持小）。

**决定：带上。但细节不经过模型。**

直觉的做法是让 `draft_lesson` 把 `language_data` 返回给模型，模型再原样填进 `show_card_drafts`。这正是 §9.2 费劲拿掉的东西——每张卡的发音、词形、例句、近义词会被付两次 chat 模型的价：一次读工具结果，一次回传。5 张卡就是几百个 output token，而 output 是最贵的那一档。

真正的办法是**根本不让它出去**。`draft_lesson` 和 `show_card_drafts` 发生在**同一次请求的工具循环里**，所以细节可以留在服务端：

```
draft_lesson 生成（含细节）
  → slimForModel() 去掉细节，模型只看到 id/term/definition
  → 模型回传 show_card_drafts，只带 id
  → withDetails() 按 id 贴回
  → 校验 → 发给 app
```

按 id 匹配，所以模型丢卡、换序、只展示一部分都不影响；凭空编的 id 拿不到别人的细节（有测试钉住）。贴回发生在**校验之前**，所以到达 app 的 props 是整体校验过的。

组件 schema 里 `language_data` 是可选字段且**不写 description**——不向模型介绍它，省得它想去填。

**保存侧的规矩**：细节只写进语言课。新建课看 `learning_mode`；已有课看模型从 `list_lessons` 读到并带过来的 `learning_mode`（给 existing target 加了这个字段，比多查一次库便宜）。模型没说的时候**不写**——宁可丢一个细节，也不要把语言数据放到知识课上。

**显示**：卡片上只露两样帮助判断的——怎么读、一个例句。其余存下来，在卡片本身上读。

### 18.4 还没做的

- ~~**入口接线**~~：`/create` 的入口已接（见 19 节）；`/lessons/[id]/add-terms` 还没
- **`generate-vocab-terms` 的真实输出没验过**：细节的链路是用脚本数据验的，真实生成器返回的 `language_data` 形状是否都能过，要等后端通了才知道
- **落库后补题**：现在出题是 lesson 页的手动按钮。存完自动补题会在每次保存时多花一次 Luna 调用，考虑到没有收入，这应该是你点头的事而不是我顺手加的
- **真后端**：仍走脚本流，真实链路卡在迁移链（16.6）

### 18.5 注意：lab 的保存是真的

`chat-lab` 里两个草稿场景的 Keep 按钮**会真的写库**，写进这个 build 指向的项目。场景说明里加了警告，我自己验证时没有按它。

## 19. `/create` 入口已接

### 19.1 放在哪、叫什么

`app/create-chat.tsx`，入口是 `/create` 动作行里的 **"Talk it through"**，夹在 Attach 和 Generate 之间。

- **不叫 chat，也不叫 AI**（§12.3：按动作命名）
- **放在 Attach 旁边而不是 Generate 对面**：Generate 仍是主路；这是「一句话说不清」时的另一条路，该安静
- 现有的一句话直通路径**一行没改**
- 图标是新画的 `sparkle`（四角星 + 一颗小的），加进了 `components/iconArt.ts`。那套图标来自四个开源集，里面**没有** sparkle，所以这个是手画的，注释里写明了来源，没有混进那四套的署名里。
  - **不用 `zap`**：在这个 app 里它已经是 Pro/升级（unlock-pro、you 页），入口会被读成付费功能
  - **不用 `message`**：那是帮助中心，意思是找人工
  - **先用过 `star`，是错的**：五角星是评分，不是「机器替你写了点东西」
  - 两颗而不是一颗：单颗 sparkle 读作「新」，成对才读作「生成的」

### 19.2 顺带确认了 §13.1 那个问题是活的

打开 `/create` 时 `McpSetupSheet` 弹了出来，引导去连 Claude / ChatGPT / Cursor——而那个 endpoint 在托管环境必然 503。前端在宣传后端拒绝提供的能力，这一幕在模拟器里看得见。一行开关的事，但得你决定是关掉引导还是放开 gate。

### 19.3 真实链路验到哪了

在模拟器里对**真后端**发了一条消息，结果是：

```
Chat is unavailable (404).
Try again
```

这恰恰说明客户端这条路是通的：读到了本地会话（登录态）、用 `expo/fetch` 发出请求、到达真实的 Supabase functions 网关、拿到 404（函数未部署）、按设计显示成可重试的错误。**`liveSource` 接线正确，缺的只是部署。**

### 19.4 到真实端到端可能比想的近

之前以为被迁移链卡死（16.6），但那是 `supabase start` / `db reset` **从零重建**的问题。往托管项目推不一样：

- `supabase functions deploy chat` —— 不碰数据库
- `supabase db push` —— 只应用 `supabase_migrations.schema_migrations` 里没有的迁移。那 9 个没有时间戳前缀的文件 CLI 根本不认，所以不会被尝试；要推的只有我新加的三个

两条都**写生产**，所以要你明确点头，而且 `db push` 前应该先 `--dry-run` 看它到底打算做什么。

## 20. Today 的入口

### 20.1 位置和内容：一张卡，两个入口

`app/(tabs)/index.tsx`，**stats 卡和 Continue Learning 之间**，**两张独立的卡片**并排：

```
┌─ 淡紫 ──────────┐  ┌─ 淡蓝 ──────────┐
│       ✦         │  │       ?         │
│ What do you     │  │ Ask about your  │
│ want to learn?  │  │ cards           │
│ Explained, then │  │ What something  │
│ made into cards │  │ means, or why   │
└─────────────────┘  └─────────────────┘
```

**两张卡而不是一张带分隔线的**：它们是两件不同的事，就该各自是一张卡。

**上色而不是留白**：这屏上下都是柠檬黄底上的白卡，再来一张白的就混进那串列表里了。用的是运行时调色板已有的两个柔和面——`colors.tint`（淡紫，属于 accent，给**会替你写东西**的那张）和 `colors.infoL`（淡蓝，明显是另一回事，给**只回答**的那张）。图标底换成白色：在淡紫卡上放一块柠檬绿是凭空多出来的第三个颜色。

### 20.1.0 第一张卡的文案，以及它背后的产品改动

原来写的是「Talk through a new lesson / Build a new lesson」——那是在描述**建课**。但一个问「虚拟语气是什么」的人，想要的是知道虚拟语气是什么。

所以文案改成 **「What do you want to learn? / Explained, then made into cards」**，而且 **create 那条 system prompt 跟着重写了**，这才是实际改变行为的部分：

| | 原来 | 现在 |
| --- | --- | --- |
| 开场定位 | 「把你想学的东西变成卡片」 | 「先教会你，再帮你留住它。顺序如此：讲解才是目的，卡片是它活过这周的方式」 |
| 先做什么 | 先问清楚（科目、数量、语言），再起草 | **先回答**。能讲就讲，不要在说出任何有用的东西之前盘问；只有真的答不了才问，而且只问一个 |
| 卡片 | 必然产出 | 讲完**提议**做卡片并说明会覆盖什么。「如果他们只是想知道，就让他们知道——不是每个回答都得变成卡片，硬推比让他们再问一次更糟」 |
| 散文长度 | 「一两句话」 | 「主题需要多长就多长」——因为讲解本身就是散文；但**仍然不许**把草稿卡片列成散文，那是组件的事，重复一遍等于让人读两遍 |

最后那条是必须一起改的：原来的「保持简短」是为一个只产卡的助手写的，留着它会直接和「把知识讲明白」打架。

### 20.1.1 「进去之后做意图判断」为什么还是不做

被重新问过一次，答案没变，理由也不是「之前定了」：

**配额必须在模型跑之前扣**。create 是 30 条/月、practice 是 60 条/月，因为单条成本差约 20 倍（§9.3）。意图判断要等模型跑完才知道是哪条线——那时候钱已经花了。而且用模型判断的结果来扣费，用户换个措辞就能绕过去。

两个入口恰恰避开了这个问题：进门时就知道是哪条线，扣费在模型之前。

真实的跨线需求（practice 里聊着聊着想加卡）靠 §12.4 的**单向按钮**：给一个按钮跳进 create 并带上上下文，而不是把两条线合成一条。

### 20.1.2 两条 chat 都从底部升起

`app/_layout.tsx` 给 `create-chat` 和 `practice-chat` 配了 `presentation: 'card', animation: 'slide_from_bottom'`，和 `/create`、`/create-name`、`/quiz` 一样；屏幕顶上是 `CloseButton`（×）而不是返回箭头。

这不只是动效偏好：**升起 + 关闭**说的是「你踏进来，完事就离开」，**滑入 + 返回**说的是「这是路径上更深的一页」。chat 是前者——它不是 Today 的下一级。

### 20.2 practice 线的路由

`app/practice-chat.tsx`，和 `create-chat` 对称，但**不传 `renderComponent`**——practice 线在白名单里的两个组件（`show_card_explainer`、`start_practice`）还没实现，现在它只用散文回答。接收 `lessonId` / `cardId` 参数，给 quiz 答错处的追问入口（§4）留好了口子。
