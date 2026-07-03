@echo off
echo ========================================
echo   Cage Master - itch.io 打包脚本
echo ========================================
echo.

set OUTPUT_DIR=..\itchio-build
set ZIP_NAME=cage-master-v1.2.zip

echo [1/3] 清理旧文件...
if exist "%OUTPUT_DIR%" rmdir /s /q "%OUTPUT_DIR%"
mkdir "%OUTPUT_DIR%"

echo [2/3] 复制游戏文件...
xcopy /e /i /y game-src "%OUTPUT_DIR%\game-src" >nul

echo [3/3] 创建 zip 包...
powershell -Command "Compress-Archive -Path '%OUTPUT_DIR%\game-src\*' -DestinationPath '%OUTPUT_DIR%\%ZIP_NAME%' -Force"

echo.
echo ========================================
echo   打包完成！
echo   输出文件: %OUTPUT_DIR%\%ZIP_NAME%
echo   itch.io 设置:
echo     - 游戏类型: HTML
echo     - 嵌入方式: Iframe
echo     - 视口宽度: 500
echo     - 视口高度: 800
echo     - 启动文件: start.html (或 menu.html)
echo     - 勾选 "Fullscreen button"
echo ========================================
echo.
pause
