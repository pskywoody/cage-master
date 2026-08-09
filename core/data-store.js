// ==========================================
// DataStore - 迁移自 cagemaster3/core/DataStore.js
// 转换为 ES Module 格式
// ==========================================
'use strict';

  // 九大分类常量
  const CATEGORIES = {
    PROGRESS: 'progress',
    SETTINGS: 'settings',
    ACHIEVEMENT: 'achievement',
    LEARNING: 'learning',
    STATS: 'stats',
    STORY: 'story',
    GALLERY: 'gallery',
    SEAL: 'seal',
    CACHE: 'cache',
    INK_TEXT: 'ink_text',
  };

  // 分类前缀分隔符
  const PREFIX_SEPARATOR = ':';

  // 备份后缀
  const BACKUP_A_SUFFIX = '__bak_a';
  const BACKUP_B_SUFFIX = '__bak_b';

  // DataStore 版本号（用于未来迁移）
  const DATASTORE_VERSION = 1;

  // 是否已初始化
  let _initialized = false;

  // 迁移记录（旧key -> 新key 的映射，用于回退时保留旧key）
  const _legacyKeys = [];

  /**
   * 简单哈希校验和
   * 使用 JSON.stringify 后取字符码和模运算
   * @param {*} data - 任意可序列化数据
   * @returns {string} 16进制校验和
   */
  function _computeChecksum(data) {
    let str;
    try {
      str = JSON.stringify(data);
    } catch (e) {
      str = String(data);
    }
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      // 类似 DJB2 的简单哈希
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash = hash & hash; // 转为 32 位整数
    }
    // 转为无符号 16 进制字符串
    return (hash >>> 0).toString(16);
  }

  /**
   * 构造带分类前缀的完整 key
   * @param {string} key - 数据键
   * @param {string} category - 分类常量
   * @returns {string} 完整 key
   */
  function _makeFullKey(key, category) {
    return category + PREFIX_SEPARATOR + key;
  }

  /**
   * 从完整 key 中解析分类和原始 key
   * @param {string} fullKey - 完整 key
   * @returns {{category: string, key: string}|null}
   */
  function _parseFullKey(fullKey) {
    const idx = fullKey.indexOf(PREFIX_SEPARATOR);
    if (idx <= 0) return null;
    const category = fullKey.substring(0, idx);
    const key = fullKey.substring(idx + 1);
    // 排除备份后缀
    if (key.endsWith(BACKUP_A_SUFFIX) || key.endsWith(BACKUP_B_SUFFIX)) {
      return null;
    }
    // 验证是已知分类
    const valid = Object.values(CATEGORIES).includes(category);
    return valid ? { category, key } : null;
  }

  /**
   * 备份轮转：主 -> 备份A -> 备份B
   * @param {string} fullKey - 主数据的完整 key
   */
  function _rotateBackup(fullKey) {
    try {
      const mainData = _getItem(fullKey);
      const bakAKey = fullKey + BACKUP_A_SUFFIX;
      const bakBKey = fullKey + BACKUP_B_SUFFIX;

      // 备份A -> 备份B
      const bakAData = _getItem(bakAKey);
      if (bakAData !== null) {
        _setItem(bakBKey, bakAData);
      }

      // 主 -> 备份A
      if (mainData !== null) {
        _setItem(bakAKey, mainData);
      }
    } catch (e) {
      console.warn('[DataStore] Backup rotation failed:', e);
    }
  }

  /**
   * 校验数据的 checksum，失败则尝试从备份恢复
   * @param {string} fullKey - 主数据的完整 key
   * @returns {*} 恢复后的 value，若全部失败返回 null
   */
  function _validateAndRecover(fullKey) {
    const bakAKey = fullKey + BACKUP_A_SUFFIX;
    const bakBKey = fullKey + BACKUP_B_SUFFIX;
    const keysToTry = [fullKey, bakAKey, bakBKey];

    for (const key of keysToTry) {
      try {
        const raw = _getItem(key);
        if (!raw) continue;

        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') continue;

        // 校验 checksum
        const expected = _computeChecksum(parsed.value);
        if (parsed.checksum === expected) {
          // 如果是从备份恢复的，写回主位置
          if (key !== fullKey) {
            try {
              _setItem(fullKey, raw);
              console.info('[DataStore] Recovered from backup:', key);
            } catch (e) { /* 忽略写回失败 */ }
          }
          return parsed.value;
        }
      } catch (e) {
        // 解析失败，跳过
        continue;
      }
    }

    // 全部失败
    console.warn('[DataStore] All backups invalid for key:', fullKey);
    return null;
  }

  /**
   * 从旧格式（裸值）迁移到新格式（带 checksum 的包装对象）
   * @param {string} fullKey - 完整 key
   * @param {*} rawValue - 原始值（可能是字符串或已解析对象）
   * @returns {boolean} 是否成功迁移
   */
  function _migrateLegacyEntry(fullKey, rawValue) {
    try {
      // 尝试判断 rawValue 是否是已经 JSON 序列化的字符串
      let value;
      if (typeof rawValue === 'string') {
        try {
          value = JSON.parse(rawValue);
        } catch (e) {
          // 不是 JSON，就用原始字符串
          value = rawValue;
        }
      } else {
        value = rawValue;
      }

      const wrapped = {
        value: value,
        checksum: _computeChecksum(value),
        timestamp: Date.now(),
      };

      // 保存为新格式
      _setItem(fullKey, JSON.stringify(wrapped));
      return true;
    } catch (e) {
      console.warn('[DataStore] Legacy migration failed for', fullKey, e);
      return false;
    }
  }

  /**
   * 判断某个 localStorage 值是否已经是 DataStore 包装格式
   */
  function _isDataStoreFormat(raw) {
    if (!raw || typeof raw !== 'string') return false;
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object'
        && 'value' in parsed
        && 'checksum' in parsed
        && 'timestamp' in parsed;
    } catch (e) {
      return false;
    }
  }

  // ========== 公共 API ==========

  // Node.js 环境内存回退（无 localStorage 时使用）
let _memoryStorage = new Map();
function _hasLocalStorage() {
  return typeof localStorage !== 'undefined' && localStorage !== null;
}
function _getItem(key) {
  if (_hasLocalStorage()) return localStorage.getItem(key);
  return _memoryStorage.has(key) ? _memoryStorage.get(key) : null;
}
function _setItem(key, value) {
  if (_hasLocalStorage()) { localStorage.setItem(key, value); }
  else { _memoryStorage.set(key, value); }
}
function _removeItem(key) {
  if (_hasLocalStorage()) { localStorage.removeItem(key); }
  else { _memoryStorage.delete(key); }
}
function _storageLength() {
  if (_hasLocalStorage()) return localStorage.length;
  return _memoryStorage.size;
}
function _storageKey(i) {
  if (_hasLocalStorage()) return localStorage.key(i);
  return Array.from(_memoryStorage.keys())[i] || null;
}

const DataStore = {
    // 分类常量
    ...CATEGORIES,
    CATEGORIES: CATEGORIES,

    /**
     * 初始化 DataStore
     * 扫描现有 localStorage key，自动迁移到分类前缀格式
     * 旧 key 保留作为回退
     */
    init() {
      if (_initialized) return;

      try {
        const keysToMigrate = [];

        // 扫描所有 localStorage key
        for (let i = 0; i < _storageLength(); i++) {
          const key = _storageKey(i);
          if (!key) continue;

          // 跳过已经是 DataStore 格式（带分类前缀）的 key
          const parsed = _parseFullKey(key);
          if (parsed) continue;

          // 跳过备份 key
          if (key.endsWith(BACKUP_A_SUFFIX) || key.endsWith(BACKUP_B_SUFFIX)) {
            continue;
          }

          keysToMigrate.push(key);
        }

        // 迁移已知的关键 key 到对应分类
        const knownMappings = {
          // 进度类
          'cagedcipher_progress': CATEGORIES.PROGRESS,
          // 设置类
          'game_settings': CATEGORIES.SETTINGS,
          // 难度设置
          'boss_difficulty': CATEGORIES.SETTINGS,
          // 三幕式教学显示记录
          'cagemaster3_three_act_shown': CATEGORIES.LEARNING,
        };

        for (const oldKey of keysToMigrate) {
          const category = knownMappings[oldKey];
          if (!category) continue; // 未知 key 暂不迁移，保持原样

          try {
            const rawValue = _getItem(oldKey);
            if (rawValue === null) continue;

            const newKey = _makeFullKey(oldKey, category);
            // 如果新 key 已经存在，跳过（避免覆盖）
            if (_getItem(newKey) !== null) continue;

            // 如果旧值已经是 DataStore 格式，直接复制
            if (_isDataStoreFormat(rawValue)) {
              _setItem(newKey, rawValue);
            } else {
              // 迁移为新格式
              _migrateLegacyEntry(newKey, rawValue);
            }

            _legacyKeys.push({ oldKey, newKey });
            console.info('[DataStore] Migrated:', oldKey, '->', newKey);
          } catch (e) {
            console.warn('[DataStore] Migration error for', oldKey, e);
          }
        }

        _initialized = true;
        console.info('[DataStore] Initialized. Migrated keys:', _legacyKeys.length);
      } catch (e) {
        console.error('[DataStore] Init failed:', e);
      }
    },

    /**
     * 读取数据
     * @param {string} key - 数据键
     * @param {string} category - 分类常量（默认 PROGRESS）
     * @param {*} defaultValue - 默认值
     * @returns {*} 存储的值，不存在则返回 defaultValue
     */
    get(key, category, defaultValue) {
      if (!category) category = CATEGORIES.PROGRESS;

      const fullKey = _makeFullKey(key, category);

      try {
        const raw = _getItem(fullKey);
        if (raw === null) {
          // 尝试旧 key（向后兼容）
          const legacyRaw = _getItem(key);
          if (legacyRaw !== null) {
            // 旧 key 存在，尝试解析
            if (_isDataStoreFormat(legacyRaw)) {
              const parsed = JSON.parse(legacyRaw);
              return parsed.value;
            }
            // 裸值，尝试 JSON 解析
            try {
              return JSON.parse(legacyRaw);
            } catch (e) {
              return legacyRaw;
            }
          }
          return defaultValue;
        }

        // 已经是 DataStore 格式，校验并返回
        const value = _validateAndRecover(fullKey);
        if (value === null) return defaultValue;
        return value;
      } catch (e) {
        console.warn('[DataStore] Get failed for', fullKey, e);
        return defaultValue;
      }
    },

    /**
     * 保存数据
     * @param {string} key - 数据键
     * @param {*} value - 要保存的值
     * @param {string} category - 分类常量（默认 PROGRESS）
     * @returns {boolean} 是否成功
     */
    set(key, value, category) {
      if (!category) category = CATEGORIES.PROGRESS;

      const fullKey = _makeFullKey(key, category);

      try {
        // 先做备份轮转
        _rotateBackup(fullKey);

        // 构造包装对象
        const wrapped = {
          value: value,
          checksum: _computeChecksum(value),
          timestamp: Date.now(),
        };

        _setItem(fullKey, JSON.stringify(wrapped));
        return true;
      } catch (e) {
        console.warn('[DataStore] Set failed for', fullKey, e);
        return false;
      }
    },

    /**
     * 删除数据
     * @param {string} key - 数据键
     * @param {string} category - 分类常量（默认 PROGRESS）
     * @returns {boolean} 是否成功
     */
    remove(key, category) {
      if (!category) category = CATEGORIES.PROGRESS;

      const fullKey = _makeFullKey(key, category);

      try {
        _removeItem(fullKey);
        _removeItem(fullKey + BACKUP_A_SUFFIX);
        _removeItem(fullKey + BACKUP_B_SUFFIX);
        return true;
      } catch (e) {
        console.warn('[DataStore] Remove failed for', fullKey, e);
        return false;
      }
    },

    /**
     * 检查某个 key 是否存在
     * @param {string} key - 数据键
     * @param {string} category - 分类常量
     * @returns {boolean}
     */
    has(key, category) {
      if (!category) category = CATEGORIES.PROGRESS;
      const fullKey = _makeFullKey(key, category);
      try {
        return _getItem(fullKey) !== null
          || _getItem(key) !== null; // 兼容旧 key
      } catch (e) {
        return false;
      }
    },

    /**
     * 清除指定分类的所有数据
     * @param {string} category - 分类常量
     * @returns {number} 删除的条目数
     */
    clearCategory(category) {
      if (!category) return 0;

      const prefix = category + PREFIX_SEPARATOR;
      const keysToRemove = [];

      try {
        for (let i = 0; i < _storageLength(); i++) {
          const key = _storageKey(i);
          if (key && key.startsWith(prefix)) {
            keysToRemove.push(key);
          }
        }

        for (const key of keysToRemove) {
          _removeItem(key);
        }

        return keysToRemove.length;
      } catch (e) {
        console.warn('[DataStore] clearCategory failed:', e);
        return 0;
      }
    },

    /**
     * 获取分类下的所有 key
     * @param {string} category - 分类常量
     * @returns {string[]}
     */
    keys(category) {
      if (!category) return [];

      const prefix = category + PREFIX_SEPARATOR;
      const result = [];

      try {
        for (let i = 0; i < _storageLength(); i++) {
          const key = _storageKey(i);
          if (key && key.startsWith(prefix)) {
            const shortKey = key.substring(prefix.length);
            // 排除备份 key
            if (!shortKey.endsWith(BACKUP_A_SUFFIX) && !shortKey.endsWith(BACKUP_B_SUFFIX)) {
              result.push(shortKey);
            }
          }
        }
      } catch (e) {
        // 忽略
      }

      return result;
    },

    // 内部方法（暴露以方便测试/调试）
    _computeChecksum,
    _rotateBackup,
    _validateAndRecover,
    _makeFullKey,

    /**
     * 是否已初始化
     */
    get initialized() {
      return _initialized;
    },
  };

  // 暴露到全局

  // 兼容 CommonJS 环境（如 Node.js 测试）

export { DataStore };
