import { IAccessRecord } from '../interfaces';

/**
 * 工具类
 */
export class Utils {
  /**
   * 计算字符串的字节大小
   */
  static getStringByteSize(str: string): number {
    return new Blob([str]).size;
  }

  /**
   * 压缩访问记录数据
   */
  static compressAccessRecords(records: Record<string, IAccessRecord>): string {
    try {
      // 简化数据结构以减少存储空间
      const compressed: Record<string, [number, number, number]> = {};

      for (const [key, record] of Object.entries(records)) {
        compressed[key] = [
          record.lastAccess,
          record.accessCount,
          record.size
        ];
      }

      return JSON.stringify(compressed);
    } catch (error) {
      console.warn('Failed to compress access records:', error);
      return '{}';
    }
  }

  /**
   * 解压访问记录数据
   */
  static decompressAccessRecords(data: string): Record<string, IAccessRecord> {
    try {
      const compressed = JSON.parse(data || '{}');
      const records: Record<string, IAccessRecord> = {};

      for (const [key, value] of Object.entries(compressed)) {
        if (Array.isArray(value) && value.length === 3) {
          records[key] = {
            lastAccess: value[0],
            accessCount: value[1],
            size: value[2]
          };
        }
      }

      return records;
    } catch (error) {
      console.warn('Failed to decompress access records:', error);
      return {};
    }
  }

  /**
   * 生成唯一的存储键
   */
  static generateStorageKey(prefix: string, suffix: string): string {
    return `__${prefix}_${suffix}__`;
  }

  /**
   * 检查是否为系统保留键
   */
  static isSystemKey(key: string): boolean {
    return key.startsWith('__') && key.endsWith('__');
  }

  /**
   * 获取当前时间戳
   */
  static now(): number {
    return Date.now();
  }

  /**
   * 防抖函数
   */
  static debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number
  ): (...args: Parameters<T>) => void {
    let timeout: NodeJS.Timeout | null = null;

    return (...args: Parameters<T>) => {
      if (timeout) {
        clearTimeout(timeout);
      }

      timeout = setTimeout(() => {
        func.apply(null, args);
      }, wait);
    };
  }

  /**
   * 节流函数
   */
  static throttle<T extends (...args: any[]) => any>(
    func: T,
    wait: number
  ): (...args: Parameters<T>) => void {
    let lastTime = 0;

    return (...args: Parameters<T>) => {
      const now = Date.now();

      if (now - lastTime >= wait) {
        lastTime = now;
        func.apply(null, args);
      }
    };
  }

  /**
   * 深度克隆对象
   */
  static deepClone<T>(obj: T): T {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    if (obj instanceof Date) {
      return new Date(obj.getTime()) as unknown as T;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => Utils.deepClone(item)) as unknown as T;
    }

    const cloned = {} as T;
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        cloned[key] = Utils.deepClone(obj[key]);
      }
    }

    return cloned;
  }

  /**
   * 格式化字节大小
   */
  static formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * 检查浏览器支持
   */
  static checkBrowserSupport(): {
    localStorage: boolean;
    indexedDB: boolean;
    proxy: boolean;
  } {
    return {
      localStorage: typeof Storage !== 'undefined' && !!window.localStorage,
      indexedDB: typeof window !== 'undefined' && !!window.indexedDB,
      proxy: typeof Proxy !== 'undefined'
    };
  }
}