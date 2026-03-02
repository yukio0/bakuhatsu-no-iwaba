/* iwaba-utils.js
 * Small utilities.
 */
(() => {
  window.IWABA = window.IWABA || {};

  const KANJI_DIGIT = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];

  function toKanji(n) {
    if (n <= 0) return "";
    if (n < 10) return KANJI_DIGIT[n];
    if (n === 10) return "十";
    if (n < 20) return "十" + KANJI_DIGIT[n - 10];
    const tens = Math.floor(n / 10);
    const ones = n % 10;
    return KANJI_DIGIT[tens] + "十" + (ones ? KANJI_DIGIT[ones] : "");
  }

  function cellCoord(r, c, rows) {
    return `${toKanji(rows - r)}-${c + 1}`;
  }

  function neighbors(r, c, rows, cols) {
    const out = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const rr = r + dr,
          cc = c + dc;
        if (0 <= rr && rr < rows && 0 <= cc && cc < cols) out.push([rr, cc]);
      }
    }
    return out;
  }

  function orthoNeighbors(r, c, rows, cols) {
    const out = [];
    if (r - 1 >= 0) out.push([r - 1, c]);
    if (r + 1 < rows) out.push([r + 1, c]);
    if (c - 1 >= 0) out.push([r, c - 1]);
    if (c + 1 < cols) out.push([r, c + 1]);
    return out;
  }

  function wheelPrimaryDelta(e) {
    return Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
  }

  window.IWABA.utils = { toKanji, cellCoord, neighbors, orthoNeighbors, wheelPrimaryDelta };
})();
