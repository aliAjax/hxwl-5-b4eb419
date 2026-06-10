import { useEffect, useMemo, useRef, useState } from "react";

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
  lastPlayed: Record<string, string>;
};

const storageKey = "hxwl-5-runes";
const tutorialKey = "hxwl-5-runes-tutorial";

type TutorialStep = {
  id: string;
  title: string;
  description: string;
  target: string;
  position: "top" | "bottom" | "left" | "right";
};

const tutorialSteps: TutorialStep[] = [
  {
    id: "select",
    title: "第一步：选择碎片",
    description: "在右侧碎片列表中点击任意一个符文碎片来选中它。选中的碎片会显示金色边框。",
    target: "pieces",
    position: "left"
  },
  {
    id: "rotate",
    title: "第二步：旋转碎片",
    description: "选中碎片后，点击「旋转选中碎片」按钮可以让碎片顺时针旋转 90°，直到找到合适的方向。",
    target: "rotate",
    position: "bottom"
  },
  {
    id: "place",
    title: "第三步：放置碎片",
    description: "选中并旋转好碎片后，点击左侧棋盘上发光的目标格子，碎片会被放置到对应位置。",
    target: "board",
    position: "right"
  },
  {
    id: "reset",
    title: "第四步：重置棋盘",
    description: "如果放错了或者想重来，点击碎片面板顶部的「重置」按钮可以清空棋盘上所有已放置的碎片。",
    target: "reset",
    position: "bottom"
  },
  {
    id: "complete",
    title: "第五步：完成判定",
    description: "当所有发光的目标格子都恰好被碎片填满（不多不少），符文闭合，关卡即完成！",
    target: "hint",
    position: "bottom"
  }
];

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
    const parsed = JSON.parse(localStorage.getItem(storageKey) || "") as Save;
    if (!parsed.lastPlayed) {
      parsed.lastPlayed = {};
    }
    return parsed;
  } catch {
    return { levelId: levels[0].id, placements: [], completed: [], lastPlayed: {} };
  }
}

function cellKey(row: number, col: number) {
  return `${row}:${col}`;
}

function formatLastPlayed(isoString?: string): string {
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

type View = "hall" | "game";

type TutorialRefs = {
  pieces: React.RefObject<HTMLDivElement | null>;
  rotate: React.RefObject<HTMLButtonElement | null>;
  board: React.RefObject<HTMLDivElement | null>;
  reset: React.RefObject<HTMLButtonElement | null>;
  hint: React.RefObject<HTMLParagraphElement | null>;
};

function TutorialOverlay({
  step,
  stepIndex,
  totalSteps,
  targetRef,
  onNext,
  onPrev,
  onSkip
}: {
  step: TutorialStep;
  stepIndex: number;
  totalSteps: number;
  targetRef: React.RefObject<HTMLElement | null>;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
}) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    function updateRect() {
      if (targetRef.current) {
        setRect(targetRef.current.getBoundingClientRect());
      }
    }
    updateRect();
    window.addEventListener("resize", updateRect);
    window.addEventListener("scroll", updateRect);
    return () => {
      window.removeEventListener("resize", updateRect);
      window.removeEventListener("scroll", updateRect);
    };
  }, [targetRef, step]);

  if (!rect) return null;

  const padding = 8;
  const highlightStyle: React.CSSProperties = {
    top: rect.top - padding,
    left: rect.left - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2
  };

  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;
  const tooltipWidth = viewportW < 560 ? viewportW - 32 : 320;
  const tooltipHeight = 220;
  const gap = 16;
  const margin = 12;

  const isSingleColumn = viewportW < 900;

  function computePosition(pos: TutorialStep["position"], r: DOMRect): { style: React.CSSProperties; visible: boolean } {
    let style: React.CSSProperties = {};
    let visible = true;

    if (pos === "top") {
      let left = r.left + r.width / 2 - tooltipWidth / 2;
      left = Math.max(margin, Math.min(left, viewportW - tooltipWidth - margin));
      const top = r.top - gap - tooltipHeight;
      style = { top, left };
      if (top < margin) visible = false;
    } else if (pos === "bottom") {
      let left = r.left + r.width / 2 - tooltipWidth / 2;
      left = Math.max(margin, Math.min(left, viewportW - tooltipWidth - margin));
      const top = r.bottom + gap;
      style = { top, left };
      if (top + tooltipHeight > viewportH - margin) visible = false;
    } else if (pos === "left") {
      let top = r.top + r.height / 2 - tooltipHeight / 2;
      top = Math.max(margin, Math.min(top, viewportH - tooltipHeight - margin));
      const left = r.left - gap - tooltipWidth;
      style = { top, left };
      if (left < margin) visible = false;
    } else if (pos === "right") {
      let top = r.top + r.height / 2 - tooltipHeight / 2;
      top = Math.max(margin, Math.min(top, viewportH - tooltipHeight - margin));
      const left = r.right + gap;
      style = { top, left };
      if (left + tooltipWidth > viewportW - margin) visible = false;
    }

    return { style, visible };
  }

  const preferred = isSingleColumn
    ? step.position === "left" || step.position === "right"
      ? "bottom"
      : step.position
    : step.position;

  const order: TutorialStep["position"][] = (() => {
    const base: TutorialStep["position"][] = isSingleColumn
      ? ["bottom", "top"]
      : [preferred, "bottom", "top", "left", "right"];
    return Array.from(new Set(base));
  })();

  let tooltipStyle: React.CSSProperties = {};
  for (const pos of order) {
    const result = computePosition(pos, rect);
    if (result.visible) {
      tooltipStyle = result.style;
      break;
    }
    tooltipStyle = result.style;
  }

  return (
    <div className="tutorial-overlay">
      <div className="tutorial-mask" />
      <div className="tutorial-highlight" style={highlightStyle} />
      <div className="tutorial-tooltip" style={tooltipStyle}>
        <div className="tutorial-progress">
          {stepIndex + 1} / {totalSteps}
        </div>
        <h3 className="tutorial-title">{step.title}</h3>
        <p className="tutorial-description">{step.description}</p>
        <div className="tutorial-actions">
          <button className="tutorial-skip" onClick={onSkip}>
            跳过教程
          </button>
          <div className="tutorial-nav">
            {stepIndex > 0 && (
              <button className="tutorial-prev" onClick={onPrev}>
                上一步
              </button>
            )}
            <button className="tutorial-next" onClick={onNext}>
              {stepIndex === totalSteps - 1 ? "开始游戏" : "下一步"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function LevelSelectHall({
  levels,
  save,
  onSelectLevel,
  onOpenTutorial
}: {
  levels: Level[];
  save: Save;
  onSelectLevel: (levelId: string) => void;
  onOpenTutorial: () => void;
}) {
  const completedCount = save.completed.length;
  const totalCount = levels.length;

  return (
    <section className="level-hall">
      <div className="hall-header">
        <div>
          <p className="eyebrow">符文拼接室</p>
          <h1>选择关卡</h1>
        </div>
        <div className="hall-actions">
          <button className="tutorial-entry-btn" onClick={onOpenTutorial}>
            查看教程
          </button>
          <div className="progress-badge">
            <strong>{completedCount}</strong>
            <span>/ {totalCount} 已完成</span>
          </div>
        </div>
      </div>
      <div className="level-cards">
        {levels.map((item, index) => {
          const isCompleted = save.completed.includes(item.id);
          const lastPlayed = save.lastPlayed[item.id];
          return (
            <button
              className={`level-card ${isCompleted ? "completed" : ""}`}
              key={item.id}
              onClick={() => onSelectLevel(item.id)}
            >
              <div className="card-header">
                <span className="level-index">{String(index + 1).padStart(2, "0")}</span>
                {isCompleted && <span className="completed-badge">✓ 已完成</span>}
              </div>
              <h3 className="level-name">{item.name}</h3>
              <div className="level-meta">
                <span className="meta-item">
                  <i className="meta-icon board-icon" />
                  {item.size}×{item.size} 棋盘
                </span>
                <span className="meta-item">
                  <i className="meta-icon piece-icon" />
                  {item.pieces.length} 个碎片
                </span>
              </div>
              <div className="level-footer">
                <span className="last-played">
                  <i className="meta-icon clock-icon" />
                  {formatLastPlayed(lastPlayed)}
                </span>
                <span className="enter-arrow">开始 →</span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function loadTutorialCompleted(): boolean {
  try {
    return localStorage.getItem(tutorialKey) === "1";
  } catch {
    return false;
  }
}

export default function App() {
  const [save, setSave] = useState<Save>(loadSave);
  const [activePiece, setActivePiece] = useState<string | null>(null);
  const [rotation, setRotation] = useState(0);
  const [view, setView] = useState<View>("hall");
  const [showTutorial, setShowTutorial] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);
  const level = levels.find((item) => item.id === save.levelId) ?? levels[0];

  const tutorialRefs: TutorialRefs = {
    pieces: useRef<HTMLDivElement>(null),
    rotate: useRef<HTMLButtonElement>(null),
    board: useRef<HTMLDivElement>(null),
    reset: useRef<HTMLButtonElement>(null),
    hint: useRef<HTMLParagraphElement>(null)
  };

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(save));
  }, [save]);

  useEffect(() => {
    if (!loadTutorialCompleted() && view === "game" && !showTutorial) {
      const timer = setTimeout(() => {
        setShowTutorial(true);
        setTutorialStep(0);
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [view, showTutorial]);

  function completeTutorial() {
    localStorage.setItem(tutorialKey, "1");
    setShowTutorial(false);
    setTutorialStep(0);
  }

  function handleTutorialNext() {
    if (tutorialStep < tutorialSteps.length - 1) {
      setTutorialStep(tutorialStep + 1);
    } else {
      completeTutorial();
    }
  }

  function handleTutorialPrev() {
    if (tutorialStep > 0) {
      setTutorialStep(tutorialStep - 1);
    }
  }

  function openTutorial() {
    if (view !== "game") {
      switchLevel(levels[0].id);
    }
    setTimeout(() => {
      setShowTutorial(true);
      setTutorialStep(0);
    }, 100);
  }

  const currentStep = tutorialSteps[tutorialStep];
  const currentTutorialRef = tutorialRefs[currentStep?.target as keyof TutorialRefs] as React.RefObject<HTMLElement> | undefined;

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
    setSave((current) => ({
      ...current,
      levelId,
      placements: [],
      lastPlayed: { ...current.lastPlayed, [levelId]: new Date().toISOString() }
    }));
    setActivePiece(null);
    setRotation(0);
    setView("game");
  }

  function backToHall() {
    setView("hall");
    setActivePiece(null);
    setRotation(0);
  }

  if (view === "hall") {
    return (
      <main className="runes">
        <LevelSelectHall levels={levels} save={save} onSelectLevel={switchLevel} onOpenTutorial={openTutorial} />
      </main>
    );
  }

  return (
    <main className="runes">
      <section className="hero">
        <div>
          <p className="eyebrow">符文拼接室</p>
          <h1>把碎片压进发光的格子</h1>
        </div>
        <div className="game-header">
          <span className="current-level">当前：{level.name}</span>
          <button className="tutorial-reopen-btn" onClick={openTutorial}>
            教程
          </button>
          <button className="back-btn" onClick={backToHall}>← 返回关卡大厅</button>
        </div>
      </section>

      <section className="game">
        <div className="panel">
          <h2>目标</h2>
          <div ref={tutorialRefs.board} className="board" style={{ gridTemplateColumns: `repeat(${level.size}, 1fr)` }}>
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
          <p ref={tutorialRefs.hint} className={solved ? "hint solved" : "hint"}>{solved ? "符文已闭合，关卡完成。" : "选择碎片后点击棋盘放置，已放下的碎片可用重置清空。"}</p>
        </div>

        <aside className="panel">
          <div className="piece-head">
            <h2>碎片</h2>
            <button ref={tutorialRefs.reset} onClick={() => setSave((current) => ({ ...current, placements: [] }))}>重置</button>
          </div>
          <button ref={tutorialRefs.rotate} className="rotate" onClick={() => setRotation((value) => (value + 1) % 4)}>
            旋转选中碎片
          </button>
          <div ref={tutorialRefs.pieces} className="pieces">
            {level.pieces.map((piece) => (
              <button className={activePiece === piece.id ? "active" : ""} key={piece.id} onClick={() => setActivePiece(piece.id)}>
                <span style={{ background: piece.color }} />
                <strong>{piece.name}</strong>
              </button>
            ))}
          </div>
        </aside>
      </section>

      {showTutorial && currentStep && currentTutorialRef && (
        <TutorialOverlay
          step={currentStep}
          stepIndex={tutorialStep}
          totalSteps={tutorialSteps.length}
          targetRef={currentTutorialRef}
          onNext={handleTutorialNext}
          onPrev={handleTutorialPrev}
          onSkip={completeTutorial}
        />
      )}
    </main>
  );
}
