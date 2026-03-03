/* iwaba-input.js
 * Event bindings. Calls IWABA.logic + IWABA.view.
 */
(() => {
  window.IWABA = window.IWABA || {};

  function autoSolveEnabled(ctx) {
    return !!(ctx.els.autoSolveEl && ctx.els.autoSolveEl.checked);
  }

  function maybeAutoSolveOnClick(ctx) {
    if (!autoSolveEnabled(ctx)) return;
    IWABA.logic.solveDeterministic(ctx);
  }

  function maybeAutoSolveOnDragEnd(ctx, changed) {
    if (!autoSolveEnabled(ctx)) return;
    if (!changed) return;
    IWABA.logic.solveDeterministic(ctx);
  }

  function maybeAutoSolveNow(ctx) {
    if (!autoSolveEnabled(ctx)) return;
    IWABA.logic.solveDeterministic(ctx);
  }

  function runUndo(ctx) {
    const changed = IWABA.logic.undo(ctx);
    if (!changed) return;
    maybeAutoSolveNow(ctx);
  }

  function runRedo(ctx) {
    const changed = IWABA.logic.redo(ctx);
    if (!changed) return;
    maybeAutoSolveNow(ctx);
  }

  function setDarkMode(ctx, on) {
    const { themeToggleEl } = ctx.els;
    if (on) document.documentElement.dataset.theme = "dark";
    else document.documentElement.removeAttribute("data-theme");

    themeToggleEl.setAttribute("aria-pressed", on ? "true" : "false");
    themeToggleEl.textContent = on ? "☀ ライトモードに変更" : "🌙 ダークモードに変更";
  }

  function isCycleMode(ctx) {
    return ctx.els.inputModeEl.value === "cycle";
  }

  function currentStage(ctx) {
    const { STAGES } = ctx.consts;
    return STAGES[ctx.els.difficultyEl.value] ?? STAGES.beginner;
  }

  function applyStageFromUI(ctx) {
    const st = currentStage(ctx);
    ctx.state.rows = st.size.rows;
    ctx.state.cols = st.size.cols;

    IWABA.view.renderStageInfo(ctx);
    IWABA.logic.initGrid(ctx);
    IWABA.view.renderTools(ctx);
    IWABA.view.renderBoard(ctx);
    bindCells(ctx);
    IWABA.view.updateModeUI(ctx);
    maybeAutoSolveNow(ctx);
  }

  function cellFromPoint(ctx, x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    const cell = el.closest?.(".cell");
    if (!cell) return null;
    if (!ctx.els.boardEl.contains(cell)) return null;
    return cell;
  }

  function bindCells(ctx) {
    const { boardEl } = ctx.els;

    for (const cell of boardEl.querySelectorAll(".cell")) {
      cell.addEventListener("mouseenter", () => IWABA.logic.maybeShowProbTip(ctx, cell));
      cell.addEventListener("mouseleave", () => IWABA.view.hideProbTip(ctx));

      cell.addEventListener("click", (e) => {
        if (ctx.els.inputModeEl.value !== "cycle") return;
        e.preventDefault();

        IWABA.view.hideProbTip(ctx);
        const r = Number(cell.dataset.r);
        const c = Number(cell.dataset.c);
        const snap = IWABA.logic.historySnapshot(ctx);
        const changed = IWABA.logic.cycleCell(ctx, r, c, { preserveUI: true });
        if (!changed) return;
        IWABA.logic.commitHistorySnapshot(ctx, snap);
        IWABA.view.setCellVisual(ctx, cell, ctx.state.grid[r][c]);
        maybeAutoSolveOnClick(ctx);
      });

      cell.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        if (ctx.els.inputModeEl.value !== "cycle") return;

        IWABA.view.hideProbTip(ctx);
        const r = Number(cell.dataset.r);
        const c = Number(cell.dataset.c);
        const snap = IWABA.logic.historySnapshot(ctx);
        const changed = IWABA.logic.cycleCellBackward(ctx, r, c, { preserveUI: true });
        if (!changed) return;
        IWABA.logic.commitHistorySnapshot(ctx, snap);
        IWABA.view.setCellVisual(ctx, cell, ctx.state.grid[r][c]);
        maybeAutoSolveOnClick(ctx);
      });

      cell.addEventListener("keydown", (e) => {
        const k = e.key.toLowerCase();
        const preserve = isCycleMode(ctx);
        const r = Number(cell.dataset.r);
        const c = Number(cell.dataset.c);

        if (k >= "0" && k <= "8") {
          e.preventDefault();
          e.stopPropagation();
          IWABA.view.hideProbTip(ctx);
          const snap = IWABA.logic.historySnapshot(ctx);
          const changed = IWABA.logic.applyTool(ctx, r, c, ctx.consts.Tool.num(Number(k)), { preserveUI: preserve });
          if (!changed) return;
          IWABA.logic.commitHistorySnapshot(ctx, snap);
          IWABA.view.setCellVisual(ctx, cell, ctx.state.grid[r][c]);
          maybeAutoSolveOnClick(ctx);
          return;
        }
        if (k === "f") {
          e.preventDefault();
          e.stopPropagation();
          IWABA.view.hideProbTip(ctx);
          const snap = IWABA.logic.historySnapshot(ctx);
          const changed = IWABA.logic.applyTool(ctx, r, c, ctx.consts.Tool.flag(), { preserveUI: preserve });
          if (!changed) return;
          IWABA.logic.commitHistorySnapshot(ctx, snap);
          IWABA.view.setCellVisual(ctx, cell, ctx.state.grid[r][c]);
          maybeAutoSolveOnClick(ctx);
          return;
        }
        if (k === "w" || k === "?") {
          e.preventDefault();
          e.stopPropagation();
          IWABA.view.hideProbTip(ctx);
          const snap = IWABA.logic.historySnapshot(ctx);
          const changed = IWABA.logic.applyTool(ctx, r, c, ctx.consts.Tool.wall(), { preserveUI: preserve });
          if (!changed) return;
          IWABA.logic.commitHistorySnapshot(ctx, snap);
          IWABA.view.setCellVisual(ctx, cell, ctx.state.grid[r][c]);
          maybeAutoSolveOnClick(ctx);
          return;
        }
      });
    }
  }

  function bind(ctx) {
    const {
      difficultyEl,
      inputModeEl,
      btnSolve,
      btnReset,
      btnUndo,
      btnRedo,
      autoSolveEl,
      toastEl,
      boardEl,
      boardScrollerEl,
      themeToggleEl,
    } = ctx.els;

    setDarkMode(ctx, false);
    themeToggleEl.addEventListener("click", () => {
      const nowDark = document.documentElement.dataset.theme === "dark";
      setDarkMode(ctx, !nowDark);
    });

    window.addEventListener("resize", () => IWABA.view.syncSolveButtonWidth(ctx));

    IWABA.logic.updateHistoryButtons(ctx);

    autoSolveEl.addEventListener("change", () => {
      if (autoSolveEnabled(ctx)) IWABA.logic.solveDeterministic(ctx);
    });

    toastEl.addEventListener("click", (e) => {
      const t = e.target;
      if (t && t.classList && t.classList.contains("toastClose")) IWABA.view.hideToast(ctx);
    });

    boardScrollerEl.addEventListener("scroll", () => IWABA.view.hideProbTip(ctx), { passive: true });

    difficultyEl.addEventListener("change", () => {
      applyStageFromUI(ctx);
      IWABA.logic.clearHistory(ctx);
    });
    inputModeEl.addEventListener("change", () => {
      IWABA.view.renderStageInfo(ctx);
      IWABA.view.updateModeUI(ctx);
      IWABA.view.hideProbTip(ctx);
    });

    btnSolve.addEventListener("click", () => IWABA.logic.solveDeterministic(ctx));
    btnReset.addEventListener("click", () => {
      IWABA.logic.pushHistory(ctx);
      IWABA.logic.initGrid(ctx);
      IWABA.logic.clearHints(ctx);
      IWABA.view.renderBoard(ctx);
      bindCells(ctx);
      maybeAutoSolveNow(ctx);
    });

    if (btnUndo) btnUndo.addEventListener("click", () => runUndo(ctx));
    if (btnRedo) btnRedo.addEventListener("click", () => runRedo(ctx));

    boardEl.addEventListener("contextmenu", (e) => e.preventDefault());

    boardEl.addEventListener("pointerdown", (e) => {
      IWABA.view.hideProbTip(ctx);
      const cell = e.target.closest?.(".cell");
      if (!cell) return;

      const r = Number(cell.dataset.r);
      const c = Number(cell.dataset.c);

      if (e.button === 2) {
        e.preventDefault();

        if (isCycleMode(ctx)) return;

        const preserve = false;
        if (!autoSolveEnabled(ctx)) IWABA.logic.clearHints(ctx);

        ctx.state.drag.active = true;
        ctx.state.drag.changed = false;
        ctx.state.drag.pointerId = e.pointerId;
        ctx.state.drag.lastStamp = null;
        ctx.state.drag.lastRightKey = null;
        ctx.state.drag.preserveUI = preserve;

        ctx.state.drag.mode = "rightStamp";

        const st0 = ctx.state.grid[r][c];
        let stamp = "flag";
        if (st0.state === ctx.consts.CellState.WALL) stamp = "flag";
        else if (st0.state === ctx.consts.CellState.FLAG) stamp = "blank";
        else if (st0.state === ctx.consts.CellState.REVEALED && st0.num === 0) stamp = "wall";
        else stamp = "flag";

        ctx.state.drag.rightStamp = stamp;

        ctx.state.drag.historySnapshot = IWABA.logic.historySnapshot(ctx);
        const changed = IWABA.logic.rightPaintStamp(ctx, r, c, stamp, { preserveUI: preserve });
        ctx.state.drag.changed = changed;
        if (changed) IWABA.view.setCellVisual(ctx, cell, ctx.state.grid[r][c]);

        boardEl.setPointerCapture(ctx.state.drag.pointerId);
        return;
      }

      if (e.button !== 0) return;
      if (ctx.els.inputModeEl.value !== "paint") return;

      e.preventDefault();
      if (!autoSolveEnabled(ctx)) IWABA.logic.clearHints(ctx);

      ctx.state.drag.active = true;
      ctx.state.drag.changed = false;
      ctx.state.drag.pointerId = e.pointerId;
      ctx.state.drag.mode = "left";
      ctx.state.drag.lastStamp = null;
      ctx.state.drag.lastRightKey = null;
      ctx.state.drag.rightAction = null;
      ctx.state.drag.rightStamp = null;
      ctx.state.drag.preserveUI = false;
      ctx.state.drag.historySnapshot = null;

      const stamp = `${r},${c},${IWABA.logic.toolSignature(ctx.state.currentTool)}`;
      ctx.state.drag.lastStamp = stamp;

      ctx.state.drag.historySnapshot = IWABA.logic.historySnapshot(ctx);
      const changed = IWABA.logic.applyTool(ctx, r, c, ctx.state.currentTool, { preserveUI: false });
      ctx.state.drag.changed = changed;
      if (changed) IWABA.view.setCellVisual(ctx, cell, ctx.state.grid[r][c]);

      boardEl.setPointerCapture(ctx.state.drag.pointerId);
    });

    boardEl.addEventListener("pointermove", (e) => {
      if (!ctx.state.drag.active) return;
      if (e.pointerId !== ctx.state.drag.pointerId) return;

      const cell = cellFromPoint(ctx, e.clientX, e.clientY);
      if (!cell) return;

      const r = Number(cell.dataset.r);
      const c = Number(cell.dataset.c);

      if (ctx.state.drag.mode === "rightStamp") {
        const key = `${r},${c}`;
        if (key === ctx.state.drag.lastRightKey) return;
        ctx.state.drag.lastRightKey = key;

        const changed = IWABA.logic.rightPaintStamp(ctx, r, c, ctx.state.drag.rightStamp, { preserveUI: ctx.state.drag.preserveUI });
        if (!changed) return;

        ctx.state.drag.changed = true;
        IWABA.view.setCellVisual(ctx, cell, ctx.state.grid[r][c]);
      } else {
        const stamp = `${r},${c},${IWABA.logic.toolSignature(ctx.state.currentTool)}`;
        if (stamp === ctx.state.drag.lastStamp) return;
        ctx.state.drag.lastStamp = stamp;

        const changed = IWABA.logic.applyTool(ctx, r, c, ctx.state.currentTool, { preserveUI: false });
        if (!changed) return;
        ctx.state.drag.changed = true;
        IWABA.view.setCellVisual(ctx, cell, ctx.state.grid[r][c]);
      }
    });

    function endDrag(e) {
      if (!ctx.state.drag.active) return;
      if (e.pointerId !== ctx.state.drag.pointerId) return;

      const changed = ctx.state.drag.changed;
      if (changed && ctx.state.drag.historySnapshot) IWABA.logic.commitHistorySnapshot(ctx, ctx.state.drag.historySnapshot);

      ctx.state.drag.active = false;
      ctx.state.drag.changed = false;
      ctx.state.drag.pointerId = null;
      ctx.state.drag.mode = null;
      ctx.state.drag.rightAction = null;
      ctx.state.drag.rightStamp = null;
      ctx.state.drag.lastStamp = null;
      ctx.state.drag.lastRightKey = null;
      ctx.state.drag.preserveUI = false;
      ctx.state.drag.historySnapshot = null;

      try { boardEl.releasePointerCapture(e.pointerId); } catch { }

      maybeAutoSolveOnDragEnd(ctx, changed);
    }
    boardEl.addEventListener("pointerup", endDrag);
    boardEl.addEventListener("pointercancel", endDrag);

    window.addEventListener(
      "wheel",
      (e) => {
        if (e.ctrlKey || e.metaKey) return;
        if (ctx.els.inputModeEl.value !== "paint") return;

        const d = ctx.utils.wheelPrimaryDelta(e);
        if (d === 0) return;

        const delta = d > 0 ? +1 : -1;
        if (e.cancelable) e.preventDefault();
        IWABA.logic.bumpTool(ctx, delta);
      },
      { passive: false, capture: true }
    );

    document.addEventListener("keydown", (e) => {
      const tag = ((document.activeElement && document.activeElement.tagName) || "").toLowerCase();
      if (tag === "input" || tag === "select" || tag === "textarea") return;

      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        runUndo(ctx);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || e.key === "Y")) {
        e.preventDefault();
        runRedo(ctx);
        return;
      }
      if (
        ctx.els.inputModeEl.value === "paint" &&
        (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight")
      ) {
        e.preventDefault();
        IWABA.logic.moveToolCursorByArrow(ctx, e.key);
        return;
      }

      const kk = e.key.toLowerCase();
      if (kk >= "0" && kk <= "8") {
        IWABA.view.hideProbTip(ctx);
        if (ctx.els.inputModeEl.value === "paint") IWABA.logic.setCurrentTool(ctx, ctx.consts.Tool.num(Number(kk)));
        return;
      }
      if (kk === "f") {
        IWABA.view.hideProbTip(ctx);
        if (ctx.els.inputModeEl.value === "paint") IWABA.logic.setCurrentTool(ctx, ctx.consts.Tool.flag());
        return;
      }
      if (kk === "w" || kk === "?") {
        IWABA.view.hideProbTip(ctx);
        if (ctx.els.inputModeEl.value === "paint") IWABA.logic.setCurrentTool(ctx, ctx.consts.Tool.wall());
        return;
      }
    });

    bindCells(ctx);
  }

  IWABA.input = { bind, applyStageFromUI, bindCells };
})();
