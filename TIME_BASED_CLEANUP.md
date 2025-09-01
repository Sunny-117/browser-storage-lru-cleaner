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