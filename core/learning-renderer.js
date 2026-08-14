// ==========================================
// LearningRenderer - Step 3：45 Panel Learning 区块
// ==========================================
// 单决策源原则（与 EngineAdapter 一致）：
//   本模块**只消费** EngineAdapter.toRenderModel() 产出的「稳定渲染模型」，
//   绝不解释 rule ID，也绝不复刻 rules_v1.json 的规则文案 —— 否则会引入双决策源。
//
//   渲染模型（唯一来源 = /api/v1/engine/judge 响应经 adapter 映射）：
//   {
//     ok:        boolean,
//     matchedRules: string[],            // 仅供调试，本模块不据它复刻文案
//     diagnosis: { primary, secondary }, // Diagnosis → Learning Insight
//     tags:      string[],               // Tags → 能力标签
//     popup:     { show, style },        // 即时反馈（toast/modal），不作 Panel 内容
//     actions:   { forceQuiz, addToWeekendPack } // Actions → 建议动作（仅展示）
//   }
//
// 职责（纯映射 / 纯渲染，零 DOM 依赖，零决策）：
//   LearningFactBuilder.build(event)  → 游戏事件 → engine Fact（字段白名单透传）
//   renderLearningDecision(model)     → 渲染模型 → Learning 区块 HTML
//
// 该模块可在 Node 与浏览器双环境运行（无 window/document 依赖）。
// ==========================================

/** HTML 转义（与面板其它模块一致，防注入）。 */
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[ch]);
}

/**
 * 游戏事件 → engine Fact 的纯映射器。
 *
 * 只支持 Step 3 契约里的三个事件（其余字段做白名单透传，不产生任何决策）：
 *   Event 1  answer wrong ：{ current_word, is_correct:false, error_type }
 *   Event 2  stall        ：{ current_word, dwell_time_ms }
 *   Event 3  repeat error ：{ historical_behavior:{ repeated_errors, total_correct } }
 */
export class LearningFactBuilder {
  build(event = {}) {
    const fact = {};
    if (event.current_word !== undefined) fact.current_word = event.current_word;
    if (event.is_correct !== undefined) fact.is_correct = event.is_correct;
    if (event.dwell_time_ms !== undefined) fact.dwell_time_ms = event.dwell_time_ms;
    if (event.error_type !== undefined) {
      fact.context = { ...(fact.context || {}), error_type: event.error_type };
    }
    if (event.historical_behavior !== undefined) {
      fact.historical_behavior = event.historical_behavior;
    }
    return fact;
  }
}

/**
 * 渲染模型 → Learning 区块 HTML（纯函数，可单测）。
 * 只渲染 Diagnosis / Tags / Actions 三个消费者区；popup 不进入 Panel（即时反馈另走 toast/modal）。
 *
 * @param {object} model - EngineAdapter.toRenderModel() 输出
 * @returns {string}
 */
export function renderLearningDecision(model) {
  if (!model || !model.ok) {
    return '<div class="iv-l-empty">暂无学习建议</div>';
  }

  const diag = (model.diagnosis && model.diagnosis) || {};
  const tags = Array.isArray(model.tags) ? model.tags : [];
  const actions = (model.actions && model.actions) || {};
  const hasDiag = !!(diag.primary || diag.secondary);

  const parts = [];

  // ---- Diagnosis：Learning Insight ----
  parts.push('<div class="iv-l-label">学习洞见</div>');
  if (hasDiag) {
    let d = '';
    if (diag.primary) d += `<div class="iv-l-primary">${esc(diag.primary)}</div>`;
    if (diag.secondary) d += `<div class="iv-l-secondary">${esc(diag.secondary)}</div>`;
    parts.push(`<div class="iv-l-insight">${d}</div>`);
  } else {
    parts.push('<div class="iv-l-insight iv-l-mut">暂无诊断信息</div>');
  }

  // ---- Tags：能力标签 ----
  if (tags.length) {
    parts.push('<div class="iv-l-label">能力标签</div>');
    parts.push(`<div class="iv-l-tags">${tags.map((t) => `<span class="iv-l-tag">${esc(t)}</span>`).join('')}</div>`);
  }

  // ---- Actions：建议动作（仅展示，不触发任何系统）----
  const acts = [];
  if (actions.forceQuiz) acts.push('生成一次针对练习');
  if (actions.addToWeekendPack) acts.push('加入周末急救包');
  if (acts.length) {
    parts.push('<div class="iv-l-label">建议动作</div>');
    parts.push(`<div class="iv-l-actions">${acts.map((a) => `<span class="iv-l-action">${esc(a)}</span>`).join('')}</div>`);
  }

  return `<div class="iv-learning">${parts.join('')}</div>`;
}

export default renderLearningDecision;