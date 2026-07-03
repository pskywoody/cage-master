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

  // --- Chart 1: 一致性雷达图 ---
  var radarChart = echarts.init(document.getElementById('chart-radar'), null, { renderer: 'svg' });
  radarChart.setOption({
    animation: false,
    tooltip: {
      appendToBody: true,
      formatter: function(params) {
        return params.name + ': ' + params.value + ' 分';
      }
    },
    radar: {
      indicator: [
        { name: '数据层', max: 100 },
        { name: '存储系统', max: 100 },
        { name: '渲染系统', max: 100 },
        { name: '章节系统', max: 100 },
        { name: 'UI/HUD', max: 100 },
        { name: '引导系统', max: 100 },
        { name: '核心逻辑保护', max: 100 },
        { name: '事件/扩展机制', max: 100 }
      ],
      radius: '65%',
      axisName: {
        color: ink,
        fontSize: 12
      },
      splitArea: {
        areaStyle: {
          color: [bg2, 'transparent']
        }
      },
      axisLine: {
        lineStyle: { color: rule }
      },
      splitLine: {
        lineStyle: { color: rule }
      }
    },
    series: [{
      type: 'radar',
      data: [{
        value: [85, 90, 70, 40, 60, 80, 75, 25],
        name: '一致性评分',
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
  window.addEventListener('resize', function() { radarChart.resize(); });

  // --- Chart 2: 技术架构图（用树图模拟） ---
  var archChart = echarts.init(document.getElementById('chart-arch'), null, { renderer: 'svg' });
  archChart.setOption({
    animation: false,
    tooltip: {
      appendToBody: true,
      trigger: 'item',
      triggerOn: 'mousemove'
    },
    series: [{
      type: 'tree',
      data: [{
        name: '游戏入口\n(guide.js / main.js)',
        children: [
          {
            name: '事件总线\n(event-bus.js) 🌟新增',
            children: [
              {
                name: '八门系统\n(gate-system.js) 🌟新增',
                children: [
                  { name: '门定义与判定' },
                  { name: '门与Cage关联' },
                  { name: '门区域渲染' }
                ]
              },
              {
                name: '遗物系统\n(relic-system.js) 🌟新增',
                children: [
                  { name: '遗物选择' },
                  { name: '效果应用' },
                  { name: '进度存储' }
                ]
              },
              {
                name: '技能系统\n(skill-system.js) 🌟新增',
                children: [
                  { name: '门气管理' },
                  { name: '技能释放' },
                  { name: '消耗计算' }
                ]
              }
            ]
          },
          {
            name: '现有系统\n(不修改核心)',
            children: [
              { name: 'game.js\n(数据模型)' },
              { name: 'renderer.js\n(渲染引擎)' },
              { name: 'storage.js\n(本地存储)' },
              { name: 'guide-manager.js\n(引导触发器)' }
            ]
          }
        ]
      }],
      top: '5%',
      left: '8%',
      bottom: '5%',
      right: '15%',
      symbolSize: 8,
      orient: 'LR',
      label: {
        position: 'left',
        verticalAlign: 'middle',
        align: 'right',
        color: ink,
        fontSize: 12
      },
      leaves: {
        label: {
          position: 'right',
          verticalAlign: 'middle',
          align: 'left'
        }
      },
      emphasis: {
        focus: 'descendant'
      },
      expandAndCollapse: false,
      lineStyle: {
        color: rule,
        width: 1.5
      },
      itemStyle: {
        color: accent,
        borderColor: accent
      }
    }]
  });
  window.addEventListener('resize', function() { archChart.resize(); });

})();
