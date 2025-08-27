import React, { useState, useEffect, useCallback } from 'react';
import { createLocalStorageCleaner, IStorageStats } from 'browser-storage-lru-cleaner';
import './App.css';

// 创建清理器实例 - 使用较小的容量便于测试
const cleaner = createLocalStorageCleaner({
  maxStorageSize: 50 * 1024, // 50KB - 小容量便于测试
  cleanupThreshold: 0.7, // 70%时开始清理
  cleanupRatio: 0.4, // 清理40%的数据
  autoCleanup: true, // 启用自动清理
  debug: true, // 开启调试模式
  excludeKeys: ['important_config', 'user_session'] // 保护重要数据
});

interface StorageItem {
  key: string;
  value: string;
  size: number;
  lastAccess?: number;
  accessCount?: number;
}

export default function App() {
  const [stats, setStats] = useState<IStorageStats>(cleaner.getStats());
  const [storageItems, setStorageItems] = useState<StorageItem[]>([]);
  const [isProxyInstalled, setIsProxyInstalled] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [dataSize, setDataSize] = useState(1); // KB

  // 添加日志
  const addLog = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev.slice(-20), `[${timestamp}] ${message}`]);
  }, []);

  // 更新统计信息和存储项列表
  const updateData = useCallback(() => {
    const newStats = cleaner.getStats();
    setStats(newStats);

    // 获取所有存储项
    const items: StorageItem[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        const value = localStorage.getItem(key) || '';
        const size = new Blob([key + value]).size;
        items.push({
          key,
          value: value.length > 50 ? value.substring(0, 50) + '...' : value,
          size
        });
      }
    }
    setStorageItems(items);
  }, []);

  // 安装代理
  const installProxy = useCallback(() => {
    try {
      cleaner.installProxy();
      setIsProxyInstalled(true);
      addLog('✅ 代理已安装，开始监控存储操作');
    } catch (error) {
      addLog(`❌ 代理安装失败: ${error}`);
    }
  }, [addLog]);

  // 卸载代理
  const uninstallProxy = useCallback(() => {
    try {
      cleaner.uninstallProxy();
      setIsProxyInstalled(false);
      addLog('❌ 代理已卸载');
    } catch (error) {
      addLog(`❌ 代理卸载失败: ${error}`);
    }
  }, [addLog]);

  // 生成测试数据
  const generateTestData = useCallback((count: number = 10) => {
    for (let i = 0; i < count; i++) {
      const key = `test_data_${Date.now()}_${i}`;
      const size = Math.floor(Math.random() * 2000) + 500; // 500-2500字节
      const value = 'x'.repeat(size);

      localStorage.setItem(key, value);
      addLog(`📝 生成测试数据: ${key} (${Math.round(size / 1024 * 100) / 100}KB)`);
    }
    updateData();
  }, [addLog, updateData]);

  // 添加自定义数据
  const addCustomData = useCallback(() => {
    if (!newKey.trim()) {
      addLog('❌ 请输入键名');
      return;
    }

    let value = newValue;
    if (dataSize > 1) {
      // 生成指定大小的数据
      const targetSize = dataSize * 1024; // 转换为字节
      const baseSize = newKey.length + newValue.length;
      const paddingSize = Math.max(0, targetSize - baseSize);
      value = newValue + 'x'.repeat(paddingSize);
    }

    localStorage.setItem(newKey, value);
    addLog(`📝 添加数据: ${newKey} (${Math.round(new Blob([newKey + value]).size / 1024 * 100) / 100}KB)`);

    setNewKey('');
    setNewValue('');
    updateData();
  }, [newKey, newValue, dataSize, addLog, updateData]);

  // 手动清理
  const manualCleanup = useCallback(async () => {
    try {
      await cleaner.manualCleanup();
      addLog('🧹 手动清理完成');
      updateData();
    } catch (error) {
      addLog(`❌ 清理失败: ${error}`);
    }
  }, [addLog, updateData]);

  // 模拟访问数据
  const simulateAccess = useCallback(() => {
    const keys = storageItems.map(item => item.key).filter(key => !key.startsWith('__'));
    if (keys.length === 0) {
      addLog('❌ 没有数据可以访问');
      return;
    }

    // 随机访问一些数据
    const accessCount = Math.min(5, keys.length);
    for (let i = 0; i < accessCount; i++) {
      const randomKey = keys[Math.floor(Math.random() * keys.length)];
      localStorage.getItem(randomKey);
      addLog(`👁️ 访问数据: ${randomKey}`);
    }
    updateData();
  }, [storageItems, addLog, updateData]);

  // 删除指定项
  const removeItem = useCallback((key: string) => {
    localStorage.removeItem(key);
    addLog(`🗑️ 删除数据: ${key}`);
    updateData();
  }, [addLog, updateData]);

  // 清空所有数据
  const clearAll = useCallback(() => {
    if (window.confirm('确定要清空所有数据吗？')) {
      localStorage.clear();
      addLog('🗑️ 已清空所有数据');
      updateData();
    }
  }, [addLog, updateData]);

  // 初始化和定时更新
  useEffect(() => {
    updateData();
    const interval = setInterval(updateData, 2000);
    return () => clearInterval(interval);
  }, [updateData]);

  // 格式化字节大小
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>🧹 Browser Storage LRU Cleaner - 测试平台</h1>
        <p>这是一个用于测试存储清理功能的交互式平台</p>
      </header>

      <div className="main-content">
        {/* 控制面板 */}
        <div className="control-panel">
          <div className="panel-section">
            <h3>🎛️ 控制面板</h3>

            {/* 代理控制 */}
            <div className="control-group">
              <h4>代理控制</h4>
              <div className="button-group">
                <button
                  onClick={installProxy}
                  disabled={isProxyInstalled}
                  className={isProxyInstalled ? 'success' : 'primary'}
                >
                  {isProxyInstalled ? '✅ 代理已安装' : '安装代理'}
                </button>
                <button
                  onClick={uninstallProxy}
                  disabled={!isProxyInstalled}
                  className="secondary"
                >
                  卸载代理
                </button>
              </div>
            </div>

            {/* 数据操作 */}
            <div className="control-group">
              <h4>数据操作</h4>
              <div className="button-group">
                <button onClick={() => generateTestData(5)} className="primary">
                  生成5条测试数据
                </button>
                <button onClick={() => generateTestData(10)} className="primary">
                  生成10条测试数据
                </button>
                <button onClick={simulateAccess} className="secondary">
                  模拟访问数据
                </button>
              </div>
            </div>

            {/* 清理操作 */}
            <div className="control-group">
              <h4>清理操作</h4>
              <div className="button-group">
                <button onClick={manualCleanup} className="warning">
                  手动清理
                </button>
                <button onClick={clearAll} className="danger">
                  清空所有数据
                </button>
              </div>
            </div>

            {/* 自定义数据 */}
            <div className="control-group">
              <h4>添加自定义数据</h4>
              <div className="input-group">
                <input
                  type="text"
                  placeholder="键名"
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                />
                <input
                  type="text"
                  placeholder="值"
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                />
                <div className="size-control">
                  <label>大小: {dataSize}KB</label>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    value={dataSize}
                    onChange={(e) => setDataSize(Number(e.target.value))}
                  />
                </div>
                <button onClick={addCustomData} className="primary">
                  添加数据
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 统计面板 */}
        <div className="stats-panel">
          <div className="panel-section">
            <h3>📊 存储统计</h3>

            {/* 使用率进度条 */}
            <div className="usage-bar">
              <div className="usage-label">
                使用率: {Math.round(stats.usageRatio * 100)}%
              </div>
              <div className="progress-bar">
                <div
                  className={`progress-fill ${stats.usageRatio > 0.7 ? 'warning' : ''} ${stats.usageRatio > 0.9 ? 'danger' : ''}`}
                  style={{ width: `${Math.min(stats.usageRatio * 100, 100)}%` }}
                />
              </div>
              <div className="usage-text">
                {formatBytes(stats.totalSize)} / {formatBytes(stats.maxSize)}
              </div>
            </div>

            {/* 详细统计 */}
            <div className="stats-grid">
              <div className="stat-item">
                <span className="stat-label">总大小:</span>
                <span className="stat-value">{formatBytes(stats.totalSize)}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">项目数量:</span>
                <span className="stat-value">{stats.itemCount}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">清理次数:</span>
                <span className="stat-value">{stats.cleanupCount}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">最后清理:</span>
                <span className="stat-value">
                  {stats.lastCleanup ? new Date(stats.lastCleanup).toLocaleTimeString() : '未清理'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 存储项列表 */}
      <div className="storage-panel">
        <div className="panel-section">
          <h3>📦 存储项列表 ({storageItems.length})</h3>

          {storageItems.length === 0 ? (
            <div className="empty-state">
              <p>暂无存储数据</p>
              <p>点击"生成测试数据"开始测试</p>
            </div>
          ) : (
            <div className="storage-items">
              {storageItems.map((item) => (
                <div key={item.key} className="storage-item">
                  <div className="item-info">
                    <div className="item-key">
                      {item.key}
                      {item.key.startsWith('__') && <span className="system-tag">系统</span>}
                    </div>
                    <div className="item-details">
                      <span className="item-size">{formatBytes(item.size)}</span>
                      <span className="item-value">{item.value}</span>
                    </div>
                  </div>
                  <div className="item-actions">
                    <button
                      onClick={() => localStorage.getItem(item.key)}
                      className="access-btn"
                      title="访问此项"
                    >
                      👁️
                    </button>
                    <button
                      onClick={() => removeItem(item.key)}
                      className="delete-btn"
                      title="删除此项"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 日志面板 */}
      <div className="logs-panel">
        <div className="panel-section">
          <h3>📝 操作日志</h3>
          <div className="logs-container">
            {logs.length === 0 ? (
              <div className="empty-logs">暂无日志</div>
            ) : (
              logs.map((log, index) => (
                <div key={index} className="log-entry">
                  {log}
                </div>
              ))
            )}
          </div>
          <button
            onClick={() => setLogs([])}
            className="clear-logs-btn"
          >
            清空日志
          </button>
        </div>
      </div>

      {/* 使用说明 */}
      <div className="instructions-panel">
        <div className="panel-section">
          <h3>📖 使用说明</h3>
          <div className="instructions">
            <ol>
              <li><strong>安装代理:</strong> 点击"安装代理"开始监控localStorage操作</li>
              <li><strong>生成数据:</strong> 点击"生成测试数据"创建一些测试数据</li>
              <li><strong>观察清理:</strong> 当存储使用率超过70%时，会自动触发清理</li>
              <li><strong>模拟访问:</strong> 点击"模拟访问数据"来更新LRU记录</li>
              <li><strong>手动清理:</strong> 可以随时点击"手动清理"触发清理过程</li>
            </ol>

            <div className="tips">
              <h4>💡 测试技巧:</h4>
              <ul>
                <li>生成大量数据后观察自动清理过程</li>
                <li>访问某些数据后再触发清理，看LRU算法的效果</li>
                <li>查看控制台日志了解详细的清理过程</li>
                <li>系统键（以__开头和结尾）不会被清理</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
