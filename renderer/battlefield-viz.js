// ============================================================
//  battlefield-viz.js - 战场表观视觉状态累积器（CM4 Board 战场表现增强）
// ============================================================
//  目标：让三点连线从"棋盘"变成"战场"。把对战中的瞬时事件 + 时间累积成
//  UI 可直接渲染的视觉数据，renderer（board-renderer）读取后绘制。
//
//  提供的战场语言：
//    1. 格子状态视觉层     —— 永久归属格（玩家青墨/敌方黄铜）角标
//    2. AI 最近落子轨迹     —— 敌方推进残影轨迹
//    3. 玩家反击轨迹       —— 己方连击路径轨迹
//    4. 争夺区域残影       —— 冲突据点核心格的"残影"(offset ghost)
//    5. 连线形成反馈       —— 三点连线逐步"画"出来（据点归属决定边）
//    6. 接近三连压力提示   —— 某方占 2 据点时对第三点施加压力
//    7. 完成时爆发反馈     —— 连线绝杀的扩张爆发
//    8. 据点状态变化       —— 占领(expansion ring) / 争夺(dual pulse) / 失守(loss flash)
//
//  环境约束：纯 ES Module；不依赖 DOM/renderer；只累积"事件 + 时间"，
//  UI 层（game.html）消费 tpl 事件喂入，renderer 读取渲染。
// ============================================================

// 轨迹残影存活时长（ms）
const TRAIL_LIFE = 2600;
// 轨迹最大点数
const TRAIL_CAP = 6;
// 据点状态特效存活时长（ms）
const HUB_FX_LIFE = 1400;
// 爆发特效存活时长（ms）
const BURST_LIFE = 1400;

export class BattlefieldViz {
  constructor() {
    this.reset();
  }

  /** 清空全部战场视觉状态（开战/重置时调用） */
  reset() {
    /** @type {{r:number,c:number,castle:boolean}[]} 三个据点核心格 */
    this._cores = [];
    /** @type {Record<string,'player'|'boss'>} 永久归属格 'r,c'->side */
    this._owned = {};
    /** @type {{player:{r,c,ts}[], ai:{r,c,ts}[]}} 最近落子轨迹 */
    this._trails = { player: [], ai: [] };
    /** @type {Record<number,{type:string,side:string|null,ts:number}>} 据点状态特效 */
    this._hubFx = {};
    /** @type {{side:string,ts:number,cells:{r,c}[]}|null} 连线爆发 */
    this._burst = null;
    /** @type {boolean} 连线绝杀是否已触发（避免重复爆发） */
    this._burstDone = false;
  }

  /**
   * 设置三个据点核心格（开战时由 UI 层调用一次）
   * @param {Array<{r:number,c:number,castle?:boolean}>} cores
   */
  setCores(cores) {
    this._cores = (Array.isArray(cores) ? cores : []).slice(0, 3).map((c, i) => ({
      r: c.r,
      c: c.c,
      castle: !!(c.castle || i === 0),
    }));
  }

  /**
   * 记录一次落子轨迹（AI 由 board_changed aiFill 喂入；玩家由 cellFill 喂入）
   * @param {'player'|'ai'} side
   * @param {number} r
   * @param {number} c
   */
  recordMove(side, r, c) {
    if (typeof r !== 'number' || typeof c !== 'number') return;
    const trail = this._trails[side] || (this._trails[side] = []);
    trail.push({ r, c, ts: Date.now() });
    if (trail.length > TRAIL_CAP) trail.shift();
  }

  /** 永久归属格（由 CELL_OCCUPIED 喂入） */
  _markOwned(r, c, side) {
    if (typeof r !== 'number' || typeof c !== 'number' || !side) return;
    this._owned[r + ',' + c] = side;
  }

  /** 据点状态特效（capture/contest/loss） */
  _markHubFx(idx, type, side) {
    if (typeof idx !== 'number' || idx < 0) return;
    this._hubFx[idx] = { type, side: side || null, ts: Date.now() };
  }

  /**
   * 消费战斗事件（UI 层 handleBattleEvent 转发）。只关注视觉相关事件。
   * @param {string} event   - TPL_BATTLE_EVENTS 事件名
   * @param {Object} data    - 事件数据
   */
  consume(event, data) {
    if (!event || !data) return;
    switch (event) {
      case 'cell_occupied':
        // 落子既永久归属（角标），也进入最近轨迹（AI 推进 / 玩家反击）
        this._markOwned(data.r, data.c, data.side);
        this.recordMove(data.side === 'boss' ? 'ai' : 'player', data.r, data.c);
        break;
      case 'hub_occupied':
        this._markHubFx(data.hubId, 'capture', data.side);
        break;
      case 'hub_migrated':
        // 平局迁移：原据点"失守"
        this._markHubFx(data.hubId, 'loss', null);
        break;
      case 'hub_migrate_fail':
        this._markHubFx(data.hubId, 'loss', null);
        break;
      case 'hub_revealed':
        // 隐藏据点显现：给一个"亮相"光圈
        this._markHubFx(data.hubId, 'capture', data.side || null);
        break;
      case 'hub_dim_occupied':
        // 维度被占领：不改变据点光环，仅记录（供 UI 可选反馈）
        break;
      case 'three_point_line':
        // 连线绝杀完成 → 爆发
        this._triggerBurst(data.side);
        break;
      case 'tpl_battle_start':
      case 'battle_start':
        this._burstDone = false;
        break;
      default:
        break;
    }
  }

  /** 触发连线爆发（THREE_POINT_LINE） */
  _triggerBurst(side) {
    this._burstDone = true;
    this._burst = {
      side: side || null,
      ts: Date.now(),
      cells: this._cores.map((c) => ({ r: c.r, c: c.c })),
    };
  }

  /**
   * 用当前据点归属构建视觉状态（供 renderer 绘制）。
   * @param {Array} hubStates - tpl.getHubState()（含 occupiedBy/visible/coreCell）
   * @param {Object|null} heat - getPresentation().heat（含 levels）
   * @param {number} [now] - 自定义时间戳（测试用）
   * @returns {Object|null} battlefield 视觉数据（无据点时返回 null）
   */
  build(hubStates, heat, now) {
    now = now || Date.now();
    const cores = this._cores;
    if (!cores.length) return null;

    const wins = (hs) => ({
      cores,
      ownedCells: this._owned,
      trails: this._fadeTrails(now),
      contested: this._contestedIdx(hubStates, heat),
      line: this._buildLine(hubStates),
      hubFx: this._fadeHubFx(now),
      burst: this._burst ? (now - this._burst.ts < BURST_LIFE ? this._burst : null) : null,
      castleIdx: cores.findIndex((c) => c.castle),
    });
    return wins(hubStates);
  }

  /** 轨迹淡出（返回带 alpha 的点序列） */
  _fadeTrails(now) {
    const out = { player: [], ai: [] };
    for (const side of ['player', 'ai']) {
      const trail = this._trails[side] || [];
      const pts = [];
      for (let i = 0; i < trail.length; i++) {
        const p = trail[i];
        const age = now - p.ts;
        if (age > TRAIL_LIFE) continue;
        pts.push(Object.assign({}, p, { alpha: 1 - age / TRAIL_LIFE }));
      }
      out[side] = pts;
    }
    return out;
  }

  /** 据点状态特效淡出 */
  _fadeHubFx(now) {
    const out = {};
    for (const k in this._hubFx) {
      const fx = this._hubFx[k];
      if (now - fx.ts > HUB_FX_LIFE) continue;
      out[k] = Object.assign({}, fx, { alpha: 1 - (now - fx.ts) / HUB_FX_LIFE });
    }
    return out;
  }

  /** 争夺中的据点索引（heat level 2 及以上 = 双方争夺/决胜） */
  _contestedIdx(hubStates, heat) {
    const levels = heat && heat.levels ? heat.levels : [];
    const idx = [];
    for (let i = 0; i < this._cores.length; i++) {
      const h = hubStates && hubStates[i];
      if (h && h.occupiedBy) continue; // 已定归属不是争夺
      if (levels[i] >= 2) idx.push(i);
    }
    return idx;
  }

  /**
   * 连线形成反馈：三个据点核心格连成三角形，边按归属"点亮"。
   * 某方占 2 据点 → 对缺失点施加压力（接近三连）。
   */
  _buildLine(hubStates) {
    const occ = (hubStates || []).slice(0, 3).map((h) => (h && h.occupiedBy) || null);
    const edges = [
      [0, 1], [1, 2], [2, 0],
    ].map(([a, b]) => {
      const oa = occ[a], ob = occ[b];
      let state = 'open', side = null;
      if (oa && oa === ob) { state = 'owned'; side = oa; }
      else if (oa && ob && oa !== ob) { state = 'clash'; side = null; }
      else { state = 'open'; side = oa || ob || null; }
      return { a: this._cores[a], b: this._cores[b], state, side };
    });

    // 接近三连：某方占 2 据点，第三点仍空 → 压力
    const counts = { player: 0, boss: 0 };
    occ.forEach((o) => { if (o === 'player' || o === 'boss') counts[o]++; });
    let nearTriple = null;
    for (const side of ['player', 'boss']) {
      if (counts[side] >= 2) {
        const missingIdx = occ.findIndex((o, i) => !o && !(hubStates[i] && hubStates[i].occupiedBy));
        if (missingIdx >= 0) {
          nearTriple = {
            side,
            missing: this._cores[missingIdx],
            missingIdx,
            both: counts[side] >= 2,
          };
        }
      }
    }
    return { edges, counts, nearTriple };
  }
}

export default BattlefieldViz;