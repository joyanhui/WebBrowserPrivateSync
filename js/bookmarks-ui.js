import { syncBookmarks } from './bookmarks-core.js';

// 显示状态信息
function showStatus(message, type = 'info') {
    const status = document.getElementById('status');
    if (status) {
        status.textContent = message;
        status.className = `alert alert-${type} mt-3`;
        status.style.display = 'block';
        
        if (type !== 'danger') {
            setTimeout(() => {
                status.style.display = 'none';
            }, 3000);
        }
    }
}

// 导出书签到WebDAV
async function exportBookmarks() {
    try {
        showStatus('正在导出书签...', 'info');
        
        // 获取配置的同步路径
        const config = await chrome.storage.sync.get(['bookmarkConfig']);
        if (!config.bookmarkConfig?.sync_path) {
            throw new Error('未配置同步路径');
        }

        // 查找指定路径的书签文件夹
        const bookmarkFolder = await findBookmarkFolder(config.bookmarkConfig.sync_path);
        
        // 上传到WebDAV
        await uploadBookmarks(bookmarkFolder);
        
        showStatus('书签导出成功', 'success');
    } catch (error) {
        console.error('导出书签失败:', error);
        showStatus('导出失败: ' + error.message, 'danger');
    }
}

// 从WebDAV导入书签 (完全覆盖本地)
async function importBookmarks() {
    try {
        showStatus('正在导入书签...', 'info');
        
        // 获取配置的同步路径
        const config = await chrome.storage.sync.get(['bookmarkConfig']);
        if (!config.bookmarkConfig?.sync_path) {
            throw new Error('未配置同步路径');
        }

        // 查找指定路径的书签文件夹
        const targetFolder = await findBookmarkFolder(config.bookmarkConfig.sync_path);
        
        // 从WebDAV下载书签
        const remoteBookmarks = await downloadBookmarks();
        
        // 导入书签到指定文件夹 (会清空原有内容)
        await importToFolder(remoteBookmarks, targetFolder.id);
        
        showStatus('书签导入成功', 'success');
    } catch (error) {
        console.error('导入书签失败:', error);
        showStatus('导入失败: ' + error.message, 'danger');
    }
}

// UI同步函数
async function uiSyncBookmarks() {
    try {
        showStatus('正在同步书签...', 'info');
        await syncBookmarks();
        showStatus('书签同步成功', 'success');
    } catch (error) {
        console.error('同步书签失败:', error);
        showStatus('同步失败: ' + error.message, 'danger');
    }
}

// 初始化UI
function initializeUI() {
    // 同步按钮
    const syncBtn = document.getElementById('syncBtn');
    if (syncBtn) {
        syncBtn.addEventListener('click', uiSyncBookmarks);
    }

    // 导出按钮
    const exportBtn = document.getElementById('exportBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportBookmarks);
    }

    // 导入按钮
    const importBtn = document.getElementById('importBtn');
    if (importBtn) {
        importBtn.addEventListener('click', importBookmarks);
    }
}

// 当DOM加载完成时初始化UI
document.addEventListener('DOMContentLoaded', initializeUI); 