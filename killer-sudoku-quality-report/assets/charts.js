(function() {
  var style = getComputedStyle(document.documentElement);
  var accent = style.getPropertyValue('--accent').trim();
  var accent2 = style.getPropertyValue('--accent2').trim();
  var ink = style.getPropertyValue('--ink').trim();
  var muted = style.getPropertyValue('--muted').trim();
  var rule = style.getPropertyValue('--rule').trim();
  var bg2 = style.getPropertyValue('--bg2').trim();
  var danger = style.getPropertyValue('--danger').trim();
  var success = style.getPropertyValue('--success').trim();

  var textStyle = { color: ink, fontFamily: 'inherit' };
  var axisLabelStyle = { color: muted, fontSize: 12 };
  var axisLineStyle = { lineStyle: { color: rule } };
  var splitLineStyle = { lineStyle: { color: rule, type: 'dashed' } };

  // --- Chart 1: 各难度笼子重复数字题目占比 ---
  var chart1 = echarts.init(document.getElementById('chart-cage-dup'), null, { renderer: 'svg' });
  chart1.setOption({
    animation: false,
    tooltip: {
      trigger: 'axis',
      appendToBody: true,
      axisPointer: { type: 'shadow' },
      formatter: function(params) {
        var p = params[0];
        return p.name + '<br/>笼子重复题目占比: <b>' + p.value + '%</b>';
      }
    },
    grid: { left: 60, right: 30, top: 30, bottom: 40 },
    xAxis: {
      type: 'category',
      data: ['入门', '简单', '中等', '困难', '地狱'],
      axisLabel: { color: ink, fontSize: 13, fontWeight: 500 },
      axisLine: axisLineStyle,
      axisTick: { show: false }
    },
    yAxis: {
      type: 'value',
      name: '占比 (%)',
      nameTextStyle: { color: muted, fontSize: 12 },
      min: 0,
      max: 25,
      axisLabel: { ...axisLabelStyle, formatter: '{value}%' },
      axisLine: { show: false },
      splitLine: splitLineStyle
    },
    series: [{
      type: 'bar',
      data: [14.0, 14.0, 18.0, 17.0, 15.0],
      itemStyle: {
        color: danger,
        borderRadius: [4, 4, 0, 0]
      },
      barWidth: '40%',
      label: {
        show: true,
        position: 'top',
        color: danger,
        fontWeight: 600,
        formatter: '{c}%'
      }
    }]
  });
  window.addEventListener('resize', function() { chart1.resize(); });

  // --- Chart 2: 各难度人类模拟器完成率与步数 ---
  var chart2 = echarts.init(document.getElementById('chart-solvable'), null, { renderer: 'svg' });
  chart2.setOption({
    animation: false,
    tooltip: {
      trigger: 'axis',
      appendToBody: true,
      axisPointer: { type: 'cross' }
    },
    legend: {
      data: ['人类可解率', '平均解题步数'],
      top: 5,
      textStyle: { color: ink, fontSize: 12 }
    },
    grid: { left: 60, right: 60, top: 50, bottom: 40 },
    xAxis: {
      type: 'category',
      data: ['入门', '简单', '中等', '困难', '地狱'],
      axisLabel: { color: ink, fontSize: 13, fontWeight: 500 },
      axisLine: axisLineStyle,
      axisTick: { show: false }
    },
    yAxis: [
      {
        type: 'value',
        name: '可解率 (%)',
        nameTextStyle: { color: muted, fontSize: 12 },
        min: 0,
        max: 100,
        axisLabel: { ...axisLabelStyle, formatter: '{value}%' },
        axisLine: { show: false },
        splitLine: splitLineStyle
      },
      {
        type: 'value',
        name: '平均步数',
        nameTextStyle: { color: muted, fontSize: 12 },
        min: 0,
        max: 80,
        axisLabel: { ...axisLabelStyle },
        axisLine: { show: false },
        splitLine: { show: false }
      }
    ],
    series: [
      {
        name: '人类可解率',
        type: 'bar',
        data: [83.3, 76.7, 63.3, 66.7, 33.3],
        itemStyle: {
          color: accent,
          borderRadius: [4, 4, 0, 0]
        },
        barWidth: '30%',
        label: {
          show: true,
          position: 'top',
          color: accent,
          fontWeight: 600,
          formatter: '{c}%'
        }
      },
      {
        name: '平均解题步数',
        type: 'line',
        yAxisIndex: 1,
        data: [34.6, 43.3, 47.1, 54.7, 60.0],
        smooth: true,
        symbol: 'circle',
        symbolSize: 8,
        lineStyle: { color: accent2, width: 2.5 },
        itemStyle: { color: accent2, borderWidth: 2, borderColor: '#fff' }
      }
    ]
  });
  window.addEventListener('resize', function() { chart2.resize(); });

  // --- Chart 3: 各难度技巧使用分布（堆叠柱状图） ---
  var chart3 = echarts.init(document.getElementById('chart-techniques'), null, { renderer: 'svg' });
  chart3.setOption({
    animation: false,
    tooltip: {
      trigger: 'axis',
      appendToBody: true,
      axisPointer: { type: 'shadow' }
    },
    legend: {
      data: ['裸单', '隐单', '真45法则'],
      top: 5,
      textStyle: { color: ink, fontSize: 12 }
    },
    grid: { left: 50, right: 30, top: 50, bottom: 40 },
    xAxis: {
      type: 'category',
      data: ['入门', '简单', '中等', '困难', '地狱'],
      axisLabel: { color: ink, fontSize: 13, fontWeight: 500 },
      axisLine: axisLineStyle,
      axisTick: { show: false }
    },
    yAxis: {
      type: 'value',
      name: '平均使用次数',
      nameTextStyle: { color: muted, fontSize: 12 },
      axisLabel: axisLabelStyle,
      axisLine: { show: false },
      splitLine: splitLineStyle
    },
    series: [
      {
        name: '裸单',
        type: 'bar',
        stack: 'total',
        data: [26.0, 28.6, 30.0, 32.1, 35.3],
        itemStyle: { color: accent + '99' },
        barWidth: '45%'
      },
      {
        name: '隐单',
        type: 'bar',
        stack: 'total',
        data: [0.1, 0.0, 0.0, 0.0, 3.0],
        itemStyle: { color: accent2 + '99' }
      },
      {
        name: '真45法则',
        type: 'bar',
        stack: 'total',
        data: [8.6, 14.7, 17.1, 22.6, 24.7],
        itemStyle: { color: accent },
        label: {
          show: true,
          position: 'top',
          color: accent,
          fontWeight: 600,
          fontSize: 12,
          formatter: function(params) {
            var total = 26.0 + 0.1 + 8.6;
            if (params.name === '简单') total = 28.6 + 0 + 14.7;
            if (params.name === '中等') total = 30.0 + 0 + 17.1;
            if (params.name === '困难') total = 32.1 + 0 + 22.6;
            if (params.name === '地狱') total = 35.3 + 3.0 + 24.7;
            if (params.seriesName === '真45法则') {
              var pct = (params.value / total * 100).toFixed(0);
              return pct + '%';
            }
            return '';
          }
        }
      }
    ]
  });
  window.addEventListener('resize', function() { chart3.resize(); });

  // --- Chart 4: 教学关卡技巧使用量与完成度 ---
  var chart4 = echarts.init(document.getElementById('chart-teaching'), null, { renderer: 'svg' });
  chart4.setOption({
    animation: false,
    tooltip: {
      trigger: 'axis',
      appendToBody: true,
      axisPointer: { type: 'shadow' }
    },
    legend: {
      data: ['完成率', '平均裸单次数', '平均隐单次数'],
      top: 5,
      textStyle: { color: ink, fontSize: 12 }
    },
    grid: { left: 55, right: 55, top: 50, bottom: 40 },
    xAxis: {
      type: 'category',
      data: ['第4章\n(45法则)', '第5章\n(高级技巧)', '第6章\n(综合挑战)'],
      axisLabel: { color: ink, fontSize: 12, fontWeight: 500 },
      axisLine: axisLineStyle,
      axisTick: { show: false }
    },
    yAxis: [
      {
        type: 'value',
        name: '完成率 (%)',
        nameTextStyle: { color: muted, fontSize: 11 },
        min: 0,
        max: 100,
        axisLabel: { ...axisLabelStyle, formatter: '{value}%' },
        axisLine: { show: false },
        splitLine: splitLineStyle
      },
      {
        type: 'value',
        name: '平均次数',
        nameTextStyle: { color: muted, fontSize: 11 },
        min: 0,
        max: 90,
        axisLabel: axisLabelStyle,
        axisLine: { show: false },
        splitLine: { show: false }
      }
    ],
    series: [
      {
        name: '完成率',
        type: 'bar',
        data: [71, 57, 83],
        itemStyle: {
          color: function(params) {
            return params.value >= 70 ? success : (params.value >= 60 ? accent2 : danger);
          },
          borderRadius: [4, 4, 0, 0]
        },
        barWidth: '25%',
        label: {
          show: true,
          position: 'top',
          color: ink,
          fontWeight: 600,
          formatter: '{c}%'
        }
      },
      {
        name: '平均裸单次数',
        type: 'line',
        yAxisIndex: 1,
        data: [73, 67, 74],
        smooth: true,
        symbol: 'circle',
        symbolSize: 7,
        lineStyle: { color: accent, width: 2.5 },
        itemStyle: { color: accent, borderWidth: 2, borderColor: '#fff' }
      },
      {
        name: '平均隐单次数',
        type: 'line',
        yAxisIndex: 1,
        data: [5, 8, 7],
        smooth: true,
        symbol: 'diamond',
        symbolSize: 7,
        lineStyle: { color: accent2, width: 2 },
        itemStyle: { color: accent2, borderWidth: 2, borderColor: '#fff' }
      }
    ]
  });
  window.addEventListener('resize', function() { chart4.resize(); });

})();
