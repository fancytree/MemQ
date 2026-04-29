// 加载 .env 文件（Expo SDK 50+ 应该自动支持，但为了确保，我们手动加载）
const path = require('path');
const dotenv = require('dotenv');

// 明确指定 .env 文件路径；override: false 确保 EAS 构建已注入的 EXPO_PUBLIC_* 不被本地 .env 覆盖
dotenv.config({ path: path.resolve(__dirname, '.env'), override: false });

// 从 app.json 读取配置
const appJson = require('./app.json');

// 规范化 iOS Public Key（避免复制进 .env 时带引号或首尾空格导致与 Dashboard 不一致）
function normalizeRcIosKey(raw) {
  if (raw == null || typeof raw !== 'string') return '';
  let s = raw.replace(/^\uFEFF/, '').trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

// 获取环境变量（与 eas.json production.env 保持一致；若 Metro/EAS 未注入 EXPO_PUBLIC_*，extra 仍会有值）
const DEFAULT_REVENUECAT_IOS =
  normalizeRcIosKey(process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_IOS) ||
  'appl_RlEtfEEmHjPUMVKvUOyWsurvhxO';
const revenueCatApiKeyIos = DEFAULT_REVENUECAT_IOS;
const revenueCatApiKeyAndroid = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID;
const revenueCatApiKey = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY;

// 调试：检查环境变量是否被加载（仅在开发环境）
if (process.env.NODE_ENV !== 'production') {
  console.log('📝 app.config.js - Environment variables:', {
    ios: revenueCatApiKeyIos ? `${revenueCatApiKeyIos.substring(0, 10)}...` : 'NOT SET',
    android: revenueCatApiKeyAndroid ? `${revenueCatApiKeyAndroid.substring(0, 10)}...` : 'NOT SET',
  });
}

module.exports = {
  ...appJson.expo,
  extra: {
    ...appJson.expo.extra,
    // 将环境变量传递到 extra，确保在原生构建时可用
    revenueCatApiKeyIos,
    revenueCatApiKeyAndroid,
    revenueCatApiKey,
  },
};
