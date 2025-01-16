// 保存选项到 chrome.storage
async function save_options() {
    const webdavConfig = {
        url: document.getElementById('webdav_url').value.trim(),
        username: document.getElementById('webdav_username').value.trim(),
        password: document.getElementById('webdav_password').value.trim(),
        enable_aes: document.getElementById('enable_aes').checked,
        aes_key: document.getElementById('aes_key').value.trim()
    };

    const deviceName = document.getElementById('device_name').value.trim();

    const bookmarkConfig = {
        sync_path: document.getElementById('selected-path').textContent,
        database_filename: document.getElementById('database_filename').value.trim(),
        auto_backup: document.getElementById('auto_backup').checked,
        backup_interval: parseInt(document.getElementById('backup_interval').value, 10),
        enable_auto_sync: document.getElementById('enable_auto_sync').checked,
        sync_interval: parseInt(document.getElementById('sync_interval').value, 10)
    };

    const tabsConfig = {
        enable_auto_sync: document.getElementById('enable_tabs_sync').checked,
        sync_interval: parseInt(document.getElementById('tabs_sync_interval').value, 10)
    };

    const historyConfig = {
        enable_auto_sync: document.getElementById('enable_history_sync').checked,
        sync_interval: parseInt(document.getElementById('history_sync_interval').value, 10)
    };

    try {
        await chrome.storage.sync.set({
            webdavConfig,
            deviceName,
            bookmarkConfig,
            tabsConfig,
            historyConfig
        });

        const status = document.getElementById('status');
        status.textContent = '选项已保存';
        status.className = 'alert alert-success';
        status.style.display = 'block';
        setTimeout(() => {
            status.style.display = 'none';
        }, 3000);
    } catch (error) {
        console.error('保存选项失败:', error);
        const status = document.getElementById('status');
        status.textContent = '保存失败: ' + error.message;
        status.className = 'alert alert-danger';
        status.style.display = 'block';
    }
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
        deviceName: '',
        bookmarkConfig: {
            sync_path: '/Bookmarks bar/',
            database_filename: 'bookmarks.json',
            auto_backup: false,
            backup_interval: 7,
            enable_auto_sync: false,
            sync_interval: 30,
            lastBackup: null
        },
        tabsConfig: {
            enable_auto_sync: false,
            sync_interval: 30
        },
        historyConfig: {
            enable_auto_sync: false,
            sync_interval: 30
        }
    }, function(items) {
        // WebDAV设置
        document.getElementById('webdav_url').value = items.webdavConfig.url;
        document.getElementById('webdav_username').value = items.webdavConfig.username;
        document.getElementById('webdav_password').value = items.webdavConfig.password;
        document.getElementById('enable_aes').checked = items.webdavConfig.enable_aes;
        document.getElementById('aes_key').value = items.webdavConfig.aes_key;
        
        // 设备名称
        document.getElementById('device_name').value = items.deviceName;
        
        // 书签设置
        document.getElementById('selected-path').textContent = items.bookmarkConfig.sync_path;
        document.getElementById('database_filename').value = items.bookmarkConfig.database_filename;
        document.getElementById('auto_backup').checked = items.bookmarkConfig.auto_backup;
        document.getElementById('backup_interval').value = items.bookmarkConfig.backup_interval;
        document.getElementById('enable_auto_sync').checked = items.bookmarkConfig.enable_auto_sync;
        document.getElementById('sync_interval').value = items.bookmarkConfig.sync_interval;
        
        // 标签页设置
        document.getElementById('enable_tabs_sync').checked = items.tabsConfig?.enable_auto_sync || false;
        document.getElementById('tabs_sync_interval').value = items.tabsConfig?.sync_interval || 30;
        
        // 历史记录设置
        document.getElementById('enable_history_sync').checked = items.historyConfig?.enable_auto_sync || false;
        document.getElementById('history_sync_interval').value = items.historyConfig?.sync_interval || 30;
        
        // 更新AES密钥输入框的状态
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
        
        // 强制关闭自动同步和自动备份
        config.bookmarkConfig.enable_auto_sync = false;
        config.bookmarkConfig.auto_backup = false;
        config.tabsConfig = config.tabsConfig || {};
        config.tabsConfig.enable_auto_sync = false;
        config.historyConfig = config.historyConfig || {};
        config.historyConfig.enable_auto_sync = false;
        
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
        document.getElementById('enable_tabs_sync').checked = config.tabsConfig?.enable_auto_sync || false;
        document.getElementById('tabs_sync_interval').value = config.tabsConfig?.sync_interval || 30;
        document.getElementById('device_name').value = config.deviceName;
        document.getElementById('enable_history_sync').checked = config.historyConfig?.enable_auto_sync || false;
        document.getElementById('history_sync_interval').value = config.historyConfig?.sync_interval || 30;

        const status = document.getElementById('status');
        status.textContent = '配置已成功导入,自动同步和自动备份已强制关闭 如需要 请手动打开';
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

// 监听配置变更
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync' && changes.bookmarkConfig) {
        const newConfig = changes.bookmarkConfig.newValue;
        if (newConfig && newConfig.sync_path) {
            document.getElementById('selected-path').textContent = newConfig.sync_path;
        }
    }
});

// 保存配置
async function saveConfig() {
    const url = document.getElementById('webdavUrl').value.trim();
    const username = document.getElementById('webdavUsername').value.trim();
    const password = document.getElementById('webdavPassword').value;
    const deviceName = document.getElementById('deviceName').value.trim();
    const enableAutoSync = document.getElementById('enableAutoSync').checked;
    const enableTabsSync = document.getElementById('enableTabsSync').checked;
    const enableHistorySync = document.getElementById('enableHistorySync').checked;
    const syncInterval = parseInt(document.getElementById('syncInterval').value);
    const tabsSyncInterval = parseInt(document.getElementById('tabsSyncInterval').value);
    const historySyncInterval = parseInt(document.getElementById('historySyncInterval').value);
    const autoBackup = document.getElementById('autoBackup').checked;
    const databaseFilename = document.getElementById('databaseFilename').value.trim();
    const enableAES = document.getElementById('enableAES').checked;
    const aesKey = document.getElementById('aesKey').value;

    try {
        // 保存WebDAV配置
        await chrome.storage.sync.set({
            webdavConfig: {
                url,
                username,
                password,
                enable_aes: enableAES,
                aes_key: aesKey
            }
        });

        // 保存设备名称
        await chrome.storage.sync.set({ deviceName });

        // 保存书签和标签页配置
        await chrome.storage.sync.set({
            bookmarkConfig: {
                enable_auto_sync: enableAutoSync,
                enable_tabs_sync: enableTabsSync,
                sync_interval: syncInterval,
                tabs_sync_interval: tabsSyncInterval,
                auto_backup: autoBackup,
                database_filename: databaseFilename
            }
        });

        // 保存历史记录配置
        await chrome.storage.sync.set({
            historyConfig: {
                enable_auto_sync: enableHistorySync,
                sync_interval: historySyncInterval
            }
        });

        showStatus('配置已保存', 'success');
    } catch (error) {
        console.error('保存配置失败:', error);
        showStatus('保存配置失败: ' + error.message, 'danger');
    }
}

// 加载配置
async function loadConfig() {
    try {
        const config = await chrome.storage.sync.get([
            'webdavConfig',
            'deviceName',
            'bookmarkConfig',
            'historyConfig'
        ]);

        // 加载WebDAV配置
        if (config.webdavConfig) {
            document.getElementById('webdavUrl').value = config.webdavConfig.url || '';
            document.getElementById('webdavUsername').value = config.webdavConfig.username || '';
            document.getElementById('webdavPassword').value = config.webdavConfig.password || '';
            document.getElementById('enableAES').checked = config.webdavConfig.enable_aes || false;
            document.getElementById('aesKey').value = config.webdavConfig.aes_key || '';
        }

        // 加载设备名称
        if (config.deviceName) {
            document.getElementById('deviceName').value = config.deviceName;
        }

        // 加载书签和标签页配置
        if (config.bookmarkConfig) {
            document.getElementById('enableAutoSync').checked = config.bookmarkConfig.enable_auto_sync || false;
            document.getElementById('enableTabsSync').checked = config.bookmarkConfig.enable_tabs_sync || false;
            document.getElementById('syncInterval').value = config.bookmarkConfig.sync_interval || 30;
            document.getElementById('tabsSyncInterval').value = config.bookmarkConfig.tabs_sync_interval || 30;
            document.getElementById('autoBackup').checked = config.bookmarkConfig.auto_backup || false;
            document.getElementById('databaseFilename').value = config.bookmarkConfig.database_filename || 'bookmarks.json';
        }

        // 加载历史记录配置
        if (config.historyConfig) {
            document.getElementById('enableHistorySync').checked = config.historyConfig.enable_auto_sync || false;
            document.getElementById('historySyncInterval').value = config.historyConfig.sync_interval || 30;
        }
    } catch (error) {
        console.error('加载配置失败:', error);
        showStatus('加载配置失败: ' + error.message, 'danger');
    }
}

// ... existing code ... 