# RevenueCat Webhook 配置指南

## 概述

RevenueCat 已经自动处理了收据验证和订阅管理。配置 Webhook 可以自动同步订阅状态到 Supabase，确保数据一致性。

## 为什么需要 Webhook？

虽然 RevenueCat 已经处理了订阅验证，但配置 Webhook 可以：
1. **自动同步到 Supabase**：当订阅状态变化时，自动更新数据库
2. **数据一致性**：确保 Supabase 数据库与 RevenueCat 保持同步
3. **实时更新**：无需等待客户端刷新即可更新订阅状态
4. **跨设备同步**：用户在其他设备上购买后，所有设备都能立即看到更新

## 配置步骤

### 步骤 1: 创建 Supabase Edge Function

创建 `supabase/functions/revenuecat-webhook/index.ts`：

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  try {
    const webhook = await req.json();
    
    // 验证 Webhook 签名（可选，但推荐）
    // RevenueCat 会在请求头中包含签名，可以用来验证请求的真实性
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 处理不同类型的 Webhook 事件
    const eventType = webhook.event?.type;
    const appUserId = webhook.event?.app_user_id;
    
    if (!appUserId) {
      return new Response(
        JSON.stringify({ error: 'Missing app_user_id' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 根据事件类型处理
    switch (eventType) {
      case 'INITIAL_PURCHASE':
      case 'RENEWAL':
      case 'PRODUCT_CHANGE':
      case 'UNCANCELLATION':
        // 订阅激活或续费
        await updateSubscriptionStatus(supabase, appUserId, webhook.event, true);
        break;
        
      case 'CANCELLATION':
      case 'EXPIRATION':
        // 订阅取消或过期
        await updateSubscriptionStatus(supabase, appUserId, webhook.event, false);
        break;
        
      case 'BILLING_ISSUE':
        // 计费问题（订阅可能仍然有效，但需要处理）
        // 可以根据需要决定是否更新状态
        break;
        
      default:
        console.log('Unhandled event type:', eventType);
    }

    return new Response(
      JSON.stringify({ received: true }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

async function updateSubscriptionStatus(
  supabase: any,
  userId: string,
  event: any,
  isActive: boolean
) {
  // 从 event 中获取订阅信息
  const entitlement = event.entitlements?.['river_pro']; // 你的 entitlement ID
  const productId = entitlement?.product_identifier || '';
  
  // 判断计划类型
  let planType: 'monthly' | 'yearly' | null = null;
  if (productId.includes('monthly') || productId.includes('month')) {
    planType = 'monthly';
  } else if (productId.includes('yearly') || productId.includes('year') || productId.includes('annual')) {
    planType = 'yearly';
  }
  
  // 计算过期时间
  const expiresAt = entitlement?.expires_date 
    ? new Date(entitlement.expires_date)
    : null;

  // 更新数据库
  const { error } = await supabase
    .from('profiles')
    .upsert({
      id: userId,
      is_pro: isActive,
      subscription_plan: planType,
      pro_expires_at: expiresAt?.toISOString() || null,
      last_updated: new Date().toISOString(),
    }, {
      onConflict: 'id',
    });

  if (error) {
    console.error('Error updating subscription:', error);
    throw error;
  }
}
```

### 步骤 2: 部署 Edge Function

```bash
# 安装 Supabase CLI（如果还没有）
npm install -g supabase

# 登录 Supabase
supabase login

# 链接项目
supabase link --project-ref your-project-ref

# 部署函数
supabase functions deploy revenuecat-webhook
```

### 步骤 3: 配置 RevenueCat Webhook

1. 登录 [RevenueCat Dashboard](https://app.revenuecat.com/)
2. 进入你的项目
3. 进入 **Settings** > **Integrations** > **Webhooks**
4. 点击 **Add Webhook**
5. 填写：
   - **URL**: `https://your-project.supabase.co/functions/v1/revenuecat-webhook`
   - **Events**: 选择以下事件：
     - `INITIAL_PURCHASE`
     - `RENEWAL`
     - `CANCELLATION`
     - `EXPIRATION`
     - `BILLING_ISSUE`
     - `PRODUCT_CHANGE`
     - `UNCANCELLATION`
6. 点击 **Save**

### 步骤 4: 测试 Webhook

1. 在应用中完成一次测试购买
2. 在 RevenueCat Dashboard 中查看 **Events** 标签
3. 在 Supabase Dashboard 中查看 **Edge Functions** > **Logs**
4. 检查数据库是否已更新

## Webhook 事件类型

### INITIAL_PURCHASE
用户首次购买订阅时触发。

### RENEWAL
订阅自动续费时触发。

### CANCELLATION
用户取消订阅时触发（订阅仍然有效直到过期）。

### EXPIRATION
订阅过期时触发。

### BILLING_ISSUE
计费失败时触发（例如信用卡过期）。

### PRODUCT_CHANGE
用户更改订阅计划时触发。

### UNCANCELLATION
用户取消后重新激活订阅时触发。

## 安全考虑

### 验证 Webhook 签名（推荐）

RevenueCat 会在请求头中包含签名，可以用来验证请求的真实性：

```typescript
import { createHmac } from 'https://deno.land/std@0.168.0/node/crypto.ts';

function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expectedSignature = createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  
  return signature === expectedSignature;
}
```

在 Supabase Dashboard 中配置 Webhook Secret：
1. 进入 **Settings** > **Edge Functions**
2. 添加环境变量：`REVENUECAT_WEBHOOK_SECRET`

## 数据库表结构

确保 `profiles` 表包含以下字段：

```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_updated TIMESTAMP;
```

## 测试

### 测试 Webhook

1. 在 RevenueCat Dashboard 中，进入 **Settings** > **Integrations** > **Webhooks**
2. 点击你的 Webhook
3. 点击 **Send Test Event**
4. 检查 Supabase Edge Function 日志

### 验证数据同步

1. 完成一次测试购买
2. 检查 Supabase Dashboard 中的 **Table Editor** > **profiles**
3. 验证订阅状态已更新

## 常见问题

### Q: Webhook 没有触发

**A**: 检查：
- Webhook URL 是否正确
- Edge Function 是否已部署
- RevenueCat Dashboard 中的 Webhook 状态是否为 "Active"

### Q: 数据库没有更新

**A**: 检查：
- Edge Function 日志中的错误信息
- `app_user_id` 是否与 Supabase 用户 ID 匹配
- 数据库权限是否正确

### Q: 如何处理用户 ID 映射？

**A**: RevenueCat 使用 `app_user_id`，这应该与 Supabase 用户 ID 相同。在 `SubscriptionContext.tsx` 中，我们已经通过 `Purchases.logIn(user.id)` 关联了用户 ID。

## 相关文档

- [RevenueCat Webhook 文档](https://docs.revenuecat.com/docs/webhooks)
- [Supabase Edge Functions 文档](https://supabase.com/docs/guides/functions)
- [RevenueCat 恢复指南](./REVENUECAT_RESTORATION.md)
