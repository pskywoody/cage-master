// assets/charts.js — i18n 接入报告图表
(function () {
  var style = getComputedStyle(document.documentElement);
  var ink = style.getPropertyValue('--ink').trim();
  var muted = style.getPropertyValue('--muted').trim();
  var rule = style.getPropertyValue('--rule').trim();
  var bg2 = style.getPropertyValue('--bg2').trim();
  var chartGrid = style.getPropertyValue('--chart-grid').trim() || rule;
  var chartAxis = style.getPropertyValue('--chart-axis').trim() || muted;
  var chartLabel = style.getPropertyValue('--chart-label').trim() || muted;
  var chartAccent = style.getPropertyValue('--chart-accent').trim();
  var chartAccent2 = style.getPropertyValue('--chart-accent-2').trim();
  var chartSeries = [
    style.getPropertyValue('--chart-series-1').trim(),
    style.getPropertyValue('--chart-series-2').trim(),
    style.getPropertyValue('--chart-series-3').trim(),
    style.getPropertyValue('--chart-series-4').trim()
  ];
  var chartOther = style.getPropertyValue('--chart-other').trim() || muted;

  var tooltipBase = { appendToBody: true, backgroundColor: style.getPropertyValue('--chart-tooltip-bg').trim() || '#fff', borderColor: rule, textStyle: { color: ink, fontSize: 12 } };

  // --- Chart 1: 四语键数对比（堆叠条形） ---
  var el1 = document.getElementById('chart-keys');
  if (el1) {
    var c1 = echarts.init(el1, null, { renderer: 'svg' });
    c1.setOption({
      animation: false,
      tooltip: Object.assign({ trigger: 'axis', axisPointer: { type: 'shadow' } }, tooltipBase),
      legend: { bottom: 0, textStyle: { color: chartLabel, fontSize: 12 }, itemWidth: 14, itemHeight: 8 },
      grid: { left: 60, right: 24, top: 20, bottom: 44 },
      xAxis: {
        type: 'value', axisLine: { lineStyle: { color: chartAxis } },
        axisLabel: { color: chartLabel }, splitLine: { lineStyle: { color: chartGrid } }
      },
      yAxis: {
        type: 'category', data: ['zh-CN', 'en-US', 'ja-JP', 'ko-KR'],
        axisLine: { lineStyle: { color: chartAxis } }, axisLabel: { color: ink, fontSize: 13 }
      },
      series: [
        { name: 'ui', type: 'bar', stack: 't', barWidth: 26, itemStyle: { color: chartSeries[0] }, data: [912, 912, 912, 912] },
        { name: 'levels', type: 'bar', stack: 't', itemStyle: { color: chartSeries[1] }, data: [516, 516, 516, 516] },
        { name: 'chapters', type: 'bar', stack: 't', itemStyle: { color: chartSeries[2] }, data: [14, 14, 14, 14] },
        { name: 'boss', type: 'bar', stack: 't', itemStyle: { color: chartSeries[3] }, data: [7, 7, 7, 7] }
      ]
    });
    window.addEventListener('resize', function () { c1.resize(); });
  }

  // --- Chart 2: ui.json 命名空间分布（Top 20） ---
  var el2 = document.getElementById('chart-ns');
  if (el2) {
    var ns = [
      ['gallery 图鉴', 339], ['toast 提示', 109], ['book 书壳', 65], ['settings 设置', 45],
      ['game 游戏', 42], ['boss Boss战', 35], ['investigation 调查', 29], ['inkText 墨迹', 27],
      ['achievement 成就', 22], ['replay 回放', 20], ['bookShell 书壳页', 20], ['complete 通关', 18],
      ['battleReport 战报', 18], ['pause 暂停', 17], ['whatIf 假设', 12], ['ledgerHint 账本', 12],
      ['freeplay 自由', 12], ['levelSelect 选关', 11], ['combo 连击', 9], ['err 错误', 13]
    ];
    ns.sort(function (a, b) { return a[1] - b[1]; });
    var c2 = echarts.init(el2, null, { renderer: 'svg' });
    c2.setOption({
      animation: false,
      tooltip: Object.assign({ trigger: 'axis', axisPointer: { type: 'shadow' } }, tooltipBase),
      grid: { left: 120, right: 40, top: 12, bottom: 24 },
      xAxis: {
        type: 'value', axisLine: { lineStyle: { color: chartAxis } },
        axisLabel: { color: chartLabel }, splitLine: { lineStyle: { color: chartGrid } }
      },
      yAxis: {
        type: 'category', data: ns.map(function (d) { return d[0]; }),
        axisLine: { lineStyle: { color: chartAxis } }, axisLabel: { color: ink, fontSize: 12 }
      },
      series: [{
        name: '键数', type: 'bar', barWidth: 14,
        itemStyle: { color: chartSeries[0], borderRadius: [0, 3, 3, 0] },
        label: { show: true, position: 'right', color: muted, fontSize: 11 },
        data: ns.map(function (d) { return d[1]; })
      }]
    });
    window.addEventListener('resize', function () { c2.resize(); });
  }

  // --- Lightbox ---
  var lb = document.getElementById('lightbox');
  if (lb) {
    var lbImg = lb.querySelector('img');
    document.querySelectorAll('.diagram img, .figure-row img, .figure-grid img, .annotated img').forEach(function (img) {
      img.style.cursor = 'zoom-in';
      img.addEventListener('click', function () {
        lbImg.src = this.src;
        lbImg.alt = this.alt;
        lb.classList.add('active');
      });
    });
    lb.addEventListener('click', function () { lb.classList.remove('active'); });
  }
})();