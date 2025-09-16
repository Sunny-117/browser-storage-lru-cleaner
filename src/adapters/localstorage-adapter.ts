import { IStorageAdapter } from '../interfaces';
import { Utils } from '../utils';

/**
 * localStorage 适配器
 */
export class LocalStorageAdapter implements IStorageAdapter {
  private originalLocalStorage: Storage;

  constructor() {
    this.originalLocalStorage = window.localStorage;
  }

  /**
   * 获取存储项
   */
  getItem(key: string): string | null {
    try {
      return this.originalLocalStorage.getItem(key);
    } catch (error) {
      console.warn(`Failed to get item "${key}" from localStorage:`, error);
      return null;
    }
  }

  /**
   * 设置存储项
   */
  setItem(key: string, value: string): void {
    try {
      this.originalLocalStorage.setItem(key, value);
    } catch (error) {
      // 检查是否是存储配额超限错误
      if (this.isQuotaExceededError(error)) {
        console.warn(`localStorage quota exceeded when setting "${key}", attempting to clear storage and retry`);

        try {
          // 清空localStorage
          this.originalLocalStorage.clear();
          console.log('localStorage cleared due to quota exceeded');

          // 重试设置
          this.originalLocalStorage.setItem(key, value);
          console.log(`Successfully set "${key}" after clearing storage`);
          return;
        } catch (retryError) {
          console.error(`Failed to set "${key}" even after clearing storage:`, retryError);
          throw retryError;
        }
      }

      console.warn(`Failed to set item "${key}" in localStorage:`, error);
      throw error;
    }
  }

  /**
   * 删除存储项
   */
  removeItem(key: string): void {
    try {
      this.originalLocalStorage.removeItem(key);
    } catch (error) {
      console.warn(`Failed to remove item "${key}" from localStorage:`, error);
    }
  }

  /**
   * 获取所有键
   */
  getAllKeys(): string[] {
    try {
      const keys: string[] = [];
      for (let i = 0; i < this.originalLocalStorage.length; i++) {
        const key = this.originalLocalStorage.key(i);
        if (key) {
          keys.push(key);
        }
      }
      return keys;
    } catch (error) {
      console.warn('Failed to get all keys from localStorage:', error);
      return [];
    }
  }

  /**
   * 获取存储大小（字节）
   */
  getStorageSize(): number {
    try {
      let totalSize = 0;
      for (let i = 0; i < this.originalLocalStorage.length; i++) {
        const key = this.originalLocalStorage.key(i);
        if (key) {
          const value = this.originalLocalStorage.getItem(key);
          if (value) {
            totalSize += Utils.getStringByteSize(key) + Utils.getStringByteSize(value);
          }
        }
      }
      return totalSize;
    } catch (error) {
      console.warn('Failed to calculate localStorage size:', error);
      return 0;
    }
  }

  /**
   * 获取单个项的大小（字节）
   */
  getItemSize(key: string): number {
    try {
      const value = this.originalLocalStorage.getItem(key);
      if (value === null) {
        return 0;
      }
      return Utils.getStringByteSize(key) + Utils.getStringByteSize(value);
    } catch (error) {
      console.warn(`Failed to get size of item "${key}":`, error);
      return 0;
    }
  }

  /**
   * 清空存储
   */
  clear(): void {
    try {
      this.originalLocalStorage.clear();
    } catch (error) {
      console.warn('Failed to clear localStorage:', error);
    }
  }

  /**
   * 检查localStorage是否可用
   */
  isAvailable(): boolean {
    try {
      const testKey = '__test_localStorage_availability__';
      this.originalLocalStorage.setItem(testKey, 'test');
      this.originalLocalStorage.removeItem(testKey);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * 获取localStorage的剩余容量（估算）
   */
  getRemainingCapacity(): number {
    try {
      // 尝试存储大量数据来估算剩余容量
      const testKey = '__test_capacity__';
      let testData = '';
      let capacity = 0;

      // 从1KB开始测试
      const chunkSize = 1024;
      let chunk = 'x'.repeat(chunkSize);

      try {
        while (capacity < 10 * 1024 * 1024) { // 最大测试10MB
          testData += chunk;
          this.originalLocalStorage.setItem(testKey, testData);
          capacity += chunkSize;
        }
      } catch (error) {
        // 达到容量限制
      } finally {
        this.originalLocalStorage.removeItem(testKey);
      }

      return capacity;
    } catch (error) {
      console.warn('Failed to estimate remaining capacity:', error);
      return 0;
    }
  }

  /**
   * 获取原始localStorage对象
   */
  getOriginalStorage(): Storage {
    return this.originalLocalStorage;
  }

  /**
   * 检查是否是存储配额超限错误
   */
  private isQuotaExceededError(error: any): boolean {
    return error && (
      error.name === 'QuotaExceededError' ||
      error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      error.code === 22 ||
      error.code === 1014 ||
      // 检查错误消息中的关键词
      (error.message && (
        error.message.toLowerCase().includes('quota') ||
        error.message.toLowerCase().includes('storage') ||
        error.message.toLowerCase().includes('exceeded') ||
        error.message.toLowerCase().includes('full')
      ))
    );
  }
}