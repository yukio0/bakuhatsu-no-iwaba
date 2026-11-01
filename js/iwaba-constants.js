/* iwaba-constants.js
 * Shared constants for bakuhatsu-no-iwaba.
 */
(() => {
  window.IWABA = window.IWABA || {};
  const STAGES = {
    beginner: { label: "初級", size: { rows: 6, cols: 9 }, mines: { min: 5, max: 8 } },
    intermediate: { label: "中級", size: { rows: 9, cols: 13 }, mines: { min: 16, max: 22 } },
    advanced: { label: "上級", size: { rows: 12, cols: 19 }, mines: { min: 44, max: 54 } },
  };

  function mineOdds(stage) {
    const avg = (stage.mines.min + stage.mines.max) / 2;
    const rho = avg / (stage.size.rows * stage.size.cols - 9);
    return rho / (1 - rho);
  }

  const CellState = { WALL: "wall", FLAG: "flag", REVEALED: "revealed", STAIRS: "stairs" };
  const Tool = {
    wall: () => ({ kind: "wall" }),
    flag: () => ({ kind: "flag" }),
    num: (n) => ({ kind: "num", num: n }),
    stairs: () => ({ kind: "stairs" }),
  };

  const WALL_CHAR = "\u58C1"; // "壁"
  const STAIRS_CHAR = "\u968E"; // "階"

  const TOOL_DEFS = [
    { id: "stairs", sub: "S", tool: Tool.stairs() },
    { id: "wall", sub: "W / ?", tool: Tool.wall() },
    { id: "flag", sub: "F", tool: Tool.flag() },
    { id: "n0", sub: "0", tool: Tool.num(0) },
    { id: "n1", sub: "1", tool: Tool.num(1) },
    { id: "n2", sub: "2", tool: Tool.num(2) },
    { id: "n3", sub: "3", tool: Tool.num(3) },
    { id: "n4", sub: "4", tool: Tool.num(4) },
    { id: "n5", sub: "5", tool: Tool.num(5) },
    { id: "n6", sub: "6", tool: Tool.num(6) },
    { id: "n7", sub: "7", tool: Tool.num(7) },
    { id: "n8", sub: "8", tool: Tool.num(8) },
  ];

  window.IWABA.constants = {
    STAGES,
    mineOdds,
    CellState,
    Tool,
    WALL_CHAR,
    STAIRS_CHAR,
    TOOL_DEFS,
    TOOL_GRID_COLS: 6,
  };
})();
