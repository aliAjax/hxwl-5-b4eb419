import type { Cell, Level, Piece } from "./App";
import { WORKSHOP_LEVEL_PREFIX } from "./levelGenerator";

export type ImportValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
  level: Level | null;
};

function isCell(value: unknown): value is Cell {
  if (!Array.isArray(value) || value.length !== 2) return false;
  return typeof value[0] === "number" && typeof value[1] === "number";
}

function isPiece(value: unknown): value is Piece {
  if (!value || typeof value !== "object") return false;
  const p = value as Record<string, unknown>;
  if (typeof p.id !== "string") return false;
  if (typeof p.name !== "string") return false;
  if (typeof p.color !== "string") return false;
  if (!Array.isArray(p.cells)) return false;
  if (!p.cells.every(isCell)) return false;
  return true;
}

function normalizeCells(cells: Cell[]): Cell[] {
  const minRow = Math.min(...cells.map(([r]) => r));
  const minCol = Math.min(...cells.map(([, c]) => c));
  return cells
    .map(([r, c]) => [r - minRow, c - minCol] as Cell)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

function cellKey(r: number, c: number): string {
  return `${r}:${c}`;
}

export function exportLevelToJson(level: Level): string {
  const exportData = {
    name: level.name,
    size: level.size,
    target: level.target,
    pieces: level.pieces.map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      cells: p.cells
    })),
    exportedAt: new Date().toISOString(),
    version: 1
  };
  return JSON.stringify(exportData, null, 2);
}

export function validateAndImportLevel(jsonStr: string): ImportValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  let raw: unknown;
  try {
    raw = JSON.parse(jsonStr);
  } catch (e) {
    return {
      valid: false,
      errors: ["JSON 格式无效，无法解析"],
      warnings: [],
      level: null
    };
  }

  if (!raw || typeof raw !== "object") {
    return {
      valid: false,
      errors: ["关卡数据不是有效的对象"],
      warnings: [],
      level: null
    };
  }

  const data = raw as Record<string, unknown>;

  if (typeof data.size !== "number") {
    errors.push("缺少或无效的棋盘大小 (size)");
  } else if (data.size < 3 || data.size > 12) {
    errors.push(`棋盘大小必须在 3-12 之间，当前为 ${data.size}`);
  }

  if (typeof data.name !== "string") {
    errors.push("缺少或无效的关卡名称 (name)");
  } else if (data.name.trim().length === 0) {
    errors.push("关卡名称不能为空");
  }

  if (!Array.isArray(data.target)) {
    errors.push("缺少或无效的目标格数组 (target)");
  } else if (data.target.length === 0) {
    errors.push("目标格数组不能为空");
  }

  if (!Array.isArray(data.pieces)) {
    errors.push("缺少或无效的碎片数组 (pieces)");
  } else if (data.pieces.length === 0) {
    errors.push("碎片数组不能为空");
  }

  if (errors.length > 0) {
    return { valid: false, errors, warnings, level: null };
  }

  const size = data.size as number;
  const name = (data.name as string).trim();
  const rawTarget = data.target as unknown[];
  const rawPieces = data.pieces as unknown[];

  const target: Cell[] = [];
  const targetSet = new Set<string>();
  for (let i = 0; i < rawTarget.length; i++) {
    const cell = rawTarget[i];
    if (!isCell(cell)) {
      errors.push(`目标格第 ${i + 1} 项格式无效`);
      continue;
    }
    const [r, c] = cell;
    if (r < 0 || r >= size || c < 0 || c >= size) {
      errors.push(`目标格 [${r}, ${c}] 超出棋盘范围 (${size}×${size})`);
      continue;
    }
    const key = cellKey(r, c);
    if (targetSet.has(key)) {
      warnings.push(`目标格 [${r}, ${c}] 重复，已自动去重`);
      continue;
    }
    targetSet.add(key);
    target.push(cell);
  }

  if (target.length === 0 && errors.length === 0) {
    errors.push("没有有效的目标格");
  }

  const pieces: Piece[] = [];
  const pieceIds = new Set<string>();
  let totalPieceArea = 0;

  for (let i = 0; i < rawPieces.length; i++) {
    const rawPiece = rawPieces[i];
    if (!isPiece(rawPiece)) {
      errors.push(`碎片第 ${i + 1} 项格式无效`);
      continue;
    }

    if (pieceIds.has(rawPiece.id)) {
      errors.push(`碎片 id 重复: ${rawPiece.id}`);
      continue;
    }
    pieceIds.add(rawPiece.id);

    if (rawPiece.cells.length === 0) {
      errors.push(`碎片 "${rawPiece.name}" (id: ${rawPiece.id}) 没有格子`);
      continue;
    }

    const normalized = normalizeCells(rawPiece.cells);
    const maxR = Math.max(...normalized.map(([r]) => r));
    const maxC = Math.max(...normalized.map(([, c]) => c));
    if (maxR >= size || maxC >= size) {
      warnings.push(
        `碎片 "${rawPiece.name}" 尺寸 (${maxR + 1}×${maxC + 1}) 接近或超过棋盘，可能无法放置`
      );
    }

    totalPieceArea += normalized.length;
    pieces.push({
      ...rawPiece,
      cells: normalized
    });
  }

  if (pieces.length === 0 && errors.length === 0) {
    errors.push("没有有效的碎片");
  }

  if (target.length > 0 && pieces.length > 0) {
    if (totalPieceArea < target.length) {
      errors.push(
        `碎片总面积 (${totalPieceArea}) 小于目标格数量 (${target.length})，无法覆盖目标`
      );
    } else if (totalPieceArea > target.length) {
      warnings.push(
        `碎片总面积 (${totalPieceArea}) 大于目标格数量 (${target.length})，可能有多解或部分碎片无用`
      );
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors, warnings, level: null };
  }

  const levelId = `${WORKSHOP_LEVEL_PREFIX}import-${Date.now()}`;
  const importedPieces = pieces.map((p, i) => ({
    ...p,
    id: `${levelId}-${i}`
  }));

  const level: Level = {
    id: levelId,
    name,
    size,
    target: target.sort((a, b) => a[0] - b[0] || a[1] - b[1]),
    pieces: importedPieces
  };

  return { valid: true, errors: [], warnings, level };
}

export function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text);
  }
  return new Promise((resolve, reject) => {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "-9999px";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    try {
      document.execCommand("copy");
      resolve();
    } catch (e) {
      reject(e);
    } finally {
      document.body.removeChild(textarea);
    }
  });
}
