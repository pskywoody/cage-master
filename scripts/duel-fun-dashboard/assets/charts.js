// duel-fun-dashboard charts
(function () {
  var D = window.DASH_DATA;
  if (!D) return;

  var style = getComputedStyle(document.documentElement);
  var accent = style.getPropertyValue('--accent').trim();
  var accent2 = style.getPropertyValue('--accent2').trim();
  var ink = style.getPropertyValue('--ink').trim();
  var muted = style.getPropertyValue('--muted').trim();
  var rule = style.getPropertyValue('--rule').trim();
  var bg2 = style.getPropertyValue('--bg2').trim();
  var ok = style.getPropertyValue('--ok').trim();

  // ---- 数据预处理 ----
  var matrix = D.matrix;
  var cells = [];
  Object.keys(matrix).forEach(function (cd) {
    Object.keys(matrix[cd]).forEach(function (sm) {
      Object.keys(matrix[cd][sm]).forEach(function (fg) {
        var c = matrix[cd][sm][fg];
        cells.push({
          cd: +cd, sm: +sm, fg: +fg,
          total: c.fun.total, pacing: c.fun.tempo, risk: c.fun.risk, climax: c.fun.climax,
          interceptRate: c.interceptRateMean, parryRate: c.parryRateMean,
          deathblowPerRound: c.deathblowPerRound, winMarginAvg: c.winMarginAvg,
          hotPotato: c.hotPotatoAvg, win: c.win, completeAvg: c.deathblowCompleteAvg,
        });
      });
    });
  });
  // 最佳组合
  cells.sort(function (a, b) { return b.total - a.total; });
  var best = cells[0];
  // 平均组合
  var avgP = 0, avgR = 0, avgC = 0, avgT = 0;
  cells.forEach(function (c) { avgP += c.pacing; avgR += c.risk; avgC += c.climax; avgT += c.total; });
  avgP = Math.round(avgP / cells.length); avgR = Math.round(avgR / cells.length);
  avgC = Math.round(avgC / cells.length); avgT = Math.round(avgT / cells.length);

  // ---- 元信息 ----
  document.getElementById('meta-level').textContent = D.meta.level;
  document.getElementById('meta-player').textContent = D.meta.player;
  document.getElementById('meta-rounds').textContent = D.meta.rounds;
  document.getElementById('meta-date').textContent = D.meta.generated;

  // ---- 最佳组合卡片 ----
  function badge(okFlag) {
    return okFlag ? '<span class="badge ok">健康</span>' : '<span class="badge bad">偏离</span>';
  }
  function health(v, lo, hi) {
    return v >= lo && v <= hi;
  }
  var bestWinPct = Math.round(best.win.ying / (best.win.ying + best.win.ayan + best.win.draw || 1) * 100);
  document.getElementById('best-cards').innerHTML =
    '<div class="card"><div class="label">最佳组合</div><div class="value">冷却 ' + best.cd + ' 回合 · 蓄力 ' + (best.sm / 1000).toFixed(1) + 's · 专注 +' + best.fg + '</div>' +
    '<div class="note">综合好玩分 <b style="color:' + accent + '">' + best.total + '</b> / 100</div></div>' +
    '<div class="card"><div class="label">三维度</div><div class="value">' + best.pacing + ' / ' + best.risk + ' / ' + best.climax + '</div>' +
    '<div class="note">节奏 / 风险 / 爆发</div></div>' +
    '<div class="card"><div class="label">对局质量</div><div class="value">' + bestWinPct + '%<small> 胜率</small></div>' +
    '<div class="note">拦截 ' + best.interceptRate + '% · 忍杀 ' + best.deathblowPerRound + ' 次/局 · 领先 ' + best.winMarginAvg + ' 格</div></div>';

  // ---- 雷达图：最佳 vs 平均 ----
  var radar = echarts.init(document.getElementById('chart-radar'), null, { renderer: 'svg' });
  radar.setOption({
    animation: false,
    tooltip: { trigger: 'item', appendToBody: true },
    legend: { bottom: 0, textStyle: { color: muted }, data: ['最佳组合', '27 格平均'] },
    radar: {
      indicator: [
        { name: '攻防节奏', max: 100 },
        { name: '风险回报', max: 100 },
        { name: '终结爆发', max: 100 },
      ],
      axisName: { color: ink, fontSize: 12 },
      splitLine: { lineStyle: { color: rule } },
      splitArea: { show: false },
      axisLine: { lineStyle: { color: rule } },
    },
    series: [{
      type: 'radar',
      data: [
        { value: [best.pacing, best.risk, best.climax], name: '最佳组合', areaStyle: { color: accent + '44' }, lineStyle: { color: accent }, itemStyle: { color: accent } },
        { value: [avgP, avgR, avgC], name: '27 格平均', areaStyle: { color: accent2 + '33' }, lineStyle: { color: accent2 }, itemStyle: { color: accent2 } },
      ],
    }],
  });
  window.addEventListener('resize', function () { radar.resize(); });

  // ---- 散点：27 格好玩分分布 ----
  var scatter = echarts.init(document.getElementById('chart-scatter'), null, { renderer: 'svg' });
  var scatterData = cells.map(function (c, i) {
    return [i, c.total, c.cd + '回合/' + (c.sm / 1000) + 's/+' + c.fg];
  });
  scatter.setOption({
    animation: false,
    tooltip: { trigger: 'item', appendToBody: true, formatter: function (p) { return p.value[2] + ' → ' + p.value[1] + ' 分'; } },
    grid: { left: 40, right: 20, top: 20, bottom: 36 },
    xAxis: { type: 'category', data: cells.map(function (_, i) { return i + 1; }), axisLabel: { color: muted }, axisLine: { lineStyle: { color: rule } } },
    yAxis: { type: 'value', min: 0, max: 100, axisLabel: { color: muted }, splitLine: { lineStyle: { color: rule } } },
    series: [{
      type: 'scatter',
      symbolSize: 12,
      data: scatterData,
      itemStyle: { color: function (p) { return p.value[1] >= 60 ? accent : (p.value[1] >= 40 ? accent2 : muted); } },
    }],
  });
  window.addEventListener('resize', function () { scatter.resize(); });

  // ---- 热力图 1：冷却 × 专注（蓄力 3000）----
  function heatmapData(fixedKey, fixedVal, xKey, yKey) {
    var out = [];
    var yVals = Object.keys(matrix[fixedVal] ? matrix[fixedVal] : {}).map(Number);
    if (fixedKey === 'sm') yVals = Object.keys(matrix).map(Number);
    var xVals = yKey === 'fg' ? [1, 3, 5] : Object.keys(matrix['1']['3000'] ? matrix['1']['3000'] : {}).map(Number);
    // 通用取法：直接遍历
    out = [];
    var xSet = [], ySet = [];
    Object.keys(matrix).forEach(function (cd) {
      Object.keys(matrix[cd]).forEach(function (sm) {
        Object.keys(matrix[cd][sm]).forEach(function (fg) {
          var cell = { cd: +cd, sm: +sm, fg: +fg, total: matrix[cd][sm][fg].fun.total };
          var xv = cell[xKey], yv = cell[yKey];
          var keep = (fixedKey === 'sm' && cell.sm === fixedVal) || (fixedKey === 'cd' && cell.cd === fixedVal);
          if (keep) {
            if (xSet.indexOf(xv) < 0) xSet.push(xv);
            if (ySet.indexOf(yv) < 0) ySet.push(yv);
            out.push([xv, yv, cell.total]);
          }
        });
      });
    });
    xSet.sort(function (a, b) { return a - b; });
    ySet.sort(function (a, b) { return a - b; });
    return { xSet: xSet, ySet: ySet, data: out };
  }

  function renderHeatmap(elId, hd, xLabel, yLabel) {
    var chart = echarts.init(document.getElementById(elId), null, { renderer: 'svg' });
    var full = hd.data.slice();
    hd.ySet.forEach(function (yi, yIdx) {
      hd.xSet.forEach(function (xi, xIdx) {
        if (!hd.data.some(function (d) { return d[0] === xi && d[1] === yi; })) {
          full.push([xIdx, yIdx, '-']);
        }
      });
    });
    full = full.map(function (d) {
      if (d[2] === '-') return [d[0], d[1], '-'];
      return [hd.xSet.indexOf(d[0]), hd.ySet.indexOf(d[1]), d[2]];
    });
    chart.setOption({
      animation: false,
      tooltip: {
        appendToBody: true,
        formatter: function (p) {
          if (p.value[2] === '-') return '无数据';
          return xLabel + ' ' + hd.xSet[p.value[0]] + ' · ' + yLabel + ' ' + hd.ySet[p.value[1]] + ' → ' + p.value[2] + ' 分';
        },
      },
      grid: { left: 60, right: 20, top: 30, bottom: 50 },
      xAxis: {
        type: 'category', data: hd.xSet.map(function (v) { return xLabel + ' ' + v; }),
        axisLabel: { color: muted }, axisLine: { lineStyle: { color: rule } },
      },
      yAxis: {
        type: 'category', data: hd.ySet.map(function (v) { return yLabel + ' ' + v; }),
        axisLabel: { color: muted }, axisLine: { lineStyle: { color: rule } },
      },
      visualMap: {
        min: 20, max: 70, calculable: false, orient: 'horizontal', left: 'center', bottom: 0,
        inRange: { color: [bg2, accent2, accent] },
        textStyle: { color: muted },
      },
      series: [{
        type: 'heatmap',
        data: full,
        splitArea: { show: false },
        label: {
          show: true,
          formatter: function (p) { return p.value[2] === '-' ? 'N/A' : p.value[2]; },
          color: ink, fontSize: 11,
        },
      }],
    });
    window.addEventListener('resize', function () { chart.resize(); });
  }

  renderHeatmap('chart-heat-cd-fg', heatmapData('sm', 3000, 'cd', 'fg'), '冷却(回合)', '专注+');
  renderHeatmap('chart-heat-sm-fg', heatmapData('cd', 5, 'sm', 'fg'), '蓄力(s)', '专注+');

  // ---- 敏感性折线 ----
  // 专注 → 忍杀频率（固定 cd=5, sm=3000）
  var fgLine = echarts.init(document.getElementById('chart-sens-fg'), null, { renderer: 'svg' });
  var fgData = [1, 3, 5, 8].map(function (fg) { return [fg, matrix['5']['3000'][fg].deathblowPerRound]; });
  fgLine.setOption({
    animation: false,
    tooltip: { trigger: 'axis', appendToBody: true },
    grid: { left: 44, right: 20, top: 24, bottom: 36 },
    xAxis: { type: 'category', data: ['+1', '+3', '+5', '+8'], axisLabel: { color: muted }, axisLine: { lineStyle: { color: rule } }, name: '专注收益' },
    yAxis: { type: 'value', name: '忍杀/局', axisLabel: { color: muted }, splitLine: { lineStyle: { color: rule } } },
    series: [{
      type: 'line', data: fgData.map(function (d) { return d[1]; }), smooth: true,
      lineStyle: { color: accent, width: 2 }, itemStyle: { color: accent }, symbolSize: 8,
      areaStyle: { color: accent + '22' },
      markLine: { data: [{ yAxis: 1 }, { yAxis: 3 }], lineStyle: { color: ok, type: 'dashed' }, label: { formatter: '目标 1-3', color: ok, fontSize: 10 } },
    }],
  });
  window.addEventListener('resize', function () { fgLine.resize(); });

  // 冷却 → 拦截率（固定 sm=3000, fg=5）
  var cdLine = echarts.init(document.getElementById('chart-sens-cd'), null, { renderer: 'svg' });
  var cdData = [1, 3, 5, 8, 12].map(function (cd) { return [cd, matrix[cd]['3000']['5'].interceptRateMean]; });
  cdLine.setOption({
    animation: false,
    tooltip: { trigger: 'axis', appendToBody: true },
    grid: { left: 44, right: 20, top: 24, bottom: 36 },
    xAxis: { type: 'category', data: ['1回合', '3回合', '5回合', '8回合', '12回合'], axisLabel: { color: muted }, axisLine: { lineStyle: { color: rule } }, name: '拦截冷却' },
    yAxis: { type: 'value', name: '拦截率 %', axisLabel: { color: muted }, splitLine: { lineStyle: { color: rule } } },
    series: [{
      type: 'line', data: cdData.map(function (d) { return d[1]; }), smooth: true,
      lineStyle: { color: accent2, width: 2 }, itemStyle: { color: accent2 }, symbolSize: 8,
      areaStyle: { color: accent2 + '22' },
      markLine: { data: [{ yAxis: 20 }, { yAxis: 30 }], lineStyle: { color: ok, type: 'dashed' }, label: { formatter: '目标 20-30%', color: ok, fontSize: 10 } },
    }],
  });
  window.addEventListener('resize', function () { cdLine.resize(); });

  // ---- 时间线 ----
  var tl = D.timeline;
  var tlChart = echarts.init(document.getElementById('chart-timeline'), null, { renderer: 'svg' });
  var steps = tl.timeline.map(function (t) { return t.step; });
  var yingLine = tl.timeline.map(function (t) { return t.ying; });
  var ayanLine = tl.timeline.map(function (t) { return t.ayan; });
  var diffLine = tl.timeline.map(function (t) { return t.ying - t.ayan; });
  tlChart.setOption({
    animation: false,
    tooltip: { trigger: 'axis', appendToBody: true },
    legend: { top: 0, textStyle: { color: muted }, data: ['莹莹(玩家侧)', '阿妍(AI侧)', '净差值'] },
    grid: { left: 44, right: 44, top: 36, bottom: 36 },
    xAxis: { type: 'category', data: steps, axisLabel: { color: muted, interval: 25 }, axisLine: { lineStyle: { color: rule } }, name: '步数' },
    yAxis: { type: 'value', axisLabel: { color: muted }, splitLine: { lineStyle: { color: rule } }, name: '占格数' },
    series: [
      { name: '莹莹(玩家侧)', type: 'line', data: yingLine, lineStyle: { color: accent, width: 2 }, itemStyle: { color: accent }, showSymbol: false, areaStyle: { color: accent + '18' } },
      { name: '阿妍(AI侧)', type: 'line', data: ayanLine, lineStyle: { color: accent2, width: 2 }, itemStyle: { color: accent2 }, showSymbol: false, areaStyle: { color: accent2 + '18' } },
      { name: '净差值', type: 'line', data: diffLine, lineStyle: { color: muted, width: 1, type: 'dashed' }, itemStyle: { color: muted }, showSymbol: false },
    ],
  });
  window.addEventListener('resize', function () { tlChart.resize(); });

  // ---- 设计原则（v4：1600 局 80 组矩阵结论）----
  document.getElementById('principle-box').innerHTML =
    '<h4>从 1600 局数据反推的设计原则</h4>' +
    '<ul>' +
    '<li><b style="color:' + accent + '">专注基础收益是"处决时机"的精确旋钮</b> —— 盘面完成度随它单调变化（+1→84%、+3→80%、+5→71%、+8→59%），+5~+8 把忍杀落在 50%-80% 高潮区，同时让胜率跌向 35-50%（阿妍能攒忍杀反制 → 对局变胶着）。</li>' +
    '<li><b style="color:' + accent2 + '">拦截冷却不是主旋钮</b> —— 1→12 回合仅让拦截率从 18% 滑到 10%，且 std 大（4-14%）。拦截价值由"概率判定 + 幽灵格信息差"决定，调冷却只会误伤决策深度。</li>' +
    '<li><b style="color:' + muted + '">蓄力时长对招架率失真</b> —— 全区间 66-90%（远超 40-60% 目标），脚本强制招架 + 全知 AI 所致。真实招架率需等玩家侧 AI 自主感知蓄力格后才能测准。</li>' +
    '<li><b style="color:' + ink + '">审稿标准（新机制自检）</b>：这个改动增加的是"决策深度"（估算对手专注/冷却/蓄力窗口）还是"复杂度"（更多随机扰动）？前者是玩法，后者是噪音。</li>' +
    '</ul>';
})();
