/**
 * 存储适配器接口
 */
export interface IStorageAdapter {
  /**
   * 获取存储项
   */
  getItem(key: string): Promise<string | null> | string | null;

  /**
   * 设置存储项
   */
  setItem(key: string, value: string): Promise<void> | void;

  /**
   * 删除存储项
   */
  removeItem(key: string): Promise<void> | void;

  /**
   * 获取所有键
   */
  getAllKeys(): Promise<string[]> | string[];

  /**
   * 获取存储大小（字节）
   */
  getStorageSize(): Promise<number> | number;

  /**
   * 获取单个项的大小（字节）
   */
  getItemSize(key: string): Promise<number> | number;

  /**
   * 清空存储
   */
  clear(): Promise<void> | void;
}

/**
 * 清理策略接口
 */
export interface ICleanupStrategy {
  /**
   * 记录访问
   */
  recordAccess(key: string): void;

  /**
   * 获取需要清理的键列表
   */
  getKeysToCleanup(
    allKeys: string[],
    currentSize: number,
    maxSize: number,
    requiredSpace?: number
  ): string[];

  /**
   * 清理指定的键
   */
  cleanup(keys: string[]): void;

  /**
   * 获取策略名称
   */
  getName(): string;
}

/**
 * SDK配置接口
 */
export interface IStorageCleanerConfig {
  /**
   * 最大存储大小（字节）
   */
  maxStorageSize: number;

  /**
   * 清理阈值（0-1之间，表示达到最大容量的百分比时开始清理）
   */
  cleanupThreshold: number;

  /**
   * 清理比例（0-1之间，表示每次清理释放的空间比例）
   */
  cleanupRatio: number;

  /**
   * 访问记录的最大保存时间（毫秒）
   */
  maxAccessAge: number;

  /**
   * 是否启用自动清理
   */
  autoCleanup: boolean;

  /**
   * 清理策略
   */
  strategy?: ICleanupStrategy;

  /**
   * 调试模式
   */
  debug?: boolean;

  /**
   * 排除的键（不会被清理）
   */
  excludeKeys?: string[];
}

/**
 * 访问记录接口
 */
export interface IAccessRecord {
  /**
   * 最后访问时间
   */
  lastAccess: number;

  /**
   * 访问次数
   */
  accessCount: number;

  /**
   * 数据大小
   */
  size: number;
}

/**
 * 存储统计信息接口
 */
export interface IStorageStats {
  /**
   * 总大小
   */
  totalSize: number;

  /**
   * 项目数量
   */
  itemCount: number;

  /**
   * 最大大小
   */
  maxSize: number;

  /**
   * 使用率
   */
  usageRatio: number;

  /**
   * 最近清理时间
   */
  lastCleanup?: number;

  /**
   * 清理次数
   */
  cleanupCount: number;
}