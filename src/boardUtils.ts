import type { Cell } from "./types";

export function cellKey(row: number, col: number): string {
  return `${row}:${col}`;
}

export function parseKey(key: string): Cell {
  const [r, c] = key.split(":").map(Number);
  return [r, c];
}

export function normalizeCells(cells: Cell[]): Cell[] {
  const minRow = Math.min(...cells.map(([r]) => r));
  const minCol = Math.min(...cells.map(([, c]) => c));
  return cells
    .map(([r, c]) => [r - minRow, c - minCol] as Cell)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

export function rotateCells(cells: Cell[], turns: number): Cell[] {
  let next = cells;
  for (let i = 0; i < turns % 4; i += 1) {
    next = next.map(([row, col]) => [col, -row] as Cell);
  }
  return normalizeCells(next);
}

export function cellsSignature(cells: Cell[]): string {
  const normalized = normalizeCells(cells);
  let best = "";
  for (let r = 0; r < 4; r += 1) {
    const rotated = rotateCells(normalized, r);
    const sig = rotated.map(([rr, cc]) => `${rr},${cc}`).join("|");
    if (best === "" || sig < best) best = sig;
  }
  return best;
}

export function formatLastPlayed(isoString?: string): string {
  if (!isoString) return "尚未游玩";
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "刚刚";
  if (diffMins < 60) return `${diffMins} 分钟前`;
  if (diffHours < 24) return `${diffHours} 小时前`;
  if (diffDays < 7) return `${diffDays} 天前`;
  return date.toLocaleDateString("zh-CN", { year: "numeric", month: "short", day: "numeric" });
}
