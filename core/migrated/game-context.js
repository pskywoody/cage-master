// ==========================================
// GameContext - 迁移自 cagemaster3/core/GameContext.js
// 转换为 ES Module 格式
// ==========================================
'use strict';

  // 内部状态存储
  const _state = {
    player: {
      combo: 0,
      flow: false,
      stuck: false,
      anxious: false,
      rhythm: 'normal',   // normal / fast / slow
      errorCount: 0,
    },
    level: {
      act: 1,
      progress: 0,        // 0 ~ 1
      time: 0,            // 已用秒数
      hintsUsed: 0,
      difficulty: 0,      // 1~5
    },
    decision: {
      cooldown: 0,
      lastAction: null,
      actionQueue: [],
      priority: 'normal', // normal / high / low
    },
    learning: {
      style: 'balanced',  // balanced / visual / logical / trial
      mastery: {},
      thresholds: {},
      history: [],
    },
  };

  // 订阅者：domain -> Set<callback>
  const _subscribers = new Map();
  ['player', 'level', 'decision', 'learning'].forEach(d => {
    _subscribers.set(d, new Set());
  });

  // 深拷贝（浅度足够，因状态值均为 primitive / 简单对象）
  function _clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  // 通知指定域的所有订阅者
  function _notify(domain, newState) {
    const cbs = _subscribers.get(domain);
    if (!cbs || cbs.size === 0) return;
    const snapshot = _clone(newState);
    cbs.forEach(cb => {
      try { cb(snapshot, domain); } catch (e) { console.error('GameContext subscriber error:', domain, e); }
    });
  }

  class GameContext {
    constructor() {
      // 单例保护（使用 globalThis 兼容浏览器/Node）
      const g = (typeof globalThis !== 'undefined') ? globalThis : (typeof window !== 'undefined' ? window : null);
      if (g && g.GameContext && g.GameContext instanceof GameContext) {
        return g.GameContext;
      }
      if (g) {
        g.GameContext = this;
      }
    }

    /**
     * 获取指定域的状态副本
     * @param {string} domain - player / level / decision / learning
     * @returns {Object} 状态副本
     */
    getState(domain) {
      if (!_state.hasOwnProperty(domain)) {
        console.warn('GameContext: unknown domain', domain);
        return null;
      }
      return _clone(_state[domain]);
    }

    /**
     * 合并更新指定域的状态，触发订阅者
     * @param {string} domain - player / level / decision / learning
     * @param {Object} updates - 要合并的键值对
     */
    setState(domain, updates) {
      if (!_state.hasOwnProperty(domain)) {
        console.warn('GameContext: unknown domain', domain);
        return;
      }
      const target = _state[domain];
      let changed = false;
      for (const key in updates) {
        if (updates.hasOwnProperty(key)) {
          if (target[key] !== updates[key]) {
            target[key] = updates[key];
            changed = true;
          }
        }
      }
      if (changed) {
        _notify(domain, target);
      }
    }

    /**
     * 订阅特定域的状态变化
     * @param {string} domain - player / level / decision / learning
     * @param {Function} callback - (stateSnapshot, domain) => {}
     * @returns {Function} 取消订阅函数
     */
    subscribe(domain, callback) {
      if (!_subscribers.has(domain)) {
        console.warn('GameContext: unknown domain for subscribe', domain);
        return () => {};
      }
      const cbs = _subscribers.get(domain);
      cbs.add(callback);
      return () => cbs.delete(callback);
    }

    /**
     * 获取完整四域快照
     * @returns {Object} { player, level, decision, learning }
     */
    snapshot() {
      return _clone(_state);
    }
  }

  // 暴露到全局

export { GameContext };
