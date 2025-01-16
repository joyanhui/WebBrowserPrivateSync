// 显示状态信息
function showStatus(message, type = 'info') {
    const statusDiv = document.getElementById('status');
    statusDiv.textContent = message;
    statusDiv.style.display = 'block';
    statusDiv.className = `status alert alert-${type}`;
}

// 检查WebDAV配置
async function checkWebDAVConfig() {
    try {
        const { webdavConfig } = await chrome.storage.sync.get('webdavConfig');
        const isConfigured = webdavConfig?.url && webdavConfig?.username && webdavConfig?.password;
        
        const setupContainer = document.getElementById('setupContainer');
        const featuresContainer = document.getElementById('featuresContainer');
        
        if (isConfigured) {
            setupContainer.classList.remove('show');
            featuresContainer.classList.add('show');
        } else {
            showStatus('请先配置WebDAV服务以使用全部功能', 'warning');
            setupContainer.classList.add('show');
            featuresContainer.classList.remove('show');
        }
    } catch (error) {
        console.error('检查WebDAV配置失败:', error);
        showStatus('检查配置时出错', 'danger');
    }
}

// 打开选项页面
function openOptionsPage() {
    chrome.runtime.openOptionsPage();
}

// 打开标签页同步
function openTabs() {
    chrome.tabs.create({ url: 'tabs.html' });
}

// 打开书签同步
function openBookmarks() {
    chrome.tabs.create({ url: 'bookmarks.html' });
}

// 打开Markdown编辑
function openMdEdit() {
    chrome.tabs.create({ url: 'md-edit.html' });
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    // 检查配置
    checkWebDAVConfig();
    
    // 绑定按钮事件
    document.getElementById('openOptions').addEventListener('click', openOptionsPage);
    document.getElementById('openTabs').addEventListener('click', openTabs);
    document.getElementById('openBookmarks').addEventListener('click', openBookmarks);
    document.getElementById('openMdEdit').addEventListener('click', openMdEdit);
}); 