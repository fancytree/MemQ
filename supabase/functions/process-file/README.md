# Process File Edge Function

这个 Supabase Edge Function 使用 MinerU API 来解析 PDF 文件，提取文本内容，然后使用 OpenAI 提取 Terms 和 Definitions。

**状态：私有 PDF 流程目前只在本地准备，尚未部署或完成真实 MinerU 联调。** 线上 `pdfs` 桶仍为公开状态；不要直接关闭公开访问，需先验证兼容旧版 App 的服务端改动并确认其他调用方。

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
supabase secrets set OPENAI_MODEL=gpt-6-luna  # 可选，默认为 gpt-6-luna
```

4. 部署函数：
```bash
supabase functions deploy process-file
```

## 环境变量

需要在 Supabase Dashboard 的 Edge Functions 设置中配置：

- `OPENAI_API_KEY`: OpenAI API 密钥（必需）
- `MINERU_API_TOKEN`: MinerU API Token（必需）- 在 [MinerU API 管理页面](https://mineru.net/apiManage/docs) 申请
- `OPENAI_MODEL`: OpenAI 模型名称（可选，默认为 `gpt-6-luna`）
- `MEMQ_PUBLIC_SUPABASE_URL`：仅在 Edge Runtime 使用的内部 Supabase 地址与客户端访问地址不同时设置；必须是受信任的对外项目根地址。服务端签发的 URL 会使用该地址供解析服务访问。

## 前置条件

### 创建 Supabase Storage Bucket

在 Supabase Dashboard 中创建名为 `pdfs` 的 Storage Bucket：

1. 进入 Supabase Dashboard → Storage
2. 点击 "New bucket"
3. 名称：`pdfs`
4. 在已验证的私有化部署中设置为 Private，并通过 Storage API 或管理台调整桶配置
5. 配置 RLS，只允许认证用户上传、读取和删除自己目录下的文件

先在独立测试环境验证签名 URL 和 MinerU 的实际处理，再按部署计划调整现有线上桶。不要将 MinerU Token 放进 `EXPO_PUBLIC_*` 等客户端可见配置。

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
  "pdf_url": "https://your-project-ref.supabase.co/storage/v1/object/sign/pdfs/<user-id>/<file>?token=<short-lived-token>"
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
  "message": "Unable to process this PDF. Please try again."
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

// 2. 获取供解析服务临时访问的签名 URL（15 分钟）
const { data: urlData, error: signError } = await supabase.storage
  .from('pdfs')
  .createSignedUrl(fileName, 15 * 60);
if (signError || !urlData?.signedUrl) throw new Error('Could not prepare the PDF');

// 3. 调用 Edge Function
const { data, error } = await supabase.functions.invoke('process-file', {
  body: {
    pdf_url: urlData.signedUrl,
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
2. **获取短期签名 URL** → 用于标识上传的文件
3. **调用 Edge Function** → 传入 URL；服务端验证用户及文件归属
4. **Edge Function 签发新的短期 URL 并调用 MinerU API** → 创建解析任务
5. **轮询任务状态** → 等待解析完成（最多 2 分钟）
6. **获取解析结果** → 下载 MinerU 返回的压缩包并提取 `full.md`；限制下载和解压大小
7. **调用 OpenAI** → 提取 Terms 和 Definitions
8. **返回结果** → 前端显示提取的 Terms

## MinerU API 说明

- **API 端点**: `https://mineru.net/api/v4/extract/task`
- **认证方式**: Bearer Token
- **文件要求**: 
  - 单个文件大小不超过 200MB
  - 页数不超过 600 页
  - 当前实现向解析服务提供短期可访问的签名 URL；实际可用性仍需在隔离环境联调
- **解析模型**: `vlm`（具体能力和额度以 MinerU 当前文档及账户配置为准）

## 特性

- 本地实现支持轮询任务、提取 Markdown 并调用 OpenAI。真实 MinerU 到 OpenAI 的完整流程仍需使用隔离测试配置验证。

## 注意事项

1. **Storage Bucket 配置**: 私有化方案尚未部署；完成兼容性和解析联调后，再调整桶与策略
2. **文件清理**: 建议在处理完成后清理上传的 PDF 文件，节省存储空间
3. **轮询超时**: 当前设置为最多轮询 60 次（2 分钟），对于大文件可能需要调整
4. **文本长度限制**: 提取的文本会被截断到 15,000 字符，以确保不超过 OpenAI Token 限制

