/* iwaba-input.js
 * Event bindings. Calls IWABA.logic + IWABA.view.
 */
(() => {
  window.IWABA = window.IWABA || {};

  function autoSolveEnabled(ctx) {
    return !!(ctx.els.autoSolveEl && ctx.els.autoSolveEl.checked);
  }

  function maybeAutoSolve(ctx, { requireChange = false, changed = true } = {}) {
    if (!autoSolveEnabled(ctx)) return;
    if (requireChange && !changed) return;
    IWABA.logic.solveDeterministic(ctx);
  }

  function runUndo(ctx) {
    const changed = IWABA.logic.undo(ctx);
    if (!changed) return;
    maybeAutoSolve(ctx);
  }

  function runRedo(ctx) {
    const changed = IWABA.logic.redo(ctx);
    if (!changed) return;
    maybeAutoSolve(ctx);
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
    maybeAutoSolve(ctx);
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
    const LONG_PRESS_MS = 450;
    const LONG_PRESS_MOVE_PX = 10;

    function clearLongPressTimer(cell) {
      const id = Number(cell.dataset.longPressTimerId || 0);
      if (id > 0) clearTimeout(id);
      delete cell.dataset.longPressTimerId;
      delete cell.dataset.longPressStartX;
      delete cell.dataset.longPressStartY;
    }

    function consumeLongPressProb(cell) {
      if (cell.dataset.longPressProb !== "1") return false;
      delete cell.dataset.longPressProb;
      return true;
    }

    function commitCellChange(cell, changeFn) {
      const r = Number(cell.dataset.r);
      const c = Number(cell.dataset.c);
      const snap = IWABA.logic.historySnapshot(ctx);
      const changed = changeFn(r, c);
      if (!changed) return false;

      IWABA.logic.commitHistorySnapshot(ctx, snap);
      IWABA.view.setCellVisual(ctx, cell, ctx.state.grid[r][c]);
      maybeAutoSolve(ctx);
      return true;
    }

    function applyToolByKey(cell, tool, preserveUI) {
      commitCellChange(cell, (r, c) => IWABA.logic.applyTool(ctx, r, c, tool, { preserveUI }));
    }

    for (const cell of boardEl.querySelectorAll(".cell")) {
      cell.addEventListener("mouseenter", () => IWABA.logic.maybeShowProbTip(ctx, cell));
      cell.addEventListener("mouseleave", () => IWABA.view.hideProbTip(ctx));

      cell.addEventListener("pointerdown", (e) => {
        if (!isCycleMode(ctx)) return;
        if (e.pointerType !== "touch" && e.pointerType !== "pen") return;
        if (!IWABA.logic.isProbTipEligibleForCell(ctx, cell)) return;
        if (e.cancelable) e.preventDefault();
        clearLongPressTimer(cell);

        cell.dataset.longPressStartX = String(e.clientX);
        cell.dataset.longPressStartY = String(e.clientY);

        const tid = window.setTimeout(() => {
          IWABA.logic.maybeShowProbTip(ctx, cell);
          cell.dataset.longPressProb = "1";
          clearLongPressTimer(cell);
        }, LONG_PRESS_MS);
        cell.dataset.longPressTimerId = String(tid);
      });

      cell.addEventListener("pointermove", (e) => {
        const sx = Number(cell.dataset.longPressStartX);
        const sy = Number(cell.dataset.longPressStartY);
        if (!Number.isFinite(sx) || !Number.isFinite(sy)) return;

        const dx = e.clientX - sx;
        const dy = e.clientY - sy;
        if (dx * dx + dy * dy >= LONG_PRESS_MOVE_PX * LONG_PRESS_MOVE_PX) clearLongPressTimer(cell);
      });

      const cancelLongPress = () => clearLongPressTimer(cell);
      cell.addEventListener("pointerup", cancelLongPress);
      cell.addEventListener("pointercancel", cancelLongPress);

      cell.addEventListener("click", (e) => {
        if (!isCycleMode(ctx)) return;
        e.preventDefault();
        if (consumeLongPressProb(cell)) return;

        IWABA.view.hideProbTip(ctx);
        commitCellChange(cell, (r, c) => IWABA.logic.cycleCell(ctx, r, c, { preserveUI: true }));
      });

      cell.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        if (!isCycleMode(ctx)) return;
        if (consumeLongPressProb(cell)) return;
        if (e.pointerType === "touch" || e.pointerType === "pen") return;

        IWABA.view.hideProbTip(ctx);
        commitCellChange(cell, (r, c) => IWABA.logic.cycleCellBackward(ctx, r, c, { preserveUI: true }));
      });

      cell.addEventListener("keydown", (e) => {
        const k = e.key.toLowerCase();
        const preserveUI = isCycleMode(ctx);

        if (k >= "0" && k <= "8") {
          e.preventDefault();
          e.stopPropagation();
          IWABA.view.hideProbTip(ctx);
          applyToolByKey(cell, ctx.consts.Tool.num(Number(k)), preserveUI);
          return;
        }
        if (k === "f") {
          e.preventDefault();
          e.stopPropagation();
          IWABA.view.hideProbTip(ctx);
          applyToolByKey(cell, ctx.consts.Tool.flag(), preserveUI);
          return;
        }
        if (k === "w" || k === "?") {
          e.preventDefault();
          e.stopPropagation();
          IWABA.view.hideProbTip(ctx);
          applyToolByKey(cell, ctx.consts.Tool.wall(), preserveUI);
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
    const TOUCH_LONG_PRESS_MS = 450;
    const TOUCH_LONG_PRESS_MOVE_PX = 10;

    let savedHtmlOverflow = null;
    let savedBodyOverflow = null;
    let savedHtmlTouchAction = null;

    function setDragScrollLock(on) {
      const root = document.documentElement;
      const body = document.body;

      if (on) {
        if (savedHtmlOverflow === null) savedHtmlOverflow = root.style.overflow || "";
        if (savedBodyOverflow === null) savedBodyOverflow = body.style.overflow || "";
        if (savedHtmlTouchAction === null) savedHtmlTouchAction = root.style.touchAction || "";

        root.style.overflow = "hidden";
        body.style.overflow = "hidden";
        root.style.touchAction = "none";

        if (boardScrollerEl) boardScrollerEl.style.touchAction = "none";
        return;
      }

      root.style.overflow = savedHtmlOverflow ?? "";
      body.style.overflow = savedBodyOverflow ?? "";
      root.style.touchAction = savedHtmlTouchAction ?? "";
      savedHtmlOverflow = null;
      savedBodyOverflow = null;
      savedHtmlTouchAction = null;

      if (boardScrollerEl) boardScrollerEl.style.removeProperty("touch-action");
    }

    function clearPendingPaintLongPress() {
      const id = Number(ctx.state.drag.pendingLongPressTimerId || 0);
      if (id > 0) clearTimeout(id);
      ctx.state.drag.pendingLongPressTimerId = null;
      ctx.state.drag.pendingCellR = null;
      ctx.state.drag.pendingCellC = null;
      ctx.state.drag.pendingStartX = null;
      ctx.state.drag.pendingStartY = null;
    }

    function beginLeftPaintDrag(pointerId, cell, r, c) {
      const stamp = `${r},${c},${IWABA.logic.toolSignature(ctx.state.currentTool)}`;


      ctx.state.drag.active = true;
      ctx.state.drag.pointerId = pointerId;
      ctx.state.drag.mode = "left";
      ctx.state.drag.lastStamp = stamp;
      ctx.state.drag.lastRightKey = null;
      ctx.state.drag.rightStamp = null;
      ctx.state.drag.preserveUI = false;

      const changed = IWABA.logic.applyTool(ctx, r, c, ctx.state.currentTool, { preserveUI: false });
      if (changed) {
        ctx.state.drag.changed = true;
        IWABA.view.setCellVisual(ctx, cell, ctx.state.grid[r][c]);
      }

      setDragScrollLock(true);
    }

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
    document.addEventListener("pointerdown", () => IWABA.view.hideProbTip(ctx), { capture: true, passive: true });

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
      const snap = IWABA.logic.historySnapshot(ctx);
      IWABA.logic.initGrid(ctx);
      const changed = !IWABA.logic.isSameSnapshot(snap, IWABA.logic.historySnapshot(ctx));
      if (changed) IWABA.logic.commitHistorySnapshot(ctx, snap);
      IWABA.logic.clearHints(ctx);
      IWABA.view.renderBoard(ctx);
      bindCells(ctx);
      maybeAutoSolve(ctx);
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

        setDragScrollLock(true);
        boardEl.setPointerCapture(ctx.state.drag.pointerId);
        return;
      }

      if (e.button !== 0) return;
      if (ctx.els.inputModeEl.value !== "paint") return;

      e.preventDefault();
      const canLongPressForProb = (e.pointerType === "touch" || e.pointerType === "pen") && IWABA.logic.isProbTipEligibleForCell(ctx, cell);

      ctx.state.drag.active = true;
      ctx.state.drag.changed = false;
      ctx.state.drag.pointerId = e.pointerId;
      ctx.state.drag.mode = canLongPressForProb ? "leftPending" : "left";
      ctx.state.drag.lastStamp = null;
      ctx.state.drag.lastRightKey = null;
      ctx.state.drag.rightStamp = null;
      ctx.state.drag.preserveUI = false;
      if (!autoSolveEnabled(ctx)) IWABA.logic.clearHints(ctx);
      ctx.state.drag.historySnapshot = IWABA.logic.historySnapshot(ctx);

      if (canLongPressForProb) {
        clearPendingPaintLongPress();
        ctx.state.drag.pendingCellR = r;
        ctx.state.drag.pendingCellC = c;
        ctx.state.drag.pendingStartX = e.clientX;
        ctx.state.drag.pendingStartY = e.clientY;

        ctx.state.drag.pendingLongPressTimerId = window.setTimeout(() => {
          const active = ctx.state.drag.active && ctx.state.drag.pointerId === e.pointerId && ctx.state.drag.mode === "leftPending";
          if (!active) return;
          IWABA.logic.maybeShowProbTip(ctx, cell);
          ctx.state.drag.mode = "probPreview";
          clearPendingPaintLongPress();
        }, TOUCH_LONG_PRESS_MS);
      } else {
        beginLeftPaintDrag(e.pointerId, cell, r, c);
      }

      setDragScrollLock(true);
      boardEl.setPointerCapture(ctx.state.drag.pointerId);
    });

    boardEl.addEventListener("pointermove", (e) => {
      if (!ctx.state.drag.active) return;
      if (e.pointerId !== ctx.state.drag.pointerId) return;
      if (e.cancelable) e.preventDefault();

      if (ctx.state.drag.mode === "leftPending") {
        const sx = Number(ctx.state.drag.pendingStartX);
        const sy = Number(ctx.state.drag.pendingStartY);
        const dx = e.clientX - sx;
        const dy = e.clientY - sy;
        const moved = Number.isFinite(sx) && Number.isFinite(sy) && (dx * dx + dy * dy >= TOUCH_LONG_PRESS_MOVE_PX * TOUCH_LONG_PRESS_MOVE_PX);
        if (!moved) return;

        const startR = Number(ctx.state.drag.pendingCellR);
        const startC = Number(ctx.state.drag.pendingCellC);
        clearPendingPaintLongPress();
        const startCell = ctx.els.boardEl.querySelector(`.cell[data-r="${startR}"][data-c="${startC}"]`);
        if (startCell) beginLeftPaintDrag(e.pointerId, startCell, startR, startC);
        else ctx.state.drag.mode = "left";
      }
      if (ctx.state.drag.mode === "probPreview") return;

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
      ctx.state.drag.rightStamp = null;
      ctx.state.drag.lastStamp = null;
      ctx.state.drag.lastRightKey = null;
      ctx.state.drag.preserveUI = false;
      ctx.state.drag.historySnapshot = null;
      clearPendingPaintLongPress();
      setDragScrollLock(false);

      try { boardEl.releasePointerCapture(e.pointerId); } catch { }

      maybeAutoSolve(ctx, { requireChange: true, changed });
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
