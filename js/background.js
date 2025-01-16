// 自动同步定时器ID
let syncTimerId = null;

// 执行同步
async function performSync() {
    try {
        // 获取配置
        const config = await chrome.storage.sync.get(['bookmarkConfig', 'webdavConfig']);
        if (!config.bookmarkConfig?.sync_path) {
            throw new Error('未配置同步路径');
        }

        // 查找指定路径的书签文件夹
        const tree = await chrome.bookmarks.getTree();
        const parts = config.bookmarkConfig.sync_path.split('/').filter(p => p);
        let current = tree[0];

        for (const part of parts) {
            const found = current.children?.find(node => node.title === part);
            if (!found) {
                current = await chrome.bookmarks.create({
                    parentId: current.id,
                    title: part
                });
            } else {
                current = found;
            }
        }

        // 格式化书签数据
        function formatBookmarkData(node) {
            if (!node) return null;
            const result = {
                title: node.title,
                url: node.url,
                dateAdded: node.dateAdded,
                id: node.id
            };
            if (node.children) {
                result.children = node.children.map(child => formatBookmarkData(child))
                    .filter(item => item !== null);
            }
            return result;
        }

        // 上传书签数据
        const bookmarksData = formatBookmarkData(current);
        let uploadData;
        if (config.webdavConfig.enable_aes && config.webdavConfig.aes_key) {
            const jsonStr = JSON.stringify(bookmarksData);
            uploadData = CryptoJS.AES.encrypt(jsonStr, config.webdavConfig.aes_key).toString();
        } else {
            uploadData = JSON.stringify(bookmarksData, null, 2);
        }

        // 确保URL以/结尾
        const baseUrl = config.webdavConfig.url.endsWith('/') ? config.webdavConfig.url : config.webdavConfig.url + '/';
        
        // 上传到WebDAV
        const response = await fetch(baseUrl + config.bookmarkConfig.database_filename, {
            method: 'PUT',
            headers: {
                'Authorization': 'Basic ' + btoa(config.webdavConfig.username + ':' + config.webdavConfig.password),
                'Content-Type': 'application/json'
            },
            body: uploadData
        });

        if (!response.ok) {
            throw new Error(`上传失败: ${response.status} ${response.statusText}`);
        }

        console.log('自动同步成功');
    } catch (error) {
        console.error('自动同步失败:', error);
    }
}

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

    // 立即执行一次同步
    await performSync();

    // 设置定时器
    const interval = Math.max(30, config.bookmarkConfig.sync_interval || 300) * 1000; // 转换为毫秒
    syncTimerId = setInterval(performSync, interval);
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