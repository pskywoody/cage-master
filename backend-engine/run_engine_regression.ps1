# -*- coding: utf-8 -*-
<#
run_engine_regression.ps1 —— Backend Engine 回归护栏一键运行
============================================================
本目录（backend-engine/）存放覆盖审计 + 回归护栏产物；引擎源码本体位于
D:\bestbay\backend（不在本工作区）。本脚本负责桥接引擎源码路径与 Python
虚拟环境，跑通 Step 1 覆盖测试 + Step 2 回归测试。

用法（在 backend-engine/ 目录）：
    .\run_engine_regression.ps1            # 跑覆盖 + 回归（漂移比对）
    .\run_engine_regression.ps1 -ReGenSnap # 强制重建 golden 快照
#>
param([switch]$ReGenSnap)

$ErrorActionPreference = 'Stop'

$py  = 'C:\Users\pskyw\.workbuddy\binaries\python\envs\default\Scripts\python.exe'
$src = 'D:\bestbay\backend\src'
$dir = $PSScriptRoot

if (-not (Test-Path $py))  { Write-Error "找不到 Python 环境: $py" }
if (-not (Test-Path $src)) { Write-Error "找不到引擎源码: $src" }

$env:RULE_COV_SRC        = $src
$env:REGRESSION_BASELINE = Join-Path $dir 'engine_cases.json'
$env:REGRESSION_CASES    = Join-Path $dir 'engine_regression.json'
$env:REGRESSION_SNAPSHOT = Join-Path $dir 'engine_regression_snapshot.json'

Write-Host "== Step 1: Rule Coverage =="
& $py (Join-Path $dir 'test_rule_coverage.py')
if ($LASTEXITCODE -ne 0) { throw '覆盖测试失败' }

Write-Host "`n== Step 2: Batch Judge Regression =="
& $py (Join-Path $dir 'test_engine_regression.py') $(if ($ReGenSnap) { '--gen' })
if ($LASTEXITCODE -ne 0) { throw '回归测试失败' }

Write-Host "`n[OK] All engine regression checks passed."