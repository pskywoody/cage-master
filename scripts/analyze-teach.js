// ============================================================
//  analyze-teach.js - 教学有效性分析（2026-08-04）
// ============================================================
//  输入：novice-teach-drive.js 或浏览器 ai-debug 导出的 record JSON
//  （结构同构：meta/lessonPlan/initialBoard/cages/moves/interactions/lessonEvents）
//  输出：结构化教学报告
//    - analyzeTarget      目标合理性：引导格候选数是否唯一可推
//    - analyzeCompletion  完成度：guided 是否采纳、watchCells 命中率、是否通关
//    - analyzeLegality    合法性：错误率、fail 事件、是否卡住
//    - detectBlockages    阻滞点列表
//    - generateReport     汇总评分 + 建议
//
//  用法：
//    node scripts/analyze-teach.js --report reports/novice-103.json
// ============================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================================
//  候选数计算（四重约束：行/列/宫/笼和）
// ============================================================
const key = (r, c) => r + ',' + c;

/**
 * 计算格子候选数（基于 record 快照：initialBoard + cages）
 * @param {Object} rec - record
 * @param {number} r
 * @param {number} c
 * @param {Object} [opts] - { appliedGuided: boolean } 是否应用 guided 目标格已填值
 * @returns {number[]} 候选数组（升序）
 */
export function computeCandidates(rec, r, c, opts = {}) {
  const size = rec.gridSize || 9;
  const box = Math.round(Math.sqrt(size));
  // 2026-08-04：候选基准 = 初始盘面 + guided 目标格已填值（watchCells 在 guided 完成后才可推）
  const board = (rec.initialBoard || []).map((row) => row.map((cl) => ({ ...cl })));
  const lp = rec.lessonPlan || {};
  if (opts.appliedGuided && lp.guided && lp.guided.targetCell && lp.guided.correctValue != null) {
    const [gr, gc] = lp.guided.targetCell;
    if (board[gr] && board[gc] && !board[gr][gc].fixed) {
      board[gr][gc].value = lp.guided.correctValue;
    }
  }
  const used = new Set();

  // 行/列
  for (let i = 0; i < size; i++) {
    const vr = board[r] && board[r][i] ? board[r][i].value : 0;
    const vc = board[i] && board[i][c] ? board[i][c].value : 0;
    if (vr) used.add(vr);
    if (vc) used.add(vc);
  }
  // 宫
  const br = Math.floor(r / box) * box;
  const bc = Math.floor(c / box) * box;
  for (let i = br; i < br + box; i++) for (let j = bc; j < bc + box; j++) {
    const v = board[i] && board[i][j] ? board[i][j].value : 0;
    if (v) used.add(v);
  }

  // 笼和约束：本笼已填之和 + 剩余格组合可行性
  const cage = (rec.cages || []).find((cg) =>
    cg.cells.some((p) => p.row === String.fromCharCode(97 + r) && p.col === c + 1));
  let cageSum = null;
  if (cage) {
    const inCage = cage.cells
      .map((p) => ({ r: p.row.charCodeAt(0) - 97, c: p.col - 1 }))
      .filter((p) => !(p.r === r && p.c === c));
    let filledSum = 0;
    let k = 0; // 笼内未填格数（不含本格）
    for (const p of inCage) {
      const cell = board[p.r] && board[p.r][p.c];
      const v = cell && cell.value ? cell.value : 0;
      if (v) filledSum += v;
      else k++;
    }
    cageSum = { target: cage.sum, filled: filledSum, k };
  }

  const cands = [];
  for (let v = 1; v <= size; v++) {
    if (used.has(v)) continue;
    if (cageSum) {
      const rest = cageSum.target - cageSum.filled - v;
      if (rest < 0) continue; // 超出笼和
      if (cageSum.k === 0 && rest !== 0) continue; // 单格笼必须等于和值
      if (cageSum.k > 0) {
        // 剩余 k 格需凑出 rest：可行区间 [k*1, k*size]，且 rest >= k（最小 1+1..）
        // 更精确：k 个互异数字最小和 1+2+..+k
        const minSum = (cageSum.k * (cageSum.k + 1)) / 2;
        let mx = 0;
        for (let i = 0; i < cageSum.k; i++) mx += size - i;
        if (rest < minSum || rest > mx) continue;
      }
    }
    cands.push(v);
  }
  return cands;
}

/** 计算 record 中某格在 guided/semiAuto 阶段的候选数（用初始盘面近似） */
function cellCandidates(rec, cell, opts) {
  return computeCandidates(rec, cell[0], cell[1], opts);
}

// ============================================================
//  评分函数
// ============================================================

/**
 * 目标合理性：引导格是否"单步可推"（候选数唯一）
 * @returns {{score:number, reason:string, suggestion:string}}
 */
export function analyzeTarget(rec) {
  const lp = rec.lessonPlan;
  let score = 0;
  const reasons = [];
  const suggestions = [];

  if (!lp || (!lp.guided && !lp.semiAuto)) {
    return { score: 0, reason: '无教学计划（lessonPlan 缺失）', suggestion: '补全 lessonPlan 或确认非教学关' };
  }

  // guided 目标格
  if (lp.guided && lp.guided.targetCell) {
    score += 30;
    const cands = cellCandidates(rec, lp.guided.targetCell);
    if (cands.length === 1) {
      score += 35;
      reasons.push(`guided 目标格候选唯一 {${cands.join(',')}}`);
    } else if (cands.length === 2) {
      score += 18;
      reasons.push(`guided 目标格候选 ${cands.length} 个（${cands.join(',')}）——需两步推理`);
      suggestions.push(`引导格候选数 ${cands.length}（≥2），建议改为候选唯一的格子（如已确认的单候选格）`);
    } else {
      score += 5;
      reasons.push(`guided 目标格候选 ${cands.length} 个——小白需大量试错`);
      suggestions.push(`引导格候选数 ${cands.length}（≥3），教学低效，应改为候选唯一或 ≤2 的格子`);
    }
  }

  // semiAuto watchCells（2026-08-04：候选在 guided 目标格已填后计算）
  if (lp.semiAuto && lp.semiAuto.enabled && lp.semiAuto.watchCells.length) {
    score += 10;
    let total = 0;
    let unique = 0;
    for (const w of lp.semiAuto.watchCells) {
      const cands = cellCandidates(rec, w, { appliedGuided: true });
      total += cands.length;
      if (cands.length === 1) unique++;
    }
    const avg = total / lp.semiAuto.watchCells.length;
    if (avg <= 1) { score += 25; reasons.push(`watchCells 平均候选 ${avg.toFixed(1)}（全部单候选）`); }
    else if (avg <= 2) { score += 15; reasons.push(`watchCells 平均候选 ${avg.toFixed(1)}`); suggestions.push(`semiAuto watchCells 平均候选 ${avg.toFixed(1)}，建议选单候选格`); }
    else { score += 5; reasons.push(`watchCells 平均候选 ${avg.toFixed(1)}——引导路径不清晰`); suggestions.push(`semiAuto watchCells 平均候选 ${avg.toFixed(1)}，需换更易推的格子`); }
    void unique;
  }

  return { score: Math.round(score), reason: reasons.join('；') || '—', suggestion: suggestions.join('；') || '' };
}

/**
 * 完成度：引导是否被采纳、是否通关
 * @returns {{score:number, reason:string, suggestion:string}}
 */
export function analyzeCompletion(rec) {
  const lp = rec.lessonPlan;
  let score = 0;
  const reasons = [];
  const suggestions = [];

  // 通关
  const complete = !!rec.completedAt;
  if (complete) { score += 30; reasons.push('已通关'); }
  else { reasons.push('未通关'); suggestions.push('关卡未能完成，检查教学流程是否卡住'); }

  // guided 采纳：moves 中 guided 阶段填数是否有 correct:true
  const guidedMoves = (rec.moves || []).filter((m) => m.lessonPhase === 'guided' && m.type === 'fill');
  const guidedCorrect = guidedMoves.filter((m) => m.correct === true);
  if (guidedCorrect.length > 0) { score += 25; reasons.push(`guided 按引导填对 ${guidedCorrect.length} 次`); }
  else if (guidedMoves.length > 0) { reasons.push('guided 阶段全部填错'); suggestions.push('guided 提示不够清晰，玩家无法推出答案'); }
  else if (!lp || !lp.guided) { /* 无 guided */ }
  else { reasons.push('guided 无填数记录'); }

  // watchCells 命中率
  if (lp && lp.semiAuto && lp.semiAuto.enabled && lp.semiAuto.watchCells.length) {
    const watchEvents = (rec.lessonEvents || []).filter((e) => e.type === 'watch' && e.correct !== false);
    const hitCells = new Set(watchEvents.map((e) => key(e.cell[0], e.cell[1])));
    const hit = lp.semiAuto.watchCells.filter((w) => hitCells.has(key(w[0], w[1]))).length;
    const rate = hit / lp.semiAuto.watchCells.length;
    score += Math.round(rate * 40);
    reasons.push(`watchCells 命中 ${hit}/${lp.semiAuto.watchCells.length}（${Math.round(rate * 100)}%）`);
    if (rate < 0.5) suggestions.push(`semiAuto 引导仅被采纳 ${Math.round(rate * 100)}%，玩家偏离引导路径，建议加强 watchCells 锁定或提示`);
  } else {
    score += 40;
  }

  return { score: Math.round(score), reason: reasons.join('；') || '—', suggestion: suggestions.join('；') || '' };
}

/**
 * 合法性：错误率、fail 事件、是否卡住
 * @returns {{score:number, reason:string, suggestion:string}}
 */
export function analyzeLegality(rec) {
  const moves = rec.moves || [];
  const fills = moves.filter((m) => m.type === 'fill');
  const wrong = fills.filter((m) => m.correct === false);
  let score = 100;

  const reasons = [];
  const suggestions = [];
  const wrongRate = fills.length ? wrong.length / fills.length : 0;
  if (wrongRate === 0) reasons.push(`零错误（${fills.length} 步）`);
  else {
    score -= Math.round(wrongRate * 50);
    reasons.push(`错误 ${wrong.length}/${fills.length} 步（${Math.round(wrongRate * 100)}%）`);
    if (wrongRate > 0.3) suggestions.push('错误率过高，教学提示可能不足或目标格过难');
  }

  const failEvents = (rec.lessonEvents || []).filter((e) => e.type === 'fail');
  if (failEvents.length) {
    score -= Math.min(20, failEvents.length * 8);
    reasons.push(`guided 填错提示 ${failEvents.length} 次`);
  }

  const isStuck = rec.status === 'stuck' || (rec.moves && rec.moves.length > 100);
  if (isStuck) { score -= 30; reasons.push('卡住未通关'); suggestions.push('教学流程存在死锁，需修复'); }

  return { score: Math.max(0, Math.round(score)), reason: reasons.join('；') || '—', suggestion: suggestions.join('；') || '' };
}

// ============================================================
//  阻滞点检测
// ============================================================

/**
 * 检测阻滞点
 * @returns {Array<{type:string, cell:string, evidence:string, suggestion:string}>}
 */
export function detectBlockages(rec) {
  const lp = rec.lessonPlan;
  const blockages = [];
  const keyName = (cell) => String.fromCharCode(97 + cell[0]) + (cell[1] + 1);

  // 1. 引导格候选过多
  if (lp && lp.guided && lp.guided.targetCell) {
    const cands = cellCandidates(rec, lp.guided.targetCell);
    if (cands.length >= 3) {
      blockages.push({
        type: 'target-multi-candidate',
        cell: keyName(lp.guided.targetCell),
        evidence: `引导格候选 ${cands.length} 个（${cands.join(',')}），无法单步推出`,
        suggestion: '改用候选唯一的格子作为 guided 目标',
      });
    }
  }

  // 1b. watchCells 候选过多（2026-08-04：guided 填完后计算）
  if (lp && lp.semiAuto && lp.semiAuto.enabled && lp.semiAuto.watchCells.length) {
    const multi = lp.semiAuto.watchCells.filter((w) => cellCandidates(rec, w, { appliedGuided: true }).length >= 3);
    if (multi.length) {
      blockages.push({
        type: 'watch-multi-candidate',
        cell: multi.map(keyName).join(','),
        evidence: `watchCells 候选过多 ${multi.length} 格`,
        suggestion: 'semiAuto watchCells 应选 guided 后候选唯一的格',
      });
    }
  }

  // 2. guided 反复填错
  const failEvents = (rec.lessonEvents || []).filter((e) => e.type === 'fail');
  if (failEvents.length >= 2) {
    blockages.push({
      type: 'guided-repeated-fail',
      cell: failEvents[0].cell ? keyName(failEvents[0].cell) : '—',
      evidence: `guided 填错 ${failEvents.length} 次`,
      suggestion: '加强 failHint 的具体指引或降低目标格难度',
    });
  }

  // 3. semiAuto 引导偏离
  if (lp && lp.semiAuto && lp.semiAuto.enabled && lp.semiAuto.watchCells.length) {
    const watchEvents = (rec.lessonEvents || []).filter((e) => e.type === 'watch' && e.correct !== false);
    const hitCells = new Set(watchEvents.map((e) => key(e.cell[0], e.cell[1])));
    const missed = lp.semiAuto.watchCells.filter((w) => !hitCells.has(key(w[0], w[1])));
    if (missed.length > 0) {
      blockages.push({
        type: 'watch-cell-missed',
        cell: missed.map(keyName).join(','),
        evidence: `watchCells 未命中 ${missed.length}/${lp.semiAuto.watchCells.length}`,
        suggestion: 'semiAuto 引导未被采纳，建议锁定引导格或增强提示',
      });
    }
  }

  // 4. 笔记→填数脱节：note 后未在同格 fill
  const moves = rec.moves || [];
  const noteFilled = new Set();
  moves.forEach((m) => {
    if (m.type === 'note') noteFilled.add(m.cell.row + m.cell.col);
    if (m.type === 'fill') noteFilled.delete(m.cell.row + m.cell.col);
  });
  if (noteFilled.size > 0) {
    blockages.push({
      type: 'note-fill-disconnect',
      cell: Array.from(noteFilled).join(','),
      evidence: `${noteFilled.size} 个格子记了笔记但未填数`,
      suggestion: '引导"笔记做完后在同一格填上答案"',
    });
  }

  // 5. 未通关
  if (!rec.completedAt) {
    blockages.push({
      type: 'not-completed',
      cell: '—',
      evidence: '关卡未完成',
      suggestion: '检查教学流程是否死锁或玩家卡住',
    });
  }

  return blockages;
}

// ============================================================
//  错误模式分析（2026-08-04 新增）
//  按格统计填错次数与尝试数字，分类：
//    blocker      连续错误 ≥3 次 → 引导严重缺失/歧义（高）
//    confusion    2 次错误且尝试不同数字 → 玩家在猜测（中）
//    exploration  1 次孤立错误 → 自由探索（低）
// ============================================================
function moveCellIndex(move) {
  // 兼容多种格式：{cell:{row:'a',col:3}} / {cell:{row:0,col:2}} / {r,c}
  const c = move.cell || {};
  let r = null, col = null;
  if (typeof c.row === 'number') r = c.row;
  else if (typeof c.row === 'string' && c.row.length === 1) r = c.row.charCodeAt(0) - 97;
  else if (typeof move.r === 'number') r = move.r;
  if (typeof c.col === 'number') col = c.col - 1; // col 1-based
  else if (typeof move.c === 'number') col = move.c;
  return { r, c: col };
}

/**
 * 错误模式分析
 * @param {Array} moves - record.moves
 * @returns {Array<{type, severity, cell, reason, suggestion}>}
 */
export function analyzeErrors(moves) {
  const errorMap = {};
  for (const move of (moves || [])) {
    if (move.correct !== false) continue;
    const { r, c } = moveCellIndex(move);
    if (r === null || c === null) continue;
    const key = r + ',' + c;
    if (!errorMap[key]) errorMap[key] = [];
    errorMap[key].push(move.num);
  }

  const errorTypes = [];
  for (const [cellKey, errors] of Object.entries(errorMap)) {
    const [r, c] = cellKey.split(',').map(Number);
    const count = errors.length;
    const uniqueErrors = new Set(errors).size;
    const cellName = String.fromCharCode(97 + r) + (c + 1);

    if (count >= 3) {
      errorTypes.push({
        type: 'blocker',
        severity: 'high',
        cell: { row: r, col: c },
        cellName,
        reason: `格 ${cellName} 连续错误 ${count} 次（尝试 ${Array.from(new Set(errors)).join(',')}），引导严重缺失或歧义`,
        suggestion: '检查该格的目标格提示是否清晰、候选数是否过多、或引导顺序是否合理',
      });
    } else if (count === 2 && uniqueErrors === 2) {
      errorTypes.push({
        type: 'confusion',
        severity: 'medium',
        cell: { row: r, col: c },
        cellName,
        reason: `格 ${cellName} 2 次错误尝试不同数字（${errors.join(',')}），玩家在猜测而非推理`,
        suggestion: '检查该格的提示是否足够明确，可能需要增加行/列排除的高亮',
      });
    } else if (count === 1) {
      errorTypes.push({
        type: 'exploration',
        severity: 'low',
        cell: { row: r, col: c },
        cellName,
        reason: `格 ${cellName} 1 次孤立错误，可能是自由探索`,
        suggestion: '降低权重，不作为教学阻滞点',
      });
    }
  }
  return errorTypes;
}

// ============================================================
//  汇总报告
// ============================================================

export function generateReport(rec) {
  const t = analyzeTarget(rec);
  const c = analyzeCompletion(rec);
  const l = analyzeLegality(rec);
  const blockages = detectBlockages(rec);
  const errorTypes = analyzeErrors(rec.moves || []);

  const totalScore = Math.round(t.score * 0.35 + c.score * 0.4 + l.score * 0.25);
  let verdict;
  if (totalScore >= 85) verdict = '✅ 通过';
  else if (totalScore >= 65) verdict = '⚠️ 警告';
  else verdict = '❌ 不通过';

  const recommendations = [];
  if (t.suggestion) recommendations.push(t.suggestion);
  if (c.suggestion) recommendations.push(c.suggestion);
  if (l.suggestion) recommendations.push(l.suggestion);
  blockages.forEach((b) => recommendations.push(b.suggestion));
  errorTypes.filter((e) => e.severity !== 'low').forEach((e) => recommendations.push(e.suggestion));

  return {
    levelId: rec.levelId,
    summary: {
      targetScore: t.score,
      completionScore: c.score,
      legalityScore: l.score,
      totalScore,
    },
    reasons: { target: t.reason, completion: c.reason, legality: l.reason },
    blockages,
    errors: {
      blockers: errorTypes.filter((e) => e.severity === 'high').length,
      confusions: errorTypes.filter((e) => e.severity === 'medium').length,
      explorations: errorTypes.filter((e) => e.severity === 'low').length,
      details: errorTypes,
    },
    recommendations: Array.from(new Set(recommendations)),
    verdict,
  };
}

// ============================================================
//  CLI：单关分析
// ============================================================
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  let input = null, output = null, levelId = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--input' || args[i] === '--report') input = args[++i];
    else if (args[i] === '--output') output = args[++i];
    else if (args[i] === '--level') levelId = parseInt(args[++i], 10);
  }
  if (!input) {
    console.error('用法: node scripts/analyze-teach.js --input <record.json> [--level 101] [--output analysis/101.json]');
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(path.resolve(input), 'utf8'));
  // 支持直接 record 或 { results: [...] }（驱动脚本输出）
  let records = data.results ? data.results.map((r) => ({ status: r.status, ...r.record })) : [data];
  if (levelId != null) records = records.filter((r) => r.levelId === levelId);
  const reports = records.map((rec) => generateReport(rec));
  if (output) {
    const out = path.resolve(output);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(reports.length === 1 ? reports[0] : reports, null, 2));
    console.log(`报告已保存: ${out}`);
  } else {
    reports.forEach((g) => console.log(JSON.stringify(g, null, 2)));
  }
}
