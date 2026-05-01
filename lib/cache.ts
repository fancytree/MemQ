/**
 * 本地缓存工具
 * 用于优化页面加载速度，实现"先显示缓存，后台更新"的策略
 */

type AsyncStorageModule = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
  multiRemove: (keys: string[]) => Promise<void>;
  getAllKeys: () => Promise<string[]>;
  multiGet: (keys: string[]) => Promise<Array<[string, string | null]>>;
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
  multiRemove: async (keys) => {
    keys.forEach((key) => memoryStorage.delete(key));
  },
  getAllKeys: async () => Array.from(memoryStorage.keys()),
  multiGet: async (keys) => keys.map((key) => [key, memoryStorage.get(key) ?? null]),
};

let AsyncStorage: AsyncStorageModule = inMemoryAsyncStorage;
try {
  const loaded = require('@react-native-async-storage/async-storage');
  AsyncStorage = loaded?.default ?? loaded;
} catch {
  AsyncStorage = inMemoryAsyncStorage;
}

// 缓存配置
const CACHE_CONFIG = {
  // 首页数据缓存：10分钟
  DASHBOARD: {
    key: 'dashboard_cache',
    timestampKey: 'dashboard_cache_timestamp',
    expiryTime: 10 * 60 * 1000, // 10分钟
  },
  // 课程列表缓存：30分钟（延长缓存时间以优化加载速度）
  LESSONS: {
    key: 'lessons_cache',
    timestampKey: 'lessons_cache_timestamp',
    expiryTime: 30 * 60 * 1000, // 30分钟
  },
  // 课程详情缓存：5分钟
  LESSON_DETAIL: {
    key: 'lesson_detail_cache',
    timestampKey: 'lesson_detail_cache_timestamp',
    expiryTime: 5 * 60 * 1000, // 5分钟
  },
};

/**
 * 从缓存加载数据（永久缓存，不过期）
 * @param cacheType 缓存类型
 * @param keySuffix 可选的缓存 key 后缀（用于区分不同的缓存项，如 lesson ID）
 * @returns 缓存的数据，如果不存在则返回 null
 */
export async function loadFromCache<T>(
  cacheType: keyof typeof CACHE_CONFIG,
  keySuffix?: string
): Promise<T | null> {
  try {
    const config = CACHE_CONFIG[cacheType];
    const cacheKey = keySuffix ? `${config.key}_${keySuffix}` : config.key;
    
    const cachedData = await AsyncStorage.getItem(cacheKey);

    if (cachedData) {
      return JSON.parse(cachedData) as T;
    }
    return null;
  } catch (error) {
    if (__DEV__) {
      console.warn(`Error loading cache for ${cacheType}:`, error);
    }
    return null;
  }
}

/**
 * 保存数据到缓存（永久缓存）
 * @param cacheType 缓存类型
 * @param data 要缓存的数据
 * @param keySuffix 可选的缓存 key 后缀（用于区分不同的缓存项，如 lesson ID）
 */
export async function saveToCache<T>(
  cacheType: keyof typeof CACHE_CONFIG,
  data: T,
  keySuffix?: string
): Promise<void> {
  try {
    const config = CACHE_CONFIG[cacheType];
    const cacheKey = keySuffix ? `${config.key}_${keySuffix}` : config.key;
    
    await AsyncStorage.setItem(cacheKey, JSON.stringify(data));
    // 仍然保存时间戳用于显示最后更新时间
    const timestampKey = keySuffix ? `${config.timestampKey}_${keySuffix}` : config.timestampKey;
    await AsyncStorage.setItem(timestampKey, Date.now().toString());
  } catch (error) {
    if (__DEV__) {
      console.warn(`Error saving cache for ${cacheType}:`, error);
    }
  }
}

/**
 * 清除指定类型的缓存
 * @param cacheType 缓存类型
 * @param keySuffix 可选的缓存 key 后缀（用于清除特定的缓存项）
 */
export async function clearCache(
  cacheType: keyof typeof CACHE_CONFIG,
  keySuffix?: string
): Promise<void> {
  try {
    const config = CACHE_CONFIG[cacheType];
    const cacheKey = keySuffix ? `${config.key}_${keySuffix}` : config.key;
    const timestampKey = keySuffix ? `${config.timestampKey}_${keySuffix}` : config.timestampKey;
    
    await AsyncStorage.removeItem(cacheKey);
    await AsyncStorage.removeItem(timestampKey);
  } catch (error) {
    if (__DEV__) {
      console.warn(`Error clearing cache for ${cacheType}:`, error);
    }
  }
}

/**
 * 清除所有缓存
 */
export async function clearAllCache(): Promise<void> {
  try {
    const allKeys = Object.values(CACHE_CONFIG).flatMap(config => [
      config.key,
      config.timestampKey,
    ]);
    await AsyncStorage.multiRemove(allKeys);
  } catch (error) {
    if (__DEV__) {
      console.warn('Error clearing all cache:', error);
    }
  }
}

/**
 * 检查缓存是否过期（永久缓存，始终返回 false）
 * @param cacheType 缓存类型
 * @param keySuffix 可选的缓存 key 后缀（用于检查特定的缓存项）
 * @returns false（缓存永久有效）
 */
export async function isCacheExpired(
  cacheType: keyof typeof CACHE_CONFIG,
  keySuffix?: string
): Promise<boolean> {
  try {
    const config = CACHE_CONFIG[cacheType];
    const cacheKey = keySuffix ? `${config.key}_${keySuffix}` : config.key;
    const cachedData = await AsyncStorage.getItem(cacheKey);
    
    // 永久缓存，只要存在就不过期
    return !cachedData;
  } catch (error) {
    return true; // 出错时视为过期
  }
}

/**
 * 计算字符串的 UTF-8 字节大小
 */
function getStringByteSize(str: string): number {
  // 使用 TextEncoder 计算 UTF-8 字节大小（如果可用）
  // 否则使用近似计算：大部分字符是 1-3 字节，中文字符是 3 字节
  try {
    // React Native 中可以使用这种方式近似计算
    let size = 0;
    for (let i = 0; i < str.length; i++) {
      const charCode = str.charCodeAt(i);
      if (charCode < 0x80) {
        size += 1; // ASCII 字符
      } else if (charCode < 0x800) {
        size += 2; // 2 字节字符
      } else {
        size += 3; // 3 字节字符（包括中文）
      }
    }
    return size;
  } catch (error) {
    // 如果出错，返回字符串长度的近似值（乘以 2 作为 UTF-8 的保守估计）
    return str.length * 2;
  }
}

/**
 * 计算缓存大小（字节）
 * @returns 缓存总大小（字节）
 */
export async function getCacheSize(): Promise<number> {
  try {
    let totalSize = 0;
    
    // 获取所有缓存相关的 keys
    const allKeys = await AsyncStorage.getAllKeys();
    const cacheKeys = allKeys.filter(key => 
      Object.values(CACHE_CONFIG).some(config => 
        key.startsWith(config.key) || key.startsWith(config.timestampKey)
      )
    );
    
    // 计算所有缓存数据的大小
    const items = await AsyncStorage.multiGet(cacheKeys);
    items.forEach(([_, value]) => {
      if (value) {
        // 计算字符串的字节大小（UTF-8 编码）
        totalSize += getStringByteSize(value);
      }
    });
    
    return totalSize;
  } catch (error) {
    if (__DEV__) {
      console.warn('Error calculating cache size:', error);
    }
    return 0;
  }
}

/**
 * 格式化缓存大小
 * @param bytes 字节数
 * @returns 格式化后的字符串（如 "1.5 MB"）
 */
export function formatCacheSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}
