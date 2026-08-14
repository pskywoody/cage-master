// ==========================================
// test-engine-adapter.mjs - Step 3 EngineAdapter 验证
// 纯映射 + 白名单 + mock transport，不依赖运行中的后端。
// 运行：node scripts/test-engine-adapter.mjs
// ==========================================
import path from 'path';
import { pathToFileURL } from 'url';

const ROOT = 'd:/killersudoku/cagemaster4';
const url = pathToFileURL(path.join(ROOT, 'core/engine-adapter.js')).href;
const { EngineAdapter } = await import(url);

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.error('FAIL:', msg); } }

// ---- 假 engine 响应（对齐稳定契约）----
const SAMPLE = {
  status: 'ok',
  matched_rules: ['D001', 'S001', 'C001'],
  merged_output: {
    primary_diagnosis: '【得分规则】形容词修饰名词、副词修饰动词/形容词！',
    secondary_diagnosis: '【混淆对】affect 是动词(v.影响)',
    tags: ['形副转换薄弱', '多音词待巩固', 'affect_effect混淆'],
    ui_trigger: { show_popup: true, popup_style: 'diagnostic_red', force_quiz: true, add_to_weekend_pack: false },
  },
};

// ---- 1. toRenderModel 纯映射 ----
{
  const m = new EngineAdapter().toRenderModel(SAMPLE);
  ok(m.ok === true, 'ok 映射');
  ok(m.matchedRules.length === 3 && m.matchedRules[0] === 'D001', 'matchedRules 映射');
  ok(m.diagnosis.primary.includes('形容词修饰名词'), 'primary 映射');
  ok(m.diagnosis.secondary.includes('affect 是动词'), 'secondary 映射');
  ok(m.tags.length === 3 && m.tags.includes('形副转换薄弱'), 'tags 映射');
  ok(m.popup.show === true && m.popup.style === 'diagnostic_red', 'popup 映射');
  ok(m.actions.forceQuiz === true && m.actions.addToWeekendPack === false, 'actions 映射');
}

// ---- 2. toRenderModel 空响应兜底 ----
{
  const m = new EngineAdapter().toRenderModel(null);
  ok(m.ok === false, '空响应 ok=false');
  ok(m.matchedRules.length === 0 && m.diagnosis.primary === '' && m.popup.style === 'none', '空响应兜底');
}

// ---- 3. buildFact 白名单 ----
{
  const a = new EngineAdapter();
  const f = a.buildFact({
    current_word: 'address', dwell_time_ms: 1200, is_correct: false,
    context: { error_type: 'POS_MISMATCH' },
    irrelevant: 'should-drop',
  });
  ok(f.current_word === 'address', 'current_word 透传');
  ok(f.dwell_time_ms === 1200, 'dwell_time_ms 透传');
  ok(f.context.error_type === 'POS_MISMATCH', 'context 透传');
  ok(f.irrelevant === undefined, '白名单外字段丢弃');
}

// ---- 4. judge() 用 mock transport ----
{
  let called = null;
  const a = new EngineAdapter({
    endpoint: 'http://x/api/v1/engine/judge',
    transport: async (ep, fact) => { called = { ep, fact }; return SAMPLE; },
  });
  const m = await a.judge({ current_word: 'address' });
  ok(called.ep === 'http://x/api/v1/engine/judge', 'transport 收到 endpoint');
  ok(called.fact.current_word === 'address', 'transport 收到 fact');
  ok(m.ok === true && m.popup.show === true, 'judge 返回渲染模型');
}

// ---- 5. mock transport 抛错传播 ----
{
  const a = new EngineAdapter({ transport: async () => { throw new Error('boom'); } });
  let threw = false;
  try { await a.judge({}); } catch (e) { threw = e.message === 'boom'; }
  ok(threw, 'transport 异常向上传播');
}

console.log(`\n[OK] EngineAdapter :: ${pass}/${pass + fail} 通过`);
if (fail > 0) process.exit(1);