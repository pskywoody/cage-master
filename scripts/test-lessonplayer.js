// ==========================================
// LessonPlayer 综合测试脚本
// 验证五段式教学流程：intro → demo → guided → noteToFill → semiAuto → free
// 使用 async/await 处理 setTimeout 延迟
// ==========================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data', 'levels');

// 加载 HeadlessEngine（使用 pathToFileURL 确保 Windows 路径正确）
const enginePath = pathToFileURL(path.join(__dirname, '..', 'core', 'headless-engine.js')).href;
const { HeadlessEngine } = await import(enginePath);

// 加载 LessonPlayer
const lpPath = pathToFileURL(path.join(__dirname, '..', 'core', 'lesson-player.js')).href;
const { LessonPlayer } = await import(lpPath);

// ==========================================
// 工具：延迟 promise
// ==========================================
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ==========================================
// 测试配置
// ==========================================
const LEVELS_TO_TEST = [101, 102, 103, 104, 301, 302, 303, 304, 305, 306, 307];
const DELAY_MS = 100; // 动作间延迟（用于调试，0=最快）
const TIMEOUT_MS = 10000; // 每个关卡超时

// ==========================================
// 测试结果统计
// ==========================================
const results = { passed: 0, failed: 0, details: [] };

// ==========================================
// 测试单个关卡
// ==========================================
async function testLevel(levelId) {
  const log = [];
  const logData = (msg) => {
    log.push(msg);
    console.log(`  [${levelId}] ${msg}`);
  };

  try {
    // 1. 加载关卡数据
    const levelPath = path.join(DATA_DIR, `level-${levelId}.json`);
    if (!fs.existsSync(levelPath)) {
      logData(`SKIP: 关卡文件不存在`);
      return { status: 'skip', log };
    }
    const levelData = JSON.parse(fs.readFileSync(levelPath, 'utf8'));

    if (!levelData.lessonPlan && !levelData.lesson) {
      logData(`SKIP: 无教学数据`);
      return { status: 'skip', log };
    }

    // 2. 创建 HeadlessEngine
    const engine = new HeadlessEngine(levelData.gridSize || 9);
    engine.loadLevel(levelData);

    // 3. 记录阶段变化
    const phaseHistory = [];
    const bubbleHistory = [];
    const actionHistory = [];
    let lastPhase = 'idle';
    let completed = false;
    let skipped = false;

    const callbacks = {
      onPhaseChange: (phase, prev) => {
        phaseHistory.push({ phase, prev });
        lastPhase = phase;
        logData(`阶段变化: ${prev} → ${phase}`);
      },
      onBubble: (text, speaker, voiceId) => {
        bubbleHistory.push({ text, speaker, voiceId });
        logData(`气泡[${speaker || '??'}]: ${text?.substring(0, 30)}...`);
      },
      onAction: (action) => {
        actionHistory.push(action);
        if (action.type === 'highlightCell') {
          logData(`  动作: 高亮格 (${action.r},${action.c})`);
        } else if (action.type === 'freeze') {
          logData(`  动作: 冻结 ${action.enabled}`);
        }
      },
      onNeedInput: (type, info) => {
        logData(`等待输入: ${type}`);
      },
      onInputResult: (result, info) => {
        logData(`输入结果: ${result}`);
      },
      onComplete: () => {
        completed = true;
        logData(`教学完成！`);
      },
      onSkip: () => {
        skipped = true;
        logData(`教学跳过`);
      },
      onError: (phase, err) => {
        logData(`错误[${phase}]: ${err.message}`);
      },
    };

    // 4. 创建 LessonPlayer（delay=0 使动作尽快执行）
    const lp = new LessonPlayer({
      engine,
      levelData,
      delay: 0,
      callbacks,
    });

    // 5. 启动教学
    const started = lp.start();
    if (!started) {
      logData(`SKIP: 教学未启动（无有效 lessonPlan）`);
      return { status: 'skip', log };
    }

    logData(`教学启动，初始阶段: ${lp.currentPhase}`);

    // 6. 等待 intro 阶段（气泡显示等待玩家点击）
    await wait(DELAY_MS);
    logData(`当前阶段: ${lp.currentPhase}`);

    // 7. intro 阶段 → 点击 advance 进入 demo
    if (lp.currentPhase === 'intro') {
      logData(`advance() 跳过 intro → demo`);
      lp.advance();
      await wait(DELAY_MS);
    }

    // 8. demo 阶段 → 逐步骤跳过
    if (lp.currentPhase === 'demo') {
      logData(`进入 demo 阶段，开始逐步骤前进`);
      // 等待 demo 步骤开始
      await wait(DELAY_MS * 2);
      
      // 反复调用 advance() 直到离开 demo 阶段
      let maxDemoSteps = 20;
      while (lp.currentPhase === 'demo' && maxDemoSteps > 0) {
        logData(`调用 advance() 推进 demo 步骤`);
        lp.advance();
        await wait(DELAY_MS);
        maxDemoSteps--;
      }
      
      if (lp.currentPhase === 'demo') {
        logData(`WARN: demo 步骤未在 ${20} 次内完成`);
      }
    }

    // 9. guided 阶段 → 填入正确值
    if (lp.currentPhase === 'guided') {
      logData(`进入 guided 阶段`);
      await wait(DELAY_MS);

      // 跳过 methodText 方法讲解（如配置），进入等待填数状态
      let explainGuard = 0;
      while (lp._guidedExplaining && explainGuard++ < 6) {
        lp.advance();
        await wait(DELAY_MS);
      }

      const guided = levelData.lessonPlan?.phases?.guided || levelData.lesson?.phases?.guided;
      if (!guided) {
        logData(`ERROR: guided 阶段但无 guided 配置`);
        return { status: 'fail', log, phase: lastPhase };
      }

      const [tr, tc] = guided.targetCell;
      const correctValue = guided.correctValue;
      const interactionType = guided.interactionType || 'NUMBER';

      logData(`目标格: (${tr},${tc}), 正确值: ${correctValue}, 交互类型: ${interactionType}`);

      if (interactionType === 'NOTE_ONLY') {
        // NOTE_ONLY 模式：先在引擎中填入笔记，再通知 LessonPlayer
        const expectedNote = guided.expectedNote || [];
        for (const n of expectedNote) {
          logData(`引擎切换笔记: (${tr},${tc}) 候选数 ${n}`);
          engine.toggleNote(tr, tc, n);
          logData(`通知 LessonPlayer: handleNoteToggle(${tr},${tc},${n},true)`);
          const noteResult = lp.handleNoteToggle(tr, tc, n, true);
          logData(`笔记结果: handled=${noteResult.handled}, correct=${noteResult.correct}`);
          await wait(DELAY_MS);
        }
        // 笔记写完后等待 transition
        await wait(DELAY_MS * 5);
      } else if (interactionType === 'WHAT_IF_ENTRY') {
        // WHAT_IF_ENTRY 模式
        logData(`调用 handleWhatIfEnter()`);
        const result = lp.handleWhatIfEnter();
        logData(`WhatIf 结果: handled=${result.handled}, correct=${result.correct}`);
        await wait(DELAY_MS * 5);
      } else {
        // NUMBER 模式：直接填数（跟随 successNext 链，填完所有引导格后进入下一阶段）
        let chainGuard = 0;
        let targetInfo = lp.getGuidedTarget();
        while (targetInfo && lp.currentPhase === 'guided' && lp.isWaitingInput && chainGuard++ < 12) {
          const [tr, tc] = targetInfo.cell;
          const correctValue = targetInfo.value;
          logData(`填数: (${tr},${tc}) = ${correctValue}`);
          const fillResult = lp.handleCellFill(tr, tc, correctValue);
          logData(`填数结果: handled=${fillResult.handled}, correct=${fillResult.correct}, continueNext=${!!fillResult.continueNext}`);
          await wait(DELAY_MS * 3);
          targetInfo = lp.getGuidedTarget();
        }
      }

      logData(`填数后阶段: ${lp.currentPhase}`);
    }

    // 10. noteToFill 阶段（如果有）
    if (lp.currentPhase === 'noteToFill') {
      logData(`进入 noteToFill 阶段`);
      await wait(DELAY_MS);

      const noteToFill = levelData.lessonPlan?.phases?.noteToFill || levelData.lesson?.phases?.noteToFill;
      const guided = levelData.lessonPlan?.phases?.guided || levelData.lesson?.phases?.guided;
      const ntf = noteToFill || guided;
      const [tr, tc] = ntf.targetCell;
      const expectedNote = ntf.expectedNote || [];

      logData(`noteToFill 目标格: (${tr},${tc}), 预期笔记: [${expectedNote.join(',')}]`);

      // 填写笔记
      for (const n of expectedNote) {
        logData(`引擎切换笔记: (${tr},${tc}) 候选数 ${n}`);
        engine.toggleNote(tr, tc, n);
        logData(`通知 LessonPlayer: handleNoteToggle(${tr},${tc},${n},true)`);
        const noteResult = lp.handleNoteToggle(tr, tc, n, true);
        logData(`笔记结果: handled=${noteResult.handled}, noteComplete=${noteResult.noteComplete}`);
        await wait(DELAY_MS);
      }

      // 等待 transition
      await wait(DELAY_MS * 5);
      logData(`noteToFill 后阶段: ${lp.currentPhase}`);
    }

    // 11. semiAuto 阶段（如果有）
    if (lp.currentPhase === 'semiAuto') {
      logData(`进入 semiAuto 阶段`);
      const semiAuto = levelData.lessonPlan?.phases?.semiAuto || levelData.lesson?.phases?.semiAuto;
      const targetCount = semiAuto?.targetCount || 3;
      const solution = levelData.solution;
      const watchCells = semiAuto?.watchCells || [];
      const semiAutoInteractionType = semiAuto?.interactionType || 'NUMBER';
      const isWhatIfFill = semiAutoInteractionType === 'WHAT_IF_FILL';

      logData(`semiAuto 目标: 正确填入 ${targetCount} 个数字, 交互类型: ${semiAutoInteractionType}`);

      // 找出 watchCells 中需要填的空格，按 solution 填入
      let filled = 0;
      for (const [wr, wc] of watchCells) {
        if (filled >= targetCount) break;
        const cell = engine.getState().cells[wr][wc];
        if (cell && !cell.fixedNum && !cell.fillNum && solution) {
          const correctNum = solution[wr][wc];
          logData(`semiAuto 填数: (${wr},${wc}) = ${correctNum}`);
          const fillResult = isWhatIfFill
            ? lp.handleWhatIfCellFill(wr, wc, correctNum)
            : lp.handleCellFill(wr, wc, correctNum);
          logData(`填数结果: handled=${fillResult.handled}, correct=${fillResult.correct}, filled=${fillResult.filled}`);
          if (fillResult.correct) filled++;
          await wait(DELAY_MS);
        }
      }

      // 等待 transition
      await wait(DELAY_MS * 5);
      logData(`semiAuto 后阶段: ${lp.currentPhase}`);

      // 如果还没填够，继续找空格填
      if (lp.currentPhase === 'semiAuto' && solution) {
        logData(`继续在可填格中找数...`);
        const state = engine.getState();
        for (let r = 0; r < state.cells.length && lp.currentPhase === 'semiAuto'; r++) {
          for (let c = 0; c < state.cells[r].length && lp.currentPhase === 'semiAuto'; c++) {
            const cell = state.cells[r][c];
            if (cell && !cell.fixedNum && !cell.fillNum && solution) {
              const correctNum = solution[r][c];
              logData(`额外填数: (${r},${c}) = ${correctNum}`);
              const fillResult = isWhatIfFill
                ? lp.handleWhatIfCellFill(r, c, correctNum)
                : lp.handleCellFill(r, c, correctNum);
              logData(`填数结果: handled=${fillResult.handled}, correct=${fillResult.correct}`);
              await wait(DELAY_MS);
              if (fillResult.filled >= targetCount) break;
            }
          }
        }
        await wait(DELAY_MS * 5);
        logData(`额外填数后阶段: ${lp.currentPhase}`);
      }
    }

    // 12. 判断结果
    const finalPhase = lp.currentPhase;
    await wait(DELAY_MS * 3); // 等待任何待处理的 setTimeout

    let status = 'fail';
    if (finalPhase === 'free' || finalPhase === 'done' || completed) {
      status = 'pass';
    } else if (finalPhase === 'semiAuto') {
      logData(`WARN: 停留在 semiAuto 阶段（可能未达到 targetCount）`);
      status = 'partial';
    } else if (finalPhase === 'guided' || finalPhase === 'noteToFill') {
      logData(`WARN: 停留在 ${finalPhase} 阶段`);
      status = 'partial';
    } else if (finalPhase === 'demo') {
      logData(`WARN: 停留在 demo 阶段`);
      status = 'partial';
    }

    logData(`=== 最终阶段: ${finalPhase}, 状态: ${status} ===`);
    logData(`阶段路径: ${phaseHistory.map(p => p.phase).join(' → ')}`);

    return { status, log, phase: finalPhase, phaseHistory: phaseHistory.map(p => p.phase) };
  } catch (err) {
    logData(`异常: ${err.message}`);
    console.error(err);
    return { status: 'error', log, error: err.message };
  }
}

// ==========================================
// 主测试流程
// ==========================================
async function main() {
  console.log('============================================');
  console.log('LessonPlayer 综合测试');
  console.log('============================================');
  console.log('');

  for (const levelId of LEVELS_TO_TEST) {
    console.log(`\n--- 测试关卡 ${levelId} ---`);
    console.time(`  [${levelId}] 耗时`);
    
    const result = await testLevel(levelId);
    
    console.timeEnd(`  [${levelId}] 耗时`);

    results.details.push({ levelId, ...result });
    if (result.status === 'pass') {
      results.passed++;
    } else {
      results.failed++;
    }

    console.log(`  => 结果: ${result.status === 'pass' ? '✅ 通过' : result.status === 'skip' ? '⏭️ 跳过' : '❌ 失败'} (phase=${result.phase})`);
  }

  // 汇总
  console.log('\n============================================');
  console.log('测试汇总');
  console.log('============================================');
  console.log(`总计: ${results.details.length}`);
  console.log(`通过: ${results.passed}`);
  console.log(`失败: ${results.failed}`);

  if (results.failed > 0) {
    console.log('\n失败详情:');
    for (const d of results.details) {
      if (d.status !== 'pass') {
        console.log(`  [${d.levelId}] ${d.status} phase=${d.phase}`);
        // 打印最后 5 条日志
        const lastLogs = d.log.slice(-5);
        for (const l of lastLogs) {
          console.log(`    ${l}`);
        }
      }
    }
  }

  // 退出码
  process.exit(results.failed > 0 ? 1 : 0);
}

main();