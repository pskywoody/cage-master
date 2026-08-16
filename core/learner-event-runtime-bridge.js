// ============================================================
// learner-event-runtime-bridge.js — Teaching AI Phase 14.5-GateA
// Runtime Event Bridge：把真实运行时事件从四个生产来源接入 research pipeline。
//    LessonPlayer._recordLessonEvent
//    HintSystem.getHint()
//    TeachingSystem.recordEncounter()
//    Puzzle (HeadlessEngine.fillCell)
// 只读挂接：事件点调用 eventHook(raw) → bridge 委托给已有 LearnerEventCollector 统一落盘。
// 缺省不注入 → 零行为改变；不接 UA-v2 decision；不自动教学。
// 双后端：Node 用已有 collector 写 JSONL；浏览器 fallback 内存存储。
// ============================================================
import { LearnerEventCollector } from './learner-event-collector.js';

// ---- Bridge：注入四来源 + 聚合到已有 collector ----
export class RuntimeEventBridge {
  /**
   * @param {Object} opts
   * @param {string} [opts.filePath] - Node 落盘路径（JSONL），传给已有 LearnerEventCollector
   * @param {string} [opts.sessionId]
   */
  constructor(opts = {}) {
    this._collector = new LearnerEventCollector({
      filePath: opts.filePath,
      sessionId: opts.sessionId,
    });
    this._sessionId = opts.sessionId || this._collector.getSession().sessionId;
    // 当前教学 technique 上下文：Puzzle 填格事件本身无技巧粒度，
    // 但真实场景中填格总发生在某教学 technique 之后，故继承最近的教学上下文。
    this._lastTechnique = null;
    // 统一钩子：把各来源 raw 传给已有 collector
    this.utilHook = (raw) => {
      const r = raw || {};
      if (r.technique) this._lastTechnique = r.technique;
      if (r.source === 'Puzzle' && !r.technique && this._lastTechnique) {
        r.technique = this._lastTechnique;
      }
      return this._collector.collect(r);
    };
  }

  /** 给单个生产实例注入只读钩子（缺省已存在 eventHook 则跳过） */
  attach(host) {
    if (!host) return this;
    if (host.eventHook === undefined || host.eventHook === null) {
      host.eventHook = this.utilHook;
    }
    return this;
  }

  /** 便捷注入：一次挂接四个来源实例 */
  attachAll({ lessonPlayer, hintSystem, teachingSystem, engine }) {
    if (lessonPlayer) this.attach(lessonPlayer);
    if (hintSystem) this.attach(hintSystem);
    if (teachingSystem) this.attach(teachingSystem);
    if (engine && engine.eventHook !== undefined) this.attach(engine);
    return this;
  }

  collect(raw) { return this._collector.collect(raw); }
  getEvents() { return this._collector.getSession().events; }
  getSession() { return this._collector.getSession(); }
  finalize() { return this._collector.finalize(); }

  /** 导出 JSONL 文本（浏览器侧回传用） */
  toJSONL() {
    return this.getEvents().map((e) => JSON.stringify(e)).join('\n');
  }
}