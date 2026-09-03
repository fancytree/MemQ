import * as AppleAuthentication from 'expo-apple-authentication';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';
import { supabase } from './supabase';

type AuthSessionResult = {
  type: 'success' | 'cancel' | 'dismiss' | 'opened' | 'locked';
  url?: string;
};

type WebBrowserModule = {
  maybeCompleteAuthSession: () => void;
  dismissAuthSession: () => void | Promise<void>;
  dismissBrowser: () => void | Promise<void>;
  openAuthSessionAsync: (
    url: string,
    redirectUrl?: string | null,
    options?: { preferEphemeralSession?: boolean }
  ) => Promise<AuthSessionResult>;
  openBrowserAsync: (url: string) => Promise<{ type: string }>;
};

const webBrowserFallback: WebBrowserModule = {
  maybeCompleteAuthSession: () => {},
  dismissAuthSession: () => {},
  dismissBrowser: () => {},
  openAuthSessionAsync: async () => {
    throw new Error('Expo WebBrowser module is unavailable in this runtime.');
  },
  openBrowserAsync: async () => {
    throw new Error('Expo WebBrowser module is unavailable in this runtime.');
  },
};

let WebBrowser: WebBrowserModule = webBrowserFallback;
let hasWebBrowserModule = false;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const wb = require('expo-web-browser');
  WebBrowser = (wb?.default ?? wb) as WebBrowserModule;
  hasWebBrowserModule = true;
} catch {
  WebBrowser = webBrowserFallback;
  hasWebBrowserModule = false;
}

WebBrowser.maybeCompleteAuthSession();

let oauthSessionInProgress = false;
let oauthSessionStartedAt = 0;
const OAUTH_SESSION_STALE_MS = 45_000;
const OAUTH_OPEN_TIMEOUT_MS = 90_000;

const safeDismissBrowserSessions = async () => {
  await Promise.resolve(WebBrowser.dismissAuthSession()).catch(() => {});
  await Promise.resolve(WebBrowser.dismissBrowser()).catch(() => {});
};

const getRedirectUrl = () => {
  if (Platform.OS === 'web') {
    return `${window.location.origin}/auth/callback`;
  }
  return 'memq://auth/callback';
};

/**
 * iOS Google 登录专用：SFSafariViewController 完整流程（应用内、无确认框）。
 *
 * 为什么不用 openAuthSessionAsync：
 *  - preferEphemeralSession:false → 弹 Apple 系统确认框
 *  - preferEphemeralSession:true  → 部分 iOS/Expo 版本 ASWebAuthenticationSession.start()
 *    静默返回 false，Promise 永远不 resolve，表现为"一直 loading"
 *
 * 本方案完全自洽：
 *  1. openBrowserAsync 打开 SFSafariViewController
 *  2. 在浏览器打开前注册 Linking 监听器，等待 memq://auth/callback 回调
 *  3. 回调到达后，监听器保存 URL，dismissBrowser() 关闭浏览器
 *  4. 直接在本函数内完成 code 交换，返回 session（不依赖 auth/callback.tsx 路由）
 */
export const startGoogleOAuthInSafari = async (): Promise<{ data: any; error: any }> => {
  const redirectUrl = getRedirectUrl();
  const { data: oauthData, error: oauthError } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: redirectUrl,
      skipBrowserRedirect: true,
    },
  });
  if (oauthError) return { data: null, error: oauthError };
  if (!oauthData?.url) return { data: null, error: new Error('No OAuth URL returned') };

  if (!hasWebBrowserModule) {
    // 降级：无 expo-web-browser 时回退外部 Safari（深链接由 auth/callback.tsx 处理）
    await Linking.openURL(oauthData.url).catch(() => {});
    return { data: null, error: null };
  }

  // 统一结果 Promise：多条路径（Linking / onAuthStateChange / 超时）竞争，
  // 第一个到达者 win，后续的调用被忽略。
  let resolveFinal!: (r: { data: any; error: any }) => void;
  let finalResolved = false;
  const finalPromise = new Promise<{ data: any; error: any }>((resolve) => {
    resolveFinal = (r) => {
      if (!finalResolved) {
        finalResolved = true;
        resolve(r);
      }
    };
  });

  const listenerRegisteredAt = Date.now();

  // ── 路径 A：Linking 监听器收到深链接 → 自己交换 code ──
  // 适用于 Expo Router 未拦截深链接的场景。
  // 若 Expo Router 已拦截并由 auth/callback.tsx 处理，路径 B（onAuthStateChange）兜底。
  let linkingSub: ReturnType<typeof Linking.addEventListener> | null = null;
  linkingSub = Linking.addEventListener('url', ({ url }) => {
    const elapsed = Date.now() - listenerRegisteredAt;
    if (__DEV__) console.log(`[OAuth] Linking url event (+${elapsed}ms):`, url);
    // 过滤 Expo 重放的旧 URL（重放发生在监听器注册后极短时间内）
    if (elapsed < 500) return;
    if (!url.includes('auth/callback')) return;

    linkingSub?.remove();
    linkingSub = null;
    Promise.resolve(WebBrowser.dismissBrowser()).catch(() => {});

    // 若 auth/callback.tsx 已抢先 resolve（路径 B），则跳过，避免重复交换同一 code
    if (finalResolved) return;

    (async () => {
      try {
        const urlObj = new URL(url);
        const hashStr = urlObj.hash?.startsWith('#') ? urlObj.hash.slice(1) : '';
        const hashParams = new URLSearchParams(hashStr);

        const errorDesc =
          urlObj.searchParams.get('error_description') || hashParams.get('error_description') ||
          urlObj.searchParams.get('error') || hashParams.get('error');
        if (errorDesc) { resolveFinal({ data: null, error: new Error(errorDesc) }); return; }

        const code = urlObj.searchParams.get('code') || hashParams.get('code');
        const accessToken = urlObj.searchParams.get('access_token') || hashParams.get('access_token');
        const refreshToken = urlObj.searchParams.get('refresh_token') || hashParams.get('refresh_token');

        if (code) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          // 若 error（code 已被 auth/callback.tsx 使用），由路径 B 兜底，不 reject
          if (!error && data) resolveFinal({ data, error: null });
        } else if (accessToken && refreshToken) {
          const { data, error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
          if (!error && data) resolveFinal({ data, error: null });
        }
      } catch {
        // code 交换失败（已被对方使用），路径 B 会兜底，此处静默忽略
      }
    })();
  });

  // ── 路径 B：onAuthStateChange 监听器 ──
  // 无论是路径 A（自己交换）还是 auth/callback.tsx 交换，
  // 只要 session 建立成功，SIGNED_IN 一定触发，此处捕获并 resolve。
  const { data: { subscription: authStateSub } } = supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session) {
      resolveFinal({ data: { session, user: session.user }, error: null });
    }
  });

  // ── 打开浏览器，关闭后给路径 A/B 最多 3s 完成处理 ──
  WebBrowser.openBrowserAsync(oauthData.url)
    .catch(() => {})
    .finally(() => {
      setTimeout(() => {
        // 3s 后仍无结果：用户取消或超时
        resolveFinal({ data: null, error: null });
      }, 3000);
    });

  const result = await finalPromise;

  // 清理所有监听器
  linkingSub?.remove();
  linkingSub = null;
  authStateSub.unsubscribe();

  return result;
};

// ─────────────────────────────────────────────────────────────────────────────
// signInWithOAuth: Apple on iOS（原生），Google / Apple on Android & Web
// ─────────────────────────────────────────────────────────────────────────────

const openAuthSessionWithTimeout = async (authUrl: string, redirectUrl: string) => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error('Authentication timed out. Please try again.'));
      }, OAUTH_OPEN_TIMEOUT_MS);
    });
    const result = (await Promise.race([
      WebBrowser.openAuthSessionAsync(authUrl, redirectUrl),
      timeoutPromise,
    ])) as AuthSessionResult;
    return result;
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const tryGetExistingSession = async () => {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session ?? null;
  } catch {
    return null;
  }
};

export const signInWithOAuth = async (provider: 'google' | 'apple') => {
  const now = Date.now();
  if (oauthSessionInProgress) {
    const elapsed = now - oauthSessionStartedAt;
    if (__DEV__) {
      console.log('OAuth session restarted by user action', { provider, elapsed });
    }
    await safeDismissBrowserSessions();
    oauthSessionInProgress = false;
    oauthSessionStartedAt = 0;
  }
  oauthSessionInProgress = true;
  oauthSessionStartedAt = now;

  try {
    // iOS Apple 登录走原生 API，不需要浏览器
    if (provider === 'apple' && Platform.OS === 'ios') {
      return await signInWithAppleNative();
    }

    const redirectUrl = getRedirectUrl();

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: redirectUrl,
        skipBrowserRedirect: Platform.OS !== 'web',
      },
    });

    if (error) throw error;
    if (!data?.url) throw new Error('No OAuth URL returned');

    if (Platform.OS !== 'web') {
      if (!hasWebBrowserModule) {
        return {
          data: null,
          error: {
            message:
              'In-app OAuth modal is unavailable in current build. Please rebuild iOS development client and try again.',
          },
        };
      }

      await safeDismissBrowserSessions();

      let result: AuthSessionResult;
      try {
        result = await openAuthSessionWithTimeout(data.url, redirectUrl);
      } catch (authOpenError: any) {
        const message = String(authOpenError?.message || '');
        if (message.includes('Authentication timed out')) {
          const existingSession = await tryGetExistingSession();
          if (existingSession) {
            return { data: { session: existingSession, user: existingSession.user }, error: null } as any;
          }
          throw new Error(
            'Authentication timed out. Please ensure OAuth redirect URL is configured to memq://auth/callback in Supabase Auth settings, then try again.'
          );
        }
        const isAlreadyOpenError =
          message.includes('Another web browser is already open') ||
          message.includes('openAuthSessionAsync');
        if (!isAlreadyOpenError) throw authOpenError;
        await safeDismissBrowserSessions();
        result = await openAuthSessionWithTimeout(data.url, redirectUrl);
      }

      if (result.type === 'success' && result.url) {
        const cbUrl = new URL(result.url);
        const hashParams = new URLSearchParams(
          cbUrl.hash.startsWith('#') ? cbUrl.hash.slice(1) : cbUrl.hash
        );

        const errorDescription =
          cbUrl.searchParams.get('error_description') ||
          hashParams.get('error_description') ||
          cbUrl.searchParams.get('error') ||
          hashParams.get('error');
        if (errorDescription) throw new Error(errorDescription);

        const authCode = cbUrl.searchParams.get('code') || hashParams.get('code');
        if (authCode) {
          const { data: exchangeData, error: exchangeError } =
            await supabase.auth.exchangeCodeForSession(authCode);
          if (exchangeError) throw exchangeError;
          return { data: exchangeData, error: null };
        }

        const accessToken =
          cbUrl.searchParams.get('access_token') || hashParams.get('access_token');
        const refreshToken =
          cbUrl.searchParams.get('refresh_token') || hashParams.get('refresh_token');
        if (accessToken && refreshToken) {
          const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (sessionError) throw sessionError;
          return { data: sessionData, error: null };
        }
      } else if (result.type === 'cancel') {
        return { data: null, error: { message: 'User cancelled authentication' } };
      }

      throw new Error('Authentication failed');
    } else {
      window.location.href = data.url;
      return { data: null, error: null };
    }
  } catch (error: any) {
    if (__DEV__) console.error('OAuth sign in error:', error);
    return { data: null, error };
  } finally {
    oauthSessionInProgress = false;
    oauthSessionStartedAt = 0;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Apple Sign-In (native, iOS only)
// ─────────────────────────────────────────────────────────────────────────────

const signInWithAppleNative = async () => {
  try {
    const isAvailable = await AppleAuthentication.isAvailableAsync();
    if (!isAvailable) {
      return {
        data: null,
        error: { message: 'Apple Authentication is not available on this device.' },
      };
    }

    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });

    if (!credential.identityToken) {
      throw new Error('Failed to get identity token from Apple');
    }

    const { data: sessionData, error: sessionError } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
    });

    if (sessionError) throw sessionError;

    if (credential.fullName && (credential.fullName.givenName || credential.fullName.familyName)) {
      const fullName = [credential.fullName.givenName, credential.fullName.familyName]
        .filter(Boolean)
        .join(' ');
      if (fullName) {
        await supabase.auth.updateUser({ data: { full_name: fullName } });
      }
    }

    return { data: sessionData, error: null };
  } catch (error: any) {
    if (
      error.code === 'ERR_REQUEST_CANCELED' ||
      error.code === 'ERR_CANCELED' ||
      error.code === '1001'
    ) {
      return { data: null, error: { message: 'User cancelled authentication' } };
    }
    if (__DEV__) console.warn('Apple native sign in error:', error);
    return {
      data: null,
      error: { message: error?.message || 'Apple Sign In failed. Please try again.' },
    };
  }
};
