(function() {
  var style = getComputedStyle(document.documentElement);
  var accent = style.getPropertyValue('--accent').trim();
  var accent2 = style.getPropertyValue('--accent2').trim();
  var ink = style.getPropertyValue('--ink').trim();
  var muted = style.getPropertyValue('--muted').trim();
  var rule = style.getPropertyValue('--rule').trim();
  var bg2 = style.getPropertyValue('--bg2').trim();

  // --- Chart: Positioning Map ---
  var chart1 = echarts.init(document.getElementById('chart-positioning'), null, { renderer: 'svg' });
  chart1.setOption({
    animation: false,
    tooltip: {
      trigger: 'item',
      formatter: function(p) {
        return '<strong>' + p.data[2] + '</strong><br>教学深度: ' + p.data[0] + '<br>产品成熟度: ' + p.data[1];
      },
      appendToBody: true
    },
    xAxis: {
      name: '产品成熟度 →',
      nameLocation: 'center',
      nameGap: 30,
      min: 1,
      max: 10,
      axisLine: { lineStyle: { color: rule } },
      axisLabel: { color: muted },
      nameTextStyle: { color: muted, fontWeight: 600 },
      splitLine: { show: true, lineStyle: { color: rule, type: 'dashed' } }
    },
    yAxis: {
      name: '教学/引导深度 →',
      nameLocation: 'center',
      nameGap: 40,
      min: 1,
      max: 10,
      axisLine: { lineStyle: { color: rule } },
      axisLabel: { color: muted },
      nameTextStyle: { color: muted, fontWeight: 600 },
      splitLine: { show: true, lineStyle: { color: rule, type: 'dashed' } }
    },
    series: [{
      type: 'scatter',
      symbolSize: function(val) { return val[0] === 9 ? 26 : 18; },
      data: [
        [2, 9, '本项目', 'circle', accent, 26],
        [4, 3, '杀手数独大师', 'circle', muted, 18],
        [6, 2, 'Killer Sudoku\n(Ting Yeung)', 'circle', muted, 18],
        [9, 1, 'Sudoku by Brainium', 'circle', muted, 18],
        [9, 2, 'Microsoft Sudoku', 'circle', muted, 18],
        [8, 1, 'Sudoku.com', 'circle', muted, 18]
      ],
      encode: { x: 0, y: 1 },
      itemStyle: {
        color: function(p) { return p.data[3] === 'accent' ? accent : muted; }
      },
      label: {
        show: true,
        formatter: function(p) { return p.data[2]; },
        position: 'right',
        fontSize: 11,
        fontWeight: 600,
        color: ink,
        lineHeight: 14
      },
      markArea: {
        silent: true,
        data: [[{
          name: '蓝海区：教育型杀手数独',
          yAxis: 6,
          xAxis: 0,
          itemStyle: { color: accent + '15' }
        }, {
          yAxis: 10,
          xAxis: 5
        }]]
      }
    }],
    grid: { top: 30, bottom: 50, left: 60, right: 140 }
  });
  window.addEventListener('resize', function() { chart1.resize(); });
})();
