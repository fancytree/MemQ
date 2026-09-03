import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

type AsyncStorageModule = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

const memoryStorage = new Map<string, string>();
const inMemoryAsyncStorage: AsyncStorageModule = {
  getItem: async (key) => memoryStorage.get(key) ?? null,
  setItem: async (key, value) => {
    memoryStorage.set(key, value);
  },
  removeItem: async (key) => {
    memoryStorage.delete(key);
  },
};

/** 优先使用 AsyncStorage 持久化 Supabase session，杀进程后仍保持登录；不可用时降级内存。 */
function createAsyncStorageAdapter(): AsyncStorageModule {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    if (AsyncStorage?.getItem && AsyncStorage?.setItem && AsyncStorage?.removeItem) {
      return {
        getItem: (key: string) => AsyncStorage.getItem(key),
        setItem: (key: string, value: string) => AsyncStorage.setItem(key, value),
        removeItem: (key: string) => AsyncStorage.removeItem(key),
      };
    }
  } catch {
    // 无原生模块时兜底
  }
  return inMemoryAsyncStorage;
}

let asyncStorage: AsyncStorageModule | undefined = undefined;
const getAsyncStorage = (): AsyncStorageModule => {
  if (!asyncStorage) {
    asyncStorage = createAsyncStorageAdapter();
  }
  return asyncStorage;
};

// 根据平台选择存储适配器
const ExpoSecureStoreAdapter = {
  getItem: (key: string) => {
    if (Platform.OS === 'web') {
      // Web 平台使用 localStorage
      return Promise.resolve(localStorage.getItem(key));
    } else {
      // 移动端使用 AsyncStorage（缺失时降级内存存储）
      return getAsyncStorage().getItem(key);
    }
  },
  setItem: (key: string, value: string) => {
    if (Platform.OS === 'web') {
      // Web 平台使用 localStorage
      localStorage.setItem(key, value);
      return Promise.resolve();
    } else {
      // 移动端使用 AsyncStorage（缺失时降级内存存储）
      return getAsyncStorage().setItem(key, value);
    }
  },
  removeItem: (key: string) => {
    if (Platform.OS === 'web') {
      // Web 平台使用 localStorage
      localStorage.removeItem(key);
      return Promise.resolve();
    } else {
      // 移动端使用 AsyncStorage（缺失时降级内存存储）
      return getAsyncStorage().removeItem(key);
    }
  },
};

const supabaseUrl = 'https://sbwkwfqjpbwmacmrprwn.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNid2t3ZnFqcGJ3bWFjbXJwcnduIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5OTYyNTQsImV4cCI6MjA4MDU3MjI1NH0.qfYwvgx0lphtX7_QDIOcgcbHRUtfM12UMNy0MmQr-mw';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true, // 启用 URL 检测以支持密码重置链接
  },
});

