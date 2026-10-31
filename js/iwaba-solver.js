/* iwaba-solver.js
 * Pure solving helpers. No DOM access.
 */
(() => {
  window.IWABA = window.IWABA || {};

  const { CellState } = IWABA.constants;
  const { neighbors, orthoNeighbors, cellKey } = IWABA.utils;

  function classifyNeighbors(grid, r, c, rows, cols, knownMines = null, knownSafes = null) {
    let flagged = 0;
    const unknownWalls = [];

    for (const [rr, cc] of neighbors(r, c, rows, cols)) {
      const s2 = grid[rr][cc];
      const key = cellKey(rr, cc);

      const isMine = s2.state === CellState.FLAG || (knownMines && knownMines.has(key));
      const isSafe = knownSafes && knownSafes.has(key);

      if (isMine) flagged++;
      else if (s2.state === CellState.WALL && !isSafe) unknownWalls.push([rr, cc]);
    }

    return { flagged, unknownWalls };
  }

  function validateContradictions(grid, rows, cols, extraMines = null, extraSafes = null) {
    const list = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const st = grid[r][c];
        if (st.state !== CellState.REVEALED) continue;

        const n = st.num;
        const { flagged, unknownWalls } = classifyNeighbors(grid, r, c, rows, cols, extraMines, extraSafes);
        const walls = unknownWalls.length;

        if (flagged > n) {
          list.push({ r, c, kind: "tooManyFlags", n, flagged, walls });
          continue;
        }
        if (flagged + walls < n) {
          list.push({ r, c, kind: "notEnoughCandidates", n, flagged, walls });
        }
      }
    }
    return list;
  }

  const probabilityCaches = new WeakMap();

  function probabilityCache(grid, rows, cols, knownMines, knownSafes) {
    const signature = JSON.stringify([
      rows, cols,
      grid.map((row) => row.map((st) => [st.state, st.num])),
      [...(knownMines || [])].sort(), [...(knownSafes || [])].sort(),
    ]);
    let cached = probabilityCaches.get(grid);
    if (!cached || cached.signature !== signature) {
      cached = { signature, results: new Map() };
      probabilityCaches.set(grid, cached);
    }
    return cached.results;
  }

  function computeMineProbabilityForWall(grid, rows, cols, targetR, targetC, knownMines, knownSafes) {
    const targetKey = cellKey(targetR, targetC);
    if (grid[targetR][targetC].state !== CellState.WALL || knownMines?.has(targetKey) || knownSafes?.has(targetKey)) {
      return null;
    }

    const cached = probabilityCache(grid, rows, cols, knownMines, knownSafes);
    if (cached.has(targetKey)) return cached.get(targetKey);

    const varMap = new Map();
    const vars = [];
    function addVar(r, c) {
      const k = cellKey(r, c);
      if (varMap.has(k)) return varMap.get(k);
      const idx = vars.length;
      varMap.set(k, idx);
      vars.push({ r, c });
      return idx;
    }

    addVar(targetR, targetC);
    const constraints = [];
    const seenClues = new Set();
    let contradictory = false;
    for (let i = 0; i < vars.length; i++) {
      const { r, c } = vars[i];
      for (const [rr, cc] of neighbors(r, c, rows, cols)) {
        if (grid[rr][cc].state !== CellState.REVEALED) continue;
        const key = cellKey(rr, cc);
        if (seenClues.has(key)) continue;
        seenClues.add(key);

        const { flagged, unknownWalls } = classifyNeighbors(grid, rr, cc, rows, cols, knownMines, knownSafes);
        const need = grid[rr][cc].num - flagged;
        if (need < 0 || need > unknownWalls.length) contradictory = true;
        const idxs = unknownWalls.map(([ar, ac]) => addVar(ar, ac));
        constraints.push({ vars: idxs, need });
      }
    }

    const nVars = vars.length;
    const mCons = constraints.length;
    function cacheComponentResult(result) {
      for (const { r, c } of vars) cached.set(cellKey(r, c), result);
      return result;
    }
    if (mCons === 0) return cacheComponentResult(null);
    if (contradictory) return cacheComponentResult({ kind: "contradiction" });

    const deg = Array(nVars).fill(0);
    for (const con of constraints) for (const v of con.vars) deg[v]++;

    const orderOld = [...Array(nVars).keys()].sort((a, b) => deg[b] - deg[a]);
    const oldToNew = Array(nVars).fill(0);
    for (let i = 0; i < nVars; i++) oldToNew[orderOld[i]] = i;

    const consVars = [];
    const consNeed = [];
    for (const con of constraints) {
      const vv = con.vars.map((v) => oldToNew[v]);
      consVars.push(vv);
      consNeed.push(con.need);
    }

    const varToCons = Array.from({ length: nVars }, () => []);
    const consLen = consVars.map((vv) => vv.length);
    for (let j = 0; j < mCons; j++) {
      for (const v of consVars[j]) varToCons[v].push(j);
    }

    const assigned = Array(nVars).fill(-1);
    const sumAssigned = Array(mCons).fill(0);
    const cntAssigned = Array(mCons).fill(0);

    let total = 0;
    const mineCounts = Array(nVars).fill(0);
    let nodes = 0;
    const start = performance.now();
    const NODE_LIMIT = 300000;
    const TIME_LIMIT_MS = 25;

    function feasibleForConstraint(j) {
      const need = consNeed[j];
      const sum = sumAssigned[j];
      const cnt = cntAssigned[j];
      const len = consLen[j];
      const remain = len - cnt;
      const minP = sum;
      const maxP = sum + remain;
      if (need < minP || need > maxP) return false;
      if (remain === 0 && sum !== need) return false;
      return true;
    }

    function dfs(i) {
      nodes++;
      if (nodes > NODE_LIMIT) return "abort";
      if ((nodes & 2047) === 0) {
        if (performance.now() - start > TIME_LIMIT_MS) return "abort";
      }

      if (i === nVars) {
        total++;
        for (let v = 0; v < nVars; v++) mineCounts[v] += assigned[v];
        return;
      }

      for (let val = 0; val <= 1; val++) {
        assigned[i] = val;

        const touched = varToCons[i];
        for (const j of touched) {
          sumAssigned[j] += val;
          cntAssigned[j] += 1;
        }

        let ok = true;
        for (const j of touched) {
          if (!feasibleForConstraint(j)) {
            ok = false;
            break;
          }
        }
        if (ok) {
          const r = dfs(i + 1);
          if (r === "abort") {
            for (const j of touched) {
              sumAssigned[j] -= val;
              cntAssigned[j] -= 1;
            }
            assigned[i] = -1;
            return "abort";
          }
        }

        for (const j of touched) {
          sumAssigned[j] -= val;
          cntAssigned[j] -= 1;
        }
        assigned[i] = -1;
      }
    }

    const res = dfs(0);
    if (res === "abort") {
      return cacheComponentResult({ kind: "unavailable", reason: "limit", vars: nVars, cons: mCons });
    }

    if (total === 0) return cacheComponentResult({ kind: "contradiction" });
    for (let v = 0; v < nVars; v++) {
      const { r, c } = vars[v];
      const mine = mineCounts[oldToNew[v]];
      cached.set(cellKey(r, c), { kind: "exact", p: mine / total, total, mine, vars: nVars, cons: mCons });
    }
    return cached.get(targetKey);
  }

  function hasSafeWallOrthAdjacentToAnyRevealed(grid, rows, cols, safesSet) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (grid[r][c].state !== CellState.REVEALED) continue;
        for (const [wr, wc] of orthoNeighbors(r, c, rows, cols)) {
          const key = cellKey(wr, wc);
          if (safesSet.has(key) && grid[wr][wc].state === CellState.WALL) return true;
        }
      }
    }
    return false;
  }

  function collectCandidateWalls(grid, rows, cols, neighborFn, knownMines, knownSafes) {
    const cand = [];
    const seen = new Set();
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (grid[r][c].state !== CellState.REVEALED) continue;
        for (const [wr, wc] of neighborFn(r, c, rows, cols)) {
          if (grid[wr][wc].state !== CellState.WALL) continue;
          const key = cellKey(wr, wc);
          if (knownMines.has(key) || knownSafes.has(key)) continue;
          if (seen.has(key)) continue;
          seen.add(key);
          cand.push([wr, wc]);
        }
      }
    }
    return cand;
  }

  function computeRecommendations(grid, rows, cols, knownMines, knownSafes) {
    if (hasSafeWallOrthAdjacentToAnyRevealed(grid, rows, cols, knownSafes)) return new Set();

    const cand = collectCandidateWalls(grid, rows, cols, orthoNeighbors, knownMines, knownSafes);
    if (cand.length === 0) return new Set();

    let bestP = Infinity;
    const scored = [];
    const start = performance.now();

    for (const [wr, wc] of cand) {
      if (performance.now() - start > 80) return new Set();
      const key = cellKey(wr, wc);
      const res = computeMineProbabilityForWall(grid, rows, cols, wr, wc, knownMines, knownSafes);
      if (!res || res.kind !== "exact") return new Set();

      const p = res.p;
      scored.push({ key, p });
      if (p < bestP) bestP = p;
    }

    if (!isFinite(bestP) || scored.length === 0) return new Set();

    const eps = 1e-12;
    const out = new Set();
    for (const it of scored) {
      if (Math.abs(it.p - bestP) <= eps) out.add(it.key);
    }
    return out;
  }

  window.IWABA.solver = {
    classifyNeighbors,
    collectCandidateWalls,
    validateContradictions,
    computeMineProbabilityForWall,
    computeRecommendations,
  };
})();
