/* iwaba-solver.js
 * Pure solving helpers. No DOM access.
 */
(() => {
  window.IWABA = window.IWABA || {};

  const { CellState } = IWABA.constants;
  const U = IWABA.utils;

  function neighbors(r, c, rows, cols) {
    return U.neighbors(r, c, rows, cols);
  }
  function orthoNeighbors(r, c, rows, cols) {
    return U.orthoNeighbors(r, c, rows, cols);
  }

  function validateContradictions(grid, rows, cols, extraMines = null, extraSafes = null) {
    const list = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const st = grid[r][c];
        if (st.state !== CellState.REVEALED) continue;

        const n = st.num;
        const ns = neighbors(r, c, rows, cols);

        let flagged = 0;
        let walls = 0;

        for (const [rr, cc] of ns) {
          const s2 = grid[rr][cc];
          const key = `${rr},${cc}`;

          const isMine =
            s2.state === CellState.FLAG || (extraMines && extraMines.has(key));
          const isSafe = extraSafes && extraSafes.has(key);

          if (isMine) flagged++;
          else if (s2.state === CellState.WALL && !isSafe) walls++;
        }

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

  function computeMineProbabilityForWall(grid, rows, cols, targetR, targetC, knownMines, knownSafes) {
    const touchingRevealed = [];
    for (const [rr, cc] of neighbors(targetR, targetC, rows, cols)) {
      const st = grid[rr][cc];
      if (st.state === CellState.REVEALED) touchingRevealed.push([rr, cc]);
    }
    if (touchingRevealed.length === 0) return null;

    const varMap = new Map();
    const vars = [];
    function addVar(r, c) {
      const k = `${r},${c}`;
      if (varMap.has(k)) return varMap.get(k);
      const idx = vars.length;
      varMap.set(k, idx);
      vars.push({ r, c });
      return idx;
    }

    const constraints = [];
    for (const [rr, cc] of touchingRevealed) {
      const n = grid[rr][cc].num;

      let flagged = 0;
      const unknown = [];
      for (const [ar, ac] of neighbors(rr, cc, rows, cols)) {
        const s2 = grid[ar][ac];
        const key = `${ar},${ac}`;

        const isMine =
          s2.state === CellState.FLAG || (knownMines && knownMines.has(key));
        const isSafe = knownSafes && knownSafes.has(key);

        if (isMine) flagged++;
        else if (s2.state === CellState.WALL && !isSafe) unknown.push([ar, ac]);
      }
      const need = n - flagged;
      if (need < 0 || need > unknown.length) return { kind: "contradiction" };

      const idxs = unknown.map(([ar, ac]) => addVar(ar, ac));
      constraints.push({ vars: idxs, need });
    }

    const targetKey = `${targetR},${targetC}`;
    if (!varMap.has(targetKey)) return null;
    const targetOld = varMap.get(targetKey);

    const nVars = vars.length;
    const mCons = constraints.length;

    const MAX_EXACT = 20;
    if (nVars > MAX_EXACT) {
      const ps = [];
      for (const con of constraints) {
        const k = con.vars.length;
        if (k <= 0) continue;
        ps.push(con.need / k);
      }
      if (ps.length === 0) return null;
      const pMin = Math.max(0, Math.min(...ps));
      const pMax = Math.min(1, Math.max(...ps));
      const pAvg = ps.reduce((a, b) => a + b, 0) / ps.length;
      return { kind: "approx", p: pAvg, min: pMin, max: pMax, vars: nVars, cons: mCons };
    }

    const deg = Array(nVars).fill(0);
    for (const con of constraints) for (const v of con.vars) deg[v]++;

    const orderOld = [...Array(nVars).keys()].sort((a, b) => deg[b] - deg[a]);
    const oldToNew = Array(nVars).fill(0);
    for (let i = 0; i < nVars; i++) oldToNew[orderOld[i]] = i;

    const target = oldToNew[targetOld];

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
    let mine = 0;
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
      if ((nodes & 2047) === 0) {
        if (nodes > NODE_LIMIT) return "abort";
        if (performance.now() - start > TIME_LIMIT_MS) return "abort";
      }

      if (i === nVars) {
        total++;
        if (assigned[target] === 1) mine++;
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
      const ps = [];
      for (let j = 0; j < mCons; j++) {
        const k = consLen[j];
        if (k <= 0) continue;
        ps.push(consNeed[j] / k);
      }
      if (ps.length === 0) return null;
      const pMin = Math.max(0, Math.min(...ps));
      const pMax = Math.min(1, Math.max(...ps));
      const pAvg = ps.reduce((a, b) => a + b, 0) / ps.length;
      return { kind: "approx", p: pAvg, min: pMin, max: pMax, vars: nVars, cons: mCons };
    }

    if (total === 0) return { kind: "contradiction" };
    return { kind: "exact", p: mine / total, total, mine, vars: nVars, cons: mCons };
  }

  function hasSafeWallOrthAdjacentToAnyRevealed(grid, rows, cols, safesSet) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (grid[r][c].state !== CellState.REVEALED) continue;
        for (const [wr, wc] of orthoNeighbors(r, c, rows, cols)) {
          const key = `${wr},${wc}`;
          if (safesSet.has(key) && grid[wr][wc].state === CellState.WALL) return true;
        }
      }
    }
    return false;
  }

  function computeRecommendations(grid, rows, cols, knownMines, knownSafes) {
    if (hasSafeWallOrthAdjacentToAnyRevealed(grid, rows, cols, knownSafes)) return new Set();

    const cand = [];
    const candSet = new Set();
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (grid[r][c].state !== CellState.REVEALED) continue;
        for (const [wr, wc] of orthoNeighbors(r, c, rows, cols)) {
          if (grid[wr][wc].state !== CellState.WALL) continue;
          const key = `${wr},${wc}`;
          if (knownMines.has(key) || knownSafes.has(key)) continue;
          if (!candSet.has(key)) {
            candSet.add(key);
            cand.push([wr, wc]);
          }
        }
      }
    }
    if (cand.length === 0) return new Set();

    let bestP = Infinity;
    const scored = [];

    for (const [wr, wc] of cand) {
      const key = `${wr},${wc}`;
      const res = computeMineProbabilityForWall(grid, rows, cols, wr, wc, knownMines, knownSafes);
      if (!res || res.kind === "contradiction") continue;

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
    validateContradictions,
    computeMineProbabilityForWall,
    computeRecommendations,
  };
})();
