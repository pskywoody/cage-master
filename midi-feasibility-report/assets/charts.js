(function() {
  var style = getComputedStyle(document.documentElement);
  var accent = style.getPropertyValue('--accent').trim();
  var accent2 = style.getPropertyValue('--accent2').trim();
  var ink = style.getPropertyValue('--ink').trim();
  var muted = style.getPropertyValue('--muted').trim();
  var rule = style.getPropertyValue('--rule').trim();
  var bg2 = style.getPropertyValue('--bg2').trim();
  var highlight = style.getPropertyValue('--highlight').trim();

  // Colors for charts
  var c1 = accent;
  var c2 = accent2;
  var c3 = highlight;
  var c4 = '#6366f1';
  var c5 = '#ec4899';
  var c6 = '#22c55e';
  var c7 = '#f59e0b';

  // --- Chart: Duration Distribution ---
  var durChart = echarts.init(document.getElementById('chart-duration'), null, { renderer: 'svg' });
  durChart.setOption({
    animation: false,
    tooltip: { trigger: 'axis', appendToBody: true, axisPointer: { type: 'shadow' } },
    legend: { show: false },
    grid: { left: 50, right: 30, top: 10, bottom: 40 },
    xAxis: {
      type: 'category',
      data: ['CH1','CH2','CH3','CH4','CH5','CH6','CH7','Boss','Fanf','Vict','Cage','Ray','Plot','Weav'],
      axisLabel: { color: muted, fontSize: 10, rotate: 30 },
      axisLine: { lineStyle: { color: rule } },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'value', name: '秒', nameTextStyle: { color: muted, fontSize: 11 },
      min: 0, max: 140,
      axisLabel: { color: muted, fontSize: 10 },
      splitLine: { lineStyle: { color: rule, type: 'dashed' } }
    },
    series: [
      {
        type: 'bar',
        data: [
          { value: 102.5, itemStyle: { color: c1 } },
          { value: 111.8, itemStyle: { color: c2 } },
          { value: 107.0, itemStyle: { color: c3 } },
          { value: 99.0, itemStyle: { color: c4 } },
          { value: 95.7, itemStyle: { color: c5 } },
          { value: 104.2, itemStyle: { color: c6 } },
          { value: 114.5, itemStyle: { color: c7 } },
          { value: 118.4, itemStyle: { color: '#ef4444' } },
          { value: 31.8, itemStyle: { color: c3 } },
          { value: 35.7, itemStyle: { color: c2 } },
          { value: 73.2, itemStyle: { color: c2 } },
          { value: 78.1, itemStyle: { color: c4 } },
          { value: 83.3, itemStyle: { color: '#8b5cf6' } },
          { value: 69.5, itemStyle: { color: c5 } }
        ],
        barWidth: 18,
        label: {
          show: true, position: 'top', color: muted, fontSize: 9,
          formatter: function(p) { return p.value + 's'; }
        },
        markLine: {
          silent: true,
          lineStyle: { color: accent, type: 'dashed', width: 1.5 },
          data: [
            { yAxis: 90, label: { formatter: '目标下限 90s', color: muted, fontSize: 10, position: 'insideEndTop' } },
            { yAxis: 120, label: { formatter: '目标上限 120s', color: muted, fontSize: 10, position: 'insideEndTop' } }
          ]
        },
        markArea: {
          silent: true,
          itemStyle: { color: accent2 + '15' },
          data: [[{ yAxis: 15 }, { yAxis: 40 }]]
        }
      }
    ]
  });
  window.addEventListener('resize', function() { durChart.resize(); });

  // --- Chart: File Size Distribution ---
  var sizeChart = echarts.init(document.getElementById('chart-size'), null, { renderer: 'svg' });
  sizeChart.setOption({
    animation: false,
    tooltip: { trigger: 'axis', appendToBody: true, axisPointer: { type: 'shadow' } },
    legend: { show: false },
    grid: { left: 55, right: 30, top: 10, bottom: 40 },
    xAxis: {
      type: 'category',
      data: ['CH1','CH2','CH3','CH4','CH5','CH6','CH7','Boss','Fanf','Vict','Cage','Ray','Plot','Weav'],
      axisLabel: { color: muted, fontSize: 10, rotate: 30 },
      axisLine: { lineStyle: { color: rule } },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'value', name: 'KB', nameTextStyle: { color: muted, fontSize: 11 },
      axisLabel: { color: muted, fontSize: 10 },
      splitLine: { lineStyle: { color: rule, type: 'dashed' } }
    },
    series: [
      {
        type: 'bar',
        data: [
          { value: 12.3, itemStyle: { color: c1 } },
          { value: 9.4, itemStyle: { color: c2 } },
          { value: 9.5, itemStyle: { color: c3 } },
          { value: 7.5, itemStyle: { color: c4 } },
          { value: 7.7, itemStyle: { color: c5 } },
          { value: 10.0, itemStyle: { color: c6 } },
          { value: 8.6, itemStyle: { color: c7 } },
          { value: 20.7, itemStyle: { color: '#ef4444' } },
          { value: 2.6, itemStyle: { color: c3 } },
          { value: 4.5, itemStyle: { color: c2 } },
          { value: 6.6, itemStyle: { color: c2 } },
          { value: 11.9, itemStyle: { color: c4 } },
          { value: 7.8, itemStyle: { color: '#8b5cf6' } },
          { value: 5.7, itemStyle: { color: c5 } }
        ],
        barWidth: 18,
        label: {
          show: true, position: 'top', color: muted, fontSize: 9,
          formatter: function(p) { return p.value + 'KB'; }
        }
      },
      {
        type: 'line',
        data: [12.3, 9.4, 9.5, 7.5, 7.7, 10.0, 8.6, 20.7, 2.6, 4.5, 6.6, 11.9, 7.8, 5.7],
        lineStyle: { color: accent, width: 1.5, type: 'dashed' },
        symbol: 'circle', symbolSize: 4,
        itemStyle: { color: accent },
        label: { show: false },
        markLine: {
          silent: true,
          data: [
            { yAxis: 21.4, label: { formatter: '平均 9.2KB', color: muted, fontSize: 10, position: 'insideEndTop' } }
          ],
          lineStyle: { color: muted, type: 'dotted', width: 1 }
        }
      }
    ]
  });
  window.addEventListener('resize', function() { sizeChart.resize(); });

  // --- Chart: Fit Radar ---
  var radarChart = echarts.init(document.getElementById('chart-radar'), null, { renderer: 'svg' });
  // 各维度评分：调性匹配、节奏匹配、音色匹配、情绪匹配、视觉同步、叙事契合
  radarChart.setOption({
    animation: false,
    tooltip: { appendToBody: true },
    legend: {
      data: ['第1章','第2章','第3章','第4章','第5章','第6章','第7章'],
      textStyle: { color: muted, fontSize: 11 },
      bottom: 0
    },
    radar: {
      indicator: [
        { name: '调性匹配', max: 100 },
        { name: '节奏匹配', max: 100 },
        { name: '音色匹配', max: 100 },
        { name: '情绪匹配', max: 100 },
        { name: '视觉同步', max: 100 },
        { name: '叙事契合', max: 100 }
      ],
      radius: '65%',
      center: ['50%', '45%'],
      splitArea: { areaStyle: { color: ['rgba(139,92,246,0.02)', 'rgba(139,92,246,0.04)'] } },
      axisLine: { lineStyle: { color: rule } },
      splitLine: { lineStyle: { color: rule } },
      axisName: { color: muted, fontSize: 11 }
    },
    series: [
      {
        type: 'radar',
        data: [
          { name: '第1章', value: [95, 90, 93, 92, 90, 88], lineStyle: { color: c1 }, areaStyle: { color: c1 + '30' }, itemStyle: { color: c1 } },
          { name: '第2章', value: [88, 85, 90, 88, 92, 85], lineStyle: { color: c2 }, areaStyle: { color: c2 + '30' }, itemStyle: { color: c2 } },
          { name: '第3章', value: [92, 88, 90, 92, 88, 90], lineStyle: { color: c3 }, areaStyle: { color: c3 + '30' }, itemStyle: { color: c3 } },
          { name: '第4章', value: [93, 85, 92, 90, 85, 92], lineStyle: { color: c4 }, areaStyle: { color: c4 + '30' }, itemStyle: { color: c4 } },
          { name: '第5章', value: [85, 80, 88, 85, 90, 85], lineStyle: { color: c5 }, areaStyle: { color: c5 + '30' }, itemStyle: { color: c5 } },
          { name: '第6章', value: [90, 88, 92, 93, 90, 92], lineStyle: { color: c6 }, areaStyle: { color: c6 + '30' }, itemStyle: { color: c6 } },
          { name: '第7章', value: [95, 92, 95, 95, 92, 95], lineStyle: { color: c7 }, areaStyle: { color: c7 + '30' }, itemStyle: { color: c7 } }
        ]
      }
    ]
  });
  window.addEventListener('resize', function() { radarChart.resize(); });

})();
