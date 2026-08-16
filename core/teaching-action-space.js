// ============================================================
// teaching-action-space.js — Teaching Action Space Expansion
// shadow-only：扩充可观测教学动作空间（question / partial_hint /
// difficulty_down / difficulty_up），不执行、不接生产、不改
// LessonPlan/HintSystem/TeachingSystem。
// ============================================================

export const TEACHING_ACTIONS = [
  'hint', 'demo', 'guided', 'question', 'partial_hint', 'difficulty_down', 'difficulty_up',
];

export const ACTION_MEANING = {
  hint: '已有：直接提示',
  demo: '已有：演示',
  guided: '已有：引导',
  question: '新增：苏格拉底式提问',
  partial_hint: '新增：分级局部提示',
  difficulty_down: '新增：降低难度',
  difficulty_up: '新增：提升难度/挑战',
};

// TP-2：shadow-only Question generator（只生成问题文本，不执行、不显示）
export function generateQuestion({ learnerState, technique, errorContext }) {
  const pattern = learnerState?.errorPattern || 'omission';
  const target = errorContext?.target || technique || 'concept';
  const map = {
    misread: `你认为「${target}」这里，哪个约束最先被违反？`,
    guess: `如果不用猜，你能指出「${target}」里哪一步的证据最弱吗？`,
    weak: `「${target}」的解题依据里，你最不确定的是哪一条？`,
    omission: `在「${target}」这一步，你漏掉了哪个约束条件？`,
  };
  return {
    action: 'question',
    target,
    intensity: 0.5,
    reason: `shadow-only QuestionGenerator（pattern=${pattern}）`,
    expected_outcome: '独立推理增强',
    question_text: map[pattern] || map.omission,
    question_generated: true,
  };
}

// TP-3：Partial hint ladder（shadow-only）
export const HINT_LADDER = [
  { level: 0, label: '提醒目标', desc: '只提醒当前目标，不给方向' },
  { level: 1, label: '指出方向', desc: '指出解题方向，不给局部信息' },
  { level: 2, label: '局部信息', desc: '给出局部信息，不完整步骤' },
  { level: 3, label: '完整步骤', desc: '给出完整步骤' },
];

export function partialHint(level, { technique, errorContext }) {
  const lvl = Math.max(0, Math.min(3, level ?? 1));
  const target = errorContext?.target || technique || 'concept';
  const step = HINT_LADDER[lvl];
  return {
    action: 'partial_hint',
    target,
    intensity: +(0.25 + 0.25 * lvl).toFixed(2),
    reason: 'shadow-only partial hint ladder',
    expected_outcome: 'hint economy（分级信息量）',
    hint_level: lvl,
    hint_text: `[level${lvl} ${step.label}] 关于「${target}」：${step.desc}`,
  };
}

// 难度信号：降难度 vs 升挑战（shadow-only）
export function difficultySignal({ learnerState, technique }) {
  const frust = learnerState?.frustration ?? 0.3;
  const fails = learnerState?.consecutiveFailures ?? 0;
  if (frust > 0.7 || fails >= 3) return 'difficulty_down';
  const lv = learnerState?.mastery?.[technique] || 'novice';
  if (lv === 'fluent' || lv === 'near_mastery') return 'difficulty_up';
  return null;
}

// 扩充后的候选动作（ordered，用于 coverage / ranking v2）
export function expandCandidates({ learnerState, technique }) {
  const cands = ['question', 'partial_hint'];
  const d = difficultySignal({ learnerState, technique });
  if (d) cands.push(d);
  cands.push('demo', 'guided', 'hint');
  return [...new Set(cands)];
}