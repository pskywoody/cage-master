// ReplaySystem - Replay Layer
// Records, plays back, and annotates player move history
// Builds on top of board.history for step-by-step replay

;(function(global) {
  'use strict';

  // ========================================================
  //  Step type constants
  // ========================================================
  const STEP_TYPES = {
    FILL_NUMBER: 'fillNumber',
    ERASE_NUMBER: 'eraseNumber',
    TOGGLE_CANDIDATE: 'toggleCandidate',
    BATCH_TOGGLE_CANDIDATE: 'batchToggleCandidate',
    TOGGLE_ELIMINATION: 'toggleElimination',
    BATCH_TOGGLE_ELIMINATION: 'batchToggleElimination',
    BATCH_ERASE: 'batchErase',
    CLEAR_ALL_CANDIDATES: 'clearAllCandidates',
    AUTO_FILL_CANDIDATES: 'autoFillCandidates',
    SET_NUMBER_AT: 'setNumberAt',
  };

  const KEY_STEP_TYPES = {
    BREAKTHROUGH: 'breakthrough',
    FLOW_BURST: 'flowBurst',
    CORRECTION: 'correction',
    MAJOR_ELIMINATION: 'majorElimination',
  };

  // ========================================================
  //  ReplaySystem class
  // ========================================================
  class ReplaySystem {
    constructor(board, options = {}) {
      this.board = board;
      this.options = options;

      // Replay state
      this._recording = false;
      this._playing = false;
      this._paused = false;
      this._playbackTimer = null;
      this._playbackSpeed = options.speed || 2;

      // Steps data
      this._steps = [];
      this._currentStepIndex = -1;
      this._baselineSnapshot = null;
      this._recordStartHistoryLen = 0;

      // Playback state snapshot (for restoring after replay)
      this._playbackSnapshot = null;

      // Key step markers
      this._keySteps = [];

      // Callbacks
      this.onStepChange = options.onStepChange || null;
      this.onKeyStep = options.onKeyStep || null;
      this.onPlayStart = options.onPlayStart || null;
      this.onPlayEnd = options.onPlayEnd || null;

      // Detection config
      this._keyStepConfig = {
        flowBurstThreshold: options.flowBurstThreshold || 5,
        majorEliminationCount: options.majorEliminationCount || 10,
      };
    }

    // ========================================================
    //  Recording
    // ========================================================

    /**
     * Start recording from the current board state.
     * Captures a baseline snapshot so replay can rebuild from any point.
     */
    record() {
      this.stop();
      this._recording = true;
      this._recordStartHistoryLen = this.board.history.length;
      this._baselineSnapshot = this._snapshotBoardState();
      this._steps = [];
      this._currentStepIndex = -1;
      this._keySteps = [];
    }

    /**
     * Stop recording. Returns the number of steps recorded.
     */
    stopRecording() {
      if (!this._recording) return 0;
      this._syncFromBoardHistory();
      this._recording = false;
      return this._steps.length;
    }

    /**
     * Sync steps from board.history since recording started.
     * Computes forward values by walking backward from current state.
     */
    _syncFromBoardHistory() {
      const history = this.board.history;
      const startLen = this._recordStartHistoryLen;

      if (history.length <= startLen) {
        this._steps = [];
        return;
      }

      const entries = history.slice(startLen);

      // Strategy: start from current board state (end state),
      // apply each undo in reverse order to compute forward values.
      // We build a "cell state map" that we walk backward.

      // Start with current state as the "after last step" state
      let state = this._snapshotCellStates();

      // Walk backward through history entries
      // For each entry, compute what changed (forward delta)
      const stepsForward = [];

      for (let i = entries.length - 1; i >= 0; i--) {
        const entry = entries[i];
        const step = this._buildStepFromEntryAndState(entry, i, state);
        if (step) {
          stepsForward.unshift(step);
          // Update state to "before this step" by applying undo
          this._applyUndoToState(state, entry);
        }
      }

      this._steps = stepsForward;
      this._detectKeySteps();
    }

    /**
     * Build a normalized step with forward information, using the entry
     * and the state AFTER the operation was applied.
     */
    _buildStepFromEntryAndState(entry, index, afterState) {
      const info = this._classifyEntry(entry);
      if (!info) return null;

      const step = {
        index: index,
        type: info.type,
        cells: info.cells,
        timestamp: index + 1, // sequential index as pseudo-timestamp
        metadata: {},
        rawEntry: entry,
        isKeyStep: false,
        keyStepType: null,
      };

      // Compute forward values based on step type
      switch (info.type) {
        case STEP_TYPES.FILL_NUMBER:
        case STEP_TYPES.SET_NUMBER_AT:
        case STEP_TYPES.ERASE_NUMBER: {
          const cellAfter = afterState.cells[entry.r][entry.c];
          step.metadata.oldFill = entry.oldFill;
          step.metadata.newFill = cellAfter.fillNum;
          step.metadata.oldCandidates = entry.oldCandidates;
          step.metadata.newCandidates = new Set(cellAfter.candidates);
          step.metadata.relatedCandidates = entry.relatedCandidates || [];
          step.metadata.relatedEliminations = entry.relatedEliminations || [];
          break;
        }
        case STEP_TYPES.TOGGLE_CANDIDATE: {
          const cellAfter = afterState.cells[entry.r][entry.c];
          const oldSet = entry.oldCandidates;
          const newSet = cellAfter.candidates;
          // Find which number changed
          let changedNum = null;
          for (const n of newSet) {
            if (!oldSet.has(n)) { changedNum = n; break; }
          }
          if (changedNum === null) {
            for (const n of oldSet) {
              if (!newSet.has(n)) { changedNum = n; break; }
            }
          }
          step.metadata.num = changedNum;
          step.metadata.added = changedNum !== null && newSet.has(changedNum);
          break;
        }
        case STEP_TYPES.BATCH_TOGGLE_CANDIDATE: {
          step.metadata.num = entry.num;
          // Determine direction from first cell
          const firstCell = entry.cells[0];
          if (firstCell) {
            const cellAfter = afterState.cells[firstCell.r][firstCell.c];
            const hadIt = firstCell.oldCandidates.has(entry.num);
            const hasIt = cellAfter.candidates.has(entry.num);
            step.metadata.added = hasIt && !hadIt;
          }
          break;
        }
        case STEP_TYPES.TOGGLE_ELIMINATION: {
          const cellAfter = afterState.cells[entry.r][entry.c];
          const oldSet = entry.oldEliminations;
          const newSet = cellAfter.eliminations;
          let changedNum = null;
          for (const n of newSet) {
            if (!oldSet.has(n)) { changedNum = n; break; }
          }
          if (changedNum === null) {
            for (const n of oldSet) {
              if (!newSet.has(n)) { changedNum = n; break; }
            }
          }
          step.metadata.num = changedNum;
          step.metadata.added = changedNum !== null && newSet.has(changedNum);
          break;
        }
        case STEP_TYPES.BATCH_TOGGLE_ELIMINATION: {
          step.metadata.num = entry.num;
          const firstCell = entry.cells[0];
          if (firstCell) {
            const cellAfter = afterState.cells[firstCell.r][firstCell.c];
            const hadIt = firstCell.oldEliminations.has(entry.num);
            const hasIt = cellAfter.eliminations.has(entry.num);
            step.metadata.added = hasIt && !hadIt;
          }
          break;
        }
        case STEP_TYPES.BATCH_ERASE: {
          // All cells set to null/clear
          step.metadata.cells = entry.cells.map(c => ({
            r: c.r, c: c.c,
            oldFill: c.oldFill,
            oldCandidates: c.oldCandidates,
            oldEliminations: c.oldEliminations,
          }));
          break;
        }
        case STEP_TYPES.CLEAR_ALL_CANDIDATES: {
          step.metadata.clearedCells = entry.oldCandidates.map(c => ({
            r: c.r, c: c.c,
            candidates: c.candidates,
          }));
          break;
        }
        case STEP_TYPES.AUTO_FILL_CANDIDATES: {
          step.metadata.cells = entry.cells.map(c => ({
            r: c.r, c: c.c,
            oldCandidates: c.oldCandidates,
          }));
          // Compute new candidates from afterState
          step.metadata.cells.forEach(cellInfo => {
            const after = afterState.cells[cellInfo.r][cellInfo.c];
            cellInfo.newCandidates = new Set(after.candidates);
          });
          break;
        }
      }

      return step;
    }

    /**
     * Classify a raw history entry and extract cell info.
     */
    _classifyEntry(entry) {
      let type = null;
      let cells = [];

      if (entry.type === 'batchToggleCandidate') {
        type = STEP_TYPES.BATCH_TOGGLE_CANDIDATE;
        cells = entry.cells.map(c => ({ r: c.r, c: c.c }));
      } else if (entry.type === 'batchErase') {
        type = STEP_TYPES.BATCH_ERASE;
        cells = entry.cells.map(c => ({ r: c.r, c: c.c }));
      } else if (entry.type === 'clearAllCandidates') {
        type = STEP_TYPES.CLEAR_ALL_CANDIDATES;
        cells = entry.oldCandidates.map(c => ({ r: c.r, c: c.c }));
      } else if (entry.type === 'toggleElimination') {
        type = STEP_TYPES.TOGGLE_ELIMINATION;
        cells = [{ r: entry.r, c: entry.c }];
      } else if (entry.type === 'batchToggleElimination') {
        type = STEP_TYPES.BATCH_TOGGLE_ELIMINATION;
        cells = entry.cells.map(c => ({ r: c.r, c: c.c }));
      } else if (entry.type === 'autoFillCandidates') {
        type = STEP_TYPES.AUTO_FILL_CANDIDATES;
        cells = entry.cells.map(c => ({ r: c.r, c: c.c }));
      } else if (entry.r !== undefined && entry.c !== undefined && entry.type === undefined) {
        // Single cell operation - determine which one
        const hasOldFill = entry.oldFill !== undefined;
        const hasOldCandidates = entry.oldCandidates !== undefined;
        const hasOldEliminations = entry.oldEliminations !== undefined;
        const hasRelated = entry.relatedCandidates && entry.relatedCandidates.length > 0;

        if (hasRelated) {
          // setNumber with auto-clear
          type = STEP_TYPES.FILL_NUMBER;
          cells = [{ r: entry.r, c: entry.c }];
        } else if (hasOldFill && hasOldEliminations && hasOldCandidates) {
          // Could be eraseNumber (oldFill is non-null) or setNumberAt (oldFill is null)
          if (entry.oldFill !== null) {
            type = STEP_TYPES.ERASE_NUMBER;
          } else {
            type = STEP_TYPES.SET_NUMBER_AT;
          }
          cells = [{ r: entry.r, c: entry.c }];
        } else if (hasOldFill && hasOldCandidates && !hasOldEliminations) {
          // toggleCandidate
          type = STEP_TYPES.TOGGLE_CANDIDATE;
          cells = [{ r: entry.r, c: entry.c }];
        } else if (hasOldFill) {
          // setNumberAt without auto-clear and no oldEliminations
          type = STEP_TYPES.SET_NUMBER_AT;
          cells = [{ r: entry.r, c: entry.c }];
        }
      }

      if (!type) return null;
      return { type, cells };
    }

    /**
     * Apply undo of a history entry to a state object.
     * Used during backward walk to compute forward values.
     */
    _applyUndoToState(state, entry) {
      const info = this._classifyEntry(entry);
      if (!info) return;

      switch (info.type) {
        case STEP_TYPES.FILL_NUMBER:
        case STEP_TYPES.SET_NUMBER_AT:
        case STEP_TYPES.ERASE_NUMBER: {
          const cell = state.cells[entry.r][entry.c];
          cell.fillNum = entry.oldFill;
          cell.candidates = new Set(entry.oldCandidates || []);
          cell.eliminations = new Set(entry.oldEliminations || []);
          // Restore related candidates
          if (entry.relatedCandidates) {
            for (const { r, c, num } of entry.relatedCandidates) {
              state.cells[r][c].candidates.add(num);
            }
          }
          if (entry.relatedEliminations) {
            for (const { r, c, num } of entry.relatedEliminations) {
              state.cells[r][c].eliminations.delete(num);
            }
          }
          break;
        }
        case STEP_TYPES.TOGGLE_CANDIDATE: {
          const cell = state.cells[entry.r][entry.c];
          cell.candidates = new Set(entry.oldCandidates || []);
          break;
        }
        case STEP_TYPES.BATCH_TOGGLE_CANDIDATE: {
          for (const cInfo of entry.cells) {
            const cell = state.cells[cInfo.r][cInfo.c];
            cell.candidates = new Set(cInfo.oldCandidates || []);
          }
          break;
        }
        case STEP_TYPES.TOGGLE_ELIMINATION: {
          const cell = state.cells[entry.r][entry.c];
          cell.eliminations = new Set(entry.oldEliminations || []);
          cell.candidates = new Set(entry.oldCandidates || []);
          break;
        }
        case STEP_TYPES.BATCH_TOGGLE_ELIMINATION: {
          for (const cInfo of entry.cells) {
            const cell = state.cells[cInfo.r][cInfo.c];
            cell.eliminations = new Set(cInfo.oldEliminations || []);
            cell.candidates = new Set(cInfo.oldCandidates || []);
          }
          break;
        }
        case STEP_TYPES.BATCH_ERASE: {
          for (const cInfo of entry.cells) {
            const cell = state.cells[cInfo.r][cInfo.c];
            cell.fillNum = cInfo.oldFill;
            cell.candidates = new Set(cInfo.oldCandidates || []);
            cell.eliminations = new Set(cInfo.oldEliminations || []);
          }
          break;
        }
        case STEP_TYPES.CLEAR_ALL_CANDIDATES: {
          for (const cInfo of entry.oldCandidates) {
            const cell = state.cells[cInfo.r][cInfo.c];
            cell.candidates = new Set(cInfo.candidates || []);
          }
          break;
        }
        case STEP_TYPES.AUTO_FILL_CANDIDATES: {
          for (const cInfo of entry.cells) {
            const cell = state.cells[cInfo.r][cInfo.c];
            cell.candidates = new Set(cInfo.oldCandidates || []);
          }
          break;
        }
      }
    }

    /**
     * Snapshot cell states (fill + candidates + eliminations) as plain objects.
     * Lighter than full board snapshot.
     */
    _snapshotCellStates() {
      const board = this.board;
      const cells = [];
      for (let r = 0; r < board.size; r++) {
        const row = [];
        for (let c = 0; c < board.size; c++) {
          const cell = board.cells[r][c];
          row.push({
            fillNum: cell.fillNum,
            candidates: new Set(cell.candidates),
            eliminations: new Set(cell.eliminations),
          });
        }
        cells.push(row);
      }
      return { size: board.size, cells };
    }

    // ========================================================
    //  Key step detection
    // ========================================================

    _detectKeySteps() {
      this._keySteps = [];
      let consecutiveFills = 0;
      let wasStuck = false;
      let stepsSinceLastFill = 0;

      for (let i = 0; i < this._steps.length; i++) {
        const step = this._steps[i];

        if (step.type === STEP_TYPES.FILL_NUMBER || step.type === STEP_TYPES.SET_NUMBER_AT) {
          const isNewFill = step.metadata.oldFill === null;

          if (isNewFill) {
            consecutiveFills++;
            stepsSinceLastFill = 0;

            if (wasStuck) {
              step.isKeyStep = true;
              step.keyStepType = KEY_STEP_TYPES.BREAKTHROUGH;
              this._keySteps.push(i);
              wasStuck = false;
            }

            if (consecutiveFills === this._keyStepConfig.flowBurstThreshold) {
              step.isKeyStep = true;
              step.keyStepType = KEY_STEP_TYPES.FLOW_BURST;
              this._keySteps.push(i);
            }
          } else {
            step.isKeyStep = true;
            step.keyStepType = KEY_STEP_TYPES.CORRECTION;
            this._keySteps.push(i);
            consecutiveFills = 0;
          }
        } else if (step.type === STEP_TYPES.ERASE_NUMBER) {
          consecutiveFills = 0;
          stepsSinceLastFill++;
        } else {
          stepsSinceLastFill++;
          if (stepsSinceLastFill > 15 && !wasStuck && consecutiveFills > 0) {
            wasStuck = true;
          }
        }

        if ((step.type === STEP_TYPES.BATCH_TOGGLE_CANDIDATE ||
             step.type === STEP_TYPES.BATCH_TOGGLE_ELIMINATION) &&
            step.cells.length >= this._keyStepConfig.majorEliminationCount) {
          step.isKeyStep = true;
          step.keyStepType = KEY_STEP_TYPES.MAJOR_ELIMINATION;
          this._keySteps.push(i);
        }
      }
    }

    // ========================================================
    //  Playback control
    // ========================================================

    /**
     * Start auto-playback from the current step.
     * @param {number} speed - Steps per second (default 2)
     */
    play(speed) {
      if (this._steps.length === 0) {
        this._syncFromBoardHistory();
      }
      if (this._steps.length === 0) return;

      this._recording = false;
      this._playing = true;
      this._paused = false;

      if (speed !== undefined) {
        this._playbackSpeed = speed;
      }

      // Save current state so we can restore on stop
      if (!this._playbackSnapshot) {
        this._playbackSnapshot = this._snapshotBoardState();
      }

      // If at the end, start from beginning
      if (this._currentStepIndex >= this._steps.length - 1) {
        this._resetToBaseline();
        this._currentStepIndex = -1;
      }

      if (this.onPlayStart) {
        try { this.onPlayStart(); } catch(e) {}
      }

      this._startPlaybackTimer();
    }

    pause() {
      if (!this._playing) return;
      this._paused = true;
      this._stopPlaybackTimer();
    }

    resume() {
      if (!this._playing || !this._paused) return;
      this._paused = false;
      this._startPlaybackTimer();
    }

    stepForward() {
      if (this._steps.length === 0) {
        this._syncFromBoardHistory();
      }
      if (this._steps.length === 0) return;
      if (this._currentStepIndex >= this._steps.length - 1) return;

      if (!this._playbackSnapshot) {
        this._playbackSnapshot = this._snapshotBoardState();
        this._resetToBaseline();
        this._currentStepIndex = -1;
      }

      this._currentStepIndex++;
      this._applyStepForward(this._steps[this._currentStepIndex]);
      this._fireStepChange();

      const step = this._steps[this._currentStepIndex];
      if (step.isKeyStep && this.onKeyStep) {
        try { this.onKeyStep(this._currentStepIndex, step); } catch(e) {}
      }
    }

    stepBackward() {
      if (this._steps.length === 0) return;
      if (this._currentStepIndex < 0) return;

      this._applyStepBackward(this._steps[this._currentStepIndex]);
      this._currentStepIndex--;
      this._fireStepChange();
    }

    goToStep(stepIndex) {
      if (this._steps.length === 0) {
        this._syncFromBoardHistory();
      }
      if (this._steps.length === 0) return;

      const target = Math.max(-1, Math.min(stepIndex, this._steps.length - 1));

      if (!this._playbackSnapshot) {
        this._playbackSnapshot = this._snapshotBoardState();
      }

      this._resetToBaseline();
      this._currentStepIndex = -1;

      for (let i = 0; i <= target; i++) {
        this._currentStepIndex = i;
        this._applyStepForward(this._steps[i]);
      }

      this._fireStepChange();
    }

    goToNextKeyStep() {
      const nextIdx = this._keySteps.find(i => i > this._currentStepIndex);
      if (nextIdx !== undefined) {
        this.goToStep(nextIdx);
        return true;
      }
      return false;
    }

    goToPrevKeyStep() {
      for (let i = this._keySteps.length - 1; i >= 0; i--) {
        if (this._keySteps[i] < this._currentStepIndex) {
          this.goToStep(this._keySteps[i]);
          return true;
        }
      }
      return false;
    }

    /**
     * Stop playback and restore the board to its original state.
     */
    stop() {
      this._stopPlaybackTimer();
      this._playing = false;
      this._paused = false;

      if (this._playbackSnapshot) {
        this._restoreBoardState(this._playbackSnapshot);
        this._playbackSnapshot = null;
      }

      this._currentStepIndex = -1;

      if (this.onPlayEnd) {
        try { this.onPlayEnd(); } catch(e) {}
      }
    }

    // ========================================================
    //  Internal: step application (forward & backward)
    // ========================================================

    _startPlaybackTimer() {
      this._stopPlaybackTimer();
      const interval = 1000 / this._playbackSpeed;
      this._playbackTimer = setInterval(() => {
        if (this._currentStepIndex >= this._steps.length - 1) {
          this._stopPlaybackTimer();
          this._playing = false;
          this._paused = false;
          if (this.onPlayEnd) {
            try { this.onPlayEnd(); } catch(e) {}
          }
          return;
        }
        this.stepForward();
      }, interval);
    }

    _stopPlaybackTimer() {
      if (this._playbackTimer) {
        clearInterval(this._playbackTimer);
        this._playbackTimer = null;
      }
    }

    /**
     * Apply a step forward (redo).
     */
    _applyStepForward(step) {
      const board = this.board;
      const md = step.metadata;

      switch (step.type) {
        case STEP_TYPES.FILL_NUMBER:
        case STEP_TYPES.SET_NUMBER_AT: {
          const cell = board.cells[step.cells[0].r][step.cells[0].c];
          cell.fillNum = md.newFill;
          cell.candidates.clear();
          cell.eliminations.clear();

          if (md.relatedCandidates) {
            for (const { r, c, num } of md.relatedCandidates) {
              if (board.cells[r][c].fillNum === null) {
                board.cells[r][c].candidates.delete(num);
              }
            }
          }
          if (md.relatedEliminations) {
            for (const { r, c, num } of md.relatedEliminations) {
              if (board.cells[r][c].fillNum === null) {
                board.cells[r][c].eliminations.add(num);
              }
            }
          }
          break;
        }
        case STEP_TYPES.ERASE_NUMBER: {
          const cell = board.cells[step.cells[0].r][step.cells[0].c];
          cell.fillNum = null;
          cell.candidates.clear();
          cell.eliminations.clear();
          break;
        }
        case STEP_TYPES.TOGGLE_CANDIDATE: {
          if (md.num === null || md.num === undefined) break;
          const cell = board.cells[step.cells[0].r][step.cells[0].c];
          if (md.added) {
            cell.candidates.add(md.num);
          } else {
            cell.candidates.delete(md.num);
          }
          break;
        }
        case STEP_TYPES.BATCH_TOGGLE_CANDIDATE: {
          const num = md.num;
          const added = md.added;
          for (const { r, c } of step.cells) {
            const cell = board.cells[r][c];
            if (cell.fixedNum || cell.fillNum) continue;
            if (added) {
              cell.candidates.add(num);
            } else {
              cell.candidates.delete(num);
            }
          }
          break;
        }
        case STEP_TYPES.TOGGLE_ELIMINATION: {
          if (md.num === null || md.num === undefined) break;
          const cell = board.cells[step.cells[0].r][step.cells[0].c];
          if (md.added) {
            cell.eliminations.add(md.num);
            cell.candidates.delete(md.num);
          } else {
            cell.eliminations.delete(md.num);
          }
          break;
        }
        case STEP_TYPES.BATCH_TOGGLE_ELIMINATION: {
          const num = md.num;
          const added = md.added;
          for (const { r, c } of step.cells) {
            const cell = board.cells[r][c];
            if (cell.fixedNum || cell.fillNum) continue;
            if (added) {
              cell.eliminations.add(num);
              cell.candidates.delete(num);
            } else {
              cell.eliminations.delete(num);
            }
          }
          break;
        }
        case STEP_TYPES.BATCH_ERASE: {
          for (const { r, c } of step.cells) {
            const cell = board.cells[r][c];
            if (cell.fixedNum) continue;
            cell.fillNum = null;
            cell.candidates.clear();
            cell.eliminations.clear();
          }
          break;
        }
        case STEP_TYPES.CLEAR_ALL_CANDIDATES: {
          for (const { r, c } of step.cells) {
            const cell = board.cells[r][c];
            if (cell.fillNum === null && cell.fixedNum === null) {
              cell.candidates.clear();
            }
          }
          break;
        }
        case STEP_TYPES.AUTO_FILL_CANDIDATES: {
          if (md.cells) {
            for (const cellInfo of md.cells) {
              const cell = board.cells[cellInfo.r][cellInfo.c];
              if (cell.fillNum === null && cell.fixedNum === null && cellInfo.newCandidates) {
                cell.candidates = new Set(cellInfo.newCandidates);
              }
            }
          }
          break;
        }
      }
    }

    /**
     * Apply a step backward (undo).
     */
    _applyStepBackward(step) {
      const entry = step.rawEntry;
      const board = this.board;

      switch (step.type) {
        case STEP_TYPES.FILL_NUMBER:
        case STEP_TYPES.SET_NUMBER_AT:
        case STEP_TYPES.ERASE_NUMBER: {
          const cell = board.cells[entry.r][entry.c];
          cell.fillNum = entry.oldFill;
          cell.candidates = entry.oldCandidates instanceof Set
            ? new Set(entry.oldCandidates)
            : new Set(entry.oldCandidates || []);
          if (entry.oldEliminations) {
            cell.eliminations = entry.oldEliminations instanceof Set
              ? new Set(entry.oldEliminations)
              : new Set(entry.oldEliminations || []);
          } else {
            cell.eliminations.clear();
          }

          if (entry.relatedCandidates) {
            for (const { r, c, num } of entry.relatedCandidates) {
              if (board.cells[r][c].fillNum === null) {
                board.cells[r][c].candidates.add(num);
              }
            }
          }
          if (entry.relatedEliminations) {
            for (const { r, c, num } of entry.relatedEliminations) {
              if (board.cells[r][c].fillNum === null) {
                board.cells[r][c].eliminations.delete(num);
              }
            }
          }
          break;
        }
        case STEP_TYPES.TOGGLE_CANDIDATE: {
          const cell = board.cells[entry.r][entry.c];
          cell.candidates = entry.oldCandidates instanceof Set
            ? new Set(entry.oldCandidates)
            : new Set(entry.oldCandidates || []);
          break;
        }
        case STEP_TYPES.BATCH_TOGGLE_CANDIDATE: {
          for (const cInfo of entry.cells) {
            const cell = board.cells[cInfo.r][cInfo.c];
            if (cell.fillNum === null && cell.fixedNum === null) {
              cell.candidates = cInfo.oldCandidates instanceof Set
                ? new Set(cInfo.oldCandidates)
                : new Set(cInfo.oldCandidates || []);
            }
          }
          break;
        }
        case STEP_TYPES.TOGGLE_ELIMINATION: {
          const cell = board.cells[entry.r][entry.c];
          cell.eliminations = entry.oldEliminations instanceof Set
            ? new Set(entry.oldEliminations)
            : new Set(entry.oldEliminations || []);
          cell.candidates = entry.oldCandidates instanceof Set
            ? new Set(entry.oldCandidates)
            : new Set(entry.oldCandidates || []);
          break;
        }
        case STEP_TYPES.BATCH_TOGGLE_ELIMINATION: {
          for (const cInfo of entry.cells) {
            const cell = board.cells[cInfo.r][cInfo.c];
            if (cell.fillNum === null && cell.fixedNum === null) {
              cell.eliminations = cInfo.oldEliminations instanceof Set
                ? new Set(cInfo.oldEliminations)
                : new Set(cInfo.oldEliminations || []);
              cell.candidates = cInfo.oldCandidates instanceof Set
                ? new Set(cInfo.oldCandidates)
                : new Set(cInfo.oldCandidates || []);
            }
          }
          break;
        }
        case STEP_TYPES.BATCH_ERASE: {
          for (const cInfo of entry.cells) {
            const cell = board.cells[cInfo.r][cInfo.c];
            if (cell.fixedNum) continue;
            cell.fillNum = cInfo.oldFill;
            cell.candidates = cInfo.oldCandidates instanceof Set
              ? new Set(cInfo.oldCandidates)
              : new Set(cInfo.oldCandidates || []);
            if (cInfo.oldEliminations) {
              cell.eliminations = cInfo.oldEliminations instanceof Set
                ? new Set(cInfo.oldEliminations)
                : new Set(cInfo.oldEliminations || []);
            }
          }
          break;
        }
        case STEP_TYPES.CLEAR_ALL_CANDIDATES: {
          for (const cInfo of entry.oldCandidates) {
            const cell = board.cells[cInfo.r][cInfo.c];
            if (cell.fillNum === null && cell.fixedNum === null) {
              cell.candidates = cInfo.candidates instanceof Set
                ? new Set(cInfo.candidates)
                : new Set(cInfo.candidates || []);
            }
          }
          break;
        }
        case STEP_TYPES.AUTO_FILL_CANDIDATES: {
          for (const cInfo of entry.cells) {
            const cell = board.cells[cInfo.r][cInfo.c];
            if (cell.fillNum === null && cell.fixedNum === null) {
              cell.candidates = cInfo.oldCandidates instanceof Set
                ? new Set(cInfo.oldCandidates)
                : new Set(cInfo.oldCandidates || []);
            }
          }
          break;
        }
      }
    }

    _fireStepChange() {
      if (this.onStepChange) {
        try {
          const step = this._currentStepIndex >= 0
            ? this._steps[this._currentStepIndex]
            : null;
          this.onStepChange(this._currentStepIndex, step);
        } catch(e) {}
      }
    }

    // ========================================================
    //  Board snapshot helpers (full board state)
    // ========================================================

    _snapshotBoardState() {
      const board = this.board;
      const snapshot = {
        size: board.size,
        cells: [],
      };

      for (let r = 0; r < board.size; r++) {
        const row = [];
        for (let c = 0; c < board.size; c++) {
          const cell = board.cells[r][c];
          row.push({
            fillNum: cell.fillNum,
            candidates: new Set(cell.candidates),
            eliminations: new Set(cell.eliminations),
            fixedNum: cell.fixedNum,
          });
        }
        snapshot.cells.push(row);
      }

      return snapshot;
    }

    _restoreBoardState(snapshot) {
      const board = this.board;
      for (let r = 0; r < snapshot.size; r++) {
        for (let c = 0; c < snapshot.size; c++) {
          const cell = board.cells[r][c];
          const snap = snapshot.cells[r][c];
          cell.fillNum = snap.fillNum;
          cell.candidates = new Set(snap.candidates);
          cell.eliminations = new Set(snap.eliminations);
        }
      }
    }

    _resetToBaseline() {
      if (this._baselineSnapshot) {
        this._restoreBoardState(this._baselineSnapshot);
      }
    }

    // ========================================================
    //  Export / Import
    // ========================================================

    exportReplay() {
      this._syncFromBoardHistory();

      const steps = this._steps.map(step => ({
        index: step.index,
        type: step.type,
        cells: step.cells.map(c => ({ r: c.r, c: c.c })),
        timestamp: step.timestamp,
        metadata: this._serializeMetadata(step.metadata),
        isKeyStep: step.isKeyStep,
        keyStepType: step.keyStepType,
        rawEntry: this._serializeEntry(step.rawEntry),
      }));

      const baseline = this._serializeSnapshot(
        this._baselineSnapshot || this._snapshotBoardState()
      );

      return {
        version: 1,
        exportedAt: Date.now(),
        boardSize: this.board.size,
        totalSteps: steps.length,
        keyStepCount: this._keySteps.length,
        keyStepIndices: this._keySteps.slice(),
        baseline: baseline,
        steps: steps,
      };
    }

    importReplay(data) {
      if (!data || !data.steps || !data.baseline) {
        throw new Error('Invalid replay data');
      }

      this.stop();
      this._recording = false;

      this._baselineSnapshot = this._deserializeSnapshot(data.baseline);

      this._steps = data.steps.map(step => ({
        index: step.index,
        type: step.type,
        cells: step.cells.map(c => ({ r: c.r, c: c.c })),
        timestamp: step.timestamp,
        metadata: this._deserializeMetadata(step.metadata),
        isKeyStep: step.isKeyStep,
        keyStepType: step.keyStepType,
        rawEntry: this._deserializeEntry(step.rawEntry),
      }));

      this._keySteps = data.keyStepIndices || [];
      this._currentStepIndex = -1;
      this._recordStartHistoryLen = 0;

      return this._steps.length;
    }

    _serializeEntry(entry) {
      const result = { ...entry };
      this._convertSetsToArraysInPlace(result);
      return result;
    }

    _deserializeEntry(entry) {
      const result = { ...entry };
      this._convertArraysToSetsInPlace(result);
      return result;
    }

    _serializeMetadata(metadata) {
      const result = { ...metadata };
      // relatedCandidates and relatedEliminations are arrays of objects, fine as-is
      if (result.cells) {
        result.cells = result.cells.map(c => {
          const cc = { ...c };
          if (cc.oldCandidates instanceof Set) {
            cc.oldCandidates = Array.from(cc.oldCandidates);
            cc.__oldCandidates_isSet = true;
          }
          if (cc.oldEliminations instanceof Set) {
            cc.oldEliminations = Array.from(cc.oldEliminations);
            cc.__oldEliminations_isSet = true;
          }
          if (cc.newCandidates instanceof Set) {
            cc.newCandidates = Array.from(cc.newCandidates);
            cc.__newCandidates_isSet = true;
          }
          if (cc.candidates instanceof Set) {
            cc.candidates = Array.from(cc.candidates);
            cc.__candidates_isSet = true;
          }
          return cc;
        });
      }
      if (result.clearedCells) {
        result.clearedCells = result.clearedCells.map(c => {
          const cc = { ...c };
          if (cc.candidates instanceof Set) {
            cc.candidates = Array.from(cc.candidates);
            cc.__candidates_isSet = true;
          }
          return cc;
        });
      }
      if (result.oldCandidates instanceof Set) {
        result.oldCandidates = Array.from(result.oldCandidates);
        result.__oldCandidates_isSet = true;
      }
      if (result.newCandidates instanceof Set) {
        result.newCandidates = Array.from(result.newCandidates);
        result.__newCandidates_isSet = true;
      }
      return result;
    }

    _deserializeMetadata(metadata) {
      const result = { ...metadata };
      if (result.cells) {
        result.cells = result.cells.map(c => {
          const cc = { ...c };
          if (cc.__oldCandidates_isSet) {
            cc.oldCandidates = new Set(cc.oldCandidates || []);
            delete cc.__oldCandidates_isSet;
          }
          if (cc.__oldEliminations_isSet) {
            cc.oldEliminations = new Set(cc.oldEliminations || []);
            delete cc.__oldEliminations_isSet;
          }
          if (cc.__newCandidates_isSet) {
            cc.newCandidates = new Set(cc.newCandidates || []);
            delete cc.__newCandidates_isSet;
          }
          if (cc.__candidates_isSet) {
            cc.candidates = new Set(cc.candidates || []);
            delete cc.__candidates_isSet;
          }
          return cc;
        });
      }
      if (result.clearedCells) {
        result.clearedCells = result.clearedCells.map(c => {
          const cc = { ...c };
          if (cc.__candidates_isSet) {
            cc.candidates = new Set(cc.candidates || []);
            delete cc.__candidates_isSet;
          }
          return cc;
        });
      }
      if (result.__oldCandidates_isSet) {
        result.oldCandidates = new Set(result.oldCandidates || []);
        delete result.__oldCandidates_isSet;
      }
      if (result.__newCandidates_isSet) {
        result.newCandidates = new Set(result.newCandidates || []);
        delete result.__newCandidates_isSet;
      }
      return result;
    }

    _convertSetsToArraysInPlace(obj) {
      const setFields = ['oldCandidates', 'oldEliminations', 'candidates', 'eliminations'];
      for (const field of setFields) {
        if (obj[field] instanceof Set) {
          obj[field] = Array.from(obj[field]);
          obj['__' + field + '_isSet'] = true;
        }
      }
      if (obj.cells && Array.isArray(obj.cells)) {
        obj.cells = obj.cells.map(cell => {
          const cc = { ...cell };
          for (const field of setFields) {
            if (cc[field] instanceof Set) {
              cc[field] = Array.from(cc[field]);
              cc['__' + field + '_isSet'] = true;
            }
          }
          return cc;
        });
      }
      if (obj.oldCandidates && Array.isArray(obj.oldCandidates) &&
          obj.oldCandidates.length > 0 && obj.oldCandidates[0].r !== undefined) {
        // oldCandidates is array of cell objects (clearAllCandidates)
        obj.oldCandidates = obj.oldCandidates.map(c => {
          const cc = { ...c };
          if (cc.candidates instanceof Set) {
            cc.candidates = Array.from(cc.candidates);
            cc.__candidates_isSet = true;
          }
          return cc;
        });
      }
      return obj;
    }

    _convertArraysToSetsInPlace(obj) {
      const setFields = ['oldCandidates', 'oldEliminations', 'candidates', 'eliminations'];
      for (const field of setFields) {
        if (obj['__' + field + '_isSet']) {
          obj[field] = new Set(obj[field] || []);
          delete obj['__' + field + '_isSet'];
        }
      }
      if (obj.cells && Array.isArray(obj.cells)) {
        obj.cells = obj.cells.map(cell => {
          const cc = { ...cell };
          for (const field of setFields) {
            if (cc['__' + field + '_isSet']) {
              cc[field] = new Set(cc[field] || []);
              delete cc['__' + field + '_isSet'];
            }
          }
          return cc;
        });
      }
      if (obj.oldCandidates && Array.isArray(obj.oldCandidates) &&
          obj.oldCandidates.length > 0 && obj.oldCandidates[0].__candidates_isSet) {
        obj.oldCandidates = obj.oldCandidates.map(c => {
          const cc = { ...c };
          if (cc.__candidates_isSet) {
            cc.candidates = new Set(cc.candidates || []);
            delete cc.__candidates_isSet;
          }
          return cc;
        });
      }
      return obj;
    }

    _serializeSnapshot(snapshot) {
      const result = {
        size: snapshot.size,
        cells: [],
      };
      for (let r = 0; r < snapshot.size; r++) {
        const row = [];
        for (let c = 0; c < snapshot.size; c++) {
          const s = snapshot.cells[r][c];
          row.push({
            fillNum: s.fillNum,
            fixedNum: s.fixedNum,
            candidates: Array.from(s.candidates),
            eliminations: Array.from(s.eliminations),
          });
        }
        result.cells.push(row);
      }
      return result;
    }

    _deserializeSnapshot(data) {
      const snapshot = {
        size: data.size,
        cells: [],
      };
      for (let r = 0; r < data.size; r++) {
        const row = [];
        for (let c = 0; c < data.size; c++) {
          const s = data.cells[r][c];
          row.push({
            fillNum: s.fillNum,
            fixedNum: s.fixedNum,
            candidates: new Set(s.candidates || []),
            eliminations: new Set(s.eliminations || []),
          });
        }
        snapshot.cells.push(row);
      }
      return snapshot;
    }

    // ========================================================
    //  Query methods
    // ========================================================

    getStepCount() {
      if (this._recording) {
        this._syncFromBoardHistory();
      }
      return this._steps.length;
    }

    getCurrentStepIndex() {
      return this._currentStepIndex;
    }

    getCurrentStep() {
      if (this._currentStepIndex < 0) return null;
      return this._steps[this._currentStepIndex];
    }

    getStep(index) {
      return this._steps[index] || null;
    }

    getKeySteps() {
      return this._keySteps.slice();
    }

    isPlaying() {
      return this._playing && !this._paused;
    }

    isPaused() {
      return this._paused;
    }

    isRecording() {
      return this._recording;
    }

    getSteps() {
      return this._steps.slice();
    }
  }

  ReplaySystem.STEP_TYPES = STEP_TYPES;
  ReplaySystem.KEY_STEP_TYPES = KEY_STEP_TYPES;

  global.ReplaySystem = ReplaySystem;
})(typeof window !== 'undefined' ? window : globalThis);
