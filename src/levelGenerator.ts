import type { Cell, Level, Piece } from "./types";
import { cellKey, parseKey, rotateCells, normalizeCells, cellsSignature } from "./boardUtils";

export type Complexity = "simple" | "normal" | "complex";
export type ColorPalette = "classic" | "ocean" | "forest" | "sunset" | "aurora";

export type GeneratorParams = {
  boardSize: number;
  complexity: Complexity;
  pieceCount: number;
  palette: ColorPalette;
};

export type GeneratorProgress = {
  step: number;
  totalSteps: number;
  message: string;
  attempt: number;
};

export type GeneratorProgressCallback = (progress: GeneratorProgress) => void;

export const WORKSHOP_LEVEL_PREFIX = "workshop-";

const COLOR_PALETTES: Record<ColorPalette, string[]> = {
  classic: ["#54a0a8", "#d09b4c", "#c96161", "#7c70c7", "#df6f52", "#6ab57a", "#4f8fcf", "#d7b84f", "#95e2a4", "#e8a94a"],
  ocean: ["#3e8eb5", "#5bb4d4", "#6a8fc9", "#4a6fa5", "#7bc4e0", "#528fad", "#8aa9d6", "#6dbfd6", "#447093", "#9fd6e8"],
  forest: ["#4f8f5c", "#6ab57a", "#8fbf73", "#5a9e6f", "#95e2a4", "#73a978", "#b8d98e", "#6fba87", "#4e8263", "#a8d89c"],
  sunset: ["#df6f52", "#e8944a", "#c96161", "#d78f4f", "#e8a967", "#d9735c", "#e8a94a", "#c75f7a", "#df8550", "#e29b8c"],
  aurora: ["#7c70c7", "#9f6fc9", "#6a8fc9", "#a07cd4", "#8fa6d9", "#b88fd6", "#7a99cf", "#c299e0", "#6f86c9", "#d4a8e8"]
};

const PIECE_NAMES = [
  "日符", "月符", "星符", "云符", "风符", "火符", "水符", "山符", "雷符", "泽符",
  "天符", "地符", "龙符", "凤符", "玄符", "黄符", "春符", "夏符", "秋符", "冬符"
];

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateConnectedTarget(size: number, targetArea: number, rand: () => number): Cell[] {
  const center = Math.floor(size / 2);
  const start: Cell = [center, center];
  const resultSet = new Set<string>([cellKey(start[0], start[1])]);
  const frontier: Cell[] = [start];

  const dirs: Cell[] = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  while (resultSet.size < targetArea && frontier.length > 0) {
    const idx = Math.floor(rand() * frontier.length);
    const current = frontier[idx];
    const [cr, cc] = current;

    const neighbors: Cell[] = [];
    for (const [dr, dc] of dirs) {
      const nr = cr + dr;
      const nc = cc + dc;
      if (nr >= 0 && nr < size && nc >= 0 && nc < size && !resultSet.has(cellKey(nr, nc))) {
        neighbors.push([nr, nc]);
      }
    }

    if (neighbors.length === 0) {
      frontier.splice(idx, 1);
      continue;
    }

    const next = neighbors[Math.floor(rand() * neighbors.length)];
    resultSet.add(cellKey(next[0], next[1]));
    frontier.push(next);
  }

  return Array.from(resultSet).map(parseKey);
}

function splitIntoPieces(target: Cell[], pieceCount: number, rand: () => number): Cell[][] {
  if (pieceCount <= 1) return [target];
  if (target.length <= pieceCount) {
    return target.map((c) => [c]);
  }

  const targetSet = new Set(target.map(([r, c]) => cellKey(r, c)));
  const n = Math.min(pieceCount, target.length);

  const indices = [...Array(target.length).keys()];
  for (let i = indices.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  const seeds: Cell[] = indices.slice(0, n).map((i) => target[i]);
  const assignments = new Map<string, number>();
  const pieces: Set<string>[] = seeds.map((s) => new Set([cellKey(s[0], s[1])]));

  seeds.forEach((s, i) => assignments.set(cellKey(s[0], s[1]), i));

  const frontier: { cell: Cell; piece: number }[] = seeds.map((s, i) => ({ cell: s, piece: i }));
  const dirs: Cell[] = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const minSize = Math.max(1, Math.floor(target.length / (n * 2)));

  while (assignments.size < target.length) {
    let progressed = false;

    for (let pass = 0; pass < 4 && assignments.size < target.length; pass += 1) {
      const newFrontier: { cell: Cell; piece: number }[] = [];

      for (const { cell, piece } of frontier) {
        const [cr, cc] = cell;
        for (const [dr, dc] of dirs) {
          const nr = cr + dr;
          const nc = cc + dc;
          const k = cellKey(nr, nc);
          if (targetSet.has(k) && !assignments.has(k)) {
            const currentSize = pieces[piece].size;
            const othersSmaller = pieces.some((p, idx) => idx !== piece && p.size < minSize);
            if (othersSmaller && currentSize >= minSize * 2) continue;
            assignments.set(k, piece);
            pieces[piece].add(k);
            newFrontier.push({ cell: [nr, nc], piece });
            progressed = true;
          }
        }
      }

      frontier.length = 0;
      frontier.push(...newFrontier);
    }

    if (!progressed && assignments.size < target.length) {
      for (const [, c] of target.entries()) {
        const k = cellKey(c[0], c[1]);
        if (!assignments.has(k)) {
          let bestPiece = 0;
          let bestDist = Infinity;
          for (let pi = 0; pi < pieces.length; pi += 1) {
            for (const pk of pieces[pi]) {
              const [pr, pc] = parseKey(pk);
              const dist = Math.abs(c[0] - pr) + Math.abs(c[1] - pc);
              if (dist < bestDist) {
                bestDist = dist;
                bestPiece = pi;
              }
            }
          }
          assignments.set(k, bestPiece);
          pieces[bestPiece].add(k);
        }
      }
    }
  }

  const result: Cell[][] = pieces
    .filter((p) => p.size > 0)
    .map((p) => Array.from(p).map(parseKey));

  const actual = result.length;
  if (actual < n) {
    for (let i = actual; i < n; i += 1) {
      let largestIdx = 0;
      for (let j = 1; j < result.length; j += 1) {
        if (result[j].length > result[largestIdx].length) largestIdx = j;
      }
      const largest = result[largestIdx];
      if (largest.length <= 2) break;
      const splitAt = Math.floor(largest.length / 2);
      result[largestIdx] = largest.slice(0, splitAt);
      result.push(largest.slice(splitAt));
    }
  }

  return result.filter((p) => p.length > 0);
}

function verifyConnectivity(cells: Cell[]): boolean {
  if (cells.length <= 1) return true;
  const set = new Set(cells.map(([r, c]) => cellKey(r, c)));
  const visited = new Set<string>();
  const queue: Cell[] = [cells[0]];
  visited.add(cellKey(cells[0][0], cells[0][1]));
  const dirs: Cell[] = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  while (queue.length > 0) {
    const [cr, cc] = queue.shift()!;
    for (const [dr, dc] of dirs) {
      const k = cellKey(cr + dr, cc + dc);
      if (set.has(k) && !visited.has(k)) {
        visited.add(k);
        queue.push([cr + dr, cc + dc]);
      }
    }
  }

  return visited.size === cells.length;
}

function countUniqueShapes(pieces: Piece[]): number {
  const sigs = new Set<string>();
  for (const p of pieces) sigs.add(cellsSignature(p.cells));
  return sigs.size;
}

function getTargetAreaRatio(complexity: Complexity): [number, number] {
  switch (complexity) {
    case "simple":
      return [0.2, 0.35];
    case "normal":
      return [0.35, 0.5];
    case "complex":
      return [0.5, 0.7];
  }
}

export async function generateWorkshopLevel(
  params: GeneratorParams,
  onProgress?: GeneratorProgressCallback,
  abortSignal?: { aborted: boolean }
): Promise<Level> {
  const { boardSize, complexity, pieceCount, palette } = params;
  const seed = Math.floor(Math.random() * 1000000000);
  const rand = mulberry32(seed);
  const colors = COLOR_PALETTES[palette];

  const totalSteps = 5;
  const maxAttempts = 12;
  let lastError = "";

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (abortSignal?.aborted) {
      throw new Error("生成已取消");
    }

    try {
      onProgress?.({ step: 1, totalSteps, message: "生成连通目标区域…", attempt });
      await new Promise((r) => setTimeout(r, 0));

      const [minRatio, maxRatio] = getTargetAreaRatio(complexity);
      const maxArea = Math.floor(boardSize * boardSize * maxRatio);
      const minArea = Math.max(pieceCount + 2, Math.floor(boardSize * boardSize * minRatio));
      const targetArea = minArea + Math.floor(rand() * (maxArea - minArea + 1));

      const target = generateConnectedTarget(boardSize, targetArea, rand);
      if (target.length < pieceCount) {
        lastError = `目标区域(${target.length})太小，无法分成${pieceCount}块`;
        continue;
      }
      if (!verifyConnectivity(target)) {
        lastError = "目标区域不连通";
        continue;
      }

      onProgress?.({ step: 2, totalSteps, message: "分割目标区域为碎片…", attempt });
      await new Promise((r) => setTimeout(r, 0));

      const splitPieces = splitIntoPieces(target, pieceCount, rand);
      if (splitPieces.length < Math.max(2, Math.floor(pieceCount * 0.7))) {
        lastError = `碎片分割失败，只得到${splitPieces.length}块`;
        continue;
      }

      const allConnected = splitPieces.every(verifyConnectivity);
      if (!allConnected) {
        lastError = "存在碎片不连通";
        continue;
      }

      onProgress?.({ step: 3, totalSteps, message: "分配颜色与形状变换…", attempt });
      await new Promise((r) => setTimeout(r, 0));

      const usedColorIdx: number[] = [];
      const usedNameIdx: number[] = [];

      const pieces: Piece[] = splitPieces.map((pieceCells, i) => {
        let cIdx = Math.floor(rand() * colors.length);
        for (let tries = 0; tries < colors.length && usedColorIdx.includes(cIdx); tries += 1) {
          cIdx = (cIdx + 1) % colors.length;
        }
        usedColorIdx.push(cIdx);

        let nIdx = Math.floor(rand() * PIECE_NAMES.length);
        for (let tries = 0; tries < PIECE_NAMES.length && usedNameIdx.includes(nIdx); tries += 1) {
          nIdx = (nIdx + 1) % PIECE_NAMES.length;
        }
        usedNameIdx.push(nIdx);

        const randomRotation = Math.floor(rand() * 4);
        const normalized = normalizeCells(pieceCells);
        const rotatedForPiece = rotateCells(normalized, randomRotation);

        return {
          id: `${WORKSHOP_LEVEL_PREFIX}${Date.now()}-${i}`,
          name: PIECE_NAMES[nIdx],
          color: colors[cIdx],
          cells: rotatedForPiece
        };
      });

      onProgress?.({ step: 4, totalSteps, message: "验证可解性与形状多样性…", attempt });
      await new Promise((r) => setTimeout(r, 0));

      const uniqueShapes = countUniqueShapes(pieces);
      const shapeRatio = uniqueShapes / pieces.length;

      if (attempt < maxAttempts - 2 && shapeRatio < 0.6 && pieces.length >= 4) {
        lastError = `形状重复过多(${uniqueShapes}/${pieces.length})，尝试提升多样性`;
        continue;
      }

      const totalCells = pieces.reduce((s, p) => s + p.cells.length, 0);
      if (totalCells !== target.length) {
        lastError = `碎片面积(${totalCells})与目标面积(${target.length})不匹配`;
        continue;
      }

      onProgress?.({ step: 5, totalSteps, message: "生成完成！", attempt });
      await new Promise((r) => setTimeout(r, 0));

      const levelId = `${WORKSHOP_LEVEL_PREFIX}${Date.now()}`;

      return {
        id: levelId,
        name: `工坊 #${levelId.slice(-6)}`,
        size: boardSize,
        target: target.sort((a, b) => a[0] - b[0] || a[1] - b[1]),
        pieces
      };
    } catch (e) {
      lastError = e instanceof Error ? e.message : "未知错误";
    }
  }

  throw new Error(`经过 ${maxAttempts} 次尝试仍未能生成符合要求的关卡。最后错误：${lastError}`);
}
