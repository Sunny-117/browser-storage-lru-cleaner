while (1) {
    try {
        // localStorage.setItem('aa' + Math.random() + Date.now(), 'a'.repeat(1024 * 1024 * 10))
        localStorage.setItem('aa' + Math.random() + Date.now(), 'a'.repeat(1024 * 1024 * 2))
        console.log('成功')
    } catch (error) {
        console.warn(error, '失败')
        break;
    }
}
