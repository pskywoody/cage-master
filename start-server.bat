@echo off
REM ============================================================
REM  CageMaster4 一键本地服务器启动器
REM  用途：双击即用，启动静态服务器并打开游戏入口
REM  入口：http://localhost:8081/game.html  （不是 index.html）
REM  说明：本游戏是 ES Module + fetch 架构，必须用本地服务器，
REM        直接双击 game.html (file://) 会白屏 / 进不了游戏。
REM        默认端口用 8081：若 8080 被其它进程抢占，不必清理，
REM        本启动器直接起 8081 即可正常游戏。
REM ============================================================
cd /d D:\killersudoku\cagemaster4

REM 先尝试打开浏览器（若 8081 上已有服务则直接打开）
start "" http://localhost:8081/game.html

REM 仅当 8081 端口没有被占用时才启动服务器
netstat -ano | findstr :8081 >nul
if errorlevel 1 (
  where python3 >nul 2>nul && (
    python3 scripts/dev-server.py
  ) || (
    python scripts/dev-server.py
  )
) else (
  echo [OK] 8081 端口已有服务在运行，游戏已在浏览器打开。
  echo       按任意键退出此窗口（不会影响已运行的服务器）。
  pause >nul
)
