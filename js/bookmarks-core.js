// 格式化书签数据
 function formatBookmarkData(node) {
    if (!node) return null;
    
    const result = {
        id: node.id,
        title: node.title,
        dateAdded: node.dateAdded,
        type: node.url ? 'bookmark' : 'folder'
    };

    // 如果是书签，添加URL
    if (node.url) {
        result.url = node.url;
    }

    // 如果有子节点，递归处理
    if (node.children) {
        result.children = node.children
            .map(child => formatBookmarkData(child))
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

// 同步书签
async function syncBookmarks(targetFolder) {
    try {
        // 获取配置的同步路径
        const config = await chrome.storage.sync.get(['bookmarkConfig']);
        if (!config.bookmarkConfig?.sync_path) {
            throw new Error('未配置同步路径');
        }

        // 如果没有传入targetFolder，查找指定路径的书签文件夹
        if (!targetFolder) {
            targetFolder = await findBookmarkFolder(config.bookmarkConfig.sync_path);
        }
        
        try {
            // 尝试从WebDAV下载书签
            let remoteBookmarks = await downloadBookmarks();
            
            // 确保remoteBookmarks有正确的结构
            if (!remoteBookmarks) {
                // 如果WebDAV上没有数据文件，则以本地书签为准
                console.log('WebDAV上没有数据文件，将上传本地书签');
                await uploadBookmarks(targetFolder);
                return;
            }
            
            if (!remoteBookmarks.children) {
                remoteBookmarks.children = [];
            }
            
            // 获取本地书签
            const localBookmarks = formatBookmarkData(targetFolder);
            
            // 创建ID到书签的映射
            const remoteMap = new Map();
            const localMap = new Map();
            
            // 递归处理书签,构建ID映射
            function buildBookmarkMap(bookmarks, map) {
                if (!bookmarks) return;
                
                // 将所有节点（包括文件夹）都加入映射
                map.set(bookmarks.id, bookmarks);
                
                if (bookmarks.children) {
                    for (const child of bookmarks.children) {
                        buildBookmarkMap(child, map);
                    }
                }
            }

            buildBookmarkMap(remoteBookmarks, remoteMap);
            buildBookmarkMap(localBookmarks, localMap);
            
            // 处理本地新增的节点
            for (const [id, localNode] of localMap) {
                if (!remoteMap.has(id)) {
                    // 本地存在但远程不存在的节点，需要添加到远程
                    let parentNode = remoteBookmarks;
                    if (localNode.parentId) {
                        const parent = remoteMap.get(localNode.parentId);
                        if (parent) {
                            parentNode = parent;
                            if (!parentNode.children) {
                                parentNode.children = [];
                            }
                        }
                    }
                    parentNode.children.push(localNode);
                }
            }
            
            // 处理远程新增的节点
            for (const [id, remoteNode] of remoteMap) {
                if (!localMap.has(id)) {
                    // 远程存在但本地不存在的节点，需要在本地创建
                    try {
                        if (remoteNode.type === 'folder') {
                            // 创建文件夹
                            await chrome.bookmarks.create({
                                parentId: targetFolder.id,
                                title: remoteNode.title
                            });
                        } else {
                            // 创建书签
                            await chrome.bookmarks.create({
                                parentId: targetFolder.id,
                                title: remoteNode.title,
                                url: remoteNode.url
                            });
                        }
                    } catch (error) {
                        console.error(`创建节点失败: ${remoteNode.title}`, error);
                    }
                }
            }
            
            // 上传更新后的书签到WebDAV
            await uploadBookmarks(targetFolder);
            
        } catch (error) {
            if (error.message.includes('404') || error.message.includes('下载失败')) {
                // 如果是因为文件不存在导致的错误，上传本地书签
                console.log('WebDAV上没有数据文件，将上传本地书签');
                await uploadBookmarks(targetFolder);
                return;
            }
            throw error; // 其他错误继续抛出
        }
    } catch (error) {
        console.error('同步书签失败:', error);
        throw error;
    }
}

// 导出所有函数到全局对象
self.BookmarksCore = {
    formatBookmarkData,
    uploadBookmarks,
    downloadBookmarks,
    findBookmarkFolder,
    syncBookmarks
}; 