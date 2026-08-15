// ==========================================
// 关卡数据校验脚本
// ==========================================
// 验证所有关卡 JSON 文件的结构完整性
// 使用: node scripts/validate-levels.js
// ==========================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data', 'levels');

// ==========================================
// 校验规则
// ==========================================

const VALID_DEMO_ACTIONS = new Set([
  'highlightRow', 'highlightCol', 'highlightBox', 'highlightPalace',
  'highlightCage', 'highlightCell', 'highlightCells', 'focusCell', 'showSumBadge',
  'showNote', 'showNotes', 'strikeNote', 'concludeCell',
  'wait', 'spotlightOn', 'spotlightOff', 'freezeOn', 'freezeOff',
  'clearHighlights', 'highlightButton', 'unhighlightButton',
]);

const VALID_INTERACTION_TYPES = new Set([
  'NUMBER', 'NOTE_ONLY', 'WHAT_IF_ENTRY', 'WHAT_IF_FILL',
]);

/**
 * 校验单个关卡文件
 */
function validateLevel(filePath) {
  const errors = [];
  const warnings = [];
  let data;

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    data = JSON.parse(raw);
  } catch (e) {
    return { levelId: path.basename(filePath, '.json'), errors: ['JSON 解析失败: ' + e.message], warnings: [] };
  }

  const levelId = data.levelId || path.basename(filePath, '.json');

  if (!data.levelId) errors.push('缺少 levelId 字段');
  if (!data.title) warnings.push('缺少 title 字段');
  if (!data.gridSize) {
    errors.push('缺少 gridSize 字段');
  } else if (![4, 6, 9].includes(data.gridSize)) {
    errors.push('gridSize 无效: ' + data.gridSize + '，仅支持 4/6/9');
  }

  // boardData 校验
  if (!data.boardData) {
    errors.push('缺少 boardData 字段');
  } else if (!Array.isArray(data.boardData)) {
    errors.push('boardData 必须是数组');
  } else {
    const size = data.boardData.length;
    if (data.gridSize && size !== data.gridSize) {
      errors.push('boardData 大小 (' + size + 'x' + size + ') 与 gridSize (' + data.gridSize + ') 不匹配');
    }
    for (let r = 0; r < size; r++) {
      if (!Array.isArray(data.boardData[r])) {
        errors.push('boardData[' + r + '] 不是数组');
        continue;
      }
      if (data.boardData[r].length !== size) {
        errors.push('boardData[' + r + '] 长度 ' + data.boardData[r].length + ' 不等于 ' + size);
      }
      for (let c = 0; c < data.boardData[r].length; c++) {
        const v = data.boardData[r][c];
        if (typeof v !== 'number' || v < 0 || v > size) {
          errors.push('boardData[' + r + '][' + c + '] 无效: ' + v);
        }
      }
    }
  }

  // solution 校验
  if (!data.solution) {
    errors.push('缺少 solution 字段');
  } else if (!Array.isArray(data.solution)) {
    errors.push('solution 必须是数组');
  } else {
    const size = data.solution.length;
    for (let r = 0; r < size; r++) {
      if (!Array.isArray(data.solution[r])) {
        errors.push('solution[' + r + '] 不是数组');
        continue;
      }
      if (data.solution[r].length !== size) {
        errors.push('solution[' + r + '] 长度 ' + data.solution[r].length + ' 不等于 ' + size);
      }
      for (let c = 0; c < data.solution[r].length; c++) {
        const v = data.solution[r][c];
        if (typeof v !== 'number' || v < 1 || v > size) {
          errors.push('solution[' + r + '][' + c + '] 无效: ' + v);
        }
      }
    }
  }

  // cages 校验
  if (data.cages) {
    if (!Array.isArray(data.cages)) {
      errors.push('cages 必须是数组');
    } else {
      const seenIds = new Set();
      for (let i = 0; i < data.cages.length; i++) {
        const cage = data.cages[i];
        if (!cage) { errors.push('cages[' + i + '] 为空'); continue; }
        if (cage.id === undefined) errors.push('cages[' + i + '] 缺少 id');
        else if (seenIds.has(cage.id)) errors.push('cages[' + i + '] id 重复: ' + cage.id);
        else seenIds.add(cage.id);
        if (typeof cage.sum !== 'number') errors.push('cages[' + i + '] 缺少 sum 或不是数字');
        if (!Array.isArray(cage.cells) || cage.cells.length < 1) {
          errors.push('cages[' + i + '] cells 无效（至少需要2格）');
        } else {
          for (const cell of cage.cells) {
            if (!Array.isArray(cell) || cell.length !== 2) {
              errors.push('cages[' + i + '] 格子坐标格式错误: ' + JSON.stringify(cell));
            }
          }
        }
      }
    }
  }

  // lessonPlan 校验
  if (data.lessonPlan) {
    validateLessonPlan(data, errors, warnings);
  } else {
    warnings.push('缺少 lessonPlan 字段');
  }

  // dialog 校验
  if (data.preDialog && !Array.isArray(data.preDialog)) warnings.push('preDialog 必须是数组');
  if (data.clearDialog && !Array.isArray(data.clearDialog)) warnings.push('clearDialog 必须是数组');

  // threeAct 校验
  if (data.threeAct) {
    if (!Array.isArray(data.threeAct.opening)) warnings.push('threeAct.opening 缺少或不是数组');
    if (!Array.isArray(data.threeAct.breakthrough)) warnings.push('threeAct.breakthrough 缺少或不是数组');
    if (!Array.isArray(data.threeAct.avalanche)) warnings.push('threeAct.avalanche 缺少或不是数组');
  }

  return { levelId, errors, warnings };
}

function validateLessonPlan(data, errors, warnings) {
  const lp = data.lessonPlan;
  const size = data.gridSize || 9;
  const solution = data.solution;
  if (!lp.phases) { errors.push('lessonPlan 缺少 phases 字段'); return; }
  const phases = lp.phases;

  // intro
  if (phases.intro) {
    if (!phases.intro.text) warnings.push('phases.intro.text 为空');
  } else {
    warnings.push('缺少 phases.intro');
  }

  // demo
  if (phases.demo) {
    if (phases.demo.steps) {
      if (!Array.isArray(phases.demo.steps)) {
        errors.push('phases.demo.steps 必须是数组');
      } else {
        for (let i = 0; i < phases.demo.steps.length; i++) {
          const step = phases.demo.steps[i];
          if (!step.action) { errors.push('phases.demo.steps[' + i + '] 缺少 action'); continue; }
          if (!VALID_DEMO_ACTIONS.has(step.action)) warnings.push('phases.demo.steps[' + i + '] 未知 action: "' + step.action + '"');
          if (step.action === 'highlightCage' && data.cages) {
            const exists = data.cages.some(c => String(c.id) === String(step.target));
            if (!exists) warnings.push('phases.demo.steps[' + i + '] cage ' + step.target + ' 不存在');
          }
          if ((step.action === 'highlightCell' || step.action === 'focusCell') && Array.isArray(step.target)) {
            const [r, c] = step.target;
            if (r < 0 || r >= size || c < 0 || c >= size) errors.push('phases.demo.steps[' + i + '] 格子 (' + r + ',' + c + ') 超出范围');
          }
          if ((step.action === 'highlightRow' || step.action === 'highlightCol') && typeof step.target === 'number') {
            if (step.target < 0 || step.target >= size) errors.push('phases.demo.steps[' + i + '] 行/列 ' + step.target + ' 超出范围');
          }
        }
      }
    } else {
      warnings.push('phases.demo.steps 不存在');
    }
  } else {
    warnings.push('缺少 phases.demo');
  }

  // guided
  if (phases.guided) {
    const g = phases.guided;
    const interactionType = g.interactionType || 'NUMBER';
    if (!VALID_INTERACTION_TYPES.has(interactionType)) warnings.push('phases.guided.interactionType 未知: "' + interactionType + '"');

    if (interactionType === 'WHAT_IF_ENTRY') {
      if (!g.hintText && !g.failHint) warnings.push('phases.guided.hintText 为空');
    } else if (g.targetCell) {
      const [r, c] = g.targetCell;
      if (r < 0 || r >= size || c < 0 || c >= size) errors.push('phases.guided.targetCell (' + r + ',' + c + ') 超出范围');
      if (interactionType === 'NUMBER') {
        if (g.correctValue === undefined || g.correctValue === null) warnings.push('phases.guided.correctValue 为 null，可能是迁移数据问题');
        else if (solution && solution[r] && solution[r][c] !== undefined) {
          if (g.correctValue !== solution[r][c]) warnings.push('phases.guided.correctValue (' + g.correctValue + ') !== solution[' + r + '][' + c + '] (' + solution[r][c] + ')');
        }
      }
      if (interactionType === 'NOTE_ONLY') {
        if (!Array.isArray(g.expectedNote) || g.expectedNote.length === 0) errors.push('phases.guided.expectedNote 无效（需要非空数组）');
      }
    } else {
      errors.push('phases.guided.targetCell 缺失');
    }
    if (!g.hintText) warnings.push('phases.guided.hintText 为空');
    if (!g.successText) warnings.push('phases.guided.successText 为空');
  }

  // semiAuto
  if (phases.semiAuto) {
    const s = phases.semiAuto;
    if (s.enabled) {
      if (!s.targetCount && s.targetCount !== 0) warnings.push('phases.semiAuto.targetCount 缺失');
      if (!s.hintText) warnings.push('phases.semiAuto.hintText 为空');
      if (s.interactionType) {
        if (!VALID_INTERACTION_TYPES.has(s.interactionType)) warnings.push('phases.semiAuto.interactionType 未知: "' + s.interactionType + '"');
      }
      if (s.watchCells) {
        if (!Array.isArray(s.watchCells)) errors.push('phases.semiAuto.watchCells 必须是数组');
        else {
          for (let i = 0; i < s.watchCells.length; i++) {
            const cell = s.watchCells[i];
            if (!Array.isArray(cell) || cell.length !== 2) errors.push('phases.semiAuto.watchCells[' + i + '] 格式错误');
            else {
              const [r, c] = cell;
              if (r < 0 || r >= size || c < 0 || c >= size) errors.push('phases.semiAuto.watchCells[' + i + '] (' + r + ',' + c + ') 超出范围');
            }
          }
        }
      }
    }
  }

  // free
  if (phases.free) {
    if (!phases.free.enabled) warnings.push('phases.free.enabled 为 false');
  } else {
    warnings.push('缺少 phases.free');
  }
}

function main() {
  console.log('============================================');
  console.log('  关卡数据校验脚本');
  console.log('============================================\n');

  if (!fs.existsSync(DATA_DIR)) {
    console.error('[ERROR] 数据目录不存在: ' + DATA_DIR);
    process.exit(1);
  }

  const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json')).sort();
  if (files.length === 0) { console.error('[ERROR] 数据目录中没有 JSON 文件'); process.exit(1); }
  console.log('找到 ' + files.length + ' 个关卡文件\n');

  const results = [];
  let totalErrors = 0;
  let totalWarnings = 0;

  for (const file of files) {
    const filePath = path.join(DATA_DIR, file);
    const result = validateLevel(filePath);
    results.push(result);
    totalErrors += result.errors.length;
    totalWarnings += result.warnings.length;
    const status = result.errors.length === 0 ? (result.warnings.length === 0 ? '✅ 通过' : '⚠️  通过(有警告)') : '❌ 失败';
    console.log('  [' + status + '] ' + file + ' (' + result.levelId + ')');
    for (const err of result.errors) console.log('        错误: ' + err);
    for (const warn of result.warnings) console.log('        警告: ' + warn);
  }

  const passed = results.filter(r => r.errors.length === 0).length;
  const failed = results.filter(r => r.errors.length > 0).length;

  console.log('\n============================================');
  console.log('  校验完成');
  console.log('  总计: ' + files.length + ' 关');
  console.log('  通过: ' + passed + ' 关');
  console.log('  失败: ' + failed + ' 关');
  console.log('  错误: ' + totalErrors + ' 个');
  console.log('  警告: ' + totalWarnings + ' 个');
  console.log('============================================');

  const reportPath = path.join(__dirname, '..', 'reports', 'validation-report.json');
  const reportDir = path.dirname(reportPath);
  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    total: files.length, passed, failed, totalErrors, totalWarnings,
    results: results.map(r => ({ levelId: r.levelId, passed: r.errors.length === 0, errorCount: r.errors.length, warningCount: r.warnings.length, errors: r.errors, warnings: r.warnings })),
  }, null, 2), 'utf8');
  console.log('\n详细报告: ' + reportPath);
  if (failed > 0) process.exit(1);
}

main();
