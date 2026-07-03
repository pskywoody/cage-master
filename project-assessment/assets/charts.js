(function() {
  var style = getComputedStyle(document.documentElement);
  var accent = style.getPropertyValue('--accent').trim();
  var accent2 = style.getPropertyValue('--accent2').trim();
  var accent3 = style.getPropertyValue('--accent3').trim();
  var danger = style.getPropertyValue('--danger').trim();
  var ink = style.getPropertyValue('--ink').trim();
  var muted = style.getPropertyValue('--muted').trim();
  var rule = style.getPropertyValue('--rule').trim();
  var bg2 = style.getPropertyValue('--bg2').trim();

  // --- Chart: Radar - 功能完成度 ---
  var chartRadar = echarts.init(document.getElementById('chart-radar'), null, { renderer: 'svg' });
  chartRadar.setOption({
    animation: false,
    tooltip: { trigger: 'item', appendToBody: true },
    radar: {
      indicator: [
        { name: '核心引擎', max: 100 },
        { name: '故事模式', max: 100 },
        { name: '自由模式', max: 100 },
        { name: '对战模式', max: 100 },
        { name: '剧情系统', max: 100 },
        { name: '音频系统', max: 100 },
        { name: '多语言', max: 100 },
        { name: '存档统计', max: 100 },
        { name: 'APK构建', max: 100 },
        { name: '平台适配', max: 100 }
      ],
      radius: '65%',
      axisName: {
        color: muted,
        fontSize: 12
      },
      splitArea: {
        areaStyle: {
          color: ['transparent', 'rgba(255,255,255,0.02)', 'transparent', 'rgba(255,255,255,0.02)']
        }
      },
      axisLine: { lineStyle: { color: rule } },
      splitLine: { lineStyle: { color: rule } }
    },
    series: [{
      type: 'radar',
      data: [{
        value: [95, 90, 90, 70, 60, 95, 95, 95, 40, 20],
        name: '完成度',
        areaStyle: {
          color: accent + '33'
        },
        lineStyle: {
          color: accent,
          width: 2
        },
        itemStyle: {
          color: accent
        }
      }]
    }]
  });
  window.addEventListener('resize', function() { chartRadar.resize(); });

  // --- Chart: Pie - 问题优先级分布 ---
  var chartPie = echarts.init(document.getElementById('chart-pie'), null, { renderer: 'svg' });
  chartPie.setOption({
    animation: false,
    tooltip: { trigger: 'item', appendToBody: true, formatter: '{b}: {c}项 ({d}%)' },
    legend: {
      bottom: 0,
      textStyle: { color: muted },
      itemWidth: 12,
      itemHeight: 12
    },
    series: [{
      type: 'pie',
      radius: ['40%', '70%'],
      center: ['50%', '45%'],
      avoidLabelOverlap: true,
      itemStyle: {
        borderRadius: 6,
        borderColor: bg2,
        borderWidth: 2
      },
      label: {
        show: true,
        color: ink,
        formatter: '{b}\n{c}项'
      },
      labelLine: {
        lineStyle: { color: rule }
      },
      data: [
        { value: 5, name: '高优先级', itemStyle: { color: danger } },
        { value: 6, name: '中优先级', itemStyle: { color: accent3 } },
        { value: 4, name: '低优先级', itemStyle: { color: accent2 } },
        { value: 4, name: '已完成', itemStyle: { color: accent } }
      ]
    }]
  });
  window.addEventListener('resize', function() { chartPie.resize(); });
})();
