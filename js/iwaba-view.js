/* iwaba-view.js
 * DOM building + rendering helpers.
 */
(() => {
  window.IWABA = window.IWABA || {};

  function clearEl(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  function makeEl(tag, className = null, text = null) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== null && text !== undefined) el.textContent = text;
    return el;
  }

  function append(parent, ...children) {
    for (const child of children) {
      if (child === null || child === undefined) continue;
      parent.appendChild(child);
    }
    return parent;
  }

  function makeIconSpan(ctx, kind, n = null, extraClass = null) {
    const { WALL_CHAR } = ctx.consts;

    if (kind === "wall") {
      return makeEl("span", extraClass ? `wallIcon ${extraClass}` : "wallIcon", WALL_CHAR);
    }
    if (kind === "flag") {
      return makeEl("span", extraClass ? `flagIcon ${extraClass}` : "flagIcon", "⚑");
    }
    if (kind === "blank") {
      return makeEl("span", extraClass ? `blankIcon ${extraClass}` : "blankIcon", "\u00A0");
    }
    if (kind === "num") {
      return makeEl("span", extraClass ? `num${n} ${extraClass}` : `num${n}`, String(n));
    }
    return makeEl("span", extraClass, "");
  }

  function showToast(ctx, build) {
    const { toastEl } = ctx.els;
    clearEl(toastEl);
    if (typeof build === "function") build(toastEl);
    toastEl.classList.add("show");
  }

  function hideToast(ctx) {
    const { toastEl } = ctx.els;
    toastEl.classList.remove("show");
    clearEl(toastEl);
  }

  function clearContradictionsUI(ctx) {
    const { boardEl } = ctx.els;
    for (const el of boardEl.querySelectorAll(".cell.contradiction")) {
      el.classList.remove("contradiction");
    }
  }

  function getCellEl(ctx, r, c) {
    return ctx.els.boardEl.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`);
  }

  function hideProbTip(ctx) {
    const { probTipEl } = ctx.els;
    probTipEl.classList.remove("show", "arrowUp", "arrowDown");
    probTipEl.setAttribute("aria-hidden", "true");
    clearEl(probTipEl);
  }

  function showProbTipForCell(ctx, cellEl, titleText, subText) {
    const { probTipEl } = ctx.els;
    clearEl(probTipEl);

    append(
      probTipEl,
      makeEl("b", null, titleText),
      makeEl("div", "muted", subText)
    );

    probTipEl.classList.add("show");
    probTipEl.setAttribute("aria-hidden", "false");

    const cellRect = cellEl.getBoundingClientRect();
    const tipRect = probTipEl.getBoundingClientRect();

    let left = cellRect.left + cellRect.width / 2 - tipRect.width / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - tipRect.width - 8));

    let top = cellRect.top - tipRect.height - 12;
    let arrowClass = "arrowDown";
    if (top < 8) {
      top = cellRect.bottom + 12;
      arrowClass = "arrowUp";
    }

    const arrowX = cellRect.left + cellRect.width / 2 - left;
    probTipEl.style.setProperty("--arrow-x", `${Math.round(arrowX)}px`);
    probTipEl.classList.remove("arrowUp", "arrowDown");
    probTipEl.classList.add(arrowClass);
    probTipEl.style.left = `${Math.round(left)}px`;
    probTipEl.style.top = `${Math.round(top)}px`;
  }

  function setCellVisual(ctx, cellEl, cellState) {
    const { CellState } = ctx.consts;

    if (cellEl.dataset.hintMine === "1") delete cellEl.dataset.hintMine;

    cellEl.dataset.state = cellState.state;
    cellEl.classList.remove("suggest-safe", "suggest-mine", "suggest-reco");
    clearEl(cellEl);

    if (cellState.state === CellState.WALL) {
      cellEl.appendChild(makeIconSpan(ctx, "wall"));
      return;
    }
    if (cellState.state === CellState.FLAG) {
      cellEl.appendChild(makeIconSpan(ctx, "flag"));
      return;
    }
    if (cellState.num === 0) {
      cellEl.appendChild(makeIconSpan(ctx, "blank"));
      return;
    }
    cellEl.appendChild(makeIconSpan(ctx, "num", cellState.num));
  }

  function renderAxes(ctx) {
    const { axisXEl, axisYEl } = ctx.els;
    const { rows, cols } = ctx.state;

    axisXEl.style.gridTemplateColumns = `repeat(${cols}, var(--cell))`;
    clearEl(axisXEl);
    for (let c = 1; c <= cols; c++) {
      axisXEl.appendChild(makeEl("div", "axisCellX", String(c)));
    }

    axisYEl.style.gridTemplateRows = `repeat(${rows}, var(--cell))`;
    clearEl(axisYEl);
    for (let r = 0; r < rows; r++) {
      axisYEl.appendChild(makeEl("div", "axisCellY", ctx.utils.toKanji(rows - r)));
    }
  }

  function makeCurrentToolNode(ctx, tool) {
    if (tool.kind === "num") {
      return tool.num === 0 ? makeEl("span", "blankIcon", "□") : makeIconSpan(ctx, "num", tool.num);
    }
    if (tool.kind === "flag") return makeIconSpan(ctx, "flag");
    return makeIconSpan(ctx, "wall");
  }

  function updateCurrentToolPill(ctx) {
    const { currentToolPillEl } = ctx.els;
    clearEl(currentToolPillEl);
    currentToolPillEl.appendChild(document.createTextNode("現在："));
    currentToolPillEl.appendChild(makeCurrentToolNode(ctx, ctx.state.currentTool));
  }

  function makeToolButtonLabel(ctx, def) {
    if (def.id === "wall") return makeIconSpan(ctx, "wall");
    if (def.id === "flag") return makeIconSpan(ctx, "flag");
    if (def.id === "n0") return makeEl("span", "blankIcon", "□");
    if (def.id.startsWith("n")) return makeIconSpan(ctx, "num", Number(def.id.slice(1)));
    return makeEl("span", null, def.label);
  }

  function renderTools(ctx) {
    const { toolGridEl, inputModeEl } = ctx.els;
    const { TOOL_DEFS } = ctx.consts;
    const { currentTool } = ctx.state;

    clearEl(toolGridEl);

    for (const def of TOOL_DEFS) {
      const btn = makeEl("div", "toolBtn");
      if (IWABA.logic.toolEquals(def.tool, currentTool)) btn.classList.add("active");

      append(btn, makeToolButtonLabel(ctx, def));
      if (!isMobileLikeDevice()) {
        btn.appendChild(makeEl("small", null, def.sub));
      }

      btn.addEventListener("click", () => {
        inputModeEl.value = "paint";
        renderStageInfo(ctx);
        updateModeUI(ctx);
        IWABA.logic.setCurrentTool(ctx, def.tool);
      });

      toolGridEl.appendChild(btn);
    }
  }

  function updateHistoryButtonLabels(ctx) {
    const { btnUndo, btnRedo } = ctx.els;
    if (!btnUndo || !btnRedo) return;

    if (isMobileLikeDevice()) {
      btnUndo.textContent = "元に戻す";
      btnRedo.textContent = "やり直し";
      return;
    }

    btnUndo.textContent = "元に戻す（Ctrl+Z）";
    btnRedo.textContent = "やり直し（Ctrl+Y）";
  }

  function makeInfoRow(label, valueNode) {
    const wrap = makeEl("div", "kvRow");
    const dt = makeEl("dt", null, label);
    const dd = makeEl("dd");
    dd.appendChild(valueNode);
    append(wrap, dt, dd);
    return wrap;
  }

  function renderStageInfo(ctx) {
    const { infoEl, difficultyEl, inputModeEl } = ctx.els;
    const { STAGES } = ctx.consts;

    clearEl(infoEl);

    const stage = STAGES[difficultyEl.value] ?? STAGES.beginner;
    const modeLabel = inputModeEl.value === "paint" ? "ペイント" : "サイクル";

    const block = makeEl("div", "infoBlock");
    const title = makeEl("b", null, "設定");
    const list = makeEl("dl", "kv");

    append(
      list,
      makeInfoRow("難易度", makeEl("b", null, stage.label)),
      makeInfoRow("マップサイズ", makeEl("b", null, `${stage.size.rows} x ${stage.size.cols}`)),
      makeInfoRow("入力モード", makeEl("b", null, modeLabel))
    );

    append(block, title, list);
    infoEl.appendChild(block);
  }

  function matchesMedia(query) {
    return typeof window.matchMedia === "function" && window.matchMedia(query).matches;
  }

  function isMobileLikeDevice() {
    return matchesMedia("(max-width: 820px)") || matchesMedia("(pointer: coarse)");
  }

  function getOpsItems(inputMode, isMobile) {
    if (inputMode === "cycle") {
      if (isMobile) {
        return [
          "タップ：タイルを進める（壁→⚑→無地(0)→1→…→8→壁）",
          "長押し：地雷確率を表示（周囲に床がある壁マス）",
        ];
      }
      return [
        "左クリック：タイルを進める（壁→⚑→無地(0)→1→…→8→壁）",
        "右クリック：タイルを戻す（壁→8→7→6→…→⚑→壁）",
        "キーボード：0-8で数字入力／Fで⚑／W or ?で壁",
        "マウスオーバー：地雷確率を表示（周囲に床がある壁マス）",
      ];
    }

    if (isMobile) {
      return [
        "タップ/ドラッグ：選択タイルで塗る",
        "長押し：地雷確率を表示（周囲に床がある壁マス）",
      ];
    }

    return [
      "左クリック/左ドラッグ：選択タイルで塗る",
      "右クリック/右ドラッグ：壁→⚑→無地(0)→壁→…",
      "ホイール, カーソルキー（↑↓←→）：タイル切替",
      "キーボード：0-8で床／Fで⚑／W or ?で壁",
      "マウスオーバー：地雷確率を表示（周囲に床がある壁マス）",
    ];
  }

  function renderOpsInfo(ctx) {
    const { opsInfoEl, inputModeEl } = ctx.els;
    clearEl(opsInfoEl);

    const isCycle = inputModeEl.value === "cycle";
    const isMobile = isMobileLikeDevice();
    const items = getOpsItems(inputModeEl.value, isMobile);

    const title = makeEl("b", null, isCycle ? "操作方法（サイクル）" : "操作方法（ペイント）");
    const list = makeEl("ul", "opsList");

    for (const item of items) {
      list.appendChild(makeEl("li", null, item));
    }

    append(opsInfoEl, title, list);
  }

  function setInputModeData(ctx) {
    try {
      const mode = ctx?.els?.inputModeEl?.value || "paint";
      document.documentElement.dataset.inputMode = mode;
    } catch (_) {
    }
  }

  function syncResponsiveBoard(ctx) {
    const root = document.documentElement;
    const scroller = ctx?.els?.boardScrollerEl;
    if (!root || !scroller) return;

    if (!isMobileLikeDevice()) {
      root.style.removeProperty("--cell");
      root.style.removeProperty("--gap");
      root.style.removeProperty("--axisW");
      root.style.removeProperty("--axisH");
      return;
    }

    root.style.setProperty("--gap", "2px");
    root.style.setProperty("--axisW", "22px");
    root.style.setProperty("--axisH", "18px");

    const computed = getComputedStyle(scroller);
    const padL = parseFloat(computed.paddingLeft) || 0;
    const padR = parseFloat(computed.paddingRight) || 0;
    const availableWidth = scroller.clientWidth - padL - padR;

    const rootStyle = getComputedStyle(root);
    const gap = parseFloat(rootStyle.getPropertyValue("--gap")) || 2;
    const axisW = parseFloat(rootStyle.getPropertyValue("--axisW")) || 22;
    const cols = Math.max(1, Number(ctx?.state?.cols || 1));

    const cellWidth = (availableWidth - axisW - gap - (cols - 1) * gap) / cols;
    if (!Number.isFinite(cellWidth)) return;

    const cell = Math.max(12, Math.min(34, Math.floor(cellWidth)));
    root.style.setProperty("--cell", `${cell}px`);
  }

  function syncMobilePaintControls(ctx) {
    const root = document.documentElement;
    const {
      toolboxControlsEl,
      mobilePaintControlsEl,
      toolboxEl,
      toolMetaEl,
      opsInfoEl,
      inputModeEl,
      btnReset,
    } = ctx.els;

    if (!root || !toolboxControlsEl || !mobilePaintControlsEl || !toolboxEl || !toolMetaEl || !opsInfoEl || !inputModeEl || !btnReset) {
      return;
    }

    const toolboxHeadEl = toolboxEl.querySelector(".toolboxHead");
    const historyBtnsEl = toolboxControlsEl.querySelector("#historyBtns");
    const panelEl = toolboxEl.closest(".panel");
    const resetBtnsEl = btnReset.closest(".btns");
    if (!toolboxHeadEl || !historyBtnsEl || !panelEl || !resetBtnsEl) return;

    const shouldMove = isMobileLikeDevice() && (inputModeEl.value === "paint" || inputModeEl.value === "cycle");
    root.dataset.mobileUi = shouldMove ? "1" : "0";

    if (shouldMove) {
      if (toolMetaEl.parentElement !== mobilePaintControlsEl) {
        mobilePaintControlsEl.insertBefore(toolMetaEl, mobilePaintControlsEl.firstChild || null);
      }
      if (toolboxControlsEl.parentElement !== mobilePaintControlsEl) {
        mobilePaintControlsEl.appendChild(toolboxControlsEl);
      }
      if (!resetBtnsEl.classList.contains("mobileResetBtns")) {
        resetBtnsEl.classList.add("mobileResetBtns");
      }
      if (resetBtnsEl.parentElement !== toolboxControlsEl || resetBtnsEl.previousElementSibling !== historyBtnsEl) {
        toolboxControlsEl.appendChild(resetBtnsEl);
      }
      return;
    }

    if (toolMetaEl.parentElement !== toolboxHeadEl) toolboxHeadEl.appendChild(toolMetaEl);
    if (toolboxControlsEl.parentElement !== toolboxEl) toolboxEl.insertBefore(toolboxControlsEl, opsInfoEl);
    if (resetBtnsEl.classList.contains("mobileResetBtns")) resetBtnsEl.classList.remove("mobileResetBtns");
    if (resetBtnsEl.parentElement !== panelEl) panelEl.appendChild(resetBtnsEl);
  }

  function updateModeUI(ctx) {
    const { toolGridEl, toolMetaEl, inputModeEl } = ctx.els;
    const isCycle = inputModeEl.value === "cycle";

    toolGridEl.style.display = isCycle ? "none" : "";
    toolMetaEl.style.display = isCycle ? "none" : "";

    setInputModeData(ctx);
    updateHistoryButtonLabels(ctx);
    syncMobilePaintControls(ctx);
    syncResponsiveBoard(ctx);
    renderOpsInfo(ctx);
  }

  function syncSolveButtonWidth(ctx) {
    const { btnSolve, btnReset } = ctx.els;
    if (!btnSolve || !btnReset) return;

    const width = Math.round(btnReset.getBoundingClientRect().width);
    if (width > 0) btnSolve.style.width = `${width}px`;
  }

  function clearSuggestVisualsOnly(ctx) {
    const { boardEl } = ctx.els;
    const { grid } = ctx.state;

    hideProbTip(ctx);
    for (const el of boardEl.querySelectorAll(".cell")) {
      const hadContradiction = el.classList.contains("contradiction");

      if (el.dataset.hintMine === "1") {
        const r = Number(el.dataset.r);
        const c = Number(el.dataset.c);
        setCellVisual(ctx, el, grid[r][c]);
        delete el.dataset.hintMine;
        if (hadContradiction) el.classList.add("contradiction");
      }

      el.classList.remove("suggest-safe", "suggest-mine", "suggest-reco");
    }
  }

  function applySuggestUI(ctx, minesSet, safesSet, recosSet) {
    const { boardEl } = ctx.els;
    const { grid } = ctx.state;
    const { CellState } = ctx.consts;

    clearSuggestVisualsOnly(ctx);

    for (const el of boardEl.querySelectorAll(".cell")) {
      const r = Number(el.dataset.r);
      const c = Number(el.dataset.c);
      const key = `${r},${c}`;

      if (recosSet && recosSet.has(key)) el.classList.add("suggest-reco");
      if (safesSet && safesSet.has(key)) el.classList.add("suggest-safe");

      if (minesSet && minesSet.has(key)) {
        el.classList.add("suggest-mine");
        if (grid[r][c].state === CellState.WALL) {
          el.dataset.hintMine = "1";
          clearEl(el);
          el.appendChild(makeIconSpan(ctx, "flag", null, "mineFlagIcon"));
        }
      }
    }
  }

  function renderBoard(ctx) {
    const { boardEl } = ctx.els;
    const { rows, cols, grid } = ctx.state;

    renderAxes(ctx);
    clearContradictionsUI(ctx);
    hideToast(ctx);
    hideProbTip(ctx);
    syncResponsiveBoard(ctx);

    boardEl.style.gridTemplateColumns = `repeat(${cols}, var(--cell))`;
    clearEl(boardEl);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = document.createElement("div");
        cell.className = "cell";
        cell.tabIndex = 0;
        cell.dataset.r = String(r);
        cell.dataset.c = String(c);
        setCellVisual(ctx, cell, grid[r][c]);
        boardEl.appendChild(cell);
      }
    }
  }

  IWABA.view = {
    clearEl,
    makeEl,
    append,
    makeIconSpan,
    showToast,
    hideToast,
    clearContradictionsUI,
    getCellEl,
    hideProbTip,
    showProbTipForCell,
    setCellVisual,
    renderAxes,
    updateCurrentToolPill,
    renderTools,
    renderStageInfo,
    renderOpsInfo,
    updateHistoryButtonLabels,
    updateModeUI,
    syncSolveButtonWidth,
    clearSuggestVisualsOnly,
    applySuggestUI,
    syncResponsiveBoard,
    syncMobilePaintControls,
    renderBoard,
  };
})();
