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

// 打开功能页面
function openFeaturePage(page) {
    chrome.tabs.create({ url: `${page}.html` });
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    // 检查配置
    checkWebDAVConfig();
    
    // 绑定按钮事件
    document.getElementById('openOptions').addEventListener('click', openOptionsPage);
    
    // 使用统一的函数处理所有功能页面的打开
    const featureButtons = {
        'openTabs': 'tabs',
        'openBookmarks': 'bookmarks',
        'openMdEdit': 'md-edit',
        'openHistory': 'history'
    };

    Object.entries(featureButtons).forEach(([buttonId, pageName]) => {
        document.getElementById(buttonId)?.addEventListener('click', () => openFeaturePage(pageName));
    });
}); 