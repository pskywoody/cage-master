// charts.js
(function() {
  var style = getComputedStyle(document.documentElement);
  var accent = style.getPropertyValue('--accent').trim();
  var accent2 = style.getPropertyValue('--accent2').trim();
  var ink = style.getPropertyValue('--ink').trim();
  var muted = style.getPropertyValue('--muted').trim();
  var rule = style.getPropertyValue('--rule').trim();
  var bg2 = style.getPropertyValue('--bg2').trim();
  var warn = style.getPropertyValue('--warn').trim();

  // --- Chart 1: 题型分布 ---
  var chart1 = echarts.init(document.getElementById('chart-types'), null, { renderer: 'svg' });
  chart1.setOption({
    animation: false,
    tooltip: { trigger: 'item', appendToBody: true, formatter: '{b}: {c}题 ({d}%)' },
    legend: { bottom: 0, left: 'center', textStyle: { color: ink, fontSize: 13 } },
    series: [{
      type: 'pie',
      radius: ['40%', '70%'],
      center: ['50%', '45%'],
      avoidLabelOverlap: true,
      itemStyle: { borderRadius: 4, borderColor: '#fff', borderWidth: 2 },
      label: { show: true, formatter: '{b}\n{c}题', fontSize: 12, color: ink },
      data: [
        { value: 0, name: '纯杀手题', itemStyle: { color: '#2d2a26' } },
        { value: 80, name: '轻残局', itemStyle: { color: accent } },
        { value: 178, name: '中局题', itemStyle: { color: accent2 } },
        { value: 196, name: '重残局', itemStyle: { color: warn } },
        { value: 46, name: '标准残局', itemStyle: { color: muted } }
      ]
    }]
  });
  window.addEventListener('resize', function() { chart1.resize(); });

  // --- Chart 2: 真实难度 vs 原难度 ---
  var chart2 = echarts.init(document.getElementById('chart-difficulty'), null, { renderer: 'svg' });
  chart2.setOption({
    animation: false,
    tooltip: { trigger: 'axis', appendToBody: true, axisPointer: { type: 'shadow' } },
    legend: { top: 0, textStyle: { color: ink, fontSize: 12 } },
    grid: { top: 40, left: 60, right: 20, bottom: 30 },
    xAxis: {
      type: 'category',
      data: ['入门', '简单', '中等', '困难', '地狱'],
      axisLabel: { color: ink, fontSize: 13 },
      axisLine: { lineStyle: { color: rule } }
    },
    yAxis: {
      type: 'value',
      name: '题目数量',
      nameTextStyle: { color: muted, fontSize: 12 },
      axisLabel: { color: muted, fontSize: 12 },
      splitLine: { lineStyle: { color: rule } }
    },
    series: [
      {
        name: '原难度标记',
        type: 'bar',
        barWidth: '30%',
        itemStyle: { color: bg2, borderColor: rule, borderWidth: 1, borderRadius: [4, 4, 0, 0] },
        data: [100, 100, 100, 100, 100]
      },
      {
        name: 'HumanSimulator实测',
        type: 'bar',
        barWidth: '30%',
        itemStyle: { color: accent, borderRadius: [4, 4, 0, 0] },
        data: [0, 119, 156, 110, 56]
      }
    ]
  });
  window.addEventListener('resize', function() { chart2.resize(); });

})();
