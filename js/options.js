// 保存选项到 chrome.storage
async function save_options() {
    const webdav_url = document.getElementById('webdav_url').value;
    const webdav_username = document.getElementById('webdav_username').value;
    const webdav_password = document.getElementById('webdav_password').value;
    const enable_aes = document.getElementById('enable_aes').checked;
    const aes_key = document.getElementById('aes_key').value;

    // 验证AES密钥
    if (enable_aes) {
        if (aes_key.length < 16 || aes_key.length > 32) {
            const status = document.getElementById('status');
            status.textContent = '错误：AES密钥长度必须在16-32位之间';
            status.className = 'alert alert-danger mt-3';
            status.style.display = 'block';
            document.getElementById('aes_key').focus();
            return;
        }
    }

    const sync_path = document.getElementById('selected-path').textContent.trim();
    const database_filename = document.getElementById('database_filename').value.trim() || 'bookmarks.json';
    const auto_backup = document.getElementById('auto_backup').checked;
    const backup_interval = parseInt(document.getElementById('backup_interval').value) || 7;
    const enable_auto_sync = document.getElementById('enable_auto_sync').checked;
    const sync_interval = Math.max(30, parseInt(document.getElementById('sync_interval').value) || 300);

    chrome.storage.sync.set({
        webdavConfig: {
            url: webdav_url,
            username: webdav_username,
            password: webdav_password,
            enable_aes: enable_aes,
            aes_key: aes_key
        },
        bookmarkConfig: {
            sync_path: sync_path,
            database_filename: database_filename,
            auto_backup: auto_backup,
            backup_interval: backup_interval,
            enable_auto_sync: enable_auto_sync,
            sync_interval: sync_interval,
            lastBackup: Date.now() // 记录最后备份时间
        }
    }, function() {
        console.log('设置已保存，sync_path:', sync_path);
        const status = document.getElementById('status');
        status.textContent = '设置已保存';
        status.className = 'alert alert-success mt-3';
        status.style.display = 'block';
        setTimeout(function() {
            status.style.display = 'none';
        }, 2000);
    });
}

// 从 chrome.storage 恢复选项
async function restore_options() {
    chrome.storage.sync.get({
        webdavConfig: {
            url: '',
            username: '',
            password: '',
            enable_aes: false,
            aes_key: ''
        },
        bookmarkConfig: {
            sync_path: '/Bookmarks bar/',
            database_filename: 'bookmarks.json',
            auto_backup: false,
            backup_interval: 7,
            enable_auto_sync: false,
            sync_interval: 300,
            lastBackup: null
        }
    }, function(items) {
        document.getElementById('webdav_url').value = items.webdavConfig.url;
        document.getElementById('webdav_username').value = items.webdavConfig.username;
        document.getElementById('webdav_password').value = items.webdavConfig.password;
        document.getElementById('enable_aes').checked = items.webdavConfig.enable_aes;
        document.getElementById('aes_key').value = items.webdavConfig.aes_key;
        document.getElementById('selected-path').textContent = items.bookmarkConfig.sync_path;
        document.getElementById('database_filename').value = items.bookmarkConfig.database_filename;
        document.getElementById('auto_backup').checked = items.bookmarkConfig.auto_backup;
        document.getElementById('backup_interval').value = items.bookmarkConfig.backup_interval;
        document.getElementById('enable_auto_sync').checked = items.bookmarkConfig.enable_auto_sync;
        document.getElementById('sync_interval').value = items.bookmarkConfig.sync_interval;
        
        // 根据是否启用AES加密显示/隐藏密钥输入框
        toggleAesKeyInput();
    });
}

// 切换AES密钥输入框的显示状态
function toggleAesKeyInput() {
    const aesKeyGroup = document.getElementById('aes_key_group');
    const enableAes = document.getElementById('enable_aes').checked;
    const aesKeyInput = document.getElementById('aes_key');
    
    if (enableAes) {
        aesKeyGroup.style.display = 'block';
        aesKeyInput.required = true;
    } else {
        aesKeyGroup.style.display = 'none';
        aesKeyInput.required = false;
        aesKeyInput.value = ''; // 清空密钥
    }
}

// 导出配置到JSON文件
async function exportConfig() {
    try {
        const config = await chrome.storage.sync.get(null);  // 获取所有配置
        
        // 创建Blob并下载
        const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'WebBrowserPrivateSync-setting.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        const status = document.getElementById('status');
        status.textContent = '配置已成功导出';
        status.className = 'alert alert-success mt-3';
        status.style.display = 'block';
        setTimeout(() => {
            status.style.display = 'none';
        }, 2000);
    } catch (error) {
        console.error('导出配置失败:', error);
        const status = document.getElementById('status');
        status.textContent = '导出配置失败: ' + error.message;
        status.className = 'alert alert-danger mt-3';
        status.style.display = 'block';
    }
}

// 从JSON文件导入配置
async function importConfig(file) {
    try {
        const text = await file.text();
        const config = JSON.parse(text);
        
        // 验证必要的字段
        if (!config.webdavConfig?.url) {
            throw new Error('配置文件缺少WebDAV URL');
        }
        
        // 保存配置
        await chrome.storage.sync.set(config);
        
        // 更新界面
        document.getElementById('webdav_url').value = config.webdavConfig.url;
        document.getElementById('webdav_username').value = config.webdavConfig.username;
        document.getElementById('webdav_password').value = config.webdavConfig.password;
        document.getElementById('selected-path').textContent = config.bookmarkConfig.sync_path;
        document.getElementById('database_filename').value = config.bookmarkConfig.database_filename;
        document.getElementById('auto_backup').checked = config.bookmarkConfig.auto_backup;
        document.getElementById('backup_interval').value = config.bookmarkConfig.backup_interval;
        document.getElementById('enable_auto_sync').checked = config.bookmarkConfig.enable_auto_sync;
        document.getElementById('sync_interval').value = config.bookmarkConfig.sync_interval;
        
        const status = document.getElementById('status');
        status.textContent = '配置已成功导入';
        status.className = 'alert alert-success mt-3';
        status.style.display = 'block';
        setTimeout(() => {
            status.style.display = 'none';
        }, 2000);
    } catch (error) {
        console.error('导入配置失败:', error);
        const status = document.getElementById('status');
        status.textContent = '导入配置失败: ' + error.message;
        status.className = 'alert alert-danger mt-3';
        status.style.display = 'block';
    }
}

// 选择书签文件夹
async function selectBookmarkFolder() {
    try {
        // 打开书签选择器窗口
        window.open('bookmark-selector.html', 'Select Bookmark Folder', 
            'width=400,height=600,menubar=no,toolbar=no,location=no,status=no');
    } catch (error) {
        console.error('Error selecting bookmark folder:', error);
    }
} 