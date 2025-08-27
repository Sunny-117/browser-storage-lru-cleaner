import { ICleanupStrategy, IAccessRecord, IStorageAdapter } from '../interfaces';
import { Utils } from '../utils';

/**
 * LRU (Least Recently Used) 清理策略
 */
export class LRUStrategy implements ICleanupStrategy {
  private accessRecords: Record<string, IAccessRecord> = {};
  private storageAdapter: IStorageAdapter;
  private config: {
    maxAccessAge: number;
    excludeKeys: string[];
    debug: boolean;
  };
  private accessRecordsKey: string;

  constructor(
    storageAdapter: IStorageAdapter,
    config: {
      maxAccessAge: number;
      excludeKeys?: string[];
      debug?: boolean;
    }
  ) {
    this.storageAdapter = storageAdapter;
    this.config = {
      maxAccessAge: config.maxAccessAge,
      excludeKeys: config.excludeKeys || [],
      debug: config.debug || false
    };
    this.accessRecordsKey = Utils.generateStorageKey('lru', 'access_records');

    this.loadAccessRecords();
  }

  /**
   * 记录访问
   */
  recordAccess(key: string): void {
    // 跳过系统键和排除的键
    if (Utils.isSystemKey(key) || this.config.excludeKeys.includes(key)) {
      return;
    }

    const now = Utils.now();
    const existing = this.accessRecords[key];

    if (existing) {
      existing.lastAccess = now;
      existing.accessCount++;
    } else {
      this.accessRecords[key] = {
        lastAccess: now,
        accessCount: 1,
        size: 0 // 将在需要时计算
      };
    }

    // 异步保存访问记录，避免阻塞主线程
    this.saveAccessRecordsDebounced();

    if (this.config.debug) {
      console.log(`[LRU] Recorded access for key: ${key}`);
    }
  }

  /**
   * 获取需要清理的键列表
   */
  getKeysToCleanup(
    allKeys: string[],
    currentSize: number,
    maxSize: number,
    requiredSpace: number = 0
  ): string[] {
    // 清理过期的访问记录
    this.cleanupExpiredRecords();

    // 过滤出可以清理的键
    const cleanableKeys = allKeys.filter(key =>
      !Utils.isSystemKey(key) &&
      !this.config.excludeKeys.includes(key)
    );

    // 计算需要释放的空间
    const targetSize = Math.max(
      maxSize * 0.8, // 清理到80%容量
      currentSize - requiredSpace // 或者释放足够的空间
    );

    const spaceToFree = currentSize - targetSize;

    if (spaceToFree <= 0) {
      return [];
    }

    // 更新键的大小信息
    this.updateKeySizes(cleanableKeys);

    // 按LRU算法排序：最近最少使用的在前
    const sortedKeys = this.sortKeysByLRU(cleanableKeys);

    // 选择要清理的键
    const keysToCleanup: string[] = [];
    let freedSpace = 0;

    for (const key of sortedKeys) {
      const record = this.accessRecords[key];
      if (record) {
        keysToCleanup.push(key);
        freedSpace += record.size;

        if (freedSpace >= spaceToFree) {
          break;
        }
      }
    }

    if (this.config.debug) {
      console.log(`[LRU] Selected ${keysToCleanup.length} keys for cleanup, will free ${Utils.formatBytes(freedSpace)}`);
    }

    return keysToCleanup;
  }

  /**
   * 清理指定的键
   */
  cleanup(keys: string[]): void {
    for (const key of keys) {
      // 从访问记录中删除
      delete this.accessRecords[key];

      if (this.config.debug) {
        console.log(`[LRU] Cleaned up key: ${key}`);
      }
    }

    // 保存更新后的访问记录
    this.saveAccessRecords();
  }

  /**
   * 获取策略名称
   */
  getName(): string {
    return 'LRU';
  }

  /**
   * 按LRU算法排序键
   */
  private sortKeysByLRU(keys: string[]): string[] {
    return keys.sort((a, b) => {
      const recordA = this.accessRecords[a];
      const recordB = this.accessRecords[b];

      // 没有访问记录的键优先清理
      if (!recordA && !recordB) return 0;
      if (!recordA) return -1;
      if (!recordB) return 1;

      // 按最后访问时间排序（越早越优先清理）
      const timeDiff = recordA.lastAccess - recordB.lastAccess;
      if (timeDiff !== 0) return timeDiff;

      // 如果时间相同，按访问次数排序（越少越优先清理）
      return recordA.accessCount - recordB.accessCount;
    });
  }

  /**
   * 更新键的大小信息
   */
  private async updateKeySizes(keys: string[]): Promise<void> {
    for (const key of keys) {
      if (this.accessRecords[key]) {
        try {
          const size = await this.storageAdapter.getItemSize(key);
          this.accessRecords[key].size = size;
        } catch (error) {
          // 如果获取大小失败，使用默认值
          this.accessRecords[key].size = 1024; // 1KB 默认大小
        }
      }
    }
  }

  /**
   * 清理过期的访问记录
   */
  private cleanupExpiredRecords(): void {
    const now = Utils.now();
    const expiredKeys: string[] = [];

    for (const [key, record] of Object.entries(this.accessRecords)) {
      if (now - record.lastAccess > this.config.maxAccessAge) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      delete this.accessRecords[key];
    }

    if (this.config.debug && expiredKeys.length > 0) {
      console.log(`[LRU] Cleaned up ${expiredKeys.length} expired access records`);
    }
  }

  /**
   * 加载访问记录
   */
  private async loadAccessRecords(): Promise<void> {
    try {
      const data = await this.storageAdapter.getItem(this.accessRecordsKey);
      if (data) {
        this.accessRecords = Utils.decompressAccessRecords(data);

        if (this.config.debug) {
          console.log(`[LRU] Loaded ${Object.keys(this.accessRecords).length} access records`);
        }
      }
    } catch (error) {
      console.warn('[LRU] Failed to load access records:', error);
      this.accessRecords = {};
    }
  }

  /**
   * 保存访问记录
   */
  private async saveAccessRecords(): Promise<void> {
    try {
      const data = Utils.compressAccessRecords(this.accessRecords);
      await this.storageAdapter.setItem(this.accessRecordsKey, data);

      if (this.config.debug) {
        console.log(`[LRU] Saved ${Object.keys(this.accessRecords).length} access records`);
      }
    } catch (error) {
      console.warn('[LRU] Failed to save access records:', error);
    }
  }

  /**
   * 防抖保存访问记录
   */
  private saveAccessRecordsDebounced = Utils.debounce(() => {
    this.saveAccessRecords();
  }, 1000);

  /**
   * 获取访问统计信息
   */
  getAccessStats(): {
    totalRecords: number;
    oldestAccess: number;
    newestAccess: number;
    averageAccessCount: number;
  } {
    const records = Object.values(this.accessRecords);

    if (records.length === 0) {
      return {
        totalRecords: 0,
        oldestAccess: 0,
        newestAccess: 0,
        averageAccessCount: 0
      };
    }

    const accessTimes = records.map(r => r.lastAccess);
    const accessCounts = records.map(r => r.accessCount);

    return {
      totalRecords: records.length,
      oldestAccess: Math.min(...accessTimes),
      newestAccess: Math.max(...accessTimes),
      averageAccessCount: accessCounts.reduce((a, b) => a + b, 0) / accessCounts.length
    };
  }
}