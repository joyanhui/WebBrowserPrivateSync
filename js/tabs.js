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
            
            // 上传当前标签页到WebDAV
            try {
                await uploadTabs(tabs);
            } catch (error) {
                console.error('上传标签页失败:', error);
                showStatus('上传标签页失败: ' + error.message, 'warning');
            }
        } else {
            // 从WebDAV加载其他设备的标签页
            try {
                const filename = `tabs.${deviceId}.json`;
                const tabData = await downloadTabFile(filename);
                
                deviceName.textContent = tabData.deviceName || deviceId;
                lastSync.textContent = formatDateTime(tabData.lastSync);
                
                if (!tabData.tabs || tabData.tabs.length === 0) {
                    tabList.innerHTML = '<div class="no-tabs">暂无标签页</div>';
                    return;
                }
                
                tabList.innerHTML = '';
                tabData.tabs.forEach(tab => {
                    tabList.appendChild(createTabElement(tab));
                });
            } catch (error) {
                if (error.message.includes('404')) {
                    tabList.innerHTML = '<div class="no-tabs">未找到该设备的标签页数据</div>';
                } else {
                    throw error;
                }
            }
        }
    } catch (error) {
        console.error('加载标签页失败:', error);
        showStatus('加载标签页失败: ' + error.message, 'danger');
        tabList.innerHTML = '<div class="no-tabs">加载失败</div>';
    }
}

// 获取设备名称
async function getDeviceName() {
    try {
        const { deviceName } = await chrome.storage.sync.get('deviceName');
        return deviceName || '未命名设备';
    } catch (error) {
        console.error('获取设备名称失败:', error);
        return '未命名设备';
    }
}

// 上传标签页到WebDAV
async function uploadTabs(tabs) {
    const config = await chrome.storage.sync.get(['webdavConfig']);
    const { url, username, password, enable_aes, aes_key } = config.webdavConfig;
    const deviceName = await getDeviceName();

    if (!url || !username || !password) {
        throw new Error('WebDAV配置不完整');
    }

    // 准备要上传的数据
    const uploadData = {
        deviceName,
        lastSync: new Date().getTime(),
        tabs: tabs.map(tab => ({
            title: tab.title,
            url: tab.url,
            favIconUrl: tab.favIconUrl
        }))
    };

    // 加密数据
    let finalData;
    if (enable_aes && aes_key) {
        const jsonStr = JSON.stringify(uploadData);
        finalData = CryptoJS.AES.encrypt(jsonStr, aes_key).toString();
    } else {
        finalData = JSON.stringify(uploadData, null, 2);
    }

    // 构建文件名
    const filename = `tabs.${deviceName}.json`;
    const baseUrl = url.endsWith('/') ? url : url + '/';

    // 上传文件
    const response = await fetch(baseUrl + filename, {
        method: 'PUT',
        headers: {
            'Authorization': 'Basic ' + btoa(username + ':' + password),
            'Content-Type': 'application/json'
        },
        body: finalData
    });

    if (!response.ok) {
        throw new Error(`上传失败: ${response.status} ${response.statusText}`);
    }
}

// 格式化日期时间
function formatDateTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) { // 小于1分钟
        return '刚刚';
    } else if (diff < 3600000) { // 小于1小时
        return `${Math.floor(diff / 60000)}分钟前`;
    } else if (diff < 86400000) { // 小于24小时
        return `${Math.floor(diff / 3600000)}小时前`;
    } else {
        return date.toLocaleString();
    }
}

// 初始化设备标签
async function initDeviceTabs() {
    const deviceTabs = document.getElementById('deviceTabs');
    const currentDeviceName = await getDeviceName();
    document.getElementById('currentDevice').textContent = currentDeviceName;

    // 获取所有设备列表
    const devices = await listDevices();
    
    // 绑定本地标签页的点击事件
    const localTab = deviceTabs.querySelector('[data-device-id="local"]');
    localTab.onclick = async (e) => {
        e.preventDefault();
        // 切换标签状态
        document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
        localTab.classList.add('active');
        
        // 获取并显示本地标签页
        document.getElementById('currentDevice').textContent = '本地标签页';
        const tabs = await chrome.tabs.query({});
        displayTabs({
            deviceName: '本地',
            lastSync: new Date().getTime(),
            tabs: tabs.map(tab => ({
                title: tab.title,
                url: tab.url,
                favIconUrl: tab.favIconUrl
            }))
        });
    };

    // 绑定当前设备同步记录标签的点击事件
    const currentTab = deviceTabs.querySelector('[data-device-id="current"]');
    currentTab.onclick = async (e) => {
        e.preventDefault();
        // 切换标签状态
        document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
        currentTab.classList.add('active');
        
        // 获取并显示当前设备的同步记录
        document.getElementById('currentDevice').textContent = `${currentDeviceName} (同步记录)`;
        const tabsData = await downloadTabs(currentDeviceName);
        if (tabsData) {
            displayTabs(tabsData);
        }
    };

    // 创建其他设备的标签
    for (const device of devices) {
        if (device !== currentDeviceName) {
            const li = document.createElement('li');
            li.className = 'nav-item';
            const a = document.createElement('a');
            a.className = 'nav-link';
            a.href = '#';
            a.textContent = device;
            a.dataset.deviceId = device;
            a.onclick = async (e) => {
                e.preventDefault();
                // 切换标签状态
                document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
                a.classList.add('active');
                
                // 获取并显示选中设备的标签页
                document.getElementById('currentDevice').textContent = device;
                const tabsData = await downloadTabs(device);
                if (tabsData) {
                    displayTabs(tabsData);
                }
            };
            li.appendChild(a);
            deviceTabs.appendChild(li);
        }
    }
}

// 初始化页面
async function initPage() {
    await initDeviceTabs();

    // 初始加载本地标签页
    const tabs = await chrome.tabs.query({});
    document.getElementById('currentDevice').textContent = '本地标签页';
    displayTabs({
        deviceName: '本地',
        lastSync: new Date().getTime(),
        tabs: tabs.map(tab => ({
            title: tab.title,
            url: tab.url,
            favIconUrl: tab.favIconUrl
        }))
    });
}

// 等待DOM加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    initDeviceTabs();
    loadTabs('current');
});

// 从WebDAV下载标签页数据
async function downloadTabs(deviceId) {
    try {
        const config = await chrome.storage.sync.get('webdavConfig');
        const { url, username, password, enable_aes, aes_key } = config.webdavConfig;

        if (!url || !username || !password) {
            throw new Error('WebDAV配置不完整');
        }

        // 构建文件名和URL
        const filename = `tabs.${deviceId}.json`;
        const baseUrl = url.endsWith('/') ? url : url + '/';

        // 下载文件
        const response = await fetch(baseUrl + filename, {
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
            let tabsData;
            if (enable_aes && aes_key) {
                // 解密数据
                const decrypted = CryptoJS.AES.decrypt(data, aes_key);
                const jsonStr = decrypted.toString(CryptoJS.enc.Utf8);
                if (!jsonStr) {
                    throw new Error('解密失败：密钥错误或数据已损坏');
                }
                tabsData = JSON.parse(jsonStr);
            } else {
                tabsData = JSON.parse(data);
            }

            return tabsData;
        } catch (error) {
            throw new Error('解析标签页数据失败: ' + error.message);
        }
    } catch (error) {
        console.error('下载标签页失败:', error);
        showStatus('下载标签页失败: ' + error.message, 'danger');
        return null;
    }
}

// 列出所有设备的标签页文件
async function listDevices() {
    try {
        const config = await chrome.storage.sync.get('webdavConfig');
        const { url, username, password } = config.webdavConfig;

        if (!url || !username || !password) {
            throw new Error('WebDAV配置不完整');
        }

        const baseUrl = url.endsWith('/') ? url : url + '/';

        // 获取目录列表
        const response = await fetch(baseUrl, {
            method: 'PROPFIND',
            headers: {
                'Authorization': 'Basic ' + btoa(username + ':' + password),
                'Depth': '1'
            }
        });

        if (!response.ok) {
            throw new Error(`获取设备列表失败: ${response.status} ${response.statusText}`);
        }

        const text = await response.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(text, 'text/xml');
        const responses = xmlDoc.getElementsByTagName('d:response');
        
        const devices = [];
        for (const resp of responses) {
            const href = resp.getElementsByTagName('d:href')[0].textContent;
            const filename = decodeURIComponent(href.split('/').pop());
            if (filename.startsWith('tabs.') && filename.endsWith('.json')) {
                const deviceName = filename.replace('tabs.', '').replace('.json', '');
                devices.push(deviceName);
            }
        }

        return devices;
    } catch (error) {
        console.error('获取设备列表失败:', error);
        showStatus('获取设备列表失败: ' + error.message, 'danger');
        return [];
    }
}

// 显示标签页列表
function displayTabs(tabsData) {
    const tabList = document.getElementById('tabList');
    const lastSync = document.getElementById('lastSync');

    if (!tabsData || !tabsData.tabs || tabsData.tabs.length === 0) {
        tabList.innerHTML = '<div class="no-tabs">暂无标签页</div>';
        return;
    }

    lastSync.textContent = tabsData.lastSync ? formatDateTime(tabsData.lastSync) : '未知';
    
    tabList.innerHTML = '';
    tabsData.tabs.forEach(tab => {
        tabList.appendChild(createTabElement(tab));
    });
}

// 创建标签页元素
function createTabElement(tab) {
    const div = document.createElement('div');
    div.className = 'tab-item';

    const icon = document.createElement('div');
    icon.className = 'tab-icon';
    if (tab.favIconUrl) {
        icon.style.backgroundImage = `url('${tab.favIconUrl}')`;
    } else {
        icon.classList.add('default');
    }

    const title = document.createElement('a');
    title.className = 'tab-title';
    title.href = tab.url;
    title.target = '_blank';
    title.textContent = tab.title || tab.url;

    const url = document.createElement('a');
    url.className = 'tab-url';
    url.href = tab.url;
    url.target = '_blank';
    url.textContent = tab.url;

    div.appendChild(icon);
    div.appendChild(title);
    div.appendChild(url);

    return div;
} 