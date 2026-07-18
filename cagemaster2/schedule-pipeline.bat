@echo off
chcp 65001 >nul

REM ============================================
REM   笼中数独 - Pipeline 定时调度器
REM ============================================
REM   使用方法：
REM   1. 修改下面的 "运行时间" 配置
REM   2. 双击运行本脚本
REM   3. 脚本会一直运行，到点自动执行 pipeline
REM   4. 按 Ctrl+C 停止
REM ============================================

setlocal

REM ========== 配置区（每天修改这里就行） ==========

REM 运行时间（24小时制，格式 HH:MM）
REM 例如：早上9点 = 09:00，下午3点 = 15:00，凌晨1点 = 01:00
set RUN_TIME=09:00

REM 项目根目录
set PROJECT_DIR=D:\killersudoku\cagemaster2

REM ========== 配置区结束 ==========

echo.
echo ====================================
echo   Pipeline 定时调度器
echo ====================================
echo.
echo   每日运行时间: %RUN_TIME%
echo   项目目录: %PROJECT_DIR%
echo.
echo   按 Ctrl+C 停止运行
echo.
echo ====================================
echo.

:loop

REM 获取当前时间（HH:MM格式）
set CUR_HOUR=%time:~0,2%
set CUR_MIN=%time:~3,2%
set CUR_HOUR=%CUR_HOUR: =0%
set CUR_TIME=%CUR_HOUR%:%CUR_MIN%

REM 检查是否到点了
if "%CUR_TIME%"=="%RUN_TIME%" (
    echo [%date% %time%] 到达运行时间，开始执行 pipeline...
    echo.
    
    call "%PROJECT_DIR%\run-pipeline.bat"
    
    echo.
    echo [%date% %time%] Pipeline 执行完成，等待明天 %RUN_TIME% 再次运行...
    echo.
    
    REM 等待61秒，避免同一分钟内重复触发
    timeout /t 61 /nobreak >nul
    goto :loop
)

REM 每30秒检查一次
timeout /t 30 /nobreak >nul
goto :loop
