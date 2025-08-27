// 模拟导入SDK（实际使用时应该从构建后的文件导入）
import { createLocalStorageCleaner, createIndexedDBCleaner } from '../dist/index.mjs';

// 演示用的简化版本
class DemoStorageCleaner {
    constructor(type = 'localStorage') {
        this.type = type;
        this.config = {
            maxStorageSize: 1024 * 1024, // 1MB
            cleanupThreshold: 0.8,
            cleanupRatio: 0.3,
            autoCleanup: true,
            debug: false
        };
        this.stats = {
            totalSize: 0,
            itemCount: 0,
            usageRatio: 0,
            cleanupCount: 0
        };
        this.isProxyInstalled = false;
        this.accessRecords = {};

        this.updateStats();
    }

    installProxy() {
        if (this.isProxyInstalled) return;

        if (this.type === 'localStorage') {
            this.installLocalStorageProxy();
        }

        this.isProxyInstalled = true;
        this.log('✅ 代理已安装');
    }

    uninstallProxy() {
        if (!this.isProxyInstalled) return;

        // 简化版本，实际应该恢复原始localStorage
        this.isProxyInstalled = false;
        this.log('❌ 代理已卸载');
    }

    installLocalStorageProxy() {
        const self = this;
        const originalSetItem = localStorage.setItem;
        const originalGetItem = localStorage.getItem;

        localStorage.setItem = function(key, value) {
            // 检查是否需要清理
            if (self.config.autoCleanup) {
                self.checkAndCleanup(key, value);
            }

            originalSetItem.call(this, key, value);
            self.recordAccess(key);
            self.updateStats();
            self.log(`📝 设置: ${key} = ${value.substring(0, 50)}${value.length > 50 ? '...' : ''}`);
        };

        localStorage.getItem = function(key) {
            const result = originalGetItem.call(this, key);
            if (result !== null) {
                self.recordAccess(key);
                self.log(`📖 读取: ${key}`);
            }
            return result;
        };
    }

    recordAccess(key) {
        const now = Date.now();
        if (this.accessRecords[key]) {
            this.accessRecords[key].lastAccess = now;
            this.accessRecords[key].accessCount++;
        } else {
            this.accessRecords[key] = {
                lastAccess: now,
                accessCount: 1,
                size: this.getItemSize(key)
            };
        }
    }

    checkAndCleanup(newKey, newValue) {
        const currentSize = this.getCurrentSize();
        const newItemSize = this.getStringByteSize(newKey) + this.getStringByteSize(newValue);
        const threshold = this.config.maxStorageSize * this.config.cleanupThreshold;

        if (currentSize + newItemSize > threshold) {
            this.cleanup(newItemSize);
        }
    }

    cleanup(requiredSpace = 0) {
        const allKeys = this.getAllKeys();
        const currentSize = this.getCurrentSize();
        const targetSize = Math.max(
            this.config.maxStorageSize * (1 - this.config.cleanupRatio),
            currentSize - requiredSpace
        );

        const spaceToFree = currentSize - targetSize;

        if (spaceToFree <= 0) return;

        // 按LRU排序
        const sortedKeys = this.sortKeysByLRU(allKeys);
        const keysToCleanup = [];
        let freedSpace = 0;

        for (const key of sortedKeys) {
            if (this.isSystemKey(key)) continue;

            const size = this.getItemSize(key);
            keysToCleanup.push(key);
            freedSpace += size;

            if (freedSpace >= spaceToFree) break;
        }

        // 执行清理
        for (const key of keysToCleanup) {
            localStorage.removeItem(key);
            delete this.accessRecords[key];
        }

        this.stats.cleanupCount++;
        this.updateStats();
        this.log(`🧹 清理完成: 删除 ${keysToCleanup.length} 项，释放 ${this.formatBytes(freedSpace)}`);
    }

    sortKeysByLRU(keys) {
        return keys.sort((a, b) => {
            const recordA = this.accessRecords[a];
            const recordB = this.accessRecords[b];

            if (!recordA && !recordB) return 0;
            if (!recordA) return -1;
            if (!recordB) return 1;

            // 按最后访问时间排序
            const timeDiff = recordA.lastAccess - recordB.lastAccess;
            if (timeDiff !== 0) return timeDiff;

            // 按访问次数排序
            return recordA.accessCount - recordB.accessCount;
        });
    }

    updateStats() {
        this.stats.totalSize = this.getCurrentSize();
        this.stats.itemCount = this.getAllKeys().length;
        this.stats.usageRatio = this.stats.totalSize / this.config.maxStorageSize;

        // 更新UI
        this.updateStatsUI();
    }

    getCurrentSize() {
        let totalSize = 0;
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key) {
                const value = localStorage.getItem(key);
                if (value) {
                    totalSize += this.getStringByteSize(key) + this.getStringByteSize(value);
                }
            }
        }
        return totalSize;
    }

    getAllKeys() {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key) keys.push(key);
        }
        return keys;
    }

    getItemSize(key) {
        const value = localStorage.getItem(key);
        if (!value) return 0;
        return this.getStringByteSize(key) + this.getStringByteSize(value);
    }

    getStringByteSize(str) {
        return new Blob([str]).size;
    }

    isSystemKey(key) {
        return key.startsWith('__') && key.endsWith('__');
    }

    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    log(message) {
        const timestamp = new Date().toLocaleTimeString();
        const logContainer = document.getElementById('logContainer');
        if (logContainer) {
            logContainer.textContent += `[${timestamp}] ${message}\n`;
            logContainer.scrollTop = logContainer.scrollHeight;
        }

        if (this.config.debug) {
            console.log(`[StorageCleaner] ${message}`);
        }
    }

    updateStatsUI() {
        // 更新统计信息显示
        document.getElementById('totalSize').textContent = this.formatBytes(this.stats.totalSize);
        document.getElementById('itemCount').textContent = this.stats.itemCount;
        document.getElementById('usageRatio').textContent = Math.round(this.stats.usageRatio * 100) + '%';
        document.getElementById('cleanupCount').textContent = this.stats.cleanupCount;

        // 更新进度条
        const progressFill = document.getElementById('progressFill');
        const percentage = Math.min(this.stats.usageRatio * 100, 100);
        progressFill.style.width = percentage + '%';

        // 更新存储项列表
        this.updateStorageItemsUI();
    }

    updateStorageItemsUI() {
        const container = document.getElementById('storageItems');
        if (!container) return;

        container.innerHTML = '';
        const keys = this.getAllKeys();

        if (keys.length === 0) {
            container.innerHTML = '<div style="text-align: center; color: #6c757d;">暂无数据</div>';
            return;
        }

        keys.forEach(key => {
            const value = localStorage.getItem(key);
            const size = this.getItemSize(key);
            const record = this.accessRecords[key];

            const item = document.createElement('div');
            item.className = 'storage-item';
            item.innerHTML = `
                <div class="item-info">
                    <div class="item-key">${key}</div>
                    <div class="item-size">
                        ${this.formatBytes(size)} |
                        访问: ${record ? record.accessCount : 0}次 |
                        最后访问: ${record ? new Date(record.lastAccess).toLocaleTimeString() : '未知'}
                    </div>
                </div>
                <button onclick="removeItem('${key}')" style="font-size: 12px; padding: 4px 8px;">删除</button>
            `;
            container.appendChild(item);
        });
    }
}

// 全局变量
let storageCleaner = new DemoStorageCleaner('localStorage');

// 全局函数
window.switchStorageType = function() {
    const select = document.getElementById('storageType');
    const type = select.value;

    storageCleaner = new DemoStorageCleaner(type);
    storageCleaner.log(`🔄 切换到 ${type}`);
    updateUI();
};

window.updateConfig = function() {
    const maxSize = parseInt(document.getElementById('maxSize').value) * 1024; // 转换为字节
    const cleanupThreshold = parseFloat(document.getElementById('cleanupThreshold').value);
    const cleanupRatio = parseFloat(document.getElementById('cleanupRatio').value);
    const autoCleanup = document.getElementById('autoCleanup').checked;
    const debug = document.getElementById('debugMode').checked;

    storageCleaner.config = {
        ...storageCleaner.config,
        maxStorageSize: maxSize,
        cleanupThreshold,
        cleanupRatio,
        autoCleanup,
        debug
    };

    storageCleaner.log('⚙️ 配置已更新');
    storageCleaner.updateStats();
};

window.installProxy = function() {
    storageCleaner.installProxy();
};

window.uninstallProxy = function() {
    storageCleaner.uninstallProxy();
};

window.manualCleanup = function() {
    storageCleaner.cleanup();
};

window.checkHealth = function() {
    const healthStatus = document.getElementById('healthStatus');
    const healthContent = document.getElementById('healthContent');

    // 简化的健康检查
    const issues = [];
    const recommendations = [];

    if (storageCleaner.stats.usageRatio > 0.9) {
        issues.push('存储使用率超过90%');
        recommendations.push('建议增加清理频率或减少最大存储大小');
    }

    if (storageCleaner.stats.itemCount > 100) {
        issues.push('存储项目过多');
        recommendations.push('建议实施更积极的清理策略');
    }

    const isHealthy = issues.length === 0;

    healthContent.innerHTML = `
        <div class="alert ${isHealthy ? 'alert-info' : 'alert-warning'}">
            <strong>健康状态：</strong>${isHealthy ? '良好' : '需要注意'}
        </div>
        ${issues.length > 0 ? `
            <div><strong>问题：</strong></div>
            <ul>${issues.map(issue => `<li>${issue}</li>`).join('')}</ul>
        ` : ''}
        ${recommendations.length > 0 ? `
            <div><strong>建议：</strong></div>
            <ul>${recommendations.map(rec => `<li>${rec}</li>`).join('')}</ul>
        ` : ''}
    `;

    healthStatus.style.display = 'block';
    storageCleaner.log(`🏥 健康检查完成: ${isHealthy ? '良好' : '发现问题'}`);
};

window.generateTestData = function() {
    const count = 20;
    const baseSize = 1024; // 1KB

    for (let i = 0; i < count; i++) {
        const key = `test_data_${i}`;
        const size = baseSize + Math.random() * baseSize; // 1-2KB
        const value = 'x'.repeat(Math.floor(size));

        localStorage.setItem(key, value);
    }

    storageCleaner.updateStats();
    storageCleaner.log(`📊 生成了 ${count} 条测试数据`);
};

window.simulateUsage = function() {
    const keys = storageCleaner.getAllKeys().filter(key => !storageCleaner.isSystemKey(key));

    if (keys.length === 0) {
        storageCleaner.log('❌ 没有数据可以模拟使用');
        return;
    }

    // 随机访问一些键
    const accessCount = Math.min(10, keys.length);
    for (let i = 0; i < accessCount; i++) {
        const randomKey = keys[Math.floor(Math.random() * keys.length)];
        localStorage.getItem(randomKey); // 触发访问记录
    }

    storageCleaner.log(`🎯 模拟访问了 ${accessCount} 个项目`);
};

window.clearAllData = function() {
    if (confirm('确定要清空所有数据吗？')) {
        localStorage.clear();
        storageCleaner.accessRecords = {};
        storageCleaner.stats.cleanupCount = 0;
        storageCleaner.updateStats();
        storageCleaner.log('🗑️ 所有数据已清空');
    }
};

window.addItem = function() {
    const keyInput = document.getElementById('newKey');
    const valueInput = document.getElementById('newValue');

    const key = keyInput.value.trim();
    const value = valueInput.value.trim();

    if (!key || !value) {
        alert('请输入键名和值');
        return;
    }

    localStorage.setItem(key, value);

    keyInput.value = '';
    valueInput.value = '';

    storageCleaner.updateStats();
};

window.removeItem = function(key) {
    localStorage.removeItem(key);
    delete storageCleaner.accessRecords[key];
    storageCleaner.updateStats();
    storageCleaner.log(`🗑️ 删除项目: ${key}`);
};

window.refreshItems = function() {
    storageCleaner.updateStats();
    storageCleaner.log('🔄 刷新存储项列表');
};

window.clearLog = function() {
    document.getElementById('logContainer').textContent = '';
};

// 更新UI辅助函数
function updateUI() {
    // 更新滑块显示值
    const thresholdSlider = document.getElementById('cleanupThreshold');
    const thresholdValue = document.getElementById('thresholdValue');
    thresholdValue.textContent = Math.round(thresholdSlider.value * 100) + '%';

    const ratioSlider = document.getElementById('cleanupRatio');
    const ratioValue = document.getElementById('ratioValue');
    ratioValue.textContent = Math.round(ratioSlider.value * 100) + '%';

    storageCleaner.updateStats();
}

// 事件监听器
document.addEventListener('DOMContentLoaded', function() {
    // 滑块事件
    document.getElementById('cleanupThreshold').addEventListener('input', updateUI);
    document.getElementById('cleanupRatio').addEventListener('input', updateUI);

    // 初始化UI
    updateUI();

    // 欢迎消息
    storageCleaner.log('🎉 Browser Storage LRU Cleaner Demo 已启动');
    storageCleaner.log('💡 提示：先点击"安装代理"，然后生成测试数据进行体验');
});