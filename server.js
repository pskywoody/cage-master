const express = require('express');
const path = require('path');
const fs = require('fs');
const { HumanSimulator } = require('./node-script/human-simulator.js');
const { KillerSudokuSolver, quickRateDifficulty } = require('./node-script/solver-rater.js');

const app = express();
const PORT = 3000;

// 中间件：解析JSON请求体
app.use(express.json());

// 1. 托管前端静态文件（禁止缓存，确保修改即时生效）
app.use(express.static(path.join(__dirname, 'game-src'), {
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html') || filePath.endsWith('.js') || filePath.endsWith('.css')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
    }
  }
}));

// 2. 读取题库数据（修正路径：题库实际位于 game-src/data/levels.json）
function loadLevels() {
  const filePath = path.join(__dirname, 'game-src', 'data', 'levels.json');
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw);
}

// 2.1 读取章节数据（教学模式）
function loadChapters() {
  const filePath = path.join(__dirname, 'game-src', 'data', 'chapters.json');
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw);
}

// 2.2 查找教学关卡
function findTeachingLevel(levelId) {
  const chapters = loadChapters();
  for (const chapter of chapters) {
    for (const level of chapter.levels) {
      if (String(level.levelId) === String(levelId)) {
        return { chapter, level };
      }
    }
  }
  return null;
}

// ==========================================
// 接口：获取所有关卡列表
// ==========================================
app.get('/api/levels', (req, res) => {
  const levels = loadLevels();
  let list = levels.map(item => ({
    id: item.id,
    name: item.name,
    difficulty: item.difficulty
  }));

  // 按难度筛选
  const diff = req.query.difficulty;
  if (diff) {
    list = list.filter(item => item.difficulty === diff);
  }

  res.json({ code: 0, data: list, msg: 'ok' });
});

// ==========================================
// 接口：获取单个关卡详情
// ==========================================
app.get('/api/level/:id', (req, res) => {
  const { id } = req.params;
  const levels = loadLevels();
  const level = levels.find(item => String(item.id) === String(id));

  if (!level) {
    return res.json({ code: 1, data: null, msg: '关卡不存在' });
  }

  res.json({
    code: 0,
    data: {
      id: level.id,
      name: level.name,
      difficulty: level.difficulty,
      cells: level.cells,
      cages: level.cages
    },
    msg: 'ok'
  });
});

// ==========================================
// 接口：教学模式 - 获取所有章节列表
// ==========================================
app.get('/api/chapters', (req, res) => {
  const chapters = loadChapters();
  const list = chapters.map(ch => ({
    chapterId: ch.chapterId,
    title: ch.title,
    subtitle: ch.subtitle,
    icon: ch.icon,
    color: ch.color,
    description: ch.description,
    badgeId: ch.badgeId,
    badgeName: ch.badgeName,
    unlockRequirement: ch.unlockRequirement,
    levelCount: ch.levels.length
  }));
  res.json({ code: 0, data: list, msg: 'ok' });
});

// ==========================================
// 接口：教学模式 - 获取单个章节详情（含关卡列表）
// ==========================================
app.get('/api/chapter/:id', (req, res) => {
  const { id } = req.params;
  const chapters = loadChapters();
  const chapter = chapters.find(ch => String(ch.chapterId) === String(id));

  if (!chapter) {
    return res.json({ code: 1, data: null, msg: '章节不存在' });
  }

  const levels = chapter.levels.map(lv => ({
    levelId: lv.levelId,
    title: lv.title,
    gridSize: lv.gridSize,
    difficulty: lv.difficulty,
    teachingGoal: lv.teachingGoal
  }));

  res.json({
    code: 0,
    data: {
      chapterId: chapter.chapterId,
      title: chapter.title,
      subtitle: chapter.subtitle,
      icon: chapter.icon,
      color: chapter.color,
      description: chapter.description,
      badgeId: chapter.badgeId,
      badgeName: chapter.badgeName,
      levels
    },
    msg: 'ok'
  });
});

// ==========================================
// 接口：教学模式 - 获取教学关卡详情
// ==========================================
app.get('/api/teaching-level/:id', (req, res) => {
  const { id } = req.params;
  const result = findTeachingLevel(id);

  if (!result) {
    return res.json({ code: 1, data: null, msg: '关卡不存在' });
  }

  const { chapter, level } = result;
  res.json({
    code: 0,
    data: {
      id: level.levelId,
      name: level.title,
      difficulty: level.difficulty,
      gridSize: level.gridSize,
      cells: level.boardData,
      cages: level.cages,
      features: level.features,
      triggers: level.triggers,
      solution: level.solution,
      chapterId: chapter.chapterId,
      chapterTitle: chapter.title,
      teachingGoal: level.teachingGoal,
      preDialog: level.preDialog,
      clearDialog: level.clearDialog,
      introStory: chapter.introStory,
      endingStory: chapter.endingStory
    },
    msg: 'ok'
  });
});

// ==========================================
// 接口：校验答案
// 入参：{ levelId, answer: 9×9 二维数组 }
// 校验四项规则：行、列、3×3宫、笼子（和值+笼内不重复）
// 返回：{ code, data: { correct, errors: [{r,c,type}] } }
// ==========================================
app.post('/api/check', (req, res) => {
  const { levelId, answer } = req.body;

  // 参数校验
  if (!answer || !Array.isArray(answer) || answer.length !== 9) {
    return res.json({ code: 1, data: null, msg: '答案格式错误：需要 9×9 二维数组' });
  }
  for (let r = 0; r < 9; r++) {
    if (!Array.isArray(answer[r]) || answer[r].length !== 9) {
      return res.json({ code: 1, data: null, msg: '答案格式错误：需要 9×9 二维数组' });
    }
  }

  // 取出关卡笼子信息
  let cages = [];
  if (levelId !== undefined) {
    const levels = loadLevels();
    const level = levels.find(item => String(item.id) === String(levelId));
    if (level) {
      cages = level.cages || [];
    }
  }

  const errors = [];

  // 规则1：每行 1-9 不重复
  for (let r = 0; r < 9; r++) {
    const seen = {};
    for (let c = 0; c < 9; c++) {
      const val = answer[r][c];
      if (val === 0) continue;
      if (seen[val] !== undefined) {
        errors.push({ r, c, type: 'row' });
        errors.push({ r, c: seen[val], type: 'row' });
      } else {
        seen[val] = c;
      }
    }
  }

  // 规则2：每列 1-9 不重复
  for (let c = 0; c < 9; c++) {
    const seen = {};
    for (let r = 0; r < 9; r++) {
      const val = answer[r][c];
      if (val === 0) continue;
      if (seen[val] !== undefined) {
        errors.push({ r, c, type: 'col' });
        errors.push({ r: seen[val], c, type: 'col' });
      } else {
        seen[val] = r;
      }
    }
  }

  // 规则3：每个 3×3 宫内 1-9 不重复
  for (let boxR = 0; boxR < 3; boxR++) {
    for (let boxC = 0; boxC < 3; boxC++) {
      const seen = {};
      for (let r = boxR * 3; r < boxR * 3 + 3; r++) {
        for (let c = boxC * 3; c < boxC * 3 + 3; c++) {
          const val = answer[r][c];
          if (val === 0) continue;
          if (seen[val]) {
            errors.push({ r, c, type: 'box' });
            errors.push({ r: seen[val][0], c: seen[val][1], type: 'box' });
          } else {
            seen[val] = [r, c];
          }
        }
      }
    }
  }

  // 规则4：每个笼子内数字之和等于标注 sum，且笼内数字不重复
  cages.forEach(cage => {
    const cageVals = [];
    let sum = 0;
    let hasEmpty = false;
    const seenInCage = {};

    cage.cells.forEach(([r, c]) => {
      const val = answer[r][c];
      if (val === 0) {
        hasEmpty = true;
      } else {
        cageVals.push({ r, c, val });
        sum += val;
        if (seenInCage[val]) {
          errors.push({ r, c, type: 'cage_duplicate' });
          errors.push({ r: seenInCage[val][0], c: seenInCage[val][1], type: 'cage_duplicate' });
        } else {
          seenInCage[val] = [r, c];
        }
      }
    });

    // 笼内全部填满时才校验和值
    if (!hasEmpty && sum !== cage.sum) {
      cage.cells.forEach(([r, c]) => {
        errors.push({ r, c, type: 'cage_sum' });
      });
    }
  });

  // 去重（同一坐标+类型只保留一条）
  const errorSet = new Set();
  const uniqueErrors = errors.filter(e => {
    const key = `${e.r},${e.c},${e.type}`;
    if (errorSet.has(key)) return false;
    errorSet.add(key);
    return true;
  });

  const correct = uniqueErrors.length === 0 && answer.every(row => row.every(v => v !== 0));

  res.json({
    code: 0,
    data: {
      correct,
      errors: uniqueErrors
    },
    msg: 'ok'
  });
});

// ==========================================
// 接口：获取下一步提示
// 入参：{ levelId, currentGrid: 9×9 二维数组 }
// 返回：{ code, data: { r, c, num, technique, techniqueName, description } }
// ==========================================
app.post('/api/hint', (req, res) => {
  const { levelId, currentGrid } = req.body;

  if (!currentGrid || !Array.isArray(currentGrid) || currentGrid.length !== 9) {
    return res.json({ code: 1, data: null, msg: '盘面格式错误' });
  }

  // 取出关卡笼子信息
  let cages = [];
  if (levelId !== undefined) {
    const levels = loadLevels();
    const level = levels.find(item => String(item.id) === String(levelId));
    if (level) {
      cages = level.cages || [];
    }
  }

  if (cages.length === 0) {
    return res.json({ code: 1, data: null, msg: '找不到关卡信息' });
  }

  try {
    const sim = new HumanSimulator(currentGrid, cages);
    const result = sim.solve(1); // 只解一步

    if (sim.steps.length > 0) {
      const step = sim.steps[0];
      const techniqueNames = {
        nakedSingle: '显单',
        hiddenSingle: '隐单',
        rule45: '45法则'
      };
      res.json({
        code: 0,
        data: {
          r: step.row,
          c: step.col,
          num: step.num,
          technique: step.technique,
          techniqueName: techniqueNames[step.technique] || step.technique,
          description: buildHintDescription(step)
        },
        msg: 'ok'
      });
    } else {
      res.json({ code: 0, data: null, msg: '暂无可用提示' });
    }
  } catch (e) {
    console.error('提示计算异常：', e);
    res.json({ code: 1, data: null, msg: '提示计算失败' });
  }
});

function buildHintDescription(step) {
  const { technique, scope, num } = step;
  if (technique === 'nakedSingle') {
    return '这个格子只有一个可能的数字';
  }
  if (technique === 'hiddenSingle') {
    const scopeNames = { row: '行', col: '列', box: '宫', cage: '笼子' };
    const scopeName = scopeNames[scope] || scope;
    return `这个${scopeName}中，数字${num}只能填在这里`;
  }
  if (technique === 'rule45') {
    return `通过45法则推导，这里应该填${num}`;
  }
  return `下一步填${num}`;
}

// ==========================================
// 接口：评估盘面难度
// 入参：{ cages } 或 { levelId }
// 返回：{ code, data: { score, level, techniques, totalSteps, solvable, emptyCells } }
// ==========================================
app.post('/api/rate', (req, res) => {
  const { levelId, cages: cagesParam } = req.body;

  let cages = cagesParam || [];
  if (levelId !== undefined && cages.length === 0) {
    const levels = loadLevels();
    const level = levels.find(item => String(item.id) === String(levelId));
    if (level) {
      cages = level.cages || [];
    }
  }

  if (!Array.isArray(cages) || cages.length === 0) {
    return res.json({ code: 1, data: null, msg: '缺少笼子数据' });
  }

  try {
    const grid = Array.from({ length: 9 }, () => Array(9).fill(0));
    const sim = new HumanSimulator(grid, cages);
    sim.solve();
    const rating = sim.getDifficultyRating();

    res.json({
      code: 0,
      data: rating,
      msg: 'ok'
    });
  } catch (e) {
    console.error('难度评估异常：', e);
    res.json({ code: 1, data: null, msg: '难度评估失败' });
  }
});

// ==========================================
// 接口：求解盘面（验证是否有解）
// 入参：{ cages }
// 返回：{ code, data: { solvable, solution, solutionsCount } }
// ==========================================
app.post('/api/solve', (req, res) => {
  const { cages } = req.body;

  if (!Array.isArray(cages) || cages.length === 0) {
    return res.json({ code: 1, data: null, msg: '缺少笼子数据' });
  }

  try {
    const grid = Array.from({ length: 9 }, () => Array(9).fill(0));
    const solver = new KillerSudokuSolver(grid, cages);
    const solution = solver.solve();

    res.json({
      code: 0,
      data: {
        solvable: !!solution,
        solution: solution || null
      },
      msg: 'ok'
    });
  } catch (e) {
    console.error('求解异常：', e);
    res.json({ code: 1, data: null, msg: '求解失败' });
  }
});

// ==========================================
// 接口：获取某关的正解
// ==========================================
app.get('/api/solve/:id', (req, res) => {
  const { id } = req.params;
  const levels = loadLevels();
  const level = levels.find(item => String(item.id) === String(id));

  if (!level) {
    return res.json({ code: 1, data: null, msg: '关卡不存在' });
  }

  try {
    const grid = level.cells.map(row => [...row]);
    const solver = new KillerSudokuSolver(grid, level.cages);
    solver.solve();
    const solution = solver.solutions.length > 0 ? solver.solutions[0] : null;

    res.json({
      code: 0,
      data: solution || null,
      msg: 'ok'
    });
  } catch (e) {
    console.error('求解异常：', e);
    res.json({ code: 1, data: null, msg: '求解失败' });
  }
});

// ==========================================
// 统一错误处理中间件：捕获所有未处理异常
// ==========================================
app.use((err, req, res, next) => {
  console.error('❌ 服务异常:', err.message);
  res.status(500).json({ code: 1, data: null, msg: '服务器内部错误' });
});

// 404 兜底
app.use((req, res) => {
  res.status(404).json({ code: 1, data: null, msg: '接口不存在' });
});

const os = require('os');

// 获取本机局域网IP
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// 启动服务
const localIP = getLocalIP();
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ 后端服务已启动`);
  console.log(`📍 本地访问: http://localhost:${PORT}`);
  console.log(`📱 手机访问: http://${localIP}:${PORT} （手机需连同一WiFi）`);
  console.log(`🔌 接口地址: http://localhost:${PORT}/api/levels`);
});
