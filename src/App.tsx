import { useEffect, useMemo, useState } from "react";

type Cell = [number, number];

type Piece = {
  id: string;
  name: string;
  color: string;
  cells: Cell[];
};

type Level = {
  id: string;
  name: string;
  size: number;
  target: Cell[];
  pieces: Piece[];
};

type Placement = {
  pieceId: string;
  row: number;
  col: number;
  rotation: number;
};

type Save = {
  levelId: string;
  placements: Placement[];
  completed: string[];
};

const storageKey = "hxwl-5-runes";

const levels: Level[] = [
  {
    id: "gate",
    name: "门印",
    size: 5,
    target: [
      [1, 1],
      [1, 2],
      [1, 3],
      [2, 1],
      [3, 1],
      [3, 2],
      [3, 3],
      [2, 3]
    ],
    pieces: [
      { id: "left", name: "左折符", color: "#54a0a8", cells: [[0, 0], [1, 0], [2, 0]] },
      { id: "top", name: "顶梁符", color: "#d09b4c", cells: [[0, 0], [0, 1], [0, 2]] },
      { id: "right", name: "右折符", color: "#c96161", cells: [[0, 0], [1, 0], [2, 0]] },
      { id: "bottom", name: "底线符", color: "#7c70c7", cells: [[0, 0], [0, 1]] }
    ]
  },
  {
    id: "spark",
    name: "星火",
    size: 5,
    target: [
      [0, 2],
      [1, 2],
      [2, 0],
      [2, 1],
      [2, 2],
      [2, 3],
      [2, 4],
      [3, 2],
      [4, 2]
    ],
    pieces: [
      { id: "bar", name: "长横符", color: "#df6f52", cells: [[0, 0], [0, 1], [0, 2]] },
      { id: "bar2", name: "短横符", color: "#6ab57a", cells: [[0, 0], [0, 1]] },
      { id: "stem", name: "竖光符", color: "#4f8fcf", cells: [[0, 0], [1, 0], [2, 0]] },
      { id: "cap", name: "孤点符", color: "#d7b84f", cells: [[0, 0]] }
    ]
  },
  {
    id: "river",
    name: "回河",
    size: 6,
    target: [
      [1, 1],
      [1, 2],
      [1, 3],
      [2, 3],
      [3, 3],
      [3, 4],
      [4, 4],
      [4, 3],
      [4, 2]
    ],
    pieces: [
      { id: "zig", name: "折流符", color: "#54a0a8", cells: [[0, 0], [0, 1], [1, 1]] },
      { id: "line", name: "直流符", color: "#d09b4c", cells: [[0, 0], [1, 0], [2, 0]] },
      { id: "hook", name: "钩尾符", color: "#c96161", cells: [[0, 0], [1, 0], [1, 1]] },
      { id: "short", name: "回声符", color: "#7c70c7", cells: [[0, 0], [0, 1]] }
    ]
  }
];

function rotate(cells: Cell[], turns: number): Cell[] {
  let next = cells;
  for (let i = 0; i < turns % 4; i += 1) {
    next = next.map(([row, col]) => [col, -row]);
    const minRow = Math.min(...next.map(([row]) => row));
    const minCol = Math.min(...next.map(([, col]) => col));
    next = next.map(([row, col]) => [row - minRow, col - minCol]);
  }
  return next;
}

function loadSave(): Save {
  try {
    return JSON.parse(localStorage.getItem(storageKey) || "") as Save;
  } catch {
    return { levelId: levels[0].id, placements: [], completed: [] };
  }
}

function cellKey(row: number, col: number) {
  return `${row}:${col}`;
}

export default function App() {
  const [save, setSave] = useState<Save>(loadSave);
  const [activePiece, setActivePiece] = useState<string | null>(null);
  const [rotation, setRotation] = useState(0);
  const level = levels.find((item) => item.id === save.levelId) ?? levels[0];

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(save));
  }, [save]);

  const occupied = useMemo(() => {
    const map = new Map<string, string>();
    save.placements.forEach((placement) => {
      const piece = level.pieces.find((item) => item.id === placement.pieceId);
      if (!piece) return;
      rotate(piece.cells, placement.rotation).forEach(([row, col]) => map.set(cellKey(row + placement.row, col + placement.col), piece.color));
    });
    return map;
  }, [level, save.placements]);

  const solved = useMemo(() => {
    const target = new Set(level.target.map(([row, col]) => cellKey(row, col)));
    if (occupied.size !== target.size) return false;
    return [...occupied.keys()].every((key) => target.has(key));
  }, [level.target, occupied]);

  useEffect(() => {
    if (solved && !save.completed.includes(level.id)) {
      setSave((current) => ({ ...current, completed: [...current.completed, level.id] }));
    }
  }, [level.id, save.completed, solved]);

  function place(row: number, col: number) {
    if (!activePiece) return;
    const piece = level.pieces.find((item) => item.id === activePiece);
    if (!piece) return;
    const cells = rotate(piece.cells, rotation).map(([r, c]) => [r + row, c + col] as Cell);
    const out = cells.some(([r, c]) => r < 0 || c < 0 || r >= level.size || c >= level.size);
    const collision = cells.some(([r, c]) => occupied.has(cellKey(r, c)));
    if (out || collision) return;
    setSave((current) => ({ ...current, placements: [...current.placements, { pieceId: activePiece, row, col, rotation }] }));
    setActivePiece(null);
    setRotation(0);
  }

  function switchLevel(levelId: string) {
    setSave((current) => ({ ...current, levelId, placements: [] }));
    setActivePiece(null);
    setRotation(0);
  }

  return (
    <main className="runes">
      <section className="hero">
        <div>
          <p className="eyebrow">符文拼接室</p>
          <h1>把碎片压进发光的格子</h1>
        </div>
        <div className="level-tabs">
          {levels.map((item) => (
            <button className={item.id === level.id ? "active" : ""} key={item.id} onClick={() => switchLevel(item.id)}>
              {item.name}{save.completed.includes(item.id) ? " ✓" : ""}
            </button>
          ))}
        </div>
      </section>

      <section className="game">
        <div className="panel">
          <h2>目标</h2>
          <div className="board" style={{ gridTemplateColumns: `repeat(${level.size}, 1fr)` }}>
            {Array.from({ length: level.size * level.size }).map((_, index) => {
              const row = Math.floor(index / level.size);
              const col = index % level.size;
              const key = cellKey(row, col);
              return (
                <button
                  className={level.target.some(([r, c]) => r === row && c === col) ? "target" : ""}
                  key={key}
                  onClick={() => place(row, col)}
                >
                  {occupied.has(key) && <i style={{ background: occupied.get(key) }} />}
                </button>
              );
            })}
          </div>
          <p className={solved ? "hint solved" : "hint"}>{solved ? "符文已闭合，关卡完成。" : "选择碎片后点击棋盘放置，已放下的碎片可用重置清空。"}</p>
        </div>

        <aside className="panel">
          <div className="piece-head">
            <h2>碎片</h2>
            <button onClick={() => setSave((current) => ({ ...current, placements: [] }))}>重置</button>
          </div>
          <button className="rotate" onClick={() => setRotation((value) => (value + 1) % 4)}>
            旋转选中碎片
          </button>
          <div className="pieces">
            {level.pieces.map((piece) => (
              <button className={activePiece === piece.id ? "active" : ""} key={piece.id} onClick={() => setActivePiece(piece.id)}>
                <span style={{ background: piece.color }} />
                <strong>{piece.name}</strong>
              </button>
            ))}
          </div>
        </aside>
      </section>
    </main>
  );
}
