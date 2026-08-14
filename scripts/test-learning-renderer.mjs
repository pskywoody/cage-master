// ==========================================
// test-learning-renderer.mjs - Step 3 Learning 区块验证
// 验证核心：
//   1. LearningFactBuilder 三事件 → Fact 映射（纯透传，无决策）
//   2. renderLearningDecision 纯渲染（Diagnosis / Tags / Actions）
//   3. 单决策源：不解释 rule ID、popup 不进 Panel、HTML 转义
// 该测试零 DOM 依赖（Node 直接运行）。
// ==========================================
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';

const ROOT = 'd:/killersudoku/cagemaster4';
const { LearningFactBuilder, renderLearningDecision } = await import(
  pathToFileURL(path.join(ROOT, 'core/learning-renderer.js')).href
);

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.error('FAIL:', msg); } }

// ---- 1. LearningFactBuilder：三事件映射 ----
const fb = new LearningFactBuilder();

// Event 1：answer wrong
{
  const fact = fb.build({ current_word: 'affect', is_correct: false, error_type: 'CONFUSE' });
  ok(fact.current_word === 'affect', 'E1: current_word 透传');
  ok(fact.is_correct === false, 'E1: is_correct 透传');
  ok(fact.context && fact.context.error_type === 'CONFUSE', 'E1: context.error_type 透传');
}

// Event 2：stall
{
  const fact = fb.build({ current_word: 'address', dwell_time_ms: 3500 });
  ok(fact.current_word === 'address' && fact.dwell_time_ms === 3500, 'E2: stall → current_word + dwell_time_ms');
  ok(fact.context === undefined, 'E2: 无 error_type 时不产生 context');
}

// Event 3：repeat error
{
  const fact = fb.build({ historical_behavior: { repeated_errors: 2, total_correct: 1 } });
  ok(fact.historical_behavior.repeated_errors === 2 && fact.historical_behavior.total_correct === 1, 'E3: historical_behavior 透传');
  ok(fact.current_word === undefined, 'E3: 不在白名单的字段不进入 Fact');
}

// 空事件 → 空 Fact
ok(Object.keys(fb.build({})).length === 0, '空事件 → 空 Fact');

// ---- 2. renderLearningDecision：完整模型 ----
const SAMPLE = {
  ok: true,
  matchedRules: ['D001', 'P001'],
  diagnosis: { primary: '形容词修饰名词错误模式', secondary: 'affect 是动词，混淆了 affect/effect' },
  tags: ['形副转换薄弱', '多音词待巩固'],
  popup: { show: true, style: 'diagnostic_red' },
  actions: { forceQuiz: true, addToWeekendPack: false },
};
{
  const html = renderLearningDecision(SAMPLE);
  ok(html.includes('学习洞见'), '渲染: 含 Learning Insight 标题');
  ok(html.includes('形容词修饰名词错误模式'), '渲染: 主诊断文案');
  ok(html.includes('affect 是动词'), '渲染: 次诊断文案');
  ok(html.includes('形副转换薄弱'), '渲染: 标签1');
  ok(html.includes('多音词待巩固'), '渲染: 标签2');
  ok(html.includes('生成一次针对练习'), '渲染: forceQuiz → 建议动作文本');
  ok(!html.includes('加入周末急救包'), '渲染: addToWeekendPack=false 不显示');
  ok(!html.includes('diagnostic_red'), '渲染: popup 不进 Panel 内容');
  ok(!html.includes('D001'), '渲染: 不解释/展示 rule ID 文案');
}

// ---- 3. 边界：空 / 失败模型 ----
ok(renderLearningDecision(null).includes('暂无学习建议'), '空模型 → 占位');
ok(renderLearningDecision({ ok: false }).includes('暂无学习建议'), 'ok=false → 占位');
ok(renderLearningDecision({ ok: true, diagnosis: {}, tags: [], actions: {} }).includes('暂无诊断信息'), '无诊断 → 占位诊断');

// 无 actions 时不渲染动作区
{
  const h = renderLearningDecision({ ok: true, diagnosis: { primary: 'x' }, tags: [], actions: {} });
  ok(!h.includes('建议动作'), '无 actions → 不渲染动作区');
}

// ---- 4. HTML 转义（防注入）----
{
  const h = renderLearningDecision({
    ok: true,
    diagnosis: { primary: '<script>alert(1)</script>', secondary: '' },
    tags: ['<img onerror=x>'],
    actions: { forceQuiz: false },
  });
  ok(!h.includes('<script>'), '转义: 主诊断注入被转义');
  ok(!h.includes('<img'), '转义: 标签注入被转义');
}

// ---- 5. 端到端链：游戏事件 → FactBuilder → EngineAdapter.judge(mock transport) → Renderer ----
{
  const { EngineAdapter } = await import(
    pathToFileURL(path.join(ROOT, 'core/engine-adapter.js')).href
  );
  // mock judge 响应（模拟 /api/v1/engine/judge 稳定契约）
  const mockResp = {
    status: 'ok',
    matched_rules: ['D001', 'P001'],
    merged_output: {
      primary_diagnosis: '形容词修饰名词错误模式',
      secondary_diagnosis: 'affect 是动词，混淆了 affect/effect',
      tags: ['形副转换薄弱', '多音词待巩固'],
      ui_trigger: { show_popup: true, popup_style: 'diagnostic_red', force_quiz: true, add_to_weekend_pack: false },
    },
  };
  const adapter = new EngineAdapter({ transport: async () => mockResp });
  // 游戏事件 → Fact
  const fact = fb.build({ current_word: 'affect', is_correct: false, error_type: 'CONFUSE' });
  ok(fact.current_word === 'affect' && fact.context.error_type === 'CONFUSE', 'E2E: 事件 → Fact');
  // judge → 渲染模型
  const model = await adapter.judge(fact);
  ok(model.ok === true, 'E2E: adapter.judge 返回 ok');
  ok(model.diagnosis.primary.includes('形容词修饰名词'), 'E2E: 主诊断映射');
  ok(model.actions.forceQuiz === true, 'E2E: forceQuiz 映射');
  // 渲染模型 → Learning 区块
  const html = renderLearningDecision(model);
  ok(html.includes('生成一次针对练习'), 'E2E: 渲染含动作文本');
  ok(html.includes('多音词待巩固'), 'E2E: 渲染含标签');
  ok(!html.includes('diagnostic_red'), 'E2E: popup 不进 Panel');
}

console.log(`\nPASS ${pass} / ${pass + fail}`);
process.exit(fail ? 1 : 0);