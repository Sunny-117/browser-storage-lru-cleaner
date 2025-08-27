import { createLocalStorageCleaner } from 'browser-storage-lru-cleaner'

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

export default function App() {
  return (
    <div>App</div>
  )
}
