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
  private debugRecordsKey: string;

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
    this.debugRecordsKey = Utils.generateStorageKey('lru', 'debug_records');

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

    // 更新键的大小信息（同步版本）
    this.updateKeySizesSync(cleanableKeys);

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
   * 更新键的大小信息（同步版本）
   */
  private updateKeySizesSync(keys: string[]): void {
    for (const key of keys) {
      if (this.accessRecords[key]) {
        try {
          // 对于localStorage适配器，getItemSize是同步的
          const size = this.storageAdapter.getItemSize(key);
          if (typeof size === 'number') {
            this.accessRecords[key].size = size;
          } else {
            // 如果是Promise，使用估算值
            this.accessRecords[key].size = this.estimateItemSize(key);
          }
        } catch (error) {
          // 如果获取大小失败，使用估算值
          this.accessRecords[key].size = this.estimateItemSize(key);
        }
      }
    }
  }

  /**
   * 估算项目大小
   */
  private estimateItemSize(key: string): number {
    try {
      const value = this.storageAdapter.getItem(key);
      if (typeof value === 'string') {
        return new Blob([key + value]).size;
      }
      return 1024; // 默认1KB
    } catch (error) {
      return 1024; // 默认1KB
    }
  }

  /**
   * 更新键的大小信息（异步版本）
   */
  private async updateKeySizes(keys: string[]): Promise<void> {
    for (const key of keys) {
      if (this.accessRecords[key]) {
        try {
          const size = await this.storageAdapter.getItemSize(key);
          this.accessRecords[key].size = size;
        } catch (error) {
          // 如果获取大小失败，使用估算值
          this.accessRecords[key].size = this.estimateItemSize(key);
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
      // 使用新的高级压缩算法
      const result = Utils.compressAccessRecords(this.accessRecords, {
        debug: this.config.debug,
        maxEntries: 500 // 限制最大记录数，防止无限增长
      });

      // 保存压缩后的数据
      await this.storageAdapter.setItem(this.accessRecordsKey, result.compressed);

      // 如果是调试模式，保存调试信息
      if (this.config.debug && result.debug) {
        await this.storageAdapter.setItem(this.debugRecordsKey, result.debug);

        console.log(`[LRU] Saved access records with compression:`);
        const debugInfo = JSON.parse(result.debug);
        console.log(`  - Original: ${debugInfo.originalCount} records`);
        console.log(`  - Compressed: ${debugInfo.compressedCount} records`);
        console.log(`  - Size reduction: ${debugInfo.compressionRatio}`);
        console.log(`  - Storage size: ${Utils.formatBytes(result.compressed.length)}`);
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
    storageSize: number;
    compressionRatio?: string;
  } {
    const records = Object.values(this.accessRecords);

    if (records.length === 0) {
      return {
        totalRecords: 0,
        oldestAccess: 0,
        newestAccess: 0,
        averageAccessCount: 0,
        storageSize: 0
      };
    }

    const accessTimes = records.map(r => r.lastAccess);
    const accessCounts = records.map(r => r.accessCount);

    // 计算存储大小
    const originalSize = JSON.stringify(this.accessRecords).length;
    const compressedResult = Utils.compressAccessRecords(this.accessRecords);
    const compressedSize = compressedResult.compressed.length;

    return {
      totalRecords: records.length,
      oldestAccess: Math.min(...accessTimes),
      newestAccess: Math.max(...accessTimes),
      averageAccessCount: accessCounts.reduce((a, b) => a + b, 0) / accessCounts.length,
      storageSize: compressedSize,
      compressionRatio: ((compressedSize / originalSize) * 100).toFixed(2) + '%'
    };
  }

  /**
   * 获取调试信息
   */
  async getDebugInfo(): Promise<any> {
    if (!this.config.debug) {
      return null;
    }

    try {
      const debugData = await this.storageAdapter.getItem(this.debugRecordsKey);
      return debugData ? JSON.parse(debugData) : null;
    } catch (error) {
      console.warn('[LRU] Failed to get debug info:', error);
      return null;
    }
  }

  /**
   * 手动触发压缩优化
   */
  async optimizeStorage(): Promise<{
    before: { records: number; size: number };
    after: { records: number; size: number };
    saved: number;
  }> {
    const beforeStats = this.getAccessStats();
    const beforeSize = beforeStats.storageSize;
    const beforeRecords = beforeStats.totalRecords;

    // 清理过期记录
    this.cleanupExpiredRecords();

    // 重新保存以触发压缩
    await this.saveAccessRecords();

    const afterStats = this.getAccessStats();
    const afterSize = afterStats.storageSize;
    const afterRecords = afterStats.totalRecords;

    const result = {
      before: { records: beforeRecords, size: beforeSize },
      after: { records: afterRecords, size: afterSize },
      saved: beforeSize - afterSize
    };

    if (this.config.debug) {
      console.log('[LRU] Storage optimization completed:', result);
    }

    return result;
  }

  /**
   * 获取最可能被删除的键列表（用于调试）
   */
  getCleanupCandidates(limit: number = 10): Array<{
    key: string;
    lastAccess: string;
    accessCount: number;
    size: number;
    priority: number;
  }> {
    const candidates = Object.entries(this.accessRecords)
      .map(([key, record]) => ({
        key,
        lastAccess: new Date(record.lastAccess).toISOString(),
        accessCount: record.accessCount,
        size: record.size,
        priority: this.calculateCleanupPriority(record)
      }))
      .sort((a, b) => b.priority - a.priority) // 优先级高的先删除
      .slice(0, limit);

    return candidates;
  }

  /**
   * 计算清理优先级
   */
  private calculateCleanupPriority(record: IAccessRecord): number {
    const now = Date.now();
    const timeSinceLastAccess = now - record.lastAccess;
    const daysSinceAccess = timeSinceLastAccess / (24 * 60 * 60 * 1000);

    // 优先级计算：时间权重 + 访问频率权重
    const timeWeight = Math.min(daysSinceAccess, 30); // 最多30天权重
    const accessWeight = Math.max(0, 10 - record.accessCount); // 访问次数越少权重越高

    return timeWeight + accessWeight;
  }
}