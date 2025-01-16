# WebBrowserPrivateSync

# Completed

- Browser tabs sysnc

# Optimized function

- notepad(*.md) edit over cloud storage
- webdav Storage
- setting import and export
- Browser history sync
- Browser bookmarks sync

# Functions in and testing


# todo list

- s3 Storage
- Browser password
- Browser cookies
- Browser Local storage
- md editor with preview and highlighting


# 书签同步逻辑
## 备份到webdav
以本地书签为准 上传一份到远端，覆盖远端原有数据
## 覆盖到本地
以远端书签为准 下载一份到本地，覆盖本地原有数据

## 同步
同步书签的逻辑 如果 远端 上没有对应的数据文件，那么以本地书签为准 上传一份到远端
如果本地删除书签以id为准，远端也删除 一般要等待至少5秒左右 才能识别到
如果远端删除书签 本地也删除 一般要等待至少5秒左右 才能识别到
如果是自动同步，那么要等5秒并且同步成功后 才会生效