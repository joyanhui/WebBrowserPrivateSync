// 加载同步路径
async function loadSyncPath() {
    try {
        console.log('开始加载同步路径...');
        const config = await chrome.storage.sync.get('bookmarkConfig');
        console.log('获取到的配置:', config);
        
        const syncPath = config.bookmarkConfig?.path || '/Bookmarks bar/';
        console.log('同步路径:', syncPath);
        
        const pathElement = document.getElementById('sync-path');
        if (pathElement) {
            pathElement.textContent = syncPath;
        } else {
            console.error('找不到sync-path元素');
        }
    } catch (error) {
        console.error('加载同步路径失败:', error);
        const pathElement = document.getElementById('sync-path');
        if (pathElement) {
            pathElement.textContent = '加载失败: ' + error.message;
        }
    }
}

// 页面加载时获取同步路径
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM加载完成，开始初始化...');
    loadSyncPath();
});

// 监听storage变化，实时更新显示的路径
chrome.storage.onChanged.addListener((changes, namespace) => {
    console.log('Storage变化:', changes, namespace);
    if (namespace === 'sync' && changes.bookmarkConfig) {
        const newPath = changes.bookmarkConfig.newValue?.path;
        if (newPath) {
            const pathElement = document.getElementById('sync-path');
            if (pathElement) {
                pathElement.textContent = newPath;
            }
        }
    }
});

// 立即执行一次加载
loadSyncPath(); 