// ==========================================
// 剧情系统 - Story System
// ==========================================
// 功能：
//   1. StoryModal 组件：视觉小说风格对话框（角色+台词+打字机效果）
//   2. BadgeAward 组件：徽章获得动画弹窗
//   3. StoryManager：剧情播放管理，对接引导系统
// ==========================================

// ==========================================
// StoryModal 组件：剧情对话框
// ==========================================
// 仿视觉小说的对话框，支持：
//   - 角色头像/名称
//   - 打字机逐字显示效果
//   - 多段对话，点击/按回车继续
//   - 章节标题卡（无角色，全屏文字）
class StoryModal {
  constructor() {
    this.el = null;
    this.characterEl = null;
    this.nameEl = null;
    this.dialogueEl = null;
    this.continueEl = null;
    this._typewriterTimer = null;
    this._currentText = '';
    this._isTyping = false;
    this._dialogues = [];
    this._currentIndex = 0;
    this._onComplete = null;
    this._build();
  }

  _build() {
    this.el = document.createElement('div');
    this.el.className = 'story-modal';
    this.el.style.display = 'none';

    // 背景遮罩（半透明黑色）
    const overlay = document.createElement('div');
    overlay.className = 'story-modal-overlay';

    // 内容容器
    const content = document.createElement('div');
    content.className = 'story-modal-content';

    // 角色立绘区（左侧大图标）
    this.characterEl = document.createElement('div');
    this.characterEl.className = 'story-character';

    // 对话框（右侧）
    const dialogBox = document.createElement('div');
    dialogBox.className = 'story-dialog-box';

    // 角色名
    this.nameEl = document.createElement('div');
    this.nameEl.className = 'story-character-name';

    // 台词
    this.dialogueEl = document.createElement('div');
    this.dialogueEl.className = 'story-dialogue';

    // 继续提示
    this.continueEl = document.createElement('div');
    this.continueEl.className = 'story-continue-hint';
    this.continueEl.innerHTML = '▼ 点击继续';

    dialogBox.appendChild(this.nameEl);
    dialogBox.appendChild(this.dialogueEl);
    dialogBox.appendChild(this.continueEl);

    content.appendChild(this.characterEl);
    content.appendChild(dialogBox);

    this.el.appendChild(overlay);
    this.el.appendChild(content);

    // 点击继续
    const advance = (e) => {
      e.stopPropagation();
      this._advance();
    };
    this.el.addEventListener('click', advance);

    // 键盘支持
    this._keyHandler = (e) => {
      if (this.el.style.display !== 'none' && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        this._advance();
      }
    };
    document.addEventListener('keydown', this._keyHandler);

    document.body.appendChild(this.el);
  }

  /**
   * 播放剧情对话
   * @param {Array} dialogues - 对话数组
   * 每项格式：
   *   { character: '大师手记', icon: '📜', text: '...' }
   *   或 { type: 'title', text: '第一章：xxx', subtitle: 'xxx' }
   * @param {Function} onComplete - 全部播放完回调
   */
  play(dialogues, onComplete = null) {
    if (!dialogues || dialogues.length === 0) {
      if (onComplete) onComplete();
      return;
    }
    this._dialogues = dialogues;
    this._currentIndex = 0;
    this._onComplete = onComplete;

    this.el.style.display = 'flex';
    requestAnimationFrame(() => {
      this.el.classList.add('active');
    });

    this._showCurrent();
  }

  _showCurrent() {
    const dlg = this._dialogues[this._currentIndex];

    // 标题卡类型
    if (dlg.type === 'title') {
      this.characterEl.style.display = 'none';
      this.nameEl.style.display = 'none';
      this.dialogueEl.style.textAlign = 'center';
      this.dialogueEl.style.fontSize = '22px';
      this.dialogueEl.style.fontWeight = '700';
      this.dialogueEl.innerHTML = `<div style="font-size:28px; margin-bottom:8px;">${dlg.text || ''}</div><div style="font-size:14px; font-weight:400; color:#94a3b8;">${dlg.subtitle || ''}</div>`;
      this.continueEl.style.display = 'block';
      // 标题卡隐藏尾巴
      this.el.classList.add('no-tail');
      return;
    }

    // 普通对话
    this.characterEl.style.display = 'flex';
    this.nameEl.style.display = 'block';
    this.dialogueEl.style.textAlign = 'left';
    this.dialogueEl.style.fontSize = '';
    this.dialogueEl.style.fontWeight = '';
    // 普通对话显示尾巴
    this.el.classList.remove('no-tail');

    this.characterEl.textContent = dlg.icon || '📁';
    this.nameEl.textContent = dlg.character || '档案侦探';

    // 打字机效果
    this._currentText = dlg.text || '';
    this._startTypewriter();
    this.continueEl.style.display = 'none';
  }

  _startTypewriter() {
    this._isTyping = true;
    this.dialogueEl.textContent = '';
    let i = 0;
    const text = this._currentText;

    const type = () => {
      if (i < text.length) {
        this.dialogueEl.textContent += text.charAt(i);
        i++;
        this._typewriterTimer = setTimeout(type, 30);
      } else {
        this._isTyping = false;
        this.continueEl.style.display = 'block';
      }
    };
    type();
  }

  _skipTypewriter() {
    if (this._typewriterTimer) {
      clearTimeout(this._typewriterTimer);
      this._typewriterTimer = null;
    }
    this.dialogueEl.textContent = this._currentText;
    this._isTyping = false;
    this.continueEl.style.display = 'block';
  }

  _advance() {
    // 如果正在打字，先显示完整文字
    if (this._isTyping) {
      this._skipTypewriter();
      return;
    }

    this._currentIndex++;

    if (this._currentIndex >= this._dialogues.length) {
      this._finish();
    } else {
      this._showCurrent();
    }
  }

  _finish() {
    this.el.classList.remove('active');
    setTimeout(() => {
      this.el.style.display = 'none';
      const cb = this._onComplete;
      this._onComplete = null;
      if (cb) cb();
    }, 200);
  }

  destroy() {
    if (this._typewriterTimer) clearTimeout(this._typewriterTimer);
    document.removeEventListener('keydown', this._keyHandler);
    if (this.el && this.el.parentNode) {
      this.el.parentNode.removeChild(this.el);
    }
    this.el = null;
  }
}

// ==========================================
// BadgeAward 组件：徽章获得动画
// ==========================================
class BadgeAward {
  constructor() {
    this.el = null;
    this._build();
  }

  _build() {
    this.el = document.createElement('div');
    this.el.className = 'badge-award-modal';
    this.el.style.display = 'none';

    const overlay = document.createElement('div');
    overlay.className = 'badge-award-overlay';

    const card = document.createElement('div');
    card.className = 'badge-award-card';

    const title = document.createElement('div');
    title.className = 'badge-award-title';
    title.textContent = '🏅 获得徽章';

    const icon = document.createElement('div');
    icon.className = 'badge-award-icon';
    this.iconEl = icon;

    const name = document.createElement('div');
    name.className = 'badge-award-name';
    this.nameEl = name;

    const desc = document.createElement('div');
    desc.className = 'badge-award-desc';
    this.descEl = desc;

    const btn = document.createElement('button');
    btn.className = 'badge-award-btn';
    btn.textContent = '收下';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.close();
    });

    card.appendChild(title);
    card.appendChild(icon);
    card.appendChild(name);
    card.appendChild(desc);
    card.appendChild(btn);

    this.el.appendChild(overlay);
    this.el.appendChild(card);

    this.el.addEventListener('click', (e) => {
      e.stopPropagation();
      this.close();
    });

    document.body.appendChild(this.el);
  }

  show(badgeData, onClose = null) {
    this.iconEl.textContent = badgeData.icon || '🏅';
    this.nameEl.textContent = badgeData.name || '新徽章';
    this.descEl.textContent = badgeData.description || '';
    this._onClose = onClose;

    this.el.style.display = 'flex';
    requestAnimationFrame(() => {
      this.el.classList.add('active');
    });
  }

  close() {
    this.el.classList.remove('active');
    setTimeout(() => {
      this.el.style.display = 'none';
      const cb = this._onClose;
      this._onClose = null;
      if (cb) cb();
    }, 200);
  }

  destroy() {
    if (this.el && this.el.parentNode) {
      this.el.parentNode.removeChild(this.el);
    }
    this.el = null;
  }
}

// ==========================================
// StoryManager：剧情管理器
// ==========================================
// 对接引导系统和关卡数据，负责：
//   - 章节开场剧情（进入第一章第一关时）
//   - 章末收尾剧情（通关章节最后一关时）
//   - 徽章颁发
class StoryManager {
  constructor() {
    this.modal = new StoryModal();
    this.badgeAward = new BadgeAward();
  }

  /**
   * 播放章节开场剧情
   * @param {Object} chapter - 章节数据
   * @param {Function} onComplete
   */
  playChapterIntro(chapter, onComplete) {
    const story = chapter.introStory || [];
    if (story.length === 0) {
      if (onComplete) onComplete();
      return;
    }
    this.modal.play(story, onComplete);
  }

  /**
   * 播放章节收尾剧情
   * @param {Object} chapter - 章节数据
   * @param {Function} onComplete
   */
  playChapterEnding(chapter, onComplete) {
    const story = chapter.endingStory || [];
    const badgeData = chapter.badge || null;

    const playEnding = () => {
      if (story.length === 0) {
        awardBadge();
      } else {
        this.modal.play(story, awardBadge);
      }
    };

    const awardBadge = () => {
      if (badgeData && !Storage.hasBadge(badgeData.id)) {
        Storage.unlockBadge(badgeData.id, { name: badgeData.name });
        this.badgeAward.show(badgeData, () => {
          if (onComplete) onComplete();
        });
      } else {
        if (onComplete) onComplete();
      }
    };

    playEnding();
  }

  /**
   * 检查是否需要播放章节开场剧情
   * （第一次进入章节第一关时播放）
   * @param {Object} chapter
   * @param {number} levelId
   * @returns {boolean}
   */
  shouldPlayIntro(chapter, levelId) {
    const levels = chapter.levels || [];
    if (levels.length === 0) return false;
    const firstLevelId = levels[0].levelId;
    if (levelId !== firstLevelId) return false;

    // 如果已经通关过第一关，就不播了
    if (Storage.isTeachingLevelCompleted(firstLevelId)) return false;

    return true;
  }

  /**
   * 检查是否需要播放章末剧情
   * （第一次通关章节最后一关时播放）
   * @param {Object} chapter
   * @param {number} levelId
   * @returns {boolean}
   */
  shouldPlayEnding(chapter, levelId) {
    const levels = chapter.levels || [];
    if (levels.length === 0) return false;
    const lastLevelId = levels[levels.length - 1].levelId;
    if (levelId !== lastLevelId) return false;

    // 如果徽章已经获得了，说明已经播过了
    if (chapter.badge && Storage.hasBadge(chapter.badge.id)) return false;

    return true;
  }
}

// 全局单例
window.StoryModal = StoryModal;
window.BadgeAward = BadgeAward;
window.StoryManager = StoryManager;
