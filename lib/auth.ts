import { supabase } from './supabase';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';

// 完成 WebBrowser 认证流程
WebBrowser.maybeCompleteAuthSession();

// 获取重定向 URL
const getRedirectUrl = () => {
  if (Platform.OS === 'web') {
    return `${window.location.origin}/auth/callback`;
  }
  // 使用 app.json 中定义的 scheme
  return Linking.createURL('/auth/callback');
};

/**
 * 使用 OAuth 提供商登录
 * @param provider - OAuth 提供商 ('google' | 'apple')
 */
export const signInWithOAuth = async (provider: 'google' | 'apple') => {
  try {
    // 对于 iOS 上的 Apple Sign In，优先使用原生 API
    if (provider === 'apple' && Platform.OS === 'ios') {
      try {
        const result = await signInWithAppleNative();
        // 如果成功或用户取消，直接返回
        if (result.data || result.error?.message === 'User cancelled authentication') {
          return result;
        }
        // 如果失败但不是用户取消，静默回退到标准 OAuth 流程
        // 在开发环境中，这可能是正常的（例如在模拟器上）
        if (__DEV__) {
          console.log('Native Apple Sign In not available, using OAuth flow');
        }
      } catch (error: any) {
        // 如果原生 API 抛出异常，静默回退到标准 OAuth 流程
        // 忽略预期的错误（如模拟器不支持、未配置等）
        const isExpectedError = 
          error?.message?.includes('not available') ||
          error?.message?.includes('authorization attempt failed') ||
          error?.code === 'ERR_REQUEST_CANCELED' ||
          error?.code === 'ERR_CANCELED';
        
        if (!isExpectedError && __DEV__) {
          console.warn('Native Apple Sign In error, falling back to OAuth:', error);
        }
      }
    }

    // 对于其他情况（Google 或 Web 上的 Apple），使用 Web OAuth
    const redirectUrl = getRedirectUrl();
    
    // 创建 OAuth 请求
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: redirectUrl,
        skipBrowserRedirect: Platform.OS !== 'web', // 在移动端跳过浏览器重定向
      },
    });

    if (error) {
      throw error;
    }

    if (!data?.url) {
      throw new Error('No OAuth URL returned');
    }

    // 在移动端使用 WebBrowser 打开认证页面
    if (Platform.OS !== 'web') {
      const result = await WebBrowser.openAuthSessionAsync(
        data.url,
        redirectUrl
      );

      if (result.type === 'success' && result.url) {
        // 从回调 URL 中提取参数
        const url = new URL(result.url);
        const accessToken = url.searchParams.get('access_token');
        const refreshToken = url.searchParams.get('refresh_token');
        
        if (accessToken && refreshToken) {
          // 使用 token 设置 session
          const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (sessionError) {
            throw sessionError;
          }

          return { data: sessionData, error: null };
        }
      } else if (result.type === 'cancel') {
        return { data: null, error: { message: 'User cancelled authentication' } };
      }
    } else {
      // Web 平台：直接重定向
      window.location.href = data.url;
      return { data: null, error: null };
    }

    throw new Error('Authentication failed');
  } catch (error: any) {
    console.error('OAuth sign in error:', error);
    return { data: null, error };
  }
};

/**
 * 使用原生 Apple Authentication API 登录（仅 iOS）
 * 支持新用户注册和现有用户登录
 * 
 * 此方法使用原生 Apple Authentication API 获取 identityToken，
 * 然后直接通过 Supabase 的 signInWithIdToken 完成认证。
 * 不需要打开浏览器，在 iPhone 和 iPad 上都能正常工作。
 */
const signInWithAppleNative = async () => {
  try {
    // 检查 Apple Authentication 是否可用
    const isAvailable = await AppleAuthentication.isAvailableAsync();
    if (!isAvailable) {
      throw new Error('Apple Authentication is not available, falling back to OAuth');
    }

    // 执行 Apple 认证
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });

    // 验证是否获得了必要的凭证
    if (!credential.identityToken) {
      throw new Error('Failed to get identity token from Apple');
    }

    // 直接使用 identityToken 与 Supabase 认证（无需打开浏览器）
    const { data: sessionData, error: sessionError } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
    });

    if (sessionError) {
      throw sessionError;
    }

    // 如果 Apple 返回了用户名信息，更新到 user_metadata
    if (credential.fullName && (credential.fullName.givenName || credential.fullName.familyName)) {
      const fullName = [credential.fullName.givenName, credential.fullName.familyName]
        .filter(Boolean)
        .join(' ');
      
      if (fullName) {
        await supabase.auth.updateUser({
          data: { full_name: fullName },
        });
      }
    }

    return { data: sessionData, error: null };
  } catch (error: any) {
    // 处理用户取消的情况
    if (
      error.code === 'ERR_REQUEST_CANCELED' || 
      error.code === 'ERR_CANCELED' ||
      error.code === '1001'
    ) {
      return { data: null, error: { message: 'User cancelled authentication' } };
    }
    
    // 如果原生 API 不可用或失败，回退到标准 OAuth 流程
    if (error.message?.includes('falling back to OAuth') || error.message?.includes('not available')) {
      throw error;
    }
    
    // 处理预期的错误（如模拟器不支持、授权失败等）
    const isExpectedError = 
      error?.message?.includes('authorization attempt failed') ||
      error?.message?.includes('unknown reason');
    
    if (isExpectedError) {
      throw new Error('Apple Authentication is not available, falling back to OAuth');
    }
    
    if (__DEV__) {
      console.warn('Apple native sign in error:', error);
    }
    return { data: null, error };
  }
};
