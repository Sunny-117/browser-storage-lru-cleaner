import {
  IStorageAdapter,
  ICleanupStrategy,
  IStorageCleanerConfig,
  IStorageStats
} from './interfaces';
import { LRUStrategy } from './strategies';
import { LocalStorageAdapter, IndexedDBAdapter } from './adapters';
import { Utils } from './utils';

/**
 * 默认配置
 */
const DEFAULT_CONFIG: IStorageCleanerConfig = {
  maxStorageSize: 5 * 1024 * 1024, // 5MB
  cleanupThreshold: 0.8, // 80%
  cleanupRatio: 0.3, // 清理30%
  maxAccessAge: 7 * 24 * 60 * 60 * 1000, // 7天
  autoCleanup: true,
  debug: false,
  excludeKeys: [],
  enableTimeBasedCleanup: true, // 启用基于时间的清理
  timeCleanupThreshold: 7, // 7天未访问自动清理
  cleanupOnInsert: true, // 插入时触发清理
  unimportantKeys: [] // 不重要的keys列表，智能插入会自动处理
};

/**
 * 浏览器存储清理器
 */
export class StorageCleaner {
  private adapter: IStorageAdapter;
  private strategy: ICleanupStrategy;
  private config: IStorageCleanerConfig;
  private originalStorage: Storage | null = null;
  private isProxyInstalled = false;
  private stats: IStorageStats;

  constructor(
    adapter: IStorageAdapter,
    config: Partial<IStorageCleanerConfig> = {}
  ) {
    this.adapter = adapter;
    this.config = { ...DEFAULT_CONFIG, ...config };

    // 如果没有提供策略，使用默认的LRU策略
    this.strategy = this.config.strategy || new LRUStrategy(this.adapter, {
      maxAccessAge: this.config.maxAccessAge,
      excludeKeys: this.config.excludeKeys,
      debug: this.config.debug,
      enableTimeBasedCleanup: this.config.enableTimeBasedCleanup,
      timeCleanupThreshold: this.config.timeCleanupThreshold,
      cleanupOnInsert: this.config.cleanupOnInsert,
      unimportantKeys: this.config.unimportantKeys
    });

    this.stats = {
      totalSize: 0,
      itemCount: 0,
      maxSize: this.config.maxStorageSize,
      usageRatio: 0,
      cleanupCount: 0
    };

    this.updateStats();
  }

  /**
   * 安装代理，拦截存储操作
   */
  installProxy(): void {
    if (this.isProxyInstalled) {
      console.warn('[StorageCleaner] Proxy is already installed');
      return;
    }

    if (this.adapter instanceof LocalStorageAdapter) {
      this.installLocalStorageProxy();
    }

    this.isProxyInstalled = true;

    if (this.config.debug) {
      console.log('[StorageCleaner] Proxy installed successfully');
    }
  }

  /**
   * 卸载代理，恢复原始存储
   */
  uninstallProxy(): void {
    if (!this.isProxyInstalled) {
      console.warn('[StorageCleaner] Proxy is not installed');
      return;
    }

    if (this.originalStorage && this.adapter instanceof LocalStorageAdapter) {
      Object.defineProperty(window, 'localStorage', {
        value: this.originalStorage,
        writable: true,
        configurable: true
      });
    }

    this.isProxyInstalled = false;

    if (this.config.debug) {
      console.log('[StorageCleaner] Proxy uninstalled successfully');
    }
  }

  /**
   * 安装localStorage代理
   */
  private installLocalStorageProxy(): void {
    this.originalStorage = window.localStorage;

    const self = this;
    const proxiedStorage = new Proxy(this.originalStorage, {
      get(target, prop, receiver) {
        if (prop === 'getItem') {
          return function(key: string) {
            const result = target.getItem(key);
            if (result !== null) {
              self.strategy.recordAccess(key);
            }
            return result;
          };
        }

        if (prop === 'setItem') {
          return function(key: string, value: string) {
            // 智能插入检查 - 优先进行，如果拒绝则不做任何操作
            if (self.config.unimportantKeys && self.config.unimportantKeys.length > 0) {
              // 检查是否应该拒绝插入（不重要的大数据且空间不足）
              const shouldReject = self.shouldRejectInsertion(key);
              console.log({key, value, shouldReject}, 'shouldReject')
              if (shouldReject) {
                if (self.config.debug) {
                  console.log(`[StorageCleaner] 拒绝插入不重要数据: ${key} (${Utils.formatDataSize(Utils.estimateDataSize(value))})`);
                }
                return; // 直接返回，不做任何操作
              }
            }

            // 在设置前检查是否需要清理
            if (self.config.autoCleanup) {
              self.checkAndCleanup(Utils.estimateDataSize(key) + Utils.estimateDataSize(value));
            }

            target.setItem(key, value);

            // 记录访问
            self.strategy.recordAccess(key, value);

            self.updateStats();
          };
        }

        if (prop === 'removeItem') {
          return function(key: string) {
            target.removeItem(key);
            self.updateStats();
          };
        }

        if (prop === 'clear') {
          return function() {
            target.clear();
            self.updateStats();
          };
        }

        if (prop === 'length') {
          return target.length;
        }

        if (prop === 'key') {
          return function(index: number) {
            return target.key(index);
          };
        }

        return Reflect.get(target, prop, receiver);
      }
    });

    // 替换全局localStorage
    Object.defineProperty(window, 'localStorage', {
      value: proxiedStorage,
      writable: true,
      configurable: true
    });
  }

  /**
   * 判断是否应该拒绝插入（智能插入策略）
   * 只有不重要的数据 && 空间不足时才拒绝插入
   */
  private shouldRejectInsertion(key: string): boolean {
    // 检查是否为不重要的key
    const isUnimportant = Utils.isUnimportantKey(key, this.config.unimportantKeys || []);

    // 检查存储空间是否不足
    const stats = this.getStats();
    const isSpaceInsufficient = stats.usageRatio > this.config.cleanupThreshold;

    // 只有不重要的数据 && 空间不足时才拒绝插入
    const shouldReject = isUnimportant && isSpaceInsufficient;

    if (this.config.debug && shouldReject) {
      console.log(`[StorageCleaner] 存储空间不足 (${Math.round(stats.usageRatio * 100)}%) 且为不重要数据，拒绝插入: ${key}`);
    }

    return shouldReject;
  }

  /**
   * 检查并执行清理
   */
  private async checkAndCleanup(requiredSpace: number = 0): Promise<void> {
    try {
      const currentSize = await this.adapter.getStorageSize();
      const threshold = this.config.maxStorageSize * this.config.cleanupThreshold;

      if (currentSize + requiredSpace > threshold) {
        await this.cleanup(requiredSpace);
      }
    } catch (error) {
      console.warn('[StorageCleaner] Failed to check and cleanup:', error);
    }
  }

  /**
   * 执行清理
   */
  async cleanup(requiredSpace: number = 0): Promise<void> {
    try {
      const allKeys = await this.adapter.getAllKeys();
      const currentSize = await this.adapter.getStorageSize();

      const keysToCleanup = this.strategy.getKeysToCleanup(
        allKeys,
        currentSize,
        this.config.maxStorageSize,
        requiredSpace
      );

      if (keysToCleanup.length === 0) {
        if (this.config.debug) {
          console.log('[StorageCleaner] No keys to cleanup');
        }
        return;
      }

      // 删除选中的键
      for (const key of keysToCleanup) {
        await this.adapter.removeItem(key);
      }

      // 通知策略清理完成
      this.strategy.cleanup(keysToCleanup);

      // 更新统计信息
      this.stats.cleanupCount++;
      this.stats.lastCleanup = Utils.now();
      this.updateStats();

      if (this.config.debug) {
        const newSize = await this.adapter.getStorageSize();
        console.log(`[StorageCleaner] Cleaned up ${keysToCleanup.length} keys, freed ${Utils.formatBytes(currentSize - newSize)}`);
      }
    } catch (error) {
      console.error('[StorageCleaner] Failed to cleanup:', error);
    }
  }

  /**
   * 手动触发清理
   */
  async manualCleanup(): Promise<void> {
    await this.cleanup();
  }

  /**
   * 更新统计信息
   */
  private async updateStats(): Promise<void> {
    try {
      const totalSize = await this.adapter.getStorageSize();
      const allKeys = await this.adapter.getAllKeys();

      this.stats.totalSize = totalSize;
      this.stats.itemCount = allKeys.length;
      this.stats.usageRatio = totalSize / this.config.maxStorageSize;
    } catch (error) {
      console.warn('[StorageCleaner] Failed to update stats:', error);
    }
  }

  /**
   * 获取统计信息
   */
  getStats(): IStorageStats {
    return { ...this.stats };
  }

  /**
   * 获取配置
   */
  getConfig(): IStorageCleanerConfig {
    return { ...this.config };
  }

  /**
   * 更新配置
   */
  updateConfig(newConfig: Partial<IStorageCleanerConfig>): void {
    this.config = { ...this.config, ...newConfig };

    if (this.config.debug) {
      console.log('[StorageCleaner] Config updated:', this.config);
    }
  }

  /**
   * 获取存储适配器
   */
  getAdapter(): IStorageAdapter {
    return this.adapter;
  }

  /**
   * 获取清理策略
   */
  getStrategy(): ICleanupStrategy {
    return this.strategy;
  }

  /**
   * 设置清理策略
   */
  setStrategy(strategy: ICleanupStrategy): void {
    this.strategy = strategy;

    if (this.config.debug) {
      console.log(`[StorageCleaner] Strategy changed to: ${strategy.getName()}`);
    }
  }

  /**
   * 检查存储健康状态
   */
  async checkHealth(): Promise<{
    isHealthy: boolean;
    issues: string[];
    recommendations: string[];
  }> {
    const issues: string[] = [];
    const recommendations: string[] = [];

    try {
      await this.updateStats();

      // 检查使用率
      if (this.stats.usageRatio > 0.9) {
        issues.push('Storage usage is above 90%');
        recommendations.push('Consider increasing cleanup frequency or reducing max storage size');
      }

      // 检查项目数量
      if (this.stats.itemCount > 1000) {
        issues.push('Too many items in storage');
        recommendations.push('Consider implementing more aggressive cleanup policies');
      }

      // 检查适配器可用性
      if (this.adapter instanceof LocalStorageAdapter) {
        const adapter = this.adapter as LocalStorageAdapter;
        if (!adapter.isAvailable()) {
          issues.push('localStorage is not available');
          recommendations.push('Check browser settings and available storage quota');
        }
      }

      if (this.adapter instanceof IndexedDBAdapter) {
        const adapter = this.adapter as IndexedDBAdapter;
        if (!adapter.isAvailable()) {
          issues.push('IndexedDB is not available');
          recommendations.push('Check browser compatibility and settings');
        }
      }

      return {
        isHealthy: issues.length === 0,
        issues,
        recommendations
      };
    } catch (error) {
      return {
        isHealthy: false,
        issues: ['Failed to check storage health'],
        recommendations: ['Check console for detailed error information']
      };
    }
  }

  /**
   * 手动触发基于时间的清理
   */
  triggerTimeBasedCleanup(): {
    cleanedKeys: string[];
    cleanedCount: number;
  } | null {
    if (this.strategy instanceof LRUStrategy) {
      const result = (this.strategy as any).triggerTimeBasedCleanup();
      this.updateStats();
      return result;
    }
    return null;
  }

  /**
   * 获取即将过期的键列表
   */
  getExpiringKeys(warningDays: number = 1): Array<{
    key: string;
    lastAccess: string;
    daysUntilExpiry: number;
    accessCount: number;
  }> {
    if (this.strategy instanceof LRUStrategy) {
      return (this.strategy as any).getExpiringKeys(warningDays);
    }
    return [];
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
    if (this.strategy instanceof LRUStrategy) {
      return (this.strategy as any).getTimeCleanupStats();
    }
    return {
      enabled: false,
      thresholdDays: 0,
      expiredKeysCount: 0,
      expiringKeysCount: 0,
      totalTrackedKeys: 0
    };
  }

  /**
   * 配置时间清理参数
   */
  configureTimeBasedCleanup(options: {
    enabled?: boolean;
    thresholdDays?: number;
    cleanupOnInsert?: boolean;
  }): void {
    if (options.enabled !== undefined) {
      this.config.enableTimeBasedCleanup = options.enabled;
    }
    if (options.thresholdDays !== undefined) {
      this.config.timeCleanupThreshold = options.thresholdDays;
    }
    if (options.cleanupOnInsert !== undefined) {
      this.config.cleanupOnInsert = options.cleanupOnInsert;
    }

    // 如果策略是LRU策略，更新其配置
    if (this.strategy instanceof LRUStrategy) {
      (this.strategy as any).config.enableTimeBasedCleanup = this.config.enableTimeBasedCleanup;
      (this.strategy as any).config.timeCleanupThreshold = this.config.timeCleanupThreshold;
      (this.strategy as any).config.cleanupOnInsert = this.config.cleanupOnInsert;
    }

    if (this.config.debug) {
      console.log('[StorageCleaner] Time-based cleanup configured:', {
        enabled: this.config.enableTimeBasedCleanup,
        thresholdDays: this.config.timeCleanupThreshold,
        cleanupOnInsert: this.config.cleanupOnInsert
      });
    }
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
  } | null {
    if (this.strategy instanceof LRUStrategy) {
      return (this.strategy as any).checkAccessRecordsHealth();
    }
    return null;
  }

  /**
   * 手动重建访问记录
   * 当访问记录丢失或损坏时使用
   */
  rebuildAccessRecords(): {
    before: { trackedKeys: number; totalKeys: number };
    after: { trackedKeys: number; totalKeys: number };
    rebuiltCount: number;
  } | null {
    if (this.strategy instanceof LRUStrategy) {
      const result = (this.strategy as any).manualRebuildAccessRecords();
      this.updateStats();

      if (this.config.debug) {
        console.log('[StorageCleaner] Access records rebuilt:', result);
      }

      return result;
    }
    return null;
  }

  /**
   * 初始化存量数据
   * 为已存在但没有访问记录的数据创建记录
   */
  initializeExistingData(): number {
    if (this.strategy instanceof LRUStrategy) {
      const beforeCount = Object.keys((this.strategy as any).accessRecords).length;
      (this.strategy as any).initializeExistingData();
      const afterCount = Object.keys((this.strategy as any).accessRecords).length;

      const initializedCount = afterCount - beforeCount;

      if (this.config.debug && initializedCount > 0) {
        console.log(`[StorageCleaner] Initialized ${initializedCount} existing data records`);
      }

      return initializedCount;
    }
    return 0;
  }

  /**
   * 自动修复访问记录
   * 检查健康状态并根据需要进行修复
   */
  autoRepairAccessRecords(): {
    healthCheck: any;
    repairAction: 'none' | 'initialize' | 'rebuild';
    result?: any;
  } {
    const healthCheck = this.checkAccessRecordsHealth();

    if (!healthCheck) {
      return {
        healthCheck: null,
        repairAction: 'none'
      };
    }

    // 如果健康状态良好，无需修复
    if (healthCheck.isHealthy) {
      return {
        healthCheck,
        repairAction: 'none'
      };
    }

    // 如果缺失记录较多但没有损坏，进行初始化
    if (healthCheck.missingRecords > 0 && healthCheck.corruptedRecords === 0) {
      const initializedCount = this.initializeExistingData();
      return {
        healthCheck,
        repairAction: 'initialize',
        result: { initializedCount }
      };
    }

    // 如果有损坏记录或缺失过多，进行重建
    if (healthCheck.corruptedRecords > 0 ||
        healthCheck.missingRecords > healthCheck.totalKeys * 0.5) {
      const rebuildResult = this.rebuildAccessRecords();
      return {
        healthCheck,
        repairAction: 'rebuild',
        result: rebuildResult
      };
    }

    return {
      healthCheck,
      repairAction: 'none'
    };
  }

  /**
   * 配置不重要的keys（智能插入会自动处理）
   */
  configureUnimportantKeys(unimportantKeys: string[]): void {
    this.config.unimportantKeys = unimportantKeys;

    if (this.config.debug) {
      console.log('[StorageCleaner] Unimportant keys configured:', {
        unimportantKeys: this.config.unimportantKeys,
        smartInsertionEnabled: this.config.unimportantKeys.length > 0
      });
    }
  }

  /**
   * 获取智能插入统计信息
   */
  getSmartInsertionStats(): {
    enabled: boolean;
    unimportantKeysCount: number;
    largeDataThreshold: string;
  } {
    return {
      enabled: (this.config.unimportantKeys || []).length > 0,
      unimportantKeysCount: (this.config.unimportantKeys || []).length,
      largeDataThreshold: '5KB' // 内部固定阈值
    };
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
    if (this.strategy instanceof LRUStrategy) {
      return (this.strategy as any).getUnimportantKeysCleanupCandidates();
    }
    return [];
  }

  /**
   * 手动清理孤立的访问记录
   * 删除records中存在但storage中不存在的key记录
   */
  cleanupOrphanedRecords(): {
    cleanedCount: number;
    orphanedKeys: string[];
  } {
    if (this.strategy instanceof LRUStrategy) {
      const beforeCount = Object.keys((this.strategy as any).accessRecords).length;
      (this.strategy as any).cleanupOrphanedRecords();
      const afterCount = Object.keys((this.strategy as any).accessRecords).length;

      const cleanedCount = beforeCount - afterCount;
      const result = {
        cleanedCount,
        orphanedKeys: [] // 实际的孤立keys在cleanupOrphanedRecords方法中已经被删除
      };

      if (this.config.debug) {
        console.log(`[StorageCleaner] 手动清理孤立记录完成: 清理了 ${cleanedCount} 个记录`);
      }

      return result;
    }

    return { cleanedCount: 0, orphanedKeys: [] };
  }

  /**
   * 销毁实例
   */
  destroy(): void {
    this.uninstallProxy();

    if (this.adapter instanceof IndexedDBAdapter) {
      this.adapter.close();
    }

    if (this.config.debug) {
      console.log('[StorageCleaner] Instance destroyed');
    }
  }
}

/**
 * 创建localStorage清理器的便捷方法
 */
export function createLocalStorageCleaner(config?: Partial<IStorageCleanerConfig>): StorageCleaner {
  const adapter = new LocalStorageAdapter();
  return new StorageCleaner(adapter, config);
}

/**
 * 创建IndexedDB清理器的便捷方法
 */
export function createIndexedDBCleaner(
  dbName?: string,
  storeName?: string,
  config?: Partial<IStorageCleanerConfig>
): StorageCleaner {
  const adapter = new IndexedDBAdapter(dbName, storeName);
  return new StorageCleaner(adapter, config);
}