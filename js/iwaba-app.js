/* iwaba-app.js
 * App bootstrap.
 */
(() => {
  window.IWABA = window.IWABA || {};

  function buildContext() {
    const C = IWABA.constants;

    return {
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
        toolboxEl: document.querySelector(".toolbox"),
        toolboxControlsEl: document.getElementById("toolboxControls"),
        mobilePaintControlsEl: document.getElementById("mobilePaintControls"),
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
  }

  function initialRender(ctx) {
    IWABA.view.renderStageInfo(ctx);
    IWABA.logic.initGrid(ctx);
    IWABA.logic.setCurrentTool(ctx, ctx.consts.Tool.wall());
    IWABA.view.renderTools(ctx);
    IWABA.view.renderBoard(ctx);
    IWABA.view.updateModeUI(ctx);
  }

  function syncResponsive(ctx) {
    IWABA.view.renderTools(ctx);
    IWABA.view.updateHistoryButtonLabels(ctx);
    IWABA.view.syncMobilePaintControls(ctx);
    IWABA.view.syncResponsiveBoard(ctx);
    IWABA.view.renderOpsInfo(ctx);
  }

  function scheduleInitialSolve(ctx) {
    requestAnimationFrame(() => {
      syncResponsive(ctx);
      IWABA.view.syncSolveButtonWidth(ctx);
      if (ctx.els.autoSolveEl?.checked) {
        IWABA.logic.solveDeterministic(ctx);
      }
    });
  }

  function initializeApp() {
    const ctx = buildContext();
    IWABA.ctx = ctx;

    initialRender(ctx);
    IWABA.input.bind(ctx);

    window.addEventListener("resize", () => syncResponsive(ctx), { passive: true });
    window.addEventListener("orientationchange", () => syncResponsive(ctx), { passive: true });

    scheduleInitialSolve(ctx);
  }

  initializeApp();
})();
