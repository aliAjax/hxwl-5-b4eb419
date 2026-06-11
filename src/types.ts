export type Cell = [number, number];

export type Piece = {
  id: string;
  name: string;
  color: string;
  cells: Cell[];
};

export type Level = {
  id: string;
  name: string;
  size: number;
  target: Cell[];
  pieces: Piece[];
};

export type Placement = {
  pieceId: string;
  row: number;
  col: number;
  rotation: number;
};

export type Stats = {
  steps: number;
  rotations: number;
  resets: number;
};

export type HistoryState = {
  placements: Placement[];
  activePiece: string | null;
  rotation: number;
  stats: Stats;
  showComplete: boolean;
};

export type Save = {
  levelId: string;
  placements: Placement[];
  completed: string[];
  lastPlayed: Record<string, string>;
  undoStack?: HistoryState[];
  redoStack?: HistoryState[];
};

export type LevelRecord = {
  firstCompletedAt: string;
  minSteps: number;
  minRotations: number;
  noResetCompleted: boolean;
  playCount: number;
  completedCount: number;
  lastCompletedAt: string;
  totalSteps: number;
  totalRotations: number;
};

export type Achievements = Record<string, LevelRecord>;

export type NewRecords = {
  newMinSteps: boolean;
  newMinRotations: boolean;
  firstNoReset: boolean;
  firstCompletion: boolean;
};

export type Settings = {
  soundEnabled: boolean;
  animationIntensity: number;
  theme: "dark" | "light";
  highlightTarget: boolean;
  practiceMode: boolean;
};

export type SoundType = "place" | "rotate" | "select" | "success" | "reset";

export type View = "hall" | "game";

export type CompletionFilter = "all" | "completed" | "uncompleted";
export type RecencyFilter = "all" | "recent";
export type SourceFilter = "all" | "preset" | "workshop";
export type FavoritesFilter = "all" | "favorites";
export type SortKey = "default" | "name-asc" | "name-desc" | "target-asc" | "target-desc";

export type HallFilters = {
  completion: CompletionFilter;
  recency: RecencyFilter;
  source: SourceFilter;
  favorites: FavoritesFilter;
  sort: SortKey;
  searchQuery: string;
};
