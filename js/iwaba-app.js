/* iwaba-app.js
 * Bootstrap.
 */
(() => {
  window.IWABA = window.IWABA || {};

  const C = IWABA.constants;

  const ctx = {
    consts: {
      STAGES: C.STAGES,
      CellState: C.CellState,
      Tool: C.Tool,
      WALL_CHAR: C.WALL_CHAR,
      TOOL_DEFS: C.TOOL_DEFS,
      TOOL_GRID_COLS: C.TOOL_GRID_COLS,
      TOOL_CYCLE_LEN: C.TOOL_CYCLE_LEN,
    },
    utils: IWABA.utils,
    solver: IWABA.solver,
    els: {
      difficultyEl: document.getElementById("difficulty"),
      inputModeEl: document.getElementById("inputMode"),
      infoEl: document.getElementById("stageInfo"),
      boardEl: document.getElementById("board"),
      axisXEl: document.getElementById("axisX"),
      axisYEl: document.getElementById("axisY"),
      toolGridEl: document.getElementById("toolGrid"),
      toolMetaEl: document.getElementById("toolMeta"),
      opsInfoEl: document.getElementById("opsInfo"),
      currentToolPillEl: document.getElementById("currentToolPill"),
      btnSolve: document.getElementById("btnSolve"),
      btnReset: document.getElementById("btnReset"),
      btnUndo: document.getElementById("btnUndo"),
      btnRedo: document.getElementById("btnRedo"),
      autoSolveEl: document.getElementById("autoSolve"),
      toastEl: document.getElementById("toast"),
      boardScrollerEl: document.getElementById("boardScroller"),
      probTipEl: document.getElementById("probTip"),
      themeToggleEl: document.getElementById("themeToggle"),
    },
    state: {
      rows: C.STAGES.beginner.size.rows,
      cols: C.STAGES.beginner.size.cols,
      grid: [],
      currentTool: C.Tool.wall(),
      toolCursorIndex: 0,
      drag: {
        active: false,
        changed: false,
        pointerId: null,
        mode: null,
        rightAction: null,
        lastStamp: null,
        lastRightKey: null,
        preserveUI: false,
      },
      lastSuggestMines: new Set(),
      lastSuggestSafes: new Set(),
      lastSuggestRecos: new Set(),
      hasContradictionNow: false,
      history: {
        past: [],
        future: [],
        max: 200,
      },
    },
  };

  IWABA.ctx = ctx;

  (() => {
    const el = ctx.els.inputModeEl;
    if (!el) return;

    const ua = (navigator.userAgent || "");
    const uaMobile = /Android|iPhone|iPad|iPod|Mobile|Mobi/i.test(ua);
    const coarse =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(pointer: coarse)").matches;

    if (uaMobile || coarse) el.value = "cycle";
  })();


  IWABA.view.renderStageInfo(ctx);
  IWABA.logic.initGrid(ctx);
  IWABA.logic.setCurrentTool(ctx, C.Tool.wall());
  IWABA.view.renderTools(ctx);
  IWABA.view.renderBoard(ctx);
  IWABA.view.updateModeUI(ctx);

  IWABA.input.bind(ctx);

  const syncResponsive = () => IWABA.view.syncResponsiveBoard(ctx);
  window.addEventListener("resize", syncResponsive, { passive: true });
  window.addEventListener("orientationchange", syncResponsive, { passive: true });

  requestAnimationFrame(() => {
    syncResponsive();
    IWABA.view.syncSolveButtonWidth(ctx);
    if (ctx.els.autoSolveEl && ctx.els.autoSolveEl.checked) {
      IWABA.logic.solveDeterministic(ctx);
    }
  });
})();
