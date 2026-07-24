// ==========================================
// 启动期立绘路径兜底，chapters.json 加载完成后会被覆盖
// ==========================================
// 每个角色仅保留：id、name、portraits.default
// 完整角色数据（多语言名称、语音参数、全表情立绘）以 chapters.json 为准
// ==========================================

const CHARACTERS = {
  cagekeeper: {
    id: 'cagekeeper',
    name: '守笼人',
    portraits: {
      default: 'CK_01_庄重.png'
    }
  },
  yan: {
    id: 'yan',
    name: '阿妍',
    portraits: {
      default: 'R_01_冷静.png'
    }
  },
  ying: {
    id: 'ying',
    name: '莹莹',
    portraits: {
      default: 'J_03_认真.png'
    }
  },
  plotter: {
    id: 'plotter',
    name: '设局人',
    portraits: {
      default: 'P_01_常态.png'
    }
  },
  plotterShadow: {
    id: 'plotterShadow',
    name: '设局人残影',
    portraits: {
      default: 'P_02_残影态.png'
    }
  },
  weaver: {
    id: 'weaver',
    name: '星辰梭',
    portraits: {
      default: 'weaver_default.png'
    }
  },
  remnant: {
    id: 'remnant',
    name: '残局守护者',
    portraits: {
      default: 'remnant_default.png'
    }
  },
  setterSecret: {
    id: 'setterSecret',
    name: '设局人（秘术）',
    portraits: {
      default: 'setter_secret_default.png'
    }
  },
  shenmo: {
    id: 'shenmo',
    name: '沈墨',
    portraits: {
      default: 'SM_01_沉静.png'
    }
  },
  system: {
    id: 'system',
    name: '系统',
    portraits: {}
  },
  narrator: {
    id: 'narrator',
    name: '旁白',
    portraits: {}
  }
};

// 暴露到全局
if (typeof window !== 'undefined') {
  window.CHARACTERS = CHARACTERS;
}
