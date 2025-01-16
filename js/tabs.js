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
    if (status) {
        status.textContent = message;
        status.className = `alert alert-${type} status`;
        status.style.display = 'block';
        
        if (type !== 'danger') {
            setTimeout(() => {
                status.style.display = 'none';
            }, 3000);
        }
    }
}

function formatDate(date) {
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) { // 小于1分钟
        return '刚刚';
    } else if (diff < 3600000) { // 小于1小时
        return Math.floor(diff / 60000) + '分钟前';
    } else if (diff < 86400000) { // 小于24小时
        return Math.floor(diff / 3600000) + '小时前';
    } else {
        return date.toLocaleString();
    }
}

// 创建标签页元素
function createTabElement(tab) {
    const tabItem = document.createElement('div');
    tabItem.className = 'tab-item';

    const icon = document.createElement('div');
    icon.className = 'tab-icon';
    
    // 如果有favicon，则设置图片
    if (tab.favIconUrl) {
        const img = new Image();
        img.onload = () => {
            icon.style.backgroundImage = `url('${tab.favIconUrl}')`;
        };
        img.onerror = () => {
            icon.classList.add('default');
        };
        img.src = tab.favIconUrl;
    } else {
        icon.classList.add('default');
    }

    const title = document.createElement('div');
    title.className = 'tab-title';
    title.textContent = tab.title;

    const url = document.createElement('a');
    url.className = 'tab-url';
    url.href = tab.url;
    url.textContent = tab.url;
    url.target = '_blank';
    url.rel = 'noopener noreferrer';

    tabItem.appendChild(icon);
    tabItem.appendChild(title);
    tabItem.appendChild(url);

    return tabItem;
}

// 加载标签页列表
async function loadTabs(deviceId = 'current') {
    const tabList = document.getElementById('tabList');
    const deviceName = document.getElementById('currentDevice');
    const lastSync = document.getElementById('lastSync');
    
    if (!tabList || !deviceName || !lastSync) return;
    
    tabList.innerHTML = '<div class="no-tabs">加载中...</div>';
    
    try {
        if (deviceId === 'current') {
            // 加载当前设备的标签页
            const tabs = await chrome.tabs.query({});
            deviceName.textContent = '当前设备';
            lastSync.textContent = '实时';
            
            if (tabs.length === 0) {
                tabList.innerHTML = '<div class="no-tabs">暂无标签页</div>';
                return;
            }
            
            tabList.innerHTML = '';
            tabs.forEach(tab => {
                tabList.appendChild(createTabElement(tab));
            });
        } else {
            // 从WebDAV加载其他设备的标签页
            const config = await chrome.storage.sync.get(['webdavConfig']);
            if (!config.webdavConfig) {
                showStatus('请先配置WebDAV服务', 'warning');
                return;
            }
            
            // TODO: 从WebDAV加载其他设备的标签页
            // 这里需要实现从WebDAV加载数据的逻辑
        }
    } catch (error) {
        console.error('加载标签页失败:', error);
        showStatus('加载标签页失败: ' + error.message, 'danger');
        tabList.innerHTML = '<div class="no-tabs">加载失败</div>';
    }
}

// 初始化设备标签页
async function initDeviceTabs() {
    const deviceTabs = document.getElementById('deviceTabs');
    if (!deviceTabs) return;
    
    try {
        // TODO: 从WebDAV获取设备列表
        // 这里需要实现从WebDAV获取设备列表的逻辑
        
        // 为设备标签添加点击事件
        deviceTabs.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                
                // 更新活动标签
                deviceTabs.querySelectorAll('.nav-link').forEach(l => {
                    l.classList.remove('active');
                });
                link.classList.add('active');
                
                // 加载对应设备的标签页
                const deviceId = link.getAttribute('data-device-id');
                loadTabs(deviceId);
            });
        });
    } catch (error) {
        console.error('初始化设备标签失败:', error);
        showStatus('初始化设备标签失败: ' + error.message, 'danger');
    }
}

// 等待DOM加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    initDeviceTabs();
    loadTabs('current');
}); 