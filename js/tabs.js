// WebDAV操作相关函数
async function getWebDAVClient() {
    const config = await new Promise(resolve => {
        chrome.storage.sync.get(['webdavConfig'], resolve);
    });
    
    if (!config.webdavConfig || !config.webdavConfig.url) {
        throw new Error('WebDAV配置未设置');
    }
    
    return {
        baseUrl: config.webdavConfig.url.replace(/\/$/, ''),
        auth: btoa(`${config.webdavConfig.username}:${config.webdavConfig.password}`),
        enableAes: config.webdavConfig.enable_aes,
        aesKey: config.webdavConfig.aes_key
    };
}

async function listTabFiles() {
    const client = await getWebDAVClient();
    const response = await fetch(`${client.baseUrl}/`, {
        method: 'PROPFIND',
        headers: {
            'Authorization': `Basic ${client.auth}`,
            'Depth': '1'
        }
    });

    if (!response.ok) {
        throw new Error('无法列出WebDAV文件');
    }

    const text = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'text/xml');
    const responses = doc.getElementsByTagNameNS('DAV:', 'response');
    
    const tabFiles = [];
    for (const resp of responses) {
        const href = resp.getElementsByTagNameNS('DAV:', 'href')[0].textContent;
        const filename = decodeURIComponent(href.split('/').pop());
        
        if (filename.startsWith('tabs.') && filename.endsWith('.json')) {
            const deviceName = filename.replace(/^tabs\./, '').replace(/\.json$/, '');
            const lastModified = resp.getElementsByTagNameNS('DAV:', 'getlastmodified')[0].textContent;
            tabFiles.push({
                filename,
                deviceName,
                lastModified: new Date(lastModified)
            });
        }
    }
    
    return tabFiles;
}

async function downloadTabFile(filename) {
    const client = await getWebDAVClient();
    const response = await fetch(`${client.baseUrl}/${filename}`, {
        headers: {
            'Authorization': `Basic ${client.auth}`
        }
    });

    if (!response.ok) {
        throw new Error(`无法下载文件: ${filename}`);
    }

    let data = await response.text();
    
    // 如果启用了AES加密，解密数据
    if (client.enableAes && client.aesKey) {
        try {
            const decrypted = CryptoJS.AES.decrypt(data, client.aesKey);
            data = decrypted.toString(CryptoJS.enc.Utf8);
        } catch (error) {
            throw new Error('解密失败：' + error.message);
        }
    }
    
    return JSON.parse(data);
}

async function deleteTabFile(filename) {
    const client = await getWebDAVClient();
    const response = await fetch(`${client.baseUrl}/${filename}`, {
        method: 'DELETE',
        headers: {
            'Authorization': `Basic ${client.auth}`
        }
    });

    if (!response.ok) {
        throw new Error(`无法删除文件: ${filename}`);
    }
}

// UI相关函数
function showStatus(message, type = 'info') {
    const status = document.getElementById('status');
    status.textContent = message;
    status.className = `alert alert-${type} status`;
    status.style.display = 'block';
    
    if (type !== 'danger') {
        setTimeout(() => {
            status.style.display = 'none';
        }, 3000);
    }
}

function formatDate(date) {
    return new Intl.DateTimeFormat('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    }).format(date);
}

async function loadDevices() {
    try {
        const tabFiles = await listTabFiles();
        const select = document.getElementById('deviceSelect');
        select.innerHTML = '<option value="">选择设备...</option>';
        
        tabFiles.sort((a, b) => b.lastModified - a.lastModified);
        
        for (const file of tabFiles) {
            const option = document.createElement('option');
            option.value = file.filename;
            option.textContent = `${file.deviceName} (${formatDate(file.lastModified)})`;
            select.appendChild(option);
        }
        
        if (tabFiles.length === 0) {
            select.innerHTML = '<option value="">暂无设备数据</option>';
        }
    } catch (error) {
        showStatus('加载设备列表失败: ' + error.message, 'danger');
    }
}

async function loadTabs(filename) {
    try {
        const data = await downloadTabFile(filename);
        const tabList = document.getElementById('tabList');
        const deviceName = filename.replace(/^tabs\./, '').replace(/\.json$/, '');
        
        document.getElementById('currentDevice').textContent = deviceName;
        document.getElementById('lastSync').textContent = `最后同步: ${formatDate(new Date())}`;
        
        if (!data.tabs || data.tabs.length === 0) {
            tabList.innerHTML = '<div class="no-tabs">该设备暂无标签页数据</div>';
            return;
        }
        
        let html = '';
        for (const tab of data.tabs) {
            html += `
                <div class="tab-item">
                    <img src="${tab.favIconUrl || 'icon.png'}" class="tab-icon" onerror="this.src='icon.png'">
                    <div class="tab-title">${tab.title}</div>
                    <div class="tab-url">${tab.url}</div>
                </div>
            `;
        }
        tabList.innerHTML = html;
        
        showStatus(`已加载 ${data.tabs.length} 个标签页`);
    } catch (error) {
        showStatus('加载标签页失败: ' + error.message, 'danger');
    }
}

async function deleteDevice(filename) {
    if (!confirm('确定要删除此设备的标签页数据吗？')) {
        return;
    }
    
    try {
        await deleteTabFile(filename);
        await loadDevices();
        document.getElementById('tabList').innerHTML = '<div class="no-tabs">请选择一个设备查看其标签页</div>';
        document.getElementById('currentDevice').textContent = '未选择设备';
        document.getElementById('lastSync').textContent = '';
        showStatus('设备数据已删除');
    } catch (error) {
        showStatus('删除设备数据失败: ' + error.message, 'danger');
    }
}

// 事件监听
document.addEventListener('DOMContentLoaded', () => {
    loadDevices();
    
    document.getElementById('deviceSelect').addEventListener('change', (e) => {
        const filename = e.target.value;
        if (filename) {
            loadTabs(filename);
        } else {
            document.getElementById('tabList').innerHTML = '<div class="no-tabs">请选择一个设备查看其标签页</div>';
            document.getElementById('currentDevice').textContent = '未选择设备';
            document.getElementById('lastSync').textContent = '';
        }
    });
}); 