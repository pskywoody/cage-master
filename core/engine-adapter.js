// ==========================================
// EngineAdapter - Step 3：45 Panel 接入 Engine Judge 链
// ==========================================
// 单决策源原则：前端只消费 /api/v1/engine/judge 的「稳定输出契约」，
// 绝不自行解释 rule 或复刻规则文案 —— 否则会引入双决策源。
//
// 职责（纯映射，无逻辑）：
//   game event → buildFact()   → engine Fact（字段白名单透传）
//   engine resp → toRenderModel() → 45 Panel 渲染模型（纯映射）
//   judge()     = transport(judge) → toRenderModel
//
// 可注入 transport（便于浏览器 fetch / Node mock 测试切换）。
// 本模块零 DOM 依赖，可在 Node 与浏览器双环境运行。
// ==========================================

const FACT_KEYS = [
  'current_word',      // 兼容 alias -> word
  'user_input',
  'action_type',
  'dwell_time_ms',     // 兼容 alias -> dwell_time
  'user_answer',
  'correct_answer',
  'is_correct',
  'context',
  'historical_behavior',
];

/** 浏览器默认 transport：POST JSON 到 judge 端点。 */
async function defaultTransport(endpoint, fact) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fact),
  });
  if (!res.ok) throw new Error(`engine judge HTTP ${res.status}`);
  return res.json();
}

export class EngineAdapter {
  constructor(deps = {}) {
    this.endpoint = deps.endpoint || '/api/v1/engine/judge';
    this.transport = deps.transport || defaultTransport;
  }

  /** 由游戏事件组装 engine Fact：仅白名单字段透传，不产生任何决策/推导。 */
  buildFact(event = {}) {
    const fact = {};
    for (const k of FACT_KEYS) {
      if (event[k] !== undefined) fact[k] = event[k];
    }
    return fact;
  }

  /** 调 judge 并直接返回渲染模型。 */
  async judge(fact) {
    const resp = await this.transport(this.endpoint, fact);
    return this.toRenderModel(resp);
  }

  /** 纯映射：engine 稳定输出契约 → 45 Panel 渲染模型。无规则逻辑。 */
  toRenderModel(resp) {
    const out = (resp && resp.merged_output) || {};
    const ui = out.ui_trigger || {};
    return {
      ok: !!(resp && resp.status === 'ok'),
      matchedRules: (resp && resp.matched_rules) || [],
      diagnosis: {
        primary: out.primary_diagnosis || '',
        secondary: out.secondary_diagnosis || '',
      },
      tags: out.tags || [],
      popup: {
        show: !!ui.show_popup,
        style: ui.popup_style || 'none',
      },
      actions: {
        forceQuiz: !!ui.force_quiz,
        addToWeekendPack: !!ui.add_to_weekend_pack,
      },
    };
  }
}