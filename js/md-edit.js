class WebDAVClient {
    constructor(config) {
        this.config = {
            ...config,
            url: config.url.replace(/\/$/, '')
        };
        // 提取基础路径，用于后续处理
        const url = new URL(this.config.url);
        this.basePath = url.pathname;
    }

    async request(method, path, body = null) {
        let fullUrl;
        if (path.includes(this.basePath)) {
            // 如果路径已经包含基础路径，直接使用URL的origin
            const url = new URL(this.config.url);
            fullUrl = url.origin + path;
        } else {
            // 否则拼接完整路径
            const normalizedPath = path.startsWith('/') ? path : '/' + path;
            fullUrl = this.config.url + normalizedPath;
        }

        const headers = new Headers({
            'Authorization': 'Basic ' + btoa(this.config.username + ':' + this.config.password)
        });

        // 根据请求类型设置不同的Content-Type
        if (method === 'PROPFIND') {
            headers.set('Content-Type', 'application/xml; charset=utf-8');
            headers.set('Depth', '1');
        } else if (method === 'PUT') {
            headers.set('Content-Type', 'text/markdown; charset=utf-8');
        }

        const response = await fetch(fullUrl, {
            method: method,
            headers: headers,
            body: body
        });

        if (!response.ok && !(method === 'PROPFIND' && response.status === 207)) {
            throw new Error(`WebDAV请求失败: ${response.status}`);
        }

        return response;
    }

    async listFiles() {
        const propfindXML = `<?xml version="1.0" encoding="utf-8" ?>
            <D:propfind xmlns:D="DAV:">
                <D:prop>
                    <D:resourcetype/>
                    <D:getcontenttype/>
                    <D:getcontentlength/>
                    <D:getlastmodified/>
                </D:prop>
            </D:propfind>`;
            
        const response = await this.request('PROPFIND', '/', propfindXML);
        const text = await response.text();
        // 解析XML响应获取文件列表
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'text/xml');
        const files = [];
        const responses = doc.getElementsByTagNameNS('DAV:', 'response');
        
        for (const response of responses) {
            const href = response.getElementsByTagNameNS('DAV:', 'href')[0].textContent;
            if (href.endsWith('.md')) {
                files.push(href);
            }
        }
        
        return files;
    }

    async getFile(path) {
        const response = await this.request('GET', path);
        return await response.text();
    }

    async saveFile(path, content) {
        await this.request('PUT', path, content);
    }

    async deleteFile(path) {
        await this.request('DELETE', path);
    }
}

let webdavClient = null;
let currentFile = null;

// 显示状态信息
function showStatus(message, type = 'info') {
    const status = document.getElementById('status');
    if (status) {
        status.textContent = message;
        status.className = `alert alert-${type}`;
        status.style.display = 'block';
        
        if (type !== 'danger') {
            setTimeout(() => {
                status.style.display = 'none';
            }, 3000);
        }
    }
}

// 初始化
async function init() {
    try {
        const data = await chrome.storage.sync.get('webdavConfig');
        if (!data.webdavConfig?.url || !data.webdavConfig?.username || !data.webdavConfig?.password) {
            showStatus('请先在设置中配置WebDAV服务', 'warning');
            return;
        }

        webdavClient = new WebDAVClient(data.webdavConfig);
        await loadFileList();
    } catch (error) {
        console.error('初始化失败:', error);
        showStatus('初始化失败: ' + error.message, 'danger');
    }
}

async function loadFileList() {
    const fileList = document.getElementById('file-list');
    if (!fileList) return;
    
    fileList.innerHTML = '';
    
    try {
        const files = await webdavClient.listFiles();
        if (files.length === 0) {
            const div = document.createElement('div');
            div.className = 'text-muted p-3';
            div.textContent = '暂无Markdown文件';
            fileList.appendChild(div);
            return;
        }

        files.forEach(file => {
            const div = document.createElement('div');
            div.className = 'file-item';
            div.textContent = file.split('/').pop();
            div.addEventListener('click', () => loadFile(file));
            fileList.appendChild(div);
        });
    } catch (error) {
        console.error('加载文件列表失败:', error);
        showStatus('加载文件列表失败: ' + error.message, 'danger');
    }
}

async function loadFile(path) {
    try {
        const content = await webdavClient.getFile(path);
        const filename = document.getElementById('filename');
        const editor = document.getElementById('markdown-editor');
        
        if (filename && editor) {
            filename.value = path.split('/').pop().replace(/\.md$/i, '');
            editor.value = content;
            currentFile = path;
        }
    } catch (error) {
        console.error('加载文件失败:', error);
        showStatus('加载文件失败: ' + error.message, 'danger');
    }
}

// 等待DOM加载完成后再添加事件监听器
document.addEventListener('DOMContentLoaded', () => {
    // 保存按钮事件
    const saveButton = document.getElementById('save');
    if (saveButton) {
        saveButton.addEventListener('click', async () => {
            const filename = document.getElementById('filename')?.value.trim();
            const content = document.getElementById('markdown-editor')?.value;
            
            if (!filename) {
                showStatus('请输入文件名', 'warning');
                return;
            }

            if (!webdavClient) {
                showStatus('WebDAV客户端未初始化', 'danger');
                return;
            }

            try {
                const normalizedFilename = filename.replace(/\.md$/i, '') + '.md';
                const path = currentFile || '/' + normalizedFilename;
                await webdavClient.saveFile(path, content);
                await loadFileList();
                showStatus('保存成功', 'success');
            } catch (error) {
                console.error('保存失败:', error);
                showStatus('保存失败: ' + error.message, 'danger');
            }
        });
    }

    // 删除按钮事件
    const deleteButton = document.getElementById('delete');
    if (deleteButton) {
        deleteButton.addEventListener('click', async () => {
            if (!currentFile) {
                showStatus('请先选择文件', 'warning');
                return;
            }

            if (confirm('确定要删除这个文件吗？')) {
                try {
                    await webdavClient.deleteFile(currentFile);
                    await loadFileList();
                    
                    const filename = document.getElementById('filename');
                    const editor = document.getElementById('markdown-editor');
                    if (filename && editor) {
                        filename.value = '';
                        editor.value = '';
                    }
                    
                    currentFile = null;
                    showStatus('删除成功', 'success');
                } catch (error) {
                    console.error('删除失败:', error);
                    showStatus('删除失败: ' + error.message, 'danger');
                }
            }
        });
    }

    // 新建文件按钮事件
    const newFileButton = document.getElementById('new-file');
    if (newFileButton) {
        newFileButton.addEventListener('click', () => {
            const filename = document.getElementById('filename');
            const editor = document.getElementById('markdown-editor');
            if (filename && editor) {
                filename.value = '';
                editor.value = '';
            }
            currentFile = null;
        });
    }

    // 初始化应用
    init();
}); 