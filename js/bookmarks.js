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

// 根据路径查找书签文件夹
async function findBookmarkFolder(path) {
    const tree = await chrome.bookmarks.getTree();
    const parts = path.split('/').filter(p => p); // 移除空字符串
    let current = tree[0];

    for (const part of parts) {
        const found = current.children?.find(node => node.title === part);
        if (!found) {
            throw new Error(`找不到书签文件夹: ${path}`);
        }
        current = found;
    }
    return current;
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

// 从WebDAV导入书签
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
        const bookmarks = await downloadBookmarks();
        
        // 导入书签到指定文件夹
        await importToFolder(bookmarks, targetFolder.id);
        
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

        if (data.url) {
            // 创建书签
            await chrome.bookmarks.create({
                parentId: parentId,
                title: data.title || '未命名书签',
                url: data.url
            });
        } else if (data.children) {
            // 创建文件夹
            const folder = await chrome.bookmarks.create({
                parentId: parentId,
                title: data.title || '未命名文件夹'
            });
            
            // 递归处理子项
            for (const child of data.children) {
                await createBookmarkRecursive(child, folder.id);
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

// 监听导出事件
document.addEventListener('bookmarkExport', exportBookmarks);

// 监听导入事件
document.addEventListener('bookmarkImport', importBookmarks);