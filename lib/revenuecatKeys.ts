/**
 * RevenueCat Public API Key — 必须在运行时解析，勿在模块顶层依赖 Constants（首帧可能尚未就绪）
 * 与 eas.json / app.config.js 中的 iOS Public Key 保持一致
 *
 * 若仍报 Invalid API key：请到 RevenueCat → Project settings → API keys → App specific keys
 * 复制「iOS」的 Public API Key（appl_ 开头），更新 eas.json production.env 与 EAS Secret 后重新打包。
 * 勿使用 Secret key（sk_）、Web Billing key、或 Test Store key（test_）初始化移动端 SDK。
 */
import Constants from 'expo-constants';

/** 仅当 env / extra 均未提供合法 appl_ 时使用；须与 Dashboard 中 iOS Public Key 一致 */
const FALLBACK_IOS_PUBLIC_KEY = 'appl_RlEtfEEmHjPUMVKvUOyWsurvhxO';

type ExtraShape = { revenueCatApiKeyIos?: string; revenueCatApiKeyAndroid?: string; revenueCatApiKey?: string };

function readExtra(): ExtraShape {
  const ex = Constants.expoConfig?.extra as ExtraShape | undefined;
  if (ex?.revenueCatApiKeyIos || ex?.revenueCatApiKeyAndroid) return ex;
  const m2 = (Constants as { manifest2?: { extra?: ExtraShape } }).manifest2?.extra;
  if (m2?.revenueCatApiKeyIos || m2?.revenueCatApiKeyAndroid) return m2;
  const m = (Constants as { manifest?: { extra?: ExtraShape } }).manifest?.extra;
  return m ?? {};
}

/** 去掉首尾空白、BOM、成对引号，避免复制粘贴导致服务端判无效 */
function normalizePublicKeyString(raw: string | undefined): string {
  if (raw == null || typeof raw !== 'string') return '';
  let s = raw.replace(/^\uFEFF/, '').trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

export function getRevenueCatIosApiKey(): string {
  // 优先 Constants.expoConfig.extra（EAS 执行 app.config.js 时写入 manifest，与 eas.json env 一致）
  // 再读 Metro 内联的 EXPO_PUBLIC_*：部分正式包中内联 env 可能为空或与 manifest 不一致，导致服务端报 Invalid API Key
  const fromExtra = normalizePublicKeyString(readExtra().revenueCatApiKeyIos);
  const fromEnv = normalizePublicKeyString(process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_IOS);
  const raw = fromExtra || fromEnv;
  if (raw.startsWith('appl_') && raw.length > 10) {
    return raw;
  }
  const fb = normalizePublicKeyString(FALLBACK_IOS_PUBLIC_KEY);
  if (fb.startsWith('appl_') && fb.length > 10) {
    return fb;
  }
  return '';
}

export function getRevenueCatAndroidApiKey(): string | undefined {
  const fromExtra = normalizePublicKeyString(readExtra().revenueCatApiKeyAndroid);
  const fromEnv = normalizePublicKeyString(process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID);
  const raw = fromExtra || fromEnv;
  return raw.startsWith('goog_') ? raw : undefined;
}

export function getRevenueCatDefaultApiKey(): string | undefined {
  const fromExtra = normalizePublicKeyString(readExtra().revenueCatApiKey);
  const fromEnv = normalizePublicKeyString(process.env.EXPO_PUBLIC_REVENUECAT_API_KEY);
  const raw = fromExtra || fromEnv;
  return raw.length > 0 ? raw : undefined;
}
