// 保存选项到 chrome.storage
function save_options() {
    const webdav_url = document.getElementById('webdav_url').value;
    const webdav_username = document.getElementById('webdav_username').value;
    const webdav_password = document.getElementById('webdav_password').value;
    const bookmarkPath = document.getElementById('selected-path').textContent.trim();

    chrome.storage.sync.set({
        webdavConfig: {
            url: webdav_url,
            username: webdav_username,
            password: webdav_password
        },
        bookmarkConfig: {
            path: bookmarkPath
        }
    }, function() {
        console.log('设置已保存，bookmarkPath:', bookmarkPath);
        const status = document.getElementById('status');
        status.textContent = '设置已保存';
        status.className = 'alert alert-success mt-3';
        status.style.display = 'block';
        setTimeout(function() {
            status.style.display = 'none';
        }, 2000);
    });
}

// 从 chrome.storage 恢复选项
function restore_options() {
    chrome.storage.sync.get({
        webdavConfig: {
            url: '',
            username: '',
            password: ''
        },
        bookmarkConfig: {
            path: '/Bookmarks bar/'
        }
    }, function(items) {
        document.getElementById('webdav_url').value = items.webdavConfig.url;
        document.getElementById('webdav_username').value = items.webdavConfig.username;
        document.getElementById('webdav_password').value = items.webdavConfig.password;
        document.getElementById('selected-path').textContent = items.bookmarkConfig.path;
    });
}

// 导出配置到TOML文件
async function exportConfig() {
    try {
        const config = await chrome.storage.sync.get(['webdavConfig', 'bookmarkConfig']);
        
        // 构建TOML格式的配置
        const toml = `# WebBrowserPrivateSync Configuration
# Generated at ${new Date().toISOString()}

[webdav]
url = "${config.webdavConfig?.url || ''}"
username = "${config.webdavConfig?.username || ''}"
password = "${config.webdavConfig?.password || ''}"

[bookmarks]
path = "${config.bookmarkConfig?.path || '/Bookmarks bar/'}"
`;
        
        // 创建Blob并下载
        const blob = new Blob([toml], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'WebBrowserPrivateSync-setting.toml';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        const status = document.getElementById('status');
        status.textContent = '配置已成功导出';
        status.className = 'alert alert-success mt-3';
        status.style.display = 'block';
        setTimeout(() => {
            status.style.display = 'none';
        }, 2000);
    } catch (error) {
        console.error('导出配置失败:', error);
        const status = document.getElementById('status');
        status.textContent = '导出配置失败: ' + error.message;
        status.className = 'alert alert-danger mt-3';
        status.style.display = 'block';
    }
}

// 从TOML文件导入配置
async function importConfig(file) {
    try {
        const text = await file.text();
        
        // 解析TOML格式（简单实现，仅支持基本格式）
        const config = {
            webdavConfig: {},
            bookmarkConfig: {}
        };
        
        let currentSection = '';
        const lines = text.split('\n');
        
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            
            if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
                currentSection = trimmed.slice(1, -1);
                continue;
            }
            
            const match = trimmed.match(/^(\w+)\s*=\s*"([^"]*)"$/);
            if (match) {
                const [, key, value] = match;
                if (currentSection === 'webdav') {
                    config.webdavConfig[key] = value;
                } else if (currentSection === 'bookmarks') {
                    config.bookmarkConfig[key] = value;
                }
            }
        }
        
        // 验证必要的字段
        if (!config.webdavConfig.url) {
            throw new Error('配置文件缺少WebDAV URL');
        }
        
        // 保存配置
        await chrome.storage.sync.set(config);
        
        // 更新界面
        document.getElementById('webdav_url').value = config.webdavConfig.url;
        document.getElementById('webdav_username').value = config.webdavConfig.username;
        document.getElementById('webdav_password').value = config.webdavConfig.password;
        document.getElementById('selected-path').textContent = config.bookmarkConfig.path;
        
        const status = document.getElementById('status');
        status.textContent = '配置已成功导入';
        status.className = 'alert alert-success mt-3';
        status.style.display = 'block';
        setTimeout(() => {
            status.style.display = 'none';
        }, 2000);
    } catch (error) {
        console.error('导入配置失败:', error);
        const status = document.getElementById('status');
        status.textContent = '导入配置失败: ' + error.message;
        status.className = 'alert alert-danger mt-3';
        status.style.display = 'block';
    }
}

// 选择书签文件夹
async function selectBookmarkFolder() {
    try {
        const bookmarkTree = await chrome.bookmarks.getTree();
        
        // 创建一个新窗口来显示书签选择器
        const selectWindow = window.open('', 'Select Bookmark Folder', 
            'width=400,height=600,menubar=no,toolbar=no,location=no,status=no');
        
        selectWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Select Bookmark Folder</title>
                <link href="css/bootstrap5.3.3.min.css" rel="stylesheet">
                <style>
                    .folder-item {
                        padding: 8px;
                        cursor: pointer;
                        border-radius: 4px;
                    }
                    .folder-item:hover {
                        background-color: #f0f0f0;
                    }
                    .folder-list {
                        margin-left: 20px;
                    }
                </style>
            </head>
            <body class="p-3">
                <h5>Select Bookmark Folder</h5>
                <div id="folder-tree"></div>
            </body>
            </html>
        `);

        // 递归构建路径映射
        const pathMap = new Map();
        function buildPathMap(node, parentPath = '') {
            if (node.children) {
                let currentPath;
                if (node.title) {
                    // 如果有标题，则添加到路径中
                    currentPath = parentPath ? `${parentPath}/${node.title}` : `/${node.title}`;
                    pathMap.set(node.id, currentPath);
                } else {
                    // 根节点没有标题，保持parentPath不变
                    currentPath = parentPath;
                }
                
                // 递归处理子节点
                node.children.forEach(child => buildPathMap(child, currentPath));
            }
        }

        // 只处理第一个根节点的子节点，避免重复的书签栏
        buildPathMap(bookmarkTree[0]);

        // 递归渲染书签文件夹树
        function renderBookmarkFolder(node, container) {
            if (node.children) {
                const div = document.createElement('div');
                if (node.title) {
                    const folderDiv = selectWindow.document.createElement('div');
                    folderDiv.className = 'folder-item';
                    folderDiv.textContent = node.title;
                    folderDiv.onclick = () => {
                        const fullPath = pathMap.get(node.id);
                        document.getElementById('selected-path').textContent = fullPath;
                        selectWindow.close();
                    };
                    div.appendChild(folderDiv);
                }
                const childrenDiv = selectWindow.document.createElement('div');
                childrenDiv.className = 'folder-list';
                node.children.forEach(child => {
                    if (child.children) { // 只显示文件夹
                        renderBookmarkFolder(child, childrenDiv);
                    }
                });
                div.appendChild(childrenDiv);
                container.appendChild(div);
            }
        }

        const folderTree = selectWindow.document.getElementById('folder-tree');
        renderBookmarkFolder(bookmarkTree[0], folderTree);
    } catch (error) {
        console.error('Error selecting bookmark folder:', error);
    }
}

// 初始化事件监听
document.addEventListener('DOMContentLoaded', () => {
    // 恢复保存的选项
    restore_options();
    
    // 保存按钮
    document.getElementById('save').addEventListener('click', save_options);
    
    // 选择文件夹按钮
    document.getElementById('select-folder').addEventListener('click', selectBookmarkFolder);
    
    // 导出配置
    document.getElementById('export-config').addEventListener('click', exportConfig);
    
    // 导入配置
    document.getElementById('import-config').addEventListener('click', () => {
        document.getElementById('config-file-input').click();
    });
    
    document.getElementById('config-file-input').addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            importConfig(file);
        }
        event.target.value = ''; // 清除选择，允许重复选择同一个文件
    });
}); 