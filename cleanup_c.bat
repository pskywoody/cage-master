@echo off
chcp 65001 >nul
echo ========================================
echo   C盘清理脚本 - 请在关闭TRAE后右键以管理员身份运行
echo ========================================
echo.

echo [1/8] 清理TRAE Solo CN缓存...
set "TRAE_DIR=%APPDATA%\TRAE Solo CN"
if exist "%TRAE_DIR%\Cache" rd /s /q "%TRAE_DIR%\Cache" 2>nul
if exist "%TRAE_DIR%\Code Cache" rd /s /q "%TRAE_DIR%\Code Cache" 2>nul
if exist "%TRAE_DIR%\GPUCache" rd /s /q "%TRAE_DIR%\GPUCache" 2>nul
if exist "%TRAE_DIR%\DawnCache" rd /s /q "%TRAE_DIR%\DawnCache" 2>nul
if exist "%TRAE_DIR%\DawnWebGPUCache" rd /s /q "%TRAE_DIR%\DawnWebGPUCache" 2>nul
if exist "%TRAE_DIR%\DawnGraphiteCache" rd /s /q "%TRAE_DIR%\DawnGraphiteCache" 2>nul
if exist "%TRAE_DIR%\blob_storage" rd /s /q "%TRAE_DIR%\blob_storage" 2>nul
if exist "%TRAE_DIR%\logs" rd /s /q "%TRAE_DIR%\logs" 2>nul
if exist "%TRAE_DIR%\Crashpad" rd /s /q "%TRAE_DIR%\Crashpad" 2>nul
if exist "%TRAE_DIR%\CachedData" rd /s /q "%TRAE_DIR%\CachedData" 2>nul
if exist "%TRAE_DIR%\CachedConfigurations" rd /s /q "%TRAE_DIR%\CachedConfigurations" 2>nul
if exist "%TRAE_DIR%\CachedProfilesData" rd /s /q "%TRAE_DIR%\CachedProfilesData" 2>nul
if exist "%TRAE_DIR%\VMCache" rd /s /q "%TRAE_DIR%\VMCache" 2>nul
if exist "%TRAE_DIR%\Network" rd /s /q "%TRAE_DIR%\Network" 2>nul
if exist "%TRAE_DIR%\Shared Dictionary" rd /s /q "%TRAE_DIR%\Shared Dictionary" 2>nul
if exist "%TRAE_DIR%\ahanet" rd /s /q "%TRAE_DIR%\ahanet" 2>nul
if exist "%TRAE_DIR%\aha" rd /s /q "%TRAE_DIR%\aha" 2>nul
if exist "%TRAE_DIR%\VideoDecodeStats" rd /s /q "%TRAE_DIR%\VideoDecodeStats" 2>nul
if exist "%TRAE_DIR%\monitor" rd /s /q "%TRAE_DIR%\monitor" 2>nul
if exist "%TRAE_DIR%\Backups" rd /s /q "%TRAE_DIR%\Backups" 2>nul
mkdir "%TRAE_DIR%\Cache" 2>nul
mkdir "%TRAE_DIR%\Code Cache" 2>nul
mkdir "%TRAE_DIR%\GPUCache" 2>nul
mkdir "%TRAE_DIR%\logs" 2>nul
echo   TRAE缓存已清理
echo.

echo [2/8] 清理NVIDIA着色器缓存...
if exist "%LOCALAPPDATA%\NVIDIA\DXCache" rd /s /q "%LOCALAPPDATA%\NVIDIA\DXCache" 2>nul
if exist "%LOCALAPPDATA%\NVIDIA\GLCache" rd /s /q "%LOCALAPPDATA%\NVIDIA\GLCache" 2>nul
mkdir "%LOCALAPPDATA%\NVIDIA\DXCache" 2>nul
echo   NVIDIA缓存已清理
echo.

echo [3/8] 清理uv Python包缓存...
if exist "%LOCALAPPDATA%\uv\cache" rd /s /q "%LOCALAPPDATA%\uv\cache" 2>nul
echo   uv缓存已清理
echo.

echo [4/8] 禁用休眠文件(释放内存大小空间)...
powercfg -h off
echo   休眠已禁用
echo.

echo [5/8] 运行Windows磁盘清理...
cleanmgr /sagerun:1
echo.

echo [6/8] 清理Windows临时文件...
del /q /f /s "%TEMP%\*" >nul 2>&1
del /q /f /s "C:\Windows\Temp\*" >nul 2>&1
echo   临时文件已清理
echo.

echo [7/8] 清空回收站...
rd /s /q C:\$Recycle.Bin 2>nul
echo   回收站已清空
echo.

echo [8/8] 清理Windows更新缓存...
net stop wuauserv >nul 2>&1
rd /s /q "C:\Windows\SoftwareDistribution\Download" 2>nul
net start wuauserv >nul 2>&1
echo   Windows更新缓存已清理
echo.

echo ========================================
echo   清理完成！建议重启电脑。
echo ========================================
pause
