/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from 'react';
import { createLocalStorageCleaner, Utils } from 'browser-storage-lru-cleaner';

// TODO：BUG：很久没访问的，插入最新的会被直接清楚，导致数据丢失。
// TODO：手动清理key后，刷新页面，元数据没有更新，还是记录了之前老数据。可能记录的老数据导致了第一个bug
// 创建清理器实例 - 使用很小的容量便于快速看到清理效果
const cleaner = createLocalStorageCleaner({
    maxStorageSize: 10 * 1024, // 10KB - 很小的容量
    cleanupThreshold: 0.7, // 70%时开始清理
    autoCleanup: true,
    debug: true,
    enableTimeBasedCleanup: false, // 启用基于时间的清理
    // timeCleanupThreshold: 1, // 1天未访问自动清理 - 便于测试
    cleanupOnInsert: true, // 插入时触发清理
    unimportantKeys: ['recording', 'temp', 'cache'] // 不重要的keys（简单字符串匹配，智能插入自动处理）
});

export default function BasicExample() {
    const [logs, setLogs] = useState<string[]>([]);
    const [stats, setStats] = useState(cleaner.getStats());
    const [debugInfo, setDebugInfo] = useState<any>(null);
    const [showDebug, setShowDebug] = useState(false);
    const [timeCleanupStats, setTimeCleanupStats] = useState<any>(null);
    const [expiringKeys, setExpiringKeys] = useState<any[]>([]);
    const [accessRecordsHealth, setAccessRecordsHealth] = useState<any>(null);
    const [smartInsertionStats, setSmartInsertionStats] = useState<any>({});
    const [unimportantKeysCleanupCandidates, setUnimportantKeysCleanupCandidates] = useState<any[]>([]);

    const addLog = (message: string) => {
        const time = Utils.formatDate(Utils.nowDate()).split(' ')[1]; // 只取时间部分
        setLogs(prev => [...prev, `[${time}] ${message}`]);
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

    // 添加不重要的小数据
    const addUnimportantSmallData = () => {
        const key = `temp_${Date.now()}`;
        const value = 'x'.repeat(500); // 0.5KB 小数据

        localStorage.setItem(key, value);
        addLog(`📄 添加临时数据: ${key} (0.5KB)`);
        updateStats();
    };

    // 添加重要的大数据
    const addImportantLargeData = () => {
        const key = `important_${Date.now()}`;
        const value = 'x'.repeat(5000); // 5KB 大数据

        localStorage.setItem(key, value);
        addLog(`⭐ 添加重要数据: ${key} (5KB)`);
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

    // 触发基于时间的清理
    const triggerTimeCleanup = () => {
        try {
            const result = cleaner.triggerTimeBasedCleanup();
            if (result) {
                addLog(`⏰ 时间清理完成: 清理了 ${result.cleanedCount} 个过期项目`);
                if (result.cleanedKeys.length > 0) {
                    addLog(`清理的项目: ${result.cleanedKeys.join(', ')}`);
                }
                updateStats();
            } else {
                addLog('❌ 时间清理功能不可用');
            }
        } catch (error) {
            addLog(`❌ 时间清理失败: ${error}`);
        }
    };

    // 查看即将过期的项目
    const showExpiringKeys = () => {
        try {
            const expiring = cleaner.getExpiringKeys(1);
            setExpiringKeys(expiring);
            if (expiring.length > 0) {
                addLog(`⚠️ 即将过期的项目 (${expiring.length}个):`);
                expiring.slice(0, 3).forEach((item: any) => {
                    addLog(`  ${item.key} - ${item.daysUntilExpiry}天后过期`);
                });
            } else {
                addLog('✅ 没有即将过期的项目');
            }
        } catch (error) {
            addLog(`❌ 获取过期项目失败: ${error}`);
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

    // 创建一些旧数据用于测试时间清理
    const createOldData = () => {
        // 创建一些"旧"数据（通过修改访问记录来模拟）
        const oldKeys = ['old_data_1', 'old_data_2', 'old_data_3'];
        const oldTime = Utils.now() - (3 * 60 * 60 * 1000); // 3小时前

        oldKeys.forEach(key => {
            localStorage.setItem(key, `旧数据: ${key}`);
            // 手动设置访问记录为旧时间
            const strategy = cleaner.getStrategy() as any;
            if (strategy.accessRecords) {
                strategy.accessRecords[key] = {
                    lastAccess: oldTime,
                    accessCount: 1,
                    size: new Blob([key + `旧数据: ${key}`]).size
                };
            }
        });

        addLog(`🕰️ 创建了 ${oldKeys.length} 个旧数据项目 (3小时前)`);
        updateStats();
    };

    // 检查访问记录健康状态
    const checkAccessRecordsHealth = () => {
        try {
            const health = cleaner.checkAccessRecordsHealth();
            if (health) {
                setAccessRecordsHealth(health);
                addLog(`🏥 访问记录健康检查: ${health.isHealthy ? '健康' : '需要修复'}`);
                addLog(`  总键数: ${health.totalKeys}, 已跟踪: ${health.trackedKeys}`);
                if (health.missingRecords > 0) {
                    addLog(`  缺失记录: ${health.missingRecords}个`);
                }
                if (health.corruptedRecords > 0) {
                    addLog(`  损坏记录: ${health.corruptedRecords}个`);
                }
            }
        } catch (error) {
            addLog(`❌ 健康检查失败: ${error}`);
        }
    };

    // 自动修复访问记录
    const autoRepairAccessRecords = () => {
        try {
            const result = cleaner.autoRepairAccessRecords();
            addLog(`🔧 自动修复完成: ${result.repairAction}`);

            if (result.healthCheck) {
                addLog(`  健康状态: ${result.healthCheck.isHealthy ? '健康' : '需要修复'}`);
            }

            if (result.repairAction === 'initialize' && result.result) {
                addLog(`  初始化了 ${result.result.initializedCount} 个记录`);
            } else if (result.repairAction === 'rebuild' && result.result) {
                addLog(`  重建了 ${result.result.rebuiltCount} 个记录`);
            }

            updateStats();
        } catch (error) {
            addLog(`❌ 自动修复失败: ${error}`);
        }
    };

    // 模拟访问记录丢失
    const simulateDataLoss = () => {
        try {
            // 直接删除访问记录来模拟数据丢失
            localStorage.removeItem('__lru_access_records__');
            addLog('💥 模拟访问记录丢失 - 已删除 __lru_access_records__');
            addLog('💡 现在可以测试自动修复功能');
        } catch (error) {
            addLog(`❌ 模拟失败: ${error}`);
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
                {accessRecordsHealth && (
                    <div style={{ color: accessRecordsHealth.isHealthy ? '#28a745' : '#dc3545' }}>
                        记录健康: {accessRecordsHealth.isHealthy ? '正常' : '异常'}
                    </div>
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
                    <button onClick={() => addData('medium')} style={buttonStyle}>添加中数据(2KB)</button>
                    <button onClick={() => addData('large')} style={buttonStyle}>添加大数据(3KB)</button>
                    <button onClick={accessData} style={{ ...buttonStyle, background: '#28a745' }}>随机访问</button>
                    <button onClick={manualCleanup} style={{ ...buttonStyle, background: '#ffc107', color: '#000' }}>手动清理</button>
                    <button onClick={optimizeStorage} style={{ ...buttonStyle, background: '#17a2b8' }}>优化存储</button>
                    <button onClick={showCleanupCandidates} style={{ ...buttonStyle, background: '#6f42c1' }}>清理预览</button>
                    <button onClick={triggerTimeCleanup} style={{ ...buttonStyle, background: '#e83e8c' }}>时间清理</button>
                    <button onClick={showExpiringKeys} style={{ ...buttonStyle, background: '#20c997' }}>过期预警</button>
                    <button onClick={createOldData} style={{ ...buttonStyle, background: '#6c757d' }}>创建旧数据</button>
                    <button onClick={checkAccessRecordsHealth} style={{ ...buttonStyle, background: '#17a2b8' }}>健康检查</button>
                    <button onClick={autoRepairAccessRecords} style={{ ...buttonStyle, background: '#28a745' }}>自动修复</button>
                    <button onClick={simulateDataLoss} style={{ ...buttonStyle, background: '#dc3545' }}>模拟丢失</button>
                    <button onClick={loadDebugInfo} style={{ ...buttonStyle, background: '#fd7e14' }}>调试信息</button>
                    <button onClick={clearAll} style={{ ...buttonStyle, background: '#dc3545' }}>清空所有</button>
                </div>

                <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#f8f9fa', border: '1px solid #dee2e6', borderRadius: '5px' }}>
                    <h3 style={{ margin: '0 0 15px 0', color: '#495057' }}>🧠 智能插入测试</h3>
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        <button onClick={addUnimportantLargeData} style={{ ...buttonStyle, background: '#dc3545' }}>
                            录屏数据(5KB) - 不重要大数据
                        </button>
                        <button onClick={addUnimportantSmallData} style={{ ...buttonStyle, background: '#fd7e14' }}>
                            临时数据(0.5KB) - 不重要小数据
                        </button>
                        <button onClick={addImportantLargeData} style={{ ...buttonStyle, background: '#20c997' }}>
                            重要数据(5KB) - 重要大数据
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

            {/* 访问记录健康状态 */}
            {accessRecordsHealth && (
                <div style={{
                    marginTop: '20px',
                    padding: '15px',
                    background: accessRecordsHealth.isHealthy ? '#d4edda' : '#f8d7da',
                    borderRadius: '5px',
                    border: `1px solid ${accessRecordsHealth.isHealthy ? '#c3e6cb' : '#f5c6cb'}`
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <h3>🏥 访问记录健康状态</h3>
                        <button onClick={() => setAccessRecordsHealth(null)} style={{ ...buttonStyle, background: '#6c757d', padding: '4px 8px' }}>
                            关闭
                        </button>
                    </div>
                    <div style={{ fontSize: '14px' }}>
                        <div><strong>状态:</strong> {accessRecordsHealth.isHealthy ? '✅ 健康' : '❌ 需要修复'}</div>
                        <div><strong>总键数:</strong> {accessRecordsHealth.totalKeys}</div>
                        <div><strong>已跟踪:</strong> {accessRecordsHealth.trackedKeys}</div>
                        {accessRecordsHealth.missingRecords > 0 && (
                            <div style={{ color: '#dc3545' }}><strong>缺失记录:</strong> {accessRecordsHealth.missingRecords}个</div>
                        )}
                        {accessRecordsHealth.corruptedRecords > 0 && (
                            <div style={{ color: '#dc3545' }}><strong>损坏记录:</strong> {accessRecordsHealth.corruptedRecords}个</div>
                        )}
                        {accessRecordsHealth.recommendations.length > 0 && (
                            <div style={{ marginTop: '10px' }}>
                                <strong>建议:</strong>
                                <ul style={{ margin: '5px 0', paddingLeft: '20px' }}>
                                    {accessRecordsHealth.recommendations.map((rec: string, index: number) => (
                                        <li key={index}>{rec}</li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* 即将过期的项目 */}
            {expiringKeys.length > 0 && (
                <div style={{
                    marginTop: '20px',
                    padding: '15px',
                    background: '#fff3cd',
                    borderRadius: '5px',
                    border: '1px solid #ffeaa7'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <h3>⚠️ 即将过期的项目 ({expiringKeys.length})</h3>
                        <button onClick={() => setExpiringKeys([])} style={{ ...buttonStyle, background: '#6c757d', padding: '4px 8px' }}>
                            关闭
                        </button>
                    </div>
                    <div style={{ maxHeight: '200px', overflow: 'auto' }}>
                        {expiringKeys.map((item, index) => (
                            <div key={index} style={{
                                padding: '8px',
                                background: '#ffffff',
                                marginBottom: '5px',
                                borderRadius: '4px',
                                fontSize: '14px'
                            }}>
                                <strong>{item.key}</strong> - {item.daysUntilExpiry}天后过期
                                (访问{item.accessCount}次, 最后访问: {Utils.formatLocale(new Date(item.lastAccess))})
                            </div>
                        ))}
                    </div>
                </div>
            )}

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
