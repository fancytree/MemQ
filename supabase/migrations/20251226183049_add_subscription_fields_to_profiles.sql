-- 添加订阅相关字段到 profiles 表
-- 如果 profiles 表不存在，先创建它；如果存在，则添加字段

-- 1. 创建 profiles 表（如果不存在）
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 2. 添加订阅相关字段
-- is_pro: 核心标记，表示用户是否为 Pro 用户
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS is_pro BOOLEAN DEFAULT false NOT NULL;

-- pro_expires_at: 过期时间
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS pro_expires_at TIMESTAMPTZ;

-- subscription_plan: 订阅计划类型 ('monthly' 或 'yearly')
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS subscription_plan TEXT 
CHECK (subscription_plan IS NULL OR subscription_plan IN ('monthly', 'yearly'));

-- 3. 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_profiles_is_pro ON public.profiles(is_pro);
CREATE INDEX IF NOT EXISTS idx_profiles_pro_expires_at ON public.profiles(pro_expires_at) WHERE pro_expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_subscription_plan ON public.profiles(subscription_plan) WHERE subscription_plan IS NOT NULL;

-- 4. 启用行级安全 (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 5. 删除已存在的策略和函数（如果存在）
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

-- 6. 创建 RLS 策略
-- 允许用户查看自己的 profile（包括 is_pro 状态）
CREATE POLICY "Users can view their own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- 允许用户插入自己的 profile（注册时）
CREATE POLICY "Users can insert their own profile"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

-- 注意：不允许用户直接更新订阅相关字段（is_pro, pro_expires_at, subscription_plan）
-- 这些字段只能由服务端 Webhook 更新
-- 由于 RLS 策略的限制，我们创建一个服务端函数来安全地更新订阅状态
-- 前端用户不能直接 UPDATE profiles 表中的订阅字段

-- 7. 创建服务端函数：更新订阅状态（只能由服务端调用）
CREATE OR REPLACE FUNCTION public.update_subscription_status(
  user_id UUID,
  new_is_pro BOOLEAN,
  new_pro_expires_at TIMESTAMPTZ,
  new_subscription_plan TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET 
    is_pro = new_is_pro,
    pro_expires_at = new_pro_expires_at,
    subscription_plan = new_subscription_plan,
    updated_at = NOW()
  WHERE id = user_id;
END;
$$;

-- 允许用户更新自己的 profile（但不包括订阅字段，这些字段只能通过服务端函数更新）
-- 由于 profiles 表现在只有订阅字段，这个策略实际上不允许用户更新任何内容
-- 如果需要添加其他可编辑字段，可以在这里添加
CREATE POLICY "Users can update their own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- 8. 创建更新 updated_at 的触发器
CREATE OR REPLACE FUNCTION update_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 删除已存在的触发器（如果存在）
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_profiles_updated_at();

-- 9. 为新注册用户自动创建 profile 记录（使用触发器）
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 创建触发器（如果不存在）
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 10. 添加注释
COMMENT ON TABLE public.profiles IS '用户配置文件表，存储用户的订阅状态等信息';
COMMENT ON COLUMN public.profiles.is_pro IS '是否为 Pro 用户（核心标记）';
COMMENT ON COLUMN public.profiles.pro_expires_at IS 'Pro 订阅过期时间';
COMMENT ON COLUMN public.profiles.subscription_plan IS '订阅计划类型：monthly（月付）或 yearly（年付）';

