// 自动同步定时器ID
let syncTimerId = null;

// 启动自动同步
async function startAutoSync() {
    // 清除现有定时器
    if (syncTimerId) {
        clearInterval(syncTimerId);
        syncTimerId = null;
    }

    // 获取配置
    const config = await chrome.storage.sync.get(['bookmarkConfig']);
    if (!config.bookmarkConfig?.enable_auto_sync) {
        return;
    }

    // 设置定时器
    const interval = Math.max(30, config.bookmarkConfig.sync_interval || 300) * 1000; // 转换为毫秒
    syncTimerId = setInterval(async () => {
        try {
            // 发送消息触发同步
            chrome.runtime.sendMessage({ action: 'syncBookmarks' });
            console.log('自动同步已触发');
        } catch (error) {
            console.error('自动同步失败:', error);
        }
    }, interval);
}

// 监听配置变更
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync' && changes.bookmarkConfig) {
        startAutoSync();
    }
});

// 扩展启动时启动自动同步
chrome.runtime.onStartup.addListener(startAutoSync);

// 扩展安装/更新时启动自动同步
chrome.runtime.onInstalled.addListener(startAutoSync); 