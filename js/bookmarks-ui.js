// 初始化UI
async function initializeUI() {
    try {
        // 从storage中获取配置
        const config = await chrome.storage.sync.get(['bookmarkConfig']);
        
        // 更新同步路径显示
        updateSyncPathDisplay(config.bookmarkConfig?.sync_path);
        
        // 添加按钮事件监听
        document.getElementById('exportBtn').addEventListener('click', () => {
            // 触发自定义事件，让bookmarks.js处理
            document.dispatchEvent(new CustomEvent('bookmarkExport'));
        });
        
        document.getElementById('importBtn').addEventListener('click', () => {
            // 触发自定义事件，让bookmarks.js处理
            document.dispatchEvent(new CustomEvent('bookmarkImport'));
        });
        
        // 添加同步按钮事件监听
        document.getElementById('syncBtn').addEventListener('click', () => {
            document.dispatchEvent(new CustomEvent('bookmarkSync'));
        });
        
    } catch (error) {
        console.error('初始化UI失败:', error);
        showStatus('初始化失败: ' + error.message, 'danger');
    }
}

// 更新同步路径显示
function updateSyncPathDisplay(path) {
    const syncPathElement = document.getElementById('sync-path');
    syncPathElement.textContent = path || '/Bookmarks bar/';
}

// 显示状态信息
function showStatus(message, type = 'info') {
    const status = document.getElementById('status');
    status.textContent = message;
    status.className = `alert alert-${type}`;
    status.style.display = 'block';
    
    if (type !== 'danger') {
        setTimeout(() => {
            status.style.display = 'none';
        }, 3000);
    }
}

// 监听storage变化
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync' && changes.bookmarkConfig) {
        const newConfig = changes.bookmarkConfig.newValue;
        if (newConfig?.sync_path) {
            updateSyncPathDisplay(newConfig.sync_path);
        }
    }
});

// 导出全局函数供其他模块使用
window.showStatus = showStatus;

// 页面加载完成后初始化UI
document.addEventListener('DOMContentLoaded', initializeUI); 