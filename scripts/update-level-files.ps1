# ============================================================
#  Update level data files for new script (chapters 2-7)
#  1. Update titles to match new script
#  2. Move isBoss from old boss levels to new level-9 bosses
#  3. Create missing level files by cloning same-chapter puzzles
# ============================================================
$ErrorActionPreference = 'Stop'
$dir = 'd:\killersudoku\cagemaster4\data\levels'

# levelId -> @{ title=...; boss=$true; cloneFrom=... }
$levels = @{
  # ---- Chapter 2 (all exist) ----
  201 = @{ title = 'B1回廊' }
  202 = @{ title = '岔路残简' }
  203 = @{ title = '桥洞一瞬' }
  204 = @{ title = '72号旧居' }
  205 = @{ title = '旧稿破译' }
  206 = @{ title = '返回地下' }
  207 = @{ title = 'B2石室入口' }
  208 = @{ title = 'B2空室' }
  209 = @{ title = '石室留痕'; boss = $true }
  # ---- Chapter 3 ----
  301 = @{ title = '暗门' }
  302 = @{ title = 'B1走廊' }
  303 = @{ title = 'B2密室' }
  304 = @{ title = '七道题·一' }
  305 = @{ title = '七道题·二' }
  306 = @{ title = '七道题·三' }
  307 = @{ title = 'B3入口' }
  308 = @{ title = '发报机'; cloneFrom = 301 }
  309 = @{ title = '最深处的门'; boss = $true; cloneFrom = 302 }
  # ---- Chapter 4 ----
  401 = @{ title = '东余杭路94号' }
  402 = @{ title = '402房' }
  403 = @{ title = '403房' }
  404 = @{ title = '404房' }
  405 = @{ title = '潘汉年的字条' }
  406 = @{ title = '路路通茶馆' }
  407 = @{ title = '另一条路'; cloneFrom = 401 }
  408 = @{ title = '备用电台'; cloneFrom = 402 }
  409 = @{ title = '三重对齐'; boss = $true; cloneFrom = 403 }
  # ---- Chapter 5 ----
  501 = @{ title = '发报机的准备' }
  502 = @{ title = '断电' }
  503 = @{ title = '测向车' }
  504 = @{ title = '第一组电文' }
  505 = @{ title = '第二组电文' }
  506 = @{ title = '第三组电文' }
  507 = @{ title = '天亮前的撤离'; cloneFrom = 501 }
  508 = @{ title = '山田的档案'; cloneFrom = 502 }
  509 = @{ title = '天亮'; boss = $true; cloneFrom = 503 }
  # ---- Chapter 6 ----
  601 = @{ title = '账房' }
  602 = @{ title = '书店' }
  603 = @{ title = '四号桥' }
  604 = @{ title = '路路通旧址' }
  605 = @{ title = '发报机' }
  606 = @{ title = '痕迹' }
  607 = @{ title = '山田的搜查'; cloneFrom = 601 }
  608 = @{ title = '沈世安的痕迹'; cloneFrom = 602 }
  609 = @{ title = '潘汉年'; boss = $true; cloneFrom = 603 }
  # ---- Chapter 7 ----
  701 = @{ title = '西郊仓库' }
  702 = @{ title = '狄思威路72号' }
  703 = @{ title = '霞飞路旧书店' }
  704 = @{ title = '苏州河' }
  705 = @{ title = '符拉迪沃斯托克' }
  706 = @{ title = '帐房' }
  707 = @{ title = '船'; cloneFrom = 701 }
  708 = @{ title = '雾'; cloneFrom = 702 }
  709 = @{ title = '库房'; boss = $true; cloneFrom = 703 }
}

# Teaching-related fields to strip from cloned files
$stripFields = @('teachingGoal','triggers','lessonPlan','threeAct','coreMove',
  'breakPointIndex','totalSteps','nakedSingleRatio','targetTechnique',
  'mode','difficultyLevel','preDialog','clearDialog')

$updated = 0
$created = 0
foreach ($id in ($levels.Keys | Sort-Object)) {
  $info = $levels[$id]
  $path = Join-Path $dir "level-$id.json"
  if (Test-Path $path) {
    $j = Get-Content $path -Raw -Encoding UTF8 | ConvertFrom-Json
    $j.title = $info.title
    if ($info.ContainsKey('boss')) {
      if ($info.boss) { $j | Add-Member -NotePropertyName isBoss -NotePropertyValue $true -Force }
      else { $j.PSObject.Properties.Remove('isBoss') }
    }
    $json = $j | ConvertTo-Json -Depth 40
    [System.IO.File]::WriteAllText($path, $json, (New-Object System.Text.UTF8Encoding $false))
    $updated++
  } elseif ($info.ContainsKey('cloneFrom')) {
    $srcPath = Join-Path $dir "level-$($info.cloneFrom).json"
    $src = Get-Content $srcPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $j = $src.PSObject.Copy()
    $j.levelId = $id
    $j.title = $info.title
    foreach ($f in $stripFields) {
      if ($j.PSObject.Properties[$f]) { $j.PSObject.Properties.Remove($f) }
    }
    if ($info.ContainsKey('boss') -and $info.boss) {
      $j | Add-Member -NotePropertyName isBoss -NotePropertyValue $true -Force
    } else {
      if ($j.PSObject.Properties['isBoss']) { $j.PSObject.Properties.Remove('isBoss') }
    }
    $json = $j | ConvertTo-Json -Depth 40
    [System.IO.File]::WriteAllText($path, $json, (New-Object System.Text.UTF8Encoding $false))
    $created++
  } else {
    Write-Host "WARN: level-$id missing and no clone source"
  }
}
Write-Host "Updated: $updated, Created: $created"
