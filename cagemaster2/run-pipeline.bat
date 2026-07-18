@echo off
chcp 65001 >nul

REM ============================================
REM   笼中数独 - 数据构建 Pipeline (立即执行版)
REM ============================================
REM   双击即可运行，执行完整的数据检查和评估
REM ============================================

setlocal

REM ========== 配置区（可修改） ==========

REM 项目根目录
set PROJECT_DIR=D:\killersudoku\cagemaster2

REM 日志目录
set LOG_DIR=%PROJECT_DIR%\logs

REM 备份目录
set BACKUP_DIR=%PROJECT_DIR%\data\backups

REM ========== 初始化 ==========

if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"
if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"

REM 时间戳
set TIMESTAMP=%date:~0,4%%date:~5,2%%date:~8,2%_%time:~0,2%%time:~3,2%
set TIMESTAMP=%TIMESTAMP: =0%
set LOG_FILE=%LOG_DIR%\pipeline-%TIMESTAMP%.log

echo.
echo ====================================
echo   笼中数独 - 数据构建 Pipeline
echo ====================================
echo.
echo  开始时间: %date% %time%
echo  日志文件: %LOG_FILE%
echo.

REM ========== 第1步：数据备份 ==========
echo [1/5] 备份数据文件...
copy "%PROJECT_DIR%\data\chapters.json" "%BACKUP_DIR%\chapters-%TIMESTAMP%.json" >nul 2>&1
echo   ✓ 备份完成
echo [1/5] 备份数据文件... >> "%LOG_FILE%"
echo   ✓ 备份完成 >> "%LOG_FILE%"

REM ========== 第2步：格式验证 ==========
echo.
echo [2/5] 验证 chapters.json 格式...
node "%PROJECT_DIR%\tools\validate-chapters.js" >> "%LOG_FILE%" 2>&1
if %errorlevel% equ 0 (
    echo   ✓ 数据格式验证通过
) else (
    echo   ✗ 数据格式有误，请查看日志
    goto :end
)

REM ========== 第3步：剧情统计 ==========
echo.
echo [3/5] 统计剧情数据...
node "%PROJECT_DIR%\tools\story-stats.js" >> "%LOG_FILE%" 2>&1
echo   ✓ 统计完成

REM ========== 第4步：引导质量评估 ==========
echo.
echo [4/5] 评估教学引导质量...
node "%PROJECT_DIR%\tools\assess-tutorials.js" >> "%LOG_FILE%" 2>&1
if %errorlevel% equ 0 (
    echo   ✓ 评估完成（无严重问题）
) else (
    echo   ⚠ 评估完成（发现问题，请查看报告）
)

REM ========== 第5步：生成汇总报告 ==========
echo.
echo [5/5] 生成汇总报告...
set REPORT_FILE=%PROJECT_DIR%\docs\pipeline-latest-report.md
echo # Pipeline 运行报告 > "%REPORT_FILE%"
echo. >> "%REPORT_FILE%"
echo 生成时间: %date% %time% >> "%REPORT_FILE%"
echo. >> "%REPORT_FILE%"
echo --- >> "%REPORT_FILE%"
echo. >> "%REPORT_FILE%"
echo ## 教学引导质量评估 >> "%REPORT_FILE%"
echo. >> "%REPORT_FILE%"
type "%PROJECT_DIR%\docs\教学引导质量评估报告.md" >> "%REPORT_FILE%"
echo   ✓ 报告已生成

REM ========== 结束 ==========

:end
echo.
echo ====================================
echo   Pipeline 执行完成！
echo   详细日志: %LOG_FILE%
echo   评估报告: %PROJECT_DIR%\docs\教学引导质量评估报告.md
echo ====================================
echo.
pause
