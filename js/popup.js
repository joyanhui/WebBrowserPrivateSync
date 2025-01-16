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
            'Authorization': 'Basic ' + btoa(this.config.username + ':' + this.config.password),
            'Content-Type': 'application/xml; charset=utf-8',
            'Depth': '1'
        });

        const response = await fetch(fullUrl, {
            method: method,
            headers: headers,
            body: body
        });

        if (!response.ok) {
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

// 初始化
async function init() {
    const data = await chrome.storage.sync.get('webdavConfig');
    if (!data.webdavConfig) {
        chrome.runtime.openOptionsPage();
        window.close(); // 关闭popup窗口
        return;
    }

    webdavClient = new WebDAVClient(data.webdavConfig);
    await loadFileList();
}

async function loadFileList() {
    const fileList = document.getElementById('file-list');
    fileList.innerHTML = '';
    
    try {
        const files = await webdavClient.listFiles();
        files.forEach(file => {
            const div = document.createElement('div');
            div.className = 'file-item';
            div.textContent = file.split('/').pop();
            div.addEventListener('click', () => loadFile(file));
            fileList.appendChild(div);
        });
    } catch (error) {
        alert('加载文件列表失败: ' + error.message);
    }
}

async function loadFile(path) {
    try {
        const content = await webdavClient.getFile(path);
        document.getElementById('filename').value = path.split('/').pop().replace(/\.md$/i, '');
        document.getElementById('markdown-editor').value = content;
        currentFile = path;
    } catch (error) {
        alert('加载文件失败: ' + error.message);
    }
}

// 事件监听器
document.getElementById('save').addEventListener('click', async () => {
    let filename = document.getElementById('filename').value.trim();
    const content = document.getElementById('markdown-editor').value;
    
    if (!filename) {
        alert('请输入文件名');
        return;
    }

    // 移除可能存在的.md后缀，然后重新添加
    filename = filename.replace(/\.md$/i, '') + '.md';

    try {
        const path = currentFile || '/' + filename;
        await webdavClient.saveFile(path, content);
        await loadFileList();
        alert('保存成功');
    } catch (error) {
        alert('保存失败: ' + error.message);
    }
});

document.getElementById('delete').addEventListener('click', async () => {
    if (!currentFile) {
        alert('请先选择文件');
        return;
    }

    if (confirm('确定要删除这个文件吗？')) {
        try {
            await webdavClient.deleteFile(currentFile);
            await loadFileList();
            document.getElementById('filename').value = '';
            document.getElementById('markdown-editor').value = '';
            currentFile = null;
            alert('删除成功');
        } catch (error) {
            alert('删除失败: ' + error.message);
        }
    }
});

document.getElementById('new-file').addEventListener('click', () => {
    document.getElementById('filename').value = '';
    document.getElementById('markdown-editor').value = '';
    currentFile = null;
});

// 打开选项页面
document.getElementById('open-options').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
});

document.getElementById('open-bookmarks').addEventListener('click', function() {
    chrome.tabs.create({
        url: chrome.runtime.getURL('bookmarks.html')
    });
});

// 初始化应用
init(); 