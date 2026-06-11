import type { Cell, Level, Piece } from "./types";
import { WORKSHOP_LEVEL_PREFIX } from "./levelGenerator";
import { cellKey, rotateCells, normalizeCells } from "./boardUtils";

export type ImportValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
  level: Level | null;
};

function isCell(value: unknown): value is Cell {
  if (!Array.isArray(value) || value.length !== 2) return false;
  if (typeof value[0] !== "number" || typeof value[1] !== "number") return false;
  if (!Number.isInteger(value[0]) || !Number.isInteger(value[1])) return false;
  return true;
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

function canCoverTarget(size: number, target: Cell[], pieces: Piece[]): { canCover: boolean; reason?: string } {
  const targetSet = new Set(target.map(([r, c]) => cellKey(r, c)));
  const targetArea = targetSet.size;

  const pieceVariants = pieces.map((p) => {
    const variants: Cell[][] = [];
    const seen = new Set<string>();
    for (let r = 0; r < 4; r += 1) {
      const rotated = rotateCells(p.cells, r);
      const sig = rotated.map(([rr, cc]) => `${rr},${cc}`).join("|");
      if (!seen.has(sig)) {
        seen.add(sig);
        variants.push(rotated);
      }
    }
    return variants;
  });

  const used = new Array(pieces.length).fill(false);
  const covered = new Set<string>();
  let timeout = false;
  const startTime = Date.now();
  const TIME_LIMIT_MS = 2000;

  function backtrack(): boolean {
    if (Date.now() - startTime > TIME_LIMIT_MS) {
      timeout = true;
      return true;
    }
    if (covered.size === targetArea) {
      return true;
    }

    let firstUncoveredKey: string | null = null;
    for (const k of targetSet) {
      if (!covered.has(k)) {
        firstUncoveredKey = k;
        break;
      }
    }
    if (!firstUncoveredKey) return true;
    const [tr, tc] = firstUncoveredKey.split(":").map(Number);

    for (let pi = 0; pi < pieces.length; pi += 1) {
      if (used[pi]) continue;
      used[pi] = true;

      const variants = pieceVariants[pi];
      for (const variant of variants) {
        for (let vi = 0; vi < variant.length; vi += 1) {
          const [dr, dc] = variant[vi];
          const br = tr - dr;
          const bc = tc - dc;

          if (br < 0 || bc < 0) continue;

          let valid = true;
          const placements: string[] = [];
          for (const [ddr, ddc] of variant) {
            const r = br + ddr;
            const c = bc + ddc;
            if (r < 0 || r >= size || c < 0 || c >= size) {
              valid = false;
              break;
            }
            const k = cellKey(r, c);
            if (!targetSet.has(k)) {
              valid = false;
              break;
            }
            if (covered.has(k)) {
              valid = false;
              break;
            }
            placements.push(k);
          }
          if (!valid) continue;

          for (const k of placements) covered.add(k);
          if (backtrack()) return true;
          for (const k of placements) covered.delete(k);
        }
      }

      used[pi] = false;
    }

    return false;
  }

  if (pieces.length <= 8 && targetArea <= 36) {
    try {
      const result = backtrack();
      if (timeout) {
        return { canCover: true, reason: "验证超时，跳过穷举（面积已匹配）" };
      }
      if (result) return { canCover: true };
    } catch {}
  } else {
    return { canCover: true, reason: "规模较大，跳过穷举验证（面积已匹配）" };
  }

  return { canCover: false, reason: "穷举验证后无法完全覆盖目标格" };
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
  } else if (!Number.isInteger(data.size)) {
    errors.push(`棋盘大小必须是整数，当前为 ${data.size}`);
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

    const pieceCellSet = new Set<string>();
    const deduplicatedCells: Cell[] = [];
    let hasDuplicate = false;
    for (const cell of rawPiece.cells) {
      const k = cellKey(cell[0], cell[1]);
      if (pieceCellSet.has(k)) {
        hasDuplicate = true;
      } else {
        pieceCellSet.add(k);
        deduplicatedCells.push(cell);
      }
    }
    if (hasDuplicate) {
      warnings.push(
        `碎片 "${rawPiece.name}" 内部存在重复格子，声明面积 ${rawPiece.cells.length}，实际面积 ${pieceCellSet.size}，已自动去重`
      );
    }

    const normalized = normalizeCells(deduplicatedCells);
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
    if (totalPieceArea !== target.length) {
      errors.push(
        `碎片总面积 (${totalPieceArea}) 与目标格数量 (${target.length}) 不相等，必须完全一致`
      );
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors, warnings, level: null };
  }

  if (target.length > 0 && pieces.length > 0) {
    const coverResult = canCoverTarget(size, target, pieces);
    if (!coverResult.canCover) {
      errors.push(
        `目标覆盖校验失败：${coverResult.reason || "碎片无法完全覆盖目标格"}`
      );
    } else if (coverResult.reason) {
      warnings.push(`覆盖关系：${coverResult.reason}`);
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
