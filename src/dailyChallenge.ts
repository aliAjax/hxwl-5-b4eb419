import type { Cell, Level, Piece, Stats } from "./types";
import { rotateCells } from "./boardUtils";

const DAILY_CHALLENGE_KEY = "hxwl-5-daily-challenge";

export type DailyChallengeRecord = {
  completed: boolean;
  completedAt?: string;
  minSteps: number;
  minRotations: number;
  lastPlayed?: string;
  historyMinSteps: number;
  historyMinRotations: number;
  historyLastPlayed?: string;
};

export type DailyChallengeSave = Record<string, DailyChallengeRecord>;

export const DAILY_CHALLENGE_LEVEL_ID = "daily-challenge";
export const HISTORY_REPLAY_LEVEL_ID_PREFIX = "history-replay-";

export function getHistoryReplayLevelId(dateStr: string): string {
  return `${HISTORY_REPLAY_LEVEL_ID_PREFIX}${dateStr}`;
}

export function isHistoryReplayLevelId(levelId: string): boolean {
  return levelId.startsWith(HISTORY_REPLAY_LEVEL_ID_PREFIX);
}

export function extractDateFromHistoryLevelId(levelId: string): string | null {
  if (!isHistoryReplayLevelId(levelId)) return null;
  return levelId.slice(HISTORY_REPLAY_LEVEL_ID_PREFIX.length);
}

function loadDailySave(): DailyChallengeSave {
  try {
    return JSON.parse(localStorage.getItem(DAILY_CHALLENGE_KEY) || "{}") as DailyChallengeSave;
  } catch {
    return {};
  }
}

function saveDailySave(data: DailyChallengeSave) {
  localStorage.setItem(DAILY_CHALLENGE_KEY, JSON.stringify(data));
}

export function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export const NO_RECORD = 999999;

function createEmptyRecord(): DailyChallengeRecord {
  return {
    completed: false,
    minSteps: NO_RECORD,
    minRotations: NO_RECORD,
    historyMinSteps: NO_RECORD,
    historyMinRotations: NO_RECORD
  };
}

function normalizeRecord(record: DailyChallengeRecord | null | undefined): DailyChallengeRecord {
  if (!record) return createEmptyRecord();
  return {
    completed: !!record.completed,
    completedAt: record.completedAt,
    minSteps: typeof record.minSteps === "number" && isFinite(record.minSteps) ? record.minSteps : NO_RECORD,
    minRotations: typeof record.minRotations === "number" && isFinite(record.minRotations) ? record.minRotations : NO_RECORD,
    lastPlayed: record.lastPlayed,
    historyMinSteps: typeof record.historyMinSteps === "number" && isFinite(record.historyMinSteps) ? record.historyMinSteps : NO_RECORD,
    historyMinRotations: typeof record.historyMinRotations === "number" && isFinite(record.historyMinRotations) ? record.historyMinRotations : NO_RECORD,
    historyLastPlayed: record.historyLastPlayed
  };
}

export function getDailyRecord(dateStr?: string): DailyChallengeRecord {
  const date = dateStr ?? getTodayDateString();
  const save = loadDailySave();
  return normalizeRecord(save[date]);
}

export function updateDailyRecord(stats: Stats): DailyChallengeRecord {
  const date = getTodayDateString();
  const save = loadDailySave();
  const existing = normalizeRecord(save[date]);
  const updated: DailyChallengeRecord = {
    completed: true,
    completedAt: existing.completedAt ?? new Date().toISOString(),
    minSteps: Math.min(existing.minSteps, stats.steps),
    minRotations: Math.min(existing.minRotations, stats.rotations),
    lastPlayed: new Date().toISOString(),
    historyMinSteps: existing.historyMinSteps,
    historyMinRotations: existing.historyMinRotations,
    historyLastPlayed: existing.historyLastPlayed
  };
  save[date] = updated;
  saveDailySave(save);
  return updated;
}

export function updateHistoryRecord(dateStr: string, stats: Stats): DailyChallengeRecord {
  const save = loadDailySave();
  const existing = normalizeRecord(save[dateStr]);
  const updated: DailyChallengeRecord = {
    completed: existing.completed,
    completedAt: existing.completedAt,
    minSteps: existing.minSteps,
    minRotations: existing.minRotations,
    lastPlayed: existing.lastPlayed,
    historyMinSteps: Math.min(existing.historyMinSteps, stats.steps),
    historyMinRotations: Math.min(existing.historyMinRotations, stats.rotations),
    historyLastPlayed: new Date().toISOString()
  };
  save[dateStr] = updated;
  saveDailySave(save);
  return updated;
}

export function touchDailyPlayed() {
  const date = getTodayDateString();
  const save = loadDailySave();
  const existing = normalizeRecord(save[date]);
  save[date] = {
    ...existing,
    lastPlayed: new Date().toISOString()
  };
  saveDailySave(save);
}

export function touchHistoryPlayed(dateStr: string) {
  const save = loadDailySave();
  const existing = normalizeRecord(save[dateStr]);
  save[dateStr] = {
    ...existing,
    historyLastPlayed: new Date().toISOString()
  };
  saveDailySave(save);
}

export type DailyRecordWithDate = {
  date: string;
  record: DailyChallengeRecord;
};

export function getDailyRecordsForDays(count: number): DailyRecordWithDate[] {
  const save = loadDailySave();
  const result: DailyRecordWithDate[] = [];
  const today = new Date();
  for (let i = 0; i < count; i += 1) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = formatDateToString(d);
    result.push({ date: dateStr, record: normalizeRecord(save[dateStr]) });
  }
  return result;
}

export function calculateStreak(): number {
  const save = loadDailySave();
  const today = getTodayDateString();
  const todayRecord = normalizeRecord(save[today]);
  let streak = 0;
  const startDate = todayRecord.completed ? new Date() : new Date(new Date().setDate(new Date().getDate() - 1));
  const d = new Date(startDate);
  while (true) {
    const dateStr = formatDateToString(d);
    const record = normalizeRecord(save[dateStr]);
    if (record.completed) {
      streak += 1;
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

function formatDateToString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function dateToSeed(dateStr: string): number {
  let hash = 0;
  for (let i = 0; i < dateStr.length; i += 1) {
    hash = (hash << 5) - hash + dateStr.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

const PIECE_TEMPLATES: { cells: Cell[]; minSize: number }[] = [
  { cells: [[0, 0]], minSize: 1 },
  { cells: [[0, 0], [0, 1]], minSize: 2 },
  { cells: [[0, 0], [1, 0]], minSize: 2 },
  { cells: [[0, 0], [0, 1], [0, 2]], minSize: 3 },
  { cells: [[0, 0], [1, 0], [2, 0]], minSize: 3 },
  { cells: [[0, 0], [0, 1], [1, 0]], minSize: 2 },
  { cells: [[0, 0], [0, 1], [1, 1]], minSize: 2 },
  { cells: [[0, 1], [1, 0], [1, 1]], minSize: 2 },
  { cells: [[0, 0], [1, 0], [1, 1]], minSize: 2 },
  { cells: [[0, 0], [0, 1], [1, 0], [1, 1]], minSize: 2 },
  { cells: [[0, 0], [0, 1], [0, 2], [1, 1]], minSize: 3 },
  { cells: [[0, 0], [1, 0], [2, 0], [1, 1]], minSize: 3 },
  { cells: [[0, 1], [1, 0], [1, 1], [1, 2]], minSize: 3 },
  { cells: [[0, 0], [0, 1], [1, 1], [2, 1]], minSize: 3 },
  { cells: [[0, 0], [0, 1], [0, 2], [0, 3]], minSize: 4 },
  { cells: [[0, 0], [1, 0], [2, 0], [3, 0]], minSize: 4 },
  { cells: [[0, 0], [0, 1], [1, 0], [2, 0], [2, 1]], minSize: 3 },
  { cells: [[0, 0], [0, 1], [0, 2], [1, 0], [2, 0]], minSize: 3 },
  { cells: [[0, 2], [1, 0], [1, 1], [1, 2], [2, 2]], minSize: 3 },
  { cells: [[0, 0], [0, 2], [1, 0], [1, 1], [1, 2]], minSize: 3 }
];

const PIECE_COLORS = [
  "#54a0a8",
  "#d09b4c",
  "#c96161",
  "#7c70c7",
  "#df6f52",
  "#6ab57a",
  "#4f8fcf",
  "#d7b84f",
  "#95e2a4",
  "#e8a94a"
];

const PIECE_NAMES = [
  "日符",
  "月符",
  "星符",
  "云符",
  "风符",
  "火符",
  "水符",
  "山符",
  "雷符",
  "泽符"
];

export function generateDailyChallenge(dateStr?: string, isHistoryReplay: boolean = false): Level {
  const date = dateStr ?? getTodayDateString();
  const seed = dateToSeed(date);
  const rand = mulberry32(seed);

  const sizeOptions = [5, 5, 5, 6, 6, 6, 7];
  const size = sizeOptions[Math.floor(rand() * sizeOptions.length)];

  const maxTargetArea = Math.floor(size * size * 0.55);
  const minTargetArea = Math.max(5, Math.floor(size * size * 0.25));
  const targetArea = minTargetArea + Math.floor(rand() * (maxTargetArea - minTargetArea + 1));

  const selectedTemplates: { cells: Cell[]; color: string; name: string; rotation: number }[] = [];
  let remainingArea = targetArea;
  const maxPieces = Math.min(8, Math.ceil(targetArea / 2));

  const usedColorIndices: number[] = [];
  const usedNameIndices: number[] = [];

  while (remainingArea > 0 && selectedTemplates.length < maxPieces) {
    const suitableTemplates = PIECE_TEMPLATES.filter(
      (t) => t.cells.length <= remainingArea && t.minSize <= size
    );
    if (suitableTemplates.length === 0) break;

    const template = suitableTemplates[Math.floor(rand() * suitableTemplates.length)];

    let colorIdx = Math.floor(rand() * PIECE_COLORS.length);
    while (usedColorIndices.includes(colorIdx) && usedColorIndices.length < PIECE_COLORS.length) {
      colorIdx = (colorIdx + 1) % PIECE_COLORS.length;
    }
    usedColorIndices.push(colorIdx);

    let nameIdx = Math.floor(rand() * PIECE_NAMES.length);
    while (usedNameIndices.includes(nameIdx) && usedNameIndices.length < PIECE_NAMES.length) {
      nameIdx = (nameIdx + 1) % PIECE_NAMES.length;
    }
    usedNameIndices.push(nameIdx);

    const rotation = Math.floor(rand() * 4);

    selectedTemplates.push({
      cells: template.cells,
      color: PIECE_COLORS[colorIdx],
      name: PIECE_NAMES[nameIdx],
      rotation
    });

    remainingArea -= template.cells.length;

    if (remainingArea > 0 && remainingArea < 2 && selectedTemplates.length > 0) {
      const lastIdx = selectedTemplates.length - 1;
      const last = selectedTemplates[lastIdx];
      const singleCell = PIECE_TEMPLATES.find((t) => t.cells.length === 1);
      if (singleCell && last.cells.length > 1) {
        selectedTemplates[lastIdx] = {
          ...last,
          cells: last.cells.slice(0, last.cells.length - remainingArea)
        };
        remainingArea = 0;
      }
    }
  }

  if (remainingArea > 0 && selectedTemplates.length > 0) {
    const lastIdx = selectedTemplates.length - 1;
    const last = selectedTemplates[lastIdx];
    const bigger = PIECE_TEMPLATES.find((t) => t.cells.length === last.cells.length + remainingArea);
    if (bigger) {
      selectedTemplates[lastIdx] = { ...last, cells: bigger.cells };
    } else {
      const singleCell = PIECE_TEMPLATES.find((t) => t.cells.length === 1)!;
      for (let i = 0; i < remainingArea; i += 1) {
        let cIdx = Math.floor(rand() * PIECE_COLORS.length);
        while (usedColorIndices.includes(cIdx) && usedColorIndices.length < PIECE_COLORS.length) {
          cIdx = (cIdx + 1) % PIECE_COLORS.length;
        }
        usedColorIndices.push(cIdx);

        let nIdx = Math.floor(rand() * PIECE_NAMES.length);
        while (usedNameIndices.includes(nIdx) && usedNameIndices.length < PIECE_NAMES.length) {
          nIdx = (nIdx + 1) % PIECE_NAMES.length;
        }
        usedNameIndices.push(nIdx);

        selectedTemplates.push({
          cells: singleCell.cells,
          color: PIECE_COLORS[cIdx],
          name: PIECE_NAMES[nIdx],
          rotation: 0
        });
      }
    }
  }

  const placedPieces: { cells: Cell[]; color: string; name: string }[] = [];
  const occupiedSet = new Set<string>();
  const targetSet = new Set<string>();

  for (let attempt = 0; attempt < 200; attempt += 1) {
    placedPieces.length = 0;
    occupiedSet.clear();
    targetSet.clear();
    let allPlaced = true;

    for (const template of selectedTemplates) {
      const rotatedCells = rotateCells(template.cells, template.rotation);
      const pieceRows = Math.max(...rotatedCells.map(([r]) => r)) + 1;
      const pieceCols = Math.max(...rotatedCells.map(([, c]) => c)) + 1;

      let placed = false;
      const positions: [number, number][] = [];
      for (let r = 0; r <= size - pieceRows; r += 1) {
        for (let c = 0; c <= size - pieceCols; c += 1) {
          positions.push([r, c]);
        }
      }

      for (let i = positions.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rand() * (i + 1));
        [positions[i], positions[j]] = [positions[j], positions[i]];
      }

      for (const [row, col] of positions) {
        const canPlace = rotatedCells.every(([dr, dc]) => {
          const nr = row + dr;
          const nc = col + dc;
          return nr >= 0 && nc >= 0 && nr < size && nc < size && !occupiedSet.has(`${nr}:${nc}`);
        });
        if (canPlace) {
          const placedCells: Cell[] = rotatedCells.map(([dr, dc]) => [row + dr, col + dc] as Cell);
          placedCells.forEach(([r, c]) => {
            occupiedSet.add(`${r}:${c}`);
            targetSet.add(`${r}:${c}`);
          });
          placedPieces.push({ cells: rotatedCells, color: template.color, name: template.name });
          placed = true;
          break;
        }
      }

      if (!placed) {
        allPlaced = false;
        break;
      }
    }

    if (allPlaced) break;
  }

  const target: Cell[] = Array.from(targetSet)
    .map((key) => key.split(":").map(Number) as Cell)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  const pieces: Piece[] = placedPieces.map((p, i) => {
    const minRow = Math.min(...p.cells.map(([r]) => r));
    const minCol = Math.min(...p.cells.map(([, c]) => c));
    const normalizedCells: Cell[] = p.cells.map(([r, c]) => [r - minRow, c - minCol] as Cell);
    return {
      id: `daily-${i}`,
      name: p.name,
      color: p.color,
      cells: normalizedCells
    };
  });

  const levelId = isHistoryReplay ? getHistoryReplayLevelId(date) : DAILY_CHALLENGE_LEVEL_ID;
  const levelName = isHistoryReplay ? `历史回放 ${date}` : `每日挑战 ${date}`;
  const pieceIdPrefix = isHistoryReplay ? `history-${date}-` : "daily-";

  if (pieces.length === 0) {
    return {
      id: levelId,
      name: levelName,
      size: 5,
      target: [
        [1, 1],
        [1, 2],
        [2, 1],
        [2, 2]
      ],
      pieces: [
        {
          id: `${pieceIdPrefix}fallback`,
          name: "方符",
          color: "#d7b84f",
          cells: [
            [0, 0],
            [0, 1],
            [1, 0],
            [1, 1]
          ]
        }
      ]
    };
  }

  const piecesWithIds = pieces.map((p, i) => ({
    ...p,
    id: `${pieceIdPrefix}${i}`
  }));

  return {
    id: levelId,
    name: levelName,
    size,
    target,
    pieces: piecesWithIds
  };
}
