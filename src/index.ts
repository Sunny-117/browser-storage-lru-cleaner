// 主要导出
export {
  StorageCleaner,
  createLocalStorageCleaner,
  createIndexedDBCleaner
} from './storage-cleaner';

// 接口导出
export type {
  IStorageAdapter,
  ICleanupStrategy,
  IStorageCleanerConfig,
  IAccessRecord,
  IStorageStats
} from './interfaces';

// 适配器导出
export { LocalStorageAdapter, IndexedDBAdapter } from './adapters';

// 策略导出
export { LRUStrategy } from './strategies';

// 工具导出
export { Utils } from './utils';

// 版本信息
export const VERSION = '1.0.0';