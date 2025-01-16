// 导入依赖
importScripts('../js/crypto-js.min.js', '../js/bookmarks-core.js');

let syncTimerId = null;
let tabsSyncTimerId = null;

// 检查并启动自动同步
async function checkAndStartAutoSync() {
    try {
        // 清理现有的定时器
        if (syncTimerId) {
            clearInterval(syncTimerId);
            syncTimerId = null;
        }
        if (tabsSyncTimerId) {
            clearInterval(tabsSyncTimerId);
            tabsSyncTimerId = null;
        }

        const config = await chrome.storage.sync.get(['bookmarkConfig']);
        if (!config.bookmarkConfig) return;

        // 启动书签自动同步
        if (config.bookmarkConfig.enable_auto_sync) {
            const interval = Math.max(30, config.bookmarkConfig.sync_interval || 300) * 1000;
            syncTimerId = setInterval(async () => {
                try {
                    if (!config.bookmarkConfig?.sync_path) {
                        console.warn('未配置同步路径');
                        return;
                    }

                    const targetFolder = await BookmarksCore.findBookmarkFolder(config.bookmarkConfig.sync_path);
                    await BookmarksCore.syncBookmarks(targetFolder);
                    console.log('书签同步成功');
                } catch (error) {
                    console.error('自动同步书签失败:', error);
                }
            }, interval);
        }

        // 启动标签页自动同步
        if (config.bookmarkConfig.enable_tabs_sync) {
            const interval = Math.max(30, config.bookmarkConfig.tabs_sync_interval || 30) * 1000;
            tabsSyncTimerId = setInterval(async () => {
                try {
                    await syncTabs();
                } catch (error) {
                    console.error('自动同步标签页失败:', error);
                }
            }, interval);
        }
    } catch (error) {
        console.error('启动自动同步失败:', error);
    }
}

// 同步标签页
async function syncTabs() {
    try {
        const config = await chrome.storage.sync.get(['webdavConfig', 'bookmarkConfig']);
        if (!config.webdavConfig?.url || !config.bookmarkConfig?.device_name) {
            console.warn('WebDAV配置或设备名未设置');
            return;
        }

        // 获取当前所有标签页
        const tabs = await chrome.tabs.query({});
        const tabsData = tabs.map(tab => ({
            url: tab.url,
            title: tab.title,
            favIconUrl: tab.favIconUrl
        }));

        // 准备要上传的数据
        const uploadData = {
            device_name: config.bookmarkConfig.device_name,
            tabs: tabsData,
            last_sync: new Date().toISOString()
        };

        // 加密数据（如果启用）
        let finalData;
        if (config.webdavConfig.enable_aes && config.webdavConfig.aes_key) {
            const jsonStr = JSON.stringify(uploadData);
            finalData = CryptoJS.AES.encrypt(jsonStr, config.webdavConfig.aes_key).toString();
        } else {
            finalData = JSON.stringify(uploadData, null, 2);
        }

        // 确保URL以/结尾
        const baseUrl = config.webdavConfig.url.replace(/\/$/, '');
        const filename = `tabs.${config.bookmarkConfig.device_name}.json`;
        
        // 上传到WebDAV
        const response = await fetch(`${baseUrl}/${filename}`, {
            method: 'PUT',
            headers: {
                'Authorization': 'Basic ' + btoa(`${config.webdavConfig.username}:${config.webdavConfig.password}`),
                'Content-Type': 'application/json'
            },
            body: finalData
        });

        if (!response.ok) {
            throw new Error(`上传失败: ${response.status} ${response.statusText}`);
        }

        console.log('标签页同步成功');
    } catch (error) {
        console.error('同步标签页失败:', error);
        throw error;
    }
}

// 监听配置变更
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync' && changes.bookmarkConfig) {
        checkAndStartAutoSync();
    }
});

// 初始化时检查自动同步设置
checkAndStartAutoSync();

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