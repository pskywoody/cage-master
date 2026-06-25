const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

// 中间件：解析JSON请求体
app.use(express.json());

// 1. 托管前端静态文件
app.use(express.static(path.join(__dirname, 'game-src')));

// 2. 读取题库数据（修正路径：题库实际位于 game-src/data/levels.json）
function loadLevels() {
  const filePath = path.join(__dirname, 'game-src', 'data', 'levels.json');
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw);
}

// ==========================================
// 接口：获取所有关卡列表
// ==========================================
app.get('/api/levels', (req, res) => {
  const levels = loadLevels();
  const list = levels.map(item => ({
    id: item.id,
    name: item.name,
    difficulty: item.difficulty
  }));
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

// 启动服务
app.listen(PORT, () => {
  console.log(`✅ 后端服务已启动`);
  console.log(`📍 游戏地址: http://localhost:${PORT}`);
  console.log(`🔌 接口地址: http://localhost:${PORT}/api/levels`);
});
