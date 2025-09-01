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