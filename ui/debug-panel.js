/**
 * DebugPanel - 教学系统健康度仪表盘
 *
 * 调试模式下的 UI 覆盖层，用于监控教学系统状态。
 * 仅在开发模式或 ?debug=true 时显示。
 *
 * 功能：
 * - 实时显示当前教学阶段、关卡 ID、阶段名称
 * - 显示状态机状态（等待输入/冻结/高亮等）
 * - 显示错题本统计摘要
 * - 显示关卡进度统计
 * - 显示性能监控数据（FPS、画质等级）
 * - 提供手动操作按钮（跳过教学、重置教学、下一阶段等）
 * - 日志面板：显示最近的教学事件
 */

export class DebugPanel {
  constructor(options) {
    options = options || {};
    this._engine = options.engine || null;
    this._lessonPlayer = options.lessonPlayer || null;
    this._levelManager = options.levelManager || null;
    this._performanceMonitor = options.performanceMonitor || null;
    this._enabled = options.enabled === true || (typeof window !== "undefined" && window.location && window.location.search.indexOf("debug=true") >= 0);
    this._container = null;
    this._logEntries = [];
    this._maxLogEntries = 50;
    this._updateTimer = null;
    this._visible = false;
  }

  /**
   * 初始化并挂载到 DOM
   */
  init() {
    try {
      if (!this._enabled) return false;
      try {
        this._createPanel();
        this._startUpdates();
        this.log("DebugPanel 初始化完成");
        return true;
      } catch (e) {
        console.warn("[DebugPanel] Init failed:", e.message);
        return false;
      }
    } catch (e) {
      console.warn("[DebugPanel] init error:", e);
      return false;
    }
  }

  /**
   * 记录一条日志
   */
  log(message, type) {
    try {
      type = type || "info";
      this._logEntries.push({
        time: new Date().toLocaleTimeString(),
        message: message,
        type: type,
      });
      if (this._logEntries.length > this._maxLogEntries) {
        this._logEntries.shift();
      }
      this._updateLogPanel();
    } catch (e) {
      console.warn("[DebugPanel] log error:", e);
    }
  }

  /**
   * 显示/隐藏面板
   */
  toggle() {
    try {
      if (!this._container) return;
      this._visible = !this._visible;
      this._container.style.display = this._visible ? "flex" : "none";
    } catch (e) {
      console.warn("[DebugPanel] toggle error:", e);
    }
  }

  /**
   * 显示面板
   */
  show() {
    try {
      this._visible = true;
      if (this._container) this._container.style.display = "flex";
    } catch (e) {
      console.warn("[DebugPanel] show error:", e);
    }
  }

  /**
   * 隐藏面板
   */
  hide() {
    try {
      this._visible = false;
      if (this._container) this._container.style.display = "none";
    } catch (e) {
      console.warn("[DebugPanel] hide error:", e);
    }
  }

  /**
   * 销毁面板
   */
  destroy() {
    try {
      if (this._updateTimer) {
        clearInterval(this._updateTimer);
        this._updateTimer = null;
      }
      if (this._container && this._container.parentNode) {
        this._container.parentNode.removeChild(this._container);
      }
      this._container = null;
    } catch (e) {
      console.warn("[DebugPanel] destroy error:", e);
    }
  }

  /**
   * 设置引擎引用
   */
  setEngine(engine) {
    try {
      this._engine = engine;
    } catch (e) {
      console.warn("[DebugPanel] setEngine error:", e);
    }
  }

  setLessonPlayer(lp) {
    try {
      this._lessonPlayer = lp;
    } catch (e) {
      console.warn("[DebugPanel] setLessonPlayer error:", e);
    }
  }

  setLevelManager(lm) {
    try {
      this._levelManager = lm;
    } catch (e) {
      console.warn("[DebugPanel] setLevelManager error:", e);
    }
  }

  setPerformanceMonitor(pm) {
    try {
      this._performanceMonitor = pm;
    } catch (e) {
      console.warn("[DebugPanel] setPerformanceMonitor error:", e);
    }
  }

  /**
   * 获取启用状态
   */
  isEnabled() { return this._enabled; }

  // ==================== 内部 ====================

  _createPanel() {
    if (typeof document === "undefined") return;
    if (this._container) return;

    this._container = document.createElement("div");
    this._container.id = "cagemaster-debug-panel";
    this._container.style.cssText = [
      "position:fixed",
      "top:10px",
      "right:10px",
      "width:360px",
      "max-height:90vh",
      "background:rgba(15,10,6,0.92)",
      "border:1px solid #ffa726",
      "border-radius:8px",
      "padding:12px",
      "font-family:monospace",
      "font-size:12px",
      "color:#e0d5c8",
      "z-index:99999",
      "overflow-y:auto",
      "display:none",
      "flex-direction:column",
      "gap:8px",
      "box-shadow:0 4px 20px rgba(0,0,0,0.5)",
    ].join(";");

    // 标题栏
    var header = document.createElement("div");
    header.style.cssText = "display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #555;padding-bottom:6px";
    header.innerHTML = "<span style=\"color:#ffa726;font-weight:bold\">\u2699 Debug Panel</span>";
    var closeBtn = document.createElement("button");
    closeBtn.textContent = "X";
    closeBtn.style.cssText = "background:none;border:1px solid #666;color:#e0d5c8;cursor:pointer;border-radius:4px;padding:2px 8px";
    var self = this;
    closeBtn.onclick = function() { self.hide(); };
    header.appendChild(closeBtn);
    this._container.appendChild(header);

    // 状态面板
    this._statusEl = document.createElement("div");
    this._statusEl.style.cssText = "font-size:11px;line-height:1.6;padding:4px 0";
    this._container.appendChild(this._statusEl);

    // 操作按钮
    var btnRow = document.createElement("div");
    btnRow.style.cssText = "display:flex;gap:4px;flex-wrap:wrap";
    var btnStyle = "background:#333;border:1px solid #555;color:#e0d5c8;cursor:pointer;border-radius:4px;padding:4px 8px;font-size:11px";
    var buttons = [
      { text: "\u25B6 \u4E0B\u4E00\u9636\u6BB5", action: "advance" },
      { text: "\u23ED \u8DF3\u8FC7\u6559\u5B66", action: "skip" },
      { text: "\u21BA \u91CD\u7F6E\u6559\u5B66", action: "reset" },
      { text: "\uD83D\uDD0D \u72B6\u6001\u5FEB\u7167", action: "snapshot" },
    ];
    for (var bi = 0; bi < buttons.length; bi++) {
      (function(b) {
        var btn = document.createElement("button");
        btn.textContent = b.text;
        btn.style.cssText = btnStyle;
        btn.onclick = function() { self._handleAction(b.action); };
        btnRow.appendChild(btn);
      })(buttons[bi]);
    }
    this._container.appendChild(btnRow);

    // 日志面板
    var logLabel = document.createElement("div");
    logLabel.textContent = "\uD83D\uDCCB \u6559\u5B66\u65E5\u5FD7";
    logLabel.style.cssText = "border-top:1px solid #555;padding-top:6px;margin-top:4px;font-size:11px;color:#999";
    this._container.appendChild(logLabel);

    this._logEl = document.createElement("div");
    this._logEl.style.cssText = "font-size:10px;line-height:1.5;max-height:200px;overflow-y:auto;padding:4px;background:rgba(0,0,0,0.3);border-radius:4px";
    this._container.appendChild(this._logEl);

    document.body.appendChild(this._container);
  }

  _startUpdates() {
    try {
      var self = this;
      this._updateTimer = setInterval(function() {
        try {
          self._updateStatus();
        } catch (e) {
          console.warn("[DebugPanel] update interval error:", e);
        }
      }, 500);
    } catch (e) {
      console.warn("[DebugPanel] _startUpdates error:", e);
    }
  }

  _updateStatus() {
    try {
      if (!this._statusEl) return;
      var lines = [];

      // 教学状态
      if (this._lessonPlayer) {
        try {
          var lp = this._lessonPlayer;
          lines.push("<span style=\"color:#66bb6a\">\u5F53\u524D\u9636\u6BB5:</span> " + (lp.currentPhase || "?") + " | " + (lp.isWaitingInput ? "\u7B49\u5F85\u8F93\u5165" : ""));
          lines.push("<span style=\"color:#66bb6a\">\u4EA4\u4E92\u7C7B\u578B:</span> " + (lp.getInteractionType ? lp.getInteractionType() : "?"));
          if (lp.getGuidedTarget) {
            var target = lp.getGuidedTarget();
            if (target) lines.push("<span style=\"color:#ffa726\">\u76EE\u6807\u683C:</span> (" + target.cell.join(",") + ") -> " + target.value);
          }
          lines.push("<span style=\"color:#66bb6a\">\u6FC0\u6D3B:</span> " + lp.isActive);
        } catch (e) {
          lines.push("\u6559\u5B66\u72B6\u6001\u8BFB\u53D6\u5931\u8D25");
        }
      } else {
        lines.push("<span style=\"color:#999\">\u6559\u5B66\u5F15\u64CE: \u672A\u8FDE\u63A5</span>");
      }

      // 引擎状态
      if (this._engine) {
        try {
          var state = this._engine.getState();
          if (state) {
            var v = state.validation || {};
            lines.push("<span style=\"color:#42a5f5\">\u76D8\u9762: </span>" + v.filledCount + "/" + (v.filledCount + v.emptyCount) + " \u5DF2\u586B | " + v.errorCount + " \u9519\u8BEF");
          }
          // 错题本
          if (typeof this._engine.getErrorSummary === "function") {
            var es = this._engine.getErrorSummary();
            if (es && es.total > 0) {
              lines.push("<span style=\"color:#ef5350\">\u9519\u9898\u672C: </span>" + es.total + " \u6B21\u9519\u8BEF");
            }
          }
        } catch (e) {
          lines.push("\u5F15\u64CE\u72B6\u6001\u8BFB\u53D6\u5931\u8D25");
        }
      }

      // 关卡进度
      if (this._levelManager) {
        try {
          var prog = this._levelManager.getProgress();
          if (prog) {
            lines.push("<span style=\"color:#ab47bc\">\u5173\u5361\u8FDB\u5EA6: </span>" + prog.completed + "/" + prog.total + " (" + prog.progress + "%)");
          }
        } catch (e) {}
      }

      // 性能
      if (this._performanceMonitor) {
        try {
          var stats = this._performanceMonitor.getStats();
          if (stats) {
            lines.push("<span style=\"color:#ffa726\">\u6027\u80FD: </span>" + stats.fps + " FPS | " + stats.level);
          }
        } catch (e) {}
      }

      if (this._statusEl) {
        this._statusEl.innerHTML = lines.join("<br>");
      }
    } catch (e) {
      console.warn("[DebugPanel] _updateStatus error:", e);
    }
  }

  _updateLogPanel() {
    try {
      if (!this._logEl) return;
      var html = "";
      var entries = this._logEntries.slice(-20);
      for (var i = entries.length - 1; i >= 0; i--) {
        var e = entries[i];
        var color = e.type === "error" ? "#ef5350" : e.type === "warn" ? "#ffa726" : "#e0d5c8";
        html += "<div style=\"color:" + color + "\">[" + e.time + "] " + e.message + "</div>";
      }
      this._logEl.innerHTML = html;
    } catch (e) {
      console.warn("[DebugPanel] _updateLogPanel error:", e);
    }
  }

  _handleAction(action) {
    try {
      switch (action) {
        case "advance":
          if (this._lessonPlayer && this._lessonPlayer.advance) {
            this._lessonPlayer.advance();
            this.log("\u6267\u884C: \u4E0B\u4E00\u9636\u6BB5");
          }
          break;
        case "skip":
          if (this._lessonPlayer && this._lessonPlayer.skip) {
            this._lessonPlayer.skip();
            this.log("\u6267\u884C: \u8DF3\u8FC7\u6559\u5B66");
          }
          break;
        case "reset":
          if (this._lessonPlayer && this._lessonPlayer.start) {
            this._lessonPlayer.start();
            this.log("\u6267\u884C: \u91CD\u7F6E\u6559\u5B66");
          }
          break;
        case "snapshot":
          if (this._engine) {
            try {
              var state = this._engine.getState();
              console.log("[DebugPanel] State Snapshot:", JSON.stringify(state, null, 2));
              this.log("\u5FEB\u7167\u5DF2\u6253\u5370\u5230 Console");
            } catch (e) {
              this.log("\u5FEB\u7167\u5931\u8D25: " + e.message, "error");
            }
          }
          break;
      }
    } catch (e) {
      console.warn("[DebugPanel] _handleAction error:", e);
    }
  }
}

export default DebugPanel;