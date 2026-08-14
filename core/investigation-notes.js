// ==========================================
// InvestigationNotesStore - Player Memory Layer (Step 8 · Goal 4)
// ==========================================
// 证据卡便签的私有存储。属于 Presentation / Player Memory 层，
// 绝不反向污染 EvidenceRecord / EvidenceGraph / InvestigationState。
//
// 数据结构（persisted as JSON）：
//   {
//     "L410": {
//       "EV-410-CAGE-11": { "text": "...", "updatedAt": 123456 }
//     }
//   }
//
// 使用 DataStore（localStorage + 校验和 + 备份）持久化。
// 工厂可注入，便于测试与外置存储。
// ==========================================

import { DataStore } from './data-store.js';

const CATEGORY = 'player_memory';
const KEY = 'investigation_notes';

export class InvestigationNotesStore {
  /**
   * @param {Object} opts
   * @param {Object} [opts.store] - 兼容 DataStore 的 get/set 接口，默认 DataStore
   * @param {Object} [opts.initial] - 预置内存数据（测试用）
   */
  constructor({ store = null, initial = null } = {}) {
    this.store = store || DataStore;
    this._cache = initial || this._load();
  }

  /** 从持久层读取整份 note 映射。 */
  _load() {
    try {
      const raw = this.store.get(KEY, CATEGORY, {});
      return (raw && typeof raw === 'object') ? raw : {};
    } catch (e) {
      return {};
    }
  }

  /** 写回持久层。 */
  _persist() {
    try { this.store.set(KEY, this._cache, CATEGORY); return true; }
    catch (e) { return false; }
  }

  /** 某关全部笔记：{ evidenceId: { text, updatedAt } }。 */
  getForLevel(levelId) {
    if (levelId == null) return {};
    return (this._cache && this._cache[levelId]) || {};
  }

  /** 单条笔记，不存在返回 null。 */
  getNote(levelId, evidenceId) {
    const lv = this.getForLevel(levelId);
    return (lv && evidenceId != null && lv[evidenceId]) || null;
  }

  /**
   * 保存/更新某证据便签。text 为空串则删除该条。
   * @returns {boolean} 是否持久化成功
   */
  saveNote(levelId, evidenceId, text) {
    if (levelId == null || evidenceId == null) return false;
    const t = String(text == null ? '' : text);
    if (!this._cache[levelId]) this._cache[levelId] = {};
    if (t.trim() === '') {
      delete this._cache[levelId][evidenceId];
      if (Object.keys(this._cache[levelId]).length === 0) delete this._cache[levelId];
    } else {
      this._cache[levelId][evidenceId] = { text: t, updatedAt: Date.now() };
    }
    return this._persist();
  }

  /** 删除某证据便签。 */
  removeNote(levelId, evidenceId) {
    return this.saveNote(levelId, evidenceId, '');
  }
}

export default InvestigationNotesStore;