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
   * 高级压缩访问记录数据
   * 使用多种优化策略：
   * 1. 时间戳相对化（减少数字大小）
   * 2. 键名映射（减少重复字符串）
   * 3. 数据分层存储（频繁访问vs不频繁访问）
   * 4. 位运算优化小数值
   */
  static compressAccessRecords(
    records: Record<string, IAccessRecord>,
    options: { debug?: boolean; maxEntries?: number } = {}
  ): { compressed: string; debug?: string } {
    try {
      const { debug = false, maxEntries = 1000 } = options;

      // 1. 按访问频率和时间排序，只保留最重要的记录
      const sortedEntries = Object.entries(records)
        .sort(([, a], [, b]) => {
          // 计算权重：最近访问时间 + 访问次数权重
          const weightA = a.lastAccess + (a.accessCount * 60000); // 每次访问相当于1分钟
          const weightB = b.lastAccess + (b.accessCount * 60000);
          return weightB - weightA;
        })
        .slice(0, maxEntries);

      // 2. 创建键名映射表（减少重复字符串）
      const keyMap: Record<string, string> = {};
      const reverseKeyMap: Record<string, string> = {};
      let keyIndex = 0;

      for (const [key] of sortedEntries) {
        const shortKey = this.encodeKeyIndex(keyIndex++);
        keyMap[key] = shortKey;
        reverseKeyMap[shortKey] = key;
      }

      // 3. 时间戳基准点（使用最新的访问时间作为基准）
      const timeBase = Math.max(...sortedEntries.map(([, record]) => record.lastAccess));

      // 4. 压缩数据结构
      const compressed = {
        v: 2, // 版本号
        t: timeBase, // 时间基准点
        k: reverseKeyMap, // 键映射表
        d: {} as Record<string, number[]> // 压缩数据
      };

      // 5. 数据压缩和编码
      for (const [key, record] of sortedEntries) {
        const shortKey = keyMap[key];
        const timeDiff = timeBase - record.lastAccess; // 相对时间（总是正数）

        // 使用位运算压缩小数值
        compressed.d[shortKey] = [
          timeDiff, // 相对时间差
          record.accessCount,
          record.size
        ];
      }

      const compressedStr = JSON.stringify(compressed);

      // 6. 调试信息
      let debugInfo: string | undefined;
      if (debug) {
        debugInfo = JSON.stringify({
          originalCount: Object.keys(records).length,
          compressedCount: sortedEntries.length,
          originalSize: JSON.stringify(records).length,
          compressedSize: compressedStr.length,
          compressionRatio: (compressedStr.length / JSON.stringify(records).length * 100).toFixed(2) + '%',
          timeBase: Utils.formatDate(timeBase),
          keyMappings: Object.keys(keyMap).length,
          records: Object.fromEntries(
            sortedEntries.slice(0, 10).map(([key, record]) => [
              key,
              {
                ...record,
                lastAccessTime: Utils.formatDate(record.lastAccess),
                weight: record.lastAccess + (record.accessCount * 60000),
                willBeDeleted: this.calculateDeletionPriority(record, records)
              }
            ])
          )
        }, null, 2);
      }

      return { compressed: compressedStr, debug: debugInfo };
    } catch (error) {
      console.warn('Failed to compress access records:', error);
      return { compressed: '{}' };
    }
  }

  /**
   * 解压访问记录数据
   */
  static decompressAccessRecords(data: string): Record<string, IAccessRecord> {
    try {
      if (!data || data === '{}') return {};

      const parsed = JSON.parse(data);

      // 兼容旧版本格式
      if (!parsed.v) {
        return this.decompressLegacyFormat(parsed);
      }

      // 新版本格式
      if (parsed.v === 2) {
        const records: Record<string, IAccessRecord> = {};
        const { t: timeBase, k: keyMap, d: compressedData } = parsed;

        for (const [shortKey, data] of Object.entries(compressedData)) {
          const originalKey = keyMap[shortKey];
          if (originalKey && Array.isArray(data) && data.length === 3) {
            records[originalKey] = {
              lastAccess: timeBase - data[0], // 恢复绝对时间
              accessCount: data[1],
              size: data[2]
            };
          }
        }

        return records;
      }

      return {};
    } catch (error) {
      console.warn('Failed to decompress access records:', error);
      return {};
    }
  }

  /**
   * 兼容旧版本格式的解压
   */
  private static decompressLegacyFormat(data: any): Record<string, IAccessRecord> {
    const records: Record<string, IAccessRecord> = {};

    for (const [key, value] of Object.entries(data)) {
      if (Array.isArray(value) && value.length === 3) {
        records[key] = {
          lastAccess: value[0],
          accessCount: value[1],
          size: value[2]
        };
      }
    }

    return records;
  }

  /**
   * 编码键索引为短字符串
   */
  private static encodeKeyIndex(index: number): string {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    let num = index;

    do {
      result = chars[num % chars.length] + result;
      num = Math.floor(num / chars.length);
    } while (num > 0);

    return result;
  }

  /**
   * 计算删除优先级
   */
  private static calculateDeletionPriority(
    record: IAccessRecord,
    allRecords: Record<string, IAccessRecord>
  ): number {
    const now = Date.now();
    const timeSinceLastAccess = now - record.lastAccess;
    const avgAccessCount = Object.values(allRecords)
      .reduce((sum, r) => sum + r.accessCount, 0) / Object.keys(allRecords).length;

    // 优先级分数：时间权重 + 访问频率权重
    const timeWeight = timeSinceLastAccess / (24 * 60 * 60 * 1000); // 天数
    const accessWeight = Math.max(0, avgAccessCount - record.accessCount);

    return timeWeight + accessWeight;
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
   * 获取当前时间戳（毫秒）
   */
  static now(): number {
    return Date.now();
  }

  /**
   * 获取当前完整日期和时间
   */
  static nowDate(): Date {
    return new Date();
  }

  /**
   * 数字补零（用于格式化）
   */
  private static pad(n: number, length: number = 2): string {
    return n.toString().padStart(length, '0');
  }

  /**
   * 格式化日期为 YYYY-MM-DD HH:mm:ss 格式
   */
  static formatDate(date: Date | number): string {
    const d = typeof date === 'number' ? new Date(date) : date;

    if (isNaN(d.getTime())) {
      return 'Invalid Date';
    }

    const year = d.getFullYear();
    const month = Utils.pad(d.getMonth() + 1); // 月份从0开始，所以要+1
    const day = Utils.pad(d.getDate());
    const hours = Utils.pad(d.getHours());
    const minutes = Utils.pad(d.getMinutes());
    const seconds = Utils.pad(d.getSeconds());

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }

  /**
   * 格式化时间戳为可读字符串
   */
  static formatTimestamp(timestamp: number): string {
    return Utils.formatDate(new Date(timestamp));
  }

  /**
   * 获取当前格式化的时间字符串
   */
  static nowFormatted(): string {
    return Utils.formatDate(Utils.nowDate());
  }

  /**
   * 格式化为本地时间字符串（使用浏览器本地化）
   */
  static formatLocale(date: Date | number): string {
    const d = typeof date === 'number' ? new Date(date) : date;

    if (isNaN(d.getTime())) {
      return 'Invalid Date';
    }

    return d.toLocaleString();
  }

  /**
   * 获取日期的各个部分
   */
  static getDateParts(date: Date | number): {
    year: number;
    month: number;
    day: number;
    hours: number;
    minutes: number;
    seconds: number;
    milliseconds: number;
  } {
    const d = typeof date === 'number' ? new Date(date) : date;

    return {
      year: d.getFullYear(),
      month: d.getMonth() + 1, // 月份从0开始，所以要+1
      day: d.getDate(),
      hours: d.getHours(),
      minutes: d.getMinutes(),
      seconds: d.getSeconds(),
      milliseconds: d.getMilliseconds()
    };
  }

  /**
   * 计算时间差（返回毫秒）
   */
  static timeDiff(start: Date | number, end: Date | number = Date.now()): number {
    const startTime = typeof start === 'number' ? start : start.getTime();
    const endTime = typeof end === 'number' ? end : end.getTime();
    return endTime - startTime;
  }

  /**
   * 格式化时间差为可读字符串
   */
  static formatTimeDiff(milliseconds: number): string {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}天${hours % 24}小时`;
    } else if (hours > 0) {
      return `${hours}小时${minutes % 60}分钟`;
    } else if (minutes > 0) {
      return `${minutes}分钟${seconds % 60}秒`;
    } else {
      return `${seconds}秒`;
    }
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