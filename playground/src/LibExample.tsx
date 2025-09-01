
import { useLocalStorage } from 'huse'
import { createLocalStorageCleaner } from 'browser-storage-lru-cleaner';


// 创建清理器实例 - 使用很小的容量便于快速看到清理效果
const cleaner = createLocalStorageCleaner({
    debug: true,
    enableTimeBasedCleanup: true, // 启用基于时间的清理
    timeCleanupThreshold: 10 / (24 * 60 * 60),
});
cleaner.installProxy();

export default function LibExample() {
    const [value, setValue] = useLocalStorage('num', 1)
    console.log(11, value)
    return (
        <div>
            <button onClick={() => setValue(value + 1)}>+</button>
            {value}
            <p>
                <button onClick={() => localStorage.setItem('newKey', 'value')}>新增key</button>
            </p>
        </div>
    )
}
