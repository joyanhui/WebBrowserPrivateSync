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
        const bookmarkFolder = await BookmarksCore.findBookmarkFolder(config.bookmarkConfig.sync_path);
        
        // 上传到WebDAV
        await BookmarksCore.uploadBookmarks(bookmarkFolder);
        
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
        const targetFolder = await BookmarksCore.findBookmarkFolder(config.bookmarkConfig.sync_path);
        
        // 从WebDAV下载书签
        const remoteBookmarks = await BookmarksCore.downloadBookmarks();
        
        // 导入书签到指定文件夹 (会清空原有内容)
        await importToFolder(remoteBookmarks, targetFolder.id);
        
        showStatus('书签导入成功', 'success');
    } catch (error) {
        console.error('导入书签失败:', error);
        showStatus('导入失败: ' + error.message, 'danger');
    }
}

// 导入书签到指定文件夹
async function importToFolder(bookmarks, folderId) {
    // 清空目标文件夹
    const children = await chrome.bookmarks.getChildren(folderId);
    for (const child of children) {
        await chrome.bookmarks.removeTree(child.id);
    }

    // 递归创建书签
    async function createBookmarkRecursive(data, parentId) {
        if (!data) return;

        if (data.type === 'bookmark') {
            // 创建书签
            await chrome.bookmarks.create({
                parentId: parentId,
                title: data.title || '未命名书签',
                url: data.url
            });
        } else {
            // 创建文件夹
            const folder = await chrome.bookmarks.create({
                parentId: parentId,
                title: data.title || '未命名文件夹'
            });
            
            // 递归处理子项
            if (data.children) {
                for (const child of data.children) {
                    await createBookmarkRecursive(child, folder.id);
                }
            }
        }
    }

    // 导入书签
    if (bookmarks.children) {
        for (const child of bookmarks.children) {
            await createBookmarkRecursive(child, folderId);
        }
    } else {
        await createBookmarkRecursive(bookmarks, folderId);
    }
}

// 双向同步书签
async function syncBookmarks() {
    try {
        showStatus('正在同步书签...', 'info');
        
        // 获取配置的同步路径
        const config = await chrome.storage.sync.get(['bookmarkConfig']);
        if (!config.bookmarkConfig?.sync_path) {
            throw new Error('未配置同步路径');
        }

        // 查找指定路径的书签文件夹
        const targetFolder = await BookmarksCore.findBookmarkFolder(config.bookmarkConfig.sync_path);
        
        // 执行同步
        await BookmarksCore.syncBookmarks(targetFolder);
        
        showStatus('书签同步成功', 'success');
    } catch (error) {
        console.error('同步书签失败:', error);
        showStatus('同步失败: ' + error.message, 'danger');
    }
}

// 事件监听
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('syncBtn').addEventListener('click', syncBookmarks);
    document.getElementById('exportBtn').addEventListener('click', exportBookmarks);
    document.getElementById('importBtn').addEventListener('click', importBookmarks);
}); 