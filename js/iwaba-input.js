/* iwaba-input.js
 * Event bindings. Calls IWABA.logic + IWABA.view.
 */
(() => {
  window.IWABA = window.IWABA || {};

  const CELL_LONG_PRESS_MS = 450;
  const CELL_LONG_PRESS_MOVE_PX = 10;
  const PAINT_LONG_PRESS_MS = 450;
  const PAINT_LONG_PRESS_MOVE_PX = 10;

  function autoSolveEnabled(ctx) {
    return !!ctx.els.autoSolveEl?.checked;
  }

  function maybeAutoSolve(ctx, { requireChange = false, changed = true } = {}) {
    if (!autoSolveEnabled(ctx)) return;
    if (requireChange && !changed) return;
    IWABA.logic.solveDeterministic(ctx);
  }

  function runUndo(ctx) {
    const changed = IWABA.logic.undo(ctx);
    if (changed) maybeAutoSolve(ctx);
  }

  function runRedo(ctx) {
    const changed = IWABA.logic.redo(ctx);
    if (changed) maybeAutoSolve(ctx);
  }

  function setDarkMode(ctx, on) {
    const { themeToggleEl } = ctx.els;

    if (on) document.documentElement.dataset.theme = "dark";
    else document.documentElement.removeAttribute("data-theme");

    themeToggleEl.setAttribute("aria-pressed", on ? "true" : "false");
    themeToggleEl.textContent = on ? "☀ ライトモードに変更" : "🌙 ダークモードに変更";
  }

  function isPaintMode(ctx) {
    return ctx.els.inputModeEl.value === "paint";
  }

  function isCycleMode(ctx) {
    return ctx.els.inputModeEl.value === "cycle";
  }

  function currentStage(ctx) {
    const { STAGES } = ctx.consts;
    return STAGES[ctx.els.difficultyEl.value] ?? STAGES.beginner;
  }

  function refreshStageUI(ctx) {
    IWABA.view.renderStageInfo(ctx);
    IWABA.view.renderTools(ctx);
    IWABA.view.renderBoard(ctx);
    bindCells(ctx);
    IWABA.view.updateModeUI(ctx);
  }

  function applyStageFromUI(ctx) {
    const stage = currentStage(ctx);
    ctx.state.rows = stage.size.rows;
    ctx.state.cols = stage.size.cols;

    IWABA.logic.initGrid(ctx);
    refreshStageUI(ctx);
    maybeAutoSolve(ctx);
  }

  function cellFromPoint(ctx, x, y) {
    const target = document.elementFromPoint(x, y);
    const cell = target?.closest?.(".cell");
    if (!cell) return null;
    if (!ctx.els.boardEl.contains(cell)) return null;
    return cell;
  }

  function getCellPosition(cell) {
    return {
      r: Number(cell.dataset.r),
      c: Number(cell.dataset.c),
    };
  }

  function hideProbTip(ctx) {
    IWABA.view.hideProbTip(ctx);
  }

  function commitSingleCellChange(ctx, cell, changeFn) {
    const { r, c } = getCellPosition(cell);
    const snapshot = IWABA.logic.historySnapshot(ctx);
    const changed = changeFn(r, c);
    if (!changed) return false;

    IWABA.logic.commitHistorySnapshot(ctx, snapshot);
    IWABA.view.setCellVisual(ctx, cell, ctx.state.grid[r][c]);
    maybeAutoSolve(ctx);
    return true;
  }

  function applyToolShortcutToCell(ctx, cell, tool, preserveUI) {
    commitSingleCellChange(ctx, cell, (r, c) =>
      IWABA.logic.applyTool(ctx, r, c, tool, { preserveUI })
    );
  }

  function clearCellLongPress(cell) {
    const timerId = Number(cell.dataset.longPressTimerId || 0);
    if (timerId > 0) clearTimeout(timerId);

    delete cell.dataset.longPressTimerId;
    delete cell.dataset.longPressStartX;
    delete cell.dataset.longPressStartY;
  }

  function consumeCellLongPressProb(cell) {
    if (cell.dataset.longPressProb !== "1") return false;
    delete cell.dataset.longPressProb;
    return true;
  }

  function startCellProbLongPress(ctx, cell, e) {
    if (!isCycleMode(ctx)) return;
    if (e.pointerType !== "touch" && e.pointerType !== "pen") return;
    if (!IWABA.logic.isProbTipEligibleForCell(ctx, cell)) return;

    if (e.cancelable) e.preventDefault();
    clearCellLongPress(cell);

    cell.dataset.longPressStartX = String(e.clientX);
    cell.dataset.longPressStartY = String(e.clientY);
    cell.dataset.longPressTimerId = String(
      window.setTimeout(() => {
        IWABA.logic.maybeShowProbTip(ctx, cell);
        cell.dataset.longPressProb = "1";
        clearCellLongPress(cell);
      }, CELL_LONG_PRESS_MS)
    );
  }

  function maybeCancelCellProbLongPress(cell, e) {
    const startX = Number(cell.dataset.longPressStartX);
    const startY = Number(cell.dataset.longPressStartY);
    if (!Number.isFinite(startX) || !Number.isFinite(startY)) return;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (dx * dx + dy * dy >= CELL_LONG_PRESS_MOVE_PX * CELL_LONG_PRESS_MOVE_PX) {
      clearCellLongPress(cell);
    }
  }

  function bindCellInteractions(ctx, cell) {
    cell.addEventListener("mouseenter", () => IWABA.logic.maybeShowProbTip(ctx, cell));
    cell.addEventListener("mouseleave", () => hideProbTip(ctx));

    cell.addEventListener("pointerdown", (e) => startCellProbLongPress(ctx, cell, e));
    cell.addEventListener("pointermove", (e) => maybeCancelCellProbLongPress(cell, e));
    cell.addEventListener("pointerup", () => clearCellLongPress(cell));
    cell.addEventListener("pointercancel", () => clearCellLongPress(cell));

    cell.addEventListener("click", (e) => {
      if (!isCycleMode(ctx)) return;
      e.preventDefault();
      if (consumeCellLongPressProb(cell)) return;

      hideProbTip(ctx);
      commitSingleCellChange(ctx, cell, (r, c) =>
        IWABA.logic.cycleCell(ctx, r, c, { preserveUI: true })
      );
    });

    cell.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      if (!isCycleMode(ctx)) return;
      if (consumeCellLongPressProb(cell)) return;
      if (e.pointerType === "touch" || e.pointerType === "pen") return;

      hideProbTip(ctx);
      commitSingleCellChange(ctx, cell, (r, c) =>
        IWABA.logic.cycleCellBackward(ctx, r, c, { preserveUI: true })
      );
    });

    cell.addEventListener("keydown", (e) => {
      const key = e.key.toLowerCase();
      const preserveUI = isCycleMode(ctx);

      if (key >= "0" && key <= "8") {
        e.preventDefault();
        e.stopPropagation();
        hideProbTip(ctx);
        applyToolShortcutToCell(ctx, cell, ctx.consts.Tool.num(Number(key)), preserveUI);
        return;
      }
      if (key === "f") {
        e.preventDefault();
        e.stopPropagation();
        hideProbTip(ctx);
        applyToolShortcutToCell(ctx, cell, ctx.consts.Tool.flag(), preserveUI);
        return;
      }
      if (key === "w" || key === "?") {
        e.preventDefault();
        e.stopPropagation();
        hideProbTip(ctx);
        applyToolShortcutToCell(ctx, cell, ctx.consts.Tool.wall(), preserveUI);
      }
    });
  }

  function bindCells(ctx) {
    for (const cell of ctx.els.boardEl.querySelectorAll(".cell")) {
      bindCellInteractions(ctx, cell);
    }
  }

  function makeScrollLockController(boardScrollerEl) {
    let savedHtmlOverflow = null;
    let savedBodyOverflow = null;
    let savedHtmlTouchAction = null;

    return {
      set(on) {
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
      },
    };
  }

  function clearPendingPaintLongPress(ctx) {
    const timerId = Number(ctx.state.drag.pendingLongPressTimerId || 0);
    if (timerId > 0) clearTimeout(timerId);

    ctx.state.drag.pendingLongPressTimerId = null;
    ctx.state.drag.pendingCellR = null;
    ctx.state.drag.pendingCellC = null;
    ctx.state.drag.pendingStartX = null;
    ctx.state.drag.pendingStartY = null;
  }

  function setBaseDragState(ctx, pointerId) {
    ctx.state.drag.active = true;
    ctx.state.drag.changed = false;
    ctx.state.drag.pointerId = pointerId;
    ctx.state.drag.lastStamp = null;
    ctx.state.drag.lastRightKey = null;
    ctx.state.drag.rightStamp = null;
    ctx.state.drag.preserveUI = false;
  }

  function beginLeftPaintDrag(ctx, pointerId, cell) {
    const { r, c } = getCellPosition(cell);
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
  }

  function resolveRightDragStamp(ctx, r, c) {
    const cell = ctx.state.grid[r][c];
    if (cell.state === ctx.consts.CellState.WALL) return "flag";
    if (cell.state === ctx.consts.CellState.FLAG) return "blank";
    if (cell.state === ctx.consts.CellState.REVEALED && cell.num === 0) return "wall";
    return "flag";
  }

  function startRightStampDrag(ctx, cell, e, scrollLock) {
    const { r, c } = getCellPosition(cell);
    const preserveUI = false;

    if (!autoSolveEnabled(ctx)) IWABA.logic.clearHints(ctx);

    setBaseDragState(ctx, e.pointerId);
    ctx.state.drag.mode = "rightStamp";
    ctx.state.drag.preserveUI = preserveUI;
    ctx.state.drag.rightStamp = resolveRightDragStamp(ctx, r, c);
    ctx.state.drag.historySnapshot = IWABA.logic.historySnapshot(ctx);

    const changed = IWABA.logic.rightPaintStamp(ctx, r, c, ctx.state.drag.rightStamp, { preserveUI });
    ctx.state.drag.changed = changed;
    if (changed) IWABA.view.setCellVisual(ctx, cell, ctx.state.grid[r][c]);

    scrollLock.set(true);
    ctx.els.boardEl.setPointerCapture(ctx.state.drag.pointerId);
  }

  function startLeftPointerFlow(ctx, cell, e, scrollLock) {
    const { r, c } = getCellPosition(cell);
    const canLongPressForProb =
      (e.pointerType === "touch" || e.pointerType === "pen") &&
      IWABA.logic.isProbTipEligibleForCell(ctx, cell);

    setBaseDragState(ctx, e.pointerId);
    ctx.state.drag.mode = canLongPressForProb ? "leftPending" : "left";

    if (!autoSolveEnabled(ctx)) IWABA.logic.clearHints(ctx);
    ctx.state.drag.historySnapshot = IWABA.logic.historySnapshot(ctx);

    if (canLongPressForProb) {
      clearPendingPaintLongPress(ctx);
      ctx.state.drag.pendingCellR = r;
      ctx.state.drag.pendingCellC = c;
      ctx.state.drag.pendingStartX = e.clientX;
      ctx.state.drag.pendingStartY = e.clientY;
      ctx.state.drag.pendingLongPressTimerId = window.setTimeout(() => {
        const isStillPending =
          ctx.state.drag.active &&
          ctx.state.drag.pointerId === e.pointerId &&
          ctx.state.drag.mode === "leftPending";
        if (!isStillPending) return;

        IWABA.logic.maybeShowProbTip(ctx, cell);
        ctx.state.drag.mode = "probPreview";
        clearPendingPaintLongPress(ctx);
      }, PAINT_LONG_PRESS_MS);
    } else {
      beginLeftPaintDrag(ctx, e.pointerId, cell);
    }

    scrollLock.set(true);
    ctx.els.boardEl.setPointerCapture(ctx.state.drag.pointerId);
  }

  function maybePromotePendingLeftDrag(ctx, e) {
    if (ctx.state.drag.mode !== "leftPending") return;

    const startX = Number(ctx.state.drag.pendingStartX);
    const startY = Number(ctx.state.drag.pendingStartY);
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const movedEnough =
      Number.isFinite(startX) &&
      Number.isFinite(startY) &&
      dx * dx + dy * dy >= PAINT_LONG_PRESS_MOVE_PX * PAINT_LONG_PRESS_MOVE_PX;

    if (!movedEnough) return;

    const startR = Number(ctx.state.drag.pendingCellR);
    const startC = Number(ctx.state.drag.pendingCellC);
    clearPendingPaintLongPress(ctx);

    const startCell = ctx.els.boardEl.querySelector(`.cell[data-r="${startR}"][data-c="${startC}"]`);
    if (startCell) beginLeftPaintDrag(ctx, e.pointerId, startCell);
    else ctx.state.drag.mode = "left";
  }

  function applyDragMove(ctx, cell) {
    const { r, c } = getCellPosition(cell);

    if (ctx.state.drag.mode === "rightStamp") {
      const key = `${r},${c}`;
      if (key === ctx.state.drag.lastRightKey) return;
      ctx.state.drag.lastRightKey = key;

      const changed = IWABA.logic.rightPaintStamp(ctx, r, c, ctx.state.drag.rightStamp, {
        preserveUI: ctx.state.drag.preserveUI,
      });
      if (!changed) return;

      ctx.state.drag.changed = true;
      IWABA.view.setCellVisual(ctx, cell, ctx.state.grid[r][c]);
      return;
    }

    const stamp = `${r},${c},${IWABA.logic.toolSignature(ctx.state.currentTool)}`;
    if (stamp === ctx.state.drag.lastStamp) return;
    ctx.state.drag.lastStamp = stamp;

    const changed = IWABA.logic.applyTool(ctx, r, c, ctx.state.currentTool, { preserveUI: false });
    if (!changed) return;

    ctx.state.drag.changed = true;
    IWABA.view.setCellVisual(ctx, cell, ctx.state.grid[r][c]);
  }

  function resetDragState(ctx) {
    ctx.state.drag.active = false;
    ctx.state.drag.changed = false;
    ctx.state.drag.pointerId = null;
    ctx.state.drag.mode = null;
    ctx.state.drag.rightStamp = null;
    ctx.state.drag.lastStamp = null;
    ctx.state.drag.lastRightKey = null;
    ctx.state.drag.preserveUI = false;
    ctx.state.drag.historySnapshot = null;
    clearPendingPaintLongPress(ctx);
  }

  function isEditingFieldFocused() {
    const tag = ((document.activeElement && document.activeElement.tagName) || "").toLowerCase();
    return tag === "input" || tag === "select" || tag === "textarea";
  }

  function handleGlobalToolShortcut(ctx, key) {
    hideProbTip(ctx);
    if (!isPaintMode(ctx)) return;

    if (key >= "0" && key <= "8") {
      IWABA.logic.setCurrentTool(ctx, ctx.consts.Tool.num(Number(key)));
      return true;
    }
    if (key === "f") {
      IWABA.logic.setCurrentTool(ctx, ctx.consts.Tool.flag());
      return true;
    }
    if (key === "w" || key === "?") {
      IWABA.logic.setCurrentTool(ctx, ctx.consts.Tool.wall());
      return true;
    }
    return false;
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

    const scrollLock = makeScrollLockController(boardScrollerEl);

    setDarkMode(ctx, false);
    themeToggleEl.addEventListener("click", () => {
      const dark = document.documentElement.dataset.theme === "dark";
      setDarkMode(ctx, !dark);
    });

    window.addEventListener("resize", () => IWABA.view.syncSolveButtonWidth(ctx));
    IWABA.logic.updateHistoryButtons(ctx);

    autoSolveEl.addEventListener("change", () => {
      if (autoSolveEnabled(ctx)) IWABA.logic.solveDeterministic(ctx);
    });

    toastEl.addEventListener("click", (e) => {
      const target = e.target;
      if (target?.classList?.contains("toastClose")) IWABA.view.hideToast(ctx);
    });

    boardScrollerEl.addEventListener("scroll", () => hideProbTip(ctx), { passive: true });
    document.addEventListener("pointerdown", () => hideProbTip(ctx), { capture: true, passive: true });

    difficultyEl.addEventListener("change", () => {
      applyStageFromUI(ctx);
      IWABA.logic.clearHistory(ctx);
    });

    inputModeEl.addEventListener("change", () => {
      IWABA.view.renderStageInfo(ctx);
      IWABA.view.updateModeUI(ctx);
      hideProbTip(ctx);
    });

    btnSolve.addEventListener("click", () => IWABA.logic.solveDeterministic(ctx));

    btnReset.addEventListener("click", () => {
      const snapshot = IWABA.logic.historySnapshot(ctx);
      IWABA.logic.initGrid(ctx);
      const changed = !IWABA.logic.isSameSnapshot(snapshot, IWABA.logic.historySnapshot(ctx));
      if (changed) IWABA.logic.commitHistorySnapshot(ctx, snapshot);

      IWABA.logic.clearHints(ctx);
      IWABA.view.renderBoard(ctx);
      bindCells(ctx);
      maybeAutoSolve(ctx);
    });

    if (btnUndo) btnUndo.addEventListener("click", () => runUndo(ctx));
    if (btnRedo) btnRedo.addEventListener("click", () => runRedo(ctx));

    boardEl.addEventListener("contextmenu", (e) => e.preventDefault());

    boardEl.addEventListener("pointerdown", (e) => {
      hideProbTip(ctx);
      const cell = e.target.closest?.(".cell");
      if (!cell) return;

      if (e.button === 2) {
        e.preventDefault();
        if (isCycleMode(ctx)) return;
        startRightStampDrag(ctx, cell, e, scrollLock);
        return;
      }

      if (e.button !== 0) return;
      if (!isPaintMode(ctx)) return;

      e.preventDefault();
      startLeftPointerFlow(ctx, cell, e, scrollLock);
    });

    boardEl.addEventListener("pointermove", (e) => {
      if (!ctx.state.drag.active) return;
      if (e.pointerId !== ctx.state.drag.pointerId) return;
      if (e.cancelable) e.preventDefault();

      maybePromotePendingLeftDrag(ctx, e);
      if (ctx.state.drag.mode === "probPreview") return;

      const cell = cellFromPoint(ctx, e.clientX, e.clientY);
      if (!cell) return;
      applyDragMove(ctx, cell);
    });

    function endDrag(e) {
      if (!ctx.state.drag.active) return;
      if (e.pointerId !== ctx.state.drag.pointerId) return;

      const changed = ctx.state.drag.changed;
      const snapshot = ctx.state.drag.historySnapshot;
      if (changed && snapshot) IWABA.logic.commitHistorySnapshot(ctx, snapshot);

      resetDragState(ctx);
      scrollLock.set(false);

      try {
        boardEl.releasePointerCapture(e.pointerId);
      } catch {
      }

      maybeAutoSolve(ctx, { requireChange: true, changed });
    }

    boardEl.addEventListener("pointerup", endDrag);
    boardEl.addEventListener("pointercancel", endDrag);

    window.addEventListener(
      "wheel",
      (e) => {
        if (e.ctrlKey || e.metaKey) return;
        if (!isPaintMode(ctx)) return;

        const deltaRaw = ctx.utils.wheelPrimaryDelta(e);
        if (deltaRaw === 0) return;

        if (e.cancelable) e.preventDefault();
        IWABA.logic.bumpTool(ctx, deltaRaw > 0 ? 1 : -1);
      },
      { passive: false, capture: true }
    );

    document.addEventListener("keydown", (e) => {
      if (isEditingFieldFocused()) return;

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
        isPaintMode(ctx) &&
        (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight")
      ) {
        e.preventDefault();
        IWABA.logic.moveToolCursorByArrow(ctx, e.key);
        return;
      }

      handleGlobalToolShortcut(ctx, e.key.toLowerCase());
    });

    bindCells(ctx);
  }

  IWABA.input = { bind, applyStageFromUI, bindCells };
})();
