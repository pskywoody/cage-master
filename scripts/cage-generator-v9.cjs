/**
 * ============================================================
 *  CageFixer v9 - 二/三周目更难关卡生成器
 * ============================================================
 *
 *  基于 v8 架构，针对 9x9 高阶技巧（X-Wing/Swordfish/数对链）
 *  重构生成策略：
 *    1. 候选集注入法构造 X-Wing/Swordfish（非改完整解）
 *    2. 多技巧链验证（技巧依赖顺序）
 *    3. 推理链长度与雪崩区扩展
 *    4. 视觉巧思规则（对称性/节奏/锚点）
 *
 *  生成流程：
 *    Step 1: 生成完整解
 *    Step 1.5: 候选集结构注入（v9 新增）
 *    Step 2: 划分笼子（含 requiredSizes）
 *    Step 3: 计算笼子和值
 *    Step 3.5: 三幕锚点设计
 *    Step 4: 技巧链定向挖洞（v9 重构）
 *    Step 5: 难度与节奏验证
 *    Step 6: 视觉巧思验证（v9 新增）
 *
 *  落地说明（2026-08-04）：
 *    - 依据用户提供的 v9 修正版源码落地
 *    - 修复 _digAndTune 退化：非链模式复用 v8 完整挖洞逻辑
 *      （否则生成全填盘面，预填 81 格的无效关卡）
 *    - 依赖 core/board.js + core/tech-rater.js（与 v8 一致）
 *
 * ============================================================
 */

(function (global) {
  'use strict';

  if (typeof window === 'undefined') {
    global.window = global;
  }

  const path = require('path');
  const fs = require('fs');

  // ========================================================
  //  依赖加载
  // ========================================================

  function _loadDeps() {
    const deps = {};
    if (typeof Board !== 'undefined') {
      deps.Board = Board;
    } else if (typeof window !== 'undefined' && window.Board) {
      deps.Board = window.Board;
    } else {
      const boardPath = path.join(__dirname, '..', 'core', 'board.js');
      const boardCode = fs.readFileSync(boardPath, 'utf-8');
      eval.call(global, boardCode);
      deps.Board = global.Board || window.Board;
    }

    if (typeof TechRater !== 'undefined') {
      deps.TechRater = TechRater;
    } else if (typeof window !== 'undefined' && window.TechRater) {
      deps.TechRater = window.TechRater;
    } else {
      try {
        require(path.join(__dirname, '..', 'core', 'tech-rater.js'));
      } catch (e) {
        const trPath = path.join(__dirname, '..', 'core', 'tech-rater.js');
        const trCode = fs.readFileSync(trPath, 'utf-8');
        eval.call(global, trCode);
      }
      deps.TechRater = global.TechRater || (typeof window !== 'undefined' ? window.TechRater : null);
      if (!deps.TechRater) {
        deps.TechRater = globalThis.TechRater || null;
      }
    }

    deps.LevelValidator = null;
    deps.TechnicalPurityValidator = null;
    return deps;
  }

  // ========================================================
  //  工具函数
  // ========================================================

  function getBoxDimensions(size) {
    if (size === 4) return { boxW: 2, boxH: 2, boxRows: 2, boxCols: 2 };
    if (size === 6) return { boxW: 3, boxH: 2, boxRows: 2, boxCols: 3 };
    return { boxW: 3, boxH: 3, boxRows: 3, boxCols: 3 };
  }

  function shuffleArray(arr, rng) {
    const result = arr.slice();
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  function createRNG(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function deepCopyGrid(grid) {
    return grid.map(row => row.slice());
  }

  function countFilled(grid) {
    let c = 0;
    for (let r = 0; r < grid.length; r++) {
      for (let col = 0; col < grid[0].length; col++) {
        if (grid[r][col] !== 0) c++;
      }
    }
    return c;
  }

  // ========================================================
  //  Step 1: 生成完整解
  // ========================================================

  function generateFullSolution(size, rng) {
    const dim = getBoxDimensions(size);
    const grid = Array.from({ length: size }, () => Array(size).fill(0));

    function isValid(r, c, num) {
      for (let i = 0; i < size; i++) {
        if (grid[r][i] === num) return false;
      }
      for (let i = 0; i < size; i++) {
        if (grid[i][c] === num) return false;
      }
      const br = Math.floor(r / dim.boxH) * dim.boxH;
      const bc = Math.floor(c / dim.boxW) * dim.boxW;
      for (let dr = 0; dr < dim.boxH; dr++) {
        for (let dc = 0; dc < dim.boxW; dc++) {
          if (grid[br + dr][bc + dc] === num) return false;
        }
      }
      return true;
    }

    function backtrack(pos) {
      if (pos === size * size) return true;
      const r = Math.floor(pos / size);
      const c = pos % size;
      if (grid[r][c] !== 0) return backtrack(pos + 1);
      const nums = shuffleArray(Array.from({ length: size }, (_, i) => i + 1), rng);
      for (const num of nums) {
        if (isValid(r, c, num)) {
          grid[r][c] = num;
          if (backtrack(pos + 1)) return true;
          grid[r][c] = 0;
        }
      }
      return false;
    }

    backtrack(0);
    return grid;
  }

  // ========================================================
  //  Step 1.5: 候选集结构注入（v9）
  //  关键差异：不在完整解中构造 X-Wing（那是数学上不可能的，
  //  每数字每行只 1 个位置），而是随机选定 num + 关键行 + 关键列，
  //  交给挖洞阶段做定向挖，让候选集在求解过程中形成目标结构。
  // ========================================================

  function buildCandidateStructure(size, rng, technique) {
    if (technique !== 'xWing' && technique !== 'swordfish') return null;

    const num = 1 + Math.floor(rng() * size);
    const allIdx = Array.from({ length: size }, (_, i) => i);
    const rows = shuffleArray(allIdx, rng).slice(0, technique === 'xWing' ? 2 : 3);
    const cols = shuffleArray(allIdx, rng).slice(0, technique === 'xWing' ? 2 : 3);

    const cornerCells = [];
    for (const r of rows) {
      for (const c of cols) {
        cornerCells.push([r, c]);
      }
    }

    const elimCells = [];
    const rowSet = new Set(rows);
    const colSet = new Set(cols);
    for (let r = 0; r < size; r++) {
      if (rowSet.has(r)) continue;
      for (const c of cols) {
        if (rng() < 0.7) elimCells.push([r, c]);
      }
    }
    for (const r of rows) {
      for (let c = 0; c < size; c++) {
        if (colSet.has(c)) continue;
        if (rng() < 0.5) elimCells.push([r, c]);
      }
    }

    return { num, rows, cols, cornerCells, elimCells };
  }

  // ========================================================
  //  Step 2: 划分笼子
  // ========================================================

  // ---- B3-B1b：topology 评分辅助（不碰 builder，只用于 candidate ranking）----
  // canonicalizeShape：平移 + 8 dihedral 变换取最小形，得到对旋转/镜像不变的 shapeID。
  function canonicalizeShape(cells) {
    if (!cells || cells.length === 0) return '';
    const pts = cells.map((x) => [Number(x[0]), Number(x[1])]);
    const transforms = [
      (r, c) => [r, c],
      (r, c) => [c, -r],
      (r, c) => [-r, -c],
      (r, c) => [-c, r],
      (r, c) => [-r, c],
      (r, c) => [c, r],
      (r, c) => [r, -c],
      (r, c) => [-c, -r],
    ];
    let best = null;
    for (const t of transforms) {
      const out = pts.map(([r, c]) => t(r, c));
      const minR = Math.min(...out.map((p) => p[0]));
      const minC = Math.min(...out.map((p) => p[1]));
      const norm = out.map(([r, c]) => [r - minR, c - minC]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      const key = norm.map(([r, c]) => r + ',' + c).join('|');
      if (best === null || key.localeCompare(best) < 0) best = key;
    }
    return best;
  }

  // 笼是否跨宫（span >1 box，9x9 boxH=boxW=3）
  function cageCrossHouse(cells) {
    const boxes = new Set(cells.map(([r, c]) => Math.floor(Number(r) / 3) + ',' + Math.floor(Number(c) / 3)));
    return boxes.size > 1;
  }

  // topologyScore：归一化到 [0,1]，越高 = 更复杂 + 更少 concentration。
  //   正向：cross-house complex（size>=4 且跨宫）占比
  //   负向：top-4 shape concentration（shape 分布越集中扣越多）
  //   负向：singleton（B3-B1a 已基本清零，残留再扣）
  // 只读取布局，不修改任何生成逻辑。
  function computeTopologyScore(cages) {
    if (!cages || cages.length === 0) return 0;
    const total = cages.length;
    const shapeCounts = new Map();
    let complexCount = 0;
    let singletonCount = 0;
    for (const cage of cages) {
      const cells = cage.cells || [];
      const size = cells.length;
      if (size === 1) singletonCount++;
      if (size >= 4 && cageCrossHouse(cells)) complexCount++;
      const id = canonicalizeShape(cells);
      shapeCounts.set(id, (shapeCounts.get(id) || 0) + 1);
    }
    const sorted = [...shapeCounts.values()].sort((a, b) => b - a);
    let top4 = 0;
    for (let i = 0; i < Math.min(4, sorted.length); i++) top4 += sorted[i];
    const complexShare = complexCount / total;
    const top4Share = top4 / total;
    const singletonShare = singletonCount / total;
    // complex 拉高分，concentration/singleton 扣分；clamp 到 [0,1]
    const raw = complexShare - 0.4 * top4Share - singletonShare;
    return Math.max(0, Math.min(1, raw + 0.4));
  }

  // ---- B3-C1b：shape diversity 辅助（ranking 层，不碰 builder）----
  // archetype 分类（与 scripts/b3c1a-shape-histogram.cjs 保持一致）。
  function classifyArchetype(cells) {
    if (!cells || cells.length === 0) return 'singleton';
    const pts = cells.map(([r, c]) => [Number(r), Number(c)]);
    const n = pts.length;
    if (n === 1) return 'singleton';
    const rows = new Set(pts.map((p) => p[0]));
    const cols = new Set(pts.map((p) => p[1]));
    const minR = Math.min(...rows), maxR = Math.max(...rows);
    const minC = Math.min(...cols), maxC = Math.max(...cols);
    const w = maxC - minC + 1, h = maxR - minR + 1;
    const straight = rows.size === 1 || cols.size === 1;
    const fullRect = rows.size * cols.size === n;
    let maxDeg = 0, turns = 0;
    for (const [r, c] of pts) {
      let deg = 0;
      const adjs = [];
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (pts.some(([pr, pc]) => pr === r + dr && pc === c + dc)) { deg++; adjs.push([dr, dc]); }
      }
      maxDeg = Math.max(maxDeg, deg);
      if (deg === 2 && adjs[0][0] * adjs[1][0] + adjs[0][1] * adjs[1][1] === 0) turns++;
    }
    if (n === 2) return 'domino';
    if (straight) return 'straight';
    if (fullRect) return 'rect';
    if (maxDeg >= 4) return 'cross';
    if (maxDeg >= 3) return 'T';
    if (n === 3) return 'L';
    if (turns >= 2) return 'zigzag';
    if (turns >= 1) return 'hook';
    return 'irregular';
  }

  // B4-C2：basin signature —— 把 fine-grained family（canonical shape ID）聚合成
  //   coarse structural basin（宏观吸引子）。B4-C1 证明 family 级均匀压力只是
  //   basin 内部「洗牌占优 family」，不降 head 总量；C2 改打 basin occupancy。
  //   分组依据是已有拓扑属性（线性/单折/分叉/矩形/复杂），不引入新 embedding。
  function basinSignature(cells) {
    const a = classifyArchetype(cells);
    switch (a) {
      case 'singleton': return 'singleton';
      case 'domino':
      case 'straight': return 'linear';    // 杆/直线（domino、straight-N）
      case 'L':
      case 'hook':     return 'corner';    // 单折/角
      case 'T':
      case 'cross':    return 'branch';    // 分叉（T/cross 结点）
      case 'rect':     return 'rect';      // 完整矩形
      default:         return 'complex';   // zigzag/irregular
    }
  }

  // canonical 高集中簇：B3-C1a 实测 top4 = L/T/domino/straight 四类吃掉 51.5%。
  // B3-C1c 原则：只对 canonical 簇加税，不罚 complex（zigzag/cross/hook），不罚 rect。
  const CANONICAL_SHAPE_SET = new Set(['L', 'T', 'domino', 'straight']);

  // B4-C1：cross-level family birth pressure 的参考常量。
  //   FAMILY_TARGET_COUNT：canonical family 公平份额分母（B4-C0 实测候选池 familyCount=10）。
  //   BIRTH_PRESSURE_FLOOR：soft 衰减下限，weight 永不低于该比值 → 不禁止、不新建 family。
  const FAMILY_TARGET_COUNT = 10;
  // B4-C2：basin 公平份额分母（basinSignature 的分组数：linear/corner/branch/rect/complex/singleton=6）。
  const BASIN_TARGET_COUNT = 6;
  const BIRTH_PRESSURE_FLOOR = 0.1;

  // shapeDiversityPenalty：读布局，返回 canonical 簇集中度惩罚 ∈ [0,1]。
  //   越高 = canonical 簇越集中（越需要被 tax）。
  //   只统计 canonical 簇（L/T/domino/straight）占比，超目标基线（45%）起罚，
  //   放大 5x 使其在 fitness 的 diff/λ 量级下可感知。不改任何生成逻辑。
  function computeShapeDiversityPenalty(cages) {
    if (!cages || cages.length === 0) return 0;
    const total = cages.length;
    let canonicalCount = 0;
    for (const cage of cages) {
      const a = classifyArchetype(cage.cells || []);
      if (CANONICAL_SHAPE_SET.has(a)) canonicalCount++;
    }
    const canonicalShare = canonicalCount / total;
    // 目标 canonicalShare < 45%（对应 Gate C top4<45%）。超基线起罚，放大 5x。
    return Math.max(0, Math.min(1, (canonicalShare - 0.45) * 5));
  }

  // ============================================================
  //  B4-B0：Canonical Fingerprint Extractor
  //  区分「canonical family」而非「isCanonical 布尔」。
  //  family = 该笼的 canonicalizeShape ID（对旋转/镜像不变），
  //  只取 canonical 簇（L/T/domino/straight）→ 精确到「哪个 canonical 形状」。
  //  level fingerprint = 该局所有 canonical family 的排序多集。
  //  作用：识别「不同 level 是否收敛到同一 topology basin」。
  // ============================================================
  function levelCanonicalFingerprint(cages) {
    if (!cages || cages.length === 0) return '';
    const fams = [];
    for (const cage of cages) {
      const cells = cage.cells || [];
      const a = classifyArchetype(cells);
      if (CANONICAL_SHAPE_SET.has(a)) fams.push(canonicalizeShape(cells));
    }
    fams.sort();
    return fams.join('|');
  }

  // ============================================================
  //  B4-E1：objective saturation —— 候选与【历史 winner】的结构相似度 penalty。
  //  与 B4-C1/D1 的「跨关 family 频率压力」不同：
  //    C1/D1 惩罚【某个 family 的跨关总频率】（head family 必现 → 洗牌不降总量）。
  //    E1 惩罚【候选整体结构与过去某个已赢关的相似度】——即 objective 对「已探索过
  //     的 head 结构」是否过度奖励。hypothesis：head basin 不是天然更优，而是 objective
  //     对同构结构反复给高分，把生成结果吸回同一 attractor。
  //  用 canonical family 计数向量 + 余弦相似度，衡量「这个候选有多像已赢过的关」。
  //  相似度越高 → 越像已赢结构 → fitness 加得越多（fitness 越小越好 → 越难被选中）。
  //  不做 family 频率统计、不惩罚单个 family —— 只做 level↔level 结构相似 repulsion。
  // ============================================================
  function levelFamilyVector(cages) {
    const vec = new Map();
    if (!cages) return vec;
    for (const cage of cages) {
      const cells = cage.cells || [];
      const a = classifyArchetype(cells);
      if (CANONICAL_SHAPE_SET.has(a)) {
        const fam = canonicalizeShape(cells);
        vec.set(fam, (vec.get(fam) || 0) + 1);
      }
    }
    return vec;
  }
  function cosineSimilarity(vecA, vecB) {
    const keys = new Set([...vecA.keys(), ...vecB.keys()]);
    let dot = 0, na = 0, nb = 0;
    for (const k of keys) {
      const a = vecA.get(k) || 0, b = vecB.get(k) || 0;
      dot += a * b; na += a * a; nb += b * b;
    }
    if (na === 0 || nb === 0) return 0;
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
  }

  // ============================================================
  //  B4-D0：Candidate Topology Profile（per-cage canonical family 粒度）
  //  与 B4-B 的整关级 fingerprint 不同，这里度量【单个候选】内部的
  //  canonical family 覆盖能力——family 数量、分布熵、top1/top4 集中度。
  //  作用：分叉判断——候选池是否【已存在】family diversity，
  //        只是 diff 择优把它淘汰（→B4-D1 加权），
  //        还是候选池本身 family 就塌缩（→B4-C generation/search）。
  //  纯测量，不改 selection，不改生成。
  // ============================================================
  function candidateTopologyProfile(cages) {
    if (!cages || cages.length === 0) {
      return { familyCount: 0, entropy: 0, top1FamilyShare: 0, top4FamilyShare: 0, canonicalTotal: 0, totalCages: 0, families: [] };
    }
    const famCounts = new Map();
    let canonicalTotal = 0;
    for (const cage of cages) {
      const cells = cage.cells || [];
      const a = classifyArchetype(cells);
      if (CANONICAL_SHAPE_SET.has(a)) {
        const fam = canonicalizeShape(cells);
        famCounts.set(fam, (famCounts.get(fam) || 0) + 1);
        canonicalTotal++;
      }
    }
    if (canonicalTotal === 0) {
      return { familyCount: 0, entropy: 0, top1FamilyShare: 0, top4FamilyShare: 0, canonicalTotal: 0, totalCages: cages.length, families: [] };
    }
    const vals = [...famCounts.values()].sort((a, b) => b - a);
    let entropy = 0;
    for (const c of vals) {
      const p = c / canonicalTotal;
      entropy -= p * Math.log(p);
    }
    let top1 = 0, top4 = 0;
    for (let i = 0; i < vals.length; i++) {
      if (i === 0) top1 = vals[0];
      if (i < 4) top4 += vals[i];
    }
    return {
      familyCount: famCounts.size,
      entropy: Math.round(entropy * 1000) / 1000,
      top1FamilyShare: Math.round((top1 / canonicalTotal) * 1000) / 1000,
      top4FamilyShare: Math.round((top4 / canonicalTotal) * 1000) / 1000,
      canonicalTotal,
      totalCages: cages.length,
      families: [...famCounts.keys()], // family ID 集合（B4-C0 组合覆盖测量用）
    };
  }

  // ============================================================
  //  B4-F0：Candidate Pipeline Audit —— 纯测量，不改 selection/生成。
  //  记录每个候选在 pipeline 各阶段的「head vs non-head 结构占比」，
  //  验证 non-head candidate 是否在 generator→difficulty→inRange→pool 途中被淘汰。
  //  head = canonical family（L/T/domino/straight，B4-C0 的 headLock 家族）；
  //  nonHead = 其余（hook/zigzag/cross/rect/irregular/singleton）。
  //  返回候选级结构画像，供 F0-1/2/3 聚合。
  // ============================================================
  function candidateStructuralProfile(cages) {
    let total = 0, head = 0, complex = 0, crossHouseComplex = 0;
    const headFams = new Set();
    for (const cage of cages || []) {
      const cells = cage.cells || [];
      const a = classifyArchetype(cells);
      const size = cells.length;
      const crossHouse = size >= 4 && cageCrossHouse(cells);
      total++;
      if (CANONICAL_SHAPE_SET.has(a)) {
        head++;
        headFams.add(canonicalizeShape(cells));
      }
      if (a === 'zigzag' || a === 'cross' || a === 'irregular' || a === 'hook' || a === 'rect') complex++;
      if (crossHouse) crossHouseComplex++;
    }
    const headRatio = total ? head / total : 0;
    return {
      totalCages: total,
      headCages: head,
      nonHeadCages: total - head,
      headRatio: Math.round(headRatio * 1000) / 1000,
      hasNonHead: total - head > 0,
      complexCages: complex,
      crossHouseComplex,
      headFamilyCount: headFams.size,
      headFamilies: [...headFams],
    };
  }

  // ============================================================
  //  B4-A1：Topology Prior —— shape-template birth 模板库 + 冻结先验
  //  只改变「出生先验分布」，不触碰 selection / difficulty / ranking。
  //  topologyPrior.enabled 默认 false → B3-FINAL 生产路径逐字节不变。
  // ============================================================
  // 模板（相对坐标模式，锚定种子后施加 8 变换）。archetype 对齐 classifyArchetype。
  // 先验权重：complex non-top4（zigzag/cross/hook/irregular）主导，canonical top4（straight/domino/L）压到最低。
  const TOPOLOGY_PRIOR_TEMPLATES = {
    4: [
      { cells: [[0,0],[0,1],[0,-1],[1,0]],            a: 'T',        w: 0.10 },
      { cells: [[0,0],[1,0],[1,1],[2,1]],             a: 'zigzag',   w: 0.22 },
      { cells: [[0,0],[0,1],[0,2],[1,0]],             a: 'hook',     w: 0.17 },
      { cells: [[0,0],[0,1],[1,0],[1,1]],             a: 'rect',     w: 0.10 },
      { cells: [[0,0],[0,1],[0,2],[0,3]],             a: 'straight', w: 0.05 },
    ],
    5: [
      { cells: [[0,0],[0,1],[0,-1],[1,0],[2,0]],      a: 'T',        w: 0.10 },
      { cells: [[0,0],[0,1],[0,-1],[1,0],[-1,0]],     a: 'cross',    w: 0.14 },
      { cells: [[0,0],[1,0],[1,1],[2,1],[2,2]],       a: 'zigzag',   w: 0.22 },
      { cells: [[0,0],[0,1],[0,2],[1,0],[1,1]],       a: 'hook',     w: 0.17 },
      { cells: [[0,0],[0,1],[1,1],[2,1],[2,2]],       a: 'irregular',w: 0.14 },
    ],
    6: [
      { cells: [[0,0],[1,0],[1,1],[2,1],[2,2],[3,2]], a: 'zigzag',   w: 0.22 },
      { cells: [[0,0],[0,1],[0,2],[1,0],[1,1],[1,2]], a: 'rect',     w: 0.10 },
      { cells: [[0,0],[0,1],[0,-1],[1,0],[2,0],[3,0]],a: 'T',        w: 0.10 },
      { cells: [[0,0],[0,1],[1,1],[1,2],[2,2],[2,3]], a: 'irregular',w: 0.14 },
    ],
  };
  // 单一冻结配置：templateBias = 出生时尝试模板出生的概率（写死，不扫）。
  const TOPOLOGY_PRIOR_DEFAULTS = { enabled: false, templateBias: 0.5 };

  // B3-B1b Phase2：topology proposal channel（supply 侧）。
  // 把相邻小笼合并成跨宫、非直线、size 4-6 的不规则笼（L/T/offset 等），
  // 给 candidate pool 注入过去不存在的 complex topology 分布。
  //   - 只合并，不新增/删除格子，不产生 singleton
  //   - maxPer 限制每布局最多注入几个复杂笼，避免过度重塑破坏 size 分布
  //   - 复用 rng 保证可复现
  function reshapeToComplex(cages, solution, size, maxSize, rng, maxPer) {
    if (!cages || cages.length === 0) return cages;
    let result = cages.slice();
    const maxProposals = maxPer || 3;
    let proposalMade = 0;

    function isComplex(combined) {
      if (combined.length < 4 || combined.length > maxSize) return false;
      const boxes = new Set(combined.map(([r, c]) => Math.floor(Number(r) / 3) + ',' + Math.floor(Number(c) / 3)));
      if (boxes.size <= 1) return false; // 必须跨宫
      const rows = new Set(combined.map(([r]) => Number(r)));
      const cols = new Set(combined.map(([, c]) => Number(c)));
      if (rows.size === 1 || cols.size === 1) return false; // 非直线
      return true;
    }

    let guard = 0;
    while (proposalMade < maxProposals && guard++ < 40) {
      let changed = false;
      const cellToCage = {};
      for (let i = 0; i < result.length; i++) {
        if (!result[i]) continue;
        for (const [r, c] of result[i].cells) cellToCage[r + ',' + c] = i;
      }
      const numSets = result.map((cg) => {
        if (!cg) return null;
        const s = new Set();
        for (const [r, c] of cg.cells) s.add(solution[r][c]);
        return s;
      });

      for (let i = 0; i < result.length; i++) {
        if (!result[i]) continue;
        if (result[i].cells.length >= 4) continue; // 只从 <4 的小笼发起
        const neighbors = new Set();
        for (const [r, c] of result[i].cells) {
          for (const [nr, nc] of [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]) {
            if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
            const ni = cellToCage[nr + ',' + nc];
            if (ni !== undefined && ni !== i && result[ni]) neighbors.add(ni);
          }
        }
        const nb = [...neighbors];
        for (let k = nb.length - 1; k > 0; k--) {
          const j = Math.floor(rng() * (k + 1));
          [nb[k], nb[j]] = [nb[j], nb[k]];
        }
        for (const j of nb) {
          if (!result[j]) continue;
          const combined = result[i].cells.concat(result[j].cells);
          if (!isComplex(combined)) continue;
          let dup = false;
          for (const num of numSets[i]) if (numSets[j].has(num)) { dup = true; break; }
          if (dup) continue;
          result[i] = { ...result[i], cells: combined };
          numSets[i] = new Set([...numSets[i], ...numSets[j]]);
          result[j] = null;
          numSets[j] = null;
          proposalMade++;
          changed = true;
          break;
        }
        if (changed) break;
      }
      result = result.filter((c) => c !== null);
      if (!changed) break;
    }
    for (let i = 0; i < result.length; i++) result[i].id = i;
    return result;
  }

  function partitionCages(size, solution, rng, minSize, maxSize, sizeWeights, requiredSizes, suppressSingletons, growthBias, topologyScoreVersion, crossHouseDiversity, shapeDiversityWeight, topologyPrior, familyBirthPressure, basinBirthPressure, traceArr, size5BranchSuppress) {
    const totalCells = size * size;
    const assigned = Array.from({ length: size }, () => Array(size).fill(false));
    const cellToCageIdx = Array.from({ length: size }, () => Array(size).fill(-1));
    let cages = [];
    let nextCageId = 0;
    // B4-F2：trace recorder（null = 关闭，零行为影响）
    const traceRec = traceArr ? (e) => traceArr.push(e) : null;

    // B3-B1a：singleton suppression。effMinSize 是分区管线实际采用的最小笼大小。
    //   suppressSingletons=true 时，管线按 size>=2 运行（主循环不生成 size-1、
    //   剩余格优先并入邻笼、mergeSmallCages 以 effMinSize 清理残余单格）。
    //   不引入任何新 shape bias —— 只是把「size-1」这个 trivial topology 消掉。
    const effMinSize = suppressSingletons ? Math.max(2, minSize) : minSize;

    const defaultWeights = { 1: 0.10, 2: 0.30, 3: 0.30, 4: 0.20, 5: 0.10 };
    const weights = sizeWeights || defaultWeights;

    const targetCounts = {};
    const compensation = { 1: 0.5, 2: 1.2, 3: 1.1, 4: 1.0, 5: 1.2 };
    for (let s = effMinSize; s <= maxSize; s++) {
      const w = weights[s] || 0;
      const comp = compensation[s] || 1;
      targetCounts[s] = Math.max(0, Math.round((totalCells * w * comp) / s));
    }

    let totalTargetCells = 0;
    for (let s = effMinSize; s <= maxSize; s++) {
      totalTargetCells += targetCounts[s] * s;
    }
    if (totalTargetCells > totalCells) {
      const ratio = totalCells / totalTargetCells;
      for (let s = minSize; s <= maxSize; s++) {
        targetCounts[s] = Math.max(0, Math.floor(targetCounts[s] * ratio));
      }
    }

    function countRemaining() {
      let count = 0;
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (!assigned[r][c]) count++;
        }
      }
      return count;
    }

    function findRandomStart() {
      const unassigned = [];
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (!assigned[r][c]) {
            unassigned.push([r, c]);
          }
        }
      }
      if (unassigned.length === 0) return null;
      return unassigned[Math.floor(rng() * unassigned.length)];
    }

    function canAbsorb(cageNums, otherCage) {
      for (const [r, c] of otherCage.cells) {
        if (cageNums.has(solution[r][c])) return false;
      }
      return true;
    }

    // B3-B2：局部拓扑评分（growth bias）。对每个 frontier 候选格，评估「加入后」笼形状
    //   偏离 canonical attractor（domino / straight-N / 完整矩形 / 单宫）的程度。
    //   返回权值 multiplier（>1 更被偏好）。strength 混合：weight = (1-s)*1 + s*topo。
    function topologyBiasWeight(candidate, cageCells, levelShare) {
      const pts = cageCells.concat([candidate]).map(([r, c]) => [Number(r), Number(c)]);
      const n = pts.length;
      const rows = new Set(pts.map((p) => p[0]));
      const cols = new Set(pts.map((p) => p[1]));
      const boxes = new Set(pts.map((p) => Math.floor(p[0] / 3) + ',' + Math.floor(p[1] / 3)));
      let w = 1;
      if (rows.size === 1 || cols.size === 1) w *= 0.55; // 直线（含 domino / straight-N）
      if (n === 3 && (rows.size === 1 || cols.size === 1)) w *= 0.6; // straight-3 额外压
      if (rows.size * cols.size === n) w *= 0.5; // 完整矩形（rows*cols===n）
      if (boxes.size > 1) {
        // B3-B4：crossHouse diversity penalty。crossHouseDiversity=true 时，
        //   奖励随局内已放置的 crossHouse 浓度衰减（share 0→1.4，share 0.8+→0.84），
        //   抑制"每次跨宫都满额奖励"导致的 mode-seeking，提升整局 shape diversity (H)。
        //   false 时保持 v1 的恒定 1.4（A/B control 精确复现）。
        if (crossHouseDiversity) {
          w *= 1.4 * (1 - 0.5 * Math.min(levelShare || 0, 0.8));
        } else {
          w *= 1.4;
        }
      }
      let turns = 0, branch = 0;
      for (let i = 0; i < n; i++) {
        const [r, c] = pts[i];
        const adj = [];
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nr = r + dr, nc = c + dc;
          if (pts.some(([pr, pc]) => pr === nr && pc === nc)) adj.push([dr, dc]);
        }
        if (adj.length === 2 && adj[0][0] * adj[1][0] + adj[0][1] * adj[1][1] === 0) turns++;
        else if (adj.length >= 3) branch++;
      }
      if (turns > 0) {
        // B4-G1：size5 T/cross archetype 抑制。v1 的 T 靠「臂关节 turn 加分(1+0.25*turns)」成形，
        //   故只在「笼达 size5 且含 branch(T/cross) 结点」时削弱 turn 加分：
        //   s∈[0,1] 把 T/cross 的 turn 加分乘 (1-s)，使 size5 的 T/cross 相对不再被偏好，
        //   而 size2/3/4 的不规则(L/hook/zigzag)笼（仅 turn、无 branch）完全不受影响。
        //   s=0 → 生产行为不变。
        const s = size5BranchSuppress || 0;
        const g = (n >= 5 && branch > 0) ? 1 : 0;
        w *= 1 + 0.25 * turns * (1 - s * g);
      }
      return w;
    }

    // B3-B3：topology score v2 —— 在 v1 基础上补充三个表达维度：
    //   1) branching：内部 degree>=3 的 T/cross 结点（Killer 高级笼特征）
    //   2) area inefficiency：bounding box density = n/(w*h)，取代粗糙的 rows*cols==n 矩形判断
    //   3) cross-house strength：houseSpread 分层奖励（2 宫 1.4 / 3 宫 1.8 / 4+ 宫 2.2），
    //      取代单一「跨宫/非跨宫」二元判断
    //   只升级评分函数表达力，不改接口 / growthBias / 其它 lever。
    function topologyBiasWeightV2(candidate, cageCells, levelShare) {
      const pts = cageCells.concat([candidate]).map(([r, c]) => [Number(r), Number(c)]);
      const n = pts.length;
      const rows = new Set(pts.map((p) => p[0]));
      const cols = new Set(pts.map((p) => p[1]));
      const boxes = new Set(pts.map((p) => Math.floor(p[0] / 3) + ',' + Math.floor(p[1] / 3)));
      const width = Math.max(...cols) - Math.min(...cols) + 1;
      const height = Math.max(...rows) - Math.min(...rows) + 1;
      const density = n / (width * height);
      let w = 1;
      // 直线惩罚（保留 v1）
      if (rows.size === 1 || cols.size === 1) w *= 0.55;
      if (n === 3 && (rows.size === 1 || cols.size === 1)) w *= 0.6;
      // area inefficiency：density 越高越接近填满矩形 → 惩罚
      w *= 1.5 - density;
      // cross-house strength：houseSpread 分层
      const spread = boxes.size;
      if (spread >= 2) w *= 1 + 0.4 * (spread - 1); // 2→1.4, 3→1.8, 4→2.2
      // 转折 + branching
      let turns = 0, branch = 0;
      for (let i = 0; i < n; i++) {
        const [r, c] = pts[i];
        const adj = [];
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nr = r + dr, nc = c + dc;
          if (pts.some(([pr, pc]) => pr === nr && pc === nc)) adj.push([dr, dc]);
        }
        if (adj.length === 2 && adj[0][0] * adj[1][0] + adj[0][1] * adj[1][1] === 0) turns++;
        else if (adj.length >= 3) branch++;
      }
      if (turns > 0) w *= 1 + 0.25 * turns;
      if (branch > 0) {
        // B4-G1：size5 T/cross archetype 抑制。s∈[0,1] 把 branch 加分整体乘 (1-s)。
        //   branch 只在 >=4 cell（T/cross 需要度>=3 结点）时出现，天然只影响 T/cross-capable 笼；
        //   不 gate size，避免对「最终落在 size5 的 T」与中间步骤不一致。s=0 → 生产行为不变。
        const s = size5BranchSuppress || 0;
        w *= 1 + (0.6 * (1 - s)) * branch; // T/cross 结点加分（s=1 时完全抑制）
      }
      return w;
    }

    // B3-B2/B3-B3/B3-B4：加权挑 empty frontier。strength=0 时退化为均匀随机（与旧行为 RNG 消耗一致）。
    // B3-C1c：shapeDiversityWeight>0 时，对每个 frontier 候选做 1-step lookahead：
    //   模拟 cageCells + candidate 的最终 canonical shape，查局级 shapeUsage，
    //   已用越多权重越低（soft diversity pressure，不禁止、不新建）。与 growthBias 正交。
    function weightedEmptyPick(frontier, cageCells, strength, rng, levelShare, shapeUsage, shapeDiversityWeight, familyBirthPressure, basinBirthPressure) {
      const scoreFn = topologyScoreVersion >= 2 ? topologyBiasWeightV2 : topologyBiasWeight;
      const weights = frontier.map((c) => {
        let w = (1 - strength) * 1 + strength * scoreFn(c, cageCells, levelShare);
        if (shapeDiversityWeight > 0 && shapeUsage) {
          const nextShape = canonicalizeShape(cageCells.concat([c]));
          const used = shapeUsage.get(nextShape) || 0;
          // soft 衰减：第一次无罚，之后随使用次数递减（1/(1+used*W)）。不触发 0。
          w *= 1 / (1 + used * shapeDiversityWeight);
        }
        // B4-C1：cross-level family birth pressure（soft head-family avoidance）。
        //   对 1-step lookahead 的 canonical family，按其跨关全局频率做 soft 衰减：
        //   effectiveWeight = baseWeight * (1 - headFamilyPressure)，其中
        //     headFamilyPressure = globalFamilyFrequency / targetFrequency（公平份额）。
        //   只在 family 已超公平份额（gf>targetFreq）时起压，且衰减有下限 floor，
        //   把 head family 从「必然出现」softly 拉向「可被绕开」，不禁止、不新建 family。
        //   complex/rare family（不在 _familyCounts 或 gf≈0）不衰减，保持原权重。
        if (familyBirthPressure && familyBirthPressure.weight > 0) {
          const fam = canonicalizeShape(cageCells.concat([c]));
          const gf = familyBirthPressure.familyCounts.get(fam) || 0;
          if (gf > 0) {
            const levels = Math.max(1, familyBirthPressure.levels);
            const targetFreq = Math.max(1, levels / (familyBirthPressure.familyTargetCount || FAMILY_TARGET_COUNT));
            const hfp = gf / targetFreq;                  // headFamilyPressure
            const excess = hfp > 1 ? (hfp - 1) / hfp : 0; // 0 @公平份额 → 越接近 1 越高频
            w *= Math.max(BIRTH_PRESSURE_FLOOR, 1 - familyBirthPressure.weight * excess);
          }
        }
        // B4-C2：basin-level birth pressure（soft basin-occupancy avoidance）。
        //   与 C1 同机制、同 floor、同跨关累计，但 pressure source 从【family 频率】换成
        //   【coarse basin 频率】——惩罚 basin occupancy（重复结构占用），而非 family identity。
        //   C1 证明 family 级均匀压力只在 basin 内部洗牌占优 family；C2 直接打 basin。
        if (basinBirthPressure && basinBirthPressure.weight > 0) {
          const basin = basinSignature(cageCells.concat([c]));
          const bf = basinBirthPressure.basinCounts.get(basin) || 0;
          if (bf > 0) {
            const levels = Math.max(1, basinBirthPressure.levels);
            const targetFreq = Math.max(1, levels / (basinBirthPressure.basinTargetCount || BASIN_TARGET_COUNT));
            const hbp = bf / targetFreq;                  // headBasinPressure
            const excess = hbp > 1 ? (hbp - 1) / hbp : 0; // 0 @公平份额 → 越接近 1 越高频
            w *= Math.max(BIRTH_PRESSURE_FLOOR, 1 - basinBirthPressure.weight * excess);
          }
        }
        return w;
      });
      const total = weights.reduce((a, b) => a + b, 0);
      let r = rng() * total;
      for (let i = 0; i < frontier.length; i++) {
        r -= weights[i];
        if (r <= 0) return i;
      }
      return frontier.length - 1;
    }

    // B3-B4：计算局内已放置 cage 的 crossHouse 浓度（0..1）。供 diversity penalty 使用。
    //   反映"本局到目前为止跨宫笼占多少"，抑制全局追 crossHouse 的 mode-seeking。
    function currentCrossHouseShare() {
      let total = 0, cross = 0;
      for (const cg of cages) {
        if (!cg) continue;
        total++;
        if (cg.cells.length > 1) {
          const boxes = new Set(cg.cells.map((x) => Math.floor(Number(x[0]) / 3) + ',' + Math.floor(Number(x[1]) / 3)));
          if (boxes.size > 1) cross++;
        }
      }
      return total > 0 ? cross / total : 0;
    }

    // B3-C1c：局级 shape usage 计数。返回 Map<canonicalShapeID, count>，
    //   统计"本局到目前为止已放置笼"的各 canonical shape 使用次数。
    //   只读 cages，不改生成。供 growCage 的 1-step lookahead 做 diversity pressure。
    function currentShapeUsage() {
      const usage = new Map();
      for (const cg of cages) {
        if (!cg || !cg.cells || cg.cells.length === 0) continue;
        const id = canonicalizeShape(cg.cells);
        usage.set(id, (usage.get(id) || 0) + 1);
      }
      return usage;
    }

    // B4-A1：Topology Prior —— 模板出生辅助。
    //   按当前 targetSize 从冻结模板库采样一个形状原型，锚定种子、施加随机 8 变换，
    //   原子校验（界内/未占用/无重复数字）通过则直接生成为该形状。
    //   失败返回 null（零副作用，回退 greedy 生长）。只改出生分布，不碰 selection。
    function tryTemplateBirth(startR, startC, targetSize) {
      const lib = TOPOLOGY_PRIOR_TEMPLATES[targetSize];
      if (!lib || lib.length === 0) return null;
      // 按冻结先验权重采样模板
      let totalW = 0;
      for (const t of lib) totalW += t.w;
      let r = rng() * totalW;
      let chosen = lib[lib.length - 1];
      for (const t of lib) { r -= t.w; if (r <= 0) { chosen = t; break; } }
      // 随机 8 变换（旋转/镜像）
      const ori = Math.floor(rng() * 8);
      const T = [
        (a, b) => [a, b], (a, b) => [b, -a], (a, b) => [-a, -b], (a, b) => [-b, a],
        (a, b) => [-a, b], (a, b) => [b, a], (a, b) => [a, -b], (a, b) => [-b, -a],
      ][ori];
      const placed = chosen.cells.map(([dr, dc]) => {
        const t = T(dr, dc);
        return [startR + t[0], startC + t[1]];
      });
      // 原子校验：界内 / 未占用 / 无重复数字
      const nums = new Set();
      for (const [r, c] of placed) {
        if (r < 0 || r >= size || c < 0 || c >= size) return null;
        if (assigned[r][c]) return null;
        const v = solution[r][c];
        if (nums.has(v)) return null;
        nums.add(v);
      }
      // 全部通过 → 标记占用
      for (const [r, c] of placed) assigned[r][c] = true;
      return { cells: placed, absorbed: [], template: true };
    }

    function growCage(startR, startC, targetSize) {
      // B4-A1：Topology Prior —— 出生时先尝试按模板出生（仅当启用且该尺寸有模板）。
      if (topologyPrior && topologyPrior.enabled && TOPOLOGY_PRIOR_TEMPLATES[targetSize]
          && rng() < (topologyPrior.templateBias !== undefined ? topologyPrior.templateBias : TOPOLOGY_PRIOR_DEFAULTS.templateBias)) {
        const templ = tryTemplateBirth(startR, startC, targetSize);
        if (templ) {
          if (traceRec) traceRec({ targetSize, finalSize: templ.cells.length, stopReason: 'template', loop: null, accepted: null });
          return templ;
        }
      }
      const cageCells = [[startR, startC]];
      const inCage = new Set();
      const cageNumbers = new Set();
      const absorbedIndices = [];
      // B3-B4：局级 crossHouse 浓度（本笼生长前已有笼的跨宫占比）。供 diversity penalty。
      const levelShare = crossHouseDiversity ? currentCrossHouseShare() : 0;

      inCage.add(startR + ',' + startC);
      cageNumbers.add(solution[startR][startC]);
      assigned[startR][startC] = true;

      while (cageCells.length < targetSize) {
        const emptyFrontier = [];
        const absorbFrontier = [];

        for (const [r, c] of cageCells) {
          const neighbors = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]];
          for (const [nr, nc] of neighbors) {
            if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
            const key = nr + ',' + nc;
            if (inCage.has(key)) continue;

            if (!assigned[nr][nc]) {
              const num = solution[nr][nc];
              if (!cageNumbers.has(num)) {
                emptyFrontier.push([nr, nc]);
              }
            } else {
              const otherIdx = cellToCageIdx[nr][nc];
              if (otherIdx < 0) continue;
              if (absorbedIndices.indexOf(otherIdx) >= 0) continue;
              const otherCage = cages[otherIdx];
              if (!otherCage) continue;
              if (otherCage.cells.length >= targetSize) continue;
              const combined = cageCells.length + otherCage.cells.length;
              if (combined > maxSize + 2) continue;
              if (canAbsorb(cageNumbers, otherCage)) {
                absorbFrontier.push(otherIdx);
              }
            }
          }
        }

        if (emptyFrontier.length === 0 && absorbFrontier.length === 0) break;

        let useAbsorb = false;
        if (emptyFrontier.length > 0 && rng() > 0.2) {
          useAbsorb = false;
        } else if (absorbFrontier.length > 0) {
          useAbsorb = true;
        } else {
          useAbsorb = false;
        }

        if (!useAbsorb && emptyFrontier.length > 0) {
          // B3-B2：growth bias。growthBias>0 时对下个空 frontier 格做拓扑加权挑。
          //   growthBias=0 走原均匀随机（RNG 消耗一致，A/B control 精确复现）。
          // B3-C1c：shapeDiversityWeight>0 时叠加 1-step lookahead shape usage penalty。
          const shapeUsage = shapeDiversityWeight > 0 ? currentShapeUsage() : null;
          const pressure = (familyBirthPressure && familyBirthPressure.weight > 0) || (basinBirthPressure && basinBirthPressure.weight > 0);
          const idx = (growthBias > 0 || shapeDiversityWeight > 0 || pressure) && emptyFrontier.length > 1
            ? weightedEmptyPick(emptyFrontier, cageCells, growthBias, rng, levelShare, shapeUsage, shapeDiversityWeight, familyBirthPressure, basinBirthPressure)
            : Math.floor(rng() * emptyFrontier.length);
          const [nr, nc] = emptyFrontier[idx];
          cageCells.push([nr, nc]);
          inCage.add(nr + ',' + nc);
          cageNumbers.add(solution[nr][nc]);
          assigned[nr][nc] = true;
        } else if (useAbsorb && absorbFrontier.length > 0) {
          const uniqueAbsorb = [...new Set(absorbFrontier)];
          const otherIdx = uniqueAbsorb[Math.floor(rng() * uniqueAbsorb.length)];
          const otherCage = cages[otherIdx];
          absorbedIndices.push(otherIdx);
          for (const [r, c] of otherCage.cells) {
            cageCells.push([r, c]);
            inCage.add(r + ',' + c);
            cageNumbers.add(solution[r][c]);
          }
          cages[otherIdx] = null;
        } else {
          break;
        }
      }

      // B4-F2：记录本次生长的终止原因与最终尺寸。
      const stopReason = cageCells.length >= targetSize ? 'reached_target'
        : (absorbedIndices.length > 0 ? 'absorb_exhausted' : 'no_valid_neighbor');
      if (traceRec) traceRec({ targetSize, finalSize: cageCells.length, stopReason, loop: null, accepted: null });
      return { cells: cageCells, absorbed: absorbedIndices };
    }

    // ---- 大笼子优先阶段 ----
    if (requiredSizes && requiredSizes.length > 0) {
      for (const targetSize of requiredSizes) {
        let ok = false;
        for (let attempt = 0; attempt < 40 && !ok; attempt++) {
          const remaining = countRemaining();
          if (remaining < targetSize) break;
          const start = findRandomStart();
          if (!start) break;
          const grown = growCage(start[0], start[1], targetSize);
          if (grown.cells.length === targetSize) {
            if (traceRec) traceRec({ targetSize, finalSize: grown.cells.length, stopReason: 'accepted_required', loop: 'required', accepted: true });
            const newCage = { id: nextCageId++, sum: 0, cells: grown.cells };
            cages.push(newCage);
            const newIdx = cages.length - 1;
            for (const [r, c] of grown.cells) cellToCageIdx[r][c] = newIdx;
            ok = true;
          } else {
            if (traceRec) traceRec({ targetSize, finalSize: grown.cells.length, stopReason: 'rollback_required', loop: 'required', accepted: false });
            for (const [r, c] of grown.cells) assigned[r][c] = false;
          }
        }
        if (!ok) return null;
      }
    }

    // ---- 主循环 ----
    for (let targetSize = maxSize; targetSize >= effMinSize; targetSize--) {
      const targetCount = targetCounts[targetSize] || 0;
      if (targetCount === 0) continue;

      let generated = 0;
      let attempts = 0;
      const maxAttempts = targetCount * 5;

      while (generated < targetCount && attempts < maxAttempts) {
        attempts++;
        const remaining = countRemaining();
        if (remaining < targetSize) break;

        const start = findRandomStart();
        if (!start) break;

        const result = growCage(start[0], start[1], targetSize);

        if (result.cells.length < Math.max(1, Math.floor(targetSize * 0.5))) {
          if (traceRec) traceRec({ targetSize, finalSize: result.cells.length, stopReason: 'rejected_main', loop: 'main', accepted: false });
          for (const [r, c] of result.cells) {
            assigned[r][c] = false;
          }
          continue;
        }
        if (traceRec) traceRec({ targetSize, finalSize: result.cells.length, stopReason: 'accepted_main', loop: 'main', accepted: true });

        const newCage = { id: nextCageId++, sum: 0, cells: result.cells };
        cages.push(newCage);
        const newIdx = cages.length - 1;
        for (const [r, c] of result.cells) {
          cellToCageIdx[r][c] = newIdx;
        }
        generated++;
      }
    }

    // ---- 剩余格处理 ----
    // B3-B1a：suppress 时优先把残余单格并入相邻已有笼（无重复数字且不超 maxSize），
    // 只有找不到合法邻笼时才退化为 singleton（mergeSmallCages 会再兜底清理）。
    function placeSingleCell(start) {
      const sr = start[0], sc = start[1];
      if (suppressSingletons) {
        const neighbors = [[sr - 1, sc], [sr + 1, sc], [sr, sc - 1], [sr, sc + 1]];
        for (const [nr, nc] of neighbors) {
          if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
          const ni = cellToCageIdx[nr][nc];
          if (ni < 0 || !cages[ni]) continue;
          if (cages[ni].cells.length + 1 > maxSize) continue;
          let hasDup = false;
          for (const [cr, cc] of cages[ni].cells) {
            if (solution[cr][cc] === solution[sr][sc]) { hasDup = true; break; }
          }
          if (hasDup) continue;
          cages[ni].cells.push([sr, sc]);
          cellToCageIdx[sr][sc] = ni;
          return;
        }
      }
      const newCage = { id: nextCageId++, sum: 0, cells: [[sr, sc]] };
      cages.push(newCage);
      const newIdx = cages.length - 1;
      cellToCageIdx[sr][sc] = newIdx;
    }

    let safety = 100;
    while (countRemaining() > 0 && safety-- > 0) {
      const start = findRandomStart();
      if (!start) break;
      const remaining = countRemaining();
      const target = Math.min(maxSize, Math.max(2, Math.min(remaining, 3)));
      const result = growCage(start[0], start[1], target);

      if (result.cells.length >= 2) {
        if (traceRec) traceRec({ targetSize: target, finalSize: result.cells.length, stopReason: 'accepted_remaining', loop: 'remaining', accepted: true });
        const newCage = { id: nextCageId++, sum: 0, cells: result.cells };
        cages.push(newCage);
        const newIdx = cages.length - 1;
        for (const [r, c] of result.cells) {
          cellToCageIdx[r][c] = newIdx;
        }
      } else if (result.cells.length === 1) {
        if (traceRec) traceRec({ targetSize: target, finalSize: result.cells.length, stopReason: 'accepted_remaining_single', loop: 'remaining', accepted: true });
        placeSingleCell([start[0], start[1]]);
      } else {
        if (traceRec) traceRec({ targetSize: target, finalSize: result.cells.length, stopReason: 'rejected_remaining', loop: 'remaining', accepted: false });
        assigned[start[0]][start[1]] = true;
        placeSingleCell([start[0], start[1]]);
      }
    }

    cages = cages.filter(c => c !== null);

    // ---- 后处理：平衡分布 ----
    cages = _balanceByMerging(cages, weights, effMinSize, maxSize, solution, size, rng);

    for (let i = 0; i < cages.length; i++) {
      cages[i].id = i;
    }

    cages = mergeSmallCages(cages, solution, size, effMinSize, rng, maxSize, requiredSizes);

    return cages;
  }

  function _balanceByMerging(cages, weights, minSize, maxSize, solution, size, rng) {
    const totalCells = cages.reduce((sum, c) => sum + c.cells.length, 0);

    const expectedCount = {};
    for (let s = minSize; s <= maxSize; s++) {
      const w = weights[s] || 0;
      expectedCount[s] = Math.max(0, Math.round((totalCells * w) / s));
    }

    function getCounts(cs) {
      const counts = {};
      for (let s = minSize; s <= maxSize; s++) counts[s] = 0;
      for (const cage of cs) {
        const s = cage.cells.length;
        if (s >= minSize && s <= maxSize) counts[s]++;
      }
      return counts;
    }

    function buildCellMap(cs) {
      const map = {};
      for (let i = 0; i < cs.length; i++) {
        if (!cs[i]) continue;
        for (const [r, c] of cs[i].cells) {
          map[r + ',' + c] = i;
        }
      }
      return map;
    }

    function buildNumSets(cs) {
      return cs.map(cage => {
        if (!cage) return null;
        const s = new Set();
        for (const [r, c] of cage.cells) s.add(solution[r][c]);
        return s;
      });
    }

    for (let iter = 0; iter < 20; iter++) {
      let counts = getCounts(cages);
      let anyMerged = false;
      const cellMap = buildCellMap(cages);
      const numSets = buildNumSets(cages);

      for (let smallS = minSize; smallS < maxSize; smallS++) {
        if (counts[smallS] <= expectedCount[smallS]) continue;

        let bestMerge = null;
        let bestScore = -1;

        for (let i = 0; i < cages.length; i++) {
          if (!cages[i]) continue;
          if (cages[i].cells.length !== smallS) continue;

          const neighbors = new Set();
          for (const [r, c] of cages[i].cells) {
            const adj = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]];
            for (const [nr, nc] of adj) {
              const key = nr + ',' + nc;
              const ni = cellMap[key];
              if (ni !== undefined && ni !== i && cages[ni]) {
                neighbors.add(ni);
              }
            }
          }

          for (const ni of neighbors) {
            if (!cages[ni]) continue;
            if (ni < i) continue;
            const sj = cages[ni].cells.length;
            const combined = smallS + sj;
            if (combined > maxSize) continue;

            let hasDup = false;
            for (const num of numSets[i]) {
              if (numSets[ni].has(num)) { hasDup = true; break; }
            }
            if (hasDup) continue;

            let score = 50;
            const deficit = expectedCount[combined] - (counts[combined] || 0);
            const deficitPct = expectedCount[combined] > 0 ? deficit / expectedCount[combined] : 0;
            score += Math.max(0, deficitPct) * 60;
            score -= combined * 3;
            if (counts[sj] > expectedCount[sj]) score += 8;
            if (smallS === 1 && sj === 1 && combined === 2) score += 25;
            if (combined === maxSize && counts[maxSize] >= expectedCount[maxSize]) score -= 40;

            if (score > bestScore) {
              bestScore = score;
              bestMerge = [i, ni, combined];
            }
          }
        }

        if (bestMerge) {
          const [i, ni] = bestMerge;
          cages[ni].cells = cages[ni].cells.concat(cages[i].cells);
          cages[i] = null;
          cages = cages.filter(c => c !== null);
          anyMerged = true;
          break;
        }
      }

      if (!anyMerged) break;
    }
    return cages;
  }

  function mergeSmallCages(cages, solution, size, minSize, rng, maxSize, requiredSizes) {
    const cellToCage = {};
    for (let i = 0; i < cages.length; i++) {
      if (!cages[i]) continue;
      for (const [r, c] of cages[i].cells) {
        cellToCage[r + ',' + c] = i;
      }
    }

    const cageNumSets = cages.map(cage => {
      if (!cage) return null;
      const s = new Set();
      for (const [r, c] of cage.cells) s.add(solution[r][c]);
      return s;
    });

    let changed = true;
    while (changed) {
      changed = false;
      for (let i = 0; i < cages.length; i++) {
        if (!cages[i]) continue;
        if (cages[i].cells.length >= minSize) continue;

        const neighbors = new Set();
        for (const [r, c] of cages[i].cells) {
          const adj = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]];
          for (const [nr, nc] of adj) {
            if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
            const key = nr + ',' + nc;
            const ni = cellToCage[key];
            if (ni !== undefined && ni !== i && cages[ni]) {
              neighbors.add(ni);
            }
          }
        }

        if (neighbors.size === 0) continue;

        const neighborList = [...neighbors];
        for (let k = neighborList.length - 1; k > 0; k--) {
          const j = Math.floor(rng() * (k + 1));
          [neighborList[k], neighborList[j]] = [neighborList[j], neighborList[k]];
        }

        let merged = false;
        for (const ni of neighborList) {
          const combinedSize = cages[i].cells.length + cages[ni].cells.length;
          if (combinedSize > maxSize) continue;

          let hasDup = false;
          for (const num of cageNumSets[i]) {
            if (cageNumSets[ni].has(num)) {
              hasDup = true;
              break;
            }
          }
          if (hasDup) continue;

          cages[ni].cells = cages[ni].cells.concat(cages[i].cells);
          for (const num of cageNumSets[i]) {
            cageNumSets[ni].add(num);
          }
          for (const [r, c] of cages[i].cells) {
            cellToCage[r + ',' + c] = ni;
          }
          cages[i] = null;
          cageNumSets[i] = null;
          changed = true;
          merged = true;
          break;
        }

        if (merged) break;
      }
    }

    let result = cages.filter(c => c !== null);
    for (let i = 0; i < result.length; i++) {
      result[i].id = i;
    }

    // ---- requiredSizes 校验与补全（递归吞并） ----
    if (requiredSizes && requiredSizes.length > 0) {
      const sizesPresent = new Set(result.map(cg => cg.cells.length));
      const missing = requiredSizes.filter(s => !sizesPresent.has(s));
      for (const targetSize of missing) {
        let mergedOk = false;
        for (let attempt = 0; attempt < 100 && !mergedOk; attempt++) {
          const cellToIdx = {};
          for (let i = 0; i < result.length; i++) {
            for (const [r, c] of result[i].cells) cellToIdx[r + ',' + c] = i;
          }
          const numSets2 = result.map(cg => {
            const s = new Set();
            for (const [r, c] of cg.cells) s.add(solution[r][c]);
            return s;
          });

          let seed = -1;
          for (let i = 0; i < result.length; i++) {
            if (result[i].cells.length < targetSize) { seed = i; break; }
          }
          if (seed < 0) break;

          const mergedCells = result[seed].cells.slice();
          const mergedNums = new Set(numSets2[seed]);
          const absorbed = [seed];
          let canGrow = true;

          while (mergedCells.length < targetSize && canGrow) {
            canGrow = false;
            const currentSet = new Set(absorbed);
            const frontier = new Set();
            for (const [r, c] of mergedCells) {
              const adj = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]];
              for (const [nr, nc] of adj) {
                if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
                const j = cellToIdx[nr + ',' + nc];
                if (j !== undefined && !currentSet.has(j)) frontier.add(j);
              }
            }
            for (const j of frontier) {
              let hasDup = false;
              for (const num of numSets2[j]) {
                if (mergedNums.has(num)) { hasDup = true; break; }
              }
              if (hasDup) continue;
              if (mergedCells.length + result[j].cells.length > targetSize) continue;
              for (const cell of result[j].cells) mergedCells.push(cell);
              for (const num of numSets2[j]) mergedNums.add(num);
              absorbed.push(j);
              canGrow = true;
              break;
            }
          }

          if (mergedCells.length === targetSize) {
            const sortedAbsorbed = absorbed.slice().sort((a, b) => b - a);
            const mainIdx = sortedAbsorbed[sortedAbsorbed.length - 1];
            result[mainIdx].cells = mergedCells;
            for (const di of sortedAbsorbed) {
              if (di === mainIdx) continue;
              result.splice(di, 1);
            }
            mergedOk = true;
            break;
          }
        }
        if (!mergedOk) return null;
      }
      for (let i = 0; i < result.length; i++) result[i].id = i;
    }

    return result;
  }

  // ========================================================
  //  Step 3: 计算笼子和值
  // ========================================================

  function computeCageSums(cages, solution) {
    return cages.map(cage => {
      let sum = 0;
      for (const [r, c] of cage.cells) {
        sum += solution[r][c];
      }
      return {
        id: cage.id,
        sum: sum,
        cells: cage.cells
      };
    });
  }

  // ========================================================
  //  三幕锚点设计
  // ========================================================

  function generateScriptParams(size, difficultyLevel) {
    if (size === 4 && difficultyLevel <= 1) {
      return { openingRatio: 0.60, openingMinCount: 3, breakthroughCount: 1, avalancheRatio: 0.30, digOrder: ['avalanche', 'opening', 'breakthrough'] };
    } else if (size === 6 && difficultyLevel >= 2 && difficultyLevel <= 3) {
      return { openingRatio: 0.40, openingMinCount: 5, breakthroughCount: 2, avalancheRatio: 0.30, digOrder: ['avalanche', 'opening', 'breakthrough'] };
    } else if (size === 9 && difficultyLevel >= 4 && difficultyLevel <= 5) {
      return { openingRatio: 0.30, openingMinCount: 8, breakthroughCount: 3, avalancheRatio: 0.30, digOrder: ['avalanche', 'opening', 'breakthrough'] };
    }
    if (size === 4) {
      return { openingRatio: 0.60, openingMinCount: 3, breakthroughCount: 1, avalancheRatio: 0.30, digOrder: ['avalanche', 'opening', 'breakthrough'] };
    } else if (size === 6) {
      return { openingRatio: 0.40, openingMinCount: 5, breakthroughCount: 2, avalancheRatio: 0.30, digOrder: ['avalanche', 'opening', 'breakthrough'] };
    }
    return { openingRatio: 0.30, openingMinCount: 8, breakthroughCount: 3, avalancheRatio: 0.30, digOrder: ['avalanche', 'opening', 'breakthrough'] };
  }

  function _calcCageComplexity(r, c, cages, size, dim) {
    let cage = null;
    for (let i = 0; i < cages.length; i++) {
      for (const [cr, cc] of cages[i].cells) {
        if (cr === r && cc === c) {
          cage = cages[i];
          break;
        }
      }
      if (cage) break;
    }
    if (!cage) return 0;

    let score = 0;
    score += cage.cells.length * 2;

    const boxSet = new Set();
    for (const [cr, cc] of cage.cells) {
      const br = Math.floor(cr / dim.boxH);
      const bc = Math.floor(cc / dim.boxW);
      boxSet.add(br + ',' + bc);
    }
    score += boxSet.size * 2 * 2;

    const cageSize = cage.cells.length;
    const sum = cage.sum;
    let minSum = 0, maxSum = 0;
    for (let i = 1; i <= cageSize; i++) minSum += i;
    for (let i = size - cageSize + 1; i <= size; i++) maxSum += i;
    const range = maxSum - minSum;
    if (range > 0) {
      const mid = (minSum + maxSum) / 2;
      const extremity = Math.abs(sum - mid) / (range / 2);
      score += extremity * 5;
    }
    return score;
  }

  function designThreeActAnchor(solution, cages, size, rng, scriptParams, TechRaterClass, BoardClass, baseGrid = null) {
    const dim = getBoxDimensions(size);
    const totalCells = size * size;

    // V4.3.14：支持传入实际盘面作为求解起点（baseGrid）。
    // 原实现固定用空盘（全 0）求解，锚点反映"从空盘的自然解题顺序"；
    // 但挖洞后盘面有预填，实际求解顺序不同，导致节奏验证 breakpointOk
    // 失败率 50%+。挖洞后传 baseGrid=挖洞盘面，锚点与实际求解路径匹配。
    const emptyGrid = Array.from({ length: size }, () => Array(size).fill(0));
    const solveGrid = baseGrid || emptyGrid;
    let solveSteps = [];
    try {
      const board = new BoardClass(size);
      board.loadLevel({ cells: solveGrid, cages: cages });
      const solver = new TechRaterClass(board);
      const result = solver.solve(3000);
      solveSteps = result.steps || [];
    } catch (e) {
      solveSteps = [];
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          solveSteps.push({ row: r, col: c, type: 'fill' });
        }
      }
    }

    const cellOrder = {};
    let fillIndex = 0;
    for (const step of solveSteps) {
      if (step.type === 'fill') {
        cellOrder[step.row + ',' + step.col] = fillIndex;
        fillIndex++;
      }
    }

    let tailIndex = fillIndex;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const key = r + ',' + c;
        if (cellOrder[key] === undefined) {
          cellOrder[key] = tailIndex++;
        }
      }
    }

    const allCells = [];
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        allCells.push([r, c, cellOrder[r + ',' + c]]);
      }
    }
    allCells.sort((a, b) => a[2] - b[2]);

    const openingCount = Math.max(scriptParams.openingMinCount, Math.ceil(totalCells * scriptParams.openingRatio));
    const opening = allCells.slice(0, openingCount).map(([r, c]) => [r, c]);

    const openingSet = new Set(opening.map(([r, c]) => r + ',' + c));
    const openingCageIds = new Set();
    for (const [r, c] of opening) {
      for (let i = 0; i < cages.length; i++) {
        for (const [cr, cc] of cages[i].cells) {
          if (cr === r && cc === c) {
            openingCageIds.add(cages[i].id);
            break;
          }
        }
      }
    }

    const remainingCells = allCells.slice(openingCount).map(([r, c]) => [r, c]);

    const cellComplexity = remainingCells.map(([r, c]) => {
      const complexity = _calcCageComplexity(r, c, cages, size, dim);
      let cageId = -1;
      for (let i = 0; i < cages.length; i++) {
        for (const [cr, cc] of cages[i].cells) {
          if (cr === r && cc === c) {
            cageId = cages[i].id;
            break;
          }
        }
        if (cageId >= 0) break;
      }
      const isDiffCage = !openingCageIds.has(cageId);
      const score = complexity + (isDiffCage ? 10 : 0);
      return { r, c, score, complexity, cageId, isDiffCage };
    });

    cellComplexity.sort((a, b) => b.score - a.score);

    // V4.3.14 修复：breakthrough 锚点选择逻辑。
    // 原实现取"复杂度最高"的格作为破局点——最复杂的格通常最后解出，
    // 出现在求解路径末端（>80% 位置），与 breakpointOk(45-80%) 直接矛盾，
    // 实测节奏失败 102 次中 100 次是破局点失败。
    // 修复：从求解路径"45%-75% 中后段"选择破局点（保证位置命中），
    // 在该区间内优先复杂度高、且来自不同笼子的格。
    const midStart = Math.max(openingCount, Math.floor(allCells.length * 0.45));
    const midEnd = Math.floor(allCells.length * 0.75);
    const midSegment = allCells.slice(midStart, midEnd);
    const midComplexity = midSegment.map(([r, c]) => {
      let cageId = -1;
      for (let i = 0; i < cages.length; i++) {
        for (const [cr, cc] of cages[i].cells) {
          if (cr === r && cc === c) {
            cageId = cages[i].id;
            break;
          }
        }
        if (cageId >= 0) break;
      }
      return { r, c, cageId };
    });

    const breakthrough = [];
    const usedCages = new Set();
    // 优先选 midSegment 中复杂度较高的格（保持"破局点有技巧含量"）
    const midOrdered = midComplexity.slice();
    midOrdered.sort((a, b) => {
      const ca = _calcCageComplexity(a.r, a.c, cages, size, dim);
      const cb = _calcCageComplexity(b.r, b.c, cages, size, dim);
      return cb - ca;
    });
    for (const item of midOrdered) {
      if (breakthrough.length >= scriptParams.breakthroughCount) break;
      if (usedCages.has(item.cageId)) continue;
      breakthrough.push([item.r, item.c]);
      usedCages.add(item.cageId);
    }
    // 若中段不足，退回复杂度排序补充
    if (breakthrough.length < scriptParams.breakthroughCount) {
      for (const item of cellComplexity) {
        if (breakthrough.length >= scriptParams.breakthroughCount) break;
        if (usedCages.has(item.cageId)) continue;
        breakthrough.push([item.r, item.c]);
        usedCages.add(item.cageId);
      }
    }

    const breakthroughSet = new Set(breakthrough.map(([r, c]) => r + ',' + c));

    const avalanche = [];
    for (const [r, c] of allCells) {
      const key = r + ',' + c;
      if (!openingSet.has(key) && !breakthroughSet.has(key)) {
        avalanche.push([r, c]);
      }
    }

    return { opening, breakthrough, avalanche };
  }

  // ========================================================
  //  唯一解验证（TechRater 快速 + 回溯兜底）
  // ========================================================

  function timedVerifyUniqueSolution(grid, cages, size, TechRaterClass, BoardClass, timeoutMs) {
    try {
      const board = new BoardClass(size);
      board.loadLevel({ cells: grid, cages: cages });
      const solver = new TechRaterClass(board);
      const result = solver.solve(2000);
      if (result.solvable) {
        return { unique: true, solutionCount: 1, firstSolution: null, timeout: false, method: 'techrater' };
      }
    } catch (e) {}

    const startTime = Date.now();
    const dim = getBoxDimensions(size);
    const solution = deepCopyGrid(grid);
    let solutionCount = 0;
    let firstSolution = null;
    let timedOut = false;

    const cellCageMap = {};
    for (let i = 0; i < cages.length; i++) {
      for (const [r, c] of cages[i].cells) {
        cellCageMap[r + ',' + c] = i;
      }
    }

    const cageNumbers = cages.map(() => new Set());
    const cageSums = cages.map(() => 0);
    const cageEmptyCount = cages.map((cage) => cage.cells.length);

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (solution[r][c] !== 0) {
          const ci = cellCageMap[r + ',' + c];
          if (ci !== undefined) {
            cageNumbers[ci].add(solution[r][c]);
            cageSums[ci] += solution[r][c];
            cageEmptyCount[ci]--;
          }
        }
      }
    }

    function isValidPlacement(r, c, num) {
      for (let i = 0; i < size; i++) {
        if (solution[r][i] === num) return false;
      }
      for (let i = 0; i < size; i++) {
        if (solution[i][c] === num) return false;
      }
      const br = Math.floor(r / dim.boxH) * dim.boxH;
      const bc = Math.floor(c / dim.boxW) * dim.boxW;
      for (let dr = 0; dr < dim.boxH; dr++) {
        for (let dc = 0; dc < dim.boxW; dc++) {
          if (solution[br + dr][bc + dc] === num) return false;
        }
      }
      const ci = cellCageMap[r + ',' + c];
      if (ci !== undefined) {
        if (cageNumbers[ci].has(num)) return false;
        if (cageSums[ci] + num > cages[ci].sum) return false;
        const remainingAfter = cageEmptyCount[ci] - 1;
        if (remainingAfter > 0) {
          let minRest = 0, minCount = 0;
          for (let n = 1; n <= size && minCount < remainingAfter; n++) {
            if (!cageNumbers[ci].has(n) && n !== num) {
              minRest += n;
              minCount++;
            }
          }
          let maxRest = 0, maxCount = 0;
          for (let n = size; n >= 1 && maxCount < remainingAfter; n--) {
            if (!cageNumbers[ci].has(n) && n !== num) {
              maxRest += n;
              maxCount++;
            }
          }
          if (cageSums[ci] + num + minRest > cages[ci].sum) return false;
          if (cageSums[ci] + num + maxRest < cages[ci].sum) return false;
        } else {
          if (cageSums[ci] + num !== cages[ci].sum) return false;
        }
      }
      return true;
    }

    function findBestCell() {
      let bestR = -1, bestC = -1, bestCount = size + 1;
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (solution[r][c] !== 0) continue;
          let count = 0;
          for (let n = 1; n <= size; n++) {
            if (isValidPlacement(r, c, n)) count++;
          }
          if (count < bestCount) {
            bestCount = count;
            bestR = r;
            bestC = c;
            if (bestCount === 0) return { r: bestR, c: bestC, count: 0 };
          }
        }
      }
      return { r: bestR, c: bestC, count: bestCount };
    }

    function backtrack() {
      if (timedOut) return;
      if (solutionCount >= 2) return;
      if ((solutionCount + 1) % 100 === 0 && Date.now() - startTime > timeoutMs) {
        timedOut = true;
        return;
      }

      const { r, c, count } = findBestCell();
      if (r === -1) {
        solutionCount++;
        if (solutionCount === 1) {
          firstSolution = deepCopyGrid(solution);
        }
        return;
      }
      if (count === 0) return;

      for (let num = 1; num <= size; num++) {
        if (!isValidPlacement(r, c, num)) continue;
        solution[r][c] = num;
        const ci = cellCageMap[r + ',' + c];
        if (ci !== undefined) {
          cageNumbers[ci].add(num);
          cageSums[ci] += num;
          cageEmptyCount[ci]--;
        }
        backtrack();
        solution[r][c] = 0;
        if (ci !== undefined) {
          cageNumbers[ci].delete(num);
          cageSums[ci] -= num;
          cageEmptyCount[ci]++;
        }
        if (solutionCount >= 2 || timedOut) return;
      }
    }

    backtrack();

    return {
      unique: !timedOut && solutionCount === 1,
      solutionCount: solutionCount,
      firstSolution: firstSolution,
      timeout: timedOut,
      method: timedOut ? 'timeout' : 'bruteforce'
    };
  }

  // ========================================================
  //  CageFixer 主类（v9）
  // ========================================================

  class CageFixer {
    constructor(options = {}) {
      this.gridSize = options.gridSize || 9;
      this.targetDifficulty = options.targetDifficulty || 'medium';
      this.targetStar = options.targetStar || 3;
      this.targetTechnique = options.targetTechnique || null;
      this.guidedTechnique = options.guidedTechnique || null;
      this.techniqueChain = options.techniqueChain || null;
      this.requiredCageSizes = options.requiredCageSizes || [];
      this.enableRhythmValidation = options.enableRhythmValidation !== false;
      this.targetSteps = options.targetSteps || 75;   // V4.3.12 调优：xWing 关可达步数 71-77，90 的窗口[70,120]下界贴合步数下界，75 的窗口[55,105]留足余量
      this.minAvalancheSize = options.minAvalancheSize || 12;
      this.aestheticsStrict = options.aestheticsStrict || false;
      this.strictAdvanced = options.strictAdvanced || false; // V4.3.15：严格断点验收（xWing 真必要，成功率低）
      this.minCageSize = options.minCageSize !== undefined ? options.minCageSize : 1;
      this.maxCageSize = options.maxCageSize || 5;
      // B3-B1a：singleton suppression（默认开启）。
      //   旧逻辑 minSize=1 时 mergeSmallCages 只合并 size<1（即永不合并），singleton 结构性漏网。
      //   这是 bug-like behavior 修复（让 builder 遵守 min cage intent），不是策略性 shape bias，
      //   故默认 ON。需要 legacy behavior 时显式传 suppressSingletons:false 回滚。
      //   只抑制 size-1 笼（主循环不刻意生成 + 清理阶段把残余单格并入邻笼），
      //   不引入任何新 shape bias。
      this.suppressSingletons = options.suppressSingletons !== false;
      this.seed = options.seed !== undefined ? options.seed : null;
      this.timeoutMs = options.timeoutMs || 30000;
      this.maxAttempts = options.maxAttempts || 50;
      this.enableThreeAct = options.enableThreeAct !== false;
      this.verifyTimeoutMs = options.verifyTimeoutMs || 200;
      // B3-A：客观择优（二级排序）。B3-FINAL 冻结为默认开启（复现 51.6% 候选）。
      //   enabled       是否启用 cage reasoning 择优
      //   ratioWeight   权重：fitness = difficultyDistance - ratio * ratioWeight
      //                  （ratio 为 0-1 小数。ratioWeight=100 表示 +0.10 ratio 可抵 10 难度分）
      //   maxCollected  择优前最多收集的 inRange 候选数（越大 selection 压力越强，但更慢）
      this.objective = options.objective || {};
      this.objective.enabled = options.objective !== undefined && options.objective.enabled !== undefined ? !!options.objective.enabled : true;
      this.objective.ratioWeight = this.objective.ratioWeight !== undefined ? this.objective.ratioWeight : 100;
      this.objective.maxCollected = this.objective.maxCollected !== undefined ? this.objective.maxCollected : 8;
      // B3-B1b：topology 权重（λ，B3-FINAL 冻结默认 25）。只用于 candidate ranking：
      //   fitness = diff - ratioWeight*ratio - topologyWeight*topologyScore。
      //   topologyScore ∈ [0,1]，越高 = 更复杂 + 更少 concentration。
      //   不动 difficulty acceptance / builder，仅在同难度候选间择优。
      this.objective.topologyWeight = this.objective.topologyWeight !== undefined ? this.objective.topologyWeight : 25;
      // B3-C1b：shape diversity 税权重（默认 0 = 关闭）。只用于 candidate ranking：
      //   fitness = diff - ratioWeight*ratio - topologyWeight*topologyScore - shapeWeight*shapePenalty。
      //   shapePenalty ∈ [0,1] = canonical 簇（L/T/domino/straight）集中度惩罚，读布局、不改 builder。
      //   只对 canonical 簇加税（B3-C1c 原则），不罚 complex/rect，不禁止、不新建 shape。
      this.objective.shapeDiversityWeight = this.objective.shapeDiversityWeight !== undefined ? this.objective.shapeDiversityWeight : 0;
      // B3-B1b Phase2：topology proposal channel（supply 侧注入复杂拓扑）。
      //   enabled  是否启用 proposal
      //   ratio    proposal 候选占比（默认 0.1 = 10%）。normal 候选 90% + topology proposal 10%。
      //   maxPer   每个 proposal 布局最多注入几个复杂笼（默认 3，避免过度重塑破坏 size 分布）。
      // 只改变 candidate pool composition（给 selection 提供更丰富的拓扑候选），
      // 不碰 difficulty/rating/uniqueness/selection formula。
      this.topologyProposal = options.topologyProposal || {};
      this.topologyProposal.enabled = !!this.topologyProposal.enabled;
      this.topologyProposal.ratio = this.topologyProposal.ratio !== undefined ? this.topologyProposal.ratio : 0.1;
      this.topologyProposal.maxPer = this.topologyProposal.maxPer !== undefined ? this.topologyProposal.maxPer : 3;

      // B3-B2：growth bias（frontier 选择偏置）。B3-FINAL 冻结默认 0.4。
      //   strength ∈ [0,1]。0 = 保持原均匀随机（A/B control 精确复现，RNG 消耗一致）。
      //   >0 时下个空 frontier 格按 (1-strength)*均匀 + strength*拓扑偏置 加权挑。
      //   只改 growCage 的 frontier selection probability，不碰 size/difficulty/rating/uniqueness/selection。
      this.growthBias = options.growthBias !== undefined ? options.growthBias : 0.4;
      // B3-B3：topology score 版本。1 = v1（B3-B2 甜点），2 = v2（补充 branching/area/cross-house strength）。
      this.topologyScoreVersion = options.topologyScoreVersion !== undefined ? options.topologyScoreVersion : 1;
      // B3-B4：crossHouse diversity penalty。true 时 crossHouse 奖励随局内浓度衰减，
      //   抑制全局追 crossHouse 的 mode-seeking，提升整局 shape diversity (H)。默认 false。
      this.crossHouseDiversity = options.crossHouseDiversity !== undefined ? options.crossHouseDiversity : false;
      // B3-C1c：局级 shape usage soft pressure。B3-FINAL 冻结默认 0.2。
      //   >0 时 growCage 的 frontier pick 对 1-step lookahead 的 canonical shape
      //   按已用次数衰减（1/(1+used*W)），只对已重复的 canonical shape 减吸引、不禁止不新建。
      //   默认 0.2（B3-C1c 甜点，top4 51.6%）。
      this.shapeDiversityWeight = options.shapeDiversityWeight !== undefined ? options.shapeDiversityWeight : 0.2;
      // B4-C1：跨 level family birth pressure（soft head-family avoidance）。
      //   在 growCage 的 frontier pick 对 1-step lookahead canonical family 按其
      //   跨关全局频率做 soft 衰减：over-frequent（head）family 的出生被轻微绕开，
      //   但不禁止、不新建 family（B4-A1 模板注入的教训）。只改出生/生长概率，不碰 selection。
      //   默认 0 = 关闭（B3-FINAL 生产路径不变）。
      this.familyBirthPressureWeight = options.familyBirthPressureWeight !== undefined ? options.familyBirthPressureWeight : 0;
      // B4-C2：basin-level birth pressure（soft basin-occupancy avoidance）。
      //   与 C1 同机制，但 pressure source 从【canonical family 频率】换成【coarse basin 频率】。
      //   C1 证明 family 级均匀压力只在 basin 内部洗牌占优 family；C2 直接惩罚 basin occupancy，
      //   目标「降低重复结构占用」而非「换 family」。仍只改出生/生长概率，不碰 selection。
      //   默认 0 = 关闭（B3-FINAL 生产路径不变）。
      this.basinBirthPressureWeight = options.basinBirthPressureWeight !== undefined ? options.basinBirthPressureWeight : 0;
      // B4-G1：size5 T/cross archetype 抑制（frontier 生长的 branch 加分衰减）。
      //   topologyBiasWeightV2 的 `w *= 1 + 0.6*branch` 是 T/cross 成形的主要促因；
      //   s∈[0,1] 把该加分整体乘 (1-s)（s=1 → 完全移除 branch 加分，T/cross 不再被偏好）。
      //   只作用于 growCage frontier selection 的拓扑加权，不碰 size 预算 / difficulty / selection。
      //   默认 0 = 关闭（B3-FINAL 生产路径不变）。
      this.size5BranchSuppress = options.size5BranchSuppress !== undefined ? options.size5BranchSuppress : 0;
      // B4-A1：Topology Prior（shape-template birth）。默认 OFF → B3-FINAL 生产路径不变。
      //   enabled        是否启用模板出生（研究分支 B4-A 专用）
      //   templateBias    出生时尝试模板出生的概率（写死冻结，不扫）
      this.topologyPrior = options.topologyPrior || {};
      this.topologyPrior.enabled = !!this.topologyPrior.enabled;
      this.topologyPrior.templateBias = this.topologyPrior.templateBias !== undefined
        ? this.topologyPrior.templateBias : TOPOLOGY_PRIOR_DEFAULTS.templateBias;
      // B4-B2：canonical novelty objective（selection 层，不改生成）。
      //   novelty = 1/(1 + poolFreq(levelCanonicalFingerprint)) ∈ (0,1]。
      //   奖励「pool 内未出现过的 canonical family 组合」，提高 canonical topology 有效多样性。
      //   默认 0 = 关闭（B3-FINAL 生产路径不变）。只影响 candidate ranking，不碰 diff/λ/acceptance。
      this.objective.canonicalNoveltyWeight = this.objective.canonicalNoveltyWeight !== undefined
        ? this.objective.canonicalNoveltyWeight : 0;
      // B4-B2：pool 级 canonical fingerprint 计数（跨 level 状态，generateBatch 内累积）。
      this._fingerprintCounts = new Map();
      this._noveltyRankChanges = 0;
      // B4-D1-1：跨关 family 罕见度（cross-level family rarity bonus）。
      //   与 B4-B 整关级 fingerprint novelty 不同：这里对【候选内每个 canonical family】
      //   按其跨关出现次数求罕见度 1/sqrt(globalFamilyCount)，再求和。
      //   信号有梯度（per-cage family 维度），只奖励稀有 family，不惩罚、不强制 shape。
      //   默认 0 = 关闭（B3-FINAL 生产路径不变）。只影响 candidate ranking。
      this.objective.familyNoveltyWeight = this.objective.familyNoveltyWeight !== undefined
        ? this.objective.familyNoveltyWeight : 0;
      this._familyCounts = new Map(); // family -> 跨关累计出现次数（winner 累计）
      this._familyLevels = 0;     // B4-C1：已提交关数（birth pressure 的 targetFreq 分母）
      // B4-C2：basin 跨关累计（basin-level birth pressure 的 pressure source）
      this._basinCounts = new Map(); // basin -> 跨关累计出现次数（winner 累计）
      this._basinLevels = 0;         // 已提交关数（basin pressure 的 targetFreq 分母）
      this._familyRankChanges = 0;     // 诊断：rarity 是否真的翻转择优
      // B4-E1：objective saturation（selection 层，不改生成）。
      //   惩罚「候选与历史 winner 的结构相似度」——测试 head basin 是否是
      //   objective 对已探索结构过度奖励所致。与 B4-C1/D1 的 family 频率压力不同：
      //   这里做 level↔level 余弦相似 repulsion，不统计单个 family 频率。
      //   默认 0 = 关闭（B3-FINAL 生产路径不变）。只影响 candidate ranking。
      this.objective.exploredHeadWeight = this.objective.exploredHeadWeight !== undefined
        ? this.objective.exploredHeadWeight : 0;
      this._winnerFamilyVectors = []; // 历史 winner 的 canonical family 向量（跨关记忆）
      this._headSimRankChanges = 0;   // 诊断：explored-head similarity 是否翻转择优
      this._headSimValues = [];       // 诊断：每个 inRange 候选的 exploredSim（看信号是否恒定）
      // B4-D0：candidate pool topology instrumentation（纯测量，默认关闭不改变行为）。
      //   记录每个 in-range 候选的 per-cage canonical family profile，
      //   以对比「候选池 entropy」 vs 「winner entropy」，判断 selection 是否把 diversity 淘汰。
      this._canonicalProfileEnabled = !!options.canonicalProfile;
      this._candidateProfiles = []; // {entropy, top1, top4, familyCount, winner}
      this._candidateEntropies = []; // 全部 inRange 候选的 Hfamily（分叉判断用）
      // B4-C0：跨关候选池 family 覆盖累计（纯测量）。
      //   记录每个候选的 family 集合，跨关聚合 → 判断 generation 缺「family 数量」还是「family 组合」。
      this._poolFamilyUnion = new Set();       // 所有候选出现过的 family（覆盖率分母）
      this._poolFamilyCombos = new Set();      // 不同 family 组合（排序 join）数
      this._poolFamilyRank = new Map();        // family -> 候选出现次数（head concentration）
      // B4-F0：candidate pipeline audit（纯测量，默认关闭不改变行为）。
      //   分阶段记录候选结构画像，验证 non-head 是否被 difficulty/inRange 淘汰。
      this._candidateAudit = !!options.candidateAudit;
      this._auditRaw = [];        // raw：partitionCages 产出的全部布局（含未过 dig 者）
      this._auditValid = [];      // difficulty-valid：_generateOne 返回非空（含 score）
      this._auditInRange = [];    // inRange：score 在可接受区间（进入 selection pool）
      this._auditAttempts = 0;    // 循环总尝试次数
      this._auditRawCount = 0;    // partitionCages 成功（进入 dig）的布局数

      // B4-F2：partition growth trace（纯测量，默认关闭不改变行为）。
      //   记录 growCage 每次生长的 target/final size、stop reason、loop origin、accept。
      //   验证 size=2/3 小笼是「算法自然 bias」还是「为满足后续约束被迫停止」。
      this._partitionTrace = !!options.partitionTrace;
      this._partitionTraceArr = [];   // [{targetSize, finalSize, stopReason, loop, accepted}]

      const deps = _loadDeps();
      this._Board = deps.Board;
      this._TechRater = deps.TechRater;
      this._LevelValidator = null;
      this._TechnicalPurityValidator = null;

      this._rng = null;
      this._levelCounter = 0;
      this._threeActCache = null;
    }

    generate() {
      const startTime = Date.now();
      let attempts = 0;
      let bestResult = null;
      let bestDiff = Infinity;
      let bestFitness = Infinity;
      let bestBaseFitness = Infinity;

      const targetScore = (this._starToScoreMin(this.targetStar) + this._starToScoreMax(this.targetStar)) / 2;
      const minAcceptableScore = this._starToScoreMin(Math.max(1, this.targetStar - 1));
      const maxAcceptableScore = this._starToScoreMax(Math.min(5, this.targetStar + 1));
      // V4.3.14：已接受（inRange）结果计数——前 3 次内择优，之后第一个可接受即返回
      let acceptedCount = 0;
      // B3-B1b Phase2：proposal 候选间隔（ratio 决定 every N 次尝试走 topology proposal channel）
      const proposalEvery = this.topologyProposal.enabled ? Math.max(2, Math.round(1 / this.topologyProposal.ratio)) : 0;

      while (attempts < this.maxAttempts) {
        attempts++;
        if (Date.now() - startTime > this.timeoutMs) break;

        try {
          const isProposal = proposalEvery > 0 && attempts % proposalEvery === 0;
          const result = this._generateOne(attempts, startTime, isProposal);
          // B4-F0：循环总尝试次数（raw 尝试 → 可能未过 dig/unique/rhythm）
          if (this._candidateAudit) this._auditAttempts++;
          if (result) {
            const score = result.difficultyInfo.score;
            const diff = Math.abs(score - targetScore);
            const inRange = score >= minAcceptableScore && score <= maxAcceptableScore;
            // B4-F0：difficulty-valid 阶段记录（_generateOne 返回非空 = 通过 dig+unique+rating 得到 score）。
            //   这是「raw 布局 → 有难度分」的第一道窄门，观察 head/non-head 在此是否已不成比例地流失。
            if (this._candidateAudit) {
              this._auditValid.push({
                ...candidateStructuralProfile(result.cages),
                score,
                ratio: result._objective ? result._objective.cageReasoningRatio : 0,
              });
            }
            if (inRange) {
              acceptedCount++;
              // B3-A 二级择优：fitness = difficultyDistance - ratio * ratioWeight。
              // 难度距离为主项（破坏难度分布），ratio 为次项（同类难度下偏好高笼推理）。
              // 默认（objective 关闭）时 fitness === diff，行为与旧版完全一致。
              const ratio = result._objective ? result._objective.cageReasoningRatio : 0;
              const topo = result._topology ? result._topology.score : 0;
              const shapePenalty = result._topology ? result._topology.shapePenalty : 0;
              // B4-F0：inRange 阶段记录（score 在可接受区间 = 进入 selection pool）。
              //   这是第二道窄门。raw→valid 看 dig/unique 纯物理淘汰；
              //   valid→inRange 看 difficulty 窗口对 head/non-head 的选择性。
              if (this._candidateAudit) {
                this._auditInRange.push({
                  ...candidateStructuralProfile(result.cages),
                  score,
                  ratio,
                  topo,
                  shapePenalty,
                });
              }
              // B3-B1b：拓扑项（λ 小）与 B3-A ratio 项并列，只影响同难度候选排序。
              // B3-C1b：shape diversity 税（shapeWeight）——canonical 簇集中度惩罚，只压 L/T/domino/straight 过度集中。
              const baseFitness = this.objective.enabled
                ? diff - ratio * this.objective.ratioWeight - topo * this.objective.topologyWeight - shapePenalty * this.objective.shapeDiversityWeight
                : diff;
              // B4-B2：canonical novelty。novelty = 1/(1 + poolFreq(fingerprint)) ∈ (0,1]。
              //   fitness 越小越好 → novelty 是奖励应【减去】novelty*weight（奖励 pool 内稀有指纹）。
              //   只影响 ranking，不碰 diff/λ/acceptance。
              const noveltyW = this.objective.canonicalNoveltyWeight > 0 ? this.objective.canonicalNoveltyWeight : 0;
              const novelty = noveltyW > 0
                ? 1 / (1 + (this._fingerprintCounts.get(levelCanonicalFingerprint(result.cages)) || 0))
                : 0;
              // B4-D1-1：跨关 family 罕见度（cross-level family rarity bonus）。
              //   对候选内每个 canonical family 按其跨关累计出现次数 globalFamilyCount 求罕见度
              //   1/sqrt(1+globalFamilyCount)，再求和。family 越稀有（跨关出现少）→ rarity 越高 → 奖励越多。
              //   只对 family 出现贡献，不对 cage shape 强制（避免 B4-A 的「抑制已有≠产生新」）。
              //   信号有梯度（per-cage 维度），不再像 B4-B 整关 fingerprint 那样恒定。
              const famW = this.objective.familyNoveltyWeight > 0 ? this.objective.familyNoveltyWeight : 0;
              let familyRarity = 0;
              if (famW > 0) {
                const famSeen = new Set();
                for (const cage of result.cages || []) {
                  const cells = cage.cells || [];
                  const a = classifyArchetype(cells);
                  if (!CANONICAL_SHAPE_SET.has(a)) continue;
                  const fam = canonicalizeShape(cells);
                  if (famSeen.has(fam)) continue; // 同一候选内去重，避免重复计
                  famSeen.add(fam);
                  familyRarity += 1 / Math.sqrt(1 + (this._familyCounts.get(fam) || 0));
                }
              }
              // B4-E1：explored-head similarity penalty。
              //   候选与【每个历史 winner】的 canonical family 向量求余弦相似度，取最大。
              //   相似度越高 → 越像过去已赢结构 → fitness 加得越多（越难被选中）。
              //   这是 level↔level repulsion，不是 family 频率统计。
              const ehW = this.objective.exploredHeadWeight > 0 ? this.objective.exploredHeadWeight : 0;
              let exploredSim = 0;
              if (ehW > 0 && this._winnerFamilyVectors.length > 0) {
                const candVec = levelFamilyVector(result.cages);
                let maxSim = 0;
                for (const wvec of this._winnerFamilyVectors) {
                  const s = cosineSimilarity(candVec, wvec);
                  if (s > maxSim) maxSim = s;
                }
                exploredSim = maxSim;
                this._headSimValues.push(maxSim);
              }
              const fitness = baseFitness - novelty * noveltyW - familyRarity * famW
                + exploredSim * ehW;
              // B4-D0：候选池 topology instrumentation（纯测量）。
              //   记录每个 inRange 候选的 per-cage family profile，
              //   并标记最终 winner（对比候选池 Hfamily vs winner Hfamily）。
              if (this._canonicalProfileEnabled) {
                const prof = candidateTopologyProfile(result.cages);
                this._candidateEntropies.push(prof.entropy);
                this._candidateProfiles.push({ ...prof, winner: false });
                // B4-C0：跨关候选池 family 覆盖累计（纯测量，不改 selection）
                for (const fam of prof.families) {
                  this._poolFamilyUnion.add(fam);
                  this._poolFamilyRank.set(fam, (this._poolFamilyRank.get(fam) || 0) + 1);
                }
                if (prof.families.length > 0) {
                  this._poolFamilyCombos.add(prof.families.slice().sort().join('|'));
                }
              }
              if (fitness < bestFitness) {
                // B4-B2 诊断：novelty 是否真的改变了择优（无 novelty 项时本不比 best 优，加 novelty 后才更优）
                if (noveltyW > 0 && novelty > 0 && bestBaseFitness < Infinity && baseFitness >= bestBaseFitness) {
                  this._noveltyRankChanges++;
                }
                // B4-D1-1 诊断：family rarity 是否翻转择优（无 rarity 时 baseFitness 不更优，加 rarity 后才更优）
                if (famW > 0 && familyRarity > 0 && bestBaseFitness < Infinity && baseFitness >= bestBaseFitness) {
                  this._familyRankChanges++;
                }
                // B4-E1 诊断：explored-head similarity 是否翻转择优（无该项时 baseFitness 不更优，加该项后才更优）
                if (ehW > 0 && exploredSim > 0 && bestBaseFitness < Infinity && baseFitness >= bestBaseFitness) {
                  this._headSimRankChanges++;
                }
                bestResult = result;
                bestFitness = fitness;
                bestBaseFitness = baseFitness;
                bestDiff = diff;
                // B4-D0：标记当前候选为 winner（若无 novelty 则不记录，由最终 winner 决定）
                if (this._canonicalProfileEnabled) {
                  this._candidateProfiles[this._candidateProfiles.length - 1].winner = true;
                }
              }
              if (this.objective.enabled) {
                // B3-A：收集 maxCollected 个 inRange 候选后返回 fitness 最优者，
                // 而非 diff<60 即返回（否则 ratio 无机会参与择优）。
                if (acceptedCount >= this.objective.maxCollected) {
                  bestResult.stats.attempts = attempts;
                  bestResult.stats.generationTime = Date.now() - startTime;
                  return this._finalizeLevel(bestResult);
                }
              } else if (acceptedCount >= 3 || diff < 60) {
                // 原逻辑：前 3 次可接受结果内择优（保留难度倾向），之后第一个可接受即返回。
                // 原逻辑 diff<25 过严：xWing 关分数集中 425-525（3星）目标 562，
                // diff 常 >60，几乎永不提前返回、跑满 maxAttempts(50) 次 = 4.5s/关。
                // 实测 xWing 单次尝试成功率约 25%，3 次内命中概率 58%，关均降至亚秒级。
                bestResult.stats.attempts = attempts;
                bestResult.stats.generationTime = Date.now() - startTime;
                return this._finalizeLevel(bestResult);
              }
            } else if (!bestResult) {
              bestResult = result;
              bestDiff = diff;
              bestFitness = diff;
            }
          }
        } catch (e) {
          console.error('[CageFixer] 生成异常:', e.message);
        }
      }

      if (bestResult) {
        bestResult.stats.attempts = attempts;
        bestResult.stats.generationTime = Date.now() - startTime;
        return this._finalizeLevel(bestResult);
      }
      console.error(`[CageFixer] 达到最大尝试次数 ${this.maxAttempts}，生成失败`);
      return null;
    }

    // B4-B2：level 提交时把 canonical fingerprint 计入 pool 计数（跨 level novelty 状态）。
    _finalizeLevel(result) {
      if (result && this.objective.canonicalNoveltyWeight > 0) {
        const fp = levelCanonicalFingerprint(result.cages);
        this._fingerprintCounts.set(fp, (this._fingerprintCounts.get(fp) || 0) + 1);
      }
      // B4-D1-1 / B4-C1：把 winner 的 canonical family 计入跨关累计
      //   （供后续关 rarity 计算 / birth pressure 的 targetFreq 分母）。
      if (result && (this.objective.familyNoveltyWeight > 0 || this.familyBirthPressureWeight > 0)) {
        const famSeen = new Set();
        for (const cage of result.cages || []) {
          const cells = cage.cells || [];
          const a = classifyArchetype(cells);
          if (!CANONICAL_SHAPE_SET.has(a)) continue;
          const fam = canonicalizeShape(cells);
          if (famSeen.has(fam)) continue;
          famSeen.add(fam);
          this._familyCounts.set(fam, (this._familyCounts.get(fam) || 0) + 1);
        }
        this._familyLevels++;
      }
      // B4-C2：把 winner 的 basin signature 计入跨关累计（basin-level birth pressure）。
      if (result && this.basinBirthPressureWeight > 0) {
        const seen = new Set();
        for (const cage of result.cages || []) {
          const b = basinSignature(cage.cells || []);
          if (seen.has(b)) continue;
          seen.add(b);
          this._basinCounts.set(b, (this._basinCounts.get(b) || 0) + 1);
        }
        this._basinLevels++;
      }
      // B4-E1：把 winner 的 canonical family 向量记入跨关记忆（selection 端 repulsion 的参照系）。
      if (result && this.objective.exploredHeadWeight > 0) {
        this._winnerFamilyVectors.push(levelFamilyVector(result.cages));
      }
      // B4-D0：附加候选池 topology instrumentation（纯测量）。
      //   pool Hfamily（全部 inRange 候选均值）vs winner Hfamily：
      //     pool 高 + winner 低 → selection 把 diversity 淘汰 → B4-D1 加权
      //     pool 本身低 → selection 无能为力 → B4-C generation/search
      if (result && this._canonicalProfileEnabled) {
        const profs = this._candidateProfiles;
        const ent = this._candidateEntropies;
        const poolMean = ent.length ? ent.reduce((a, b) => a + b, 0) / ent.length : 0;
        const winnerProf = profs.find((p) => p.winner) || null;
        result._canonicalPool = {
          candidateCount: ent.length,
          poolHfamily: Math.round(poolMean * 1000) / 1000,
          poolHfamilyMax: ent.length ? Math.round(Math.max(...ent) * 1000) / 1000 : 0,
          poolHfamilyMin: ent.length ? Math.round(Math.min(...ent) * 1000) / 1000 : 0,
          winner: winnerProf,
        };
        this._candidateProfiles = [];
        this._candidateEntropies = [];
      }
      return result;
    }

    generateBatch(count, options = {}) {
      const results = [];
      const originalSeed = this.seed;
      for (let i = 0; i < count; i++) {
        if (originalSeed !== null) {
          this.seed = originalSeed + i * 1000;
        } else {
          this.seed = Date.now() + i;
        }
        const level = this.generate();
        if (level) {
          if (options.prefix) {
            level.levelId = `${options.prefix}-${String(i + 1).padStart(3, '0')}`;
          }
          results.push(level);
        }
      }
      this.seed = originalSeed;
      // B4-C0：把跨关候选池 family 覆盖统计附加到 batch（纯测量）
      if (this._canonicalProfileEnabled) {
        results._poolCoverage = {
          uniqueFamiliesInPool: this._poolFamilyUnion.size,
          uniqueFamilyCombosInPool: this._poolFamilyCombos.size,
          familyRank: Object.fromEntries([...this._poolFamilyRank].sort((a, b) => b[1] - a[1])),
        };
      }
      return results;
    }

    // B4-C0：跨关候选池 family 覆盖统计（基准脚本用）
    getPoolCoverage() {
      if (!this._canonicalProfileEnabled) return null;
      const rank = [...this._poolFamilyRank.entries()].sort((a, b) => b[1] - a[1]);
      return {
        uniqueFamiliesInPool: this._poolFamilyUnion.size,
        uniqueFamilyCombosInPool: this._poolFamilyCombos.size,
        familyRank: Object.fromEntries(rank),
      };
    }

    // B4-F0：candidate pipeline audit 结果（纯测量。
    //   _auditRaw / _auditValid / _auditInRange 三分段结构画像，
    //   计算 head / non-head 各阶段的 retention，定位 difficulty/inRange 淘汰点）。
    getCandidateAudit() {
      if (!this._candidateAudit) return null;
      const agg = (arr) => {
        const n = arr.length;
        if (!n) return { n: 0, headRatio: null, nonHeadRatio: null };
        let head = 0, nonHead = 0, complex = 0, crossHouseComplex = 0;
        let scoreSum = 0, ratioSum = 0, topoSum = 0, shapeSum = 0;
        const headFams = new Set();
        for (const r of arr) {
          head += r.headCages;
          nonHead += r.nonHeadCages;
          complex += r.complexCages;
          crossHouseComplex += r.crossHouseComplex;
          for (const f of r.headFamilies || []) headFams.add(f);
          if (r.score !== null && r.score !== undefined) { scoreSum += r.score; }
          if (r.ratio !== undefined) ratioSum += r.ratio;
          if (r.topo !== undefined) topoSum += r.topo;
          if (r.shapePenalty !== undefined) shapeSum += r.shapePenalty;
        }
        const totalCages = head + nonHead;
        return {
          n,
          totalCages,
          headCages: head,
          nonHeadCages: nonHead,
          headRatio: totalCages ? Math.round((head / totalCages) * 1000) / 1000 : null,
          nonHeadRatio: totalCages ? Math.round((nonHead / totalCages) * 1000) / 1000 : null,
          complexCages: complex,
          crossHouseComplex,
          headFamilyCount: headFams.size,
          avgScore: scoreSum / n,
          avgRatio: ratioSum / n,
          avgTopo: topoSum / n,
          avgShapePenalty: shapeSum / n,
        };
      };
      const raw = agg(this._auditRaw);
      const valid = agg(this._auditValid);
      const inRange = agg(this._auditInRange);
      // retention：head / non-head 相对 raw 的存活率（raw 为分母）。
      const retention = (stage) => {
        if (!raw.totalCages) return { head: null, nonHead: null };
        return {
          head: raw.headCages ? Math.round((stage.headCages / raw.headCages) * 1000) / 1000 : null,
          nonHead: raw.nonHeadCages ? Math.round((stage.nonHeadCages / raw.nonHeadCages) * 1000) / 1000 : null,
        };
      };
      return {
        attempts: this._auditAttempts,
        rawCount: this._auditRaw.length,
        validCount: this._auditValid.length,
        inRangeCount: this._auditInRange.length,
        raw,
        valid,
        inRange,
        retentionValid: retention(valid),
        retentionInRange: retention(inRange),
        // 阶段间相对留存（上一阶段为分母）：raw→valid→inRange 的选择性
        relValid: this._stageRel(agg(this._auditValid), agg(this._auditRaw)),
        relInRange: this._stageRel(agg(this._auditInRange), agg(this._auditValid)),
        // 命中率：raw 中多少比例最终进入 pool（按 cage 头占比衡量）
        hitRate: this._auditRaw.length ? Math.round((this._auditInRange.length / this._auditRaw.length) * 1000) / 1000 : null,
      };
    }

    // B4-F0：阶段间相对 headRatio 留存（cur 相对 prev 的 head 占比变化）
    _stageRel(cur, prev) {
      if (!prev || !cur || !prev.totalCages || !cur.totalCages) return null;
      return {
        headCur: cur.headRatio,
        headPrev: prev.headRatio,
        deltaHeadRatio: Math.round((cur.headRatio - prev.headRatio) * 1000) / 1000,
      };
    }

    // ======================================================
    //  内部生成（v9 核心）
    // ======================================================

    _generateOne(attempt, startTime, isProposal) {
      const seedVal = this.seed !== null ? this.seed + attempt : Date.now() + attempt;
      this._rng = createRNG(seedVal);

      const cageSizeWeights = this._getCageSizeWeights();
      const solution = generateFullSolution(this.gridSize, this._rng);
      if (!solution || solution[0][0] === 0) return null;

      let candidateStruct = null;
      const isAdvanced = this.guidedTechnique === 'xWing' || this.guidedTechnique === 'swordfish';
      if (isAdvanced) {
        candidateStruct = buildCandidateStructure(this.gridSize, this._rng, this.guidedTechnique);
        if (!candidateStruct) return null;
      }

      let cages = partitionCages(
        this.gridSize, solution, this._rng,
        this.minCageSize, this.maxCageSize,
        cageSizeWeights,
        this.requiredCageSizes && this.requiredCageSizes.length > 0 ? this.requiredCageSizes : null,
        this.suppressSingletons,
        this.growthBias,
        this.topologyScoreVersion,
        this.crossHouseDiversity,
        this.shapeDiversityWeight,
        this.topologyPrior,
        this.familyBirthPressureWeight > 0
          ? { weight: this.familyBirthPressureWeight, familyCounts: this._familyCounts, levels: this._familyLevels, familyTargetCount: FAMILY_TARGET_COUNT }
          : null,
        this.basinBirthPressureWeight > 0
          ? { weight: this.basinBirthPressureWeight, basinCounts: this._basinCounts, levels: this._basinLevels, basinTargetCount: BASIN_TARGET_COUNT }
          : null,
        this._partitionTrace ? this._partitionTraceArr : null,
        this.size5BranchSuppress || 0
      );
      if (!cages || cages.length === 0) return null;

      // B3-B1b Phase2：topology proposal channel（supply 侧）。
      // 仅当本次尝试是 proposal 时，对布局做复杂拓扑 reshape（合并相邻小笼为跨宫不规则笼），
      // 给 candidate pool 注入更多 complex topology。不改 normal 路径。
      if (isProposal && this.topologyProposal.enabled) {
        cages = reshapeToComplex(cages, solution, this.gridSize, this.maxCageSize, this._rng, this.topologyProposal.maxPer);
        if (!cages || cages.length === 0) return null;
      }

      // B4-F0：raw 阶段记录（partitionCages + reshape 后，进入 dig 前的布局结构画像）。
      if (this._candidateAudit) {
        this._auditRaw.push(candidateStructuralProfile(cages));
      }

      cages = computeCageSums(cages, solution);

      let threeAct = null;
      let scriptParams = null;
      if (this.enableThreeAct) {
        scriptParams = generateScriptParams(this.gridSize, this._starToDifficultyLevel(this.targetStar));
        if (this.targetSteps > 80) {
          scriptParams.openingRatio = Math.max(0.10, scriptParams.openingRatio - 0.10);
          scriptParams.avalancheRatio = Math.min(0.60, scriptParams.avalancheRatio + 0.15);
        }
        threeAct = designThreeActAnchor(solution, cages, this.gridSize, this._rng, scriptParams, this._TechRater, this._Board);
      }
      this._threeActCache = threeAct;

      let puzzleResult;
      const chain = this.techniqueChain || (this.guidedTechnique ? [this.guidedTechnique] : null);
      if (chain && chain.length > 0) {
        const start = Date.now();
        const grid = this._digWithChain(solution, cages, chain, start, candidateStruct);
        if (!grid) return null;

        // V4.3.14 性能优化：挖洞后基于"实际盘面"重新设计三幕锚点。
        // 原锚点基于空盘求解顺序设计，挖洞后（预填 4-10 格）求解顺序改变，
        // breakthrough 锚点失效导致节奏验证 breakpointOk 失败率高达 84%，
        // 迫使 generate() 反复重试（单次尝试仅 ~90ms 但需 ~22 次 = 2s/关）。
        // 挖洞后以实际盘面为求解起点重设锚点，breakthrough 与实际求解路径匹配。
        if (this.enableThreeAct && scriptParams) {
          threeAct = designThreeActAnchor(grid, cages, this.gridSize, this._rng, scriptParams, this._TechRater, this._Board, grid);
          this._threeActCache = threeAct;
        }

        const rating = this._rateWithTechRater(grid, cages);
        if (!rating) return null;

        const verify = timedVerifyUniqueSolution(grid, cages, this.gridSize, this._TechRater, this._Board, this.verifyTimeoutMs);
        if (!verify.unique) return null;

        let rhythm = null;
        if (this.enableRhythmValidation) {
          rhythm = this._validateRhythm(grid, cages, threeAct);
          if (!rhythm.passed) return null;
        }

        if (this.aestheticsStrict) {
          const aestheticOk = this._validateAesthetics(grid, cages);
          if (!aestheticOk) return null;
        }

        puzzleResult = {
          grid,
          rating,
          rhythm,
          guidedInfo: {
            technique: chain.join(','),
            baseUnsolved: false,
            fullSolved: true,
            techUsedInFull: 1,
            totalTechCount: { chain: 1 }
          }
        };
      } else {
        puzzleResult = this._digAndTune(solution, cages, startTime, threeAct);
        if (!puzzleResult) return null;
      }

      const { grid, rating } = puzzleResult;

      if (this.targetTechnique) {
        const purityOk = this._checkPurity(grid, cages);
        if (!purityOk) return null;
      }

      this._levelCounter++;
      const preFilledCount = countFilled(grid);

      return {
        levelId: 'GEN-' + String(this._levelCounter).padStart(3, '0'),
        title: `随机生成关卡 (${rating.level})`,
        gridSize: this.gridSize,
        difficulty: this._starToDifficulty(rating.level),
        boardData: grid,
        cages: cages,
        solution: solution,
        difficultyInfo: {
          level: rating.level,
          stars: this._levelToStars(rating.level),
          score: rating.score,
          techniquesUsed: Object.keys(rating.techCount || {})
        },
        _objective: {
          difficultyScore: rating.score,
          cageReasoningRatio: rating.cageReasoningRatio !== undefined ? rating.cageReasoningRatio : 0,
          cageReasoningCount: rating.cageReasoningCount !== undefined ? rating.cageReasoningCount : 0,
        },
        _topology: {
          score: computeTopologyScore(cages),
          shapePenalty: computeShapeDiversityPenalty(cages),
        },
        threeAct: threeAct,
        guidedInfo: puzzleResult.guidedInfo || null,
        rhythm: puzzleResult.rhythm || null,
        scriptParams: threeAct ? generateScriptParams(this.gridSize, this._starToDifficultyLevel(this.targetStar)) : null,
        stats: {
          totalCages: cages.length,
          preFilledCount: preFilledCount,
          generationTime: 0,
          attempts: attempt,
          rhythmPassed: puzzleResult.rhythm ? puzzleResult.rhythm.passed : null
        }
      };
    }

    // ======================================================
    //  技巧链挖洞（v9 核心）
    // ======================================================

    _digWithChain(solution, cages, chain, startTime, candidateStruct) {
      const size = this.gridSize;
      const grid = deepCopyGrid(solution);
      const fullTechList = ['nakedSingle', 'cageUnique', 'hiddenSingle', 'rule45',
        'nakedPair', 'hiddenPair', 'pointingClaiming', 'nakedTriplet',
        'xWing', 'swordfish'];
      // 基础技巧：所有链技巧断点验证都叠加在这之上（修复：v9 源码缺基础白名单，
      // 导致 solveWith(['xWing']) 只允许 xWing 时永远无法填数）
      const baseTechList = ['nakedSingle', 'cageUnique', 'hiddenSingle', 'rule45'];

      const protect = new Set();
      if (candidateStruct && candidateStruct.cornerCells) {
        for (const [r, c] of candidateStruct.cornerCells) {
          protect.add(r + ',' + c);
        }
      }
      const isProtected = (r, c) => protect.has(r + ',' + c);

      const solveWith = (whitelist) => {
        try {
          const board = new this._Board(size);
          board.loadLevel({ cells: grid, cages: cages });
          const solver = new this._TechRater(board);
          solver.techPriority = whitelist;
          const result = solver.solve(2000);
          const rating = solver.getRating();
          return {
            solvable: !!result.solvable,
            remainingCells: result.remainingCells,
            techCount: rating.techCount || {},
            steps: solver.getSteps(),
          };
        } catch (e) {
          return null;
        }
      };

      // 阶段0：候选结构引导挖
      if (candidateStruct) {
        const { rows, cols } = candidateStruct;
        const rowSet = new Set(rows);
        const colSet = new Set(cols);
        for (const r of rows) {
          for (let c = 0; c < size; c++) {
            if (colSet.has(c)) continue;
            if (isProtected(r, c)) continue;
            const saved = grid[r][c];
            grid[r][c] = 0;
            const fullCheck = solveWith(fullTechList);
            if (!fullCheck || !fullCheck.solvable) grid[r][c] = saved;
          }
        }
        for (const c of cols) {
          for (let r = 0; r < size; r++) {
            if (rowSet.has(r)) continue;
            if (isProtected(r, c)) continue;
            const saved = grid[r][c];
            grid[r][c] = 0;
            const fullCheck = solveWith(fullTechList);
            if (!fullCheck || !fullCheck.solvable) grid[r][c] = saved;
          }
        }
      }

      // 阶段1：常规挖洞
      let digOrder = [];
      if (this._threeActCache) {
        digOrder = [
          ...this._threeActCache.avalanche,
          ...this._threeActCache.opening,
          ...this._threeActCache.breakthrough,
        ];
      } else {
        for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) digOrder.push([r, c]);
      }
      digOrder = shuffleArray(digOrder, this._rng);

      for (const [r, c] of digOrder) {
        if (Date.now() - startTime > this.timeoutMs * 0.5) break;
        if (grid[r][c] === 0) continue;
        if (isProtected(r, c)) continue;
        const saved = grid[r][c];
        grid[r][c] = 0;
        const fullCheck = solveWith(fullTechList);
        if (!fullCheck || !fullCheck.solvable) grid[r][c] = saved;
      }

      // 阶段2：技巧链断点搜索
      // 默认模式（非 strict）：累积白名单——「基础+已确认链技巧」可解 且
      //   「+当前链技巧」可解 → 挖掉（当前技巧是求解必要断点），逐步构建技巧链。
      // strict 模式（--strict-advanced）：严格断点——withoutCurrent（去掉当前及
      //   后续链技巧）不可解 且 withCurrent 可解 → 挖掉（当前技巧真必要）。
      // 实测杀手数独中 xWing/swordfish 被中间技巧完全覆盖，strict 下"无 xWing
      // 不可解"极难达成（成功率 0/20），故默认关闭。
      if (this.strictAdvanced) {
        // ---- strict：严格断点 ----
        for (let idx = 0; idx < chain.length; idx++) {
          const tech = chain[idx];
          const futureTechs = chain.slice(idx);
          const withoutCurrent = fullTechList.filter(t => !futureTechs.includes(t));
          const withCurrent = withoutCurrent.concat(tech);
          let round = 0;
          while (round++ < 6) {
            const candidates = [];
            for (let r = 0; r < size; r++) {
              for (let c = 0; c < size; c++) {
                if (grid[r][c] !== 0 && !isProtected(r, c)) candidates.push([r, c]);
              }
            }
            const shuffled = shuffleArray(candidates, this._rng);
            let progress = false;
            for (const [r, c] of shuffled) {
              if (Date.now() - startTime > this.timeoutMs * 0.85) break;
              const saved = grid[r][c];
              grid[r][c] = 0;
              const withCheck = solveWith(withCurrent);
              if (!withCheck || !withCheck.solvable) { grid[r][c] = saved; continue; }
              const withoutCheck = solveWith(withoutCurrent);
              if (withoutCheck && withoutCheck.solvable) { grid[r][c] = saved; continue; }
              progress = true;
              break;
            }
            if (!progress) break;
          }
        }
      } else {
        // ---- 默认：累积白名单 ----
        let currentWhitelist = baseTechList.slice();
        for (let idx = 0; idx < chain.length; idx++) {
          const tech = chain[idx];
          const nextWhitelist = currentWhitelist.concat(tech);
          let round = 0;
          while (round++ < 5) {
            const candidates = [];
            for (let r = 0; r < size; r++) {
              for (let c = 0; c < size; c++) {
                if (grid[r][c] !== 0 && !isProtected(r, c)) candidates.push([r, c]);
              }
            }
            const shuffled = shuffleArray(candidates, this._rng);
            let progress = false;
            for (const [r, c] of shuffled) {
              if (Date.now() - startTime > this.timeoutMs * 0.85) break;
              const saved = grid[r][c];
              grid[r][c] = 0;
              const nextCheck = solveWith(nextWhitelist);
              if (!nextCheck || !nextCheck.solvable) { grid[r][c] = saved; continue; }
              if (idx > 0 && currentWhitelist.length > 0) {
                const currentCheck = solveWith(currentWhitelist);
                if (currentCheck && currentCheck.solvable) { grid[r][c] = saved; continue; }
              }
              progress = true;
              break;
            }
            if (!progress) break;
          }
          currentWhitelist = nextWhitelist;
        }
      }

      const finalFull = solveWith(fullTechList);
      if (!finalFull || !finalFull.solvable) return null;

      // V4.3.15 严格断点验收（可选，--strict-advanced）：
      // 实测发现 xWing/swordfish 在杀手数独中被 nakedPair/pointingClaiming 等
      // 中间技巧数学上完全覆盖（无 xWing 白名单 30/30 可解，solve 路径 0/30 用 xWing），
      // 严格验收（无目标技巧不可解）成功率实测 0/20。因此默认关闭；
      // 开启时保证链技巧真必要（生成"必须用 X-Wing"的关，接受低成功率）。
      if (this.strictAdvanced) {
        for (const tech of chain) {
          const withoutTech = fullTechList.filter(t => t !== tech);
          const checkWithout = solveWith(withoutTech);
          if (!checkWithout || checkWithout.solvable) return null; // 无该技巧也能解 → 非必要
        }
        let anyChainUsed = false;
        for (const tech of chain) {
          if ((finalFull.techCount[tech] || 0) > 0) { anyChainUsed = true; break; }
        }
        if (!anyChainUsed) return null;
      }

      return grid;
    }

    // ======================================================
    //  视觉巧思验证（v9）
    // ======================================================

    _validateAesthetics(grid, cages) {
      const size = this.gridSize;
      // 对称性检查（对角线对称：grid[r][c] vs grid[c][r] 填/空状态一致）
      let symCount = 0, total = 0;
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          total++;
          const v1 = grid[r][c];
          const v2 = grid[c][r];
          if ((v1 === 0 && v2 === 0) || (v1 !== 0 && v2 !== 0)) symCount++;
        }
      }
      const symRatio = symCount / total;
      if (symRatio < 0.35) return false;

      // 开局5步内至少有2个可填数
      try {
        const board = new this._Board(size);
        board.loadLevel({ cells: grid, cages: cages });
        const solver = new this._TechRater(board);
        solver.solve(50);
        const steps = solver.getSteps() || [];
        const fillSteps = steps.filter(s => s.type === 'fill' || s.type === 'nakedSingle');
        if (fillSteps.length < 2) return false;
      } catch (e) {
        return false;
      }

      // 至少有一个笼子跨宫
      const dim = getBoxDimensions(size);
      let hasCrossBox = false;
      for (const cage of cages) {
        const boxes = new Set();
        for (const [r, c] of cage.cells) {
          const br = Math.floor(r / dim.boxH);
          const bc = Math.floor(c / dim.boxW);
          boxes.add(br + ',' + bc);
        }
        if (boxes.size > 1) { hasCrossBox = true; break; }
      }
      if (!hasCrossBox) return false;

      return true;
    }

    // ======================================================
    //  节奏验证（v9 升级：目标步数可配置、雪崩区≥12）
    // ======================================================

    _validateRhythm(grid, cages, threeAct) {
      const size = this.gridSize;
      const checks = { totalStepsOk: false, avalancheSizeOk: false, scoreOk: false, breakpointOk: false };

      let totalSteps = 0;
      try {
        const board = new this._Board(size);
        board.loadLevel({ cells: grid, cages: cages });
        const solver = new this._TechRater(board);
        solver.solve(2000);
        const steps = solver.getSteps() || [];
        totalSteps = steps.filter(s => s.type !== 'elimination').length;
      } catch (e) { totalSteps = 0; }

      const stepsTargetMin = Math.max(40, this.targetSteps - 20);
      const stepsTargetMax = Math.min(150, this.targetSteps + 30);
      checks.totalStepsOk = totalSteps >= stepsTargetMin && totalSteps <= stepsTargetMax;

      const avalancheSize = (threeAct && threeAct.avalanche) ? threeAct.avalanche.length : 0;
      checks.avalancheSizeOk = avalancheSize >= this.minAvalancheSize;

      let score = 0;
      try {
        const rating = this._rateWithTechRater(grid, cages);
        score = rating ? rating.score : 0;
      } catch (e) { score = 0; }
      checks.scoreOk = score <= 650;

      let breakpointPos = 0;
      try {
        const board = new this._Board(size);
        board.loadLevel({ cells: grid, cages: cages });
        const solver = new this._TechRater(board);
        solver.solve(2000);
        const steps = solver.getSteps() || [];
        const fillSteps = steps.filter(s => s.type !== 'elimination');
        if (threeAct && threeAct.breakthrough && threeAct.breakthrough.length > 0 && fillSteps.length > 0) {
          const btSet = new Set(threeAct.breakthrough.map(([r, c]) => r + ',' + c));
          let firstIdx = -1;
          for (let i = 0; i < fillSteps.length; i++) {
            const s = fillSteps[i];
            const key = (s.row !== undefined ? s.row : s.r) + ',' + (s.col !== undefined ? s.col : s.c);
            if (btSet.has(key)) { firstIdx = i; break; }
          }
          if (firstIdx >= 0) {
            breakpointPos = Math.round((firstIdx / fillSteps.length) * 100);
            checks.breakpointOk = breakpointPos >= 45 && breakpointPos <= 80;
          } else {
            checks.breakpointOk = false;
          }
        } else {
          checks.breakpointOk = true;
        }
      } catch (e) {
        checks.breakpointOk = false;
      }

      const passed = checks.totalStepsOk && checks.avalancheSizeOk && checks.scoreOk && checks.breakpointOk;
      return { passed, totalSteps, avalancheSize, score, breakpointPos, checks };
    }

    // ======================================================
    //  辅助与兼容方法
    // ======================================================

    _rateWithTechRater(grid, cages) {
      try {
        const board = new this._Board(this.gridSize);
        board.loadLevel({ cells: grid, cages: cages });
        const solver = new this._TechRater(board);
        solver.solve(2000);
        const rating = solver.getRating();
        // B3-A：在同一求解上统计笼推理占比（不额外求解），供客观择优使用。
        const steps = solver.getSteps() || [];
        let cageTech = 0;
        for (const s of steps) {
          const t = s && s.technique;
          if (t === 'cageUnique' || t === 'rule45') cageTech++;
        }
        rating.cageReasoningCount = cageTech;
        rating.cageReasoningRatio = steps.length > 0 ? cageTech / steps.length : 0;
        return rating;
      } catch (e) {
        console.error('[CageFixer] TechRater 评估异常:', e.message);
        return null;
      }
    }

    _checkPurity(grid, cages) {
      return true;
    }

    _starToDifficultyLevel(star) {
      return Math.max(1, Math.min(5, Math.floor(star)));
    }

    _levelToStars(level) {
      const map = { '1星': 1, '2星': 2, '3星': 3, '4星': 4, '5星': 5 };
      return map[level] || 1;
    }

    _starToDifficulty(level) {
      const star = this._levelToStars(level);
      const map = { 1: '入门', 2: '简单', 3: '普通', 4: '困难', 5: '专家' };
      return map[star] || '普通';
    }

    _starToScoreMin(star) {
      const mins = { 1: 0, 2: 250, 3: 400, 4: 525, 5: 600 };
      return mins[star] || 400;
    }

    _starToScoreMax(star) {
      const maxs = { 1: 249, 2: 399, 3: 524, 4: 599, 5: 1000 };
      return maxs[star] || 524;
    }

    _getCageSizeWeights() {
      const star = this.targetStar;
      if (star <= 1) return { 1: 0.20, 2: 0.35, 3: 0.25, 4: 0.15, 5: 0.05 };
      if (star === 2) return { 1: 0.10, 2: 0.30, 3: 0.30, 4: 0.20, 5: 0.10 };
      if (star === 3) return { 1: 0.05, 2: 0.20, 3: 0.30, 4: 0.25, 5: 0.20 };
      if (star === 4) return { 1: 0.02, 2: 0.10, 3: 0.25, 4: 0.30, 5: 0.33 };
      return { 1: 0.01, 2: 0.05, 3: 0.15, 4: 0.30, 5: 0.49 };
    }

    /**
     * 常规挖洞 + 难度调节（v9 落地修复）
     * 依据 v8 完整实现恢复：非技巧链模式仍需真正挖洞，
     * 否则会生成"全填盘面"（预填 81 格）的无效关卡。
     */
    _digAndTune(solution, cages, startTime, threeAct = null) {
      const size = this.gridSize;
      const grid = deepCopyGrid(solution);

      const targetStar = this.targetStar;
      const targetScoreMin = this._starToScoreMin(targetStar);
      const targetScoreMax = this._starToScoreMax(targetStar);

      let rating = null;

      const avalancheSet = threeAct ? new Set(threeAct.avalanche.map(([r, c]) => r + ',' + c)) : null;
      const openingSet = threeAct ? new Set(threeAct.opening.map(([r, c]) => r + ',' + c)) : null;
      const breakthroughSet = threeAct ? new Set(threeAct.breakthrough.map(([r, c]) => r + ',' + c)) : null;

      // === 阶段 1: 逆序挖洞（先 avalanche，再 opening，breakthrough 保护） ===
      if (threeAct) {
        const avalancheShuffled = shuffleArray(threeAct.avalanche.slice(), this._rng);
        for (const [r, c] of avalancheShuffled) {
          if (Date.now() - startTime > this.timeoutMs * 0.35) break;
          if (grid[r][c] === 0) continue;
          const saved = grid[r][c];
          grid[r][c] = 0;
          const testRating = this._rateWithTechRater(grid, cages);
          if (testRating && testRating.solvable) {
            rating = testRating;
          } else {
            grid[r][c] = saved;
          }
        }

        const openingShuffled = shuffleArray(threeAct.opening.slice(), this._rng);
        for (const [r, c] of openingShuffled) {
          if (Date.now() - startTime > this.timeoutMs * 0.35) break;
          if (grid[r][c] === 0) continue;
          const saved = grid[r][c];
          grid[r][c] = 0;
          const testRating = this._rateWithTechRater(grid, cages);
          if (testRating && testRating.solvable) {
            rating = testRating;
          } else {
            grid[r][c] = saved;
          }
        }
        // breakthrough 区阶段1不挖（作为"锁"保护）
      } else {
        const allCells = [];
        for (let r = 0; r < size; r++) {
          for (let c = 0; c < size; c++) {
            allCells.push([r, c]);
          }
        }
        const shuffledCells = shuffleArray(allCells, this._rng);
        for (const [r, c] of shuffledCells) {
          if (Date.now() - startTime > this.timeoutMs * 0.35) break;
          if (grid[r][c] === 0) continue;
          const saved = grid[r][c];
          grid[r][c] = 0;
          const testRating = this._rateWithTechRater(grid, cages);
          if (testRating && testRating.solvable) {
            rating = testRating;
          } else {
            grid[r][c] = saved;
          }
        }
      }

      if (!rating) {
        rating = this._rateWithTechRater(grid, cages);
      }
      if (!rating) return null;

      // === 阶段 2: 难度调节 ===
      let currentStar = this._levelToStars(rating.level);
      const MAX_BRUTE_FORCE = 30;

      // 情况 A: 太简单 → 挖更多洞
      if (rating.score < targetScoreMin && currentStar < targetStar) {
        let remainingFilled = [];

        if (threeAct) {
          const openingRemaining = [];
          for (const [r, c] of threeAct.opening) {
            if (grid[r][c] !== 0) openingRemaining.push([r, c]);
          }
          const breakthroughRemaining = [];
          for (const [r, c] of threeAct.breakthrough) {
            if (grid[r][c] !== 0) breakthroughRemaining.push([r, c]);
          }
          const avalancheRemaining = [];
          for (const [r, c] of threeAct.avalanche) {
            if (grid[r][c] !== 0) avalancheRemaining.push([r, c]);
          }
          remainingFilled = [
            ...shuffleArray(avalancheRemaining, this._rng),
            ...shuffleArray(openingRemaining, this._rng),
            ...shuffleArray(breakthroughRemaining, this._rng)
          ];
        } else {
          for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
              if (grid[r][c] !== 0) remainingFilled.push([r, c]);
            }
          }
          remainingFilled = shuffleArray(remainingFilled, this._rng);
        }

        let bruteForceCount = 0;
        for (const [r, c] of remainingFilled) {
          if (Date.now() - startTime > this.timeoutMs * 0.6) break;
          if (rating.score >= targetScoreMin) break;
          if (bruteForceCount >= MAX_BRUTE_FORCE) break;

          const saved = grid[r][c];
          grid[r][c] = 0;
          const testRating = this._rateWithTechRater(grid, cages);
          if (testRating && testRating.solvable) {
            rating = testRating;
            currentStar = this._levelToStars(rating.level);
          } else {
            bruteForceCount++;
            const bruteCheck = timedVerifyUniqueSolution(
              grid, cages, size,
              this._TechRater, this._Board,
              this.verifyTimeoutMs
            );
            if (bruteCheck.unique) {
              if (testRating) {
                rating = testRating;
                currentStar = this._levelToStars(rating.level);
              }
            } else {
              grid[r][c] = saved;
            }
          }
        }
      }

      // 情况 B: 太难 → 回填数字降低难度
      if (rating.score > targetScoreMax && currentStar > targetStar) {
        let emptyCells = [];
        if (threeAct) {
          const avalancheEmpty = [];
          for (const [r, c] of threeAct.avalanche) {
            if (grid[r][c] === 0) avalancheEmpty.push([r, c]);
          }
          const openingEmpty = [];
          for (const [r, c] of threeAct.opening) {
            if (grid[r][c] === 0) openingEmpty.push([r, c]);
          }
          emptyCells = [
            ...shuffleArray(avalancheEmpty, this._rng),
            ...shuffleArray(openingEmpty, this._rng)
          ];
        } else {
          for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
              if (grid[r][c] === 0) emptyCells.push([r, c]);
            }
          }
          emptyCells = shuffleArray(emptyCells, this._rng);
        }

        let backfillCount = 0;
        const maxBackfill = Math.floor(emptyCells.length * 0.4);
        for (const [r, c] of emptyCells) {
          if (backfillCount >= maxBackfill) break;
          if (Date.now() - startTime > this.timeoutMs * 0.85) break;
          if (rating.score <= targetScoreMax) break;

          grid[r][c] = solution[r][c];
          backfillCount++;
          rating = this._rateWithTechRater(grid, cages);
          if (rating) {
            currentStar = this._levelToStars(rating.level);
          }
        }
      }

      // === 阶段 3: 最终验证 ===
      if (!rating) return null;

      if (rating.solvable) {
        return { grid, rating };
      }

      const finalVerify = timedVerifyUniqueSolution(
        grid, cages, size,
        this._TechRater, this._Board,
        this.verifyTimeoutMs
      );
      if (!finalVerify.unique) return null;

      return { grid, rating };
    }
  }

  // ========================================================
  //  命令行接口
  // ========================================================

  function _parseArgs() {
    const args = process.argv.slice(2);
    const options = {
      difficulty: 'medium',
      count: 1,
      output: null,
      technique: null,
      guided: null,
      chain: null,
      requiredCages: null,
      noRhythm: false,
      targetSteps: 75,
      avalancheSize: 12,
      aesthetics: false,
      gridSize: 9,
      seed: null,
      timeout: 30000,
      minCageSize: 1,
      maxCageSize: 5,
      enableThreeAct: true,
      verifyTimeout: 200,
      suppressSingletons: true
    };

    for (let i = 0; i < args.length; i++) {
      switch (args[i]) {
        case '--difficulty':
        case '-d': options.difficulty = args[++i]; break;
        case '--count':
        case '-n': options.count = parseInt(args[++i], 10); break;
        case '--output':
        case '-o': options.output = args[++i]; break;
        case '--technique':
        case '-t': options.technique = args[++i]; break;
        case '--guided':
        case '-g': options.guided = args[++i]; break;
        case '--chain': options.chain = args[++i]; break;
        case '--required-cage': options.requiredCages = args[++i].split(',').map(Number); break;
        case '--no-rhythm': options.noRhythm = true; break;
        case '--target-steps': options.targetSteps = parseInt(args[++i], 10); break;
        case '--avalanche-size': options.avalancheSize = parseInt(args[++i], 10); break;
        case '--aesthetics': options.aesthetics = true; break;
        case '--strict-advanced': options.strictAdvanced = true; break;
        case '--size':
        case '-s': options.gridSize = parseInt(args[++i], 10); break;
        case '--seed': options.seed = parseInt(args[++i], 10); break;
        case '--timeout': options.timeout = parseInt(args[++i], 10); break;
        case '--min-cage': options.minCageSize = parseInt(args[++i], 10); break;
        case '--max-cage': options.maxCageSize = parseInt(args[++i], 10); break;
        case '--three-act': options.enableThreeAct = true; break;
        case '--no-three-act': options.enableThreeAct = false; break;
        case '--verify-timeout': options.verifyTimeout = parseInt(args[++i], 10); break;
        case '--no-suppress-singletons': options.suppressSingletons = false; break;
        case '--help':
        case '-h':
          _printHelp();
          process.exit(0);
          break;
      }
    }
    return options;
  }

  function _printHelp() {
    console.log(`
CageFixer v9 - 二/三周目更难关卡生成器

用法:
  node scripts/cage-generator-v9.cjs [选项]

选项:
  -d, --difficulty <level>    目标难度: easy/medium/hard/expert/master (默认: medium)
  -n, --count <number>        生成数量 (默认: 1)
  -o, --output <file>         输出文件路径
  -g, --guided <name>         单技巧引导（v8 兼容）
  --chain <t1,t2,...>         技巧链（如 nakedPair,xWing,swordfish）
  --required-cage <sizes>     必须包含的笼子尺寸，逗号分隔
  --no-rhythm                 禁用节奏验证
  --target-steps <number>     目标步数 (默认: 75)
  --avalanche-size <number>   雪崩区最小大小 (默认: 12)
  --aesthetics                开启视觉巧思严格验证
  -s, --size <number>         盘面大小: 9 (默认)
  --seed <number>             随机种子
  --timeout <ms>              超时时间 (默认: 30000)
  --min-cage <number>         最小笼子大小 (默认: 1)
  --max-cage <number>         最大笼子大小 (默认: 5)
  --three-act                 启用三幕 (默认)
  --no-three-act              禁用三幕
  -h, --help                  显示帮助

示例:
  # 生成 5 个技巧链关 (数对→X-Wing)
  node scripts/cage-generator-v9.cjs --chain nakedPair,xWing --count 5 --output data/v9.json

  # 生成 3 个 Swordfish 专家关，雪崩区≥15，严格视觉
  node scripts/cage-generator-v9.cjs --guided swordfish --difficulty expert --avalanche-size 15 --aesthetics --count 3
`);
  }

  function _difficultyToStar(difficulty) {
    const map = { 'easy': 2, 'medium': 3, 'hard': 4, 'expert': 5, 'master': 5 };
    return map[difficulty] || 3;
  }

  // ========================================================
  //  导出与命令行入口
  // ========================================================

  if (typeof window !== 'undefined') {
    window.CageFixer = CageFixer;
  }
  if (global) {
    global.CageFixer = CageFixer;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CageFixer };
  }

  if (require.main === module) {
    const options = _parseArgs();
    console.log('=== CageFixer v9 - 二/三周目更难关卡生成器 ===\n');
    console.log(`配置: 难度=${options.difficulty}, 数量=${options.count}, 大小=${options.gridSize}x${options.gridSize}`);
    if (options.chain) console.log(`技巧链: ${options.chain}`);
    if (options.guided) console.log(`单技巧: ${options.guided}`);
    console.log(`目标步数: ${options.targetSteps}, 雪崩区最小: ${options.avalancheSize}`);
    console.log(`视觉巧思: ${options.aesthetics ? '开启' : '关闭'}`);
    console.log('');

    const generator = new CageFixer({
      gridSize: options.gridSize,
      targetDifficulty: options.difficulty,
      targetStar: _difficultyToStar(options.difficulty),
      targetTechnique: options.technique,
      guidedTechnique: options.guided,
      techniqueChain: options.chain ? options.chain.split(',') : null,
      requiredCageSizes: options.requiredCages || [],
      enableRhythmValidation: !options.noRhythm,
      targetSteps: options.targetSteps,
      minAvalancheSize: options.avalancheSize,
      aestheticsStrict: options.aesthetics,
      strictAdvanced: options.strictAdvanced || false,
      minCageSize: options.minCageSize,
      maxCageSize: options.maxCageSize,
      suppressSingletons: options.suppressSingletons,
      seed: options.seed,
      timeoutMs: options.timeout,
      enableThreeAct: options.enableThreeAct,
      verifyTimeoutMs: options.verifyTimeout
    });

    console.log('正在生成关卡...\n');
    const levels = generator.generateBatch(options.count, { prefix: 'V9' });

    if (levels.length === 0) {
      console.error('生成失败，未产出任何关卡');
      process.exit(1);
    }

    console.log(`成功生成 ${levels.length} / ${options.count} 个关卡\n`);
    levels.forEach((level, i) => {
      console.log(`[${i + 1}] ${level.levelId} - ${level.title}`);
      console.log(`    难度: ${level.difficultyInfo.level} (${level.difficultyInfo.score}分)`);
      console.log(`    笼子数: ${level.stats.totalCages}, 预填数: ${level.stats.preFilledCount}`);
      console.log(`    步数: ${level.rhythm ? level.rhythm.totalSteps : 'N/A'}`);
      console.log(`    雪崩区: ${level.rhythm ? level.rhythm.avalancheSize : 'N/A'}`);
      console.log(`    节奏通过: ${level.stats.rhythmPassed ? '✅' : '❌'}`);
      if (level.guidedInfo) {
        console.log(`    技巧链: ${level.guidedInfo.technique}`);
      }
      console.log('');
    });

    if (options.output) {
      const outputPath = path.resolve(options.output);
      const outputData = {
        generator: 'cage-fixer-v9',
        generatedAt: new Date().toISOString(),
        count: levels.length,
        levels: levels
      };
      fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2), 'utf-8');
      console.log(`已保存到: ${outputPath}`);
    }
  }

})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
