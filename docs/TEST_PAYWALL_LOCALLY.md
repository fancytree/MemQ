# 本地测试 Paywall 指南

## 方案 1：快速预览 Paywall UI（推荐用于开发）

这个方法可以让你快速查看 Paywall 界面，无需配置 App Store Connect 或真实设备。

### 方法 A：在代码中直接调用

在任何组件中临时添加一个按钮来显示 Paywall：

```typescript
import { useSubscription } from '@/context/SubscriptionContext';

function TestComponent() {
  const { showPaywall, setShowPaywallModal } = useSubscription();

  return (
    <TouchableOpacity onPress={() => setShowPaywallModal(true)}>
      <Text>Show Paywall</Text>
    </TouchableOpacity>
  );
}
```

### 方法 B：在首页添加测试按钮

在 `app/(tabs)/index.tsx` 中添加一个临时的测试按钮：

```typescript
import { useSubscription } from '@/context/SubscriptionContext';

// 在组件中添加
const { setShowPaywallModal } = useSubscription();

// 在 JSX 中添加测试按钮
<TouchableOpacity 
  onPress={() => setShowPaywallModal(true)}
  style={{ padding: 20, backgroundColor: '#4E49FC', borderRadius: 8, margin: 20 }}
>
  <Text style={{ color: 'white', textAlign: 'center' }}>Test Paywall</Text>
</TouchableOpacity>
```

### 方法 C：使用开发者菜单（推荐）

创建一个测试页面，通过路由访问：

1. 创建 `app/test-paywall.tsx`：

```typescript
import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useSubscription } from '@/context/SubscriptionContext';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function TestPaywallScreen() {
  const { setShowPaywallModal, showPaywall } = useSubscription();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Paywall Test</Text>
        
        <TouchableOpacity 
          style={styles.button}
          onPress={() => setShowPaywallModal(true)}
        >
          <Text style={styles.buttonText}>Show Paywall Modal</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.button}
          onPress={showPaywall}
        >
          <Text style={styles.buttonText}>Show Paywall (with auth check)</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 40,
  },
  button: {
    backgroundColor: '#4E49FC',
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
    width: '100%',
    maxWidth: 300,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
});
```

2. 访问测试页面：
   - 在浏览器中：`exp://localhost:8081/--/test-paywall`
   - 或在应用中导航到 `/test-paywall`

---

## 方案 2：完整测试（需要真实设备和 Sandbox 账户）

这个方法可以测试完整的购买流程，包括真实的 IAP 交互。

### 前置条件

1. ✅ 在 App Store Connect 中创建了 IAP 产品
2. ✅ 产品状态为 "Ready to Submit" 或 "Approved"
3. ✅ 使用真实 iOS 设备（模拟器不支持 IAP）
4. ✅ 创建了 Sandbox 测试账户

### 步骤

#### 1. 创建 Sandbox 测试账户

1. 登录 [App Store Connect](https://appstoreconnect.apple.com/)
2. 进入 **Users and Access** → **Sandbox** → **Testers**
3. 点击 **+** 创建新的测试账户
4. 填写信息（可以使用任意邮箱，不需要真实邮箱）

#### 2. 在设备上登出 App Store

1. 打开 **Settings** → **App Store**
2. 如果已登录，先登出

#### 3. 运行应用

```bash
# 在真实设备上运行
npx expo run:ios --device
```

#### 4. 测试购买流程

1. 在应用中触发 Paywall（点击订阅按钮）
2. 当系统提示登录时，使用 Sandbox 测试账户登录
3. 完成购买流程
4. 验证订阅状态是否正确更新

### 测试场景

- ✅ 显示 Paywall
- ✅ 选择月付订阅
- ✅ 选择年付订阅
- ✅ 取消购买
- ✅ 恢复购买
- ✅ 检查订阅状态

---

## 方案 3：使用 RevenueCat 测试模式

RevenueCat 支持测试模式，可以在没有真实产品的情况下测试 Paywall UI。

### 前置条件

1. ✅ 在 RevenueCat Dashboard 中创建了 Offering
2. ✅ 配置了 RevenueCat API Key（可以使用测试 API Key）
3. ✅ 在 App Store Connect 中创建了产品（即使状态是"准备提交"也可以）

### 测试步骤

1. 确保 RevenueCat API Key 已配置
2. 在应用中触发 Paywall
3. RevenueCat 会自动加载产品信息
4. 如果产品未激活，PaywallModal 会显示（降级方案）

**注意**：实际购买仍然需要真实的产品配置和 Sandbox 账户。

---

## 快速测试命令

### 在开发环境中快速显示 Paywall

在应用的任何地方添加：

```typescript
// 在组件中
import { useSubscription } from '@/context/SubscriptionContext';

const { setShowPaywallModal } = useSubscription();

// 直接显示
setShowPaywallModal(true);
```

### 在控制台中测试

如果使用 React Native Debugger 或类似工具，可以在控制台执行：

```javascript
// 在 React Native Debugger 控制台
const { setShowPaywallModal } = require('./context/SubscriptionContext').useSubscription();
setShowPaywallModal(true);
```

---

## 常见问题

### Q: Paywall 不显示？

**A:** 检查：
1. 用户是否已登录（`showPaywall` 会检查登录状态）
2. 用户是否已经是 Pro（如果是，Paywall 会自动关闭）
3. 使用 `setShowPaywallModal(true)` 直接显示，跳过检查

### Q: 产品价格显示为 "Loading..."？

**A:** 
1. 确保 RevenueCat API Key 已正确配置
2. 确保在 RevenueCat Dashboard 中创建了 Offering 和 Products
3. 确保产品已在 App Store Connect 中创建
4. 检查网络连接

### Q: 点击购买没有反应？

**A:** 
1. 确保在真实设备上测试（模拟器不支持 IAP）
2. 确保已登录 Sandbox 账户
3. 确保 RevenueCat 已正确初始化
4. 检查 RevenueCat Dashboard 中的产品配置

---

## 推荐测试流程

1. **开发阶段**：使用方案 1 快速预览 UI
2. **配置阶段**：在 RevenueCat Dashboard 和 App Store Connect 中创建产品
3. **功能测试**：使用方案 2 在真实设备上测试完整流程
4. **发布前**：使用 Sandbox 账户完整测试所有场景

## 相关文档

- [RevenueCat 恢复指南](./REVENUECAT_RESTORATION.md)
- [RevenueCat Webhook 配置](./REVENUECAT_WEBHOOK_SETUP.md)
- [内购测试指南](./IAP_TESTING_GUIDE.md)
