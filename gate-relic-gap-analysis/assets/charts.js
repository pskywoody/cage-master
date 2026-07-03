(function() {
  var style = getComputedStyle(document.documentElement);
  var accent = style.getPropertyValue('--accent').trim();
  var accent2 = style.getPropertyValue('--accent2').trim();
  var ink = style.getPropertyValue('--ink').trim();
  var muted = style.getPropertyValue('--muted').trim();
  var rule = style.getPropertyValue('--rule').trim();
  var bg2 = style.getPropertyValue('--bg2').trim();
  var success = style.getPropertyValue('--success').trim();
  var warning = style.getPropertyValue('--warning').trim();
  var danger = style.getPropertyValue('--danger').trim();
  var orange = style.getPropertyValue('--orange').trim();

  // --- Chart 1: 工作量分布饼图 ---
  var effortChart = echarts.init(document.getElementById('chart-effort'), null, { renderer: 'svg' });
  effortChart.setOption({
    animation: false,
    tooltip: {
      appendToBody: true,
      trigger: 'item',
      formatter: '{b}: {c} 天 ({d}%)'
    },
    legend: {
      orient: 'vertical',
      right: 10,
      top: 'center',
      textStyle: { color: ink, fontSize: 11 },
      itemWidth: 12,
      itemHeight: 12
    },
    series: [{
      type: 'pie',
      radius: ['40%', '70%'],
      center: ['35%', '50%'],
      avoidLabelOverlap: true,
      itemStyle: {
        borderRadius: 4,
        borderColor: bg2,
        borderWidth: 2
      },
      label: { show: false },
      emphasis: {
        label: {
          show: true,
          fontSize: 12,
          fontWeight: 'bold',
          color: ink
        }
      },
      labelLine: { show: false },
      data: [
        { value: 5.5, name: '核心基础系统', itemStyle: { color: danger } },
        { value: 2.5, name: '8个遗物效果', itemStyle: { color: orange } },
        { value: 2, name: '9个主动技能', itemStyle: { color: warning } },
        { value: 2.5, name: 'UI/UX组件', itemStyle: { color: accent } },
        { value: 1.5, name: '系统整合', itemStyle: { color: accent2 } },
        { value: 3, name: '测试与平衡', itemStyle: { color: success } }
      ]
    }]
  });
  window.addEventListener('resize', function() { effortChart.resize(); });

  // --- Chart 2: 现有系统完成度横向柱状图 ---
  var readinessChart = echarts.init(document.getElementById('chart-readiness'), null, { renderer: 'svg' });
  readinessChart.setOption({
    animation: false,
    tooltip: {
      appendToBody: true,
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: function(params) {
        var p = params[0];
        return p.name + ': ' + p.value + '%';
      }
    },
    grid: {
      left: 80,
      right: 40,
      top: 10,
      bottom: 20
    },
    xAxis: {
      type: 'value',
      max: 100,
      axisLabel: {
        color: muted,
        fontSize: 10,
        formatter: '{value}%'
      },
      splitLine: {
        lineStyle: { color: rule, type: 'dashed' }
      },
      axisLine: { show: false },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'category',
      data: ['音效特效', 'UI组件库', '碎片系统', '徽章系统', '存储系统', '图鉴系统', '八门系统'],
      axisLabel: {
        color: ink,
        fontSize: 11
      },
      axisLine: { show: false },
      axisTick: { show: false }
    },
    series: [{
      type: 'bar',
      data: [
        { value: 95, itemStyle: { color: success } },
        { value: 75, itemStyle: { color: success } },
        { value: 30, itemStyle: { color: warning } },
        { value: 60, itemStyle: { color: warning } },
        { value: 90, itemStyle: { color: success } },
        { value: 0, itemStyle: { color: danger } },
        { value: 0, itemStyle: { color: danger } }
      ],
      barWidth: 16,
      itemStyle: {
        borderRadius: [0, 4, 4, 0]
      },
      label: {
        show: true,
        position: 'right',
        color: ink,
        fontSize: 10,
        formatter: '{c}%'
      }
    }]
  });
  window.addEventListener('resize', function() { readinessChart.resize(); });

})();
