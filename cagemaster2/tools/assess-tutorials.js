/**
 * 教学引导质量评估工具
 * 扫描所有关卡的引导配置，检查常见问题并输出评估报告
 */

const fs = require('fs');
const path = require('path');

const CHAPTERS_PATH = path.join(__dirname, '..', 'data', 'chapters.json');

const data = JSON.parse(fs.readFileSync(CHAPTERS_PATH, 'utf-8'));

// ==========================================
// 评估规则
// ==========================================

const rules = {
  // 严重问题
  critical: [],
  // 中等问题
  warning: [],
  // 建议优化
  info: [],
};

function addCritical(levelId, triggerId, msg) {
  rules.critical.push({ level: levelId, trigger: triggerId, msg });
}
function addWarning(levelId, triggerId, msg) {
  rules.warning.push({ level: levelId, trigger: triggerId, msg });
}
function addInfo(levelId, triggerId, msg) {
  rules.info.push({ level: levelId, trigger: triggerId, msg });
}

// 统计数据
const stats = {
  totalLevels: 0,
  totalTriggers: 0,
  byType: {},
  byCondition: {},
  freezeMaskWithTarget: 0,
  freezeMaskWithoutTarget: 0,
  popupHintWithTarget: 0,
  popupHintWithoutTarget: 0,
};

// ==========================================
// 检查每个触发器
// ==========================================

data.chapters.forEach(ch => {
  const chapterId = ch.chapterId;
  
  ch.levels.forEach(level => {
    stats.totalLevels++;
    const levelId = level.levelId;
    const triggers = level.triggers || [];
    
    triggers.forEach(trigger => {
      stats.totalTriggers++;
      
      // 统计类型
      const type = trigger.type;
      stats.byType[type] = (stats.byType[type] || 0) + 1;
      
      // 统计条件
      const cond = trigger.condition;
      stats.byCondition[cond] = (stats.byCondition[cond] || 0) + 1;
      
      // ===== 严重问题检查 =====
      
      // 1. onKeyCellsFilledCorrectly 未实现
      if (cond === 'onKeyCellsFilledCorrectly') {
        addCritical(levelId, trigger.id, 'onKeyCellsFilledCorrectly 条件在 GuideManager 中未实现，触发器永远不会触发');
      }
      
      // 2. calc_panel / badge_award 未实现
      if (type === 'calc_panel') {
        addCritical(levelId, trigger.id, 'calc_panel 类型未实现，触发器不会有任何效果');
      }
      if (type === 'badge_award') {
        addCritical(levelId, trigger.id, 'badge_award 类型未实现，触发器不会有任何效果');
      }
      
      // 3. freeze_mask 的 targetType 不支持
      if (type === 'freeze_mask') {
        const tt = trigger.targetType;
        if (tt === 'col') {
          addCritical(levelId, trigger.id, 'targetType=col 在 FreezeMask 中未实现，会退化为全屏无高亮');
        }
        
        // 统计 freeze_mask 是否有目标
        const hasTarget = trigger.targetR !== undefined || trigger.targetC !== undefined 
          || trigger.targetCell !== undefined || trigger.highlightCage;
        if (hasTarget) {
          stats.freezeMaskWithTarget++;
        } else {
          stats.freezeMaskWithoutTarget++;
          addWarning(levelId, trigger.id, 'freeze_mask 缺少目标格子配置（targetR/targetC），聚光灯可能无法正确定位');
        }
      }
      
      // ===== 中等问题检查 =====
      
      // popup_hint 缺少目标
      if (type === 'popup_hint') {
        const hasTarget = trigger.targetR !== undefined || trigger.targetC !== undefined 
          || trigger.targetCell !== undefined || trigger.targetFromEvent;
        if (hasTarget) {
          stats.popupHintWithTarget++;
        } else {
          stats.popupHintWithoutTarget++;
          // 只有非全局提示才警告
          if (cond !== 'onLevelStart' && cond !== 'onLevelComplete') {
            addInfo(levelId, trigger.id, 'popup_hint 缺少目标格子，气泡会居中显示而不是指向特定位置');
          }
        }
      }
      
      // endgame 模式缺少 keyCells
      if (level.mode === 'endgame' && (!level.keyCells || level.keyCells.length === 0)) {
        addWarning(levelId, trigger.id || 'level', 'endgame 模式但 keyCells 为空，残局模式可能失效');
      }
      
      // 缺少 once 字段（可能导致重复触发）
      if (trigger.once === undefined && cond !== 'onStuckForSeconds' && cond !== 'onConflict') {
        // onStuckForSeconds 和 onConflict 通常是可重复触发的，不算问题
        addInfo(levelId, trigger.id, '缺少 once 字段，默认为 false（每次进入关卡都会重新触发）');
      }
    });
  });
});

// ==========================================
// 生成报告
// ==========================================

function generateReport() {
  let report = '';
  
  report += '# 教学引导质量评估报告\n\n';
  report += `> 生成时间：${new Date().toLocaleString('zh-CN')}\n\n`;
  report += `> 评估范围：全部 ${stats.totalLevels} 关 / ${stats.totalTriggers} 个触发器\n\n`;
  
  // 总览
  report += '## 一、总览\n\n';
  report += `| 指标 | 数值 |\n`;
  report += `|------|------|\n`;
  report += `| 总关卡数 | ${stats.totalLevels} |\n`;
  report += `| 总触发器数 | ${stats.totalTriggers} |\n`;
  report += `| 严重问题 | ${rules.critical.length} 个 |\n`;
  report += `| 中等问题 | ${rules.warning.length} 个 |\n`;
  report += `| 优化建议 | ${rules.info.length} 个 |\n\n`;
  
  // 类型分布
  report += '## 二、触发器类型分布\n\n';
  report += '| 类型 | 数量 | 占比 |\n';
  report += '|------|------|------|\n';
  Object.entries(stats.byType).sort((a, b) => b[1] - a[1]).forEach(([type, count]) => {
    const pct = ((count / stats.totalTriggers) * 100).toFixed(1);
    report += `| ${type} | ${count} | ${pct}% |\n`;
  });
  report += '\n';
  
  // 条件分布
  report += '## 三、触发条件分布\n\n';
  report += '| 条件 | 数量 |\n';
  report += '|------|------|\n';
  Object.entries(stats.byCondition).sort((a, b) => b[1] - a[1]).forEach(([cond, count]) => {
    report += `| ${cond} | ${count} |\n`;
  });
  report += '\n';
  
  // 聚光灯定位统计
  report += '## 四、聚光灯/气泡定位统计\n\n';
  report += '| 类别 | 有目标 | 无目标 | 完成率 |\n';
  report += '|------|--------|--------|--------|\n';
  const fmTotal = stats.freezeMaskWithTarget + stats.freezeMaskWithoutTarget;
  const fmRate = fmTotal > 0 ? ((stats.freezeMaskWithTarget / fmTotal) * 100).toFixed(1) : 0;
  report += `| freeze_mask 聚光灯 | ${stats.freezeMaskWithTarget} | ${stats.freezeMaskWithoutTarget} | ${fmRate}% |\n`;
  const phTotal = stats.popupHintWithTarget + stats.popupHintWithoutTarget;
  const phRate = phTotal > 0 ? ((stats.popupHintWithTarget / phTotal) * 100).toFixed(1) : 0;
  report += `| popup_hint 气泡 | ${stats.popupHintWithTarget} | ${stats.popupHintWithoutTarget} | ${phRate}% |\n\n`;
  
  // 严重问题
  if (rules.critical.length > 0) {
    report += '## 五、🔴 严重问题\n\n';
    report += '| 关卡 | 触发器 | 问题 |\n';
    report += '|------|--------|------|\n';
    rules.critical.forEach(item => {
      report += `| ${item.level} | ${item.trigger} | ${item.msg} |\n`;
    });
    report += '\n';
  }
  
  // 中等问题
  if (rules.warning.length > 0) {
    report += '## 六、🟡 中等问题\n\n';
    report += '| 关卡 | 触发器 | 问题 |\n';
    report += '|------|--------|------|\n';
    rules.warning.forEach(item => {
      report += `| ${item.level} | ${item.trigger} | ${item.msg} |\n`;
    });
    report += '\n';
  }
  
  // 优化建议
  if (rules.info.length > 0) {
    report += `## 七、🟢 优化建议（共 ${rules.info.length} 条，仅展示前 20 条）\n\n`;
    report += '| 关卡 | 触发器 | 建议 |\n';
    report += '|------|--------|------|\n';
    rules.info.slice(0, 20).forEach(item => {
      report += `| ${item.level} | ${item.trigger} | ${item.msg} |\n`;
    });
    if (rules.info.length > 20) {
      report += `| ... | ... | 还有 ${rules.info.length - 20} 条... |\n`;
    }
    report += '\n';
  }
  
  // 评分
  report += '## 八、综合评分\n\n';
  const criticalWeight = 10;
  const warningWeight = 3;
  const infoWeight = 1;
  const totalScore = 100;
  const deduction = rules.critical.length * criticalWeight + rules.warning.length * warningWeight + rules.info.length * infoWeight;
  const finalScore = Math.max(0, totalScore - deduction);
  
  let grade = 'S';
  if (finalScore < 60) grade = 'D';
  else if (finalScore < 70) grade = 'C';
  else if (finalScore < 80) grade = 'B';
  else if (finalScore < 90) grade = 'A';
  else if (finalScore < 95) grade = 'A+';
  
  report += `| 项目 | 得分 |\n`;
  report += `|------|------|\n`;
  report += `| 总分 | ${finalScore} / 100 |\n`;
  report += `| 评级 | ${grade} |\n`;
  report += `| 严重问题扣分 | -${rules.critical.length * criticalWeight} |\n`;
  report += `| 中等问题扣分 | -${rules.warning.length * warningWeight} |\n`;
  report += `| 优化建议扣分 | -${rules.info.length * infoWeight} |\n\n`;
  
  return report;
}

// 输出
const report = generateReport();
const reportPath = path.join(__dirname, '..', 'docs', '教学引导质量评估报告.md');
fs.writeFileSync(reportPath, report, 'utf-8');

console.log(report);
console.log(`\n报告已保存到：${reportPath}`);

// 退出码：有严重问题返回 1
process.exit(rules.critical.length > 0 ? 1 : 0);
