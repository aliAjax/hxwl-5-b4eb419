import type { Cell, Level, Piece, Placement } from "./types";
import { cellKey, parseKey, rotateCells } from "./boardUtils";

export type SolverStatus = "idle" | "solving" | "solved" | "unsolvable" | "timeout" | "error";

export type SolverResult = {
  status: SolverStatus;
  solution: Placement[] | null;
  message: string;
  solveTimeMs: number;
  nodesVisited: number;
};

export type HintResult = {
  status: Exclude<SolverStatus, "solving">;
  nextPlacement: Placement | null;
  remainingPlacements: Placement[] | null;
  message: string;
  isComplete: boolean;
};

type PieceVariant = {
  pieceId: string;
  cells: import("./types").Cell[];
  rotation: number;
};

type SolverState = {
  usedPieces: Set<string>;
  coveredCells: Set<string>;
  placements: Placement[];
  nodesVisited: number;
};

const solverCache = new Map<string, SolverResult>();
const hintCache = new Map<string, HintResult>();

function getPieceVariants(piece: Piece): PieceVariant[] {
  const variants: PieceVariant[] = [];
  const seen = new Set<string>();
  for (let r = 0; r < 4; r += 1) {
    const rotated = rotateCells(piece.cells, r);
    const sig = rotated.map(([rr, cc]) => `${rr},${cc}`).join("|");
    if (!seen.has(sig)) {
      seen.add(sig);
      variants.push({ pieceId: piece.id, cells: rotated, rotation: r });
    }
  }
  return variants;
}

function createLevelSignature(level: Level, existingPlacements: Placement[] = []): string {
  const sortedTarget = [...level.target].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const targetSig = sortedTarget.map(([r, c]) => `${r},${c}`).join("|");
  const piecesSig = level.pieces
    .map((p) => `${p.id}:${p.cells.map(([r, c]) => `${r},${c}`).join("|")}`)
    .sort()
    .join(";");
  const placementsSig = existingPlacements
    .map((p) => `${p.pieceId}:${p.row},${p.col},${p.rotation}`)
    .sort()
    .join(";");
  return `${level.size}|${targetSig}|${piecesSig}|${placementsSig}`;
}

function getOccupiedCells(placements: Placement[], pieces: Piece[]): Set<string> {
  const occupied = new Set<string>();
  placements.forEach((placement) => {
    const piece = pieces.find((p) => p.id === placement.pieceId);
    if (!piece) return;
    const cells = rotateCells(piece.cells, placement.rotation);
    cells.forEach(([r, c]) => {
      occupied.add(cellKey(r + placement.row, c + placement.col));
    });
  });
  return occupied;
}

function getUsedPieceIds(placements: Placement[]): Set<string> {
  return new Set(placements.map((p) => p.pieceId));
}

function getFirstUncoveredCell(targetSet: Set<string>, covered: Set<string>): Cell | null {
  for (const key of targetSet) {
    if (!covered.has(key)) {
      return parseKey(key);
    }
  }
  return null;
}

function countConstrainingCells(
  variant: PieceVariant,
  targetRow: number,
  targetCol: number,
  targetSet: Set<string>,
  covered: Set<string>,
  size: number
): number {
  let count = 0;
  const [dr0, dc0] = variant.cells[0];
  const baseRow = targetRow - dr0;
  const baseCol = targetCol - dc0;

  for (const [dr, dc] of variant.cells) {
    const r = baseRow + dr;
    const c = baseCol + dc;
    if (r < 0 || r >= size || c < 0 || c >= size) return Infinity;
    const k = cellKey(r, c);
    if (!targetSet.has(k) || covered.has(k)) return Infinity;
    const dirs: Cell[] = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const [ddr, ddc] of dirs) {
      const nr = r + ddr;
      const nc = c + ddc;
      const nk = cellKey(nr, nc);
      if (targetSet.has(nk) && !covered.has(nk) && nk !== k) {
        count += 1;
      }
    }
  }
  return count;
}

function quickCheck(level: Level, existingPlacements: Placement[]): { valid: boolean; reason?: string } {
  const targetSet = new Set(level.target.map(([r, c]) => cellKey(r, c)));
  const occupied = getOccupiedCells(existingPlacements, level.pieces);

  for (const key of occupied) {
    if (!targetSet.has(key)) {
      return { valid: false, reason: "存在碎片放置在非目标区域" };
    }
  }

  const usedPieces = getUsedPieceIds(existingPlacements);
  const remainingPieces = level.pieces.filter((p) => !usedPieces.has(p.id));
  const remainingTarget = level.target.length - occupied.size;
  const remainingPieceArea = remainingPieces.reduce((sum, p) => sum + p.cells.length, 0);

  if (remainingPieceArea !== remainingTarget) {
    return { valid: false, reason: `剩余碎片面积(${remainingPieceArea})与剩余目标格(${remainingTarget})不匹配` };
  }

  return { valid: true };
}

function floodFillIsolatedCells(
  targetSet: Set<string>,
  covered: Set<string>,
  size: number
): { isolatedCells: Set<string>; valid: boolean } {
  const allUncovered = new Set<string>();
  for (const key of targetSet) {
    if (!covered.has(key)) {
      allUncovered.add(key);
    }
  }

  const isolatedCells = new Set<string>();
  const visited = new Set<string>();
  const dirs: Cell[] = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  for (const startKey of allUncovered) {
    if (visited.has(startKey)) continue;

    const region: string[] = [];
    const queue: string[] = [startKey];
    visited.add(startKey);
    region.push(startKey);

    while (queue.length > 0) {
      const key = queue.shift()!;
      const [r, c] = parseKey(key);
      for (const [dr, dc] of dirs) {
        const nr = r + dr;
        const nc = c + dc;
        const nk = cellKey(nr, nc);
        if (allUncovered.has(nk) && !visited.has(nk)) {
          visited.add(nk);
          queue.push(nk);
          region.push(nk);
        }
      }
    }

    if (region.length > 0) {
      isolatedCells.add(region[0]);
    }
  }

  return { isolatedCells, valid: true };
}

export async function solveLevel(
  level: Level,
  existingPlacements: Placement[] = [],
  timeoutMs: number = 5000,
  useCache: boolean = true
): Promise<SolverResult> {
  const cacheKey = createLevelSignature(level, existingPlacements);
  if (useCache && solverCache.has(cacheKey)) {
    return solverCache.get(cacheKey)!;
  }

  const startTime = performance.now();
  const quick = quickCheck(level, existingPlacements);
  if (!quick.valid) {
    const result: SolverResult = {
      status: "unsolvable",
      solution: null,
      message: quick.reason || "快速检测发现不可解",
      solveTimeMs: performance.now() - startTime,
      nodesVisited: 0
    };
    solverCache.set(cacheKey, result);
    return result;
  }

  const targetSet = new Set(level.target.map(([r, c]) => cellKey(r, c)));
  const occupied = getOccupiedCells(existingPlacements, level.pieces);
  const usedPieceIds = getUsedPieceIds(existingPlacements);
  const remainingPieces = level.pieces.filter((p) => !usedPieceIds.has(p.id));

  if (occupied.size === targetSet.size) {
    const result: SolverResult = {
      status: "solved",
      solution: [...existingPlacements],
      message: "已完成",
      solveTimeMs: performance.now() - startTime,
      nodesVisited: 0
    };
    solverCache.set(cacheKey, result);
    return result;
  }

  const pieceVariants = new Map<string, PieceVariant[]>();
  for (const piece of remainingPieces) {
    pieceVariants.set(piece.id, getPieceVariants(piece));
  }

  const sortedPieces = [...remainingPieces].sort((a, b) => b.cells.length - a.cells.length);

  const state: SolverState = {
    usedPieces: new Set(),
    coveredCells: new Set(occupied),
    placements: [...existingPlacements],
    nodesVisited: 0
  };

  let timedOut = false;
  const timeoutAt = startTime + timeoutMs;

  function backtrack(): boolean {
    state.nodesVisited += 1;

    if (performance.now() > timeoutAt) {
      timedOut = true;
      return false;
    }

    if (state.coveredCells.size === targetSet.size) {
      return true;
    }

    const firstUncovered = getFirstUncoveredCell(targetSet, state.coveredCells);
    if (!firstUncovered) return true;
    const [tr, tc] = firstUncovered;

    const { isolatedCells } = floodFillIsolatedCells(targetSet, state.coveredCells, level.size);
    for (const isolatedKey of isolatedCells) {
      const [ir, ic] = parseKey(isolatedKey);
      let canBeCovered = false;
      for (const piece of sortedPieces) {
        if (state.usedPieces.has(piece.id)) continue;
        const variants = pieceVariants.get(piece.id)!;
        for (const variant of variants) {
          for (const [dr, dc] of variant.cells) {
            const baseRow = ir - dr;
            const baseCol = ic - dc;
            if (baseRow < 0 || baseCol < 0) continue;

            let validPlacement = true;
            for (const [ddr, ddc] of variant.cells) {
              const r = baseRow + ddr;
              const c = baseCol + ddc;
              if (r < 0 || r >= level.size || c < 0 || c >= level.size) {
                validPlacement = false;
                break;
              }
              const k = cellKey(r, c);
              if (!targetSet.has(k) || state.coveredCells.has(k)) {
                validPlacement = false;
                break;
              }
            }

            if (validPlacement) {
              canBeCovered = true;
              break;
            }
          }
          if (canBeCovered) break;
        }
        if (canBeCovered) break;
      }
      if (!canBeCovered) return false;
    }

    const candidates: {
      piece: Piece;
      variant: PieceVariant;
      baseRow: number;
      baseCol: number;
      constraint: number;
    }[] = [];

    for (const piece of sortedPieces) {
      if (state.usedPieces.has(piece.id)) continue;
      const variants = pieceVariants.get(piece.id)!;

      for (const variant of variants) {
        for (const [dr, dc] of variant.cells) {
          const baseRow = tr - dr;
          const baseCol = tc - dc;
          if (baseRow < 0 || baseCol < 0) continue;

          let valid = true;
          for (const [ddr, ddc] of variant.cells) {
            const r = baseRow + ddr;
            const c = baseCol + ddc;
            if (r < 0 || r >= level.size || c < 0 || c >= level.size) {
              valid = false;
              break;
            }
            const k = cellKey(r, c);
            if (!targetSet.has(k) || state.coveredCells.has(k)) {
              valid = false;
              break;
            }
          }

          if (valid) {
            const constraint = countConstrainingCells(
              variant,
              tr,
              tc,
              targetSet,
              state.coveredCells,
              level.size
            );
            if (constraint !== Infinity) {
              candidates.push({ piece, variant, baseRow, baseCol, constraint });
            }
          }
        }
      }
    }

    candidates.sort((a, b) => a.constraint - b.constraint);

    for (const candidate of candidates) {
      const { piece, variant, baseRow, baseCol } = candidate;

      state.usedPieces.add(piece.id);
      for (const [dr, dc] of variant.cells) {
        state.coveredCells.add(cellKey(baseRow + dr, baseCol + dc));
      }
      state.placements.push({
        pieceId: piece.id,
        row: baseRow,
        col: baseCol,
        rotation: variant.rotation
      });

      if (backtrack()) {
        return true;
      }

      state.placements.pop();
      for (const [dr, dc] of variant.cells) {
        state.coveredCells.delete(cellKey(baseRow + dr, baseCol + dc));
      }
      state.usedPieces.delete(piece.id);
    }

    return false;
  }

  await new Promise((resolve) => setTimeout(resolve, 0));

  const found = backtrack();
  const solveTimeMs = performance.now() - startTime;

  let result: SolverResult;
  if (timedOut) {
    result = {
      status: "timeout",
      solution: null,
      message: `求解超时（${timeoutMs}ms），关卡可能过于复杂`,
      solveTimeMs,
      nodesVisited: state.nodesVisited
    };
  } else if (found) {
    result = {
      status: "solved",
      solution: [...state.placements],
      message: `找到解答，耗时 ${solveTimeMs.toFixed(0)}ms，探索 ${state.nodesVisited} 个节点`,
      solveTimeMs,
      nodesVisited: state.nodesVisited
    };
  } else {
    result = {
      status: "unsolvable",
      solution: null,
      message: "该关卡不可解，请检查碎片放置是否有误",
      solveTimeMs,
      nodesVisited: state.nodesVisited
    };
  }

  solverCache.set(cacheKey, result);
  return result;
}

export async function getHint(
  level: Level,
  existingPlacements: Placement[],
  timeoutMs: number = 3000
): Promise<HintResult> {
  const cacheKey = createLevelSignature(level, existingPlacements);
  if (hintCache.has(cacheKey)) {
    return hintCache.get(cacheKey)!;
  }

  const targetSet = new Set(level.target.map(([r, c]) => cellKey(r, c)));
  const occupied = getOccupiedCells(existingPlacements, level.pieces);

  if (occupied.size === targetSet.size) {
    const result: HintResult = {
      status: "solved",
      nextPlacement: null,
      remainingPlacements: null,
      message: "已完成所有目标格",
      isComplete: true
    };
    hintCache.set(cacheKey, result);
    return result;
  }

  const misplaced: Cell[] = [];
  occupied.forEach((_color, key) => {
    if (!targetSet.has(key)) {
      misplaced.push(parseKey(key));
    }
  });

  if (misplaced.length > 0) {
    const result: HintResult = {
      status: "unsolvable",
      nextPlacement: null,
      remainingPlacements: null,
      message: `发现 ${misplaced.length} 个碎片放置在非目标区域，请先移除`,
      isComplete: false
    };
    hintCache.set(cacheKey, result);
    return result;
  }

  const solveResult = await solveLevel(level, existingPlacements, timeoutMs, true);

  let result: HintResult;
  if (solveResult.status === "solved" && solveResult.solution) {
    const nextPlacement = solveResult.solution.find(
      (p) => !existingPlacements.some((ep) => ep.pieceId === p.pieceId)
    );
    const remainingPlacements = solveResult.solution.filter(
      (p) => !existingPlacements.some((ep) => ep.pieceId === p.pieceId)
    );

    const piece = level.pieces.find((p) => p.id === nextPlacement?.pieceId);
    result = {
      status: "solved",
      nextPlacement: nextPlacement || null,
      remainingPlacements: remainingPlacements,
      message: nextPlacement && piece
        ? `下一步：放置「${piece.name}」到 (${nextPlacement.row}, ${nextPlacement.col})，旋转 ${nextPlacement.rotation} 次`
        : "已完成",
      isComplete: false
    };
  } else if (solveResult.status === "timeout") {
    result = {
      status: "timeout",
      nextPlacement: null,
      remainingPlacements: null,
      message: "提示生成超时，关卡可能过于复杂",
      isComplete: false
    };
  } else if (solveResult.status === "unsolvable") {
    result = {
      status: "unsolvable",
      nextPlacement: null,
      remainingPlacements: null,
      message: solveResult.message || "当前状态下无法找到解答，请尝试撤销几步",
      isComplete: false
    };
  } else {
    result = {
      status: "error",
      nextPlacement: null,
      remainingPlacements: null,
      message: "提示生成出错",
      isComplete: false
    };
  }

  hintCache.set(cacheKey, result);
  return result;
}

export function clearSolverCache(): void {
  solverCache.clear();
  hintCache.clear();
}

export function clearLevelCache(level: Level): void {
  const prefix = `${level.size}|`;
  for (const key of solverCache.keys()) {
    if (key.startsWith(prefix)) {
      solverCache.delete(key);
    }
  }
  for (const key of hintCache.keys()) {
    if (key.startsWith(prefix)) {
      hintCache.delete(key);
    }
  }
}
