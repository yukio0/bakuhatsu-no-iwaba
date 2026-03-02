/* iwaba-constants.js
 * Shared constants for 爆発の岩場ツール
 */
(() => {
  window.IWABA = window.IWABA || {};
  const STAGES = {
    beginner: { label: "初級", size: { rows: 6, cols: 9 } },
    intermediate: { label: "中級", size: { rows: 9, cols: 13 } },
    advanced: { label: "上級", size: { rows: 12, cols: 19 } },
  };

  const CellState = { WALL: "wall", FLAG: "flag", REVEALED: "revealed" };
  const Tool = {
    wall: () => ({ kind: "wall" }),
    flag: () => ({ kind: "flag" }),
    num: (n) => ({ kind: "num", num: n }),
  };

  const WALL_CHAR = "\u58C1"; // "壁"

  const TOOL_DEFS = [
    { id: "wall", label: "壁", sub: "W / ?", tool: Tool.wall() },
    { id: "flag", label: "⚑", sub: "F", tool: Tool.flag() },
    { id: "n0", label: " ", sub: "0", tool: Tool.num(0) },
    { id: "n1", label: "1", sub: "1", tool: Tool.num(1) },
    { id: "n2", label: "2", sub: "2", tool: Tool.num(2) },
    { id: "n3", label: "3", sub: "3", tool: Tool.num(3) },
    { id: "n4", label: "4", sub: "4", tool: Tool.num(4) },
    { id: "n5", label: "5", sub: "5", tool: Tool.num(5) },
    { id: "n6", label: "6", sub: "6", tool: Tool.num(6) },
    { id: "n7", label: "7", sub: "7", tool: Tool.num(7) },
    { id: "n8", label: "8", sub: "8", tool: Tool.num(8) },
  ];

  window.IWABA.constants = {
    STAGES,
    CellState,
    Tool,
    WALL_CHAR,
    TOOL_DEFS,
    TOOL_GRID_COLS: 6,
    TOOL_CYCLE_LEN: 11,
  };
})();
