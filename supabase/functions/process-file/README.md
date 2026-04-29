# Process File Edge Function

这个 Supabase Edge Function 使用 MinerU API 来解析 PDF 文件，提取文本内容，然后使用 OpenAI 提取 Terms 和 Definitions。

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
supabase secrets set MINERU_API_TOKEN=your_mineru_api_token
supabase secrets set OPENAI_MODEL=gpt-4o-mini  # 可选，默认为 gpt-4o-mini
```

4. 部署函数：
```bash
supabase functions deploy process-file
```

## 环境变量

需要在 Supabase Dashboard 的 Edge Functions 设置中配置：

- `OPENAI_API_KEY`: OpenAI API 密钥（必需）
- `MINERU_API_TOKEN`: MinerU API Token（必需）- 在 [MinerU API 管理页面](https://mineru.net/apiManage/docs) 申请
- `OPENAI_MODEL`: OpenAI 模型名称（可选，默认为 `gpt-4o-mini`）

## 前置条件

### 创建 Supabase Storage Bucket

在 Supabase Dashboard 中创建名为 `pdfs` 的 Storage Bucket：

1. 进入 Supabase Dashboard → Storage
2. 点击 "New bucket"
3. 名称：`pdfs`
4. 设置为 Public（公开访问，以便 MinerU API 可以访问）
5. 创建 RLS 策略，允许认证用户上传文件

### 获取 MinerU API Token

1. 访问 [MinerU API 管理页面](https://mineru.net/apiManage/docs)
2. 注册/登录账号
3. 申请 API Token
4. 将 Token 设置为环境变量

## API 使用

### 请求

```typescript
POST https://your-project-ref.supabase.co/functions/v1/process-file
Content-Type: application/json
Authorization: Bearer YOUR_ACCESS_TOKEN

{
  "pdf_url": "https://your-storage-url.com/path/to/file.pdf"
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
  "count": 2,
  "textLength": 15234,
  "processedLength": 15000
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

### 完整流程示例

```typescript
// 1. 上传 PDF 到 Supabase Storage
const fileResponse = await fetch(asset.uri);
const fileBlob = await fileResponse.blob();
const fileName = `${user.id}/${Date.now()}_${asset.name}`;

const { data: uploadData, error: uploadError } = await supabase.storage
  .from('pdfs')
  .upload(fileName, fileBlob, {
    contentType: 'application/pdf',
  });

if (uploadError) {
  throw new Error(`Failed to upload: ${uploadError.message}`);
}

// 2. 获取公开 URL
const { data: urlData } = supabase.storage
  .from('pdfs')
  .getPublicUrl(fileName);

// 3. 调用 Edge Function
const { data, error } = await supabase.functions.invoke('process-file', {
  body: {
    pdf_url: urlData.publicUrl,
  },
});

if (error) {
  console.error('Error:', error);
} else {
  console.log('Extracted terms:', data.results);
}
```

## 工作流程

1. **前端上传 PDF** → Supabase Storage
2. **获取公开 URL** → 用于 MinerU API
3. **调用 Edge Function** → 传入 PDF URL
4. **Edge Function 调用 MinerU API** → 创建解析任务
5. **轮询任务状态** → 等待解析完成（最多 2 分钟）
6. **获取解析结果** → 提取文本（Markdown 或 JSON）
7. **调用 OpenAI** → 提取 Terms 和 Definitions
8. **返回结果** → 前端显示提取的 Terms

## MinerU API 说明

- **API 端点**: `https://mineru.net/api/v4/extract/task`
- **认证方式**: Bearer Token
- **文件要求**: 
  - 单个文件大小不超过 200MB
  - 页数不超过 600 页
  - 需要提供文件的公开 URL（不能直接上传文件）
- **解析模型**: `vlm`（视觉语言模型，适合复杂 PDF）
- **每日额度**: 每个账号每天享有 2000 页的最高优先级解析额度

## 特性

- ✅ 使用 MinerU API 进行高质量 PDF 解析
- ✅ 支持复杂 PDF（包括扫描版和图文混排）
- ✅ 自动轮询任务状态
- ✅ Markdown 到纯文本的智能转换
- ✅ OpenAI 提取 Terms 和 Definitions
- ✅ 完整的错误处理
- ✅ 支持 CORS

## 注意事项

1. **Storage Bucket 配置**: 确保 `pdfs` bucket 设置为 Public，以便 MinerU API 可以访问
2. **文件清理**: 建议在处理完成后清理上传的 PDF 文件，节省存储空间
3. **轮询超时**: 当前设置为最多轮询 60 次（2 分钟），对于大文件可能需要调整
4. **文本长度限制**: 提取的文本会被截断到 15,000 字符，以确保不超过 OpenAI Token 限制

