// 递归渲染书签文件夹树
function renderBookmarkFolder(node, container, pathMap) {
    if (node.children) {
        const div = document.createElement('div');
        div.className = 'folder-container';
        
        if (node.title) {
            const folderDiv = document.createElement('div');
            folderDiv.className = 'folder-item';
            folderDiv.innerHTML = `
                <i class="bi bi-folder me-2"></i>
                <span>${node.title}</span>
            `;
            folderDiv.onclick = () => {
                const fullPath = pathMap.get(node.id);
                // 通过chrome.storage保存选择的路径
                chrome.storage.sync.get(['bookmarkConfig'], function(result) {
                    const config = result.bookmarkConfig || {};
                    config.sync_path = fullPath;
                    chrome.storage.sync.set({ bookmarkConfig: config }, function() {
                        // 更新父窗口中的路径显示
                        if (window.opener && !window.opener.closed) {
                            const selectedPath = window.opener.document.getElementById('selected-path');
                            if (selectedPath) {
                                selectedPath.textContent = fullPath;
                            }
                        }
                        window.close();
                    });
                });
            };
            div.appendChild(folderDiv);
        }
        
        const childrenDiv = document.createElement('div');
        childrenDiv.className = 'folder-list';
        node.children.forEach(child => {
            if (child.children) { // 只显示文件夹
                renderBookmarkFolder(child, childrenDiv, pathMap);
            }
        });
        div.appendChild(childrenDiv);
        container.appendChild(div);
    }
}

// 初始化书签选择器
async function initializeBookmarkSelector() {
    try {
        const bookmarkTree = await chrome.bookmarks.getTree();
        
        // 递归构建路径映射
        const pathMap = new Map();
        function buildPathMap(node, parentPath = '') {
            if (node.children) {
                let currentPath;
                if (node.title) {
                    currentPath = parentPath ? `${parentPath}/${node.title}` : `/${node.title}`;
                    pathMap.set(node.id, currentPath);
                } else {
                    currentPath = parentPath;
                }
                node.children.forEach(child => buildPathMap(child, currentPath));
            }
        }
        
        // 只处理第一个根节点的子节点
        buildPathMap(bookmarkTree[0]);
        
        const folderTree = document.getElementById('folder-tree');
        if (folderTree) {
            renderBookmarkFolder(bookmarkTree[0], folderTree, pathMap);
        } else {
            console.error('找不到folder-tree元素');
        }
    } catch (error) {
        console.error('初始化书签选择器失败:', error);
    }
}

// 当页面加载完成时初始化
document.addEventListener('DOMContentLoaded', initializeBookmarkSelector); 