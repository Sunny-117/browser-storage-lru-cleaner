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
