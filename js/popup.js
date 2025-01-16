// 显示状态信息
function showStatus(message, type = 'info') {
    const status = document.getElementById('status');
    if (status) {
        status.textContent = message;
        status.className = `status alert-${type}`;
        status.style.display = 'block';
    }
}

// 检查WebDAV配置
async function checkWebDAVConfig() {
    try {
        const config = await chrome.storage.sync.get(['webdavConfig']);
        const setupContainer = document.getElementById('setupContainer');
        
        if (!config.webdavConfig?.url || !config.webdavConfig?.username || !config.webdavConfig?.password) {
            // 显示配置按钮
            setupContainer.classList.add('show');
            showStatus('请先配置WebDAV服务以使用同步功能', 'warning');
            return false;
        }
        
        setupContainer.classList.remove('show');
        return true;
    } catch (error) {
        console.error('检查配置失败:', error);
        showStatus('配置检查失败: ' + error.message, 'danger');
        return false;
    }
}

// 打开选项页面
function openOptionsPage() {
    chrome.runtime.openOptionsPage();
}

// 事件监听
document.addEventListener('DOMContentLoaded', () => {
    // 检查配置
    checkWebDAVConfig();
    
    // 设置按钮点击事件
    const optionsButton = document.getElementById('openOptions');
    if (optionsButton) {
        optionsButton.addEventListener('click', openOptionsPage);
    }
}); 