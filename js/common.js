// 创建新文件 common.js 用于共享功能
async function loadBootstrapCSS() {
    const data = await chrome.storage.sync.get({
        bootstrapUrl: 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css'
    });
    
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = data.bootstrapUrl;
    document.head.appendChild(link);
} 