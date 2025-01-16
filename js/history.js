// 显示状态信息
function showStatus(message, type = 'info') {
    const statusDiv = document.getElementById('status');
    statusDiv.textContent = message;
    statusDiv.style.display = 'block';
    statusDiv.className = `status alert alert-${type}`;
}

// 格式化时间差
function formatTimeDiff(timestamp) {
    const now = new Date().getTime();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}天前`;
    if (hours > 0) return `${hours}小时前`;
    if (minutes > 0) return `${minutes}分钟前`;
    return '刚刚';
}

// 格式化日期时间
function formatDateTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
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

// 获取历史记录
async function getHistory() {
    try {
        const oneWeekAgo = new Date().getTime() - (7 * 24 * 60 * 60 * 1000);
        const items = await chrome.history.search({
            text: '',
            startTime: oneWeekAgo,
            maxResults: 1000
        });
        return items;
    } catch (error) {
        console.error('获取历史记录失败:', error);
        showStatus('获取历史记录失败: ' + error.message, 'danger');
        return [];
    }
}

// 格式化历史记录数据
function formatHistoryData(items) {
    return items.map(item => ({
        title: item.title,
        url: item.url,
        lastVisitTime: item.lastVisitTime,
        visitCount: item.visitCount
    }));
}

// 上传历史记录到WebDAV
async function uploadHistory(historyData) {
    try {
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
            history: historyData
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
        const filename = `history.${deviceName}.json`;
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

        // 更新最后同步时间
        document.getElementById('lastSync').textContent = formatDateTime(new Date().getTime());
        showStatus('历史记录同步成功', 'success');
    } catch (error) {
        console.error('上传历史记录失败:', error);
        showStatus('上传历史记录失败: ' + error.message, 'danger');
    }
}

// 从WebDAV下载历史记录
async function downloadHistory(deviceName) {
    try {
        const config = await chrome.storage.sync.get('webdavConfig');
        const { url, username, password, enable_aes, aes_key } = config.webdavConfig;

        if (!url || !username || !password) {
            throw new Error('WebDAV配置不完整');
        }

        // 构建文件名和URL
        const filename = `history.${deviceName}.json`;
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
            let historyData;
            if (enable_aes && aes_key) {
                // 解密数据
                const decrypted = CryptoJS.AES.decrypt(data, aes_key);
                const jsonStr = decrypted.toString(CryptoJS.enc.Utf8);
                if (!jsonStr) {
                    throw new Error('解密失败：密钥错误或数据已损坏');
                }
                historyData = JSON.parse(jsonStr);
            } else {
                historyData = JSON.parse(data);
            }

            return historyData;
        } catch (error) {
            throw new Error('解析历史记录数据失败: ' + error.message);
        }
    } catch (error) {
        console.error('下载历史记录失败:', error);
        showStatus('下载历史记录失败: ' + error.message, 'danger');
        return null;
    }
}

// 列出所有设备的历史记录文件
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
            if (filename.startsWith('history.') && filename.endsWith('.json')) {
                const deviceName = filename.replace('history.', '').replace('.json', '');
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

// 显示历史记录列表
function displayHistory(historyData) {
    const historyList = document.getElementById('historyList');
    historyList.innerHTML = '';

    if (!historyData || !historyData.history) {
        historyList.innerHTML = '<div class="no-history">没有历史记录数据</div>';
        return;
    }

    historyData.history.sort((a, b) => b.lastVisitTime - a.lastVisitTime);

    historyData.history.forEach(item => {
        const div = document.createElement('div');
        div.className = 'history-item';
        div.innerHTML = `
            <a href="${item.url}" class="history-title" target="_blank">${item.title || item.url}</a>
            <a href="${item.url}" class="history-url" target="_blank">${item.url}</a>
            <div class="history-meta">
                访问次数: ${item.visitCount} | 
                最后访问: ${formatTimeDiff(item.lastVisitTime)}
            </div>
        `;
        historyList.appendChild(div);
    });
}

// 初始化设备标签
async function initDeviceTabs() {
    const deviceTabs = document.getElementById('deviceTabs');
    const currentDeviceName = await getDeviceName();
    document.getElementById('currentDevice').textContent = currentDeviceName;

    // 获取所有设备列表
    const devices = await listDevices();
    
    // 绑定本地历史记录标签的点击事件
    const localTab = deviceTabs.querySelector('[data-device-id="local"]');
    localTab.onclick = async (e) => {
        e.preventDefault();
        // 切换标签状态
        document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
        localTab.classList.add('active');
        
        // 获取并显示本地历史记录
        document.getElementById('currentDevice').textContent = '本地历史记录';
        const history = await getHistory();
        const formattedHistory = formatHistoryData(history);
        displayHistory({
            deviceName: '本地',
            lastSync: new Date().getTime(),
            history: formattedHistory
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
        const historyData = await downloadHistory(currentDeviceName);
        if (historyData) {
            displayHistory(historyData);
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
                
                // 获取并显示选中设备的历史记录
                document.getElementById('currentDevice').textContent = device;
                const historyData = await downloadHistory(device);
                if (historyData) {
                    displayHistory(historyData);
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

    // 初始加载本地历史记录
    const history = await getHistory();
    const formattedHistory = formatHistoryData(history);
    document.getElementById('currentDevice').textContent = '本地历史记录';
    displayHistory({
        deviceName: '本地',
        lastSync: new Date().getTime(),
        history: formattedHistory
    });
}

// 启动页面
document.addEventListener('DOMContentLoaded', initPage); 