/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from 'react';
import { createLocalStorageCleaner } from 'browser-storage-lru-cleaner';

// 创建清理器实例 - 使用很小的容量便于快速看到清理效果
const cleaner = createLocalStorageCleaner({
    maxStorageSize: 10 * 1024, // 10KB - 很小的容量
    autoCleanup: true,
    debug: true,
    enableTimeBasedCleanup: true, // 启用基于时间的清理
    // timeCleanupThreshold: 10 / (24 * 60 * 60),
    cleanupOnInsert: true, // 插入时触发清理
    unimportantKeys: ['recording', 'temp', 'cache'] // 不重要的keys（简单字符串匹配，智能插入自动处理）
});

// const cleaner = createLocalStorageCleaner({
//     maxStorageSize: 3 * 1024 * 1024, // 3MB - 较大的容量便于测试
//     debug: true,
//     unimportantKeys: ['preRecordStorage', 'preRecordStorageOld'] // 不重要的keys（简单字符串匹配，智能插入自动处理）
// });

export default function BasicExample() {
    const [logs, setLogs] = useState<string[]>([]);
    const [stats, setStats] = useState(cleaner.getStats());
    const [timeCleanupStats, setTimeCleanupStats] = useState<any>(null);
    const [smartInsertionStats, setSmartInsertionStats] = useState<any>({});
    const [unimportantKeysCleanupCandidates, setUnimportantKeysCleanupCandidates] = useState<any[]>([]);

    const addLog = (message: string) => {
        setLogs(prev => [...prev, `[${Date.now()}] ${message}`]);
    };

    const updateStats = () => {
        setStats(cleaner.getStats());
    };

    // 开始测试
    const startTest = () => {
        cleaner.installProxy();
        addLog('✅ 代理已安装，开始监控');
    };
    useEffect(() => {
        startTest()
    }, [])

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

    // 添加不重要的大数据（测试智能插入）
    const addUnimportantLargeData = () => {
        const key = `recording_${Date.now()}`;
        const value = 'x'.repeat(5000); // 5KB 大数据

        try {
            localStorage.setItem(key, value);
            addLog(`🎬 尝试添加录屏数据: ${key} (5KB)`);
        } catch (error) {
            addLog(`❌ 添加录屏数据失败: ${error}`);
        }
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

    // 获取时间清理统计
    const updateTimeCleanupStats = () => {
        try {
            const stats = cleaner.getTimeCleanupStats();
            setTimeCleanupStats(stats);
            if (stats.enabled) {
                addLog(`📊 时间清理统计: ${stats.expiredKeysCount}个过期, ${stats.expiringKeysCount}个即将过期`);
            }
        } catch (error) {
            addLog(`❌ 获取时间清理统计失败: ${error}`);
        }
    };

    // 获取智能插入统计
    const updateSmartInsertionStats = () => {
        try {
            const stats = cleaner.getSmartInsertionStats();
            setSmartInsertionStats(stats);
        } catch (error) {
            addLog(`❌ 获取智能插入统计失败: ${error}`);
        }
    };

    // 获取不重要keys清理候选项
    const updateUnimportantKeysCleanupCandidates = () => {
        try {
            const candidates = cleaner.getUnimportantKeysCleanupCandidates();
            setUnimportantKeysCleanupCandidates(candidates);
            if (candidates.length > 0) {
                addLog(`🗑️ 发现 ${candidates.length} 个不重要的清理候选项`);
            }
        } catch (error) {
            addLog(`❌ 获取不重要keys清理候选项失败: ${error}`);
        }
    };

    // 定时更新统计
    useEffect(() => {
        const interval = setInterval(() => {
            updateStats();
            updateTimeCleanupStats();
            updateSmartInsertionStats();
            updateUnimportantKeysCleanupCandidates();
        }, 1000);
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
                {timeCleanupStats && timeCleanupStats.enabled && (
                    <>
                        <div>时间清理: {timeCleanupStats.thresholdDays}天阈值</div>
                        <div>过期项目: {timeCleanupStats.expiredKeysCount}个</div>
                    </>
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
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <button onClick={() => addData('small')} style={buttonStyle}>添加小数据(1KB)</button>
                    <button onClick={accessData} style={{ ...buttonStyle, background: '#28a745' }}>随机访问</button>
                </div>

                <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#f8f9fa', border: '1px solid #dee2e6', borderRadius: '5px' }}>
                    <h3 style={{ margin: '0 0 15px 0', color: '#495057' }}>🧠 智能插入测试</h3>
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        <button onClick={addUnimportantLargeData} style={{ ...buttonStyle, background: '#dc3545' }}>
                            录屏数据(5KB) - 不重要大数据
                        </button>
                    </div>

                    {/* 智能插入统计 */}
                    <div style={{ marginTop: '15px', padding: '10px', backgroundColor: '#e9ecef', borderRadius: '3px' }}>
                        <strong>智能插入状态:</strong>
                        <div>启用: {smartInsertionStats.enabled ? '是' : '否'}</div>
                        <div>不重要keys数量: {smartInsertionStats.unimportantKeysCount}</div>
                        <div>大数据阈值: {smartInsertionStats.largeDataThreshold}</div>
                        {unimportantKeysCleanupCandidates.length > 0 && (
                            <div>不重要清理候选: {unimportantKeysCleanupCandidates.length}个</div>
                        )}
                    </div>
                </div>
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
