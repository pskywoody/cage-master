// assets/charts.js - CageMaster4 Game Manual Charts
(function() {
  var style = getComputedStyle(document.documentElement);
  var accent = style.getPropertyValue('--accent').trim();
  var accent2 = style.getPropertyValue('--accent2').trim();
  var ink = style.getPropertyValue('--ink').trim();
  var muted = style.getPropertyValue('--muted').trim();
  var rule = style.getPropertyValue('--rule').trim();
  var bg2 = style.getPropertyValue('--bg2').trim();
  var bg = style.getPropertyValue('--bg').trim();

  var inkRgba = function(a) { return colorToRgba(ink, a); };
  var accentRgba = function(a) { return colorToRgba(accent, a); };
  function colorToRgba(cssColor, alpha) {
    var v = parseInt(cssColor.replace('#',''), 16);
    var r = (v >> 16) & 255, g = (v >> 8) & 255, b = v & 255;
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }

  // --- Chart: Chapter Level Distribution ---
  var chLevels = echarts.init(document.getElementById('chart-levels'), null, { renderer: 'svg' });
  chLevels.setOption({
    tooltip: { trigger: 'axis', appendToBody: true },
    animation: false,
    grid: { left: 60, right: 30, top: 20, bottom: 40 },
    xAxis: {
      type: 'category',
      data: ['第1章\n初识笼中密码', '第2章\n四十五星衡', '第3章\n档案室深层', '第4章\n尘封旧案', '第5章\n星辰梭核心', '第6章\n终局笼局', '第7章\n秘术档案'],
      axisLabel: { color: muted, fontSize: 11, interval: 0 },
      axisLine: { lineStyle: { color: rule } },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 12,
      splitLine: { lineStyle: { color: rule, type: 'dashed' } },
      axisLabel: { color: muted }
    },
    series: [{
      type: 'bar',
      data: [10, 8, 7, 7, 6, 6, 7],
      itemStyle: {
        color: {
          type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: accent },
            { offset: 1, color: accent2 }
          ]
        },
        borderRadius: [4, 4, 0, 0]
      },
      barWidth: 32,
      label: {
        show: true,
        position: 'top',
        color: ink,
        fontSize: 13,
        fontWeight: 600
      }
    }]
  });
  window.addEventListener('resize', function() { chLevels.resize(); });

  // --- Chart: Technique Difficulty Distribution ---
  var techChart = echarts.init(document.getElementById('chart-techniques'), null, { renderer: 'svg' });
  techChart.setOption({
    tooltip: { trigger: 'axis', appendToBody: true, formatter: function(p) { return p[0].name + '<br/>难度等级: ' + p[0].value; } },
    animation: false,
    grid: { left: 100, right: 40, top: 20, bottom: 40 },
    xAxis: {
      type: 'value',
      min: 0,
      max: 12,
      splitLine: { lineStyle: { color: rule, type: 'dashed' } },
      axisLabel: { color: muted }
    },
    yAxis: {
      type: 'category',
      data: ['试数 (Guess)', '三才游鱼阵 (Swordfish)', '二连纵横阵 (X-Wing)', '三子法 (Naked Triplet)', '区块排除 (Pointing)', '双曜 (Hidden Pair)', '并蒂锁 (Naked Pair)', '星衡法则 (Rule 45)', '隐曜 (Hidden Single)', '唯一组合 (Cage Unique)', '孤星 (Naked Single)'],
      axisLabel: { color: ink, fontSize: 12 },
      axisLine: { lineStyle: { color: rule } },
      axisTick: { show: false }
    },
    series: [{
      type: 'bar',
      data: [11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1],
      itemStyle: {
        color: function(params) {
          var val = params.value;
          if (val <= 2) return '#5a9e6e';
          if (val <= 4) return '#d4a853';
          if (val <= 7) return '#c9956a';
          return '#e07a5f';
        },
        borderRadius: [0, 4, 4, 0]
      },
      barWidth: 22,
      label: {
        show: true,
        position: 'right',
        color: muted,
        fontSize: 11,
        formatter: function(p) { return 'Lv.' + p.value; }
      }
    }]
  });
  window.addEventListener('resize', function() { techChart.resize(); });

  // --- Chart: System Architecture ---
  var archChart = echarts.init(document.getElementById('chart-architecture'), null, { renderer: 'svg' });
  archChart.setOption({
    tooltip: { trigger: 'item', appendToBody: true },
    animation: false,
    series: [{
      type: 'sankey',
      layout: 'none',
      emphasis: { focus: 'adjacency' },
      nodeAlign: 'left',
      nodeWidth: 18,
      nodeGap: 12,
      data: [
        // Level 1 - Data
        { name: '关卡数据', itemStyle: { color: '#5a9e6e' } },
        { name: '章节配置', itemStyle: { color: '#5a9e6e' } },
        // Level 2 - Core
        { name: 'Board', itemStyle: { color: accent } },
        { name: 'TechRater', itemStyle: { color: accent } },
        { name: 'HeadlessEngine', itemStyle: { color: accent } },
        { name: 'LevelManager', itemStyle: { color: accent } },
        // Level 3 - Expert
        { name: 'ExpertSystem', itemStyle: { color: '#c9956a' } },
        { name: 'HintSystem', itemStyle: { color: '#c9956a' } },
        { name: 'TeachingSystem', itemStyle: { color: '#c9956a' } },
        { name: 'BattleManager', itemStyle: { color: '#c9956a' } },
        { name: 'LessonPlayer', itemStyle: { color: '#c9956a' } },
        // Level 4 - Story
        { name: 'StoryEngine', itemStyle: { color: '#a3352a' } },
        // Level 5 - UI
        { name: 'GameApp', itemStyle: { color: '#d4a853' } },
        { name: 'BoardRenderer', itemStyle: { color: '#d4a853' } },
        { name: 'EffectRenderer', itemStyle: { color: '#d4a853' } },
        { name: 'AnimationController', itemStyle: { color: '#d4a853' } },
        { name: 'ComboSystem', itemStyle: { color: '#d4a853' } },
        { name: 'DialogSystem', itemStyle: { color: '#d4a853' } },
      ],
      links: [
        { source: '关卡数据', target: 'Board', value: 1 },
        { source: '章节配置', target: 'LevelManager', value: 1 },
        { source: 'Board', target: 'TechRater', value: 1 },
        { source: 'Board', target: 'HeadlessEngine', value: 1 },
        { source: 'Board', target: 'BattleManager', value: 1 },
        { source: 'HeadlessEngine', target: 'GameApp', value: 1 },
        { source: 'TechRater', target: 'HintSystem', value: 1 },
        { source: 'TechRater', target: 'ExpertSystem', value: 1 },
        { source: 'HintSystem', target: 'TeachingSystem', value: 1 },
        { source: 'TeachingSystem', target: 'LessonPlayer', value: 1 },
        { source: 'ExpertSystem', target: 'BattleManager', value: 1 },
        { source: 'LevelManager', target: 'GameApp', value: 1 },
        { source: 'LessonPlayer', target: 'GameApp', value: 1 },
        { source: 'BattleManager', target: 'GameApp', value: 1 },
        { source: 'StoryEngine', target: 'GameApp', value: 1 },
        { source: 'GameApp', target: 'BoardRenderer', value: 1 },
        { source: 'GameApp', target: 'EffectRenderer', value: 1 },
        { source: 'GameApp', target: 'AnimationController', value: 1 },
        { source: 'GameApp', target: 'ComboSystem', value: 1 },
        { source: 'GameApp', target: 'DialogSystem', value: 1 },
      ],
      label: {
        color: ink,
        fontSize: 11,
        fontWeight: 600
      },
      lineStyle: {
        color: 'gradient',
        opacity: 0.3
      }
    }]
  });
  window.addEventListener('resize', function() { archChart.resize(); });

  // --- Chart: Five-Stage Teaching ---
  var teachChart = echarts.init(document.getElementById('chart-teaching'), null, { renderer: 'svg' });
  teachChart.setOption({
    tooltip: { trigger: 'item', appendToBody: true, formatter: function(p) { return p.name + '<br/>' + p.data.desc; } },
    animation: false,
    series: [{
      type: 'sankey',
      layout: 'none',
      nodeAlign: 'left',
      nodeWidth: 16,
      nodeGap: 10,
      data: [
        { name: 'intro', itemStyle: { color: '#5a9e6e' }, desc: '角色介绍技巧概念' },
        { name: 'demo', itemStyle: { color: '#5a9e6e' }, desc: '角色演示完整推理' },
        { name: 'guided', itemStyle: { color: '#d4a853' }, desc: '锁定格子，半引导填数' },
        { name: 'noteToFill', itemStyle: { color: '#c9956a' }, desc: '笔记→填数链条引导' },
        { name: 'semiAuto', itemStyle: { color: '#c9956a' }, desc: '自主识别+验证反馈' },
        { name: 'free', itemStyle: { color: accent }, desc: '自由解题，角色监督' },
        { name: 'done', itemStyle: { color: '#a3352a' }, desc: '教学完成' },
      ],
      links: [
        { source: 'intro', target: 'demo', value: 1 },
        { source: 'demo', target: 'guided', value: 1 },
        { source: 'guided', target: 'noteToFill', value: 1 },
        { source: 'noteToFill', target: 'semiAuto', value: 1 },
        { source: 'semiAuto', target: 'free', value: 1 },
        { source: 'free', target: 'done', value: 1 },
      ],
      label: {
        color: ink,
        fontSize: 12,
        fontWeight: 600,
        formatter: function(p) {
          var names = { intro: '① 概念引入', demo: '② 演示', guided: '③ 引导', noteToFill: '④ 笔记→填数', semiAuto: '⑤ 半自主', free: '⑥ 自由解题', done: '完成' };
          return names[p.name] || p.name;
        }
      },
      lineStyle: { color: 'gradient', opacity: 0.3 }
    }]
  });
  window.addEventListener('resize', function() { teachChart.resize(); });

  // --- Chart: File Count Distribution ---
  var filesChart = echarts.init(document.getElementById('chart-files'), null, { renderer: 'svg' });
  filesChart.setOption({
    tooltip: { trigger: 'item', appendToBody: true, formatter: function(p) { return p.name + '<br/>' + p.value + ' 个文件'; } },
    animation: false,
    series: [{
      type: 'pie',
      radius: ['40%', '70%'],
      center: ['50%', '50%'],
      avoidLabelOverlap: true,
      padAngle: 2,
      itemStyle: { borderRadius: 6 },
      label: {
        show: true,
        color: ink,
        fontSize: 11,
        fontWeight: 600,
        formatter: function(p) { return p.name + '\n' + p.value + '个'; }
      },
      emphasis: {
        label: { show: true, fontSize: 14, fontWeight: 'bold' }
      },
      data: [
        { value: 13, name: '核心逻辑 (core/)', itemStyle: { color: accent } },
        { value: 5, name: '渲染层 (renderer/)', itemStyle: { color: '#c9956a' } },
        { value: 15, name: 'UI界面 (ui/)', itemStyle: { color: '#d4a853' } },
        { value: 14, name: '专家系统 (expert/)', itemStyle: { color: '#5a9e6e' } },
        { value: 2, name: '剧情引擎 (story/)', itemStyle: { color: '#a3352a' } },
        { value: 1, name: '音频服务 (audio/)', itemStyle: { color: '#6b5a42' } },
        { value: 38, name: '工具脚本 (scripts/)', itemStyle: { color: '#75603f' } },
      ]
    }]
  });
  window.addEventListener('resize', function() { filesChart.resize(); });
})();