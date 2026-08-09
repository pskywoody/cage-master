// ============================================================
//  ai-suggest-fix.js - AI 教学补丁建议（2026-08-04）
// ============================================================
//  读取 analyze-teach 的分析报告 + 关卡原始数据，构建防御性
//  Prompt 调用 DeepSeek（或 OpenAI 兼容接口）生成教学配置补丁，
//  只允许修改 lessonPlan.phases.guided / semiAuto 的白名单字段。
//
//  无 API key 时（--no-llm 或未配置）降级为启发式建议：
//  用 computeCandidates 扫描「guided 填完后候选唯一」的空格，
//  生成候选目标格替换补丁——保证无 LLM 也有实用价值。
//
//  用法：
//    node scripts/ai-suggest-fix.js --input analysis/101.json \
//      --level-data data/levels/level-101.json --output patches/101-fix.json
//    node scripts/ai-suggest-fix.js ... --no-llm   # 跳过 LLM，仅启发式
// ============================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { computeCandidates } from './analyze-teach.js';
import { buildRecordSnapshot } from '../core/ai-record.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1';

// ---- API Key（优先级：环境变量 > config.json）----
function getApiKey() {
  if (process.env.DEEPSEEK_API_KEY) return process.env.DEEPSEEK_API_KEY;
  try {
    const configPath = path.join(__dirname, '..', 'config.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (config.deepseekApiKey) return config.deepseekApiKey;
    }
  } catch (e) { /* ignore */ }
  return null;
}

async function callChatAPI(messages, opts = {}) {
  const apiKey = getApiKey();
  const response = await fetch(DEEPSEEK_BASE_URL + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages,
      temperature: opts.temperature ?? 0.2,
      max_tokens: opts.maxTokens ?? 800,
      stream: false,
    }),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`LLM API error: ${response.status} ${response.statusText} - ${err}`);
  }
  const data = await response.json();
  return data.choices[0].message.content.trim();
}

// ---- 防御性 Prompt ----
function buildPrompt(analysis, levelData) {
  return [
    '你是一个数独教学关卡调试助手。分析关卡数据与小白 AI 测试报告，找出教学引导改进点，输出修改建议。',
    '',
    '【输入】',
    '- 关卡原始数据：' + JSON.stringify(levelData),
    '- 分析报告：' + JSON.stringify(analysis),
    '',
    '【约束】',
    '1. 只能修改 lessonPlan.phases 中的字段：guided.targetCell / guided.hintText / guided.successNext / semiAuto.watchCells / semiAuto.hintText',
    '2. 严禁修改任何 voiceId / successVoiceId / failVoiceId / hintVoiceId 字段',
    '3. 严禁修改棋盘结构（cages, boardData, solution, gridSize）',
    '4. 严禁修改对话台词（preDialog, clearDialog）及 lessonPlan 结构本身',
    '5. 坐标一律使用 [行, 列] 数字索引（0 起）',
    '',
    '【输出格式】只输出纯 JSON，禁止 Markdown、解释或额外文本：',
    '{ "patch": { "targetCell": [0, 2], "hintText": "..." }, "reason": "..." }',
  ].join('\n');
}

// ---- 从 LLM 回复中提取 JSON ----
function extractJson(text) {
  const trimmed = text.trim();
  try { return JSON.parse(trimmed); } catch (e) { /* fallthrough */ }
  const m = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (m) {
    try { return JSON.parse(m[1].trim()); } catch (e) { /* fallthrough */ }
  }
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(trimmed.slice(start, end + 1)); } catch (e) { /* fallthrough */ }
  }
  throw new Error('无法从 LLM 回复解析 JSON: ' + text.slice(0, 200));
}

// ---- 启发式降级：扫描候选唯一的空格替换目标格 ----
function heuristicPatch(analysis, levelData, rec) {
  const size = levelData.gridSize || 9;
  const guided = (levelData.lessonPlan && levelData.lessonPlan.phases && levelData.lessonPlan.phases.guided) || null;
  const semi = (levelData.lessonPlan && levelData.lessonPlan.phases && levelData.lessonPlan.phases.semiAuto) || null;
  const patch = {};
  const reasons = [];

  const hasTargetIssue =
    (analysis.summary && analysis.summary.targetScore != null && analysis.summary.targetScore < 70) ||
    (analysis.blockages || []).some((b) => b.type === 'target-multi-candidate' || b.type === 'watch-multi-candidate');

  if (hasTargetIssue && guided) {
    const current = guided.targetCell || null;
    // 扫描所有空格（排除固定格与当前目标），找 guided 填完后候选唯一的格
    const candidates = [];
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
      const fixed = rec.initialBoard[r] && rec.initialBoard[r][c] && rec.initialBoard[r][c].fixed;
      if (fixed) continue;
      if (current && r === current[0] && c === current[1]) continue;
      const cands = computeCandidates(rec, r, c, { appliedGuided: true });
      if (cands.length === 1) {
        candidates.push({ cell: [r, c], value: cands[0] });
      }
    }
    if (candidates.length > 0) {
      // 优先与当前目标格同类区域（简化：取第一个）
      const best = candidates[0];
      patch.targetCell = best.cell;
      const name = String.fromCharCode(97 + best.cell[0]) + (best.cell[1] + 1);
      patch.hintText = `看 ${name} 这一格：行、列、宫和笼和排除后，只剩 ${best.value} 可以填。`;
      reasons.push(`原目标格候选不唯一/过多，改用候选唯一的 ${name}（=${best.value}）`);
    } else {
      reasons.push('未找到候选唯一的替代格（建议人工检查笼和约束）');
    }
  }

  if (Object.keys(patch).length === 0) {
    reasons.push('分析未发现可自动修复的目标格问题，建议人工复核');
  }

  return {
    patch,
    reason: reasons.join('；'),
  };
}

// ============================================================
//  主流程
// ============================================================
const args = process.argv.slice(2);
const opt = { input: null, levelData: null, output: null, noLlm: false };
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--input') opt.input = args[++i];
  else if (args[i] === '--level-data') opt.levelData = args[++i];
  else if (args[i] === '--output') opt.output = args[++i];
  else if (args[i] === '--no-llm') opt.noLlm = true;
}

if (!opt.input || !opt.levelData) {
  console.error('用法: node scripts/ai-suggest-fix.js --input <analysis.json> --level-data <level.json> [--output patch.json] [--no-llm]');
  process.exit(1);
}

const analysis = JSON.parse(fs.readFileSync(path.resolve(opt.input), 'utf8'));
const levelData = JSON.parse(fs.readFileSync(path.resolve(opt.levelData), 'utf8'));
const rec = Object.assign({ gridSize: levelData.gridSize || 9 }, buildRecordSnapshot(levelData));

const apiKey = getApiKey();
const useLlm = !opt.noLlm && apiKey;

let result;
if (useLlm) {
  const prompt = buildPrompt(analysis, levelData);
  console.log('调用 DeepSeek 生成补丁…');
  try {
    const reply = await callChatAPI([
      { role: 'system', content: '你是数独教学关卡调试助手，只输出 JSON。' },
      { role: 'user', content: prompt },
    ]);
    result = extractJson(reply);
    if (!result || typeof result !== 'object' || !result.patch) {
      throw new Error('LLM 返回结构异常: ' + JSON.stringify(result));
    }
  } catch (e) {
    console.warn('LLM 调用失败，降级启发式: ' + e.message);
    result = heuristicPatch(analysis, levelData, rec);
  }
} else {
  console.log((apiKey ? '（--no-llm 指定）' : '（未配置 DEEPSEEK_API_KEY）') + ' 使用启发式建议');
  result = heuristicPatch(analysis, levelData, rec);
}

const out = opt.output ? path.resolve(opt.output) : null;
if (out) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(result, null, 2));
  console.log('补丁已保存: ' + out);
} else {
  console.log(JSON.stringify(result, null, 2));
}
