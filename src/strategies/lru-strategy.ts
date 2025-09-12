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
    enableTimeBasedCleanup: boolean;
    timeCleanupThreshold: number;
    cleanupOnInsert: boolean;
    unimportantKeys: string[];
  };
  private accessRecordsKey: string;
  private debugRecordsKey: string;

  constructor(
    storageAdapter: IStorageAdapter,
    config: {
      maxAccessAge: number;
      excludeKeys?: string[];
      debug?: boolean;
      enableTimeBasedCleanup?: boolean;
      timeCleanupThreshold?: number;
      cleanupOnInsert?: boolean;
      unimportantKeys?: string[];
    }
  ) {
    this.storageAdapter = storageAdapter;
    this.config = {
      maxAccessAge: config.maxAccessAge,
      excludeKeys: config.excludeKeys || [],
      debug: config.debug || false,
      enableTimeBasedCleanup: config.enableTimeBasedCleanup || false,
      timeCleanupThreshold: config.timeCleanupThreshold || 7, // 默认7天
      cleanupOnInsert: config.cleanupOnInsert !== false, // 默认启用
      unimportantKeys: config.unimportantKeys || []
    };
    this.accessRecordsKey = Utils.generateStorageKey('lru', 'access_records');
    this.debugRecordsKey = Utils.generateStorageKey('lru', 'debug_records');

    // 异步初始化
    this.initialize();
  }

  /**
   * 异步初始化方法
   */
  private async initialize(): Promise<void> {
    try {
      // 先加载访问记录
      await this.loadAccessRecords();

      // 清理孤立的访问记录（records中有但storage中没有的key）
      this.cleanupOrphanedRecords();

      // 然后初始化存量数据
      this.initializeExistingData();

      if (this.config.debug) {
        console.log('[LRU] Strategy initialized successfully');
      }
    } catch (error) {
      console.error('[LRU] Failed to initialize strategy:', error);
      // 即使初始化失败，也要确保有一个空的访问记录对象
      this.accessRecords = {};
    }
  }

  /**
   * 清理孤立的访问记录
   * 删除records中存在但storage中不存在的key记录
   */
  private cleanupOrphanedRecords(): void {
    try {
      const allKeys = this.getAllStorageKeys();
      const allKeysSet = new Set(allKeys);
      const recordKeys = Object.keys(this.accessRecords);

      let cleanedCount = 0;
      const orphanedKeys: string[] = [];

      // 找出孤立的记录（records中有但storage中没有的）
      for (const recordKey of recordKeys) {
        // 跳过系统键
        if (Utils.isSystemKey(recordKey)) {
          continue;
        }

        // 如果storage中没有这个key，说明是孤立记录
        if (!allKeysSet.has(recordKey)) {
          orphanedKeys.push(recordKey);
          delete this.accessRecords[recordKey];
          cleanedCount++;
        }
      }

      if (cleanedCount > 0) {
        // 保存更新后的访问记录
        this.saveAccessRecordsDebounced();

        if (this.config.debug) {
          console.log(`[LRU] 清理了 ${cleanedCount} 个孤立的访问记录:`);
          orphanedKeys.slice(0, 5).forEach(key => {
            console.log(`  - ${key}`);
          });
          if (orphanedKeys.length > 5) {
            console.log(`  - ... 还有 ${orphanedKeys.length - 5} 个`);
          }
        }
      }
    } catch (error) {
      console.error('[LRU] Failed to cleanup orphaned records:', error);
    }
  }

  /**
   * 记录访问
   */
  recordAccess(key: string, value?: string): boolean {
    // 跳过系统键和排除的键
    if (Utils.isSystemKey(key) || this.config.excludeKeys.includes(key)) {
      return true;
    }

    const now = Utils.now();
    const existing = this.accessRecords[key];

    if (existing) {
      existing.lastAccess = now;
      existing.accessCount++;
      // 更新大小（如果提供了新值）
      if (value) {
        existing.size = Utils.estimateDataSize(value);
      }
    } else {
      this.accessRecords[key] = {
        lastAccess: now,
        accessCount: 1,
        size: value ? Utils.estimateDataSize(value) : 0
      };
    }

    // 如果启用了基于时间的清理且是插入操作，触发时间清理
    if (this.config.enableTimeBasedCleanup && this.config.cleanupOnInsert && !existing) {
      this.performTimeBasedCleanup();
    }

    // 异步保存访问记录，避免阻塞主线程
    this.saveAccessRecordsDebounced();

    if (this.config.debug) {
      console.log(`[LRU] Recorded access for key: ${key}${value ? ` (${Utils.formatDataSize(Utils.estimateDataSize(value))})` : ''}`);
    }

    return true; // 成功记录访问
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

    // 分层清理策略
    const keysToCleanup = this.getLayeredCleanupKeys(cleanableKeys, spaceToFree);
    const freedSpace = keysToCleanup.reduce((total, key) => {
      const record = this.accessRecords[key];
      return total + (record ? record.size : 0);
    }, 0);

    if (this.config.debug) {
      console.log(`[LRU] Selected ${keysToCleanup.length} keys for cleanup, will free ${Utils.formatDataSize(freedSpace)}`);
    }

    return keysToCleanup;
  }

  /**
   * 分层清理策略：优先清理不重要的大数据，然后使用LRU
   */
  private getLayeredCleanupKeys(cleanableKeys: string[], spaceToFree: number): string[] {
    const keysToCleanup: string[] = [];
    let freedSpace = 0;

    // 第一层：清理不重要的大数据（按大小降序）
    const unimportantLargeKeys = cleanableKeys
      .filter(key => {
        const isUnimportant = Utils.isUnimportantKey(key, this.config.unimportantKeys || []);
        const record = this.accessRecords[key];
        const isLarge = record && record.size > 5 * 1024; // 内部固定5KB阈值
        return isUnimportant && isLarge;
      })
      .sort((a, b) => {
        const sizeA = this.accessRecords[a]?.size || 0;
        const sizeB = this.accessRecords[b]?.size || 0;
        return sizeB - sizeA; // 大的在前
      });

    for (const key of unimportantLargeKeys) {
      const record = this.accessRecords[key];
      if (record) {
        keysToCleanup.push(key);
        freedSpace += record.size;

        if (this.config.debug) {
          console.log(`[LRU] 清理不重要的大数据: ${key} (${Utils.formatDataSize(record.size)})`);
        }

        if (freedSpace >= spaceToFree) {
          return keysToCleanup;
        }
      }
    }

    // 第二层：清理其他不重要的数据（按LRU排序）
    const otherUnimportantKeys = cleanableKeys
      .filter(key => {
        const isUnimportant = Utils.isUnimportantKey(key, this.config.unimportantKeys || []);
        const record = this.accessRecords[key];
        const isLarge = record && record.size > 5 * 1024; // 内部固定5KB阈值
        return isUnimportant && !isLarge && !keysToCleanup.includes(key);
      });

    const sortedUnimportantKeys = this.sortKeysByLRU(otherUnimportantKeys);

    for (const key of sortedUnimportantKeys) {
      const record = this.accessRecords[key];
      if (record) {
        keysToCleanup.push(key);
        freedSpace += record.size;

        if (freedSpace >= spaceToFree) {
          return keysToCleanup;
        }
      }
    }

    // 第三层：清理重要数据（按LRU排序）
    const importantKeys = cleanableKeys
      .filter(key => {
        const isUnimportant = Utils.isUnimportantKey(key, this.config.unimportantKeys || []);
        return !isUnimportant && !keysToCleanup.includes(key);
      });

    const sortedImportantKeys = this.sortKeysByLRU(importantKeys);

    for (const key of sortedImportantKeys) {
      const record = this.accessRecords[key];
      if (record) {
        keysToCleanup.push(key);
        freedSpace += record.size;

        if (this.config.debug) {
          console.log(`[LRU] 清理重要数据: ${key} (${Utils.formatDataSize(record.size)})`);
        }

        if (freedSpace >= spaceToFree) {
          break;
        }
      }
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

        // 验证访问记录的完整性
        if (this.validateAccessRecords()) {
          if (this.config.debug) {
            console.log(`[LRU] Loaded ${Object.keys(this.accessRecords).length} access records`);
          }
        } else {
          // 访问记录损坏，触发重建
          console.warn('[LRU] Access records corrupted, rebuilding...');
          this.rebuildAccessRecords();
        }
      } else {
        // 没有访问记录，可能是首次使用
        if (this.config.debug) {
          console.log('[LRU] No existing access records found');
        }
        this.accessRecords = {};
      }
    } catch (error) {
      console.warn('[LRU] Failed to load access records, rebuilding:', error);
      // 加载失败，触发重建
      this.rebuildAccessRecords();
    }
  }

  /**
   * 验证访问记录的完整性
   */
  private validateAccessRecords(): boolean {
    try {
      // 检查访问记录是否为有效对象
      if (!this.accessRecords || typeof this.accessRecords !== 'object') {
        return false;
      }

      // 检查记录格式是否正确
      for (const [key, record] of Object.entries(this.accessRecords)) {
        if (!record ||
            typeof record.lastAccess !== 'number' ||
            typeof record.accessCount !== 'number' ||
            typeof record.size !== 'number' ||
            record.lastAccess <= 0 ||
            record.accessCount <= 0) {
          console.warn(`[LRU] Invalid access record for key: ${key}`);
          return false;
        }
      }

      return true;
    } catch (error) {
      console.warn('[LRU] Error validating access records:', error);
      return false;
    }
  }

  /**
   * 初始化存量数据的访问记录
   * 为已存在但没有访问记录的数据创建初始记录
   */
  private initializeExistingData(): void {
    try {
      const allKeys = this.getAllStorageKeys();
      const now = Date.now();
      let initializedCount = 0;

      for (const key of allKeys) {
        // 跳过系统键和排除的键
        if (Utils.isSystemKey(key) || this.config.excludeKeys.includes(key)) {
          continue;
        }

        // 如果没有访问记录，创建初始记录
        if (!this.accessRecords[key]) {
          const size = this.estimateItemSize(key);

          // 为存量数据设置一个较早的初始访问时间
          // 这样它们在LRU算法中会有较低的优先级
          const initialAccessTime = now - (24 * 60 * 60 * 1000); // 1天前

          this.accessRecords[key] = {
            lastAccess: initialAccessTime,
            accessCount: 1, // 初始访问次数为1
            size: size
          };

          initializedCount++;
        }
      }

      if (initializedCount > 0) {
        // 异步保存新的访问记录
        this.saveAccessRecordsDebounced();

        if (this.config.debug) {
          console.log(`[LRU] Initialized access records for ${initializedCount} existing keys`);
        }
      }
    } catch (error) {
      console.warn('[LRU] Failed to initialize existing data:', error);
    }
  }

  /**
   * 访问记录丢失时的兜底处理
   * 重建所有存储项的访问记录
   */
  private rebuildAccessRecords(): void {
    try {
      const allKeys = this.getAllStorageKeys();
      const now = Date.now();
      const rebuiltRecords: Record<string, IAccessRecord> = {};
      let rebuiltCount = 0;

      for (const key of allKeys) {
        // 跳过系统键和排除的键
        if (Utils.isSystemKey(key) || this.config.excludeKeys.includes(key)) {
          continue;
        }

        const size = this.estimateItemSize(key);

        // 为重建的记录设置默认值
        // 使用随机的初始访问时间（过去7天内）来模拟真实使用情况
        const randomDaysAgo = Math.random() * 7;
        const initialAccessTime = now - (randomDaysAgo * 24 * 60 * 60 * 1000);

        rebuiltRecords[key] = {
          lastAccess: initialAccessTime,
          accessCount: Math.floor(Math.random() * 5) + 1, // 1-5次随机访问
          size: size
        };

        rebuiltCount++;
      }

      this.accessRecords = rebuiltRecords;

      // 立即保存重建的记录
      this.saveAccessRecords();

      if (this.config.debug) {
        console.log(`[LRU] Rebuilt access records for ${rebuiltCount} keys after data loss`);
      }
    } catch (error) {
      console.error('[LRU] Failed to rebuild access records:', error);
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

        // console.log(`[LRU] Saved access records with compression:`);
        // const debugInfo = JSON.parse(result.debug);
        // console.log(`  - Original: ${debugInfo.originalCount} records`);
        // console.log(`  - Compressed: ${debugInfo.compressedCount} records`);
        // console.log(`  - Size reduction: ${debugInfo.compressionRatio}`);
        // console.log(`  - Storage size: ${Utils.formatBytes(result.compressed.length)}`);
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
        lastAccess: Utils.formatDate(record.lastAccess),
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

  /**
   * 执行基于时间的清理
   * 清理超过指定天数未访问的key
   */
  private performTimeBasedCleanup(): void {
    if (!this.config.enableTimeBasedCleanup) {
      return;
    }

    const now = Date.now();
    const thresholdMs = this.config.timeCleanupThreshold * 24 * 60 * 60 * 1000; // 转换为毫秒
    const expiredKeys: string[] = [];

    // 获取所有存储的键
    const allKeys = this.getAllStorageKeys();

    for (const key of allKeys) {
      // 跳过系统键和排除的键
      if (Utils.isSystemKey(key) || this.config.excludeKeys.includes(key)) {
        continue;
      }

      const record = this.accessRecords[key];

      if (record) {
        // 有访问记录，检查是否过期
        if (now - record.lastAccess > thresholdMs) {
          expiredKeys.push(key);
        }
      } else {
        // 没有访问记录的键，认为是很久以前的数据，直接清理
        expiredKeys.push(key);
      }
    }

    // 执行清理
    if (expiredKeys.length > 0) {
      this.cleanupExpiredKeys(expiredKeys);

      if (this.config.debug) {
        console.log(`[LRU] Time-based cleanup: removed ${expiredKeys.length} keys older than ${this.config.timeCleanupThreshold} days`);
        console.log(`[LRU] Cleaned keys:`, expiredKeys.slice(0, 5).join(', ') + (expiredKeys.length > 5 ? '...' : ''));
      }
    }
  }

  /**
   * 获取所有存储键（需要适配器支持）
   */
  private getAllStorageKeys(): string[] {
    try {
      const keys = this.storageAdapter.getAllKeys();
      return Array.isArray(keys) ? keys : [];
    } catch (error) {
      console.warn('[LRU] Failed to get all storage keys:', error);
      return [];
    }
  }

  /**
   * 清理过期的键
   */
  private cleanupExpiredKeys(keys: string[]): void {
    for (const key of keys) {
      try {
        // 从实际存储中删除
        this.storageAdapter.removeItem(key);

        // 从访问记录中删除
        delete this.accessRecords[key];
      } catch (error) {
        console.warn(`[LRU] Failed to cleanup key "${key}":`, error);
      }
    }
  }

  /**
   * 手动触发基于时间的清理
   */
  triggerTimeBasedCleanup(): {
    cleanedKeys: string[];
    cleanedCount: number;
  } {
    const beforeKeys = this.getAllStorageKeys().length;
    this.performTimeBasedCleanup();
    const afterKeys = this.getAllStorageKeys().length;

    const cleanedCount = beforeKeys - afterKeys;
    const cleanedKeys = Object.keys(this.accessRecords).filter(key => {
      const record = this.accessRecords[key];
      const now = Date.now();
      const thresholdMs = this.config.timeCleanupThreshold * 24 * 60 * 60 * 1000;
      return now - record.lastAccess > thresholdMs;
    });

    return {
      cleanedKeys: cleanedKeys.slice(0, 10), // 只返回前10个作为示例
      cleanedCount
    };
  }

  /**
   * 获取即将过期的键列表（用于预警）
   */
  getExpiringKeys(warningDays: number = 1): Array<{
    key: string;
    lastAccess: string;
    daysUntilExpiry: number;
    accessCount: number;
  }> {
    const now = Date.now();
    const thresholdMs = this.config.timeCleanupThreshold * 24 * 60 * 60 * 1000;
    const warningMs = warningDays * 24 * 60 * 60 * 1000;
    const expiringKeys: Array<{
      key: string;
      lastAccess: string;
      daysUntilExpiry: number;
      accessCount: number;
    }> = [];

    for (const [key, record] of Object.entries(this.accessRecords)) {
      if (Utils.isSystemKey(key) || this.config.excludeKeys.includes(key)) {
        continue;
      }

      const timeSinceAccess = now - record.lastAccess;
      const timeUntilExpiry = thresholdMs - timeSinceAccess;

      // 如果在警告期内
      if (timeUntilExpiry > 0 && timeUntilExpiry <= warningMs) {
        expiringKeys.push({
          key,
          lastAccess: Utils.formatDate(record.lastAccess),
          daysUntilExpiry: Math.ceil(timeUntilExpiry / (24 * 60 * 60 * 1000)),
          accessCount: record.accessCount
        });
      }
    }

    return expiringKeys.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
  }

  /**
   * 获取不重要keys的清理候选项
   */
  getUnimportantKeysCleanupCandidates(): Array<{
    key: string;
    size: string;
    lastAccess: string;
    isLarge: boolean;
    accessCount: number;
  }> {
    const candidates: Array<{
      key: string;
      size: string;
      lastAccess: string;
      isLarge: boolean;
      accessCount: number;
    }> = [];

    for (const [key, record] of Object.entries(this.accessRecords)) {
      if (Utils.isSystemKey(key) || this.config.excludeKeys.includes(key)) {
        continue;
      }

      const isUnimportant = Utils.isUnimportantKey(key, this.config.unimportantKeys || []);
      if (isUnimportant) {
        const isLarge = record.size > 5 * 1024; // 内部固定5KB阈值
        candidates.push({
          key,
          size: Utils.formatDataSize(record.size),
          lastAccess: Utils.formatDate(record.lastAccess),
          isLarge,
          accessCount: record.accessCount
        });
      }
    }

    // 按大小降序排列，大的在前
    return candidates.sort((a, b) => {
      const sizeA = this.accessRecords[a.key]?.size || 0;
      const sizeB = this.accessRecords[b.key]?.size || 0;
      return sizeB - sizeA;
    });
  }

  /**
   * 获取时间清理统计信息
   */
  getTimeCleanupStats(): {
    enabled: boolean;
    thresholdDays: number;
    expiredKeysCount: number;
    expiringKeysCount: number;
    totalTrackedKeys: number;
  } {
    if (!this.config.enableTimeBasedCleanup) {
      return {
        enabled: false,
        thresholdDays: 0,
        expiredKeysCount: 0,
        expiringKeysCount: 0,
        totalTrackedKeys: 0
      };
    }

    const now = Date.now();
    const thresholdMs = this.config.timeCleanupThreshold * 24 * 60 * 60 * 1000;
    const warningMs = 24 * 60 * 60 * 1000; // 1天警告期

    let expiredKeysCount = 0;
    let expiringKeysCount = 0;

    for (const record of Object.values(this.accessRecords)) {
      const timeSinceAccess = now - record.lastAccess;

      if (timeSinceAccess > thresholdMs) {
        expiredKeysCount++;
      } else if (thresholdMs - timeSinceAccess <= warningMs) {
        expiringKeysCount++;
      }
    }

    return {
      enabled: true,
      thresholdDays: this.config.timeCleanupThreshold,
      expiredKeysCount,
      expiringKeysCount,
      totalTrackedKeys: Object.keys(this.accessRecords).length
    };
  }

  /**
   * 检查访问记录的健康状态
   */
  checkAccessRecordsHealth(): {
    isHealthy: boolean;
    totalKeys: number;
    trackedKeys: number;
    missingRecords: number;
    corruptedRecords: number;
    recommendations: string[];
  } {
    const allKeys = this.getAllStorageKeys().filter(key =>
      !Utils.isSystemKey(key) && !this.config.excludeKeys.includes(key)
    );

    const trackedKeys = Object.keys(this.accessRecords);
    const missingRecords = allKeys.filter(key => !this.accessRecords[key]).length;

    let corruptedRecords = 0;
    for (const [key, record] of Object.entries(this.accessRecords)) {
      if (!record ||
          typeof record.lastAccess !== 'number' ||
          typeof record.accessCount !== 'number' ||
          typeof record.size !== 'number' ||
          record.lastAccess <= 0 ||
          record.accessCount <= 0) {
        corruptedRecords++;
      }
    }

    const recommendations: string[] = [];
    const isHealthy = missingRecords === 0 && corruptedRecords === 0;

    if (missingRecords > 0) {
      recommendations.push(`${missingRecords} 个存储项缺少访问记录，建议重新初始化`);
    }

    if (corruptedRecords > 0) {
      recommendations.push(`${corruptedRecords} 个访问记录已损坏，建议重建记录`);
    }

    if (missingRecords > allKeys.length * 0.5) {
      recommendations.push('超过50%的记录缺失，建议执行完整重建');
    }

    return {
      isHealthy,
      totalKeys: allKeys.length,
      trackedKeys: trackedKeys.length,
      missingRecords,
      corruptedRecords,
      recommendations
    };
  }

  /**
   * 手动重建访问记录
   */
  manualRebuildAccessRecords(): {
    before: { trackedKeys: number; totalKeys: number };
    after: { trackedKeys: number; totalKeys: number };
    rebuiltCount: number;
  } {
    const beforeStats = this.checkAccessRecordsHealth();

    this.rebuildAccessRecords();

    const afterStats = this.checkAccessRecordsHealth();

    return {
      before: {
        trackedKeys: beforeStats.trackedKeys,
        totalKeys: beforeStats.totalKeys
      },
      after: {
        trackedKeys: afterStats.trackedKeys,
        totalKeys: afterStats.totalKeys
      },
      rebuiltCount: afterStats.trackedKeys - beforeStats.trackedKeys
    };
  }
}