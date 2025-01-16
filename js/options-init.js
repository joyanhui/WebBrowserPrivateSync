// 初始化事件监听
function initializeOptions() {
    // 恢复保存的选项
    restore_options();
    
    // 保存按钮
    document.getElementById('save').addEventListener('click', save_options);
    
    // 选择文件夹按钮
    document.getElementById('select-folder').addEventListener('click', selectBookmarkFolder);
    
    // 导出配置
    document.getElementById('export-config').addEventListener('click', exportConfig);
    
    // 导入配置
    document.getElementById('import-config').addEventListener('click', () => {
        document.getElementById('config-file-input').click();
    });
    
    document.getElementById('config-file-input').addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            importConfig(file);
        }
        event.target.value = ''; // 清除选择，允许重复选择同一个文件
    });
    
    document.getElementById('enable_aes').addEventListener('change', toggleAesKeyInput);
}

// 当页面加载完成时初始化
document.addEventListener('DOMContentLoaded', initializeOptions); 