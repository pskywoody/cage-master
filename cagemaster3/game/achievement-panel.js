// AchievementPanel - 成就列表面板
// 深色主题，底部弹出（Bottom Sheet），按分类显示所有成就及统计信息

;(function(global) {
  'use strict';

  // 成就分类定义（fallback，当 ProgressManager 不可用时使用）
  const ACHIEVEMENT_CATEGORIES = {
    progress: { name: '进度类', icon: '📜', order: 1 },
    skill: { name: '技巧类', icon: '🎯', order: 2 },
    challenge: { name: '挑战类', icon: '🏆', order: 3 },
  };

  const STORAGE_KEY = 'cagedcipher_progress';

  class AchievementPanel {
    constructor(options) {
      this.options = options || {};
      this._isVisible = false;
      this._container = null;
      this._panel = null;
      this._onClose = this.options.onClose || null;
    }

    // === 公共 API ===

    show() {
      if (this._isVisible) return;
      this._isVisible = true;

      if (!this._container) {
        this._buildDOM();
      }

      this.refresh();
      this._container.style.display = 'flex';
      requestAnimationFrame(() => {
        this._container.style.opacity = '1';
        this._panel.style.transform = 'translateX(-50%) translateY(0)';
      });
    }

    hide() {
      if (!this._isVisible) return;
      this._isVisible = false;

      if (this._container) {
        this._container.style.opacity = '0';
        this._panel.style.transform = 'translateX(-50%) translateY(100%)';
        setTimeout(() => {
          if (this._container) {
            this._container.style.display = 'none';
          }
        }, 350);
      }

      if (this._onClose) {
        try { this._onClose(); } catch (e) {}
      }
    }

    toggle() {
      if (this._isVisible) {
        this.hide();
      } else {
        this.show();
      }
    }

    refresh() {
      if (!this._panel) return;
      this._renderStats();
      this._renderAchievements();
    }

    // === DOM 构建 ===

    _buildDOM() {
      // 遮罩层
      const overlay = document.createElement('div');
      overlay.id = 'achievement-panel-overlay';
      overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;' +
        'background:rgba(15,23,42,0.7);z-index:24000;display:none;' +
        'opacity:0;transition:opacity 0.3s ease;backdrop-filter:blur(4px);';
      overlay.addEventListener('click', () => this.hide());

      // 主面板（底部弹出 Bottom Sheet）
      const panel = document.createElement('div');
      panel.id = 'achievement-panel';
      panel.style.cssText = 'position:fixed;bottom:0;left:50%;width:100%;max-width:480px;' +
        'max-height:85vh;background:linear-gradient(180deg,#0f172a 0%,#1e293b 100%);' +
        'border-radius:20px 20px 0 0;' +
        'z-index:24001;transform:translateX(-50%) translateY(100%);' +
        'transition:transform 0.35s cubic-bezier(0.4,0,0.2,1);' +
        'display:flex;flex-direction:column;overflow:hidden;' +
        'box-shadow:0 -4px 24px rgba(0,0,0,0.4);';
      panel.addEventListener('click', (e) => e.stopPropagation());

      // 拖拽手柄
      const dragHandle = document.createElement('div');
      dragHandle.style.cssText = 'flex-shrink:0;display:flex;justify-content:center;padding:10px 0 6px;cursor:grab;' +
        'user-select:none;-webkit-user-select:none;';
      dragHandle.innerHTML = '<div style="width:36px;height:4px;' +
        'background:#334155;border-radius:2px;"></div>';
      panel.appendChild(dragHandle);

      // 头部
      const header = document.createElement('div');
      header.style.cssText = 'padding:24px 20px 16px;flex-shrink:0;' +
        'border-bottom:1px solid rgba(251,191,36,0.1);';
      header.innerHTML =
        '<div style="display:flex;align-items:center;justify-content:space-between;">' +
        '<div>' +
        '<div style="font-size:22px;font-weight:900;color:#f1f5f9;letter-spacing:3px;">🏆 成就</div>' +
        '<div id="ap-progress-text" style="font-size:13px;color:#64748b;margin-top:4px;letter-spacing:1px;">加载中...</div>' +
        '</div>' +
        '<button id="ap-close-btn" style="width:40px;height:40px;border:1px solid #334155;' +
        'background:#1e293b;color:#94a3b8;border-radius:10px;cursor:pointer;' +
        'font-size:16px;transition:all 0.2s;display:flex;align-items:center;justify-content:center;">✕</button>' +
        '</div>' +
        '<div id="ap-progress-bar" style="margin-top:14px;height:6px;background:#1e293b;' +
        'border-radius:3px;overflow:hidden;">' +
        '<div id="ap-progress-fill" style="height:100%;width:0%;' +
        'background:linear-gradient(90deg,#fbbf24,#f59e0b);border-radius:3px;' +
        'transition:width 0.6s ease;"></div>' +
        '</div>';

      // 统计信息区
      const stats = document.createElement('div');
      stats.id = 'ap-stats';
      stats.style.cssText = 'padding:16px 20px;flex-shrink:0;' +
        'display:grid;grid-template-columns:repeat(3,1fr);gap:10px;' +
        'border-bottom:1px solid rgba(251,191,36,0.08);';

      // 成就列表区（可滚动）
      const listContainer = document.createElement('div');
      listContainer.id = 'ap-list-container';
      listContainer.style.cssText = 'flex:1;overflow-y:auto;padding:16px 20px 24px;';
      listContainer.innerHTML = '<div id="ap-achievement-list"></div>';

      panel.appendChild(header);
      panel.appendChild(stats);
      panel.appendChild(listContainer);
      overlay.appendChild(panel);
      document.body.appendChild(overlay);

      this._container = overlay;
      this._panel = panel;

      // 绑定关闭按钮
      const closeBtn = document.getElementById('ap-close-btn');
      if (closeBtn) {
        closeBtn.addEventListener('click', () => this.hide());
        closeBtn.addEventListener('mouseenter', () => {
          closeBtn.style.background = '#334155';
          closeBtn.style.color = '#f1f5f9';
        });
        closeBtn.addEventListener('mouseleave', () => {
          closeBtn.style.background = '#1e293b';
          closeBtn.style.color = '#94a3b8';
        });
      }

      // ESC 键关闭
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this._isVisible) {
          this.hide();
        }
      });
    }

    // === 渲染统计 ===

    _renderStats() {
      const statsEl = document.getElementById('ap-stats');
      if (!statsEl) return;

      const defs = this._getAchievementDefs();
      const unlocked = this._getUnlockedIds();
      const totalDefs = Object.keys(defs).length;

      // 总游戏时长
      const totalPlayTime = this._estimateTotalPlayTime();
      const playHours = Math.floor(totalPlayTime / 60);
      const playMins = totalPlayTime % 60;

      // 总通关次数
      const clearCount = this._getClearCount();

      const stats = [
        { label: '已解锁', value: unlocked.length + '/' + totalDefs, icon: '🏆', color: '#fbbf24' },
        { label: '游戏时长', value: playHours > 0 ? playHours + 'h ' + playMins + 'm' : playMins + 'min', icon: '⏱️', color: '#60a5fa' },
        { label: '通关次数', value: clearCount, icon: '🎯', color: '#22c55e' },
      ];

      statsEl.innerHTML = stats.map(s =>
        '<div style="background:rgba(30,41,59,0.8);border:1px solid ' + s.color + '20;' +
        'border-radius:10px;padding:12px 8px;text-align:center;">' +
        '<div style="font-size:20px;margin-bottom:4px;">' + s.icon + '</div>' +
        '<div style="font-size:16px;font-weight:700;color:' + s.color + ';margin-bottom:2px;">' + s.value + '</div>' +
        '<div style="font-size:11px;color:#64748b;letter-spacing:1px;">' + s.label + '</div>' +
        '</div>'
      ).join('');

      // 更新进度条和文本
      const progressText = document.getElementById('ap-progress-text');
      const progressFill = document.getElementById('ap-progress-fill');
      const pct = totalDefs > 0 ? Math.round((unlocked.length / totalDefs) * 100) : 0;
      if (progressText) {
        progressText.textContent = '已解锁 ' + unlocked.length + ' / ' + totalDefs + ' 个成就 · ' + pct + '%';
      }
      if (progressFill) {
        progressFill.style.width = pct + '%';
      }
    }

    // === 渲染成就列表 ===

    _renderAchievements() {
      const listEl = document.getElementById('ap-achievement-list');
      if (!listEl) return;

      const defs = this._getAchievementDefs();
      const unlockedIds = this._getUnlockedIds();

      // 按分类组织
      const categories = {};
      for (const id in defs) {
        const def = defs[id];
        const cat = def.category || 'challenge';
        if (!categories[cat]) categories[cat] = [];
        categories[cat].push(id);
      }

      let html = '';

      // 按分类顺序渲染
      const catOrder = Object.keys(ACHIEVEMENT_CATEGORIES).sort(
        (a, b) => ACHIEVEMENT_CATEGORIES[a].order - ACHIEVEMENT_CATEGORIES[b].order
      );

      for (const catKey of catOrder) {
        const catIds = categories[catKey];
        if (!catIds || catIds.length === 0) continue;

        const catInfo = ACHIEVEMENT_CATEGORIES[catKey];
        const unlockedInCat = catIds.filter(id => unlockedIds.indexOf(id) !== -1).length;

        html +=
          '<div style="margin-bottom:20px;">' +
          '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">' +
          '<span style="font-size:14px;">' + catInfo.icon + '</span>' +
          '<span style="font-size:13px;font-weight:700;color:#94a3b8;letter-spacing:2px;">' +
          catInfo.name + '</span>' +
          '<span style="font-size:11px;color:#475569;margin-left:auto;">' +
          unlockedInCat + '/' + catIds.length + '</span>' +
          '</div>' +
          '<div style="display:grid;grid-template-columns:1fr;gap:8px;">';

        for (const id of catIds) {
          const def = defs[id];
          if (!def) continue;
          const isUnlocked = unlockedIds.indexOf(id) !== -1;
          const unlockTime = this._getAchievementUnlockTime(id);

          html += this._renderAchievementCard(def, isUnlocked, unlockTime);
        }

        html += '</div></div>';
      }

      listEl.innerHTML = html;
    }

    _renderAchievementCard(def, isUnlocked, unlockTime) {
      const borderColor = isUnlocked ? 'rgba(251,191,36,0.4)' : '#1e293b';
      const bgColor = isUnlocked
        ? 'linear-gradient(135deg,rgba(251,191,36,0.08),rgba(30,41,59,0.6))'
        : 'rgba(15,23,42,0.6)';
      const nameColor = isUnlocked ? '#fef3c7' : '#475569';
      const descColor = isUnlocked ? '#94a3b8' : '#334155';
      const iconOpacity = isUnlocked ? '1' : '0.25';
      const statusBadge = isUnlocked
        ? '<div style="font-size:10px;color:#22c55e;font-weight:700;padding:2px 6px;' +
          'background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3);border-radius:4px;letter-spacing:1px;">已解锁</div>'
        : '<div style="font-size:10px;color:#475569;padding:2px 6px;' +
          'background:rgba(71,85,105,0.1);border:1px solid rgba(71,85,105,0.3);border-radius:4px;letter-spacing:1px;">未解锁</div>';

      const timeText = (isUnlocked && unlockTime)
        ? '<div style="font-size:10px;color:#475569;margin-top:2px;">' + this._formatDate(unlockTime) + '</div>'
        : '';

      const descText = isUnlocked ? def.desc : '???';

      return (
        '<div style="display:flex;align-items:center;gap:12px;padding:12px 14px;' +
        'background:' + bgColor + ';' +
        'border:1px solid ' + borderColor + ';' +
        'border-radius:10px;transition:all 0.2s;">' +
        '<div style="font-size:32px;opacity:' + iconOpacity + ';flex-shrink:0;min-width:40px;text-align:center;">' +
        def.icon + '</div>' +
        '<div style="flex:1;min-width:0;">' +
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:2px;">' +
        '<div style="font-size:14px;font-weight:700;color:' + nameColor + ';' +
        'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + def.name + '</div>' +
        statusBadge +
        '</div>' +
        '<div style="font-size:12px;color:' + descColor + ';line-height:1.4;">' + descText + '</div>' +
        timeText +
        '</div>' +
        '</div>'
      );
    }

    // === 数据获取 ===

    _getProgressData() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) return JSON.parse(raw);
      } catch (e) {}
      return { achievements: [], levelScores: {} };
    }

    _getAchievementDefs() {
      if (global.ProgressManager && typeof ProgressManager.getAchievementDefs === 'function') {
        return ProgressManager.getAchievementDefs();
      }
      // 备用定义（当 ProgressManager 不可用时使用）
      return {
        first_clear: { id: 'first_clear', name: '初出茅庐', desc: '首次通关任意关卡', icon: '🎯', category: 'progress' },
        chapter2_clear: { id: 'chapter2_clear', name: '深入险境', desc: '通关第2章所有普通关卡', icon: '🔥', category: 'progress' },
        chapter3_clear: { id: 'chapter3_clear', name: '迷雾渐开', desc: '通关第3章所有普通关卡', icon: '🌫️', category: 'progress' },
        chapter4_clear: { id: 'chapter4_clear', name: '真相逼近', desc: '通关第4章所有普通关卡', icon: '🔍', category: 'progress' },
        chapter5_clear: { id: 'chapter5_clear', name: '终局将至', desc: '通关第5章所有普通关卡', icon: '⚔️', category: 'progress' },
        all_chapters_clear: { id: 'all_chapters_clear', name: '全线通关', desc: '通关全部8章普通关卡', icon: '👑', category: 'progress' },
        chapter1_s: { id: 'chapter1_s', name: '完美入门', desc: '第一章所有关卡S级通关', icon: '⭐', category: 'progress' },
        all_hidden: { id: 'all_hidden', name: '密信收藏家', desc: '解锁所有隐藏关', icon: '📜', category: 'progress' },
        no_hint_ch1: { id: 'no_hint_ch1', name: '独立思考', desc: '第一章某关不使用提示通关', icon: '🧠', category: 'skill' },
        first_rule45: { id: 'first_rule45', name: '星衡初悟', desc: '首次使用45法则推导出正确数字', icon: '⚖️', category: 'skill' },
        naked_pair_master: { id: 'naked_pair_master', name: '数对大师', desc: '使用裸数对技巧正确填数累计10次', icon: '🔗', category: 'skill' },
        pointing_pair_pro: { id: 'pointing_pair_pro', name: '区块专家', desc: '使用区块排除正确填数累计10次', icon: '🎯', category: 'skill' },
        cage_sum_expert: { id: 'cage_sum_expert', name: '笼和达人', desc: '使用笼和推导正确填数累计20次', icon: '🧮', category: 'skill' },
        note_master: { id: 'note_master', name: '笔记狂人', desc: '单关标记超过50个候选数', icon: '📝', category: 'skill' },
        speed_demon: { id: 'speed_demon', name: '疾风侦探', desc: '任意关卡在2分钟内完成', icon: '⚡', category: 'challenge' },
        speed_5min: { id: 'speed_5min', name: '神速解谜', desc: '5分钟内通关任意9×9关卡', icon: '🚀', category: 'challenge' },
        flawless_victory: { id: 'flawless_victory', name: '完美无瑕', desc: '单关零错误通关', icon: '💎', category: 'challenge' },
        no_hint_run: { id: 'no_hint_run', name: '连胜达人', desc: '连续3关不使用提示通关', icon: '🔥', category: 'challenge' },
        persistent: { id: 'persistent', name: '坚持不懈', desc: '累计游戏时长超过1小时', icon: '⏳', category: 'challenge' },
        true_ending: { id: 'true_ending', name: '星辰传人', desc: '达成真结局', icon: '✨', category: 'challenge' },
      };
    }

    _getUnlockedIds() {
      if (global.ProgressManager && typeof ProgressManager.getAchievements === 'function') {
        return ProgressManager.getAchievements();
      }
      const data = this._getProgressData();
      return data.achievements || [];
    }

    _getAchievementUnlockTime(achievementId) {
      // 优先从 ProgressManager 获取解锁时间
      if (global.ProgressManager && typeof ProgressManager.getAchievementUnlockTime === 'function') {
        return ProgressManager.getAchievementUnlockTime(achievementId);
      }
      // fallback：从 localStorage 读取旧格式的解锁时间
      try {
        const raw = localStorage.getItem(STORAGE_KEY + '_times');
        if (raw) {
          const times = JSON.parse(raw);
          return times[achievementId] || null;
        }
      } catch (e) {}
      return null;
    }

    _estimateTotalPlayTime() {
      // 优先从 ProgressManager 获取精确的累计游戏时长
      if (global.ProgressManager && typeof ProgressManager.getTotalPlayTime === 'function') {
        const totalSeconds = ProgressManager.getTotalPlayTime();
        return Math.round(totalSeconds / 60); // 返回分钟数
      }
      // fallback：基于所有关卡的通关时间估算总游戏时长
      const data = this._getProgressData();
      const scores = data.levelScores || {};
      let totalSeconds = 0;
      for (const key in scores) {
        if (scores[key] && typeof scores[key].time === 'number') {
          totalSeconds += scores[key].time;
        }
      }
      // 加上估算的思考/重试时间（每关额外 50%）
      totalSeconds = Math.round(totalSeconds * 1.5);
      return Math.round(totalSeconds / 60); // 返回分钟数
    }

    _getClearCount() {
      // 优先从 ProgressManager 获取已通关关卡数
      if (global.ProgressManager && ProgressManager._data && ProgressManager._data.levelScores) {
        return Object.keys(ProgressManager._data.levelScores).length;
      }
      // fallback：从 localStorage 读取
      const data = this._getProgressData();
      const scores = data.levelScores || {};
      return Object.keys(scores).length;
    }

    // === 工具方法 ===

    _formatDate(timestamp) {
      try {
        const d = new Date(timestamp);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return y + '.' + m + '.' + day;
      } catch (e) {
        return '';
      }
    }
  }

  global.AchievementPanel = AchievementPanel;

})(window);
