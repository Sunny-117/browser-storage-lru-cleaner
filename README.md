# Browser Storage LRU Cleaner

🧹 一个基于LRU算法的浏览器存储自动清理SDK，支持localStorage和IndexedDB，通过代理模式实现业务无感知的自动清理。

## 🚀 特性

- **🔄 LRU算法**: 内置最近最少使用算法，智能清理不常用数据
- **🔌 可扩展**: 支持自定义清理策略，算法与SDK解耦
- **📦 多存储支持**: 同时支持localStorage和IndexedDB
- **🎭 代理模式**: 通过Proxy和Object.defineProperty实现透明代理
- **⚡ 业务无感知**: 自动拦截存储操作，无需修改业务代码
- **📊 智能清理**: 根据配置的容量阈值自动触发清理
- **🔧 灵活配置**: 支持清理阈值、清理比例、排除键等配置
- **📈 统计监控**: 提供详细的存储使用统计和健康检查

## 📋 目录

- [安装](#安装)
- [快速开始](#快速开始)
- [API文档](#api文档)
- [配置选项](#配置选项)
- [技术设计](#技术设计)
- [使用示例](#使用示例)
- [最佳实践](#最佳实践)
- [常见问题](#常见问题)

## 📦 安装

```bash
npm install browser-storage-lru-cleaner
```

或者使用yarn：

```bash
yarn add browser-storage-lru-cleaner
```

## 🚀 快速开始

### localStorage 清理器

```typescript
import { createLocalStorageCleaner } from 'browser-storage-lru-cleaner';

// 创建清理器实例
const cleaner = createLocalStorageCleaner({
  maxStorageSize: 5 * 1024 * 1024, // 5MB
  cleanupThreshold: 0.8, // 80%时开始清理
  cleanupRatio: 0.3, // 清理30%的数据
  autoCleanup: true, // 启用自动清理
  debug: true // 开启调试模式
});

// 安装代理，开始监控
cleaner.installProxy();

// 现在正常使用localStorage，清理器会自动工作
localStorage.setItem('user_data', JSON.stringify({ name: 'John' }));
localStorage.getItem('user_data'); // 会被记录访问
```

### IndexedDB 清理器

```typescript
import { createIndexedDBCleaner } from 'browser-storage-lru-cleaner';

// 创建IndexedDB清理器
const cleaner = createIndexedDBCleaner('MyApp', 'keyValueStore', {
  maxStorageSize: 10 * 1024 * 1024, // 10MB
  cleanupThreshold: 0.9,
  autoCleanup: true
});

// IndexedDB操作会被自动监控
await cleaner.getAdapter().setItem('large_data', jsonData);
```

### 自定义策略

```typescript
import { StorageCleaner, LocalStorageAdapter } from 'browser-storage-lru-cleaner';

// 实现自定义清理策略
class CustomStrategy implements ICleanupStrategy {
  getName() {
    return 'Custom';
  }

  recordAccess(key: string) {
    // 自定义访问记录逻辑
  }

  getKeysToCleanup(allKeys: string[], currentSize: number, maxSize: number) {
    // 自定义清理逻辑
    return keysToCleanup;
  }

  cleanup(keys: string[]) {
    // 清理后的处理
  }
}

// 使用自定义策略
const cleaner = new StorageCleaner(
  new LocalStorageAdapter(),
  {
    strategy: new CustomStrategy(),
    maxStorageSize: 5 * 1024 * 1024
  }
);
```

## 📚 API文档

### StorageCleaner

主要的SDK类，提供存储清理功能。

#### 构造函数

```typescript
constructor(adapter: IStorageAdapter, config?: Partial<IStorageCleanerConfig>)
```

#### 主要方法

| 方法 | 描述 | 返回值 |
|------|------|--------|
| `installProxy()` | 安装代理，开始监控存储操作 | `void` |
| `uninstallProxy()` | 卸载代理，停止监控 | `void` |
| `manualCleanup()` | 手动触发清理 | `Promise<void>` |
| `getStats()` | 获取存储统计信息 | `IStorageStats` |
| `checkHealth()` | 检查存储健康状态 | `Promise<HealthResult>` |
| `updateConfig(config)` | 更新配置 | `void` |
| `destroy()` | 销毁实例，清理资源 | `void` |

### 便捷函数

```typescript
// 创建localStorage清理器
createLocalStorageCleaner(config?: Partial<IStorageCleanerConfig>): StorageCleaner

// 创建IndexedDB清理器
createIndexedDBCleaner(
  dbName?: string,
  storeName?: string,
  config?: Partial<IStorageCleanerConfig>
): StorageCleaner
```

## ⚙️ 配置选项

```typescript
interface IStorageCleanerConfig {
  // 最大存储大小（字节）
  maxStorageSize: number;

  // 清理阈值（0-1之间，表示达到最大容量的百分比时开始清理）
  cleanupThreshold: number;

  // 清理比例（0-1之间，表示每次清理释放的空间比例）
  cleanupRatio: number;

  // 访问记录的最大保存时间（毫秒）
  maxAccessAge: number;

  // 是否启用自动清理
  autoCleanup: boolean;

  // 清理策略
  strategy?: ICleanupStrategy;

  // 调试模式
  debug?: boolean;

  // 排除的键（不会被清理）
  excludeKeys?: string[];
}
```

### 默认配置

```typescript
const DEFAULT_CONFIG = {
  maxStorageSize: 5 * 1024 * 1024, // 5MB
  cleanupThreshold: 0.8, // 80%
  cleanupRatio: 0.3, // 30%
  maxAccessAge: 7 * 24 * 60 * 60 * 1000, // 7天
  autoCleanup: true,
  debug: false,
  excludeKeys: []
};
```

## 🏗️ 技术设计

### 架构概览

```
┌─────────────────────────────────────────────────────────────┐
│                    Browser Storage LRU Cleaner             │
├─────────────────────────────────────────────────────────────┤
│  StorageCleaner (主控制器)                                   │
│  ├── 代理管理 (Proxy Management)                            │
│  ├── 配置管理 (Config Management)                           │
│  ├── 统计监控 (Stats Monitoring)                            │
│  └── 健康检查 (Health Check)                                │
├─────────────────────────────────────────────────────────────┤
│  清理策略层 (Cleanup Strategy Layer)                        │
│  ├── LRUStrategy (默认LRU算法)                              │
│  ├── ICleanupStrategy (策略接口)                            │
│  └── 自定义策略 (Custom Strategies)                         │
├─────────────────────────────────────────────────────────────┤
│  存储适配器层 (Storage Adapter Layer)                       │
│  ├── LocalStorageAdapter                                   │
│  ├── IndexedDBAdapter                                      │
│  └── IStorageAdapter (适配器接口)                           │
├─────────────────────────────────────────────────────────────┤
│  工具层 (Utility Layer)                                     │
│  ├── 数据压缩 (Data Compression)                            │
│  ├── 大小计算 (Size Calculation)                            │
│  ├── 防抖节流 (Debounce/Throttle)                          │
│  └── 浏览器兼容性检查 (Browser Compatibility)               │
└─────────────────────────────────────────────────────────────┘
```

### 核心设计原则

#### 1. 代理模式 (Proxy Pattern)

通过JavaScript Proxy和Object.defineProperty实现透明代理：

```typescript
// localStorage代理实现
const proxiedStorage = new Proxy(originalLocalStorage, {
  get(target, prop, receiver) {
    if (prop === 'getItem') {
      return function(key: string) {
        const result = target.getItem(key);
        if (result !== null) {
          // 记录访问，更新LRU
          self.strategy.recordAccess(key);
        }
        return result;
      };
    }

    if (prop === 'setItem') {
      return function(key: string, value: string) {
        // 检查是否需要清理
        if (self.config.autoCleanup) {
          self.checkAndCleanup(requiredSpace);
        }

        target.setItem(key, value);
        self.strategy.recordAccess(key);
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
```

#### 2. LRU算法实现

基于访问时间和频次的LRU算法：

```typescript
interface IAccessRecord {
  lastAccess: number;    // 最后访问时间
  accessCount: number;   // 访问次数
  size: number;          // 数据大小
}

// LRU排序逻辑
sortKeysByLRU(keys: string[]): string[] {
  return keys.sort((a, b) => {
    const recordA = this.accessRecords[a];
    const recordB = this.accessRecords[b];

    // 优先级：无记录 > 访问时间早 > 访问次数少
    if (!recordA && !recordB) return 0;
    if (!recordA) return -1;
    if (!recordB) return 1;

    const timeDiff = recordA.lastAccess - recordB.lastAccess;
    if (timeDiff !== 0) return timeDiff;

    return recordA.accessCount - recordB.accessCount;
  });
}
```

#### 3. 数据压缩存储

访问记录使用压缩格式存储，减少元数据占用：

```typescript
// 压缩前：
{
  "user_data": {
    "lastAccess": 1640995200000,
    "accessCount": 5,
    "size": 1024
  }
}

// 压缩后：
{
  "user_data": [1640995200000, 5, 1024]
}
```

#### 4. 智能清理策略

多层次的清理触发机制：

1. **容量阈值触发**: 达到设定容量百分比时自动清理
2. **写入前检查**: 新数据写入前预检查空间
3. **时间过期清理**: 定期清理过期的访问记录
4. **手动触发**: 提供手动清理接口

```typescript
checkAndCleanup(requiredSpace: number = 0): Promise<void> {
  const currentSize = await this.adapter.getStorageSize();
  const threshold = this.config.maxStorageSize * this.config.cleanupThreshold;

  if (currentSize + requiredSpace > threshold) {
    await this.cleanup(requiredSpace);
  }
}
```

### 性能优化

#### 1. 防抖处理

访问记录的保存使用防抖，避免频繁写入：

```typescript
private saveAccessRecordsDebounced = Utils.debounce(() => {
  this.saveAccessRecords();
}, 1000);
```

#### 2. 异步操作

所有可能阻塞的操作都设计为异步：

```typescript
async updateKeySizes(keys: string[]): Promise<void> {
  for (const key of keys) {
    if (this.accessRecords[key]) {
      const size = await this.storageAdapter.getItemSize(key);
      this.accessRecords[key].size = size;
    }
  }
}
```

#### 3. 最小清理原则

只清理必要的数据，保证新数据能够成功插入：

```typescript
const spaceToFree = Math.max(
  currentSize - (maxSize * (1 - cleanupRatio)), // 清理到目标容量
  requiredSpace // 或者释放足够的空间
);
```

### 兼容性设计

#### 1. 浏览器支持检查

```typescript
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
```

#### 2. 优雅降级

当代理不可用时，提供手动清理模式：

```typescript
if (!Utils.checkBrowserSupport().proxy) {
  console.warn('Proxy not supported, falling back to manual mode');
  // 提供手动清理接口
}
```

### 错误处理

#### 1. 存储异常处理

```typescript
try {
  this.originalLocalStorage.setItem(key, value);
} catch (error) {
  if (error.name === 'QuotaExceededError') {
    // 存储空间不足，触发清理
    await this.cleanup(requiredSpace);
    // 重试
    this.originalLocalStorage.setItem(key, value);
  } else {
    throw error;
  }
}
```

#### 2. 数据恢复

访问记录损坏时的恢复机制：

```typescript
try {
  this.accessRecords = Utils.decompressAccessRecords(data);
} catch (error) {
  console.warn('Failed to load access records, starting fresh');
  this.accessRecords = {};
}
```

## 💡 使用示例

### 基础使用

```typescript
import { createLocalStorageCleaner } from 'browser-storage-lru-cleaner';

// 1. 创建清理器
const cleaner = createLocalStorageCleaner({
  maxStorageSize: 2 * 1024 * 1024, // 2MB
  cleanupThreshold: 0.8,
  autoCleanup: true,
  debug: true
});

// 2. 安装代理
cleaner.installProxy();

// 3. 正常使用localStorage，清理器会自动工作
localStorage.setItem('user_profile', JSON.stringify({
  id: 1,
  name: 'John Doe',
  preferences: { theme: 'dark' }
}));

// 4. 监控存储状态
setInterval(() => {
  const stats = cleaner.getStats();
  console.log(`存储使用率: ${Math.round(stats.usageRatio * 100)}%`);
}, 5000);
```

### 高级配置

```typescript
import { StorageCleaner, LocalStorageAdapter, LRUStrategy } from 'browser-storage-lru-cleaner';

// 自定义LRU策略配置
const customStrategy = new LRUStrategy(adapter, {
  maxAccessAge: 3 * 24 * 60 * 60 * 1000, // 3天过期
  excludeKeys: ['app_config', 'user_token'], // 排除关键数据
  debug: true
});

// 创建清理器
const cleaner = new StorageCleaner(new LocalStorageAdapter(), {
  maxStorageSize: 10 * 1024 * 1024, // 10MB
  cleanupThreshold: 0.85, // 85%时清理
  cleanupRatio: 0.4, // 清理40%
  strategy: customStrategy,
  excludeKeys: ['critical_data', 'session_info']
});

cleaner.installProxy();
```

### React集成示例

```typescript
import React, { useEffect, useState } from 'react';
import { createLocalStorageCleaner } from 'browser-storage-lru-cleaner';

const StorageMonitor: React.FC = () => {
  const [cleaner] = useState(() => createLocalStorageCleaner({
    maxStorageSize: 5 * 1024 * 1024,
    debug: process.env.NODE_ENV === 'development'
  }));

  const [stats, setStats] = useState(cleaner.getStats());

  useEffect(() => {
    // 安装代理
    cleaner.installProxy();

    // 定期更新统计
    const interval = setInterval(() => {
      setStats(cleaner.getStats());
    }, 1000);

    return () => {
      clearInterval(interval);
      cleaner.destroy();
    };
  }, [cleaner]);

  const handleManualCleanup = async () => {
    await cleaner.manualCleanup();
    setStats(cleaner.getStats());
  };

  return (
    <div>
      <h3>存储监控</h3>
      <p>使用率: {Math.round(stats.usageRatio * 100)}%</p>
      <p>项目数: {stats.itemCount}</p>
      <p>清理次数: {stats.cleanupCount}</p>
      <button onClick={handleManualCleanup}>手动清理</button>
    </div>
  );
};
```

### Vue集成示例

```typescript
import { defineComponent, ref, onMounted, onUnmounted } from 'vue';
import { createLocalStorageCleaner } from 'browser-storage-lru-cleaner';

export default defineComponent({
  name: 'StorageManager',
  setup() {
    const cleaner = createLocalStorageCleaner({
      maxStorageSize: 3 * 1024 * 1024,
      cleanupThreshold: 0.9
    });

    const stats = ref(cleaner.getStats());
    let interval: NodeJS.Timeout;

    onMounted(() => {
      cleaner.installProxy();

      interval = setInterval(() => {
        stats.value = cleaner.getStats();
      }, 2000);
    });

    onUnmounted(() => {
      clearInterval(interval);
      cleaner.destroy();
    });

    const checkHealth = async () => {
      const health = await cleaner.checkHealth();
      console.log('健康检查:', health);
    };

    return {
      stats,
      checkHealth,
      manualCleanup: () => cleaner.manualCleanup()
    };
  }
});
```

### IndexedDB使用示例

```typescript
import { createIndexedDBCleaner } from 'browser-storage-lru-cleaner';

// 创建IndexedDB清理器
const cleaner = createIndexedDBCleaner('MyApp', 'cache', {
  maxStorageSize: 50 * 1024 * 1024, // 50MB
  cleanupThreshold: 0.8
});

// 获取适配器进行操作
const adapter = cleaner.getAdapter();

// 存储大量数据
async function cacheApiResponse(url: string, data: any) {
  const key = `api_cache_${btoa(url)}`;
  const value = JSON.stringify({
    data,
    timestamp: Date.now(),
    url
  });

  await adapter.setItem(key, value);
}

// 读取缓存
async function getCachedResponse(url: string) {
  const key = `api_cache_${btoa(url)}`;
  const cached = await adapter.getItem(key);

  if (cached) {
    const parsed = JSON.parse(cached);
    // 检查是否过期（1小时）
    if (Date.now() - parsed.timestamp < 60 * 60 * 1000) {
      return parsed.data;
    }
  }

  return null;
}
```

## 🎯 最佳实践

### 1. 配置建议

```typescript
// 移动端配置（存储空间有限）
const mobileConfig = {
  maxStorageSize: 2 * 1024 * 1024, // 2MB
  cleanupThreshold: 0.7, // 70%时清理
  cleanupRatio: 0.5, // 清理50%
  maxAccessAge: 3 * 24 * 60 * 60 * 1000 // 3天
};

// 桌面端配置（存储空间充足）
const desktopConfig = {
  maxStorageSize: 20 * 1024 * 1024, // 20MB
  cleanupThreshold: 0.9, // 90%时清理
  cleanupRatio: 0.3, // 清理30%
  maxAccessAge: 14 * 24 * 60 * 60 * 1000 // 14天
};

// 根据设备类型选择配置
const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
const config = isMobile ? mobileConfig : desktopConfig;
```

### 2. 关键数据保护

```typescript
const cleaner = createLocalStorageCleaner({
  // 排除关键业务数据
  excludeKeys: [
    'user_token',
    'app_config',
    'user_preferences',
    'session_data'
  ],
  maxStorageSize: 5 * 1024 * 1024
});

// 或者使用前缀保护
const protectedPrefixes = ['auth_', 'config_', 'critical_'];
const isProtectedKey = (key: string) =>
  protectedPrefixes.some(prefix => key.startsWith(prefix));
```

### 3. 错误处理

```typescript
try {
  cleaner.installProxy();
} catch (error) {
  console.error('Failed to install storage cleaner:', error);

  // 降级处理
  if (error.message.includes('Proxy')) {
    console.warn('Proxy not supported, using manual cleanup mode');
    // 定期手动清理
    setInterval(() => {
      cleaner.manualCleanup();
    }, 5 * 60 * 1000); // 5分钟
  }
}
```

### 4. 性能监控

```typescript
// 监控清理效果
cleaner.getStrategy().getAccessStats = function() {
  const records = Object.values(this.accessRecords);
  return {
    totalRecords: records.length,
    averageAccessCount: records.reduce((sum, r) => sum + r.accessCount, 0) / records.length,
    oldestAccess: Math.min(...records.map(r => r.lastAccess)),
    newestAccess: Math.max(...records.map(r => r.lastAccess))
  };
};

// 定期报告
setInterval(() => {
  const stats = cleaner.getStats();
  const accessStats = cleaner.getStrategy().getAccessStats();

  console.log('Storage Stats:', {
    usageRatio: Math.round(stats.usageRatio * 100) + '%',
    itemCount: stats.itemCount,
    cleanupCount: stats.cleanupCount,
    avgAccess: Math.round(accessStats.averageAccessCount)
  });
}, 30000);
```

### 5. 数据迁移

```typescript
// 版本升级时的数据迁移
function migrateStorageData() {
  const version = localStorage.getItem('storage_version');

  if (!version || version < '2.0') {
    // 清理旧版本的元数据
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('__old_lru_')) {
        localStorage.removeItem(key);
      }
    });

    localStorage.setItem('storage_version', '2.0');
  }
}

// 在初始化前执行迁移
migrateStorageData();
const cleaner = createLocalStorageCleaner(config);
```

## ❓ 常见问题

### Q: 代理会影响性能吗？

A: 代理的性能影响很小。我们使用了以下优化：
- 防抖处理减少频繁的元数据写入
- 异步操作避免阻塞主线程
- 压缩存储减少元数据占用
- 智能清理避免不必要的操作

### Q: 如何处理存储配额超限？

A: SDK提供多层保护：
```typescript
try {
  localStorage.setItem(key, value);
} catch (error) {
  if (error.name === 'QuotaExceededError') {
    // 自动触发清理
    await cleaner.manualCleanup();
    // 重试操作
    localStorage.setItem(key, value);
  }
}
```

### Q: 可以在Web Worker中使用吗？

A: 目前不支持Web Worker，因为：
- Web Worker中没有DOM和window对象
- 无法访问localStorage（可以使用IndexedDB）
- 代理模式依赖全局对象替换

### Q: 如何自定义清理策略？

A: 实现ICleanupStrategy接口：
```typescript
class TimeBasedStrategy implements ICleanupStrategy {
  getName() { return 'TimeBased'; }

  recordAccess(key: string) {
    // 记录访问时间
  }

  getKeysToCleanup(allKeys: string[], currentSize: number, maxSize: number) {
    // 返回超过时间阈值的键
    return expiredKeys;
  }

  cleanup(keys: string[]) {
    // 清理后处理
  }
}
```

### Q: 支持哪些浏览器？

A: 支持所有现代浏览器：
- Chrome 49+
- Firefox 18+
- Safari 10+
- Edge 12+
- 移动端浏览器

### Q: 数据会丢失吗？

A: 不会意外丢失重要数据：
- 通过excludeKeys保护关键数据
- LRU算法优先清理不常用数据
- 提供手动控制清理时机
- 支持清理前的确认回调

### Q: 如何调试清理过程？

A: 启用调试模式：
```typescript
const cleaner = createLocalStorageCleaner({
  debug: true // 启用详细日志
});

// 监听清理事件
cleaner.on('cleanup', (event) => {
  console.log('清理事件:', event);
});
```

## 🔧 开发

### 构建项目

```bash
# 安装依赖
npm install

# 构建
npm run build

# 开发模式
npm run dev

# 运行测试
npm test

# 启动演示
npm run demo
```

### 项目结构

```
src/
├── interfaces/          # TypeScript接口定义
├── strategies/          # 清理策略实现
│   └── lru-strategy.ts
├── adapters/           # 存储适配器
│   ├── localstorage-adapter.ts
│   └── indexeddb-adapter.ts
├── utils/              # 工具函数
├── storage-cleaner.ts  # 主要SDK类
└── index.ts           # 入口文件

demo/                  # 演示页面
├── index.html
└── demo.js

tests/                 # 测试文件
└── *.test.ts
```

## 📄 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件

## 🤝 贡献

欢迎提交Issue和Pull Request！

1. Fork 项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开Pull Request

## 📞 支持

- 📧 Email: support@example.com
- 🐛 Issues: [GitHub Issues](https://github.com/your-repo/issues)
- 📖 文档: [在线文档](https://your-docs-site.com)

---

⭐ 如果这个项目对你有帮助，请给个Star！