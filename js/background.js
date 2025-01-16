// 导入依赖
importScripts('../js/crypto-js.min.js', '../js/bookmarks-core.js');

let syncTimerId = null;
let tabsSyncTimerId = null;

// 检查是否启用了自动同步
async function isAutoSyncEnabled() {
    try {
        const { bookmarkConfig } = await chrome.storage.sync.get('bookmarkConfig');
        return bookmarkConfig?.enable_auto_sync === true;
    } catch (error) {
        console.error('检查自动同步状态失败:', error);
        return false;
    }
}

// 检查是否启用了标签页同步
async function isTabsSyncEnabled() {
    try {
        const { bookmarkConfig } = await chrome.storage.sync.get('bookmarkConfig');
        return bookmarkConfig?.enable_tabs_sync === true;
    } catch (error) {
        console.error('检查标签页同步状态失败:', error);
        return false;
    }
}

// 获取同步间隔
async function getSyncInterval() {
    try {
        const { bookmarkConfig } = await chrome.storage.sync.get('bookmarkConfig');
        return (bookmarkConfig?.sync_interval || 300) * 1000; // 转换为毫秒
    } catch (error) {
        console.error('获取同步间隔失败:', error);
        return 300000; // 默认5分钟
    }
}

// 获取标签页同步间隔
async function getTabsSyncInterval() {
    try {
        const { bookmarkConfig } = await chrome.storage.sync.get('bookmarkConfig');
        return (bookmarkConfig?.tabs_sync_interval || 30) * 1000; // 转换为毫秒
    } catch (error) {
        console.error('获取标签页同步间隔失败:', error);
        return 30000; // 默认30秒
    }
}

// 书签同步定时器
let bookmarkSyncTimer = null;

// 标签页同步定时器
let tabsSyncTimer = null;

// 启动书签同步
async function startBookmarkSync() {
    if (bookmarkSyncTimer) {
        clearInterval(bookmarkSyncTimer);
    }

    const enabled = await isAutoSyncEnabled();
    if (!enabled) {
        console.log('书签自动同步已禁用');
        return;
    }

    const interval = await getSyncInterval();
    console.log(`启动书签自动同步，间隔: ${interval/1000}秒`);
    
    bookmarkSyncTimer = setInterval(async () => {
        // 重新检查是否启用
        const stillEnabled = await isAutoSyncEnabled();
        if (!stillEnabled) {
            console.log('书签自动同步已禁用，停止同步');
            clearInterval(bookmarkSyncTimer);
            bookmarkSyncTimer = null;
            return;
        }

        try {
            // 执行同步
            await chrome.runtime.sendMessage({ action: 'syncBookmarks' });
            console.log('书签自动同步完成');
        } catch (error) {
            console.error('书签自动同步失败:', error);
        }
    }, interval);
}

// 启动标签页同步
async function startTabsSync() {
    if (tabsSyncTimer) {
        clearInterval(tabsSyncTimer);
    }

    const enabled = await isTabsSyncEnabled();
    if (!enabled) {
        console.log('标签页自动同步已禁用');
        return;
    }

    const interval = await getTabsSyncInterval();
    console.log(`启动标签页自动同步，间隔: ${interval/1000}秒`);
    
    tabsSyncTimer = setInterval(async () => {
        // 重新检查是否启用
        const stillEnabled = await isTabsSyncEnabled();
        if (!stillEnabled) {
            console.log('标签页自动同步已禁用，停止同步');
            clearInterval(tabsSyncTimer);
            tabsSyncTimer = null;
            return;
        }

        try {
            // 执行同步
            await chrome.runtime.sendMessage({ action: 'syncTabs' });
            console.log('标签页自动同步完成');
        } catch (error) {
            console.error('标签页自动同步失败:', error);
        }
    }, interval);
}

// 监听配置变更
chrome.storage.onChanged.addListener(async (changes, namespace) => {
    if (namespace === 'sync' && changes.bookmarkConfig) {
        const newConfig = changes.bookmarkConfig.newValue;
        const oldConfig = changes.bookmarkConfig.oldValue;

        // 检查书签自动同步设置是否改变
        if (newConfig?.enable_auto_sync !== oldConfig?.enable_auto_sync ||
            newConfig?.sync_interval !== oldConfig?.sync_interval) {
            console.log('书签同步配置已更改，重新启动同步服务');
            await startBookmarkSync();
        }

        // 检查标签页同步设置是否改变
        if (newConfig?.enable_tabs_sync !== oldConfig?.enable_tabs_sync ||
            newConfig?.tabs_sync_interval !== oldConfig?.tabs_sync_interval) {
            console.log('标签页同步配置已更改，重新启动同步服务');
            await startTabsSync();
        }
    }
});

// 初始化同步服务
async function initSyncServices() {
    console.log('初始化同步服务...');
    await startBookmarkSync();
    await startTabsSync();
}

// 启动服务
initSyncServices();

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

// 上传书签到WebDAV
async function uploadBookmarks(bookmarkFolder) {
    const config = await chrome.storage.sync.get(['webdavConfig', 'bookmarkConfig']);
    const { url, username, password, enable_aes, aes_key } = config.webdavConfig;
    const { database_filename, auto_backup } = config.bookmarkConfig;

    if (!url || !username || !password) {
        throw new Error('WebDAV配置不完整，请在设置中配置WebDAV信息');
    }

    // 格式化书签数据
    const bookmarksData = formatBookmarkData(bookmarkFolder);
    
    // 准备要上传的数据
    let uploadData;
    if (enable_aes && aes_key) {
        // 加密数据
        const jsonStr = JSON.stringify(bookmarksData);
        uploadData = CryptoJS.AES.encrypt(jsonStr, aes_key).toString();
    } else {
        uploadData = JSON.stringify(bookmarksData, null, 2);
    }

    // 确保URL以/结尾
    const baseUrl = url.endsWith('/') ? url : url + '/';
    
    // 上传主文件
    const response = await fetch(baseUrl + database_filename, {
        method: 'PUT',
        headers: {
            'Authorization': 'Basic ' + btoa(username + ':' + password),
            'Content-Type': 'application/json'
        },
        body: uploadData
    });

    if (!response.ok) {
        throw new Error(`上传失败: ${response.status} ${response.statusText}`);
    }

    // 如果启用了自动备份，创建备份文件
    if (auto_backup) {
        const date = new Date().toISOString().split('T')[0];
        const backupFilename = database_filename.replace('.json', '') + '.backup.' + date + '.json';
        
        const backupResponse = await fetch(baseUrl + backupFilename, {
            method: 'PUT',
            headers: {
                'Authorization': 'Basic ' + btoa(username + ':' + password),
                'Content-Type': 'application/json'
            },
            body: uploadData
        });

        if (!backupResponse.ok) {
            console.warn('创建备份失败:', backupResponse.statusText);
        }
    }
}

// 从WebDAV下载书签
async function downloadBookmarks() {
    const config = await chrome.storage.sync.get(['webdavConfig', 'bookmarkConfig']);
    const { url, username, password, enable_aes, aes_key } = config.webdavConfig;
    const { database_filename } = config.bookmarkConfig;

    if (!url || !username || !password) {
        throw new Error('WebDAV配置不完整，请在设置中配置WebDAV信息');
    }

    // 确保URL以/结尾
    const baseUrl = url.endsWith('/') ? url : url + '/';
    
    // 下载文件
    const response = await fetch(baseUrl + database_filename, {
        method: 'GET',
        headers: {
            'Authorization': 'Basic ' + btoa(username + ':' + password)
        }
    });

    if (!response.ok) {
        throw new Error(`下载失败: ${response.status} ${response.statusText}`);
    }

    const data = await response.text();
    
    try {
        if (enable_aes && aes_key) {
            // 解密数据
            const decrypted = CryptoJS.AES.decrypt(data, aes_key);
            const jsonStr = decrypted.toString(CryptoJS.enc.Utf8);
            if (!jsonStr) {
                throw new Error('解密失败：密钥错误或数据已损坏');
            }
            return JSON.parse(jsonStr);
        } else {
            return JSON.parse(data);
        }
    } catch (error) {
        throw new Error('解析书签数据失败: ' + error.message);
    }
}

// 根据路径查找书签文件夹,如果不存在则创建
async function findBookmarkFolder(path) {
    const tree = await chrome.bookmarks.getTree();
    const parts = path.split('/').filter(p => p); // 移除空字符串
    let current = tree[0];

    for (const part of parts) {
        const found = current.children?.find(node => node.title === part);
        if (!found) {
            // 如果文件夹不存在,则创建
            current = await chrome.bookmarks.create({
                parentId: current.id,
                title: part
            });
        } else {
            current = found;
        }
    }
    return current;
} 