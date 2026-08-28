// ==========================================
// achievement-panel.js - V4 UI 层：AchievementPanel 成就面板
// ==========================================
// 说明：
//   ui/achievement-panel.js 展示 6 个喜剧成就的解锁状态，
//   通过 core/data-store.js 的 DataStore 持久化解锁数据（分类 ACHIEVEMENT）：
//     DataStore.get('comedy', DataStore.ACHIEVEMENT, {})  // 成就对象 { id: { name, desc, unlockedAt } }
//     DataStore.set('comedy', {...}, DataStore.ACHIEVEMENT)
//   方法：
//     open() / close() / toggle() / getAllAchievements()
//   内置 6 个 Boss 战喜剧成就定义。
//
// 环境约束：
//   - 纯 ES Module 语法；无模块顶层 DOM 访问（Node import 不报错）。
// ==========================================

import { DataStore } from '../core/data-store.js';
import I18n from '../i18n/i18n.js';

export class AchievementPanel {
  /**
   * 成就分组（按玩法）。组顺序即面板展示顺序。
   * group 字段用于把 ACHIEVEMENTS 划分到对应玩法栏目。
   * @returns {Array<{ id, name, icon }>} 只读副本
   */
  static get GROUPS() {
    return [
      { id: 'boss',     name: I18n.t('ui.achievement.group.boss'),     icon: '⚔️' },
      { id: 'traitor',  name: I18n.t('ui.achievement.group.traitor'),  icon: '🕵️' },
      { id: 'clue',     name: I18n.t('ui.achievement.group.clue'),     icon: '🔔' },
      { id: 'cipher',   name: I18n.t('ui.achievement.group.cipher'),   icon: '🔐' },
      { id: 'evac',     name: I18n.t('ui.achievement.group.evac'),     icon: '🚪' },
      { id: 'bomb',     name: I18n.t('ui.achievement.group.bomb'),     icon: '🧨' },
      { id: 'extract',  name: I18n.t('ui.achievement.group.extract'),  icon: '🔍' },
      { id: 'silent',   name: I18n.t('ui.achievement.group.silent'),   icon: '📻' },
      { id: 'special',  name: I18n.t('ui.achievement.group.special'),  icon: '🏆' },
    ];
  }

  /**
   * 内置成就定义（Boss 喜剧 / tpl / 异形玩法分组）
   * @returns {Array<Object>} 只读副本
   */
  static get ACHIEVEMENTS() {
    return [
      // —— 组：Boss 战 ——
      { id: 'hand_slippery',  group: 'boss', name: I18n.t('ui.achievement.item.handSlippery.name'),  desc: I18n.t('ui.achievement.item.handSlippery.desc'),  icon: '🤷' },
      { id: 'thief_king',     group: 'boss', name: I18n.t('ui.achievement.item.thiefKing.name'),     desc: I18n.t('ui.achievement.item.thiefKing.desc'),     icon: '🦹' },
      { id: 'epic_comeback',  group: 'boss', name: I18n.t('ui.achievement.item.epicComeback.name'),  desc: I18n.t('ui.achievement.item.epicComeback.desc'),  icon: '⚡' },
      { id: 'blitzkrieg',     group: 'boss', name: I18n.t('ui.achievement.item.blitzkrieg.name'),    desc: I18n.t('ui.achievement.item.blitzkrieg.desc'),    icon: '💨' },
      { id: 'noob_battle',    group: 'boss', name: I18n.t('ui.achievement.item.noobBattle.name'),    desc: I18n.t('ui.achievement.item.noobBattle.desc'),    icon: '🥚' },
      { id: 'perfect_win',    group: 'boss', name: I18n.t('ui.achievement.item.perfectWin.name'),    desc: I18n.t('ui.achievement.item.perfectWin.desc'),    icon: '👑' },
      // v2.0：tpl 三点连线 Boss 战胜利路径成就
      { id: 'tpl_line_win',   group: 'boss', name: I18n.t('ui.achievement.item.tplLineWin.name'),    desc: I18n.t('ui.achievement.item.tplLineWin.desc'),    icon: '⚡' },
      { id: 'tpl_full_board', group: 'boss', name: I18n.t('ui.achievement.item.tplFullBoard.name'),  desc: I18n.t('ui.achievement.item.tplFullBoard.desc'),  icon: '🎯' },
      { id: 'tpl_force_settle', group: 'boss', name: I18n.t('ui.achievement.item.tplForceSettle.name'), desc: I18n.t('ui.achievement.item.tplForceSettle.desc'), icon: '⚖️' },
      // —— 组：异形玩法（按玩法分组，V4.3.40）——
      { id: 'traitor_first_win', group: 'traitor', name: I18n.t('ui.achievement.item.traitorFirstWin.name'), desc: I18n.t('ui.achievement.item.traitorFirstWin.desc'), icon: '🕵️' },
      { id: 'clue_first_win',    group: 'clue',    name: I18n.t('ui.achievement.item.clueFirstWin.name'),    desc: I18n.t('ui.achievement.item.clueFirstWin.desc'),    icon: '🔔' },
      { id: 'cipher_first_win',  group: 'cipher',  name: I18n.t('ui.achievement.item.cipherFirstWin.name'),  desc: I18n.t('ui.achievement.item.cipherFirstWin.desc'),  icon: '🔐' },
      { id: 'evac_first_win',    group: 'evac',    name: I18n.t('ui.achievement.item.evacFirstWin.name'),    desc: I18n.t('ui.achievement.item.evacFirstWin.desc'),    icon: '🚪' },
      { id: 'bomb_first_win',    group: 'bomb',    name: I18n.t('ui.achievement.item.bombFirstWin.name'),    desc: I18n.t('ui.achievement.item.bombFirstWin.desc'),    icon: '🧨' },
      { id: 'extract_first_win', group: 'extract', name: I18n.t('ui.achievement.item.extractFirstWin.name'), desc: I18n.t('ui.achievement.item.extractFirstWin.desc'), icon: '🔍' },
      { id: 'silent_first_win',  group: 'silent',  name: I18n.t('ui.achievement.item.silentFirstWin.name'),  desc: I18n.t('ui.achievement.item.silentFirstWin.desc'),  icon: '📻' },
      // —— 组：异形玩法全通 ——
      { id: 'special_all_first_win', group: 'special', name: I18n.t('ui.achievement.item.specialAllFirstWin.name'), desc: I18n.t('ui.achievement.item.specialAllFirstWin.desc'), icon: '🏆' },
    ];
  }

  /**
   * @param {Object} options
   * @param {HTMLElement} [options.container] - 挂载容器（可选；缺省为浮动层）
   * @param {Object}      [options.dataStore] - 可注入的 DataStore（默认 core/data-store.js）
   * @param {Function}    [options.onChange] - 解锁状态变更回调 (id, unlocked) => void
   */
  constructor(options) {
    options = options || {};

    /** @type {HTMLElement|null} */
    this._container = options.container || null;

    /** @type {Object} */
    this._dataStore = options.dataStore || DataStore;

    /** @type {Function|null} */
    this.onChange = typeof options.onChange === 'function' ? options.onChange : null;

    /** @type {boolean} */
    this._isOpen = false;

    /** @type {HTMLElement|null} */
    this._panel = null;
    this._stylesInjected = false;
  }

  // ============================================================
  //  读取解锁数据
  // ============================================================

  /**
   * 从 DataStore.ACHIEVEMENT 读取成就数据
   * @returns {Object} { id: { name, desc, unlockedAt } }
   */
  _loadData() {
    try {
      return this._dataStore.get('comedy', DataStore.ACHIEVEMENT, {});
    } catch (e) {
      console.warn('[AchievementPanel] load failed:', e);
      return {};
    }
  }

  /**
   * 获取全部成就（附带解锁状态）
   * @returns {Array<{ id, name, desc, icon, unlocked, unlockedAt }>}
   */
  getAllAchievements() {
    try {
      const data = this._loadData();
      return AchievementPanel.ACHIEVEMENTS.map((def) => {
        const record = data[def.id];
        return {
          id: def.id,
          group: def.group || '',
          name: def.name,
          desc: def.desc,
          icon: def.icon,
          unlocked: !!record,
          unlockedAt: record ? record.unlockedAt : null,
        };
      });
    } catch (e) {
      console.warn('[AchievementPanel] getAllAchievements error:', e);
      return [];
    }
  }

  /**
   * 获取成就统计
   * @returns {{ total: number, unlocked: number, progress: number }}
   */
  getStats() {
    try {
      const all = this.getAllAchievements();
      const unlocked = all.filter((a) => a.unlocked).length;
      return {
        total: all.length,
        unlocked: unlocked,
        progress: all.length > 0 ? Math.round(unlocked / all.length * 100) : 0,
      };
    } catch (e) {
      console.warn('[AchievementPanel] getStats error:', e);
      return { total: 0, unlocked: 0, progress: 0 };
    }
  }

  // ============================================================
  //  显示 / 隐藏
  // ============================================================

  /**
   * 打开成就面板
   * @returns {boolean}
   */
  open() {
    try {
      if (typeof document === 'undefined') return false;
      this._ensurePanel();
      if (!this._panel) return false;
      this._panel.innerHTML = '';
      const content = this._buildContent();
      if (content) this._panel.appendChild(content);
      this._panel.style.display = 'block';
      this._isOpen = true;
      // 上线审计修复：Escape 关闭浮动面板
      this._bindEscape();
      return true;
    } catch (e) {
      console.warn('[AchievementPanel] open error:', e);
      return false;
    }
  }

  /**
   * 上线审计修复：Escape 关闭面板（单次绑定）
   */
  _bindEscape() {
    try {
      if (this._escapeBound) return;
      this._escapeBound = true;
      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this._isOpen) {
          e.preventDefault();
          this.close();
        }
      });
    } catch (e) { /* 忽略 */ }
  }

  /**
   * 关闭成就面板
   */
  close() {
    try {
      if (this._panel) this._panel.style.display = 'none';
      this._isOpen = false;
    } catch (e) {
      console.warn('[AchievementPanel] close error:', e);
    }
  }

  /**
   * 是否打开
   * @returns {boolean}
   */
  isOpen() {
    return this._isOpen;
  }

  /**
   * 切换开/关
   */
  toggle() {
    try {
      if (this._isOpen) this.close();
      else this.open();
    } catch (e) {
      console.warn('[AchievementPanel] toggle error:', e);
    }
  }

  // ============================================================
  //  DOM
  // ============================================================

  /**
   * 惰性构建面板骨架
   */
  _ensurePanel() {
    if (this._panel || typeof document === 'undefined') return;
    this._injectStyles();

    const panel = document.createElement('div');
    panel.className = 'cm-achievement';
    panel.style.display = 'none';

    if (this._container) {
      this._container.appendChild(panel);
    } else {
      document.body.appendChild(panel);
    }
    this._panel = panel;
  }

  /**
   * 构建成就面板内容
   */
  _buildContent() {
    try {
      const wrap = document.createElement('div');

      // 头部
      const header = document.createElement('div');
      header.className = 'cm-ach-header';
      const stats = this.getStats();
      header.innerHTML =
        '<span class="cm-ach-title">' + I18n.t('ui.achievement.title') + '</span>' +
        '<span class="cm-ach-count">' + stats.unlocked + '/' + stats.total +
        ' (' + stats.progress + '%)</span>';
      const closeBtn = document.createElement('button');
      closeBtn.className = 'cm-ach-close';
      closeBtn.textContent = '\u00D7';
      closeBtn.addEventListener('click', () => this.close());
      header.appendChild(closeBtn);
      wrap.appendChild(header);

      // 列表：按玩法分组渲染（异形玩法栏目化）
      const list = document.createElement('div');
      list.className = 'cm-ach-list';

      const items = this.getAllAchievements();
      const groups = AchievementPanel.GROUPS;
      for (const g of groups) {
        const groupItems = items.filter((it) => it.group === g.id);
        if (groupItems.length === 0) continue;
        const sec = document.createElement('div');
        sec.className = 'cm-ach-group';
        const head = document.createElement('div');
        head.className = 'cm-ach-group-head';
        head.textContent = g.icon + ' ' + g.name;
        sec.appendChild(head);
        for (const item of groupItems) {
          sec.appendChild(this._buildCard(item));
        }
        list.appendChild(sec);
      }
      wrap.appendChild(list);
      return wrap;
    } catch (e) {
      console.warn('[AchievementPanel] _buildContent error:', e);
      const fb = document.createElement('div');
      fb.textContent = I18n.t('ui.achievement.loadError');
      return fb;
    }
  }

  /**
   * 构建单个成就卡片
   */
  _buildCard(item) {
    try {
      const card = document.createElement('div');
      card.className = 'cm-ach-card' + (item.unlocked ? ' cm-ach-card--unlocked' : '');

      // 图标区
      const icon = document.createElement('div');
      icon.className = 'cm-ach-icon';
      icon.textContent = item.unlocked ? item.icon : '🔒';

      // 信息区
      const info = document.createElement('div');
      info.className = 'cm-ach-info';

      const name = document.createElement('div');
      name.className = 'cm-ach-name';
      name.textContent = item.unlocked ? item.name : '???';

      const desc = document.createElement('div');
      desc.className = 'cm-ach-desc';
      desc.textContent = item.unlocked ? item.desc : I18n.t('ui.achievement.lockedDesc');

      if (item.unlocked && item.unlockedAt) {
        const time = document.createElement('div');
        time.className = 'cm-ach-time';
        try {
          time.textContent = new Date(item.unlockedAt).toLocaleString('zh-CN', {
            month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
          });
        } catch (e) {
          time.textContent = '';
        }
        info.appendChild(name);
        info.appendChild(desc);
        info.appendChild(time);
      } else {
        info.appendChild(name);
        info.appendChild(desc);
      }

      card.appendChild(icon);
      card.appendChild(info);
      return card;
    } catch (e) {
      console.warn('[AchievementPanel] _buildCard error:', e);
      const fb = document.createElement('div');
      fb.className = 'cm-ach-card';
      fb.textContent = I18n.t('ui.achievement.cardError');
      return fb;
    }
  }

  /**
   * 注入默认样式
   */
  _injectStyles() {
    if (this._stylesInjected || typeof document === 'undefined') return;
    this._stylesInjected = true;

    const style = document.createElement('style');
    style.id = 'cm-achievement-style';
    style.textContent = [
      '/* P1：成就面板 = 档案页（旧纸底 + 纹理叠层 + 墨描边） */',
      '.cm-achievement { position: fixed; right: 20px; top: 20px; width: 360px; max-width: calc(100vw - 24px);',
      '  max-height: 86vh;',
      '  overflow-y: auto; z-index: 9500; background-color: #f5f0e0; background-image:',
      '  repeating-linear-gradient(45deg, rgba(200,190,170,.03) 0px, rgba(200,190,170,.03) 1px, transparent 1px, transparent 3px),',
      '  radial-gradient(ellipse at 20% 30%, rgba(184,168,136,.05) 0%, transparent 60%);',
      '  border: 1px solid rgba(61,47,34,.5); border-radius: 8px;',
      '  box-shadow: 0 10px 30px rgba(0,0,0,.45), inset 0 0 0 1px rgba(255,255,255,.28), inset 0 0 20px rgba(120,100,70,.16);',
      '  padding: 16px 18px; color: #3d2f22; }',
      '.cm-ach-header { display: flex; align-items: center; gap: 10px; margin-bottom: 12px;',
      '  padding-bottom: 8px; border-bottom: 1px solid rgba(90,70,40,.4); }',
      '.cm-ach-title { font-size: 16px; font-weight: 700; color: #3d2a1a; font-family: \'ZCOOL XiaoWei\',\'KaiTi\',\'楷体\',serif; letter-spacing: 2px; }',
      '.cm-ach-count { font-size: 13px; color: var(--color-ink-muted); flex: 1; }',
      '.cm-ach-close { border: 1px solid rgba(90,70,40,.5); background: rgba(255,255,255,.25); color: #5a4630;',
      '  border-radius: 5px; width: 26px; height: 26px; cursor: pointer; font-size: 15px; line-height: 1; }',
      '.cm-ach-close:hover { border-color: #b8860b; color: #3d2a1a; }',
      '.cm-ach-list { display: flex; flex-direction: column; gap: 8px; }',
      '.cm-ach-group { display: flex; flex-direction: column; gap: 6px; }',
      '.cm-ach-group-head { font-size: 13px; font-weight: 700; color: #6b4f2a; letter-spacing: 1px;',
      '  padding: 2px 2px 3px; margin-top: 4px; border-bottom: 1px dashed rgba(120,100,60,.45); }',
      '.cm-ach-card { display: flex; gap: 10px; padding: 10px; border: 1px solid rgba(90,70,40,.3);',
      '  border-radius: 6px; background: rgba(237,229,208,.7); opacity: .6; filter: grayscale(.4); }',
      '.cm-ach-card--unlocked { opacity: 1; filter: none; border-color: rgba(184,134,11,.6); }',
      '.cm-ach-icon { flex-shrink: 0; width: 42px; height: 42px; border-radius: 6px;',
      '  background: #a08a70; color: #f5f0e0; font-size: 20px; display: flex; align-items: center;',
      '  justify-content: center; }',
      '.cm-ach-card--unlocked .cm-ach-icon { background: #b8860b; }',
      '.cm-ach-info { min-width: 0; flex: 1; }',
      '.cm-ach-name { font-size: 13px; font-weight: 600; color: #3a3229; }',
      '.cm-ach-desc { font-size: 12px; color: var(--color-ink-muted); line-height: 1.5; margin-top: 3px; }',
      '.cm-ach-time { font-size: 10px; color: #a08a70; margin-top: 4px; }',
    ].join('\n');
    document.head.appendChild(style);
  }
}

export default AchievementPanel;