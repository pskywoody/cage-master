// ==========================================
// AI 对战模式（类街霸方块）
// ==========================================

// 全局状态
const BattleState = {
  running: false,
  playerBoard: null,
  aiBoard: null,
  playerRenderer: null,
  aiRenderer: null,
  currentLevel: null,
  solution: null, // 正解（从后端获取）
  aiDifficulty: 'medium',
  aiTimer: null,
  aiStepCount: 0,
  playerAttackCount: 0,
  aiAttackCount: 0,
  playerCombo: 0,
  aiCombo: 0,
  playerMaxCombo: 0,
  aiMaxCombo: 0,
  playerEnergy: 0,
  aiEnergy: 0,
  playerShield: 0,      // 护盾剩余秒数
  aiShield: 0,           // 护盾剩余秒数
  playerShieldTimer: null, // 护盾衰减定时器
  aiShieldTimer: null,
  playerLastAttack: 0,
  aiLastAttack: 0,
  winner: null,
  startTime: 0,
  currentLevelId: null,   // 当前关卡 ID（用于重来）
  currentLevelData: null, // 当前关卡原始数据（用于重来）
  spectateMode: false,
  aiPersonality: null     // 当前AI角色性格
};

// ==========================================
// 角色系统：Q版头像 + 表情 + 搞笑台词
// ==========================================
const AI_PERSONALITIES = {
  easy: {
    name: '小萌新',
    avatar: '🐣',
    color: '#22c55e',
    emotions: {
      idle: '', thinking: '🤔', happy: '😄', sad: '😢', 
      angry: '😤', surprised: '😲', win: '🎉', lose: '😭',
      attack: '💢', hurt: '😵'
    },
    lines: {
      start: ['嘿嘿~我是新手，请多指教！', '第一次玩，好紧张啊...', '让我看看...这题怎么解来着？'],
      correct: ['填对啦！', '哇哦，我好棒！', '耶！', '嘿嘿，蒙对了~'],
      combo: ['连击！我好厉害！', '哇塞我连对了！', '这就是天才吗？'],
      wrong: ['啊？填错了...', '呜呜，不对吗？', '哎呀手滑了'],
      attack: ['看招！', '嘿！', '吃我一击！'],
      attacked: ['哇！干嘛打我！', '呜呜好疼~', '坏人！欺负新人！'],
      energyFull: ['能量满啦！要放大招了！', '我的必杀技准备好了！', '嘿嘿嘿...接招吧！'],
      playerAttack: ['不要啊！', '等等等等！', '我投降我投降！'],
      winning: ['我要赢了？真的吗？', '哇！我居然领先了！', '难道我是天才？'],
      losing: ['呜呜要输了...', '等等我！', '不要抛弃我！'],
      win: ['耶！我赢啦！哈哈！', '第一次赢！好开心！', '我果然是天才！'],
      lose: ['呜呜呜...我输了...', '恭喜你赢了...', '下次我一定会赢的！']
    }
  },
  medium: {
    name: '数独达人',
    avatar: '🦊',
    color: '#f59e0b',
    emotions: {
      idle: '', thinking: '🧐', happy: '😏', sad: '😔',
      angry: '😠', surprised: '😮', win: '🏆', lose: '😤',
      attack: '⚔️', hurt: '💫'
    },
    lines: {
      start: ['哼，来战个痛快！', '准备好了吗？我可不会让着你。', '中等难度，正好热身。'],
      correct: ['不错。', '嗯，这格很简单。', '基本操作。', '理所当然。'],
      combo: ['连击，节奏不错。', '渐入佳境。', '手感来了。'],
      wrong: ['...失误。', '可恶，看走眼了。', '嗯？不对吗？'],
      attack: ['吃我这招！', '嘿！', '接招！'],
      attacked: ['不错嘛...', '有点意思。', '居然打中我了？'],
      energyFull: ['满了。该结束了。', '我的回合，必杀！', '让你看看真正的实力。'],
      playerAttack: ['切...', '护盾！', '别太得意！'],
      winning: ['胜负已分。', '差距明显啊。', '你还差得远呢。'],
      losing: ['居然落后了...', '不可能...', '有意思，认真起来了。'],
      win: ['承让了。', '实力差距，没办法。', '下次再努力吧。'],
      lose: ['...是我大意了。', '不错的对局。', '下次不会输了。']
    }
  },
  hard: {
    name: '数独魔王',
    avatar: '👹',
    color: '#dc2626',
    emotions: {
      idle: '', thinking: '😈', happy: '😈', sad: '💢',
      angry: '👿', surprised: '😒', win: '👑', lose: '😡',
      attack: '🔥', hurt: '⚡'
    },
    lines: {
      start: ['哼...人类，你敢挑战我？', '三分钟解决你。', '让你见识什么叫真正的数独。'],
      correct: ['...无聊。', '太慢了。', '这种题也需要想？', '呵。'],
      combo: ['蝼蚁的挣扎罢了。', '就这？', '不够看。'],
      wrong: ['......（不可能）', '哼，bug。', '...系统错误。'],
      attack: ['毁灭吧！', '湮灭！', '给我消失！'],
      attacked: ['哦？伤到我了？', '有趣...你成功激怒我了。', '蝼蚁之力，也敢挑衅？'],
      energyFull: ['游戏结束。', '必杀·笼中炼狱！', '让你彻底绝望。'],
      playerAttack: ['没用的。', '就这？', '刮痧呢？'],
      winning: ['看到了吗？这就是神与人的差距。', '结束了。', '绝望吧。'],
      losing: ['......不可能！', '人类...怎么可能！', '我居然...在落后？'],
      win: ['哼，理所当然的结果。', '记住这个差距。', '弱者没有资格挑战我。'],
      lose: ['不可能！！我怎么会输！！', '这...这不可能！！', '人类...你等着！我会回来的！']
    }
  },
  spectate: {
    name: '围观群众',
    avatar: '👀'
  }
};

// 玩家（你）的台词
const PLAYER_LINES = {
  start: ['来吧！', '我准备好了！', '今天一定要赢！', '看我的！'],
  correct: ['好！', '对了！', '漂亮！', '耶！'],
  combo: ['爽！连击！', '手感来了！', '停不下来！', '无敌是多么寂寞~'],
  wrong: ['啊...错了', '我去...', '手滑手滑', '尴尬...'],
  attack: ['吃我一击！', '看招！', '嘿呀！', '接招！'],
  attacked: ['我去！', '靠！被阴了！', '卧槽！', '什么鬼！'],
  energyFull: ['能量满了！必杀准备！', '我的大宝剑已经饥渴难耐了！', '是时候表演真正的技术了！'],
  winning: ['稳了稳了', '这把我carry', '胜利就在眼前！'],
  losing: ['糟糕...要输了', '等等等等！', '别别别！我还有机会！'],
  win: ['赢啦！！！', '还有谁！！', '哈哈哈哈哈！', '我就是数独之王！'],
  lose: ['啊...输了', '可恶...', '下次一定！', '这AI开挂了吧！']
};

// 旁白/解说搞笑台词
const NARRATOR_LINES = {
  start: ['【比赛开始！双方剑拔弩张！】', '【战斗打响！谁能率先解出谜题？】', '【今日对决：人类 VS AI！】'],
  combo3: ['【三连击！玩家手感火热！】', '【三连胜！AI开始慌了！】'],
  combo5: ['【五连击！这是要封神的节奏！】', '【五连绝世！AI被打懵了！】'],
  aiLead: ['【AI暂时领先！玩家要加油了！】', '【AI抢占先机！局势紧张！】'],
  playerLead: ['【玩家领先！AI感受到了压力！】', '【人类反击！AI要小心了！】'],
  close: ['【势均力敌！战况胶着！】', '【你来我往！这才是真正的对决！】'],
  energyFull: ['【能量爆满！必杀技蓄势待发！】', '【究极能量充盈！终极一击即将降临！】'],
  finalSprint: ['【终局冲刺！双方都拼了！】', '【最后阶段！谁能笑到最后？】']
};

// 角色系统状态
const CharSystem = {
  playerEmotion: 'idle',
  aiEmotion: 'idle',
  lastDialogueTime: 0,
  dialogueCooldown: 1500, // 台词最小间隔
  aiThinkTimer: null,
  comboCountP: 0,
  comboCountA: 0,
  narrated: new Set() // 已触发过的旁白，避免重复
};

// 显示台词气泡
function showDialogue(speaker, text, type) {
  const container = document.getElementById('dialogue-container');
  if (!container) return;
  
  const now = Date.now();
  if (now - CharSystem.lastDialogueTime < 600) return; // 避免台词太密集
  CharSystem.lastDialogueTime = now;
  
  const bubble = document.createElement('div');
  bubble.className = 'dialogue-bubble ' + (speaker === 'player' ? 'player-line' : speaker === 'ai' ? 'ai-line' : 'narrator-line');
  bubble.textContent = text;
  
  // 随机垂直位置
  const vPos = Math.random() * 30;
  bubble.style.top = vPos + '%';
  
  container.appendChild(bubble);
  
  // 动画结束后移除
  setTimeout(() => {
    if (bubble.parentNode) bubble.parentNode.removeChild(bubble);
  }, 3000);
  
  // 限制同时显示的气泡数量
  const bubbles = container.querySelectorAll('.dialogue-bubble');
  if (bubbles.length > 4) {
    bubbles[0].remove();
  }
}

// 设置角色表情
function setEmotion(side, emotion, showEmoji) {
  const emotionEl = document.getElementById(side + '-emotion');
  const avatarEl = document.getElementById(side + '-avatar');
  if (!emotionEl || !avatarEl) return;
  
  const personality = side === 'player' ? null : BattleState.aiPersonality;
  let emotionEmoji = '';
  
  if (side === 'player') {
    const playerEmojis = {
      thinking: '🤔', happy: '😄', sad: '😢', angry: '😤',
      surprised: '😲', win: '🎉', lose: '😭', attack: '💪', hurt: '😵'
    };
    emotionEmoji = playerEmojis[emotion] || '';
  } else if (personality) {
    emotionEmoji = personality.emotions[emotion] || '';
  }
  
  if (showEmoji !== false && emotionEmoji) {
    emotionEl.textContent = emotionEmoji;
    emotionEl.style.animation = 'none';
    void emotionEl.offsetWidth;
    emotionEl.style.animation = 'emotionPop 0.4s ease-out';
  }
  
  CharSystem[side + 'Emotion'] = emotion;
}

// 播放头像动画
function playAvatarAnim(side, animClass) {
  const avatarEl = document.getElementById(side + '-avatar');
  if (!avatarEl) return;
  
  avatarEl.classList.remove('bounce', 'shake', 'attack-anim', 'hurt-anim', 'win-anim', 'thinking-anim');
  void avatarEl.offsetWidth;
  avatarEl.classList.add(animClass);
  
  setTimeout(() => {
    avatarEl.classList.remove(animClass);
  }, 800);
}

// AI角色说话
function aiSays(category) {
  if (!BattleState.aiPersonality || !BattleState.running) return;
  const lines = BattleState.aiPersonality.lines[category];
  if (!lines || lines.length === 0) return;
  const line = lines[Math.floor(Math.random() * lines.length)];
  showDialogue('ai', line);
}

// 玩家说话
function playerSays(category) {
  if (!BattleState.running) return;
  const lines = PLAYER_LINES[category];
  if (!lines || lines.length === 0) return;
  const line = lines[Math.floor(Math.random() * lines.length)];
  showDialogue('player', line);
}

// 旁白
function narratorSays(category) {
  const lines = NARRATOR_LINES[category];
  if (!lines || lines.length === 0) return;
  // 旁白有冷却（5秒）
  const key = 'narr_' + category;
  if (CharSystem.narrated.has(key) && category !== 'start' && category !== 'finalSprint') return;
  CharSystem.narrated.add(key);
  const line = lines[Math.floor(Math.random() * lines.length)];
  showDialogue('narrator', line);
}

// 初始化角色系统
function initCharSystem() {
  const diff = BattleState.spectateMode ? 'spectate' : BattleState.aiDifficulty;
  BattleState.aiPersonality = AI_PERSONALITIES[diff] || AI_PERSONALITIES.medium;
  
  // 设置AI头像和名字
  const aiAvatar = document.getElementById('ai-avatar');
  const aiName = document.getElementById('ai-char-name');
  const aiLabel = document.getElementById('ai-label');
  
  if (BattleState.spectateMode) {
    // 观战模式：两边都是Bot
    document.getElementById('player-avatar').textContent = '🤖';
    document.getElementById('player-char-name').textContent = 'Bot 1';
    aiAvatar.textContent = '🤖';
    aiName.textContent = 'Bot 2';
    aiLabel.textContent = 'Bot 2';
    document.getElementById('player-label').textContent = 'Bot 1';
  } else {
    document.getElementById('player-avatar').textContent = '🧑‍💻';
    document.getElementById('player-char-name').textContent = '你';
    aiAvatar.textContent = BattleState.aiPersonality.avatar;
    aiName.textContent = BattleState.aiPersonality.name;
    aiLabel.textContent = BattleState.aiPersonality.name;
  }
  
  setEmotion('player', 'idle');
  setEmotion('ai', 'idle');
  CharSystem.comboCountP = 0;
  CharSystem.comboCountA = 0;
  CharSystem.narrated.clear();
  
  // 绑定音乐控制按钮
  const musicBtn = document.getElementById('btn-music-toggle');
  const sfxBtn = document.getElementById('btn-sfx-toggle');
  if (musicBtn) {
    musicBtn.addEventListener('click', () => {
      const enabled = AudioManager.toggleBGM();
      musicBtn.textContent = enabled ? '🎵' : '🔇';
      musicBtn.classList.toggle('muted', !enabled);
    });
  }
  if (sfxBtn) {
    sfxBtn.addEventListener('click', () => {
      const enabled = AudioManager.toggleSfx();
      sfxBtn.textContent = enabled ? '🔊' : '🔈';
      sfxBtn.classList.toggle('muted', !enabled);
    });
  }
  
  // AI思考动画（定时微动）
  if (CharSystem.aiThinkTimer) clearInterval(CharSystem.aiThinkTimer);
  CharSystem.aiThinkTimer = setInterval(() => {
    if (!BattleState.running || BattleState.winner) return;
    if (Math.random() < 0.3) {
      const avatar = document.getElementById('ai-avatar');
      if (avatar) {
        avatar.classList.add('thinking-anim');
        setTimeout(() => avatar.classList.remove('thinking-anim'), 1500);
      }
      if (Math.random() < 0.15) {
        setEmotion('ai', 'thinking');
      }
    }
  }, 4000);
}

// 快捷填入状态
let quickFillMode = false;
let quickFillNum = null;

// AI 难度配置
const AI_CONFIG = {
  easy: {
    stepMin: 2500, stepMax: 4000,
    mistakeChance: 0.15,
    useHiddenSingle: false,
    attackPower: 1
  },
  medium: {
    stepMin: 1200, stepMax: 2000,
    mistakeChance: 0.05,
    useHiddenSingle: true,
    attackPower: 1.2
  },
  hard: {
    stepMin: 600, stepMax: 1000,
    mistakeChance: 0.01,
    useHiddenSingle: true,
    attackPower: 1.5
  }
};

// 攻击配置
const ATTACK = {
  ENERGY_PER_CORRECT: 8,
  NORMAL_COST: 30,
  HEAVY_COST: 60,
  ULTIMATE_COST: 100,
  NORMAL_ERASE_COUNT: 3,
  NORMAL_CLEAR_CANDIDATES: 8,
  HEAVY_ERASE_COUNT: 8,
  HEAVY_CLEAR_CANDIDATES: 20,
  ULTIMATE_ERASE_BOX: true,
  COMBO_BONUS_ENERGY: 2,
  
  // 攻击冷却（毫秒）
  ATTACK_COOLDOWN: 3000,      // 攻击后 3 秒冷却
  ATTACK_COOLDOWN_ULTIMATE: 4000, // 必杀后 4 秒冷却
  
  // 攻击目标阈值：对方非固定已填数需达到才放对应攻击
  TARGET_THRESHOLD_NORMAL: 3,
  TARGET_THRESHOLD_HEAVY: 8,
  TARGET_THRESHOLD_ULTIMATE: 15,
  
  // 护盾系统
  SHIELD_DURATION: 30,          // 能量满溢出一次给30s护盾
  SHIELD_PROTECT_RATIO: 0.5,    // 护盾减免50%效果
  MAX_SHIELD: 60,               // 最大护盾60秒
  
  // 被攻击涨能量
  ENERGY_ON_HIT_NORMAL: 8,
  ENERGY_ON_HIT_HEAVY: 12,
  ENERGY_ON_HIT_ULTIMATE: 20
};

// ==========================================
// 初始化
// ==========================================
window.addEventListener('DOMContentLoaded', function() {
  // 初始化音频
  AudioManager.init();

  BattleState.playerBoard = new Board(9);
  BattleState.aiBoard = new Board(9);

  BattleState.playerRenderer = new Renderer('player-canvas');
  BattleState.aiRenderer = new Renderer('ai-canvas');
  BattleState.playerRenderer.setTheme(1);
  BattleState.aiRenderer.setTheme(1);

  // 绑定按钮
  document.getElementById('btn-start-battle').addEventListener('click', () => {
    AudioManager.resume();
    startBattle();
  });
  document.getElementById('btn-spectate').addEventListener('click', () => {
    AudioManager.resume();
    startSpectate();
  });
  document.getElementById('btn-back').addEventListener('click', () => {
    window.location.href = 'menu.html';
  });
  document.getElementById('btn-rematch').addEventListener('click', () => {
    document.getElementById('battle-result').classList.remove('show');
    startBattle();
  });
  document.getElementById('btn-result-back').addEventListener('click', () => {
    window.location.href = 'menu.html';
  });

  // 攻击按钮
  document.getElementById('btn-attack-normal').addEventListener('click', () => {
    tryPlayerAttack('normal');
  });
  document.getElementById('btn-attack-heavy').addEventListener('click', () => {
    tryPlayerAttack('heavy');
  });
  document.getElementById('btn-attack-ultimate').addEventListener('click', () => {
    tryPlayerAttack('ultimate');
  });

  // 模式切换
  document.getElementById('btn-mode-toggle').addEventListener('click', toggleInputMode);

  // 数字键盘
  for (let i = 1; i <= 9; i++) {
    document.getElementById('num-' + i).addEventListener('click', () => {
      if (quickFillMode) {
        selectQuickFillNum(i);
      } else {
        playerSetNumber(i);
      }
    });
  }
  document.getElementById('btn-erase').addEventListener('click', playerErase);

  // 快捷填入
  document.getElementById('btn-quick-fill').addEventListener('click', toggleQuickFill);
  
  // 重来
  document.getElementById('btn-restart').addEventListener('click', confirmRestart);

  bindPlayerInput();
});

// ==========================================
// 开始对战
// ==========================================
async function startBattle() {
  // 清理观战模式
  BattleState.spectateMode = false;
  if (BattleState.leftAiTimer) { clearTimeout(BattleState.leftAiTimer); BattleState.leftAiTimer = null; }
  document.getElementById('battle-app').classList.remove('spectate-mode');
  document.getElementById('player-label').textContent = '你';
  document.getElementById('ai-label').textContent = 'AI Bot';

  BattleState.running = true;
  BattleState.winner = null;
  BattleState.aiStepCount = 0;
  BattleState.playerAttackCount = 0;
  BattleState.aiAttackCount = 0;
  BattleState.playerCombo = 0;
  BattleState.aiCombo = 0;
  BattleState.playerMaxCombo = 0;
  BattleState.aiMaxCombo = 0;
  BattleState.playerEnergy = 0;
  BattleState.aiEnergy = 0;
  BattleState.playerShield = 0;
  BattleState.aiShield = 0;
  BattleState.playerLastAttack = 0;
  BattleState.aiLastAttack = 0;
  stopShieldDecay('player');
  stopShieldDecay('ai');
  updateShieldUI('player');
  updateShieldUI('ai');
  BattleState.startTime = Date.now();

  BattleState.aiDifficulty = document.getElementById('ai-difficulty').value;

  try {
    // 获取中等难度关卡列表
    const res = await fetch('/api/levels?difficulty=中等');
    const json = await res.json();
    if (json.code !== 0 || !json.data || json.data.length === 0) {
      alert('加载关卡失败，请刷新重试');
      return;
    }

    const levels = json.data;
    const levelInfo = levels[Math.floor(Math.random() * levels.length)];

    // 获取关卡详情（含正解）
    const detailRes = await fetch('/api/level/' + levelInfo.id + '?with_solution=1');
    const detailJson = await detailRes.json();

    let level;
    let solution = null;

    if (detailJson.code === 0 && detailJson.data) {
      level = detailJson.data;
      solution = detailJson.data.solution || null;
    } else {
      // 降级：不带正解
      const detailRes2 = await fetch('/api/level/' + levelInfo.id);
      const detailJson2 = await detailRes2.json();
      if (detailJson2.code !== 0 || !detailJson2.data) {
        alert('加载关卡失败，请刷新重试');
        return;
      }
      level = detailJson2.data;
    }

    BattleState.currentLevel = level;
    BattleState.solution = solution;
    BattleState.currentLevelId = level.id;
    // 深拷贝保存关卡数据，用于重来
    BattleState.currentLevelData = JSON.parse(JSON.stringify(level));

    // 重置快捷填入
    if (quickFillMode) toggleQuickFill();
    quickFillNum = null;

    // 加载到两个棋盘
    BattleState.playerBoard.loadLevel(level);
    BattleState.aiBoard.loadLevel(level);

    // 如果没有正解，后端计算一下（异步获取）
    if (!solution) {
      fetch('/api/solve/' + levelInfo.id)
        .then(r => r.json())
        .then(data => {
          if (data.code === 0 && data.data) {
            BattleState.solution = data.data;
          }
        })
        .catch(() => {});
    }

    // 初始渲染
    BattleState.playerRenderer.render(BattleState.playerBoard);
    BattleState.aiRenderer.render(BattleState.aiBoard);

    updateProgress();
    updateEnergy();
    updateCombo();
    updateAttackButtons();

    startAI();

    // 初始化角色系统
    initCharSystem();
    
    // 开场表演
    setTimeout(() => {
      narratorSays('start');
    }, 500);
    setTimeout(() => {
      playerSays('start');
      playAvatarAnim('player', 'bounce');
    }, 1200);
    setTimeout(() => {
      aiSays('start');
      setEmotion('ai', 'thinking');
      playAvatarAnim('ai', 'bounce');
    }, 2200);

    // 播放开始音效 + 背景音乐
    AudioManager.playBattleStart();
    setTimeout(() => AudioManager.startBGM(), 1000);

    console.log('⚔️ 对战开始！关卡:', level.name);
  } catch (e) {
    console.warn('加载关卡失败：', e.message);
    alert('加载关卡失败，请刷新重试');
  }
}

// ==========================================
// 玩家输入
// ==========================================
function bindPlayerInput() {
  const canvas = document.getElementById('player-canvas');
  let isMouseDown = false;
  let mouseMoved = false;
  let mouseStartPos = null;

  canvas.addEventListener('mousedown', function(e) {
    if (!BattleState.running) return;
    isMouseDown = true;
    mouseMoved = false;
    mouseStartPos = { x: e.clientX, y: e.clientY };
  });

  canvas.addEventListener('mousemove', function(e) {
    if (!BattleState.running || !isMouseDown) return;

    const dx = Math.abs(e.clientX - mouseStartPos.x);
    const dy = Math.abs(e.clientY - mouseStartPos.y);

    if (dx > 5 || dy > 5) {
      mouseMoved = true;
      const board = BattleState.playerBoard;
      if (!board.isBoxSelecting) {
        const { r, c } = getCellFromCanvas(canvas, mouseStartPos.x, mouseStartPos.y, BattleState.playerRenderer, board.size);
        board.startBoxSelect(r, c);
      }
      const { r, c } = getCellFromCanvas(canvas, e.clientX, e.clientY, BattleState.playerRenderer, board.size);
      board.updateBoxSelect(r, c);
      BattleState.playerRenderer.render(board);
    }
  });

  canvas.addEventListener('mouseup', function(e) {
    if (!BattleState.running) return;
    // 只在mousedown之后才处理mouseup（防止移动端touch事件后的合成mouse事件）
    if (!isMouseDown) {
      return;
    }
    isMouseDown = false;

    const board = BattleState.playerBoard;
    if (mouseMoved && board.isBoxSelecting) {
      // 框选结束
      board.endBoxSelect();
      BattleState.playerRenderer.render(board);
      // 框选后自动切换到候选模式
      if (board.inputMode !== 'candidate') {
        toggleInputMode();
      }
    } else {
      // 普通单击
      const { r, c } = getCellFromCanvas(canvas, e.clientX, e.clientY, BattleState.playerRenderer, board.size);
      if (r >= 0 && r < board.size && c >= 0 && c < board.size) {
        board.selectCell(r, c);
        BattleState.playerRenderer.render(board);
        AudioManager.playClick();
        // 快捷填入
        if (!tryQuickFill(r, c)) {
          // 快捷填入失败时（模式关闭或空格已有数），播放普通音效
        }
      }
    }
  });

  canvas.addEventListener('mouseleave', function(e) {
    if (isMouseDown && BattleState.playerBoard.isBoxSelecting) {
      BattleState.playerBoard.endBoxSelect();
      BattleState.playerRenderer.render(BattleState.playerBoard);
    }
    isMouseDown = false;
    mouseMoved = false;
    mouseStartPos = null;
  });

  // 触摸事件
  let touchStartPos = null;
  let touchMoved = false;

  canvas.addEventListener('touchstart', function(e) {
    if (!BattleState.running) return;
    e.preventDefault();
    const touch = e.touches[0];
    touchStartPos = { x: touch.clientX, y: touch.clientY };
    touchMoved = false;
  }, { passive: false });

  canvas.addEventListener('touchmove', function(e) {
    if (!BattleState.running || !touchStartPos) return;
    e.preventDefault();
    const touch = e.touches[0];

    const dx = Math.abs(touch.clientX - touchStartPos.x);
    const dy = Math.abs(touch.clientY - touchStartPos.y);

    if (dx > 8 || dy > 8) {
      touchMoved = true;
      const board = BattleState.playerBoard;
      if (!board.isBoxSelecting) {
        const { r, c } = getCellFromCanvas(canvas, touchStartPos.x, touchStartPos.y, BattleState.playerRenderer, board.size);
        board.startBoxSelect(r, c);
      }
      const { r, c } = getCellFromCanvas(canvas, touch.clientX, touch.clientY, BattleState.playerRenderer, board.size);
      board.updateBoxSelect(r, c);
      BattleState.playerRenderer.render(board);
    }
  }, { passive: false });

  canvas.addEventListener('touchend', function(e) {
    if (!BattleState.running) return;
    e.preventDefault();
    const board = BattleState.playerBoard;

    if (touchMoved && board.isBoxSelecting) {
      board.endBoxSelect();
      BattleState.playerRenderer.render(board);
      if (board.inputMode !== 'candidate') {
        toggleInputMode();
      }
    } else if (touchStartPos) {
      const { r, c } = getCellFromCanvas(canvas, touchStartPos.x, touchStartPos.y, BattleState.playerRenderer, board.size);
      if (r >= 0 && r < board.size && c >= 0 && c < board.size) {
        board.selectCell(r, c);
        BattleState.playerRenderer.render(board);
        AudioManager.playClick();
        // 快捷填入
        tryQuickFill(r, c);
      }
    }
    touchStartPos = null;
    touchMoved = false;
  }, { passive: false });

  document.addEventListener('keydown', function(e) {
    if (!BattleState.running) return;

    if (e.key >= '1' && e.key <= '9') {
      const num = parseInt(e.key);
      if (quickFillMode) {
        selectQuickFillNum(num);
      } else {
        playerSetNumber(num);
      }
      e.preventDefault();
      return;
    }

    const dirMap = {
      'ArrowUp': [-1, 0], 'ArrowDown': [1, 0],
      'ArrowLeft': [0, -1], 'ArrowRight': [0, 1]
    };
    if (dirMap[e.key]) {
      const [dr, dc] = dirMap[e.key];
      BattleState.playerBoard.moveSelection(dr, dc);
      BattleState.playerRenderer.render(BattleState.playerBoard);
      e.preventDefault();
      return;
    }

    if (e.key === 'Backspace' || e.key === 'Delete') {
      playerErase();
      e.preventDefault();
      return;
    }

    if (e.key === ' ') {
      toggleInputMode();
      e.preventDefault();
      return;
    }

    if (e.key === 'z' || e.key === 'Z') {
      BattleState.playerBoard.undo();
      BattleState.playerBoard.checkConflicts();
      BattleState.playerRenderer.render(BattleState.playerBoard);
      updateProgress();
      e.preventDefault();
      return;
    }
  });
}

function toggleInputMode() {
  const mode = BattleState.playerBoard.toggleInputMode();
  const btn = document.getElementById('btn-mode-toggle');
  if (mode === 'candidate') {
    btn.textContent = '候选模式';
    btn.style.background = '#fef3c7';
    btn.style.color = '#b45309';
  } else {
    btn.textContent = '填数模式';
    btn.style.background = '';
    btn.style.color = '';
  }
}

function playerSetNumber(num) {
  if (!BattleState.running) return;
  const board = BattleState.playerBoard;

  // 批量模式（框选了多个格子）
  if (board.selectedCells && board.selectedCells.length > 1) {
    let changed = false;
    let correctCount = 0;
    for (const [r, c] of board.selectedCells) {
      const cell = board.cells[r][c];
      if (cell.fixedNum) continue;

      if (board.inputMode === 'candidate') {
        // 候选模式：批量切换候选数
        const had = cell.candidates.has(num);
        if (!had) {
          cell.candidates.add(num);
          changed = true;
        }
      } else {
        // 填数模式：批量填数（对战模式不推荐，但支持）
        const wasCorrect = isCorrectFill(r, c, cell.fillNum);
        cell.fillNum = num;
        changed = true;
        if (isCorrectFill(r, c, num) && !wasCorrect) {
          correctCount++;
        }
      }
    }

    if (changed) {
      board.checkConflicts();
      BattleState.playerRenderer.render(board);
      updateProgress();
      AudioManager.playClick();
      if (correctCount > 0) {
        // 批量填对也加能量，但不加连击
        BattleState.playerEnergy = Math.min(100, BattleState.playerEnergy + correctCount * ATTACK.ENERGY_PER_CORRECT * 0.5);
        updateEnergy();
        updateAttackButtons();
      }
      checkPlayerWin();
    }
    return;
  }

  // 单格模式 - 使用getActiveCell()可靠获取选中格
  const activeCell = board.getActiveCell();
  if (!activeCell) return;
  const { r, c } = activeCell;
  const cell = board.cells[r][c];
  if (cell.fixedNum) return;

  const wasCorrect = isCorrectFill(r, c, cell.fillNum);

  if (board.inputMode === 'candidate') {
    board.toggleCandidate(num);
    AudioManager.playClick();
  } else {
    board.setNumber(num);
    board.checkConflicts();

    const isCorrectNow = isCorrectFill(r, c, cell.fillNum);
    if (isCorrectNow && !wasCorrect) {
      onPlayerCorrectFill();
      AudioManager.playCorrect();
      if (BattleState.playerCombo >= 2) {
        AudioManager.playCombo(BattleState.playerCombo);
      }
    } else if (!isCorrectNow && wasCorrect) {
      BattleState.playerCombo = 0;
      updateCombo();
      AudioManager.playWrong();
      // 角色反应：懊恼
      setEmotion('player', 'sad');
      playAvatarAnim('player', 'shake');
      if (Math.random() < 0.3) playerSays('wrong');
      // AI偷笑
      setEmotion('ai', 'happy');
    } else {
      AudioManager.playClick();
    }
  }

  board.checkConflicts();
  BattleState.playerRenderer.render(board);
  updateProgress();
  checkPlayerWin();
}

function playerErase() {
  if (!BattleState.running) return;
  const board = BattleState.playerBoard;

  // 批量模式
  if (board.selectedCells && board.selectedCells.length > 1) {
    let changed = false;
    let wasCorrectCount = 0;
    for (const [r, c] of board.selectedCells) {
      const cell = board.cells[r][c];
      if (cell.fixedNum) continue;
      if (cell.fillNum || cell.candidates.size > 0) {
        if (isCorrectFill(r, c, cell.fillNum)) wasCorrectCount++;
        cell.fillNum = null;
        cell.candidates.clear();
        changed = true;
      }
    }
    if (changed) {
      if (wasCorrectCount > 0) {
        BattleState.playerCombo = 0;
        updateCombo();
      }
      board.checkConflicts();
      BattleState.playerRenderer.render(board);
      updateProgress();
      AudioManager.playErase();
    }
    return;
  }

  // 单格模式 - 使用getActiveCell()可靠获取选中格
  const activeCell = board.getActiveCell();
  if (!activeCell) return;
  const { r, c } = activeCell;
  const cell = board.cells[r][c];
  if (cell.fixedNum) return;

  const wasCorrect = isCorrectFill(r, c, cell.fillNum);

  board.eraseNumber();
  board.checkConflicts();

  if (wasCorrect) {
    BattleState.playerCombo = 0;
    updateCombo();
  }

  AudioManager.playErase();
  BattleState.playerRenderer.render(board);
  updateProgress();
}

// 判断某个格子的数字是否正确
function isCorrectFill(r, c, num) {
  if (num === null || num === undefined) return false;
  // 如果有正解，直接对比
  if (BattleState.solution) {
    return BattleState.solution[r][c] === num;
  }
  // 没有正解的话，用「没有冲突」来近似判断
  const board = BattleState.playerBoard;
  const cell = board.cells[r][c];
  return cell.fillNum === num && !cell.isError;
}

function onPlayerCorrectFill() {
  BattleState.playerCombo++;
  if (BattleState.playerCombo > BattleState.playerMaxCombo) {
    BattleState.playerMaxCombo = BattleState.playerCombo;
  }

  const comboBonus = Math.max(0, BattleState.playerCombo - 1) * ATTACK.COMBO_BONUS_ENERGY;
  addEnergyToSide('player', ATTACK.ENERGY_PER_CORRECT + comboBonus);

  updateCombo();
  updateAttackButtons();
  
  // 角色反应
  setEmotion('player', 'happy');
  playAvatarAnim('player', 'bounce');
  if (BattleState.playerCombo === 1) {
    if (Math.random() < 0.4) playerSays('correct');
  }
  if (BattleState.playerCombo >= 3) {
    playerSays('combo');
    setEmotion('player', 'happy');
    if (BattleState.playerCombo === 3) narratorSays('combo3');
    if (BattleState.playerCombo === 5) narratorSays('combo5');
    // AI惊讶
    setEmotion('ai', 'surprised');
  }
}

// ==========================================
// 玩家攻击
// ==========================================
function tryPlayerAttack(type) {
  if (!BattleState.running) return;

  const cost = type === 'normal' ? ATTACK.NORMAL_COST
             : type === 'heavy' ? ATTACK.HEAVY_COST
             : ATTACK.ULTIMATE_COST;

  if (BattleState.playerEnergy < cost) {
    flashEnergyBar('player');
    return;
  }

  BattleState.playerEnergy -= cost;
  BattleState.playerAttackCount++;
  document.getElementById('player-attack-count').textContent = '攻击: ' + BattleState.playerAttackCount;

  showAttackIndicator('player', type);
  applyAttack(BattleState.aiBoard, type, 'ai');

  // 播放攻击音效
  if (type === 'normal') AudioManager.playAttackNormal();
  else if (type === 'heavy') AudioManager.playAttackHeavy();
  else AudioManager.playAttackUltimate();
  
  // 角色表演
  setEmotion('player', 'attack');
  playAvatarAnim('player', 'attack-anim');
  playerSays('attack');
  // AI受击
  setTimeout(() => {
    setEmotion('ai', 'hurt');
    playAvatarAnim('ai', 'hurt-anim');
    aiSays('playerAttack');
  }, 300);

  BattleState.aiRenderer.render(BattleState.aiBoard);
  updateEnergy();
  updateAttackButtons();
}

function applyAttack(targetBoard, type, targetSide) {
  const cellsArr = [];
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const cell = targetBoard.cells[r][c];
      if (!cell.fixedNum) cellsArr.push({ r, c, cell });
    }
  }

  // ---- 护盾抵消 ----
  let eraseMult = 1;
  let shieldSide = null;
  if (targetSide === 'ai') shieldSide = 'ai';
  else if (targetSide === 'player') shieldSide = 'player';
  
  if (shieldSide && BattleState[shieldSide + 'Shield'] > 0) {
    // 护盾激活，效果减半
    eraseMult = ATTACK.SHIELD_PROTECT_RATIO;
    // 消耗护盾（每次攻击消耗5秒）
    BattleState[shieldSide + 'Shield'] = Math.max(0, BattleState[shieldSide + 'Shield'] - 5);
    updateShieldUI(shieldSide);
    showShieldFlash(targetSide);
  }

  shuffleArray(cellsArr);

  if (type === 'normal') {
    // 普攻：擦除已填数字 + 清除少量候选
    let erased = 0;
    for (const { cell } of cellsArr) {
      if (cell.fillNum && !cell.fixedNum) {
        cell.fillNum = null;
        cell.candidates.clear();
        erased++;
        if (erased >= Math.ceil(ATTACK.NORMAL_ERASE_COUNT * eraseMult)) break;
      }
    }

    let cleared = 0;
    for (const { cell } of cellsArr) {
      if (cell.fillNum || cell.fixedNum) continue;
      if (cell.candidates.size > 1) {
        const cands = Array.from(cell.candidates);
        const toRemove = cands[Math.floor(Math.random() * cands.length)];
        cell.candidates.delete(toRemove);
        cleared++;
        if (cleared >= Math.ceil(ATTACK.NORMAL_CLEAR_CANDIDATES * eraseMult)) break;
      }
    }

    flashBoard(targetSide, '#fef3c7');
  } else if (type === 'heavy') {
    // 重击：擦除更多已填数字 + 清除较多候选
    let erased = 0;
    for (const { cell } of cellsArr) {
      if (cell.fillNum && !cell.fixedNum) {
        cell.fillNum = null;
        cell.candidates.clear();
        erased++;
        if (erased >= Math.ceil(ATTACK.HEAVY_ERASE_COUNT * eraseMult)) break;
      }
    }

    let cleared = 0;
    for (const { cell } of cellsArr) {
      if (cell.fillNum || cell.fixedNum) continue;
      if (cell.candidates.size > 0) {
        const cands = Array.from(cell.candidates);
        const removeCount = Math.min(3, Math.ceil(cands.length * 0.5));
        for (let i = 0; i < removeCount; i++) {
          const idx = Math.floor(Math.random() * cands.length);
          cell.candidates.delete(cands[idx]);
          cands.splice(idx, 1);
        }
        cleared++;
        if (cleared >= Math.ceil(ATTACK.HEAVY_CLEAR_CANDIDATES * eraseMult)) break;
      }
    }

    shakeBoard(targetSide, 0.4);
    flashBoard(targetSide, '#fecaca');
  } else if (type === 'ultimate') {
    if (eraseMult < 1) {
      // 护盾下必杀降级为重击效果
      let erased = 0;
      for (const { cell } of cellsArr) {
        if (cell.fillNum && !cell.fixedNum) {
          cell.fillNum = null;
          cell.candidates.clear();
          erased++;
          if (erased >= Math.ceil(ATTACK.HEAVY_ERASE_COUNT * 0.5)) break;
        }
      }
      shakeBoard(targetSide, 0.3);
      flashBoard(targetSide, '#c4b5fd');
    } else {
      // 必杀：清空一个3x3宫格
      let bestBox = 0;
      let bestCount = 0;
      for (let box = 0; box < 9; box++) {
        const br = Math.floor(box / 3) * 3;
        const bc = (box % 3) * 3;
        let count = 0;
        for (let r = br; r < br + 3; r++) {
          for (let c = bc; c < bc + 3; c++) {
            const cell = targetBoard.cells[r][c];
            if (cell.fillNum && !cell.fixedNum) count++;
          }
        }
        if (count > bestCount) { bestCount = count; bestBox = box; }
      }
      if (bestCount === 0) bestBox = Math.floor(Math.random() * 9);

      const br = Math.floor(bestBox / 3) * 3;
      const bc = (bestBox % 3) * 3;
      for (let r = br; r < br + 3; r++) {
        for (let c = bc; c < bc + 3; c++) {
          const cell = targetBoard.cells[r][c];
          if (cell.fillNum && !cell.fixedNum) {
            cell.fillNum = null;
            cell.candidates.clear();
          }
        }
      }
      for (let r = br; r < br + 3; r++) {
        for (let c = bc; c < bc + 3; c++) {
          const cell = targetBoard.cells[r][c];
          if (!cell.fixedNum && !cell.fillNum) cell.candidates.clear();
        }
      }
      targetBoard._clearedBox = { br, bc, until: Date.now() + 1500 };
      shakeBoard(targetSide, 0.8);
      flashBoard(targetSide, '#fca5a5');
    }
  }

  targetBoard.checkConflicts();

  // ---- 受击涨能量 ----
  if (shieldSide) {
    const hitEnergy = type === 'normal' ? ATTACK.ENERGY_ON_HIT_NORMAL
                     : type === 'heavy' ? ATTACK.ENERGY_ON_HIT_HEAVY
                     : ATTACK.ENERGY_ON_HIT_ULTIMATE;
    addEnergyToSide(shieldSide, hitEnergy);
  }
}

function getCellBaseCandidates(board, r, c) {
  const used = new Set();
  for (let i = 0; i < 9; i++) {
    const v = board.cells[r][i].fillNum || board.cells[r][i].fixedNum;
    if (v) used.add(v);
  }
  for (let i = 0; i < 9; i++) {
    const v = board.cells[i][c].fillNum || board.cells[i][c].fixedNum;
    if (v) used.add(v);
  }
  const boxR = Math.floor(r / 3) * 3;
  const boxC = Math.floor(c / 3) * 3;
  for (let i = boxR; i < boxR + 3; i++) {
    for (let j = boxC; j < boxC + 3; j++) {
      const v = board.cells[i][j].fillNum || board.cells[i][j].fixedNum;
      if (v) used.add(v);
    }
  }
  const cell = board.cells[r][c];
  if (cell.cageId !== null && board.cageIdToCells && board.cageIdToCells[cell.cageId]) {
    for (const [cr, cc] of board.cageIdToCells[cell.cageId]) {
      const v = board.cells[cr][cc].fillNum || board.cells[cr][cc].fixedNum;
      if (v) used.add(v);
    }
  }
  const result = [];
  for (let n = 1; n <= 9; n++) {
    if (!used.has(n)) result.push(n);
  }
  return result;
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

// 填充所有空格子的候选数（基于基础规则：行列宫笼不重复）
function fillAllCandidates(board) {
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const cell = board.cells[r][c];
      if (!cell.fixedNum && !cell.fillNum) {
        const cands = getCellBaseCandidates(board, r, c);
        cell.candidates = new Set(cands);
      }
    }
  }
}

// ==========================================
// 护盾系统
// ==========================================

// 加能量，溢出转护盾（关键函数）
function addEnergyToSide(side, amount) {
  if (side !== 'player' && side !== 'ai') return;
  const energyKey = side + 'Energy';
  const shieldKey = side + 'Shield';
  
  const oldEnergy = BattleState[energyKey];
  const newEnergy = Math.min(100, BattleState[energyKey] + amount);
  
  if (newEnergy >= 100 && amount > 0) {
    // 溢出部分转护盾
    const overflow = (BattleState[energyKey] + amount) - 100;
    if (overflow > 0) {
      const shieldGain = Math.ceil(overflow / ATTACK.ENERGY_PER_CORRECT * ATTACK.SHIELD_DURATION);
      BattleState[shieldKey] = Math.min(ATTACK.MAX_SHIELD, BattleState[shieldKey] + shieldGain);
    }
  }
  
  BattleState[energyKey] = newEnergy;
  
  // 普通能量音效
  if (amount > 0 && oldEnergy < 100) {
    AudioManager.playEnergy();
  }
  
  // 满能量提示
  if (oldEnergy < 100 && newEnergy >= 100 && amount > 0) {
    AudioManager.playEnergyFull();
    // 角色反应：能量满！
    narratorSays('energyFull');
    if (side === 'player') {
      setEmotion('player', 'attack');
      playerSays('energyFull');
    } else {
      setEmotion('ai', 'angry');
      aiSays('energyFull');
      setEmotion('player', 'surprised');
    }
  }
  
  // 护盾UI更新
  if (BattleState[shieldKey] > 0) {
    updateShieldUI(side);
    startShieldDecay(side);
  }
  
  updateEnergy();
  updateAttackButtons();
}

// 护盾衰减（每秒）
function startShieldDecay(side) {
  const timerKey = side + 'ShieldTimer';
  if (BattleState[timerKey]) return; // 已经在跑了
  
  BattleState[timerKey] = setInterval(() => {
    const shieldKey = side + 'Shield';
    if (BattleState[shieldKey] > 0) {
      BattleState[shieldKey] = Math.max(0, BattleState[shieldKey] - 1);
      updateShieldUI(side);
      if (BattleState[shieldKey] <= 0) {
        clearInterval(BattleState[timerKey]);
        BattleState[timerKey] = null;
        updateShieldUI(side);
      }
    }
  }, 1000);
}

function stopShieldDecay(side) {
  const timerKey = side + 'ShieldTimer';
  if (BattleState[timerKey]) {
    clearInterval(BattleState[timerKey]);
    BattleState[timerKey] = null;
  }
}

function updateShieldUI(side) {
  const shield = BattleState[side + 'Shield'];
  const el = document.getElementById(side + '-shield');
  if (!el) return;
  
  if (shield > 0) {
    el.textContent = '🛡️ ' + shield + 's';
    el.style.display = 'inline';
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = 'shieldPulse 1s ease-in-out infinite';
  } else {
    el.style.display = 'none';
  }
  
  // 护盾边框
  const wrap = document.getElementById(side + '-canvas-wrap');
  if (wrap) {
    if (shield > 0) {
      wrap.classList.add('shield-active');
    } else {
      wrap.classList.remove('shield-active');
    }
  }
}

function showShieldFlash(side) {
  const wrap = document.getElementById(side + '-canvas-wrap');
  if (!wrap) return;
  wrap.style.boxShadow = '0 0 25px 10px rgba(139, 92, 246, 0.8) inset';
  setTimeout(() => {
    if (BattleState[side + 'Shield'] > 0) {
      wrap.style.boxShadow = '0 0 15px 5px rgba(139, 92, 246, 0.4) inset';
    } else {
      wrap.style.transition = 'box-shadow 0.3s ease';
      wrap.style.boxShadow = '';
      setTimeout(() => { wrap.style.transition = ''; }, 300);
    }
  }, 300);
}

// ==========================================
// AI 逻辑
// ==========================================
function startAI() {
  if (BattleState.aiTimer) {
    clearTimeout(BattleState.aiTimer);
  }
  scheduleAIStep();
}

function scheduleAIStep() {
  if (!BattleState.running) return;
  const config = AI_CONFIG[BattleState.aiDifficulty];
  const delay = config.stepMin + Math.random() * (config.stepMax - config.stepMin);
  BattleState.aiTimer = setTimeout(() => {
    if (BattleState.running) {
      aiStep();
      scheduleAIStep();
    }
  }, delay);
}

function aiStep() {
  const board = BattleState.aiBoard;
  const config = AI_CONFIG[BattleState.aiDifficulty];

  let move = null;

  // 1. 显单
  move = findNakedSingle(board);

  // 2. 隐单
  if (!move && config.useHiddenSingle) {
    move = findHiddenSingle(board);
  }

  // 3. 候选最少
  if (!move) {
    move = findFewestCandidatesMove(board);
  }

  if (move) {
    const { r, c, num } = move;

    // 犯错概率
    const makeMistake = Math.random() < config.mistakeChance;
    let actualNum = num;
    if (makeMistake && BattleState.solution) {
      const wrongNums = [];
      for (let n = 1; n <= 9; n++) {
        if (n !== BattleState.solution[r][c]) {
          wrongNums.push(n);
        }
      }
      if (wrongNums.length > 0) {
        actualNum = wrongNums[Math.floor(Math.random() * wrongNums.length)];
      }
    }

    const cell = board.cells[r][c];
    const wasCorrect = isAICorrectFill(r, c, cell.fillNum);

    board.selectCell(r, c);
    board.setNumber(actualNum);
    board.checkConflicts();

    BattleState.aiStepCount++;

    const isCorrectNow = isAICorrectFill(r, c, cell.fillNum);
    if (isCorrectNow && !wasCorrect) {
      onAICorrectFill();
    } else if (!isCorrectNow && wasCorrect) {
      BattleState.aiCombo = 0;
      updateCombo();
    }

    BattleState.aiRenderer.render(board);
    updateProgress();
    checkAIWin();
  } else {
    // 用正解填一个
    if (BattleState.solution) {
      fillOneFromSolution();
    }
  }
}

function isAICorrectFill(r, c, num) {
  if (num === null || num === undefined) return false;
  if (BattleState.solution) {
    return BattleState.solution[r][c] === num;
  }
  const board = BattleState.aiBoard;
  const cell = board.cells[r][c];
  return cell.fillNum === num && !cell.isError;
}

function fillOneFromSolution() {
  const board = BattleState.aiBoard;
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const cell = board.cells[r][c];
      if (!cell.fixedNum && !cell.fillNum) {
        const num = BattleState.solution[r][c];
        board.selectCell(r, c);
        board.setNumber(num);
        board.checkConflicts();
        onAICorrectFill();
        BattleState.aiRenderer.render(board);
        updateProgress();
        checkAIWin();
        return;
      }
    }
  }
}

// ==========================================
// 观战模式：双 Bot 自动对战
// ==========================================
BattleState.spectateMode = false;
BattleState.leftAiTimer = null;

async function startSpectate() {
  BattleState.spectateMode = true;

  // 显示观战模式 UI
  document.getElementById('battle-app').classList.add('spectate-mode');
  document.getElementById('player-label').textContent = 'Bot 1';
  document.getElementById('ai-label').textContent = 'Bot 2';

  // 重置状态
  BattleState.running = true;
  BattleState.winner = null;
  BattleState.aiStepCount = 0;
  BattleState.playerAttackCount = 0;
  BattleState.aiAttackCount = 0;
  BattleState.playerCombo = 0;
  BattleState.aiCombo = 0;
  BattleState.playerMaxCombo = 0;
  BattleState.aiMaxCombo = 0;
  BattleState.playerEnergy = 0;
  BattleState.aiEnergy = 0;
  BattleState.playerShield = 0;
   BattleState.aiShield = 0;
   BattleState.playerLastAttack = 0;
   BattleState.aiLastAttack = 0;
   stopShieldDecay('player');
   stopShieldDecay('ai');
   updateShieldUI('player');
   updateShieldUI('ai');
   BattleState.startTime = Date.now();

   BattleState.aiDifficulty = document.getElementById('ai-difficulty').value;

  try {
    const res = await fetch('/api/levels?difficulty=中等');
    const json = await res.json();
    const levels = json.data || [];
    if (levels.length === 0) { alert('加载关卡失败'); return; }

    const levelInfo = levels[Math.floor(Math.random() * levels.length)];
    const detailRes = await fetch('/api/level/' + levelInfo.id + '?with_solution=1');
    const detailJson = await detailRes.json();
    const level = detailJson.data;

    if (!level) { alert('加载关卡失败'); return; }

    BattleState.currentLevel = level;
    let solution = level.solution;
    if (!solution) {
      const solveRes = await fetch('/api/solve/' + levelInfo.id);
      const solveJson = await solveRes.json();
      solution = solveJson.data;
    }
    BattleState.solution = solution;

    // 加载到两个棋盘
    BattleState.playerBoard.loadLevel(level);
    BattleState.aiBoard.loadLevel(level);

    // 初始渲染
    BattleState.playerRenderer.render(BattleState.playerBoard);
    BattleState.aiRenderer.render(BattleState.aiBoard);

    updateProgress();
    updateEnergy();
    updateCombo();
    updateAttackButtons();

    // 启动两个 AI
    startAI();
    startLeftAI();

    // 初始化角色系统
    initCharSystem();
    
    // 开场表演
    setTimeout(() => narratorSays('start'), 500);
    setTimeout(() => {
      showDialogue('player', '我是Bot 1，看我的！');
      playAvatarAnim('player', 'bounce');
    }, 1200);
    setTimeout(() => {
      showDialogue('ai', '哼，机械效率决定一切。');
      setEmotion('ai', 'thinking');
      playAvatarAnim('ai', 'bounce');
    }, 2200);

    AudioManager.playBattleStart();
    setTimeout(() => AudioManager.startBGM(), 1000);

    console.log('👀 观战模式开始！关卡:', level.name);
  } catch (e) {
    console.warn('加载关卡失败：', e.message);
    alert('加载关卡失败，请刷新重试');
  }
}

// 左侧 AI（Bot 1，使用 player 棋盘）
function startLeftAI() {
  if (BattleState.leftAiTimer) clearTimeout(BattleState.leftAiTimer);
  scheduleLeftAIStep();
}

function scheduleLeftAIStep() {
  if (!BattleState.running) return;
  const config = AI_CONFIG[BattleState.aiDifficulty];
  const delay = config.stepMin + Math.random() * (config.stepMax - config.stepMin);
  BattleState.leftAiTimer = setTimeout(() => {
    if (BattleState.running) {
      leftAiStep();
      scheduleLeftAIStep();
    }
  }, delay);
}

function leftAiStep() {
  const board = BattleState.playerBoard;
  const config = AI_CONFIG[BattleState.aiDifficulty];

  let move = null;

  // 1. 显单
  move = findNakedSingle(board);
  // 2. 隐单
  if (!move && config.useHiddenSingle) {
    move = findHiddenSingle(board);
  }
  // 3. 候选最少
  if (!move) {
    move = findFewestCandidatesMove(board);
  }

  if (move) {
    const { r, c, num } = move;

    const makeMistake = Math.random() < config.mistakeChance;
    let actualNum = num;
    if (makeMistake && BattleState.solution) {
      const wrongNums = [];
      for (let n = 1; n <= 9; n++) {
        if (n !== BattleState.solution[r][c]) wrongNums.push(n);
      }
      if (wrongNums.length > 0) {
        actualNum = wrongNums[Math.floor(Math.random() * wrongNums.length)];
      }
    }

    const cell = board.cells[r][c];
    const wasCorrect = isCorrectFill(r, c, cell.fillNum);

    board.selectCell(r, c);
    board.setNumber(actualNum);
    board.checkConflicts();

    BattleState.aiStepCount++;

    const isCorrectNow = isCorrectFill(r, c, cell.fillNum);
    if (isCorrectNow && !wasCorrect) {
      onLeftCorrectFill();
    } else if (!isCorrectNow && wasCorrect) {
      BattleState.playerCombo = 0;
      updateCombo();
    }

    BattleState.playerRenderer.render(board);
    updateProgress();
    checkPlayerWin();
  } else if (BattleState.solution) {
    fillOneFromSolutionLeft();
  }
}

function fillOneFromSolutionLeft() {
  const board = BattleState.playerBoard;
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const cell = board.cells[r][c];
      if (!cell.fixedNum && !cell.fillNum) {
        const num = BattleState.solution[r][c];
        board.selectCell(r, c);
        board.setNumber(num);
        board.checkConflicts();
        onLeftCorrectFill();
        BattleState.playerRenderer.render(board);
        updateProgress();
        checkPlayerWin();
        return;
      }
    }
  }
}

function onLeftCorrectFill() {
  BattleState.playerCombo++;
  if (BattleState.playerCombo > BattleState.playerMaxCombo) {
    BattleState.playerMaxCombo = BattleState.playerCombo;
  }

  const comboBonus = Math.max(0, BattleState.playerCombo - 1) * ATTACK.COMBO_BONUS_ENERGY;
  addEnergyToSide('player', ATTACK.ENERGY_PER_CORRECT + comboBonus);

  updateCombo();
  updateAttackButtons();
  leftAiTryAttack();
  
  // 观战模式Bot反应
  setEmotion('player', 'happy');
  playAvatarAnim('player', 'bounce');
  if (Math.random() < 0.2) {
    if (BattleState.playerCombo >= 2) showDialogue('player', '连击！我的推演更快！');
    else showDialogue('player', '正确。');
  }
}

function leftAiTryAttack() {
  // 1. 冷却检查
  if (Date.now() - BattleState.playerLastAttack < ATTACK.ATTACK_COOLDOWN) return;
  
  // 2. 目标有效数检查
  const aiFilled = countNonFixedFilled(BattleState.aiBoard);
  
  // 3. 选择合适的攻击
  if (BattleState.playerEnergy >= ATTACK.ULTIMATE_COST && aiFilled >= ATTACK.TARGET_THRESHOLD_ULTIMATE &&
      Date.now() - BattleState.playerLastAttack >= ATTACK.ATTACK_COOLDOWN_ULTIMATE) {
    leftAiAttack('ultimate');
  } else if (BattleState.playerEnergy >= ATTACK.HEAVY_COST && aiFilled >= ATTACK.TARGET_THRESHOLD_HEAVY && Math.random() < 0.3) {
    leftAiAttack('heavy');
  } else if (BattleState.playerEnergy >= ATTACK.NORMAL_COST && aiFilled >= ATTACK.TARGET_THRESHOLD_NORMAL && Math.random() < 0.25) {
    leftAiAttack('normal');
  }
}

function leftAiAttack(type) {
  const cost = type === 'normal' ? ATTACK.NORMAL_COST
             : type === 'heavy' ? ATTACK.HEAVY_COST
             : ATTACK.ULTIMATE_COST;

  if (BattleState.playerEnergy < cost) return;

  BattleState.playerEnergy -= cost;
  BattleState.playerAttackCount++;
  BattleState.playerLastAttack = Date.now();
  document.getElementById('player-attack-count').textContent = '攻击: ' + BattleState.playerAttackCount;

  showAttackIndicator('player', type);
  applyAttack(BattleState.aiBoard, type, 'ai');

  if (type === 'normal') AudioManager.playAttackNormal();
  else if (type === 'heavy') AudioManager.playAttackHeavy();
  else AudioManager.playAttackUltimate();

  BattleState.aiRenderer.render(BattleState.aiBoard);
  updateEnergy();
  updateAttackButtons();
}

function findNakedSingle(board) {
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const cell = board.cells[r][c];
      if (cell.fixedNum || cell.fillNum) continue;
      const cands = getCellCandidates(board, r, c);
      if (cands.length === 1) {
        return { r, c, num: cands[0] };
      }
    }
  }
  return null;
}

function findHiddenSingle(board) {
  // 行
  for (let r = 0; r < 9; r++) {
    const posMap = new Map();
    for (let c = 0; c < 9; c++) {
      if (board.cells[r][c].fixedNum || board.cells[r][c].fillNum) continue;
      const cands = getCellCandidates(board, r, c);
      for (const num of cands) {
        if (!posMap.has(num)) posMap.set(num, []);
        posMap.get(num).push(c);
      }
    }
    for (const [num, cols] of posMap) {
      if (cols.length === 1) {
        return { r, c: cols[0], num };
      }
    }
  }

  // 列
  for (let c = 0; c < 9; c++) {
    const posMap = new Map();
    for (let r = 0; r < 9; r++) {
      if (board.cells[r][c].fixedNum || board.cells[r][c].fillNum) continue;
      const cands = getCellCandidates(board, r, c);
      for (const num of cands) {
        if (!posMap.has(num)) posMap.set(num, []);
        posMap.get(num).push(r);
      }
    }
    for (const [num, rows] of posMap) {
      if (rows.length === 1) {
        return { r: rows[0], c, num };
      }
    }
  }

  // 宫
  for (let br = 0; br < 3; br++) {
    for (let bc = 0; bc < 3; bc++) {
      const posMap = new Map();
      for (let r = br * 3; r < br * 3 + 3; r++) {
        for (let c = bc * 3; c < bc * 3 + 3; c++) {
          if (board.cells[r][c].fixedNum || board.cells[r][c].fillNum) continue;
          const cands = getCellCandidates(board, r, c);
          for (const num of cands) {
            if (!posMap.has(num)) posMap.set(num, []);
            posMap.get(num).push([r, c]);
          }
        }
      }
      for (const [num, positions] of posMap) {
        if (positions.length === 1) {
          return { r: positions[0][0], c: positions[0][1], num };
        }
      }
    }
  }

  return null;
}

function findFewestCandidatesMove(board) {
  let best = null;
  let bestCount = Infinity;

  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const cell = board.cells[r][c];
      if (cell.fixedNum || cell.fillNum) continue;
      const cands = getCellCandidates(board, r, c);
      if (cands.length > 0 && cands.length < bestCount) {
        bestCount = cands.length;
        best = { r, c, num: cands[Math.floor(Math.random() * cands.length)] };
      }
    }
  }

  return best;
}

function getCellCandidates(board, r, c) {
  const cell = board.cells[r][c];
  if (cell.candidates.size > 0) {
    return Array.from(cell.candidates);
  }
  return getCellBaseCandidates(board, r, c);
}

function onAICorrectFill() {
  BattleState.aiCombo++;
  if (BattleState.aiCombo > BattleState.aiMaxCombo) {
    BattleState.aiMaxCombo = BattleState.aiCombo;
  }

  const comboBonus = Math.max(0, BattleState.aiCombo - 1) * ATTACK.COMBO_BONUS_ENERGY;
  addEnergyToSide('ai', ATTACK.ENERGY_PER_CORRECT + comboBonus);

  updateCombo();
  aiTryAttack();
  
  // 角色反应
  setEmotion('ai', 'happy');
  playAvatarAnim('ai', 'bounce');
  // AI填对时偶尔说话
  if (Math.random() < 0.2) {
    if (BattleState.aiCombo >= 2) aiSays('combo');
    else aiSays('correct');
  }
  // 玩家紧张
  if (BattleState.aiCombo >= 3) {
    setEmotion('player', 'surprised');
  }
}

function aiTryAttack() {
  // 1. 冷却检查（用最短的冷却作为初步检查）
  if (Date.now() - BattleState.aiLastAttack < ATTACK.ATTACK_COOLDOWN) return;
  
  // 2. 目标有效数检查
  const playerFilled = countNonFixedFilled(BattleState.playerBoard);
  
  // 3. 选择合适的攻击
  if (BattleState.aiEnergy >= ATTACK.ULTIMATE_COST && playerFilled >= ATTACK.TARGET_THRESHOLD_ULTIMATE &&
      Date.now() - BattleState.aiLastAttack >= ATTACK.ATTACK_COOLDOWN_ULTIMATE) {
    aiAttack('ultimate');
  }
  else if (BattleState.aiEnergy >= ATTACK.HEAVY_COST && playerFilled >= ATTACK.TARGET_THRESHOLD_HEAVY && Math.random() < 0.3) {
    aiAttack('heavy');
  }
  else if (BattleState.aiEnergy >= ATTACK.NORMAL_COST && playerFilled >= ATTACK.TARGET_THRESHOLD_NORMAL && Math.random() < 0.25) {
    aiAttack('normal');
  }
}

function aiAttack(type) {
  const cost = type === 'normal' ? ATTACK.NORMAL_COST
             : type === 'heavy' ? ATTACK.HEAVY_COST
             : ATTACK.ULTIMATE_COST;

  if (BattleState.aiEnergy < cost) return;

  BattleState.aiEnergy -= cost;
  BattleState.aiAttackCount++;
  BattleState.aiLastAttack = Date.now();
  document.getElementById('ai-attack-count').textContent = '攻击: ' + BattleState.aiAttackCount;

  showAttackIndicator('ai', type);
  applyAttack(BattleState.playerBoard, type, 'player');

  // 播放攻击 + 被击中音效
  if (type === 'normal') AudioManager.playAttackNormal();
  else if (type === 'heavy') AudioManager.playAttackHeavy();
  else AudioManager.playAttackUltimate();
  AudioManager.playHit();
  
  // 角色表演
  setEmotion('ai', 'attack');
  playAvatarAnim('ai', 'attack-anim');
  aiSays('attack');
  // 玩家受击
  setTimeout(() => {
    setEmotion('player', 'hurt');
    playAvatarAnim('player', 'hurt-anim');
    playerSays('attacked');
  }, 300);

  BattleState.playerRenderer.render(BattleState.playerBoard);
  updateEnergy();
  updateAttackButtons();
}

// ==========================================
// UI 更新
// ==========================================
function updateProgress() {
  const playerFilled = countCorrectFilled(BattleState.playerBoard, 'player');
  const aiFilled = countCorrectFilled(BattleState.aiBoard, 'ai');

  const playerPct = Math.floor(playerFilled / 81 * 100);
  const aiPct = Math.floor(aiFilled / 81 * 100);

  document.getElementById('player-progress').style.width = playerPct + '%';
  document.getElementById('ai-progress').style.width = aiPct + '%';
  document.getElementById('player-progress-text').textContent = playerFilled + ' / 81';
  document.getElementById('ai-progress-text').textContent = aiFilled + ' / 81';
  updateNumberButtons();
  
  // 进度对比旁白（有冷却，不要太频繁）
  if (BattleState.running && !BattleState.winner) {
    const diff = playerFilled - aiFilled;
    const totalFilled = playerFilled + aiFilled;
    
    // 终局冲刺（超过70%进度）
    if (playerPct >= 70 || aiPct >= 70) {
      if (!CharSystem.narrated.has('final')) {
        CharSystem.narrated.add('final');
        narratorSays('finalSprint');
        if (playerPct > aiPct) playerSays('winning');
        else if (aiPct > playerPct) playerSays('losing');
      }
    }
    // 领先/落后/胶着（填了15格以上才判断）
    else if (totalFilled > 30) {
      const stateKey = 'p_' + Math.floor(playerPct/20) + '_' + (diff > 5 ? 'lead' : diff < -5 ? 'behind' : 'close');
      if (!CharSystem.narrated.has(stateKey)) {
        CharSystem.narrated.add(stateKey);
        if (diff >= 6) {
          narratorSays('playerLead');
          if (Math.random() < 0.4) playerSays('winning');
        } else if (diff <= -6) {
          narratorSays('aiLead');
          if (Math.random() < 0.4) playerSays('losing');
          if (Math.random() < 0.3) aiSays('winning');
        } else if (Math.abs(diff) <= 2) {
          if (Math.random() < 0.3) narratorSays('close');
        }
      }
    }
  }
}

// 更新底部数字按钮状态：填满 9 个的数字变灰不可点
function updateNumberButtons() {
  const board = BattleState.playerBoard;
  if (!board) return;
  
  const count = Array(10).fill(0);
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const val = board.cells[r][c].fixedNum || board.cells[r][c].fillNum;
      if (val) count[val]++;
    }
  }
  
  for (let n = 1; n <= 9; n++) {
    const btn = document.getElementById('num-' + n);
    if (!btn) continue;
    if (count[n] >= 9) {
      btn.classList.add('completed');
    } else {
      btn.classList.remove('completed');
    }
  }
}

// ==========================================
// 快捷填入模式
// ==========================================
function toggleQuickFill() {
  const btn = document.getElementById('btn-quick-fill');
  quickFillMode = !quickFillMode;
  if (!quickFillMode) {
    // 关闭模式，清除选中数字
    quickFillNum = null;
    btn.classList.remove('active');
    clearQuickFillNumHighlight();
  } else {
    btn.classList.add('active');
  }
}

function clearQuickFillNumHighlight() {
  for (let i = 1; i <= 9; i++) {
    document.getElementById('num-' + i).classList.remove('quick-fill-num');
  }
}

function selectQuickFillNum(num) {
  // 如果该数字已填满，不能选
  if (isNumberComplete(num)) return;
  clearQuickFillNumHighlight();
  if (quickFillNum === num) {
    // 点击已选中的数字：取消选择
    quickFillNum = null;
  } else {
    quickFillNum = num;
    document.getElementById('num-' + num).classList.add('quick-fill-num');
  }
}

// 检查某个数字是否已经填满 9 个
function isNumberComplete(num) {
  const board = BattleState.playerBoard;
  if (!board) return false;
  let count = 0;
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const val = board.cells[r][c].fixedNum || board.cells[r][c].fillNum;
      if (val === num) count++;
    }
  }
  return count >= 9;
}

// 尝试快捷填入（canvas 点击空格时调用）
function tryQuickFill(r, c) {
  if (!quickFillMode || !quickFillNum) return false;
  const board = BattleState.playerBoard;
  const cell = board.cells[r][c];
  if (cell.fixedNum || cell.fillNum) return false;
  
  // 复用 playerSetNumber 的逻辑（能量、连击、音效）
  playerSetNumber(quickFillNum);
  
  // 检查该数字是否已填完
  if (isNumberComplete(quickFillNum)) {
    // 自动关闭快捷填入模式
    quickFillNum = null;
    clearQuickFillNumHighlight();
    quickFillMode = false;
    document.getElementById('btn-quick-fill').classList.remove('active');
  }
  
  return true;
}

// ==========================================
// 重来功能
// ==========================================
function confirmRestart() {
  if (!BattleState.running) return;
  if (!confirm('确定要重来这关吗？所有已填的数字将被清空。')) return;
  restartLevel();
}

function restartLevel() {
  if (!BattleState.currentLevelData) return;
  
  // 从保存的数据重新加载
  const level = JSON.parse(JSON.stringify(BattleState.currentLevelData));
  
  // 重置玩家盘面
  BattleState.playerBoard.loadLevel(level);
  BattleState.playerRenderer.render(BattleState.playerBoard);
  
  // 重置 AI 盘面（但 AI 要用新生成的同关口，此处保持原样）
  // AI 也需要重置，否则只有玩家重置不公平
  BattleState.aiBoard.loadLevel(level);
  BattleState.aiRenderer.render(BattleState.aiBoard);
  
  // 重置战斗状态
  BattleState.playerEnergy = 0;
  BattleState.aiEnergy = 0;
  BattleState.playerShield = 0;
  BattleState.aiShield = 0;
  BattleState.playerLastAttack = 0;
  BattleState.aiLastAttack = 0;
  BattleState.playerAttackCount = 0;
  BattleState.aiAttackCount = 0;
  BattleState.playerCombo = 0;
  BattleState.aiCombo = 0;
  BattleState.playerMaxCombo = 0;
  BattleState.aiMaxCombo = 0;
  
  stopShieldDecay('player');
  stopShieldDecay('ai');
  
  // 重置快捷填入
  if (quickFillMode) toggleQuickFill();
  quickFillNum = null;
  
  // 更新 UI
  updateProgress();
  updateEnergy();
  updateCombo();
  updateAttackButtons();
}

// 统计对方盘面上非固定已填数字（可被攻击的有效目标）
function countNonFixedFilled(board) {
  let n = 0;
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const cell = board.cells[r][c];
      if (cell.fillNum && !cell.fixedNum) n++;
    }
  }
  return n;
}

function countCorrectFilled(board, side) {
  let count = 0;
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const cell = board.cells[r][c];
      if (cell.fixedNum) {
        count++;
      } else if (cell.fillNum) {
        if (BattleState.solution) {
          if (cell.fillNum === BattleState.solution[r][c]) count++;
        } else {
          if (!cell.isError) count++;
        }
      }
    }
  }
  return count;
}

function updateEnergy() {
  const pFill = document.getElementById('player-energy-fill');
  const aFill = document.getElementById('ai-energy-fill');
  
  pFill.style.width = BattleState.playerEnergy + '%';
  document.getElementById('player-energy-text').textContent = Math.floor(BattleState.playerEnergy) + '%';
  document.getElementById('player-energy-num').textContent = Math.floor(BattleState.playerEnergy) + ' / 100';
  
  aFill.style.width = BattleState.aiEnergy + '%';
  document.getElementById('ai-energy-text').textContent = Math.floor(BattleState.aiEnergy) + '%';
  document.getElementById('ai-energy-num').textContent = Math.floor(BattleState.aiEnergy) + ' / 100';

  // 能量满时脉冲效果
  if (BattleState.playerEnergy >= 100) {
    pFill.classList.add('full');
  } else {
    pFill.classList.remove('full');
  }
  if (BattleState.aiEnergy >= 100) {
    aFill.classList.add('full');
  } else {
    aFill.classList.remove('full');
  }
  
  // 护盾更新
  updateShieldUI('player');
  updateShieldUI('ai');
  updateNumberButtons();
}

function updateCombo() {
  const pCombo = document.getElementById('player-combo');
  const aCombo = document.getElementById('ai-combo');

  if (BattleState.playerCombo >= 2) {
    pCombo.textContent = BattleState.playerCombo + ' 连击!';
    pCombo.style.display = 'block';
    pCombo.style.animation = 'none';
    void pCombo.offsetWidth;
    pCombo.style.animation = 'comboPop 0.5s ease-out';
  } else {
    pCombo.style.display = 'none';
  }

  if (BattleState.aiCombo >= 2) {
    aCombo.textContent = BattleState.aiCombo + ' 连击!';
    aCombo.style.display = 'block';
  } else {
    aCombo.style.display = 'none';
  }
}

function updateAttackButtons() {
  const btnNormal = document.getElementById('btn-attack-normal');
  const btnHeavy = document.getElementById('btn-attack-heavy');
  const btnUltimate = document.getElementById('btn-attack-ultimate');

  btnNormal.disabled = BattleState.playerEnergy < ATTACK.NORMAL_COST;
  btnHeavy.disabled = BattleState.playerEnergy < ATTACK.HEAVY_COST;
  btnUltimate.disabled = BattleState.playerEnergy < ATTACK.ULTIMATE_COST;

  btnNormal.style.opacity = btnNormal.disabled ? '0.5' : '1';
  btnHeavy.style.opacity = btnHeavy.disabled ? '0.5' : '1';
  btnUltimate.style.opacity = btnUltimate.disabled ? '0.5' : '1';
}

function flashEnergyBar(side) {
  const bar = document.getElementById(side + '-energy-fill');
  const origBg = bar.style.background;
  bar.style.background = '#ef4444';
  setTimeout(() => {
    bar.style.background = origBg;
  }, 200);
}

// 棋盘闪烁（被攻击时的视觉反馈）
function flashBoard(side, color) {
  const wrap = document.getElementById(side + '-canvas-wrap');
  if (!wrap) return;
  const origBoxShadow = wrap.style.boxShadow;
  wrap.style.boxShadow = `0 0 20px 8px ${color || '#fecaca'} inset`;
  setTimeout(() => {
    wrap.style.boxShadow = origBoxShadow;
  }, 300);
}

function shakeBoard(side, intensity) {
  const wrap = document.getElementById(side + '-canvas-wrap');
  if (!wrap) return;
  const dur = intensity ? (0.3 + intensity * 0.5) : 0.5;
  wrap.style.animation = 'none';
  void wrap.offsetWidth;
  wrap.style.animation = `shake ${dur}s ease-in-out`;
}

function showAttackIndicator(side, type) {
  const el = document.getElementById(side + '-attack');
  if (!el) return;

  const labels = {
    normal: 'ATTACK!',
    heavy: 'HEAVY!',
    ultimate: 'ULTIMATE!!'
  };
  el.textContent = labels[type] || 'ATTACK!';
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
}

// ==========================================
// 胜负判断
// ==========================================
function checkPlayerWin() {
  const correct = countCorrectFilled(BattleState.playerBoard, 'player');
  if (correct >= 81) {
    endBattle('player');
  }
}

function checkAIWin() {
  const correct = countCorrectFilled(BattleState.aiBoard, 'ai');
  if (correct >= 81) {
    endBattle('ai');
  }
}

// ==========================================
// 结束对战
// ==========================================
function endBattle(winner) {
  BattleState.running = false;
  BattleState.winner = winner;

  if (BattleState.aiTimer) {
    clearTimeout(BattleState.aiTimer);
    BattleState.aiTimer = null;
  }
  if (BattleState.leftAiTimer) {
    clearTimeout(BattleState.leftAiTimer);
    BattleState.leftAiTimer = null;
  }
  stopShieldDecay('player');
  stopShieldDecay('ai');

  const elapsed = Math.floor((Date.now() - BattleState.startTime) / 1000);

  const resultEl = document.getElementById('battle-result');
  const titleEl = document.getElementById('result-title');
  const statsEl = document.getElementById('result-stats');

  if (BattleState.spectateMode) {
    if (winner === 'player') {
      titleEl.textContent = '🏆 Bot 1 胜利！';
      titleEl.className = 'result-title win';
    } else {
      titleEl.textContent = '🏆 Bot 2 胜利！';
      titleEl.className = 'result-title win';
    }
    // 观战模式放胜利音效即可
    AudioManager.playWin();
  } else {
    if (winner === 'player') {
      titleEl.textContent = '🎉 胜利！';
      titleEl.className = 'result-title win';
      AudioManager.playWin();
      // 角色庆祝
      setEmotion('player', 'win');
      playAvatarAnim('player', 'win-anim');
      setTimeout(() => playerSays('win'), 500);
      setTimeout(() => {
        setEmotion('ai', 'lose');
        playAvatarAnim('ai', 'shake');
        aiSays('lose');
      }, 1200);
    } else {
      titleEl.textContent = '😢 失败...';
      titleEl.className = 'result-title lose';
      AudioManager.playLose();
      // 角色失落
      setEmotion('player', 'lose');
      playAvatarAnim('player', 'shake');
      setTimeout(() => playerSays('lose'), 500);
      setTimeout(() => {
        setEmotion('ai', 'win');
        playAvatarAnim('ai', 'win-anim');
        aiSays('win');
      }, 1200);
    }
  }

  // 停止背景音乐
  AudioManager.stopBGM();

  const playerFilled = countCorrectFilled(BattleState.playerBoard, 'player');
  const aiFilled = countCorrectFilled(BattleState.aiBoard, 'ai');

  const label1 = BattleState.spectateMode ? 'Bot 1' : '你';
  const label2 = BattleState.spectateMode ? 'Bot 2' : 'AI';

  statsEl.innerHTML = `
    用时：${Math.floor(elapsed / 60)}分${elapsed % 60}秒<br>
    ${label1}进度：${playerFilled} / 81（${Math.floor(playerFilled/81*100)}%）<br>
    ${label2}进度：${aiFilled} / 81（${Math.floor(aiFilled/81*100)}%）<br>
    最高连击：${BattleState.playerMaxCombo}<br>
    ${label1}攻击：${BattleState.playerAttackCount} 次<br>
    ${label2}攻击：${BattleState.aiAttackCount} 次<br>
    AI 难度：${{easy:'简单', medium:'中等', hard:'困难'}[BattleState.aiDifficulty]}
  `;

  resultEl.classList.add('show');

  try {
    Storage.recordBattle({
      difficulty: BattleState.aiDifficulty,
      won: winner === 'player',
      time: elapsed,
      maxCombo: BattleState.playerMaxCombo,
      attacks: BattleState.playerAttackCount
    });
  } catch (e) {}
}

// ==========================================
// 工具函数
// ==========================================
function getCellFromCanvas(canvas, clientX, clientY, renderer, boardSize) {
  const rect = canvas.getBoundingClientRect();
  const size = boardSize || 9;
  const pad = renderer.padding;
  
  // 使用canvas实际显示尺寸计算（不依赖DPR手动缩放）
  const boardDisplayW = rect.width - pad * 2;
  const boardDisplayH = rect.height - pad * 2;
  const cellW = boardDisplayW / size;
  const cellH = boardDisplayH / size;
  
  let x = clientX - rect.left - pad;
  let y = clientY - rect.top - pad;
  
  let c = Math.floor(x / cellW);
  let r = Math.floor(y / cellH);
  
  // 边界clamp
  r = Math.max(0, Math.min(size - 1, r));
  c = Math.max(0, Math.min(size - 1, c));
  
  return { r, c };
}
