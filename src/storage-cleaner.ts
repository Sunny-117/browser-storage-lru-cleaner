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
  excludeKeys: []
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
      debug: this.config.debug
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
            // 在设置前检查是否需要清理
            if (self.config.autoCleanup) {
              self.checkAndCleanup(Utils.getStringByteSize(key) + Utils.getStringByteSize(value));
            }

            target.setItem(key, value);
            self.strategy.recordAccess(key);
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