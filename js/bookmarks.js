// 获取指定文件夹中的书签
async function getAllBookmarks() {
    const config = await chrome.storage.sync.get('bookmarkConfig');
    const bookmarkPath = config.bookmarkConfig?.path || '/Bookmarks bar/';

    return new Promise((resolve) => {
        chrome.bookmarks.getTree(async function(bookmarkTreeNodes) {
            // 根据路径查找指定文件夹
            function findFolderByPath(nodes, path) {
                const parts = path.split('/').filter(p => p);
                
                // 从根节点开始查找
                let current = nodes[0]; // 获取第一个根节点

                // 遍历路径的每一部分
                for (const part of parts) {
                    if (!current || !current.children) {
                        console.log('Path part not found:', part);
                        return null;
                    }

                    // 在当前层级的children中查找匹配的文件夹
                    current = current.children.find(node => node.title === part);
                    
                    if (!current) {
                        console.log('Folder not found:', part);
                        return null;
                    }
                }

                return current;
            }

            // 将书签数据转换为适合导出的格式
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

            // 添加调试日志
            console.log('Looking for path:', bookmarkPath);
            console.log('Bookmark tree:', bookmarkTreeNodes);

            const targetFolder = findFolderByPath(bookmarkTreeNodes, bookmarkPath);
            
            // 添加调试日志
            console.log('Found folder:', targetFolder);

            if (targetFolder) {
                const formattedData = formatBookmarkData(targetFolder);
                resolve(formattedData);
            } else {
                console.warn('Bookmark folder not found:', bookmarkPath);
                resolve(null);
            }
        });
    });
}

// 上传到WebDAV
async function uploadToWebDAV(bookmarksData) {
    try {
        // 从storage中获取WebDAV配置
        const data = await chrome.storage.sync.get('webdavConfig');
        const config = data.webdavConfig;
        
        if (!config || !config.url || !config.username || !config.password) {
            throw new Error('WebDAV配置不完整，请在设置中配置WebDAV信息');
        }

        // 确保URL以/结尾
        const baseUrl = config.url.endsWith('/') ? config.url : config.url + '/';
        const url = baseUrl + 'bookmarks.json';

        const headers = new Headers({
            'Authorization': 'Basic ' + btoa(config.username + ':' + config.password),
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache'
        });

        const response = await fetch(url, {
            method: 'PUT',
            headers: headers,
            body: JSON.stringify(bookmarksData, null, 2),
            mode: 'cors',
            credentials: 'include'
        });

        if (response.ok) {
            showStatus('书签已成功上传到WebDAV', 'success');
        } else {
            throw new Error(`HTTP错误: ${response.status} ${response.statusText}`);
        }
    } catch (error) {
        console.error('上传错误:', error);
        if (error.message.includes('Failed to fetch')) {
            showStatus('连接WebDAV服务器失败，请检查：\n1. WebDAV地址是否正确\n2. 用户名密码是否正确\n3. 服务器是否允许跨域访问', 'danger');
        } else {
            showStatus('上传错误: ' + error.message, 'danger');
        }
    }
}

// 显示状态信息
function showStatus(message, type) {
    const statusDiv = document.getElementById('status');
    statusDiv.textContent = message;
    statusDiv.className = `alert alert-${type}`;
    statusDiv.style.display = 'block';
    
    // 如果是错误消息，保持显示
    if (type !== 'success') {
        return;
    }
    
    // 如果是成功消息，3秒后自动隐藏
    setTimeout(() => {
        statusDiv.style.display = 'none';
    }, 3000);
}

// 从WebDAV下载书签
async function downloadFromWebDAV() {
    try {
        const data = await chrome.storage.sync.get('webdavConfig');
        const config = data.webdavConfig;
        
        if (!config || !config.url || !config.username || !config.password) {
            throw new Error('WebDAV配置不完整，请在设置中配置WebDAV信息');
        }

        // 确保URL以/结尾
        const baseUrl = config.url.endsWith('/') ? config.url : config.url + '/';
        const url = baseUrl + 'bookmarks.json';

        console.log('开始从WebDAV下载书签:', url);

        const headers = new Headers({
            'Authorization': 'Basic ' + btoa(config.username + ':' + config.password),
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache'
        });

        const response = await fetch(url, {
            method: 'GET',
            headers: headers,
            mode: 'cors',
            credentials: 'include'
        });

        if (!response.ok) {
            throw new Error(`HTTP错误: ${response.status} ${response.statusText}`);
        }

        const bookmarksData = await response.json();
        
        // 验证数据格式
        if (!bookmarksData) {
            throw new Error('从WebDAV获取的书签数据为空');
        }

        console.log('成功获取书签数据:', bookmarksData);

        // 验证数据结构
        if (!bookmarksData.children && !bookmarksData.url && !bookmarksData.title) {
            throw new Error('无效的书签数据格式');
        }

        await importBookmarks(bookmarksData);
        showStatus('书签已成功从WebDAV导入', 'success');
    } catch (error) {
        console.error('下载错误:', error);
        if (error.message.includes('Failed to fetch')) {
            showStatus('连接WebDAV服务器失败，请检查：\n1. WebDAV地址是否正确\n2. 用户名密码是否正确\n3. 服务器是否允许跨域访问', 'danger');
        } else {
            showStatus('下载错误: ' + error.message, 'danger');
        }
        throw error; // 继续抛出错误，让调用者知道发生了错误
    }
}

// 导入书签到本地
async function importBookmarks(bookmarksData) {
    if (!bookmarksData) {
        throw new Error('书签数据为空');
    }

    console.log('开始导入书签数据:', bookmarksData);

    const config = await chrome.storage.sync.get('bookmarkConfig');
    const targetPath = config.bookmarkConfig?.path || '/Bookmarks bar/';
    
    console.log('目标路径:', targetPath);
    
    // 获取目标文件夹ID
    const targetFolderId = await getOrCreateFolderByPath(targetPath);
    if (!targetFolderId) {
        throw new Error('无法创建或找到目标文件夹');
    }

    console.log('目标文件夹ID:', targetFolderId);

    // 递归创建书签
    async function createBookmarkRecursive(data, parentId) {
        if (!data) {
            console.warn('跳过空的书签数据');
            return;
        }

        console.log('处理书签数据:', data);

        if (data.url) {
            // 创建书签
            console.log('创建书签:', data.title, data.url);
            await chrome.bookmarks.create({
                parentId: parentId,
                title: data.title || '未命名书签',
                url: data.url
            });
        } else if (data.children && Array.isArray(data.children)) {
            // 创建文件夹
            console.log('创建文件夹:', data.title);
            const folder = await chrome.bookmarks.create({
                parentId: parentId,
                title: data.title || '未命名文件夹'
            });
            
            // 递归处理子项
            for (const child of data.children) {
                await createBookmarkRecursive(child, folder.id);
            }
        } else {
            console.warn('跳过无效的书签数据:', data);
        }
    }

    try {
        // 清空目标文件夹
        console.log('清空目标文件夹');
        const children = await chrome.bookmarks.getChildren(targetFolderId);
        for (const child of children) {
            await chrome.bookmarks.removeTree(child.id);
        }

        // 导入新的书签
        if (bookmarksData.children && Array.isArray(bookmarksData.children)) {
            console.log('开始导入子项，数量:', bookmarksData.children.length);
            for (const child of bookmarksData.children) {
                await createBookmarkRecursive(child, targetFolderId);
            }
        } else if (bookmarksData.url || bookmarksData.title) {
            // 处理单个书签或文件夹的情况
            console.log('导入单个书签或文件夹');
            await createBookmarkRecursive(bookmarksData, targetFolderId);
        } else {
            throw new Error('无效的书签数据格式');
        }
    } catch (error) {
        console.error('导入过程中出错:', error);
        throw error;
    }
}

// 根据路径获取或创建文件夹
async function getOrCreateFolderByPath(path) {
    const parts = path.split('/').filter(p => p);
    
    // 获取书签树
    const tree = await chrome.bookmarks.getTree();
    let current = tree[0]; // 根节点

    // 遍历路径的每一部分
    for (const part of parts) {
        // 在当前层级查找匹配的文件夹
        let found = false;
        if (current.children) {
            for (const child of current.children) {
                if (child.title === part) {
                    current = child;
                    found = true;
                    break;
                }
            }
        }

        // 如果没找到，创建新文件夹
        if (!found) {
            current = await chrome.bookmarks.create({
                parentId: current.id,
                title: part
            });
        }
    }

    return current.id;
}

// 添加事件监听器
document.addEventListener('DOMContentLoaded', () => {
    // 导出按钮
    document.getElementById('exportBtn').addEventListener('click', async () => {
        const btn = document.getElementById('exportBtn');
        try {
            btn.disabled = true;
            btn.querySelector('.sync-direction').textContent = '正在导出...';
            
            const bookmarks = await getAllBookmarks();
            if (!bookmarks) {
                throw new Error('未找到书签文件夹');
            }
            await uploadToWebDAV(bookmarks);
        } catch (error) {
            console.error('导出失败:', error);
            showStatus('导出失败: ' + error.message, 'danger');
        } finally {
            btn.disabled = false;
            btn.querySelector('.sync-direction').textContent = '本地 → WebDAV';
        }
    });

    // 导入按钮
    document.getElementById('importBtn').addEventListener('click', async () => {
        const btn = document.getElementById('importBtn');
        try {
            if (!confirm('这将覆盖本地对应文件夹中的所有书签，确定要继续吗？')) {
                return;
            }
            
            btn.disabled = true;
            btn.querySelector('.sync-direction').textContent = '正在导入...';
            
            await downloadFromWebDAV();
        } catch (error) {
            console.error('导入失败:', error);
            // downloadFromWebDAV 已经处理了状态显示，这里不需要重复
        } finally {
            btn.disabled = false;
            btn.querySelector('.sync-direction').textContent = 'WebDAV → 本地';
        }
    });

    // 加载同步路径
    loadSyncPath();
});