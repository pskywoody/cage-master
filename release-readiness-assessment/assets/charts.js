// release-readiness-assessment :: charts.js
(function () {
  var style = getComputedStyle(document.documentElement);
  var accent = style.getPropertyValue('--accent').trim();
  var accent2 = style.getPropertyValue('--accent2').trim();
  var ink = style.getPropertyValue('--ink').trim();
  var muted = style.getPropertyValue('--muted').trim();
  var rule = style.getPropertyValue('--rule').trim();
  var bg2 = style.getPropertyValue('--bg2').trim();
  var ok = style.getPropertyValue('--ok').trim();
  var warn = style.getPropertyValue('--warn').trim();
  var bad = style.getPropertyValue('--bad').trim();

  var tooltipBase = {
    appendToBody: true,
    backgroundColor: 'rgba(36,31,26,.92)',
    borderColor: 'rgba(220,211,196,.4)',
    textStyle: { color: '#F2EDE4', fontSize: 12 }
  };

  // --- Chart: 模块完成度（横向条形） ---
  var el1 = document.getElementById('chart-readiness');
  if (el1) {
    var c1 = echarts.init(el1, null, { renderer: 'svg' });
    var rows = [
      ['核心引擎', 100], ['教学引擎', 100], ['持久化', 100], ['专家系统', 100],
      ['i18n 四语', 100], ['渲染引擎', 90], ['UI 层', 90], ['Boss 战 tpl', 90],
      ['剧情与剧本', 95], ['关卡数据', 95], ['美术资源', 85], ['新核心模块', 40],
      ['音频（含语音）', 50], ['构建/部署', 10], ['玩家文档', 20]
    ];
    rows.sort(function (a, b) { return a[1] - b[1]; });
    var names = rows.map(function (r) { return r[0]; });
    var vals = rows.map(function (r) { return r[1]; });
    c1.setOption({
      animation: false,
      tooltip: Object.assign({ trigger: 'axis', axisPointer: { type: 'shadow' } }, tooltipBase),
      grid: { left: 96, right: 48, top: 12, bottom: 24 },
      xAxis: {
        type: 'value', max: 100,
        axisLine: { lineStyle: { color: rule } },
        axisLabel: { color: muted, formatter: '{value}%' },
        splitLine: { lineStyle: { color: rule, opacity: .5 } }
      },
      yAxis: {
        type: 'category', data: names, inverse: true,
        axisLine: { lineStyle: { color: rule } },
        axisLabel: { color: ink, fontSize: 12 }
      },
      series: [{
        type: 'bar', barWidth: 14,
        data: vals.map(function (v) {
          return { value: v, itemStyle: { color: v >= 85 ? ok : (v >= 45 ? warn : bad), borderRadius: [0, 6, 6, 0] } };
        }),
        label: {
          show: true, position: 'right', formatter: '{c}%',
          color: muted, fontSize: 11, fontWeight: 700
        }
      }]
    });
    window.addEventListener('resize', function () { c1.resize(); });
  }
})();
