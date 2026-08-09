// ============================================================
//  validate-patch.js - 教学补丁合法性验证（2026-08-04）
// ============================================================
//  验证 ai-suggest-fix（或人工）生成的补丁：
//   1. JSON 结构完整
//   2. 补丁字段白名单（只允许 guided/semiAuto 的教学字段）
//   3. 坐标合法性（targetCell / successNext / watchCells 在棋盘范围内）
//   4. voiceId 未被篡改（补丁不得携带 voiceId 类字段）
//   5. 候选唯一性建议（新 targetCell 候选非唯一时给出 warning）
//
//  用法：
//    node scripts/validate-patch.js --patch patches/101-fix.json --original data/levels/level-101.json
// ============================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { computeCandidates } from './analyze-teach.js';
import { buildRecordSnapshot } from '../core/ai-record.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 补丁允许出现的字段白名单（lessonPlan 教学字段）
const PATCH_FIELDS = new Set([
  'targetCell', 'hintText', 'successNext', 'watchCells',
]);

const VOICE_KEYS = ['voiceId', 'successVoiceId', 'failVoiceId', 'hintVoiceId'];

function extractVoiceIdKeys(obj, prefix = '') {
  const found = [];
  if (!obj || typeof obj !== 'object') return found;
  for (const [key, val] of Object.entries(obj)) {
    if (VOICE_KEYS.includes(key)) found.push(prefix + key);
    if (val && typeof val === 'object') {
      found.push(...extractVoiceIdKeys(val, prefix + key + '.'));
    }
  }
  return found;
}

/**
 * 验证补丁
 * @param {Object} patchData - { patch: {...}, reason: string }
 * @param {Object} originalData - 关卡原始 JSON
 * @returns {{valid: boolean, errors: string[], warnings: string[], summary: string}}
 */
export function validatePatch(patchData, originalData) {
  const errors = [];
  const warnings = [];
  const gridSize = originalData.gridSize || 9;
  const maxIndex = gridSize - 1;

  // ---- 1. 结构完整性 ----
  if (!patchData || typeof patchData !== 'object') {
    return { valid: false, errors: ['补丁不是合法 JSON 对象'], warnings: [], summary: '❌ 补丁格式无效' };
  }
  const patch = patchData.patch;
  if (!patch || typeof patch !== 'object') {
    return { valid: false, errors: ['补丁缺少 patch 字段'], warnings: [], summary: '❌ 补丁格式无效' };
  }
  if (patchData.reason != null && typeof patchData.reason !== 'string') {
    errors.push('reason 字段应为字符串');
  }

  // ---- 2. 字段白名单 ----
  for (const key of Object.keys(patch)) {
    if (!PATCH_FIELDS.has(key)) {
      errors.push(`补丁包含非白名单字段: ${key}（只允许 ${Array.from(PATCH_FIELDS).join('/')}）`);
    }
  }

  // ---- 3. voiceId 未篡改 ----
  const patchedVoiceKeys = extractVoiceIdKeys(patch);
  if (patchedVoiceKeys.length > 0) {
    errors.push(`补丁包含 voiceId 类字段: ${patchedVoiceKeys.join(', ')}（严禁修改 voiceId）`);
  }

  // ---- 4. 坐标合法性 ----
  const checkCell = (cell, label) => {
    if (!Array.isArray(cell) || cell.length !== 2) {
      errors.push(`${label} 应为 [行, 列] 数组`);
      return;
    }
    const [r, c] = cell;
    if (!Number.isInteger(r) || !Number.isInteger(c) || r < 0 || r > maxIndex || c < 0 || c > maxIndex) {
      errors.push(`${label} [${r}, ${c}] 超出 ${gridSize}x${gridSize} 范围`);
    }
  };

  if (patch.targetCell) checkCell(patch.targetCell, 'targetCell');

  if (patch.successNext) {
    if (!Array.isArray(patch.successNext)) {
      errors.push('successNext 应为数组');
    } else {
      for (const step of patch.successNext) {
        const cell = Array.isArray(step) ? step : (step && step.cell);
        checkCell(cell, 'successNext 格');
      }
    }
  }

  if (patch.watchCells) {
    if (!Array.isArray(patch.watchCells)) {
      errors.push('watchCells 应为数组');
    } else {
      for (const w of patch.watchCells) checkCell(w, 'watchCells 格');
    }
  }

  // ---- 5. 候选唯一性建议（非阻断）----
  if (patch.targetCell) {
    const rec = Object.assign({ gridSize }, buildRecordSnapshot(originalData));
    const cands = computeCandidates(rec, patch.targetCell[0], patch.targetCell[1], { appliedGuided: true });
    if (cands.length !== 1) {
      warnings.push(`新 targetCell 候选数 ${cands.length}（${cands.join(',')}），非候选唯一——引导可能仍然低效（建议人工复核）`);
    } else {
      warnings.push(`新 targetCell 候选唯一 = ${cands[0]}`);
    }
  }
  if (patch.watchCells) {
    const rec = Object.assign({ gridSize }, buildRecordSnapshot(originalData));
    const multi = patch.watchCells.filter((w) => computeCandidates(rec, w[0], w[1], { appliedGuided: true }).length !== 1);
    if (multi.length) {
      warnings.push(`watchCells 中 ${multi.length} 格非候选唯一（${multi.map((w) => String.fromCharCode(97 + w[0]) + (w[1] + 1)).join(',')}）`);
    }
  }

  const valid = errors.length === 0;
  const summary = valid
    ? (warnings.length ? '✅ 补丁验证通过（含 ' + warnings.length + ' 条建议）' : '✅ 补丁验证通过')
    : `❌ ${errors.length} 个问题`;
  return { valid, errors, warnings, summary };
}

// ---- CLI ----
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  let patchPath = null, originalPath = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--patch') patchPath = args[++i];
    else if (args[i] === '--original') originalPath = args[++i];
  }
  if (!patchPath || !originalPath) {
    console.error('用法: node scripts/validate-patch.js --patch <patch.json> --original <level.json>');
    process.exit(1);
  }
  const patchData = JSON.parse(fs.readFileSync(path.resolve(patchPath), 'utf8'));
  const originalData = JSON.parse(fs.readFileSync(path.resolve(originalPath), 'utf8'));
  const result = validatePatch(patchData, originalData);
  console.log(result.summary);
  for (const w of result.warnings) console.log('  ⚠ ' + w);
  for (const e of result.errors) console.log('  - ' + e);
  process.exit(result.valid ? 0 : 1);
}
