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