// ==========================================
// AI Tester - 自动化关卡测试工具
// ==========================================
// 支持两种模式：
//   Solver 模式：逐格填入解答，验证关卡可解
//   LLM 模式：占位，后续接入 DeepSeek API
//
// 使用方式：
//   node scripts/ai-tester.js --mode solver --levels all

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ==========================================
// DeepSeek API 客户端
// ==========================================

const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1';

/**
 * 读取 DeepSeek API 密钥
 * 优先级：环境变量 DEEPSEEK_API_KEY > config.json > 提示用户输入
 */
function getApiKey() {
  if (process.env.DEEPSEEK_API_KEY) {
    return process.env.DEEPSEEK_API_KEY;
  }
  try {
    const configPath = path.join(__dirname, '..', 'config.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (config.deepseekApiKey) {
        return config.deepseekApiKey;
      }
    }
  } catch (e) {
    // ignore
  }
  return null;
}

/**
 * 调用 DeepSeek Chat API
 * @param {Array} messages - 对话消息数组 [{role, content}]
 * @param {Object} opts - 调用选项 {temperature, maxTokens}
 * @returns {Promise<string>} 模型回复内容
 */
async function callDeepSeekAPI(messages, opts = {}) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error(
      'DeepSeek API key not found. Please set DEEPSEEK_API_KEY environment variable ' +
      'or create config.json in the project root with: { "deepseekApiKey": "your-key" }'
    );
  }

  const response = await fetch(DEEPSEEK_BASE_URL + '/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: messages,
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.maxTokens ?? 500,
      stream: false,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`DeepSeek API error: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content.trim();
}

// ==========================================
// 人格 System Prompt 模板
// ==========================================

const PERSONALITY_PROMPTS = {
  novice: {
    system: '你是一个从未接触过数独的零基础玩家，正在学习新手教程。\n' +
      '你每一步都严格遵循教学引导，听不懂时会尝试 1-2 次再放弃。\n' +
      '你只能看懂教学气泡里明确指示的内容，不会主动推理高级技巧。\n' +
      '\n' +
      '可用的动作：fillCell, toggleNote, advancePhase, wait, skipLesson, getHint\n' +
      '输出格式：{"action": "...", "params": {...}, "reasoning": "..."}',
    temperature: 0.3,
    maxTokens: 400,
  },
  impatient: {
    system: '你是一个经验丰富的数独玩家，只想快速通关。\n' +
      '教学对你来说只是干扰，你希望尽快跳过所有教学进入自由模式。\n' +
      '\n' +
      '可用的动作：fillCell, toggleNote, advancePhase, skipLesson, getHint, wait\n' +
      '输出格式：{"action": "...", "params": {...}, "reasoning": "..."}',
    temperature: 0.5,
    maxTokens: 400,
  },
  expert: {
    system: '你是一个数独高手，精通所有推理技巧。\n' +
      '你不需要任何教学引导，能通过纯逻辑推理完成任何数独关卡。\n' +
      '\n' +
      '可用的动作：fillCell, toggleNote, advancePhase, skipLesson, wait\n' +
      '输出格式：{"action": "...", "params": {...}, "reasoning": "..."}\n' +
      '约束：不要直接读取 solution 字段——用逻辑推理决定填什么。',
    temperature: 0.2,
    maxTokens: 400,
  },
};


// ==========================================
// 笼组合计算
// ==========================================

/**
 * 计算笼的和值所有可能的数字组合
 * @param {number} sum 笼和
 * @param {number} cellCount 笼的格子数
 * @param {number} maxValue 棋盘最大数字（4/6/9）
 * @returns {number[][]} 可能的数字组合数组
 */
function getCageCombinations(sum, cellCount, maxValue) {
  const results = [];
  function backtrack(remaining, start, current) {
    if (current.length === cellCount) {
      if (remaining === 0) results.push([...current]);
      return;
    }
    for (let n = start; n <= Math.min(maxValue, remaining); n++) {
      current.push(n);
      backtrack(remaining - n, n + 1, current);
      current.pop();
    }
  }
  backtrack(sum, 1, []);
  return results;
}

/**
 * 格式化笼组合为可读字符串
 * @param {number} sum 笼和
 * @param {number} cellCount 格子数
 * @param {number} maxValue 棋盘最大数字
 * @returns {string} 如 "1+2 或 1+3" 或 "1+2+3+4"
 */
function formatCageCombo(sum, cellCount, maxValue) {
  const combos = getCageCombinations(sum, cellCount, maxValue);
  if (combos.length === 0) return '无有效组合';
  return combos.map(c => c.join('+')).join(' 或 ');
}

// ==========================================
// 棋盘状态序列化
// ==========================================

/**
 * 将 HeadlessEngine 状态序列化为可读的文本描述
 * @param {Object} state - engine.getState()
 * @returns {string} 描述文本
 */
function serializeBoardState(state) {
  const { cells, validation, lesson, levelId } = state;

  // 构建棋盘 ASCII 图
  const size = cells.length;
  const boardLines = ['当前棋盘：'];
  boardLines.push('    ' + Array.from({ length: size }, (_, i) => String(i).padStart(2, ' ')).join(' '));
  for (let r = 0; r < size; r++) {
    const row = cells[r].map(c => {
      if (c.fixedNum) return String(c.fixedNum).padStart(2, ' ');
      if (c.fillNum) return (c.isError ? '!' : ' ') + String(c.fillNum);
      if (c.candidates.length > 0) return '[' + c.candidates.length + ']';
      return ' .';
    }).join(' ');
    boardLines.push(String(r).padStart(2, ' ') + ' ' + row);
  }

  const lines = [
    '关卡 ID: ' + (levelId || 'unknown'),
    '棋盘尺寸: ' + size + 'x' + size,
    '',
    ...boardLines,
    '',
    '验证信息:',
    '  已填: ' + validation.filledCount,
    '  空格: ' + validation.emptyCount,
    '  错误: ' + validation.errorCount,
    '  是否完成: ' + validation.isComplete,
  ];

  // 添加笼子/约束信息（如果有）
  const levelData = globalThis._lastLevelData;
  if (levelData && levelData.cages && levelData.cages.length > 0) {
        const cageInfo = levelData.cages.map(c => {
      const combo = (c.cells && Array.isArray(c.cells))
        ? formatCageCombo(c.sum, c.cells.length, size)
        : '';
      return '  笼 ' + (c.id ?? '?') + ' 和=' + c.sum + ' 格子:' + JSON.stringify(c.cells) + (combo ? ' 可选组合: ' + combo : '');
    });
    lines.push('', '笼子约束:', ...cageInfo);
  }

  if (lesson) {
    lines.push('', '教学阶段: ' + (lesson.currentPhase || 'unknown'));
    if (lesson.currentPhase === 3 && lesson.guidedTarget) {
      lines.push('  引导目标: (' + lesson.guidedTarget.join(',') + ')');
    }
    if (lesson.hintText && lesson.currentPhase === 3) {
      lines.push('  教学提示: ' + lesson.hintText);
    }
  }

  return lines.join('\n');
}

/**
 * 解析 LLM 返回的动作 JSON
 * @param {string} llmResponse - LLM 的原始回复
 * @returns {Object|null} 解析后的动作对象 {action, params, reasoning}
 */
function parseLLMAction(llmResponse) {
  // 方法1：尝试直接解析完整 JSON
  try {
    const parsed = JSON.parse(llmResponse);
    if (parsed.action && parsed.params) {
      return parsed;
    }
  } catch (e) {
    // fall through
  }
  // 方法2：用大括号匹配提取 JSON 对象（最可靠）
  // 在 LLM 回复中找 {"action" 开头的对象，然后数大括号找匹配的 }
  const actionIdx = llmResponse.indexOf('{"action"');
  if (actionIdx !== -1) {
    let depth = 0;
    let startIdx = -1;
    for (let i = actionIdx; i < llmResponse.length; i++) {
      const ch = llmResponse[i];
      if (ch === '{') {
        if (depth === 0) startIdx = i;
        depth++;
      } else if (ch === '}') {
        depth--;
        if (depth === 0 && startIdx !== -1) {
          try {
            const parsed = JSON.parse(llmResponse.substring(startIdx, i + 1));
            if (parsed.action && parsed.params) {
              return parsed;
            }
          } catch (e) {
            // 尝试找下一个匹配
            startIdx = -1;
          }
        }
      }
    }
  }
  // 方法3：宽泛正则回退
  try {
    const jsonMatch = llmResponse.match(/{[\s\S]*"action"[\s\S]*}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.action && parsed.params) {
          return parsed;
        }
      } catch (e2) {
        // ignore
      }
    }
  } catch (e) {
    // fall through
  }
  return null;
}

/**
 * 执行 LLM 决策的动作
 * @param {HeadlessEngine} engine - 游戏引擎
 * @param {Object} action - 动作对象 {action, params}
 * @returns {Object} {success, error, newState}
 */
function executeLLMAction(engine, action) {
  const { action: actionName, params } = action;

  switch (actionName) {
    case 'fillCell': {
      // 兼容多种参数命名：row/r, col/c, value/num
      const r = params.r ?? params.row;
      const c = params.c ?? params.col;
      const num = params.num ?? params.value;
      if (r === undefined || c === undefined || num === undefined) {
        return { success: false, error: 'fillCell requires r/c/row/col + num/value params' };
      }
      return engine.fillCell(r, c, num);
    }

    case 'toggleNote': {
      const r = params.r ?? params.row;
      const c = params.c ?? params.col;
      const num = params.num ?? params.value;
      if (r === undefined || c === undefined || num === undefined) {
        return { success: false, error: 'toggleNote requires r/c/row/col + num/value params' };
      }
      return engine.toggleNote(r, c, num);
    }

    case 'advancePhase': {
      // advancePhase 仅用于教学系统，HeadlessEngine 内部不处理
      // 这里只是标记，实际逻辑在测试循环中处理
      return { success: true, error: null, phaseAdvanced: true };
    }

    case 'skipLesson': {
      // skipLesson 同样由测试循环处理
      return { success: true, error: null, lessonSkipped: true };
    }

    case 'getHint': {
      // 提示功能由引擎内部处理，暂不实现
      return { success: true, error: null, hintRequested: true };
    }

    case 'wait': {
      // 什么都不做
      return { success: true, error: null, waited: true };
    }

    default:
      return { success: false, error: 'Unknown action: ' + actionName };
  }
}

// ---------------------------------------------------------------------------
// 1. 加载 HeadlessEngine（同时会加载 board.js）
// ---------------------------------------------------------------------------
import { HeadlessEngine } from '../core/headless-engine.js';

// ---------------------------------------------------------------------------
// 2. CLI 参数解析
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    mode: 'solver',          // solver | llm
    personality: 'novice',   // novice | impatient | expert
    levels: 'all',           // all | 101-109 | 301-307 | 101,201,301
    output: './reports/report.json',
    timeout: 120000,         // 每个关卡超时（毫秒）
    maxSteps: 1000,          // 每个关卡最大步数
    thinkTime: 0,            // 每一步之间的等待时间（毫秒）
    html: false,             // 是否生成 HTML 报告
    stopOnFail: false,       // 首个失败即停止
    dataDir: './data/levels',// 关卡数据目录
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--mode':
        opts.mode = args[++i] || 'solver';
        break;
      case '--personality':
        opts.personality = args[++i] || 'novice';
        break;
      case '--levels':
        opts.levels = args[++i] || 'all';
        break;
      case '--output':
        opts.output = args[++i] || './reports/report.json';
        break;
      case '--timeout':
        opts.timeout = parseInt(args[++i], 10) || 300000;
        break;
      case '--max-steps':
        opts.maxSteps = parseInt(args[++i], 10) || 1000;
        break;
      case '--think-time':
        opts.thinkTime = parseInt(args[++i], 10) || 0;
        break;
      case '--html':
        opts.html = true;
        break;
      case '--stop-on-fail':
        opts.stopOnFail = true;
        break;
      case '--data-dir':
        opts.dataDir = args[++i] || './data/levels';
        break;
      default:
        if (args[i].startsWith('--')) {
          console.warn(`[WARN] Unknown option: ${args[i]}`);
        }
        break;
    }
  }

  return opts;
}

// ---------------------------------------------------------------------------
// 3. 关卡发现
// ---------------------------------------------------------------------------

/**
 * 根据 --levels 参数解析需要测试的关卡 ID 列表
 * @param {string} levelsSpec 关卡规格
 * @param {string} dataDir 数据目录
 * @returns {string[]} 关卡 ID 数组
 */
function resolveLevelIds(levelsSpec, dataDir) {
  if (levelsSpec === 'all') {
    // 扫描数据目录下的所有 JSON 文件
    try {
      const files = fs.readdirSync(dataDir);
      const ids = files
        .filter(f => f.endsWith('.json'))
        .map(f => path.basename(f, '.json'))
        .sort();
      return ids;
    } catch (e) {
      console.warn(`[WARN] Cannot scan data dir "${dataDir}": ${e.message}`);
      return [];
    }
  }

  // 逗号分隔的 ID 列表
  if (levelsSpec.includes(',')) {
    return levelsSpec.split(',').map(s => s.trim()).filter(Boolean);
  }

  // 范围格式：101-109
  if (levelsSpec.includes('-')) {
    const [start, end] = levelsSpec.split('-').map(s => parseInt(s.trim(), 10));
    if (isNaN(start) || isNaN(end)) {
      console.error(`[ERROR] Invalid range: ${levelsSpec}`);
      process.exit(1);
    }
    const ids = [];
    for (let id = start; id <= end; id++) {
      ids.push(String(id));
    }
    return ids;
  }

  // 单个 ID
  return [levelsSpec];
}

/**
 * 加载单个关卡数据
 * @param {string} levelId 关卡 ID
 * @param {string} dataDir 数据目录
 * @returns {Object|null} 关卡数据对象，失败返回 null
 */
function loadLevelData(levelId, dataDir) {
  const possiblePaths = [
    path.join(dataDir, `${levelId}.json`),
    path.join(dataDir, `level-${levelId}.json`),
    path.join(dataDir, `level_${levelId}.json`),
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      try {
        const raw = fs.readFileSync(p, 'utf8');
        return JSON.parse(raw);
      } catch (e) {
        console.error(`[ERROR] Failed to parse ${p}: ${e.message}`);
        return null;
      }
    }
  }

  console.error(`[ERROR] Level data not found for ID "${levelId}"`);
  return null;
}

// ---------------------------------------------------------------------------
// 4. Solver 模式
// ---------------------------------------------------------------------------

/**
 * Solver 模式：顺序按解答填数
 * @param {Object} levelData 关卡数据
 * @param {Object} opts 运行选项
 * @returns {Object} 测试结果
 */
function runSolverMode(levelData, opts) {
  const engine = new HeadlessEngine();
  engine.loadLevel(levelData);

  const solution = levelData.solution;
  if (!solution || !Array.isArray(solution)) {
    return {
      levelId: levelData.levelId || 'unknown',
      status: 'error',
      error: 'No solution array in level data',
      steps: 0,
      duration: 0,
    };
  }

  const boardData = levelData.boardData || levelData.cells;
  const emptyCells = [];

  // 收集所有需要填的空格
  for (let r = 0; r < solution.length; r++) {
    for (let c = 0; c < solution[r].length; c++) {
      if (boardData[r][c] === 0) {
        emptyCells.push({ r, c, expected: solution[r][c] });
      }
    }
  }

  console.log(`  [INFO] ${emptyCells.length} empty cells to fill`);

  let steps = 0;
  let passed = 0;
  let failed = 0;
  const errors = [];
  const startTime = Date.now();

  for (const cell of emptyCells) {
    // 超时检查
    if (Date.now() - startTime > opts.timeout) {
      return {
        levelId: levelData.levelId || 'unknown',
        status: 'timeout',
        steps,
        passed,
        failed,
        errors,
        duration: Date.now() - startTime,
        message: `Timeout after ${opts.timeout}ms`,
      };
    }

    // 步数限制
    if (steps >= opts.maxSteps) {
      return {
        levelId: levelData.levelId || 'unknown',
        status: 'max-steps',
        steps,
        passed,
        failed,
        errors,
        duration: Date.now() - startTime,
        message: `Reached max steps (${opts.maxSteps})`,
      };
    }

    const { r, c, expected } = cell;
    const result = engine.fillCell(r, c, expected);
    steps++;

    if (result.success) {
      passed++;
    } else {
      failed++;
      errors.push({
        r,
        c,
        expected,
        error: result.error,
      });

      // 如果 stopOnFail 则立即停止
      if (opts.stopOnFail) {
        break;
      }
    }

    // think-time 模拟思考延迟
    if (opts.thinkTime > 0) {
      const waitUntil = Date.now() + opts.thinkTime;
      while (Date.now() < waitUntil) {
        // busy-wait（在无异步的测试中可接受）
      }
    }
  }

  const duration = Date.now() - startTime;

  // 验证最终状态
  const state = engine.getState();
  const isComplete = state.validation.isComplete;
  const hasErrors = state.validation.hasErrors;

  let status = 'passed';
  if (failed > 0) status = 'failed';
  if (!isComplete) status = 'incomplete';
  if (hasErrors && failed === 0) status = 'completed-with-errors';

  return {
    levelId: levelData.levelId || 'unknown',
    status,
    steps,
    passed,
    failed,
    totalCells: emptyCells.length,
    errors,
    duration,
    validation: state.validation,
    message: status === 'passed'
      ? `All ${passed} cells filled successfully`
      : `${failed} failures out of ${steps} steps`,
  };
}

// ---------------------------------------------------------------------------
// 5. LLM 模式（占位）
// ---------------------------------------------------------------------------

/**
 * LLM 模式占位实现
 * @param {Object} levelData 关卡数据
 * @param {Object} opts 运行选项
 * @returns {Object} 测试结果
 */
/**
 * 运行 LLM 模式测试
 * @param {Object} levelData - 关卡数据
 * @param {Object} opts - 运行选项
 * @returns {Promise<Object>} 测试结果
 */
async function runLLMMode(levelData, opts) {
  const engine = new HeadlessEngine();
  engine.loadLevel(levelData);
  globalThis._lastLevelData = levelData;

  const personality = PERSONALITY_PROMPTS[opts.personality];
  if (!personality) {
    return {
      levelId: levelData.levelId || 'unknown',
      status: 'error',
      error: 'Unknown personality: ' + opts.personality,
      steps: 0,
      duration: 0,
    };
  }

  const startTime = Date.now();
  let steps = 0;
  let passed = 0;
  let failed = 0;
  const errors = [];
  let state = engine.getState();

  // 构建对话历史
  const messages = [
    { role: 'system', content: personality.system },
  ];

  // 自动跳过教学阶段，让 LLM 直接进入自由模式
  // 对于新手人格，教学提示作为上下文保留但不阻塞
  if (state.lesson && state.lesson.currentPhase && state.lesson.currentPhase < 5) {
    console.log('  [INFO] Auto-skipping teaching phases for LLM testing');
  }

  // 主循环
  while (!state.validation.isComplete && steps < opts.maxSteps) {
    // 超时检查
    if (Date.now() - startTime > opts.timeout) {
      return {
        levelId: levelData.levelId || 'unknown',
        status: 'timeout',
        steps,
        passed,
        failed,
        errors,
        duration: Date.now() - startTime,
        message: 'Timeout after ' + opts.timeout + 'ms',
      };
    }

    // 准备当前状态描述
    const boardDesc = serializeBoardState(state);
    // 简化用户消息：移除教学信息，让 LLM 直接填数
    const userMessage = boardDesc + '\n\n请输出一个填数动作。可选动作：fillCell, wait\n' +
      'fillCell 参数格式：{"row":行号, "col":列号, "num":填入的数字}\n' +

      '例如：{"action": "fillCell", "params": {"row":0, "col":1, "num":4}, "reasoning": "行0已有1和3，列1已有2，所以(0,1)只能填4"}';

    // 添加用户消息到对话历史
    messages.push({ role: 'user', content: userMessage });

    // 调用 DeepSeek API
    let llmResponse;
    try {
      llmResponse = await callDeepSeekAPI(messages, {
        temperature: personality.temperature,
        maxTokens: personality.maxTokens,
      });
    } catch (apiError) {
      return {
        levelId: levelData.levelId || 'unknown',
        status: 'api-error',
        steps,
        passed,
        failed,
        errors: [{ error: apiError.message }],
        duration: Date.now() - startTime,
        message: 'API call failed: ' + apiError.message,
      };
    }

    // 解析 LLM 回复
    const action = parseLLMAction(llmResponse);
    if (!action) {
      // 无法解析，记录并继续
      errors.push({ step: steps, error: 'Failed to parse LLM response: ' + llmResponse.substring(0, 200) });
      // 告诉模型格式不对
      messages.push({ role: 'assistant', content: llmResponse });
      messages.push({ role: 'user', content: '输出格式错误。请在回复中包含 JSON 格式的动作，例如：\\n{"action":"fillCell","params":{"row":0,"col":1,"num":4}}' });
      steps++;
      continue;
    }

    // 记录 LLM 的 reasoning
    if (action.reasoning) {
      messages.push({ role: 'assistant', content: llmResponse });
    }

    // 处理特殊动作
    if (action.action === 'advancePhase' || action.action === 'skipLesson' || action.action === 'wait' || action.action === 'getHint') {
      // 这些动作不会改变棋盘状态，告诉 LLM 直接填数
      messages.push({ role: 'user', content: '请直接填数。输出 fillCell 动作。' });
      steps++;
      continue;
    }

    // 执行动作
    const result = executeLLMAction(engine, action);
    steps++;

    if (result.success) {
      // 重复动作检测
      // 已通过非贪婪 JSON 解析和纯 JSON 输出提示解决，无需额外逻辑
      passed++;
    } else {
      failed++;
      errors.push({
        step: steps,
        action: action.action,
        params: action.params,
        error: result.error,
      });
      // 给 LLM 反馈填数失败的原因
      const p = action.params || {};
      const row = p.row ?? p.r;
      const col = p.col ?? p.c;
      const num = p.num ?? p.value;
      if (row !== undefined && col !== undefined && num !== undefined) {
        const cell = state.cells[row]?.[col];
        if (cell) {
          let reason = '';
          if (cell.fixedNum) reason = '格子(' + row + ',' + col + ')是固定数字' + cell.fixedNum + '，不能修改。';
          else if (cell.isLocked) reason = '格子(' + row + ',' + col + ')被锁定。';
          else reason = '(' + row + ',' + col + ')填' + num + '与同行/列/宫中的数字冲突。请试其他格子或数字。';
          messages.push({ role: 'user', content: '动作失败：' + reason });
        }
      }
    }

    // 更新状态
    state = engine.getState();

    // think-time 模拟思考延迟
    if (opts.thinkTime > 0) {
      const waitUntil = Date.now() + opts.thinkTime;
      while (Date.now() < waitUntil) {
        // busy-wait
      }
    }
  }

  const duration = Date.now() - startTime;

  // 判定结果
  let status = 'passed';
  if (state.validation.hasErrors && failed > 0) status = 'failed';
  if (!state.validation.isComplete && failed > 0) status = 'stuck';
  if (!state.validation.isComplete && failed === 0) status = 'incomplete';

  return {
    levelId: levelData.levelId || 'unknown',
    status,
    mode: 'llm',
    personality: opts.personality,
    steps,
    passed,
    failed,
    totalCells: state.validation.emptyCount + state.validation.filledCount,
    errors,
    duration,
    validation: state.validation,
    lastPhase: state.lesson ? state.lesson.currentPhase : null,
    message: status === 'passed'
      ? 'Completed in ' + steps + ' steps'
      : status === 'stuck'
        ? 'Stuck after ' + steps + ' steps (phase ' + (state.lesson ? state.lesson.currentPhase : '?') + ')'
        : failed + ' failures out of ' + steps + ' steps',
  };
}

// ---------------------------------------------------------------------------
// 6. 报告生成
// ---------------------------------------------------------------------------

/**
 * 生成 JSON 报告
 * @param {Object} results 所有关卡的测试结果
 * @param {Object} opts 运行选项
 * @returns {Object} 报告对象
 */
function buildReport(results, opts) {
  const total = results.length;
  const passed = results.filter(r => r.status === 'passed').length;
  const failed = results.filter(r => r.status === 'failed').length;
  const timeout = results.filter(r => r.status === 'timeout').length;
  const errors = results.filter(r => r.status === 'error').length;
  const other = total - passed - failed - timeout - errors;

  return {
    meta: {
      mode: opts.mode,
      personality: opts.personality,
      levelsSpec: opts.levels,
      timestamp: new Date().toISOString(),
      nodeVersion: process.version,
      platform: process.platform,
    },
    summary: {
      total,
      passed,
      failed,
      timeout,
      errors,
      other,
      passRate: total > 0 ? ((passed / total) * 100).toFixed(1) + '%' : 'N/A',
      totalDuration: results.reduce((sum, r) => sum + (r.duration || 0), 0),
    },
    results,
  };
}

/**
 * 生成简易 HTML 报告
 * @param {Object} report JSON 报告对象
 * @returns {string} HTML 内容
 */
function generateHtmlReport(report) {
  const { meta, summary, results } = report;

  const rows = results.map(r => {
    const statusClass = r.status === 'passed' ? 'pass' : r.status === 'failed' ? 'fail' : 'warn';
    return `<tr class="${statusClass}">
      <td>${r.levelId}</td>
      <td><span class="badge ${statusClass}">${r.status}</span></td>
      <td>${r.steps || 0}</td>
      <td>${r.passed || 0}</td>
      <td>${r.failed || 0}</td>
      <td>${(r.duration / 1000).toFixed(1)}s</td>
      <td>${r.message || ''}</td>
    </tr>`;
  }).join('\n');

  const errorDetails = results
    .filter(r => r.errors && r.errors.length > 0)
    .map(r => r.errors.map(e =>
      `<li>Level ${r.levelId}: Cell (${e.r},${e.c}) expected ${e.expected} - ${e.error}</li>`
    ).join('\n'))
    .join('\n');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>AI Tester Report - ${meta.mode}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #0f172a; color: #e2e8f0; }
  h1 { color: #f8fafc; border-bottom: 2px solid #334155; padding-bottom: 10px; }
  .summary { display: flex; gap: 20px; margin: 20px 0; flex-wrap: wrap; }
  .stat { background: #1e293b; border-radius: 8px; padding: 16px 24px; text-align: center; min-width: 100px; }
  .stat .num { font-size: 28px; font-weight: bold; }
  .stat .label { font-size: 12px; text-transform: uppercase; color: #94a3b8; }
  .stat.pass .num { color: #22c55e; }
  .stat.fail .num { color: #ef4444; }
  .stat.timeout .num { color: #f59e0b; }
  .stat.rate .num { color: #3b82f6; }
  table { width: 100%; border-collapse: collapse; margin: 20px 0; }
  th, td { padding: 10px 14px; text-align: left; border-bottom: 1px solid #334155; }
  th { background: #1e293b; color: #94a3b8; font-weight: 600; }
  .badge { display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; }
  .badge.pass { background: #22c55e33; color: #22c55e; }
  .badge.fail { background: #ef444433; color: #ef4444; }
  .badge.warn { background: #f59e0b33; color: #f59e0b; }
  tr.pass:hover { background: #22c55e11; }
  tr.fail:hover { background: #ef444411; }
  tr.warn:hover { background: #f59e0b11; }
  .meta { color: #94a3b8; font-size: 14px; margin-bottom: 20px; }
  .errors { background: #1e293b; border-radius: 8px; padding: 16px; margin-top: 20px; }
  .errors li { margin: 4px 0; }
</style>
</head>
<body>
<h1>AI Tester Report</h1>
<div class="meta">
  Mode: <strong>${meta.mode}</strong> |
  Personality: <strong>${meta.personality}</strong> |
  Levels: <strong>${meta.levelsSpec}</strong> |
  Time: ${meta.timestamp}
</div>
<div class="summary">
  <div class="stat"><div class="num">${summary.total}</div><div class="label">Total</div></div>
  <div class="stat pass"><div class="num">${summary.passed}</div><div class="label">Passed</div></div>
  <div class="stat fail"><div class="num">${summary.failed}</div><div class="label">Failed</div></div>
  <div class="stat timeout"><div class="num">${summary.timeout}</div><div class="label">Timeout</div></div>
  <div class="stat rate"><div class="num">${summary.passRate}</div><div class="label">Pass Rate</div></div>
</div>
<table>
  <thead><tr><th>Level</th><th>Status</th><th>Steps</th><th>Passed</th><th>Failed</th><th>Duration</th><th>Message</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
${errorDetails ? `<div class="errors"><h3>Error Details</h3><ul>${errorDetails}</ul></div>` : ''}
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// 7. 主流程
// ---------------------------------------------------------------------------

async function main() {
  const opts = parseArgs();

  console.log('='.repeat(60));
  console.log('  AI Tester for CageMaster4');
  console.log('='.repeat(60));
  console.log(`  Mode:        ${opts.mode}`);
  console.log(`  Personality: ${opts.personality}`);
  console.log(`  Levels:      ${opts.levels}`);
  console.log(`  Timeout:     ${opts.timeout}ms`);
  console.log(`  Max Steps:   ${opts.maxSteps}`);
  console.log(`  Data Dir:    ${opts.dataDir}`);
  console.log(`  Output:      ${opts.output}`);
  console.log(`  Stop on Fail: ${opts.stopOnFail}`);
  console.log('-'.repeat(60));

  // 确保输出目录存在
  const outputDir = path.dirname(path.resolve(opts.output));
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // 解析关卡列表
  const levelIds = resolveLevelIds(opts.levels, opts.dataDir);

  if (levelIds.length === 0) {
    console.error('[ERROR] No levels found to test.');
    process.exit(1);
  }

  console.log(`  Found ${levelIds.length} level(s) to test.\n`);

  // 逐个运行测试
  const results = [];

  for (const levelId of levelIds) {
    process.stdout.write(`  [${levelId}] Loading...`);

    const levelData = loadLevelData(levelId, opts.dataDir);
    if (!levelData) {
      process.stdout.write(' FAILED (not found)\n');
      results.push({
        levelId,
        status: 'error',
        error: 'Level data not found',
        steps: 0,
        duration: 0,
      });
      continue;
    }

    process.stdout.write(` running ${opts.mode} mode...\n`);

    let result;
    if (opts.mode === 'llm') {
      result = await runLLMMode(levelData, opts);
    } else {
      result = runSolverMode(levelData, opts);
    }

    results.push(result);

    // 输出单关卡结果摘要
    const statusIcon = result.status === 'passed' ? 'PASS' : result.status === 'failed' ? 'FAIL' : 'STUCK';
    console.log(`  [${levelId}] ${statusIcon} | steps=${result.steps} passed=${result.passed} failed=${result.failed} duration=${(result.duration / 1000).toFixed(1)}s`);

    if (result.errors && result.errors.length > 0 && result.errors.length <= 5) {
      for (const e of result.errors) {
        if (e.r !== undefined) {
          console.log(`    -> Cell (${e.r},${e.c}): expected ${e.expected}, error: ${e.error}`);
        } else {
          console.log(`    -> ${e.error}`);
        }
      }
    }

    // stop-on-fail
    if (opts.stopOnFail && result.status !== 'passed') {
      console.log(`\n[STOP] Stopping on first failure at level ${levelId}`);
      break;
    }
  }

  // 生成报告
  const report = buildReport(results, opts);
  const reportJson = JSON.stringify(report, null, 2);
  fs.writeFileSync(opts.output, reportJson, 'utf8');
  console.log(`\n[JSON Report] Written to ${opts.output}`);

  if (opts.html) {
    const htmlPath = opts.output.replace(/\.json$/, '.html');
    const htmlContent = generateHtmlReport(report);
    fs.writeFileSync(htmlPath, htmlContent, 'utf8');
    console.log(`[HTML Report] Written to ${htmlPath}`);
  }

  // 最终摘要
  console.log('\n' + '='.repeat(60));
  console.log('  FINAL SUMMARY');
  console.log('='.repeat(60));
  console.log(`  Total:     ${report.summary.total}`);
  console.log(`  Passed:    ${report.summary.passed}`);
  console.log(`  Failed:    ${report.summary.failed}`);
  console.log(`  Timeout:   ${report.summary.timeout}`);
  console.log(`  Errors:    ${report.summary.errors}`);
  console.log(`  Pass Rate: ${report.summary.passRate}`);
  console.log('='.repeat(60));

  // 退出码
  if (report.summary.failed > 0 || report.summary.errors > 0) {
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// 8. 启动
// ---------------------------------------------------------------------------

main().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});
