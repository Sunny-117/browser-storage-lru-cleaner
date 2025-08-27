import { useState, useEffect } from 'react';
import { createLocalStorageCleaner } from 'browser-storage-lru-cleaner';


// 创建清理器实例 - 使用很小的容量便于快速看到清理效果
const cleaner = createLocalStorageCleaner({
  maxStorageSize: 10 * 1024, // 10KB - 很小的容量
  cleanupThreshold: 0.7, // 70%时开始清理
  cleanupRatio: 0.5, // 清理50%的数据
  autoCleanup: true,
  debug: true
});

export default function App() {
  const [isStarted, setIsStarted] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [stats, setStats] = useState(cleaner.getStats());
  const [debugInfo, setDebugInfo] = useState<any>(null);
  const [showDebug, setShowDebug] = useState(false);

  const addLog = (message: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, `[${time}] ${message}`]);
  };

  const updateStats = () => {
    setStats(cleaner.getStats());
  };

  // 开始测试
  const startTest = () => {
    cleaner.installProxy();
    setIsStarted(true);
    addLog('✅ 代理已安装，开始监控');
  };

  // 添加数据
  const addData = (size: 'small' | 'medium' | 'large') => {
    const sizes = {
      small: 1000,   // 1KB
      medium: 2000,  // 2KB
      large: 3000    // 3KB
    };

    const key = `data_${Date.now()}`;
    const value = 'x'.repeat(sizes[size]);

    localStorage.setItem(key, value);
    addLog(`📝 添加${size}数据: ${key} (${Math.round(sizes[size] / 1024 * 10) / 10}KB)`);
    updateStats();
  };

  // 访问数据
  const accessData = () => {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && !key.startsWith('__')) {
        keys.push(key);
      }
    }

    if (keys.length > 0) {
      const randomKey = keys[Math.floor(Math.random() * keys.length)];
      localStorage.getItem(randomKey);
      addLog(`👁️ 访问数据: ${randomKey}`);
    }
  };

  // 手动清理
  const manualCleanup = async () => {
    await cleaner.manualCleanup();
    addLog('🧹 手动清理完成');
    updateStats();
  };

  // 清空所有
  const clearAll = () => {
    localStorage.clear();
    addLog('🗑️ 清空所有数据');
    updateStats();
  };

  // 优化存储
  const optimizeStorage = async () => {
    try {
      const strategy = cleaner.getStrategy() as any;
      if (strategy.optimizeStorage) {
        const result = await strategy.optimizeStorage();
        addLog(`🔧 存储优化完成: 节省 ${Math.round(result.saved / 1024 * 10) / 10}KB`);
        updateStats();
      }
    } catch (error) {
      addLog(`❌ 优化失败: ${error}`);
    }
  };

  // 获取调试信息
  const loadDebugInfo = async () => {
    try {
      const strategy = cleaner.getStrategy() as any;
      if (strategy.getDebugInfo) {
        const info = await strategy.getDebugInfo();
        setDebugInfo(info);
        setShowDebug(true);
        addLog('🔍 调试信息已加载');
      }
    } catch (error) {
      addLog(`❌ 获取调试信息失败: ${error}`);
    }
  };

  // 获取清理候选项
  const showCleanupCandidates = () => {
    try {
      const strategy = cleaner.getStrategy() as any;
      if (strategy.getCleanupCandidates) {
        const candidates = strategy.getCleanupCandidates(5);
        addLog('🎯 最可能被清理的项目:');
        candidates.forEach((item: any, index: number) => {
          addLog(`  ${index + 1}. ${item.key} (优先级: ${item.priority.toFixed(2)})`);
        });
      }
    } catch (error) {
      addLog(`❌ 获取清理候选项失败: ${error}`);
    }
  };

  // 定时更新统计
  useEffect(() => {
    const interval = setInterval(updateStats, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatBytes = (bytes: number) => {
    return Math.round(bytes / 1024 * 10) / 10 + ' KB';
  };

  const usagePercent = Math.round(stats.usageRatio * 100);

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1>🧹 LRU清理器测试</h1>

      {/* 状态显示 */}
      <div style={{
        background: '#f5f5f5',
        padding: '15px',
        borderRadius: '8px',
        marginBottom: '20px'
      }}>
        <h3>📊 存储状态</h3>
        <div>使用率: <strong style={{ color: usagePercent > 70 ? 'red' : 'green' }}>{usagePercent}%</strong></div>
        <div>大小: {formatBytes(stats.totalSize)} / {formatBytes(stats.maxSize)}</div>
        <div>项目数: {stats.itemCount}</div>
        <div>清理次数: {stats.cleanupCount}</div>
        {(stats as any).compressionRatio && (
          <div>压缩率: {(stats as any).compressionRatio}</div>
        )}

        {/* 进度条 */}
        <div style={{
          width: '100%',
          height: '20px',
          background: '#ddd',
          borderRadius: '10px',
          marginTop: '10px',
          overflow: 'hidden'
        }}>
          <div style={{
            width: `${Math.min(usagePercent, 100)}%`,
            height: '100%',
            background: usagePercent > 70 ? '#ff4444' : '#44ff44',
            transition: 'width 0.3s'
          }} />
        </div>
      </div>

      {/* 控制按钮 */}
      <div style={{ marginBottom: '20px' }}>
        {!isStarted ? (
          <button
            onClick={startTest}
            style={{
              padding: '10px 20px',
              fontSize: '16px',
              background: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer'
            }}
          >
            开始测试
          </button>
        ) : (
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button onClick={() => addData('small')} style={buttonStyle}>添加小数据(1KB)</button>
            <button onClick={() => addData('medium')} style={buttonStyle}>添加中数据(2KB)</button>
            <button onClick={() => addData('large')} style={buttonStyle}>添加大数据(3KB)</button>
            <button onClick={accessData} style={{ ...buttonStyle, background: '#28a745' }}>随机访问</button>
            <button onClick={manualCleanup} style={{ ...buttonStyle, background: '#ffc107', color: '#000' }}>手动清理</button>
            <button onClick={optimizeStorage} style={{ ...buttonStyle, background: '#17a2b8' }}>优化存储</button>
            <button onClick={showCleanupCandidates} style={{ ...buttonStyle, background: '#6f42c1' }}>清理预览</button>
            <button onClick={loadDebugInfo} style={{ ...buttonStyle, background: '#fd7e14' }}>调试信息</button>
            <button onClick={clearAll} style={{ ...buttonStyle, background: '#dc3545' }}>清空所有</button>
          </div>
        )}
      </div>

      {/* 日志 */}
      <div style={{
        background: '#f8f9fa',
        border: '1px solid #ddd',
        borderRadius: '5px',
        padding: '15px',
        height: '300px',
        overflow: 'auto',
        fontFamily: 'monospace',
        fontSize: '14px'
      }}>
        <h3 style={{ marginTop: 0 }}>📝 操作日志</h3>
        {logs.length === 0 ? (
          <div style={{ color: '#666' }}>等待操作...</div>
        ) : (
          logs.map((log, index) => (
            <div key={index} style={{ marginBottom: '5px' }}>
              {log}
            </div>
          ))
        )}
      </div>

      {/* 调试信息 */}
      {showDebug && debugInfo && (
        <div style={{
          marginTop: '20px',
          padding: '15px',
          background: '#f8f9fa',
          borderRadius: '5px',
          border: '1px solid #dee2e6'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <h3>🔍 调试信息</h3>
            <button onClick={() => setShowDebug(false)} style={{ ...buttonStyle, background: '#6c757d', padding: '4px 8px' }}>
              关闭
            </button>
          </div>
          <pre style={{
            background: '#ffffff',
            padding: '10px',
            borderRadius: '4px',
            fontSize: '12px',
            overflow: 'auto',
            maxHeight: '300px'
          }}>
            {JSON.stringify(debugInfo, null, 2)}
          </pre>
        </div>
      )}

      {/* 使用说明 */}
      <div style={{ marginTop: '20px', padding: '15px', background: '#e7f3ff', borderRadius: '5px' }}>
        <h3>💡 测试步骤</h3>
        <ol>
          <li>点击"开始测试"安装代理</li>
          <li>点击"添加数据"按钮多次添加数据，观察使用率变化</li>
          <li>当使用率超过70%时，会自动触发清理（观察日志）</li>
          <li>点击"随机访问"可以更新某些数据的LRU状态</li>
          <li>点击"清理预览"查看哪些数据最可能被清理</li>
          <li>点击"优化存储"手动优化存储空间</li>
          <li>点击"调试信息"查看详细的压缩和存储信息</li>
        </ol>
        <p><strong>注意：</strong>打开浏览器控制台可以看到更详细的调试信息</p>

        <div style={{ marginTop: '15px', padding: '10px', background: '#fff3cd', borderRadius: '4px' }}>
          <h4>🆕 新功能说明</h4>
          <ul>
            <li><strong>优化存储：</strong>使用高级压缩算法，减少元数据占用空间</li>
            <li><strong>清理预览：</strong>显示最可能被清理的数据项和优先级</li>
            <li><strong>调试信息：</strong>显示压缩率、存储统计等详细信息</li>
            <li><strong>智能限制：</strong>自动限制访问记录数量，防止无限增长</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

const buttonStyle = {
  padding: '8px 16px',
  background: '#007bff',
  color: 'white',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer'
};
