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
    for (const ch of children) {
      if (ch === null || ch === undefined) continue;
      parent.appendChild(ch);
    }
    return parent;
  }

  function makeIconSpan(ctx, kind, n = null, extraClass = null) {
    const { WALL_CHAR } = ctx.consts;
    if (kind === "wall") return makeEl("span", extraClass ? `wallIcon ${extraClass}` : "wallIcon", WALL_CHAR);
    if (kind === "flag") return makeEl("span", extraClass ? `flagIcon ${extraClass}` : "flagIcon", "⚑");
    if (kind === "blank") return makeEl("span", extraClass ? `blankIcon ${extraClass}` : "blankIcon", "\u00A0");
    if (kind === "num") return makeEl("span", extraClass ? `num${n} ${extraClass}` : `num${n}`, String(n));
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
    for (const el of boardEl.querySelectorAll(".cell.contradiction")) el.classList.remove("contradiction");
  }

  function getCellEl(ctx, r, c) {
    const { boardEl } = ctx.els;
    return boardEl.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`);
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

    const b = makeEl("b", null, titleText);
    const sub = makeEl("div", "muted", subText);
    append(probTipEl, b, sub);

    probTipEl.classList.add("show");
    probTipEl.setAttribute("aria-hidden", "false");

    const cellRect = cellEl.getBoundingClientRect();
    const tipRect = probTipEl.getBoundingClientRect();

    let left = cellRect.left + cellRect.width / 2 - tipRect.width / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - tipRect.width - 8));

    let top = cellRect.top - tipRect.height - 12;
    let arrow = "arrowDown";
    if (top < 8) {
      top = cellRect.bottom + 12;
      arrow = "arrowUp";
    }

    const arrowX = cellRect.left + cellRect.width / 2 - left;
    probTipEl.style.setProperty("--arrow-x", `${Math.round(arrowX)}px`);

    probTipEl.classList.remove("arrowUp", "arrowDown");
    probTipEl.classList.add(arrow);

    probTipEl.style.left = `${Math.round(left)}px`;
    probTipEl.style.top = `${Math.round(top)}px`;
  }

  function setCellVisual(ctx, cellEl, st) {
    const { CellState } = ctx.consts;
    if (cellEl.dataset.hintMine === "1") delete cellEl.dataset.hintMine;

    cellEl.dataset.state = st.state;
    cellEl.classList.remove("suggest-safe", "suggest-mine", "suggest-reco");

    clearEl(cellEl);

    if (st.state === CellState.WALL) {
      cellEl.appendChild(makeIconSpan(ctx, "wall"));
      return;
    }
    if (st.state === CellState.FLAG) {
      cellEl.appendChild(makeIconSpan(ctx, "flag"));
      return;
    }
    const n = st.num;
    if (n === 0) cellEl.appendChild(makeIconSpan(ctx, "blank"));
    else cellEl.appendChild(makeIconSpan(ctx, "num", n));
  }

  function renderAxes(ctx) {
    const { axisXEl, axisYEl } = ctx.els;
    const { rows, cols } = ctx.state;

    axisXEl.style.gridTemplateColumns = `repeat(${cols}, var(--cell))`;
    clearEl(axisXEl);
    for (let c = 1; c <= cols; c++) axisXEl.appendChild(makeEl("div", "axisCellX", String(c)));

    axisYEl.style.gridTemplateRows = `repeat(${rows}, var(--cell))`;
    clearEl(axisYEl);
    for (let r = 0; r < rows; r++) axisYEl.appendChild(makeEl("div", "axisCellY", ctx.utils.toKanji(rows - r)));
  }

  function updateCurrentToolPill(ctx) {
    const { currentToolPillEl } = ctx.els;
    const { currentTool } = ctx.state;

    clearEl(currentToolPillEl);
    currentToolPillEl.appendChild(document.createTextNode("現在："));

    if (currentTool.kind === "num") {
      if (currentTool.num === 0) currentToolPillEl.appendChild(makeEl("span", "blankIcon", "□"));
      else currentToolPillEl.appendChild(makeIconSpan(ctx, "num", currentTool.num));
    } else if (currentTool.kind === "flag") {
      currentToolPillEl.appendChild(makeIconSpan(ctx, "flag"));
    } else {
      currentToolPillEl.appendChild(makeIconSpan(ctx, "wall"));
    }
  }

  function renderTools(ctx) {
    const { toolGridEl, inputModeEl } = ctx.els;
    const { TOOL_DEFS } = ctx.consts;
    const { currentTool } = ctx.state;

    clearEl(toolGridEl);

    for (const def of TOOL_DEFS) {
      const btn = makeEl("div", "toolBtn");
      if (IWABA.logic.toolEquals(def.tool, currentTool)) btn.classList.add("active");

      let labelNode = null;
      if (def.id === "wall") labelNode = makeIconSpan(ctx, "wall");
      else if (def.id === "flag") labelNode = makeIconSpan(ctx, "flag");
      else if (def.id === "n0") labelNode = makeEl("span", "blankIcon", "□");
      else if (def.id.startsWith("n")) labelNode = makeIconSpan(ctx, "num", Number(def.id.slice(1)));
      else labelNode = makeEl("span", null, def.label);

      const sub = makeEl("small", null, def.sub);
      append(btn, labelNode, sub);

      btn.addEventListener("click", () => {
        inputModeEl.value = "paint";
        renderStageInfo(ctx);
        updateModeUI(ctx);
        IWABA.logic.setCurrentTool(ctx, def.tool);
      });

      toolGridEl.appendChild(btn);
    }
  }

  function renderStageInfo(ctx) {
    const { infoEl, difficultyEl, inputModeEl } = ctx.els;
    const { STAGES } = ctx.consts;

    clearEl(infoEl);

    const st = STAGES[difficultyEl.value] ?? STAGES.beginner;
    const modeLabel = inputModeEl.value === "paint" ? "ペイント" : "サイクル";

    const block = makeEl("div", "infoBlock");
    const title = makeEl("b", null, "設定");

    const dl = makeEl("dl", "kv");

    function row(label, valueNode) {
      const wrap = makeEl("div", "kvRow");
      const dt = makeEl("dt", null, label);
      const dd = makeEl("dd");
      dd.appendChild(valueNode);
      append(wrap, dt, dd);
      return wrap;
    }

    const v1 = makeEl("b", null, st.label);
    const v2 = makeEl("b", null, `${st.size.rows} x ${st.size.cols}`);
    const v3 = makeEl("b", null, modeLabel);

    append(dl, row("難易度", v1), row("マップサイズ", v2), row("入力モード", v3));
    append(block, title, dl);
    infoEl.appendChild(block);
  }

  function renderOpsInfo(ctx) {
    const { opsInfoEl, inputModeEl } = ctx.els;
    clearEl(opsInfoEl);

    const isCycle = inputModeEl.value === "cycle";

    const title = makeEl("b", null, isCycle ? "操作方法（サイクル）" : "操作方法（ペイント）");
    const ul = makeEl("ul", "opsList");

    const items = isCycle
      ? [
        "左クリック：タイルを進める（壁→⚑→無地(0)→1→…→8→壁）",
        "右クリック：タイルを戻す（壁→8→7→6→…→⚑→壁）",
        "キーボード：0-8で数字入力／Fで⚑／W or ?で壁",
        "マウスオーバー：地雷確率を表示（周囲に床がある壁マス）",
      ]
      : [
        "左クリック/左ドラッグ：選択タイルで塗る",
        "右クリック/右ドラッグ：壁→⚑→無地(0)→壁→…",
        "ホイール, カーソルキー（↑↓←→）：タイル切替",
        "キーボード：0-8で床／Fで⚑／W or ?で壁",
        "マウスオーバー：地雷確率を表示（周囲に床がある壁マス）",
      ];


    for (const t of items) ul.appendChild(makeEl("li", null, t));
    append(opsInfoEl, title, ul);
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

    const mm = (q) => (typeof window.matchMedia === "function" ? window.matchMedia(q).matches : false);
    const coarse = mm("(pointer: coarse)");
    const small = mm("(max-width: 820px)");
    const doFit = coarse || small;

    if (!doFit) {
      root.style.removeProperty("--cell");
      root.style.removeProperty("--gap");
      root.style.removeProperty("--axisW");
      root.style.removeProperty("--axisH");
      return;
    }

    root.style.setProperty("--gap", "2px");
    root.style.setProperty("--axisW", "22px");
    root.style.setProperty("--axisH", "18px");

    const cs = getComputedStyle(scroller);
    const padL = parseFloat(cs.paddingLeft) || 0;
    const padR = parseFloat(cs.paddingRight) || 0;
    const availW = scroller.clientWidth - padL - padR;

    const gap = parseFloat(getComputedStyle(root).getPropertyValue("--gap")) || 2;
    const axisW = parseFloat(getComputedStyle(root).getPropertyValue("--axisW")) || 22;
    const cols = Math.max(1, Number(ctx?.state?.cols || 1));

    const cellW = (availW - axisW - gap - (cols - 1) * gap) / cols;

    if (!Number.isFinite(cellW)) return;

    let cell = Math.floor(cellW);
    cell = Math.max(12, Math.min(34, cell));
    root.style.setProperty("--cell", `${cell}px`);
  }

  function syncMobilePaintControls(ctx) {
    const root = document.documentElement;
    const { toolboxControlsEl, mobilePaintControlsEl, toolboxEl, opsInfoEl, inputModeEl } = ctx.els;
    if (!root || !toolboxControlsEl || !mobilePaintControlsEl || !toolboxEl || !opsInfoEl || !inputModeEl) return;

    const mm = (q) => (typeof window.matchMedia === "function" ? window.matchMedia(q).matches : false);
    const isMobile = mm("(max-width: 820px)") || mm("(pointer: coarse)");
    const shouldMove = isMobile && inputModeEl.value === "paint";

    root.dataset.mobileUi = shouldMove ? "1" : "0";

    if (shouldMove) {
      if (toolboxControlsEl.parentElement !== mobilePaintControlsEl) mobilePaintControlsEl.appendChild(toolboxControlsEl);
      return;
    }

    if (toolboxControlsEl.parentElement !== toolboxEl) {
      toolboxEl.insertBefore(toolboxControlsEl, opsInfoEl);
    }
  }

  function updateModeUI(ctx) {
    const { toolGridEl, toolMetaEl } = ctx.els;
    if (ctx.els.inputModeEl.value === "cycle") {
      toolGridEl.style.display = "none";
      toolMetaEl.style.display = "none";
    } else {
      toolGridEl.style.display = "";
      toolMetaEl.style.display = "";
    }

    setInputModeData(ctx);
    syncMobilePaintControls(ctx);
    syncResponsiveBoard(ctx);
    renderOpsInfo(ctx);
  }

  function syncSolveButtonWidth(ctx) {
    const { btnSolve, btnReset } = ctx.els;
    if (!btnSolve || !btnReset) return;
    const w = Math.round(btnReset.getBoundingClientRect().width);
    if (w > 0) btnSolve.style.width = `${w}px`;
  }

  function clearSuggestVisualsOnly(ctx) {
    const { boardEl } = ctx.els;
    const { grid } = ctx.state;

    hideProbTip(ctx);
    for (const el of boardEl.querySelectorAll(".cell")) {
      const hadCon = el.classList.contains("contradiction");

      if (el.dataset.hintMine === "1") {
        const r = Number(el.dataset.r);
        const c = Number(el.dataset.c);
        setCellVisual(ctx, el, grid[r][c]);
        delete el.dataset.hintMine;
        if (hadCon) el.classList.add("contradiction");
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
    updateModeUI,
    syncSolveButtonWidth,
    clearSuggestVisualsOnly,
    applySuggestUI,
    syncResponsiveBoard,
    syncMobilePaintControls,
    renderBoard,
  };
})();
