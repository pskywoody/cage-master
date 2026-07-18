@echo off
chcp 65001 >nul
echo ====================================
echo   笼中数独 - 数据构建 Pipeline
echo ====================================
echo.

REM ========== 配置区 ==========
REM 项目根目录
set PROJECT_DIR=D:\killersudoku\cagemaster2

REM 剧本文件路径（如果有新剧本就放这里）
set SCRIPT_FILE=D:\killersudoku\cagemaster2\剧本\最新剧本.txt

REM 输出日志文件
set LOG_FILE=%PROJECT_DIR%\logs\pipeline-%date:~0,4%%date:~5,2%%date:~8,2%.log

REM ========== 执行区 ==========
echo [%date% %time%] Pipeline 开始执行...
echo [%date% %time%] Pipeline 开始执行... >> %LOG_FILE%

echo.
echo [1/4] 检查剧本文件...
if exist "%SCRIPT_FILE%" (
    echo   ✓ 找到剧本文件
    echo   ✓ 找到剧本文件 >> %LOG_FILE%
) else (
    echo   ⚠ 未找到剧本文件，跳过解析步骤
    echo   ⚠ 未找到剧本文件，跳过解析步骤 >> %LOG_FILE%
)

echo.
echo [2/4] 验证 chapters.json 格式...
node "%PROJECT_DIR%\tools\validate-chapters.js" 2>>%LOG_FILE%
if %errorlevel% equ 0 (
    echo   ✓ 数据格式验证通过
) else (
    echo   ✗ 数据格式有误，请检查日志
    echo   ✗ 数据格式验证失败 >> %LOG_FILE%
)

echo.
echo [3/4] 统计剧情数据...
node "%PROJECT_DIR%\tools\story-stats.js" 2>>%LOG_FILE%
echo   ✓ 统计完成

echo.
echo [4/4] 生成备份...
if not exist "%PROJECT_DIR%\data\backups" mkdir "%PROJECT_DIR%\data\backups"
copy "%PROJECT_DIR%\data\chapters.json" "%PROJECT_DIR%\data\backups\chapters-%date:~0,4%%date:~5,2%%date:~8,2%-%time:~0,2%%time:~3,2%.json" >nul
echo   ✓ 备份已生成

echo.
echo ====================================
echo   Pipeline 执行完成！
echo   日志: %LOG_FILE%
echo ====================================
echo.
pause
