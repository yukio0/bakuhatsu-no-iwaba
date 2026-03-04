/* iwaba-logic.js
 * State + solver orchestration. No direct event binding.
 */
(() => {
  window.IWABA = window.IWABA || {};

  function neighbors(ctx, r, c) {
    return ctx.utils.neighbors(r, c, ctx.state.rows, ctx.state.cols);
  }
  function orthoNeighbors(ctx, r, c) {
    return ctx.utils.orthoNeighbors(r, c, ctx.state.rows, ctx.state.cols);
  }
  function cellCoord(ctx, r, c) {
    return ctx.utils.cellCoord(r, c, ctx.state.rows);
  }

  function toolEquals(a, b) {
    if (!a || !b) return false;
    if (a.kind !== b.kind) return false;
    return a.kind !== "num" || a.num === b.num;
  }
  function toolSignature(t) {
    return t.kind === "num" ? `num:${t.num}` : t.kind;
  }

  function syncToolCursorFromCurrent(ctx) {
    const { TOOL_DEFS } = ctx.consts;
    for (let i = 0; i < TOOL_DEFS.length; i++) {
      if (toolEquals(TOOL_DEFS[i].tool, ctx.state.currentTool)) {
        ctx.state.toolCursorIndex = i;
        return;
      }
    }
  }

  function setCurrentTool(ctx, t) {
    ctx.state.currentTool = t;
    syncToolCursorFromCurrent(ctx);
    IWABA.view.updateCurrentToolPill(ctx);
    IWABA.view.renderTools(ctx);
  }

  function toolToIndex(ctx, t) {
    const { TOOL_CYCLE_LEN } = ctx.consts;
    if (t.kind === "wall") return 0;
    if (t.kind === "flag") return 1;
    return 2 + t.num;
  }
  function indexToTool(ctx, i) {
    const { Tool, TOOL_CYCLE_LEN } = ctx.consts;
    const idx = ((i % TOOL_CYCLE_LEN) + TOOL_CYCLE_LEN) % TOOL_CYCLE_LEN;
    if (idx === 0) return Tool.wall();
    if (idx === 1) return Tool.flag();
    return Tool.num(idx - 2);
  }
  function bumpTool(ctx, delta) {
    const i = toolToIndex(ctx, ctx.state.currentTool);
    setCurrentTool(ctx, indexToTool(ctx, i + delta));
  }

  function moveToolCursorByArrow(ctx, key) {
    const { TOOL_DEFS, TOOL_GRID_COLS } = ctx.consts;

    const n = TOOL_DEFS.length;
    const cols = TOOL_GRID_COLS;
    const rows = Math.ceil(n / cols);

    let row = Math.floor(ctx.state.toolCursorIndex / cols);
    let col = ctx.state.toolCursorIndex % cols;

    function rowLen(r) {
      const remain = n - r * cols;
      return remain <= 0 ? 0 : Math.min(cols, remain);
    }

    if (key === "ArrowLeft") {
      const len = rowLen(row);
      col = col === 0 ? len - 1 : col - 1;
    } else if (key === "ArrowRight") {
      const len = rowLen(row);
      col = col === len - 1 ? 0 : col + 1;
    } else if (key === "ArrowUp") {
      row = (row - 1 + rows) % rows;
      const len = rowLen(row);
      if (col >= len) col = len - 1;
    } else if (key === "ArrowDown") {
      row = (row + 1) % rows;
      const len = rowLen(row);
      if (col >= len) col = len - 1;
    } else {
      return;
    }

    const len = rowLen(row);
    if (len <= 0) return;
    if (col >= len) col = len - 1;

    const nidx = row * cols + col;

    ctx.state.toolCursorIndex = nidx;
    setCurrentTool(ctx, TOOL_DEFS[nidx].tool);
  }

  function cloneGrid(grid) {
    return grid.map((row) => row.map((st) => ({ state: st.state, num: st.num })));
  }

  function historySnapshot(ctx) {
    return {
      rows: ctx.state.rows,
      cols: ctx.state.cols,
      grid: cloneGrid(ctx.state.grid),
    };
  }

  function isSameSnapshot(a, b) {
    if (!a || !b) return false;
    if (a.rows !== b.rows || a.cols !== b.cols) return false;

    for (let r = 0; r < a.rows; r++) {
      for (let c = 0; c < a.cols; c++) {
        const ac = a.grid[r][c];
        const bc = b.grid[r][c];
        if (!ac || !bc) return false;
        if (ac.state !== bc.state || ac.num !== bc.num) return false;
      }
    }

    return true;
  }

  function updateHistoryButtons(ctx) {
    const { btnUndo, btnRedo } = ctx.els;
    const h = ctx.state.history;
    if (btnUndo) btnUndo.disabled = h.past.length === 0;
    if (btnRedo) btnRedo.disabled = h.future.length === 0;
  }

  function commitHistorySnapshot(ctx, snap) {
    const h = ctx.state.history;
    h.past.push(snap);
    if (h.past.length > h.max) h.past.shift();
    h.future = [];
    updateHistoryButtons(ctx);
  }

  function replaceWithSnapshot(ctx, snap) {
    if (!snap) return;
    ctx.state.rows = snap.rows;
    ctx.state.cols = snap.cols;
    ctx.state.grid = cloneGrid(snap.grid);

    ctx.state.hasContradictionNow = false;
    ctx.state.lastSuggestMines = new Set();
    ctx.state.lastSuggestSafes = new Set();
    ctx.state.lastSuggestRecos = new Set();

    IWABA.view.clearContradictionsUI(ctx);
    IWABA.view.hideToast(ctx);
    IWABA.view.hideProbTip(ctx);

    IWABA.view.renderStageInfo(ctx);
    IWABA.view.renderBoard(ctx);
    IWABA.input.bindCells(ctx);
    IWABA.view.updateModeUI(ctx);
  }

  function clearHistory(ctx) {
    const h = ctx.state.history;
    h.past = [];
    h.future = [];
    updateHistoryButtons(ctx);
  }

  function undo(ctx) {
    const h = ctx.state.history;
    if (h.past.length === 0) return false;
    const prev = h.past.pop();
    h.future.push(historySnapshot(ctx));
    replaceWithSnapshot(ctx, prev);
    updateHistoryButtons(ctx);
    return true;
  }

  function redo(ctx) {
    const h = ctx.state.history;
    if (h.future.length === 0) return false;
    const next = h.future.pop();
    h.past.push(historySnapshot(ctx));
    if (h.past.length > h.max) h.past.shift();
    replaceWithSnapshot(ctx, next);
    updateHistoryButtons(ctx);
    return true;
  }

  function applyStartCellBlank(ctx) {
    const { CellState } = ctx.consts;
    const { rows, cols, grid } = ctx.state;
    if (rows < 2 || cols < 2) return;
    const r = rows - 2;
    const c = 1;
    if (r < 0 || r >= rows || c < 0 || c >= cols) return;
    grid[r][c].state = CellState.REVEALED;
    grid[r][c].num = 0;
  }

  function initGrid(ctx) {
    const { CellState } = ctx.consts;
    const { rows, cols } = ctx.state;

    ctx.state.grid = Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => ({ state: CellState.WALL, num: 0 }))
    );

    applyStartCellBlank(ctx);

    ctx.state.hasContradictionNow = false;
    IWABA.view.clearContradictionsUI(ctx);
    IWABA.view.hideToast(ctx);
    IWABA.view.hideProbTip(ctx);

    ctx.state.lastSuggestMines = new Set();
    ctx.state.lastSuggestSafes = new Set();
    ctx.state.lastSuggestRecos = new Set();
    updateHistoryButtons(ctx);
  }

  function markDirty(ctx, { preserveUI = false } = {}) {
    IWABA.view.hideProbTip(ctx);
    if (preserveUI) return;

    ctx.state.hasContradictionNow = false;
    IWABA.view.clearContradictionsUI(ctx);
    IWABA.view.hideToast(ctx);
    ctx.state.lastSuggestMines = new Set();
    ctx.state.lastSuggestSafes = new Set();
    ctx.state.lastSuggestRecos = new Set();
  }

  function setFlag(ctx, st) {
    const { CellState } = ctx.consts;
    st.state = CellState.FLAG;
    st.num = 0;
  }
  function clearFlag(ctx, st) {
    const { CellState } = ctx.consts;
    st.state = CellState.WALL;
    st.num = 0;
  }

  function isSameCellState(st, state, num) {
    return st.state === state && st.num === num;
  }

  function applyTool(ctx, r, c, tool, { preserveUI = false } = {}) {
    const { CellState } = ctx.consts;

    const st = ctx.state.grid[r][c];
    if (tool.kind === "wall") {
      if (isSameCellState(st, CellState.WALL, 0)) return false;
      markDirty(ctx, { preserveUI });
      st.state = CellState.WALL;
      st.num = 0;
      return true;
    }
    if (tool.kind === "flag") {
      if (isSameCellState(st, CellState.FLAG, 0)) return false;
      markDirty(ctx, { preserveUI });
      setFlag(ctx, st);
      return true;
    }
    if (isSameCellState(st, CellState.REVEALED, tool.num)) return false;
    markDirty(ctx, { preserveUI });
    st.state = CellState.REVEALED;
    st.num = tool.num;
    return true;
  }

  function cycleCell(ctx, r, c, { preserveUI = false } = {}) {
    const { CellState } = ctx.consts;
    markDirty(ctx, { preserveUI });

    const st = ctx.state.grid[r][c];
    if (st.state === CellState.WALL) {
      setFlag(ctx, st);
      return true;
    }
    if (st.state === CellState.FLAG) {
      st.state = CellState.REVEALED;
      st.num = 0;
      return true;
    }
    if (st.num < 8) st.num++;
    else {
      st.state = CellState.WALL;
      st.num = 0;
    }
    return true;
  }

  function cycleCellBackward(ctx, r, c, { preserveUI = false } = {}) {
    const { CellState } = ctx.consts;
    markDirty(ctx, { preserveUI });

    const st = ctx.state.grid[r][c];
    if (st.state === CellState.WALL) {
      st.state = CellState.REVEALED;
      st.num = 8;
      return true;
    }
    if (st.state === CellState.FLAG) {
      st.state = CellState.WALL;
      st.num = 0;
      return true;
    }
    if (st.num > 0) {
      st.num--;
      return true;
    }
    setFlag(ctx, st);
    return true;
  }

  function rightPaintStamp(ctx, r, c, stamp, { preserveUI = false } = {}) {
    const { CellState } = ctx.consts;

    const st = ctx.state.grid[r][c];

    if (stamp === "wall") {
      if (isSameCellState(st, CellState.WALL, 0)) return false;
      markDirty(ctx, { preserveUI });
      st.state = CellState.WALL;
      st.num = 0;
      return true;
    }
    if (stamp === "blank") {
      if (isSameCellState(st, CellState.REVEALED, 0)) return false;
      markDirty(ctx, { preserveUI });
      st.state = CellState.REVEALED;
      st.num = 0;
      return true;
    }
    if (isSameCellState(st, CellState.FLAG, 0)) return false;
    markDirty(ctx, { preserveUI });
    setFlag(ctx, st);
    return true;
  }


  function validateContradictions(ctx, extraMines = null, extraSafes = null) {
    return ctx.solver.validateContradictions(ctx.state.grid, ctx.state.rows, ctx.state.cols, extraMines, extraSafes);
  }

  function renderContradictionsUI(ctx, extraMines = null, extraSafes = null) {
    IWABA.view.clearContradictionsUI(ctx);

    const cons = validateContradictions(ctx, extraMines, extraSafes);
    if (cons.length === 0) {
      IWABA.view.hideToast(ctx);
      return false;
    }

    for (const it of cons) {
      const el = IWABA.view.getCellEl(ctx, it.r, it.c);
      if (el) el.classList.add("contradiction");
    }

    const top = cons.slice(0, 4);

    IWABA.view.showToast(ctx, (root) => {
      const closeBtn = IWABA.view.makeEl("button", "toastClose");
      closeBtn.type = "button";
      closeBtn.setAttribute("aria-label", "close");
      closeBtn.textContent = "×";

      const title = IWABA.view.makeEl("b", null, "矛盾が見つかりました");

      const ul = IWABA.view.makeEl("ul", "toastList");
      for (const it of top) {
        const p = cellCoord(ctx, it.r, it.c);
        let msg = "";
        if (it.kind === "tooManyFlags") {
          msg = `${p} の「${it.n}」：地雷が ${it.flagged} 個（多すぎ）`;
        } else {
          msg = `${p} の「${it.n}」：地雷${it.flagged}+候補${it.walls} < ${it.n}（足りない）`;
        }
        ul.appendChild(IWABA.view.makeEl("li", null, msg));
      }

      IWABA.view.append(root, closeBtn, title, ul);

      if (cons.length > top.length) {
        root.appendChild(IWABA.view.makeEl("div", "muted mt6", `他 ${cons.length - top.length} 件…`));
      }
      root.appendChild(IWABA.view.makeEl("div", "muted mt6", "赤枠の数字マス周辺を見直してください。"));
    });

    return true;
  }

  function wallTouchesRevealed(ctx, r, c) {
    const { CellState } = ctx.consts;
    for (const [rr, cc] of neighbors(ctx, r, c)) {
      if (ctx.state.grid[rr][cc].state === CellState.REVEALED) return true;
    }
    return false;
  }

  function computeMineProbabilityForWall(ctx, targetR, targetC, knownMines, knownSafes) {
    return ctx.solver.computeMineProbabilityForWall(
      ctx.state.grid, ctx.state.rows, ctx.state.cols,
      targetR, targetC, knownMines, knownSafes
    );
  }

  function isProbTipEligibleForCell(ctx, cellEl) {
    if (ctx.state.hasContradictionNow) return false;

    const r = Number(cellEl.dataset.r);
    const c = Number(cellEl.dataset.c);
    if (!(0 <= r && r < ctx.state.rows && 0 <= c && c < ctx.state.cols)) return false;

    const { CellState } = ctx.consts;
    if (ctx.state.grid[r][c].state !== CellState.WALL) return false;
    if (cellEl.classList.contains("suggest-safe") || cellEl.classList.contains("suggest-mine")) return false;
    if (!wallTouchesRevealed(ctx, r, c)) return false;

    return true;
  }

  function maybeShowProbTip(ctx, cellEl) {
    if (!isProbTipEligibleForCell(ctx, cellEl)) return IWABA.view.hideProbTip(ctx);

    const r = Number(cellEl.dataset.r);
    const c = Number(cellEl.dataset.c);

    const result = computeMineProbabilityForWall(ctx, r, c, ctx.state.lastSuggestMines, ctx.state.lastSuggestSafes);
    if (!result || result.kind === "contradiction") return IWABA.view.hideProbTip(ctx);

    const pct = (x) => `${Math.round(x * 100)}%`;

    if (result.kind === "exact") {
      IWABA.view.showProbTipForCell(ctx, cellEl, `地雷確率：${pct(result.p)}`, ``);
    } else {
      const range =
        Math.round(result.min * 100) === Math.round(result.max * 100)
          ? pct(result.p)
          : `${pct(result.min)}〜${pct(result.max)}`;
      IWABA.view.showProbTipForCell(ctx, cellEl, `地雷確率：${range}`, ``);
    }
  }

  function clearHints(ctx) {
    IWABA.view.hideProbTip(ctx);

    ctx.state.lastSuggestMines = new Set();
    ctx.state.lastSuggestSafes = new Set();
    ctx.state.lastSuggestRecos = new Set();

    IWABA.view.clearSuggestVisualsOnly(ctx);
  }

  function solveDeterministic(ctx) {
    IWABA.view.clearContradictionsUI(ctx);
    IWABA.view.hideToast(ctx);
    IWABA.view.hideProbTip(ctx);

    ctx.state.hasContradictionNow = renderContradictionsUI(ctx);
    if (ctx.state.hasContradictionNow) return;

    const { CellState } = ctx.consts;
    const forcedMines = new Set();
    const forcedSafes = new Set();

    const PROB_TOTAL_BUDGET_MS = 80;

    let outerChanged = true;
    while (outerChanged) {
      outerChanged = false;

      let changed = true;
      while (changed) {
        changed = false;

        for (let r = 0; r < ctx.state.rows; r++) {
          for (let c = 0; c < ctx.state.cols; c++) {
            const st = ctx.state.grid[r][c];
            if (st.state !== CellState.REVEALED) continue;

            const n = st.num;
            const ns = neighbors(ctx, r, c);

            let mines = 0;
            const unknownWalls = [];

            for (const [rr, cc] of ns) {
              const s2 = ctx.state.grid[rr][cc];
              const key = `${rr},${cc}`;

              const isMine = s2.state === CellState.FLAG || forcedMines.has(key);
              const isSafe = forcedSafes.has(key);

              if (isMine) mines++;
              else if (s2.state === CellState.WALL && !isSafe) unknownWalls.push([rr, cc]);
            }

            const need = n - mines;

            if (need < 0 || need > unknownWalls.length) {
              ctx.state.hasContradictionNow = renderContradictionsUI(ctx, forcedMines, forcedSafes);

              ctx.state.lastSuggestMines = new Set(forcedMines);
              ctx.state.lastSuggestSafes = new Set(forcedSafes);
              ctx.state.lastSuggestRecos = new Set();
              IWABA.view.applySuggestUI(ctx, ctx.state.lastSuggestMines, ctx.state.lastSuggestSafes, ctx.state.lastSuggestRecos);
              return;
            }

            if (need === 0 && unknownWalls.length > 0) {
              for (const [rr, cc] of unknownWalls) {
                const key = `${rr},${cc}`;
                if (!forcedSafes.has(key)) {
                  forcedSafes.add(key);
                  changed = true;
                  outerChanged = true;
                }
              }
            } else if (need === unknownWalls.length && need > 0) {
              for (const [rr, cc] of unknownWalls) {
                const key = `${rr},${cc}`;
                if (!forcedMines.has(key)) {
                  forcedMines.add(key);
                  changed = true;
                  outerChanged = true;
                }
              }
            }
          }
        }
      }

      const startBudget = performance.now();

      const cand = [];
      const candSet = new Set();
      for (let r = 0; r < ctx.state.rows; r++) {
        for (let c = 0; c < ctx.state.cols; c++) {
          if (ctx.state.grid[r][c].state !== CellState.REVEALED) continue;
          for (const [rr, cc] of neighbors(ctx, r, c)) {
            const s2 = ctx.state.grid[rr][cc];
            const key = `${rr},${cc}`;
            if (s2.state !== CellState.WALL) continue;
            if (forcedMines.has(key) || forcedSafes.has(key)) continue;
            if (!candSet.has(key)) {
              candSet.add(key);
              cand.push([rr, cc]);
            }
          }
        }
      }

      for (const [wr, wc] of cand) {
        if (performance.now() - startBudget > PROB_TOTAL_BUDGET_MS) break;

        const key = `${wr},${wc}`;
        if (forcedMines.has(key) || forcedSafes.has(key)) continue;

        const res = computeMineProbabilityForWall(ctx, wr, wc, forcedMines, forcedSafes);
        if (!res || res.kind === "contradiction") continue;

        if (res.kind === "exact") {
          if (res.mine === 0) {
            forcedSafes.add(key);
            outerChanged = true;
          } else if (res.mine === res.total) {
            forcedMines.add(key);
            outerChanged = true;
          }
        } else {
          if (res.max <= 0) {
            forcedSafes.add(key);
            outerChanged = true;
          } else if (res.min >= 1) {
            forcedMines.add(key);
            outerChanged = true;
          }
        }
      }
    }

    ctx.state.hasContradictionNow = renderContradictionsUI(ctx, forcedMines, forcedSafes);

    const recos = ctx.state.hasContradictionNow
      ? new Set()
      : ctx.solver.computeRecommendations(ctx.state.grid, ctx.state.rows, ctx.state.cols, forcedMines, forcedSafes);

    ctx.state.lastSuggestMines = new Set(forcedMines);
    ctx.state.lastSuggestSafes = new Set(forcedSafes);
    ctx.state.lastSuggestRecos = new Set(recos);

    IWABA.view.applySuggestUI(ctx, ctx.state.lastSuggestMines, ctx.state.lastSuggestSafes, ctx.state.lastSuggestRecos);
    if (ctx.state.hasContradictionNow) return;
  }

  IWABA.logic = {
    neighbors,
    orthoNeighbors,
    cellCoord,
    toolEquals,
    toolSignature,
    setCurrentTool,
    bumpTool,
    moveToolCursorByArrow,
    historySnapshot,
    isSameSnapshot,
    commitHistorySnapshot,
    clearHistory,
    undo,
    redo,
    updateHistoryButtons,
    initGrid,
    markDirty,
    applyTool,
    cycleCell,
    cycleCellBackward,
    rightPaintStamp,
    validateContradictions,
    renderContradictionsUI,
    computeMineProbabilityForWall,
    isProbTipEligibleForCell,
    maybeShowProbTip,
    clearHints,
    solveDeterministic,
  };
})();
