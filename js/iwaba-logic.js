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

  function findToolIndex(ctx, t) {
    const { TOOL_DEFS } = ctx.consts;
    for (let i = 0; i < TOOL_DEFS.length; i++) {
      if (toolEquals(TOOL_DEFS[i].tool, t)) return i;
    }
    return -1;
  }

  function syncToolCursorFromCurrent(ctx) {
    const idx = findToolIndex(ctx, ctx.state.currentTool);
    if (idx >= 0) ctx.state.toolCursorIndex = idx;
  }

  function setCurrentTool(ctx, t) {
    ctx.state.currentTool = t;
    syncToolCursorFromCurrent(ctx);
    IWABA.view.updateCurrentToolPill(ctx);
    IWABA.view.renderTools(ctx);
  }

  function bumpTool(ctx, delta) {
    const { TOOL_DEFS, TOOL_CYCLE_LEN } = ctx.consts;
    const base = findToolIndex(ctx, ctx.state.currentTool);
    const i = base >= 0 ? base : 0;
    const idx = (((i + delta) % TOOL_CYCLE_LEN) + TOOL_CYCLE_LEN) % TOOL_CYCLE_LEN;
    setCurrentTool(ctx, TOOL_DEFS[idx].tool);
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
      difficulty: ctx.state.difficulty,
      rows: ctx.state.rows,
      cols: ctx.state.cols,
      grid: cloneGrid(ctx.state.grid),
    };
  }

  function isSameSnapshot(a, b) {
    if (!a || !b) return false;
    if (a.difficulty !== b.difficulty) return false;
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
    if (snap.difficulty) {
      ctx.state.difficulty = snap.difficulty;
      if (ctx.els.difficultyEl) ctx.els.difficultyEl.value = snap.difficulty;
    }
    ctx.state.rows = snap.rows;
    ctx.state.cols = snap.cols;
    ctx.state.grid = cloneGrid(snap.grid);

    resetAnalysisUI(ctx);

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

  function resetSuggestionState(ctx) {
    ctx.state.lastSuggestMines = new Set();
    ctx.state.lastSuggestSafes = new Set();
    ctx.state.lastSuggestRecos = new Set();
  }

  function resetAnalysisUI(ctx) {
    ctx.state.hasContradictionNow = false;
    resetSuggestionState(ctx);
    IWABA.view.clearContradictionsUI(ctx);
    IWABA.view.hideToast(ctx);
    IWABA.view.hideProbTip(ctx);
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

  function applyDefaultStairs(ctx) {
    const { CellState } = ctx.consts;
    const { rows, cols, grid } = ctx.state;
    if (rows < 2 || cols < 2) return;
    const r = 1;
    const c = cols - 2;
    if (grid[r][c].state !== CellState.WALL) return;
    grid[r][c].state = CellState.STAIRS;
    grid[r][c].num = 0;
  }

  function initGrid(ctx) {
    const { CellState } = ctx.consts;
    const { rows, cols } = ctx.state;

    ctx.state.grid = Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => ({ state: CellState.WALL, num: 0 }))
    );

    applyStartCellBlank(ctx);
    applyDefaultStairs(ctx);

    resetAnalysisUI(ctx);
    updateHistoryButtons(ctx);
  }

  function markDirty(ctx) {
    resetAnalysisUI(ctx);
    IWABA.view.clearSuggestVisualsOnly(ctx);
  }

  function setWall(ctx, st) {
    const { CellState } = ctx.consts;
    st.state = CellState.WALL;
    st.num = 0;
  }

  function setFlag(ctx, st) {
    const { CellState } = ctx.consts;
    st.state = CellState.FLAG;
    st.num = 0;
  }

  function setRevealed(ctx, st, num = 0) {
    const { CellState } = ctx.consts;
    st.state = CellState.REVEALED;
    st.num = num;
  }

  function setStairs(ctx, r, c) {
    const { CellState } = ctx.consts;
    const { grid } = ctx.state;
    grid.forEach((row, rr) => row.forEach((st, cc) => {
      if (st.state !== CellState.STAIRS || (rr === r && cc === c)) return;
      setWall(ctx, st);
      const el = IWABA.view.getCellEl(ctx, rr, cc);
      if (el) IWABA.view.setCellVisual(ctx, el, st);
    }));
    grid[r][c].state = CellState.STAIRS;
    grid[r][c].num = 0;
  }

  function hasStairs(ctx) {
    const { CellState } = ctx.consts;
    return ctx.state.grid.some((row) => row.some((st) => st.state === CellState.STAIRS));
  }

  function isSameCellState(st, state, num) {
    return st.state === state && st.num === num;
  }

  function applyTool(ctx, r, c, tool) {
    const { CellState } = ctx.consts;

    const st = ctx.state.grid[r][c];
    if (tool.kind === "wall") {
      if (isSameCellState(st, CellState.WALL, 0)) return false;
      markDirty(ctx);
      setWall(ctx, st);
      return true;
    }
    if (tool.kind === "flag") {
      if (isSameCellState(st, CellState.FLAG, 0)) return false;
      markDirty(ctx);
      setFlag(ctx, st);
      return true;
    }
    if (tool.kind === "stairs") {
      if (isSameCellState(st, CellState.STAIRS, 0)) return false;
      markDirty(ctx);
      setStairs(ctx, r, c);
      return true;
    }
    if (isSameCellState(st, CellState.REVEALED, tool.num)) return false;
    markDirty(ctx);
    setRevealed(ctx, st, tool.num);
    return true;
  }

  function cycleCell(ctx, r, c) {
    const { CellState } = ctx.consts;
    markDirty(ctx);

    const st = ctx.state.grid[r][c];
    if (st.state === CellState.WALL) {
      setFlag(ctx, st);
      return true;
    }
    if (st.state === CellState.FLAG) {
      setRevealed(ctx, st, 0);
      return true;
    }
    if (st.state === CellState.STAIRS) {
      setWall(ctx, st);
      return true;
    }
    if (st.num < 8) st.num++;
    else if (hasStairs(ctx)) setWall(ctx, st);
    else setStairs(ctx, r, c);
    return true;
  }

  function cycleCellBackward(ctx, r, c) {
    const { CellState } = ctx.consts;
    markDirty(ctx);

    const st = ctx.state.grid[r][c];
    if (st.state === CellState.WALL) {
      if (hasStairs(ctx)) setRevealed(ctx, st, 8);
      else setStairs(ctx, r, c);
      return true;
    }
    if (st.state === CellState.STAIRS) {
      setRevealed(ctx, st, 8);
      return true;
    }
    if (st.state === CellState.FLAG) {
      setWall(ctx, st);
      return true;
    }
    if (st.num > 0) {
      st.num--;
      return true;
    }
    setFlag(ctx, st);
    return true;
  }

  function rightPaintStamp(ctx, r, c, stamp) {
    const { CellState } = ctx.consts;

    const st = ctx.state.grid[r][c];

    if (stamp === "wall") {
      if (isSameCellState(st, CellState.WALL, 0)) return false;
      markDirty(ctx);
      setWall(ctx, st);
      return true;
    }
    if (stamp === "blank") {
      if (isSameCellState(st, CellState.REVEALED, 0)) return false;
      markDirty(ctx);
      setRevealed(ctx, st, 0);
      return true;
    }
    if (isSameCellState(st, CellState.FLAG, 0)) return false;
    markDirty(ctx);
    setFlag(ctx, st);
    return true;
  }


  function validateContradictions(ctx, extraMines = null, extraSafes = null) {
    return ctx.solver.validateContradictions(ctx.state.grid, ctx.state.rows, ctx.state.cols, extraMines, extraSafes);
  }

  const sortCells = (cells) => cells.sort(([r1, c1], [r2, c2]) => r1 - r2 || c1 - c2);

  function clueLabel(ctx, r, c, n) {
    const p = cellCoord(ctx, r, c);
    return n === 0 ? `${p} の無地（0）` : `${p} の「${n}」`;
  }

  function cellsWith(ctx, cells, particle, maxNamed = 4) {
    const names = cells.slice(0, maxNamed).map(([r, c]) => cellCoord(ctx, r, c)).join("・");
    if (cells.length <= maxNamed) return `${names} ${particle}`;
    return `${names} ほか ${cells.length - maxNamed} マス${particle}`;
  }

  function sourcesPhrase(ctx, sources) {
    if (sources.length === 0) return "推論で ";
    const labels = sources.slice(0, 2).map(([r, c]) => clueLabel(ctx, r, c, ctx.state.grid[r][c].num));
    return `${labels.join("と ")}${sources.length > 2 ? "など" : ""}から `;
  }

  function sourceClues(ctx, item, reasons) {
    const inferred = item.kind === "tooManyFlags" ? item.inferredMines : item.inferredSafes;
    const sources = new Map();
    for (const [r, c] of inferred) {
      const src = reasons?.get(ctx.utils.cellKey(r, c));
      if (!src || (src[0] === item.r && src[1] === item.c)) continue;
      sources.set(ctx.utils.cellKey(src[0], src[1]), src);
    }
    return sortCells([...sources.values()]);
  }

  function formatTooManyMines(ctx, item, clue) {
    if (item.inferredMines.length === 0) {
      return `${clue}の周りに地雷が ${item.flags} 個あり、多すぎます。`;
    }
    const cause = `${sourcesPhrase(ctx, item.sources)}${cellsWith(ctx, item.inferredMines, "が")}地雷確定になりますが、`;
    const total = item.flags > 0 ? `、入力した地雷 ${item.flags} 個と合わせて ${item.flagged} 個` : ` ${item.flagged} 個`;
    return `${cause}そうすると ${clue}の周りの地雷が${total}になり、合いません。`;
  }

  function formatTooFewWalls(ctx, item, clue) {
    const max = item.flagged + item.walls;
    if (item.inferredSafes.length > 0) {
      const cause = `${sourcesPhrase(ctx, item.sources)}${cellsWith(ctx, item.inferredSafes, "が")}安全確定になりますが、`;
      return `${cause}そうすると ${clue}の周りの地雷は多くても ${max} 個になり、足りません。`;
    }
    if (item.inferredMines.length > 0) return `${clue}の周りの地雷は多くても ${max} 個になり、足りません。`;
    if (item.flags === 0) {
      return item.walls === 0
        ? `${clue}の周りに、地雷を置ける壁がありません。`
        : `${clue}の周りには、地雷を置ける壁が ${item.walls} マスしかありません。`;
    }
    return item.walls === 0
      ? `${clue}の周りには地雷が ${item.flags} 個あるだけで、ほかに地雷を置ける壁がありません。`
      : `${clue}の周りには、地雷が ${item.flags} 個と、地雷を置ける壁が ${item.walls} マスしかなく、合わせても ${max} 個にしかなりません。`;
  }

  function formatJointlyImpossible(ctx, item) {
    const { pair } = item;
    if (!pair) {
      return `${cellsWith(ctx, item.cells, "の")}数字をすべて満たす地雷の置き方がありません。どれかの数字が間違っている可能性があります。`;
    }
    const low = pair.atMost;
    const high = pair.atLeast;
    const lowSide = low.max === 0 ? "地雷は 1 個も入らず" : `地雷は多くても ${low.max} 個`;
    return `${clueLabel(ctx, low.r, low.c, low.n)}と ${clueLabel(ctx, high.r, high.c, high.n)}の周りで共通する壁 ${pair.shared} マスには、`
      + `${cellCoord(ctx, low.r, low.c)} から見ると${lowSide}、`
      + `${cellCoord(ctx, high.r, high.c)} から見ると少なくとも ${high.min} 個必要で、両立しません。`;
  }

  function formatContradictionMessage(ctx, item) {
    if (item.kind === "jointlyImpossible") return formatJointlyImpossible(ctx, item);
    const clue = clueLabel(ctx, item.r, item.c, item.n);
    return item.kind === "tooManyFlags" ? formatTooManyMines(ctx, item, clue) : formatTooFewWalls(ctx, item, clue);
  }

  function framedCells(item) {
    if (item.kind !== "jointlyImpossible") return [[item.r, item.c], ...item.sources];
    const { pair } = item;
    return pair ? [[pair.atMost.r, pair.atMost.c], [pair.atLeast.r, pair.atLeast.c]] : item.cells;
  }

  function renderContradictionsUI(ctx, extraMines = null, extraSafes = null, { reasons = null, jointGroups = [] } = {}) {
    IWABA.view.clearContradictionsUI(ctx);

    const items = Array.from(validateContradictions(ctx, extraMines, extraSafes), (it) => {
      const item = { ...it, inferredMines: Array.from(it.inferredMines), inferredSafes: Array.from(it.inferredSafes) };
      item.sources = sourceClues(ctx, item, reasons);
      return item;
    });
    for (const clues of jointGroups) {
      const cells = sortCells(Array.from(clues, (key) => key.split(",").map(Number)));
      const pair = ctx.solver.explainJointContradiction(ctx.state.grid, ctx.state.rows, ctx.state.cols, Array.from(clues));
      items.push({ kind: "jointlyImpossible", cells, pair });
    }
    if (items.length === 0) {
      IWABA.view.hideToast(ctx);
      return false;
    }

    for (const item of items) {
      for (const [r, c] of framedCells(item)) {
        const el = IWABA.view.getCellEl(ctx, r, c);
        if (el) el.classList.add("contradiction");
      }
    }

    const maxVisible = 4;
    const top = items.slice(0, maxVisible);

    IWABA.view.showToast(ctx, (root) => {
      const closeBtn = IWABA.view.makeEl("button", "toastClose");
      closeBtn.type = "button";
      closeBtn.setAttribute("aria-label", "close");
      closeBtn.textContent = "×";

      const title = IWABA.view.makeEl("b", null, "入力に矛盾があります");

      const ul = IWABA.view.makeEl("ul", "toastList");
      for (const item of top) {
        ul.appendChild(IWABA.view.makeEl("li", null, formatContradictionMessage(ctx, item)));
      }

      IWABA.view.append(root, closeBtn, title, ul);

      if (items.length > top.length) {
        root.appendChild(IWABA.view.makeEl("div", "muted mt6", `ほかに ${items.length - top.length} 件の矛盾があります。`));
      }
      root.appendChild(
        IWABA.view.makeEl(
          "div",
          "muted mt6",
          "赤枠の数字とその周りを確認してください。よくある原因：数字の打ち間違い、地雷の置き間違い、床と壁の取り違え。"
        )
      );
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

  function probabilityOptions(ctx) {
    const { STAGES, mineOdds } = ctx.consts;
    return { mineOdds: mineOdds(STAGES[ctx.state.difficulty] ?? STAGES.beginner) };
  }

  function computeMineProbabilityForWall(ctx, targetR, targetC, knownMines, knownSafes) {
    return ctx.solver.computeMineProbabilityForWall(
      ctx.state.grid, ctx.state.rows, ctx.state.cols,
      targetR, targetC, knownMines, knownSafes, probabilityOptions(ctx)
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
    } else if (result.kind === "unavailable") {
      IWABA.view.showProbTipForCell(
        ctx, cellEl, "地雷確率：算出できません",
        "地雷配置の組み合わせが多いため、計算を完了できませんでした。"
      );
    }
  }

  function clearHints(ctx) {
    IWABA.view.hideProbTip(ctx);
    resetSuggestionState(ctx);
    IWABA.view.clearSuggestVisualsOnly(ctx);
  }

  const PROB_TOTAL_BUDGET_MS = 80;

  function commitSuggestions(ctx, mines, safes, recos) {
    ctx.state.lastSuggestMines = new Set(mines);
    ctx.state.lastSuggestSafes = new Set(safes);
    ctx.state.lastSuggestRecos = new Set(recos);
    IWABA.view.applySuggestUI(ctx, ctx.state.lastSuggestMines, ctx.state.lastSuggestSafes, ctx.state.lastSuggestRecos);
  }

  function propagateForcedCells(ctx, forcedMines, forcedSafes, reasons = null) {
    const { CellState } = ctx.consts;
    let anyChange = false;

    let changed = true;
    while (changed) {
      changed = false;

      for (let r = 0; r < ctx.state.rows; r++) {
        for (let c = 0; c < ctx.state.cols; c++) {
          const st = ctx.state.grid[r][c];
          if (st.state !== CellState.REVEALED) continue;

          const n = st.num;
          const { flagged: mines, unknownWalls } = ctx.solver.classifyNeighbors(
            ctx.state.grid, r, c, ctx.state.rows, ctx.state.cols, forcedMines, forcedSafes
          );

          const need = n - mines;

          if (need < 0 || need > unknownWalls.length) return "contradiction";

          if (need === 0 && unknownWalls.length > 0) {
            for (const [rr, cc] of unknownWalls) {
              const key = ctx.utils.cellKey(rr, cc);
              if (!forcedSafes.has(key)) {
                forcedSafes.add(key);
                reasons?.set(key, [r, c]);
                changed = true;
                anyChange = true;
              }
            }
          } else if (need === unknownWalls.length && need > 0) {
            for (const [rr, cc] of unknownWalls) {
              const key = ctx.utils.cellKey(rr, cc);
              if (!forcedMines.has(key)) {
                forcedMines.add(key);
                reasons?.set(key, [r, c]);
                changed = true;
                anyChange = true;
              }
            }
          }
        }
      }
    }

    return anyChange;
  }

  function refineByProbability(ctx, forcedMines, forcedSafes) {
    const startBudget = performance.now();
    let anyChange = false;
    const contradictions = [];
    const seenContradictions = new Set();
    const knownMines = new Set(forcedMines);
    const knownSafes = new Set(forcedSafes);

    const cand = ctx.solver.collectCandidateWalls(
      ctx.state.grid, ctx.state.rows, ctx.state.cols,
      ctx.utils.neighbors, forcedMines, forcedSafes
    );

    for (const [wr, wc] of cand) {
      if (performance.now() - startBudget > PROB_TOTAL_BUDGET_MS) break;

      const key = ctx.utils.cellKey(wr, wc);
      if (forcedMines.has(key) || forcedSafes.has(key)) continue;

      const res = computeMineProbabilityForWall(ctx, wr, wc, knownMines, knownSafes);
      if (res?.kind === "contradiction") {
        if (!seenContradictions.has(res)) {
          seenContradictions.add(res);
          contradictions.push(res.clues);
        }
        continue;
      }
      if (!res || res.kind !== "exact") continue;

      if (res.mine === 0) {
        forcedSafes.add(key);
        anyChange = true;
      } else if (res.mine === res.total) {
        forcedMines.add(key);
        anyChange = true;
      }
    }

    return { changed: anyChange, contradictions };
  }

  function solveDeterministic(ctx) {
    IWABA.view.clearContradictionsUI(ctx);
    IWABA.view.hideToast(ctx);
    IWABA.view.hideProbTip(ctx);

    ctx.state.hasContradictionNow = renderContradictionsUI(ctx);
    if (ctx.state.hasContradictionNow) return;

    const forcedMines = new Set();
    const forcedSafes = new Set();
    const reasons = new Map();

    let outerChanged = true;
    while (outerChanged) {
      outerChanged = false;

      const propagated = propagateForcedCells(ctx, forcedMines, forcedSafes, reasons);
      if (propagated === "contradiction") {
        ctx.state.hasContradictionNow = renderContradictionsUI(ctx, forcedMines, forcedSafes, { reasons });
        commitSuggestions(ctx, forcedMines, forcedSafes, new Set());
        return;
      }
      if (propagated) outerChanged = true;

      const refined = refineByProbability(ctx, forcedMines, forcedSafes);
      if (refined.contradictions.length > 0) {
        ctx.state.hasContradictionNow = renderContradictionsUI(
          ctx, forcedMines, forcedSafes, { reasons, jointGroups: refined.contradictions }
        );
        commitSuggestions(ctx, forcedMines, forcedSafes, new Set());
        return;
      }
      if (refined.changed) outerChanged = true;
    }

    ctx.state.hasContradictionNow = renderContradictionsUI(ctx, forcedMines, forcedSafes, { reasons });

    const recos = ctx.state.hasContradictionNow
      ? new Set()
      : ctx.solver.computeRecommendations(
        ctx.state.grid, ctx.state.rows, ctx.state.cols, forcedMines, forcedSafes, probabilityOptions(ctx)
      );

    commitSuggestions(ctx, forcedMines, forcedSafes, recos);
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
