# Browser Storage LRU Cleaner - 技术设计文档

## 📋 概述

本文档详细描述了Browser Storage LRU Cleaner SDK的技术设计思路、架构决策和实现细节。

## 🎯 设计目标

### 核心目标
1. **业务无感知**: 通过代理模式实现透明的存储清理，无需修改业务代码
2. **智能清理**: 基于LRU算法智能识别和清理不常用数据
3. **高性能**: 最小化对业务性能的影响
4. **可扩展**: 支持自定义清理策略和存储适配器
5. **可靠性**: 保证关键数据不被误删，提供完善的错误处理

### 技术目标
- 支持localStorage和IndexedDB
- 兼容主流浏览器
- TypeScript支持
- 模块化设计
- 完善的测试覆盖

## 🏗️ 架构设计

### 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                        应用层                                │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │   React App     │  │    Vue App      │  │  Vanilla JS     │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                                │
┌─────────────────────────────────────────────────────────────┐
│                    SDK 接口层                                │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  createLocalStorageCleaner / createIndexedDBCleaner    │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                                │
┌─────────────────────────────────────────────────────────────┐
│                    核心控制层                                │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │                StorageCleaner                          │ │
│  │  ├── 代理管理 (Proxy Management)                        │ │
│  │  ├── 配置管理 (Configuration)                           │ │
│  │  ├── 统计监控 (Statistics)                              │ │
│  │  ├── 健康检查 (Health Check)                            │ │
│  │  └── 生命周期管理 (Lifecycle)                           │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                                │
┌─────────────────────────────────────────────────────────────┐
│                    策略层                                    │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │   LRUStrategy   │  │ CustomStrategy  │  │ TimeStrategy    │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
│                    ICleanupStrategy                          │
└─────────────────────────────────────────────────────────────┘
                                │
┌─────────────────────────────────────────────────────────────┐
│                    适配器层                                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │LocalStorageAdapter│ │IndexedDBAdapter │ │ CustomAdapter   │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
│                    IStorageAdapter                           │
└─────────────────────────────────────────────────────────────┘
                                │
┌─────────────────────────────────────────────────────────────┐
│                    浏览器存储层                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │  localStorage   │  │   IndexedDB     │  │   其他存储      │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 核心组件

#### 1. StorageCleaner (核心控制器)

**职责**:
- 管理存储代理的安装和卸载
- 协调清理策略和存储适配器
- 提供统一的配置管理
- 监控存储使用情况
- 处理清理触发逻辑

**关键方法**:
```typescript
class StorageCleaner {
  // 代理管理
  installProxy(): void
  uninstallProxy(): void

  // 清理控制
  checkAndCleanup(requiredSpace?: number): Promise<void>
  manualCleanup(): Promise<void>

  // 监控统计
  getStats(): IStorageStats
  checkHealth(): Promise<HealthResult>

  // 配置管理
  updateConfig(config: Partial<IStorageCleanerConfig>): void

  // 生命周期
  destroy(): void
}
```

#### 2. ICleanupStrategy (清理策略接口)

**设计原则**:
- 策略模式，支持算法替换
- 无状态设计，便于测试
- 明确的职责分离

```typescript
interface ICleanupStrategy {
  // 策略标识
  getName(): string

  // 访问记录
  recordAccess(key: string): void

  // 清理决策
  getKeysToCleanup(
    allKeys: string[],
    currentSize: number,
    maxSize: number,
    requiredSpace?: number
  ): string[]

  // 清理后处理
  cleanup(keys: string[]): void
}
```

#### 3. IStorageAdapter (存储适配器接口)

**设计原则**:
- 适配器模式，统一不同存储的接口
- 支持同步和异步操作
- 提供存储特定的优化

```typescript
interface IStorageAdapter {
  // 基础操作
  getItem(key: string): Promise<string | null> | string | null
  setItem(key: string, value: string): Promise<void> | void
  removeItem(key: string): Promise<void> | void

  // 批量操作
  getAllKeys(): Promise<string[]> | string[]
  clear(): Promise<void> | void

  // 容量管理
  getStorageSize(): Promise<number> | number
  getItemSize(key: string): Promise<number> | number
}
```

## 🔧 核心算法

### LRU算法实现

#### 数据结构

```typescript
interface IAccessRecord {
  lastAccess: number;    // 最后访问时间戳
  accessCount: number;   // 总访问次数
  size: number;          // 数据大小（字节）
}

// 访问记录存储
private accessRecords: Record<string, IAccessRecord> = {};
```

#### 访问记录更新

```typescript
recordAccess(key: string): void {
  const now = Date.now();
  const existing = this.accessRecords[key];

  if (existing) {
    // 更新现有记录
    existing.lastAccess = now;
    existing.accessCount++;
  } else {
    // 创建新记录
    this.accessRecords[key] = {
      lastAccess: now,
      accessCount: 1,
      size: 0 // 延迟计算
    };
  }

  // 防抖保存
  this.saveAccessRecordsDebounced();
}
```

#### LRU排序算法

```typescript
private sortKeysByLRU(keys: string[]): string[] {
  return keys.sort((a, b) => {
    const recordA = this.accessRecords[a];
    const recordB = this.accessRecords[b];

    // 优先级：无记录 > 时间早 > 访问少
    if (!recordA && !recordB) return 0;
    if (!recordA) return -1;  // A优先清理
    if (!recordB) return 1;   // B优先清理

    // 按最后访问时间排序
    const timeDiff = recordA.lastAccess - recordB.lastAccess;
    if (timeDiff !== 0) return timeDiff;

    // 时间相同时按访问次数排序
    return recordA.accessCount - recordB.accessCount;
  });
}
```

#### 清理空间计算

```typescript
getKeysToCleanup(
  allKeys: string[],
  currentSize: number,
  maxSize: number,
  requiredSpace: number = 0
): string[] {
  // 计算目标大小
  const targetSize = Math.max(
    maxSize * (1 - this.config.cleanupRatio), // 清理到目标比例
    currentSize - requiredSpace               // 或释放足够空间
  );

  const spaceToFree = currentSize - targetSize;
  if (spaceToFree <= 0) return [];

  // 过滤可清理的键
  const cleanableKeys = allKeys.filter(key =>
    !this.isSystemKey(key) &&
    !this.config.excludeKeys.includes(key)
  );

  // 按LRU排序并选择清理目标
  const sortedKeys = this.sortKeysByLRU(cleanableKeys);
  const keysToCleanup: string[] = [];
  let freedSpace = 0;

  for (const key of sortedKeys) {
    const record = this.accessRecords[key];
    if (record && record.size > 0) {
      keysToCleanup.push(key);
      freedSpace += record.size;

      if (freedSpace >= spaceToFree) break;
    }
  }

  return keysToCleanup;
}
```

## 🎭 代理模式实现

### localStorage代理

#### 核心思路

使用JavaScript Proxy拦截localStorage的方法调用，在不改变原有API的情况下注入清理逻辑。

```typescript
private installLocalStorageProxy(): void {
  // 保存原始localStorage引用
  this.originalStorage = window.localStorage;

  const self = this;

  // 创建代理对象
  const proxiedStorage = new Proxy(this.originalStorage, {
    get(target, prop, receiver) {
      // 拦截getItem
      if (prop === 'getItem') {
        return function(key: string) {
          const result = target.getItem(key);
          if (result !== null) {
            // 记录访问
            self.strategy.recordAccess(key);
          }
          return result;
        };
      }

      // 拦截setItem
      if (prop === 'setItem') {
        return function(key: string, value: string) {
          // 预检查空间
          if (self.config.autoCleanup) {
            const requiredSpace = self.calculateRequiredSpace(key, value);
            self.checkAndCleanup(requiredSpace);
          }

          // 执行原始操作
          target.setItem(key, value);

          // 记录访问
          self.strategy.recordAccess(key);

          // 更新统计
          self.updateStats();
        };
      }

      // 其他方法直接透传
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
```

#### 错误处理

```typescript
if (prop === 'setItem') {
  return function(key: string, value: string) {
    try {
      // 预检查和清理
      if (self.config.autoCleanup) {
        const requiredSpace = self.calculateRequiredSpace(key, value);
        await self.checkAndCleanup(requiredSpace);
      }

      target.setItem(key, value);
      self.strategy.recordAccess(key);

    } catch (error) {
      if (error.name === 'QuotaExceededError') {
        // 存储配额超限，强制清理
        await self.cleanup(requiredSpace);

        // 重试
        try {
          target.setItem(key, value);
          self.strategy.recordAccess(key);
        } catch (retryError) {
          console.error('Failed to store after cleanup:', retryError);
          throw retryError;
        }
      } else {
        throw error;
      }
    }
  };
}
```

### IndexedDB适配器

#### 异步操作处理

IndexedDB的所有操作都是异步的，需要Promise化处理：

```typescript
async setItem(key: string, value: string): Promise<void> {
  const db = await this.initDB();
  const transaction = db.transaction([this.storeName], 'readwrite');
  const store = transaction.objectStore(this.storeName);

  return new Promise((resolve, reject) => {
    const request = store.put({
      key,
      value,
      timestamp: Date.now()
    });

    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error(`Failed to set item "${key}": ${request.error}`));
  });
}
```

#### 数据库初始化

```typescript
private async initDB(): Promise<IDBDatabase> {
  if (this.db) return this.db;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(this.dbName, this.version);

    request.onerror = () => reject(new Error(`Failed to open IndexedDB: ${request.error}`));

    request.onsuccess = () => {
      this.db = request.result;
      resolve(this.db);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains(this.storeName)) {
        const store = db.createObjectStore(this.storeName, { keyPath: 'key' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
  });
}
```

## 📊 数据压缩与存储

### 访问记录压缩

为了减少元数据占用的存储空间，访问记录使用压缩格式存储：

#### 压缩算法

```typescript
// 原始格式（占用空间大）
interface IAccessRecord {
  lastAccess: number;
  accessCount: number;
  size: number;
}

// 压缩格式（数组形式，减少键名占用）
type CompressedRecord = [number, number, number]; // [lastAccess, accessCount, size]

static compressAccessRecords(records: Record<string, IAccessRecord>): string {
  const compressed: Record<string, CompressedRecord> = {};

  for (const [key, record] of Object.entries(records)) {
    compressed[key] = [
      record.lastAccess,
      record.accessCount,
      record.size
    ];
  }

  return JSON.stringify(compressed);
}

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
```

#### 存储键管理

```typescript
// 系统键命名规范
static generateStorageKey(prefix: string, suffix: string): string {
  return `__${prefix}_${suffix}__`;
}

// 系统键识别
static isSystemKey(key: string): boolean {
  return key.startsWith('__') && key.endsWith('__');
}

// 预定义的系统键
const SYSTEM_KEYS = {
  LRU_ACCESS_RECORDS: '__lru_access_records__',
  CLEANER_CONFIG: '__cleaner_config__',
  CLEANER_STATS: '__cleaner_stats__'
};
```

## ⚡ 性能优化

### 防抖和节流

#### 访问记录保存防抖

```typescript
// 防抖保存，避免频繁写入
private saveAccessRecordsDebounced = Utils.debounce(() => {
  this.saveAccessRecords();
}, 1000); // 1秒内的多次调用合并为一次

// 防抖实现
static debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;

  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);

    timeout = setTimeout(() => {
      func.apply(null, args);
    }, wait);
  };
}
```

#### 统计更新节流

```typescript
// 节流更新统计，避免过于频繁的计算
private updateStatsThrottled = Utils.throttle(() => {
  this.updateStats();
}, 500); // 最多每500ms更新一次

// 节流实现
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
```

### 异步操作优化

#### 批量大小计算

```typescript
// 异步批量计算项目大小，避免阻塞
private async updateKeySizes(keys: string[]): Promise<void> {
  const BATCH_SIZE = 10; // 每批处理10个

  for (let i = 0; i < keys.length; i += BATCH_SIZE) {
    const batch = keys.slice(i, i + BATCH_SIZE);

    // 并行处理批次内的项目
    await Promise.all(batch.map(async (key) => {
      if (this.accessRecords[key]) {
        try {
          const size = await this.storageAdapter.getItemSize(key);
          this.accessRecords[key].size = size;
        } catch (error) {
          // 失败时使用估算值
          this.accessRecords[key].size = this.estimateItemSize(key);
        }
      }
    }));

    // 让出控制权，避免长时间阻塞
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}
```

#### 懒加载大小计算

```typescript
// 只在需要时计算项目大小
getItemSize(key: string): number {
  const record = this.accessRecords[key];

  if (record && record.size > 0) {
    return record.size; // 使用缓存值
  }

  // 懒计算并缓存
  const size = this.calculateItemSize(key);
  if (record) {
    record.size = size;
  }

  return size;
}
```

## 🛡️ 错误处理与容错

### 存储异常处理

#### 配额超限处理

```typescript
private async handleQuotaExceeded(key: string, value: string): Promise<void> {
  const requiredSpace = Utils.getStringByteSize(key) + Utils.getStringByteSize(value);

  // 尝试清理释放空间
  await this.cleanup(requiredSpace);

  // 验证是否有足够空间
  const currentSize = await this.adapter.getStorageSize();
  const availableSpace = this.config.maxStorageSize - currentSize;

  if (availableSpace < requiredSpace) {
    // 空间仍然不足，抛出错误
    throw new Error(`Insufficient storage space. Required: ${requiredSpace}, Available: ${availableSpace}`);
  }
}
```

#### 数据恢复机制

```typescript
private async loadAccessRecords(): Promise<void> {
  try {
    const data = await this.storageAdapter.getItem(this.accessRecordsKey);
    if (data) {
      this.accessRecords = Utils.decompressAccessRecords(data);

      // 验证数据完整性
      this.validateAccessRecords();
    }
  } catch (error) {
    console.warn('[LRU] Failed to load access records, starting fresh:', error);
    this.accessRecords = {};

    // 尝试从备份恢复
    await this.tryRestoreFromBackup();
  }
}

private validateAccessRecords(): void {
  const now = Date.now();
  const maxAge = this.config.maxAccessAge;

  for (const [key, record] of Object.entries(this.accessRecords)) {
    // 清理无效记录
    if (!record ||
        typeof record.lastAccess !== 'number' ||
        typeof record.accessCount !== 'number' ||
        now - record.lastAccess > maxAge) {
      delete this.accessRecords[key];
    }
  }
}
```

### 浏览器兼容性处理

#### 特性检测

```typescript
static checkBrowserSupport(): {
  localStorage: boolean;
  indexedDB: boolean;
  proxy: boolean;
  defineProperty: boolean;
} {
  return {
    localStorage: (() => {
      try {
        const test = '__localStorage_test__';
        localStorage.setItem(test, 'test');
        localStorage.removeItem(test);
        return true;
      } catch {
        return false;
      }
    })(),

    indexedDB: typeof window !== 'undefined' && !!window.indexedDB,

    proxy: typeof Proxy !== 'undefined',

    defineProperty: (() => {
      try {
        const obj = {};
        Object.defineProperty(obj, 'test', { value: 1 });
        return obj.test === 1;
      } catch {
        return false;
      }
    })()
  };
}
```

#### 优雅降级

```typescript
constructor(adapter: IStorageAdapter, config: Partial<IStorageCleanerConfig> = {}) {
  const support = Utils.checkBrowserSupport();

  if (!support.proxy) {
    console.warn('[StorageCleaner] Proxy not supported, using polling mode');
    this.usePollingMode = true;
  }

  if (!support.defineProperty) {
    console.warn('[StorageCleaner] Object.defineProperty not supported, limited functionality');
    this.limitedMode = true;
  }

  // 根据支持情况调整功能
  this.initializeWithSupport(support);
}

private initializeWithSupport(support: BrowserSupport): void {
  if (this.usePollingMode) {
    // 使用轮询模式监控存储变化
    this.startPollingMode();
  }

  if (this.limitedMode) {
    // 禁用某些高级功能
    this.config.autoCleanup = false;
  }
}
```

## 🔍 监控与调试

### 统计信息收集

```typescript
interface IStorageStats {
  totalSize: number;        // 总大小
  itemCount: number;        // 项目数量
  maxSize: number;          // 最大大小
  usageRatio: number;       // 使用率
  lastCleanup?: number;     // 最后清理时间
  cleanupCount: number;     // 清理次数

  // 扩展统计
  averageItemSize: number;  // 平均项目大小
  largestItem: string;      // 最大项目键
  oldestItem: string;       // 最旧项目键
  accessHitRate: number;    // 访问命中率
}

private calculateExtendedStats(): Partial<IStorageStats> {
  const keys = this.getAllKeys();
  const sizes = keys.map(key => this.getItemSize(key));
  const records = Object.values(this.accessRecords);

  return {
    averageItemSize: sizes.reduce((a, b) => a + b, 0) / sizes.length || 0,
    largestItem: keys[sizes.indexOf(Math.max(...sizes))] || '',
    oldestItem: this.findOldestAccessedKey(),
    accessHitRate: this.calculateAccessHitRate()
  };
}
```

### 调试日志系统

```typescript
class Logger {
  private config: { debug: boolean; level: LogLevel };

  constructor(config: { debug: boolean; level?: LogLevel }) {
    this.config = { level: LogLevel.INFO, ...config };
  }

  debug(message: string, data?: any): void {
    if (this.config.debug && this.config.level <= LogLevel.DEBUG) {
      console.log(`[StorageCleaner:DEBUG] ${message}`, data || '');
    }
  }

  info(message: string, data?: any): void {
    if (this.config.level <= LogLevel.INFO) {
      console.log(`[StorageCleaner:INFO] ${message}`, data || '');
    }
  }

  warn(message: string, data?: any): void {
    if (this.config.level <= LogLevel.WARN) {
      console.warn(`[StorageCleaner:WARN] ${message}`, data || '');
    }
  }

  error(message: string, error?: Error): void {
    console.error(`[StorageCleaner:ERROR] ${message}`, error || '');
  }
}
```

## 🧪 测试策略

### 单元测试

```typescript
describe('LRUStrategy', () => {
  let strategy: LRUStrategy;
  let mockAdapter: jest.Mocked<IStorageAdapter>;

  beforeEach(() => {
    mockAdapter = createMockAdapter();
    strategy = new LRUStrategy(mockAdapter, {
      maxAccessAge: 24 * 60 * 60 * 1000,
      excludeKeys: ['protected_key']
    });
  });

  describe('recordAccess', () => {
    it('should record new access', () => {
      strategy.recordAccess('test_key');

      const stats = strategy.getAccessStats();
      expect(stats.totalRecords).toBe(1);
    });

    it('should update existing access', () => {
      strategy.recordAccess('test_key');
      strategy.recordAccess('test_key');

      const record = strategy.getAccessRecord('test_key');
      expect(record.accessCount).toBe(2);
    });
  });

  describe('getKeysToCleanup', () => {
    it('should return LRU sorted keys', () => {
      // 设置测试数据
      strategy.recordAccess('old_key');
      jest.advanceTimersByTime(1000);
      strategy.recordAccess('new_key');

      const keys = strategy.getKeysToCleanup(['old_key', 'new_key'], 1000, 500);
      expect(keys[0]).toBe('old_key');
    });
  });
});
```

### 集成测试

```typescript
describe('StorageCleaner Integration', () => {
  let cleaner: StorageCleaner;

  beforeEach(() => {
    // 清理localStorage
    localStorage.clear();

    cleaner = createLocalStorageCleaner({
      maxStorageSize: 1024, // 1KB for testing
      cleanupThreshold: 0.8,
      debug: true
    });
  });

  afterEach(() => {
    cleaner.destroy();
  });

  it('should automatically cleanup when threshold reached', async () => {
    cleaner.installProxy();

    // 填充数据直到接近阈值
    for (let i = 0; i < 10; i++) {
      localStorage.setItem(`test_${i}`, 'x'.repeat(100));
    }

    const statsBefore = cleaner.getStats();
    expect(statsBefore.usageRatio).toBeGreaterThan(0.8);

    // 触发清理
    localStorage.setItem('trigger', 'x'.repeat(100));

    const statsAfter = cleaner.getStats();
    expect(statsAfter.usageRatio).toBeLessThan(statsBefore.usageRatio);
  });
});
```

## 📈 性能基准

### 基准测试设计

```typescript
class PerformanceBenchmark {
  async benchmarkProxyOverhead(): Promise<BenchmarkResult> {
    const iterations = 10000;

    // 测试原生localStorage
    const nativeStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      localStorage.setItem(`native_${i}`, `value_${i}`);
      localStorage.getItem(`native_${i}`);
    }
    const nativeTime = performance.now() - nativeStart;

    // 测试代理localStorage
    const cleaner = createLocalStorageCleaner();
    cleaner.installProxy();

    const proxyStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      localStorage.setItem(`proxy_${i}`, `value_${i}`);
      localStorage.getItem(`proxy_${i}`);
    }
    const proxyTime = performance.now() - proxyStart;

    return {
      nativeTime,
      proxyTime,
      overhead: ((proxyTime - nativeTime) / nativeTime) * 100
    };
  }
}
```

## 🚀 部署与发布

### 构建配置

```typescript
// rollup.config.js
export default {
  input: 'src/index.ts',
  output: [
    {
      file: 'dist/index.js',
      format: 'cjs'
    },
    {
      file: 'dist/index.esm.js',
      format: 'esm'
    },
    {
      file: 'dist/index.umd.js',
      format: 'umd',
      name: 'StorageCleaner'
    }
  ],
  plugins: [
    typescript(),
    terser(),
    bundleSize()
  ]
};
```

### 版本管理

```json
{
  "name": "browser-storage-lru-cleaner",
  "version": "1.0.0",
  "main": "dist/index.js",
  "module": "dist/index.esm.js",
  "types": "dist/index.d.ts",
  "files": [
    "dist/**/*",
    "README.md",
    "LICENSE"
  ]
}
```

## 📋 总结

本SDK通过精心设计的架构和算法，实现了：

1. **透明代理**: 业务代码无需修改即可享受自动清理功能
2. **智能清理**: LRU算法确保清理最不重要的数据
3. **高性能**: 多种优化手段确保最小性能影响
4. **高可靠**: 完善的错误处理和容错机制
5. **易扩展**: 模块化设计支持自定义策略和适配器

通过这些设计，SDK能够有效解决浏览器存储容量限制问题，提升用户体验。


# 基于时间的自动清理功能

## 🎯 功能概述

新增的基于时间的自动清理功能可以自动清理最近N天（可配置）没有使用的key，在新插入数据时自动触发清理，有效防止存储空间被长期不用的数据占用。

## ✨ 核心特性

### 1. 自动时间清理
- **触发时机**：在插入新数据时自动检查并清理过期数据
- **清理策略**：清理超过指定天数未访问的key
- **智能过滤**：自动跳过系统键和排除列表中的键

### 2. 灵活配置
```typescript
const cleaner = createLocalStorageCleaner({
  enableTimeBasedCleanup: true,    // 启用基于时间的清理
  timeCleanupThreshold: 7,         // 7天未访问自动清理
  cleanupOnInsert: true,           // 插入时触发清理
  excludeKeys: ['important_data']  // 排除重要数据
});
```

### 3. 多种清理模式
- **自动清理**：插入新数据时自动触发
- **手动清理**：通过API手动触发
- **定时清理**：可结合定时器实现定期清理

## 🚀 使用方法

### 基础配置

```typescript
import { createLocalStorageCleaner } from 'browser-storage-lru-cleaner';

const cleaner = createLocalStorageCleaner({
  // 基础配置
  maxStorageSize: 5 * 1024 * 1024,
  cleanupThreshold: 0.8,

  // 时间清理配置
  enableTimeBasedCleanup: true,    // 启用时间清理
  timeCleanupThreshold: 7,         // 7天阈值
  cleanupOnInsert: true,           // 插入时清理

  // 保护重要数据
  excludeKeys: [
    'user_session',
    'app_config',
    'critical_data'
  ]
});

// 安装代理开始监控
cleaner.installProxy();
```

# 存量数据代理与访问记录恢复机制

## 🎯 问题背景

在实际使用中，我们发现了两个重要的边界情况需要处理：

1. **存量数据代理问题**：SDK初始化时，已存在的数据没有访问记录，无法被LRU算法正确管理
2. **访问记录丢失问题**：`__lru_access_records__` 可能因为各种原因丢失或损坏，导致清理功能失效

## 🚀 解决方案

### 1. 存量数据自动代理

#### 问题描述
当SDK首次安装到已有数据的应用中时，存在以下问题：
- 已存在的localStorage数据没有访问记录
- 这些数据在LRU算法中"不可见"
- 可能导致新数据被优先清理，而旧数据被保留

#### 解决方案
在SDK初始化时自动为存量数据创建访问记录：

```typescript
/**
 * 初始化存量数据的访问记录
 */
private initializeExistingData(): void {
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

      // 为存量数据设置较早的初始访问时间
      // 这样它们在LRU算法中会有较低的优先级
      const initialAccessTime = now - (24 * 60 * 60 * 1000); // 1天前

      this.accessRecords[key] = {
        lastAccess: initialAccessTime,
        accessCount: 1,
        size: size
      };

      initializedCount++;
    }
  }

  if (initializedCount > 0) {
    this.saveAccessRecordsDebounced();
  }
}
```


# 存储优化方案

## 🎯 问题描述

原有的 `__lru_access_records__` 存储方案存在以下问题：

1. **空间占用大**：随着存储项增加，访问记录也会无限增长
2. **数据冗余**：JSON格式存储包含大量重复的键名和结构
3. **缺乏调试**：无法直观查看压缩效果和存储统计
4. **无容量控制**：没有限制访问记录的最大数量

## 🚀 优化方案

### 1. 高级压缩算法

#### 原始格式 vs 优化格式

**原始格式（低效）：**
```json
{
  "user_data_123": {
    "lastAccess": 1703123456789,
    "accessCount": 5,
    "size": 1024
  },
  "cache_item_456": {
    "lastAccess": 1703123456790,
    "accessCount": 3,
    "size": 2048
  }
}
```

**优化格式（高效）：**
```json
{
  "v": 2,
  "t": 1703123456790,
  "k": {
    "a": "user_data_123",
    "b": "cache_item_456"
  },
  "d": {
    "a": [1, 5, 1024],
    "b": [0, 3, 2048]
  }
}
```

#### 压缩策略

1. **版本控制** (`v`): 支持格式升级和向后兼容
2. **时间基准** (`t`): 使用相对时间戳，减少数字大小
3. **键名映射** (`k`): 将长键名映射为短标识符
4. **数据压缩** (`d`): 使用数组格式存储数值

### 2. 智能容量控制

```typescript
// 限制最大记录数，防止无限增长
const maxEntries = 500;

// 按重要性排序，只保留最重要的记录
const sortedEntries = Object.entries(records)
  .sort(([, a], [, b]) => {
    const weightA = a.lastAccess + (a.accessCount * 60000);
    const weightB = b.lastAccess + (b.accessCount * 60000);
    return weightB - weightA;
  })
  .slice(0, maxEntries);
```