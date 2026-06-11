import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  generateDailyChallenge,
  getDailyRecord,
  updateDailyRecord,
  updateHistoryRecord,
  touchDailyPlayed,
  touchHistoryPlayed,
  getTodayDateString,
  calculateStreak,
  getDailyRecordsForDays,
  DAILY_CHALLENGE_LEVEL_ID,
  isHistoryReplayLevelId,
  extractDateFromHistoryLevelId,
  NO_RECORD,
  type DailyChallengeRecord,
  type DailyRecordWithDate
} from "./dailyChallenge";
import WorkshopPanel, { WORKSHOP_LEVEL_PREFIX } from "./WorkshopPanel";
import ImportLevelDialog from "./ImportLevelDialog";
import { exportLevelToJson, copyToClipboard } from "./levelImportExport";
import {
  solveLevel,
  getHint,
  clearLevelCache,
  type SolverResult,
  type HintResult,
  type SolverStatus
} from "./solver";
import {
  useSave,
  loadTutorialCompleted,
  saveTutorialCompleted,
  WORKSHOP_STORAGE_KEY,
  FAVORITES_KEY
} from "./hooks/useSave";
import { useAchievements, loadAchievements } from "./hooks/useAchievements";
import { useFavorites } from "./hooks/useFavorites";
import { useSettings } from "./hooks/useSettings";
import { useWorkshop } from "./hooks/useWorkshop";
import { useUndoRedo } from "./hooks/useUndoRedo";
import { cellKey, rotateCells, formatLastPlayed } from "./boardUtils";
import { writeLocalStorage, readLocalStorage } from "./hooks/useLocalStorage";
import { STORAGE_KEY } from "./hooks/useSave";
import type {
  Cell,
  Piece,
  Level,
  Placement,
  HistoryState,
  Save,
  LevelRecord,
  Achievements,
  NewRecords,
  Settings,
  SoundType,
  View,
  Stats,
  HallFilters,
  SortKey
} from "./types";

function SettingsPanel({
  open,
  settings,
  onClose,
  onChange
}: {
  open: boolean;
  settings: Settings;
  onClose: () => void;
  onChange: (next: Settings) => void;
}) {
  if (!open) return null;
  const setPartial = (patch: Partial<Settings>) => onChange({ ...settings, ...patch });

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2 className="settings-title">游戏设置</h2>
          <button className="settings-close" onClick={onClose} aria-label="关闭设置">
            ×
          </button>
        </div>
        <div className="settings-group">
          <div className="settings-item">
            <label className="settings-label">
              音效
              <span className="settings-desc">放置、旋转、完成等操作声音</span>
            </label>
            <button
              className={`switch ${settings.soundEnabled ? "on" : ""}`}
              onClick={() => setPartial({ soundEnabled: !settings.soundEnabled })}
              role="switch"
              aria-checked={settings.soundEnabled}
              aria-label="音效开关"
            />
          </div>

          <div className="settings-item">
            <label className="settings-label">
              主题
              <span className="settings-desc">深色符文风格或浅色纸页风格</span>
            </label>
            <div className="theme-picker">
              {(["dark", "light"] as const).map((theme) => (
                <button
                  key={theme}
                  className={`theme-pick ${settings.theme === theme ? "active" : ""}`}
                  onClick={() => setPartial({ theme })}
                  data-theme={theme}
                  aria-label={`切换到${theme === "dark" ? "深色" : "浅色"}主题`}
                  title={theme === "dark" ? "深色符文" : "浅色纸页"}
                >
                  <span className="swatch" />
                  <span className="swatch" />
                  <span className="swatch" />
                  <span className="swatch" />
                </button>
              ))}
            </div>
          </div>

          <div className="settings-item">
            <label className="settings-label">
              动效强度
              <span className="settings-desc">棋盘及碎片动画的强度与速度</span>
            </label>
            <div className="slider-wrap">
              <input
                className="slider"
                type="range"
                min={0}
                max={100}
                step={5}
                value={settings.animationIntensity}
                onChange={(e) => setPartial({ animationIntensity: Number(e.target.value) })}
                aria-label="动效强度"
              />
              <span className="slider-value">{settings.animationIntensity}%</span>
            </div>
          </div>

          <div className="settings-item">
            <label className="settings-label">
              目标格高亮
              <span className="settings-desc">发光边框提示需要填充的位置</span>
            </label>
            <button
              className={`switch ${settings.highlightTarget ? "on" : ""}`}
              onClick={() => setPartial({ highlightTarget: !settings.highlightTarget })}
              role="switch"
              aria-checked={settings.highlightTarget}
              aria-label="目标格高亮开关"
            />
          </div>

          <div className="settings-item">
            <label className="settings-label">
              练习模式
              <span className="settings-desc">开启放置辅助预览，完成不计入成就记录</span>
            </label>
            <button
              className={`switch ${settings.practiceMode ? "on" : ""}`}
              onClick={() => setPartial({ practiceMode: !settings.practiceMode })}
              role="switch"
              aria-checked={settings.practiceMode}
              aria-label="练习模式开关"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

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
  const gap = 16;
  const margin = 12;
  const tooltipHeight = Math.min(220, viewportH - margin * 2);

  const isSingleColumn = viewportW < 900;

  function computePosition(pos: TutorialStep["position"], r: DOMRect): { style: React.CSSProperties; visible: boolean } {
    let style: React.CSSProperties = {};
    let top = 0;
    let left = 0;

    if (pos === "top") {
      left = r.left + r.width / 2 - tooltipWidth / 2;
      left = Math.max(margin, Math.min(left, viewportW - tooltipWidth - margin));
      top = r.top - gap - tooltipHeight;
    } else if (pos === "bottom") {
      left = r.left + r.width / 2 - tooltipWidth / 2;
      left = Math.max(margin, Math.min(left, viewportW - tooltipWidth - margin));
      top = r.bottom + gap;
    } else if (pos === "left") {
      top = r.top + r.height / 2 - tooltipHeight / 2;
      top = Math.max(margin, Math.min(top, viewportH - tooltipHeight - margin));
      left = r.left - gap - tooltipWidth;
    } else if (pos === "right") {
      top = r.top + r.height / 2 - tooltipHeight / 2;
      top = Math.max(margin, Math.min(top, viewportH - tooltipHeight - margin));
      left = r.right + gap;
    }

    style = { top, left };
    const visible =
      top >= margin &&
      left >= margin &&
      top + tooltipHeight <= viewportH - margin &&
      left + tooltipWidth <= viewportW - margin;

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

  tooltipStyle = {
    ...tooltipStyle,
    top: Math.max(margin, Math.min(Number(tooltipStyle.top ?? margin), viewportH - tooltipHeight - margin)),
    left: Math.max(margin, Math.min(Number(tooltipStyle.left ?? margin), viewportW - tooltipWidth - margin))
  };

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

function AchievementPanel({
  open,
  levels,
  workshopLevels,
  dailyStreak,
  onClose
}: {
  open: boolean;
  levels: Level[];
  workshopLevels: Level[];
  dailyStreak: number;
  onClose: () => void;
}) {
  if (!open) return null;
  const achievements = loadAchievements();
  const presetLevels = levels.filter((l) => !l.id.startsWith(WORKSHOP_LEVEL_PREFIX));
  const workshopLevelList = workshopLevels;
  const completedLevels = presetLevels.filter((l) => achievements[l.id]?.firstCompletedAt);
  const totalCount = presetLevels.length;
  const completedCount = completedLevels.length;
  const totalNoReset = completedLevels.filter((l) => achievements[l.id].noResetCompleted).length;
  const totalPlayCount = Object.values(achievements).reduce((sum, r) => sum + r.playCount, 0);
  const totalCompletedCount = Object.values(achievements).reduce((sum, r) => sum + r.completedCount, 0);
  const workshopCompletedCount = workshopLevelList.filter((l) => achievements[l.id]?.firstCompletedAt).length;
  const allLastCompleted = Object.values(achievements)
    .map((r) => r.lastCompletedAt)
    .filter(Boolean)
    .sort()
    .reverse();
  const lastCompletedAt = allLastCompleted[0] || null;

  return (
    <div className="achievement-overlay" onClick={onClose}>
      <div className="achievement-panel" onClick={(e) => e.stopPropagation()}>
        <div className="achievement-header">
          <h2 className="achievement-title">个人档案</h2>
          <button className="achievement-close" onClick={onClose} aria-label="关闭成就面板">
            ×
          </button>
        </div>

        <div className="achievement-summary">
          <div className="summary-card">
            <span className="summary-value">{totalPlayCount}</span>
            <span className="summary-label">总游玩次数</span>
          </div>
          <div className="summary-card">
            <span className="summary-value">{totalCompletedCount}</span>
            <span className="summary-label">总完成次数</span>
          </div>
          <div className="summary-card">
            <span className="summary-value">{completedCount}/{totalCount}</span>
            <span className="summary-label">已完成关卡</span>
          </div>
          <div className="summary-card">
            <span className="summary-value">{totalNoReset}</span>
            <span className="summary-label">无重置通关</span>
          </div>
          <div className="summary-card">
            <span className="summary-value">{dailyStreak > 0 ? dailyStreak : "—"}</span>
            <span className="summary-label">每日连续天数</span>
          </div>
          <div className="summary-card">
            <span className="summary-value">{workshopCompletedCount}</span>
            <span className="summary-label">工坊完成数</span>
          </div>
        </div>

        {lastCompletedAt && (
          <div className="achievement-last-completed">
            最近完成：{formatLastPlayed(lastCompletedAt)}
          </div>
        )}

        <div className="achievement-list">
          {levels.map((level) => {
            const record = achievements[level.id];
            if (!record || !record.firstCompletedAt) {
              const playCount = record?.playCount;
              return (
                <div className="achievement-row locked" key={level.id}>
                  <div className="achievement-row-name">
                    <span className="achievement-lock-icon">🔒</span>
                    {level.name}
                  </div>
                  <div className="achievement-row-status">
                    {playCount ? `游玩 ${playCount} 次 · 未完成` : "未完成"}
                  </div>
                </div>
              );
            }
            return (
              <div className="achievement-row" key={level.id}>
                <div className="achievement-row-name">
                  <span className="achievement-unlock-icon">✦</span>
                  {level.name}
                </div>
                <div className="achievement-row-details">
                  <div className="achievement-detail">
                    <span className="detail-label">首次完成</span>
                    <span className="detail-value">{formatLastPlayed(record.firstCompletedAt)}</span>
                  </div>
                  <div className="achievement-detail">
                    <span className="detail-label">最低步数</span>
                    <span className="detail-value accent">{record.minSteps}</span>
                  </div>
                  <div className="achievement-detail">
                    <span className="detail-label">最低旋转</span>
                    <span className="detail-value accent">{record.minRotations}</span>
                  </div>
                  <div className="achievement-detail">
                    <span className="detail-label">无重置通关</span>
                    <span className={`detail-value ${record.noResetCompleted ? "success" : "dim"}`}>
                      {record.noResetCompleted ? "✓" : "—"}
                    </span>
                  </div>
                  <div className="achievement-detail">
                    <span className="detail-label">游玩/完成</span>
                    <span className="detail-value">{record.playCount}/{record.completedCount}</span>
                  </div>
                  <div className="achievement-detail">
                    <span className="detail-label">最近完成</span>
                    <span className="detail-value">{formatLastPlayed(record.lastCompletedAt)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CompleteModal({
  open,
  levelName,
  stats,
  hasNext,
  newRecords,
  onClose,
  onNext,
  onBackToHall,
  isHistoryReplay,
  isPracticeMode
}: {
  open: boolean;
  levelName: string;
  stats: Stats;
  hasNext: boolean;
  newRecords: NewRecords;
  onClose: () => void;
  onNext: () => void;
  onBackToHall: () => void;
  isHistoryReplay?: boolean;
  isPracticeMode?: boolean;
}) {
  if (!open) return null;
  const hasAnyRecord = newRecords.newMinSteps || newRecords.newMinRotations || newRecords.firstNoReset || newRecords.firstCompletion;
  const recordLabels: string[] = [];
  if (newRecords.firstCompletion) recordLabels.push("首次通关");
  if (newRecords.newMinSteps) recordLabels.push("最低步数");
  if (newRecords.newMinRotations) recordLabels.push("最低旋转");
  if (newRecords.firstNoReset) recordLabels.push("首次零重置");
  return (
    <div className="complete-overlay" onClick={onClose}>
      <div className={`complete-panel ${isHistoryReplay ? "history-replay-panel" : ""} ${isPracticeMode ? "practice-panel" : ""}`} onClick={(e) => e.stopPropagation()}>
        <div className="complete-header">
          <div className={`complete-icon ${isHistoryReplay ? "history-icon" : ""} ${isPracticeMode ? "practice-icon" : ""}`}>
            {isPracticeMode ? "🧪" : isHistoryReplay ? "⏪" : "✦"}
          </div>
          <h2 className={`complete-title ${isHistoryReplay ? "history-title" : ""} ${isPracticeMode ? "practice-title" : ""}`}>
            {isPracticeMode ? "练习完成" : isHistoryReplay ? "历史回放完成" : "符文已闭合"}
          </h2>
          <p className="complete-level">{levelName}</p>
          {isPracticeMode && (
            <p className="complete-practice-note">练习模式不记录成就与统计数据</p>
          )}
          {isHistoryReplay && (
            <p className="complete-history-note">历史回放不影响每日挑战连续天数</p>
          )}
        </div>
        <div className="complete-stats">
          <div className={`stat-item ${newRecords.newMinSteps ? "new-record" : ""}`}>
            <span className="stat-label">使用步数</span>
            <span className="stat-value">{stats.steps}</span>
            {newRecords.newMinSteps && !isPracticeMode && <span className="record-badge">新纪录</span>}
          </div>
          <div className={`stat-item ${newRecords.newMinRotations ? "new-record" : ""}`}>
            <span className="stat-label">旋转次数</span>
            <span className="stat-value">{stats.rotations}</span>
            {newRecords.newMinRotations && !isPracticeMode && <span className="record-badge">新纪录</span>}
          </div>
          <div className={`stat-item ${newRecords.firstNoReset ? "new-record" : ""}`}>
            <span className="stat-label">重置次数</span>
            <span className="stat-value">{stats.resets}</span>
            {newRecords.firstNoReset && !isPracticeMode && <span className="record-badge no-reset-badge">首次零重置</span>}
          </div>
        </div>
        {hasAnyRecord && !isPracticeMode && (
          <div className="complete-record-banner">
            🏆 刷新纪录：{recordLabels.join(" · ")}
          </div>
        )}
        <div className="complete-actions">
          <button className="complete-btn secondary" onClick={onBackToHall}>
            返回关卡大厅
          </button>
          <button className="complete-btn primary" onClick={onNext}>
            {hasNext ? "下一关 →" : "完成全部关卡"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PieceThumbnail({ piece }: { piece: Piece }) {
  const rows = Math.max(...piece.cells.map(([r]) => r)) + 1;
  const cols = Math.max(...piece.cells.map(([, c]) => c)) + 1;
  const cellSet = useMemo(
    () => new Set(piece.cells.map(([r, c]) => cellKey(r, c))),
    [piece.cells]
  );
  return (
    <div className="piece-thumb" title={`${piece.name}（${piece.cells.length} 格）`}>
      <div
        className="piece-thumb-grid"
        style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
      >
        {Array.from({ length: rows * cols }).map((_, index) => {
          const row = Math.floor(index / cols);
          const col = index % cols;
          const filled = cellSet.has(cellKey(row, col));
          return (
            <span
              key={`${row}:${col}`}
              className="piece-thumb-cell"
              style={filled ? { background: piece.color } : undefined}
            />
          );
        })}
      </div>
    </div>
  );
}

function LevelPreview({ level }: { level: Level }) {
  const targetSet = useMemo(
    () => new Set(level.target.map(([r, c]) => cellKey(r, c))),
    [level.target]
  );
  return (
    <div className="level-preview">
      <div className="preview-section">
        <div className="preview-label">目标形状</div>
        <div className="preview-grid-wrap">
          <div
            className="preview-grid"
            style={{ gridTemplateColumns: `repeat(${level.size}, 1fr)` }}
          >
            {Array.from({ length: level.size * level.size }).map((_, index) => {
              const row = Math.floor(index / level.size);
              const col = index % level.size;
              const isTarget = targetSet.has(cellKey(row, col));
              return (
                <span
                  key={`${row}:${col}`}
                  className={isTarget ? "preview-cell target" : "preview-cell"}
                />
              );
            })}
          </div>
        </div>
      </div>
      <div className="preview-section">
        <div className="preview-label">符文碎片（{level.pieces.length}）</div>
        <div className="preview-pieces">
          {level.pieces.map((piece) => (
            <PieceThumbnail key={piece.id} piece={piece} />
          ))}
        </div>
      </div>
    </div>
  );
}

function DailyChallengeCard({
  onSelect,
  onOpenCalendar,
  dailyRecord,
  todayDate,
  streak
}: {
  onSelect: () => void;
  onOpenCalendar: () => void;
  dailyRecord: DailyChallengeRecord;
  todayDate: string;
  streak: number;
}) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  const msUntilTomorrow = tomorrow.getTime() - now.getTime();
  const hours = Math.floor(msUntilTomorrow / 3600000);
  const minutes = Math.floor((msUntilTomorrow % 3600000) / 60000);
  const countdownText = `${hours}小时${minutes}分后刷新`;

  return (
    <div className="daily-challenge-card">
      <div className="daily-card-glow" />
      <div className="daily-card-content">
        <div className="daily-card-header">
          <div>
            <p className="eyebrow daily-eyebrow">
              <span className="sparkle-icon">✦</span>
              每日挑战
            </p>
            <h2 className="daily-title">{todayDate}</h2>
          </div>
          <div className="daily-countdown">
            <span className="countdown-label">距刷新</span>
            <span className="countdown-value">{countdownText}</span>
          </div>
        </div>
        <div className="daily-card-body">
          <div className="daily-description">
            今天的符文由日期生成，独一无二，次日更新
          </div>
          <div className="daily-stats">
            {dailyRecord.completed ? (
              <>
                <span className="daily-status completed">
                  <span className="status-check">✓</span>
                  今日已完成
                </span>
                <span className="daily-record-item">
                  最低步数 <strong>{dailyRecord.minSteps}</strong>
                </span>
                <span className="daily-record-item">
                  最低旋转 <strong>{dailyRecord.minRotations}</strong>
                </span>
              </>
            ) : (
              <span className="daily-status pending">⚡ 尚未挑战</span>
            )}
            {dailyRecord.lastPlayed && (
              <span className="daily-last-played">
                最近游玩：{formatLastPlayed(dailyRecord.lastPlayed)}
              </span>
            )}
            {streak > 0 && (
              <span className="daily-streak">
                🔥 连续完成 <strong>{streak}</strong> 天
              </span>
            )}
          </div>
        </div>
        <div className="daily-card-footer">
          <button className="daily-calendar-btn" onClick={(e) => { e.stopPropagation(); onOpenCalendar(); }}>
            📅 挑战记录
          </button>
          <button className="daily-cta-btn" onClick={onSelect}>
            {dailyRecord.completed ? "再来一次 →" : "开始挑战 →"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DailyCalendarPanel({
  open,
  onClose,
  todayDate,
  refreshKey,
  streak,
  onSelectHistory
}: {
  open: boolean;
  onClose: () => void;
  todayDate: string;
  refreshKey: number;
  streak: number;
  onSelectHistory: (dateStr: string) => void;
}) {
  const records = useMemo<DailyRecordWithDate[]>(() => {
    if (!open) return [];
    return getDailyRecordsForDays(30);
  }, [open, todayDate, refreshKey]);

  if (!open) return null;

  const completedDays = records.filter((r) => r.record.completed).length;
  const playedDays = records.filter((r) => r.record.lastPlayed || r.record.historyLastPlayed).length;

  function isPastDate(dateStr: string): boolean {
    return dateStr < todayDate;
  }

  return (
    <div className="daily-calendar-overlay" onClick={onClose}>
      <div className="daily-calendar-panel" onClick={(e) => e.stopPropagation()}>
        <div className="daily-calendar-header">
          <h2 className="daily-calendar-title">挑战日历</h2>
          <button className="daily-calendar-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>
        <div className="daily-calendar-summary">
          <div className="calendar-summary-card">
            <span className="calendar-summary-value streak-value">🔥 {streak}</span>
            <span className="calendar-summary-label">连续天数</span>
          </div>
          <div className="calendar-summary-card">
            <span className="calendar-summary-value">✓ {completedDays}</span>
            <span className="calendar-summary-label">完成天数</span>
          </div>
          <div className="calendar-summary-card">
            <span className="calendar-summary-value">🎮 {playedDays}</span>
            <span className="calendar-summary-label">游玩天数</span>
          </div>
        </div>
        <div className="calendar-legend">
          <span className="legend-item"><span className="legend-dot daily-dot" /> 每日挑战</span>
          <span className="legend-item"><span className="legend-dot history-dot" /> 历史回放</span>
        </div>
        <div className="daily-calendar-list">
          {records.map(({ date, record }) => {
            const isToday = date === todayDate;
            const isPast = isPastDate(date);
            const hasData = record.completed || record.lastPlayed;
            const hasHistoryData = record.historyMinSteps < NO_RECORD || record.historyLastPlayed;
            return (
              <div
                key={date}
                className={`calendar-day-row ${record.completed ? "completed" : ""} ${isToday ? "today" : ""} ${!hasData && !hasHistoryData ? "empty" : ""} ${isPast ? "past-date" : ""}`}
              >
                <div className="calendar-day-date">
                  <span className="calendar-day-label">{date.slice(5)}</span>
                  {isToday && <span className="calendar-today-badge">今天</span>}
                  {isPast && !isToday && <span className="calendar-history-badge">可回放</span>}
                </div>
                <div className="calendar-day-status">
                  {record.completed ? (
                    <span className="calendar-status completed">✓ 完成</span>
                  ) : record.lastPlayed ? (
                    <span className="calendar-status played">已游玩</span>
                  ) : (
                    <span className="calendar-status none">未挑战</span>
                  )}
                </div>
                <div className="calendar-day-details">
                  {record.completed && record.minSteps < NO_RECORD && (
                    <span className="calendar-detail">
                      <span className="detail-tag daily-tag">当日</span>
                      步数 <strong>{record.minSteps}</strong> / 旋转 <strong>{record.minRotations}</strong>
                    </span>
                  )}
                  {hasHistoryData && (
                    <span className="calendar-detail history-detail">
                      <span className="detail-tag history-tag">回放</span>
                      步数 <strong>{record.historyMinSteps < NO_RECORD ? record.historyMinSteps : "—"}</strong> / 旋转 <strong>{record.historyMinRotations < NO_RECORD ? record.historyMinRotations : "—"}</strong>
                    </span>
                  )}
                  {record.lastPlayed && (
                    <span className="calendar-detail-time">
                      {formatLastPlayed(record.lastPlayed)}
                    </span>
                  )}
                  {record.historyLastPlayed && !record.lastPlayed && (
                    <span className="calendar-detail-time">
                      回放: {formatLastPlayed(record.historyLastPlayed)}
                    </span>
                  )}
                </div>
                {isPast && (
                  <button
                    className="calendar-replay-btn"
                    onClick={() => onSelectHistory(date)}
                    title={`回放 ${date} 的挑战`}
                  >
                    ⏪ 回放
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

type LevelWithSource = Level & { source: "preset" | "workshop"; presetIndex?: number };

function LevelSelectHall({
  levels,
  workshopLevels,
  save,
  filters,
  onFiltersChange,
  onSelectLevel,
  onOpenTutorial,
  onOpenSettings,
  onOpenAchievements,
  onOpenWorkshop,
  onSelectDaily,
  onOpenCalendar,
  dailyRecord,
  todayDate,
  streak,
  onRenameLevel,
  onDeleteLevel,
  onDuplicateLevel,
  onExportLevel,
  onOpenImport,
  favorites,
  onToggleFavorite
}: {
  levels: Level[];
  workshopLevels: Level[];
  save: Save;
  filters: HallFilters;
  onFiltersChange: (filters: HallFilters) => void;
  onSelectLevel: (levelId: string) => void;
  onOpenTutorial: () => void;
  onOpenSettings: () => void;
  onOpenAchievements: () => void;
  onOpenWorkshop: () => void;
  onSelectDaily: () => void;
  onOpenCalendar: () => void;
  dailyRecord: DailyChallengeRecord;
  todayDate: string;
  streak: number;
  onRenameLevel: (levelId: string) => void;
  onDeleteLevel: (levelId: string) => void;
  onDuplicateLevel: (levelId: string) => void;
  onExportLevel: (levelId: string) => void;
  onOpenImport: () => void;
  favorites: string[];
  onToggleFavorite: (levelId: string) => void;
}) {
  const completedCount = save.completed.length;
  const totalCount = levels.length + workshopLevels.length;
  const RECENT_DAYS = 7;

  const allLevelsWithSource = useMemo<LevelWithSource[]>(() => {
    const preset: LevelWithSource[] = levels.map((l, i) => ({ ...l, source: "preset", presetIndex: i }));
    const workshop: LevelWithSource[] = workshopLevels.map((l) => ({ ...l, source: "workshop" }));
    return [...preset, ...workshop];
  }, [levels, workshopLevels]);

  const recentCutoff = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - RECENT_DAYS);
    return d.getTime();
  }, []);

  const displayedLevels = useMemo(() => {
    let result = [...allLevelsWithSource];

    if (filters.searchQuery.trim()) {
      const query = filters.searchQuery.trim().toLowerCase();
      result = result.filter((l) =>
        l.name.toLowerCase().includes(query)
      );
    }

    if (filters.favorites === "favorites") {
      result = result.filter((l) => favorites.includes(l.id));
    }

    if (filters.completion === "completed") {
      result = result.filter((l) => save.completed.includes(l.id));
    } else if (filters.completion === "uncompleted") {
      result = result.filter((l) => !save.completed.includes(l.id));
    }

    if (filters.recency === "recent") {
      result = result.filter((l) => {
        const lp = save.lastPlayed[l.id];
        if (!lp) return false;
        return new Date(lp).getTime() >= recentCutoff;
      });
    }

    if (filters.source === "preset") {
      result = result.filter((l) => l.source === "preset");
    } else if (filters.source === "workshop") {
      result = result.filter((l) => l.source === "workshop");
    }

    switch (filters.sort) {
      case "name-asc":
        result.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
        break;
      case "name-desc":
        result.sort((a, b) => b.name.localeCompare(a.name, "zh-CN"));
        break;
      case "target-asc":
        result.sort((a, b) => a.target.length - b.target.length);
        break;
      case "target-desc":
        result.sort((a, b) => b.target.length - a.target.length);
        break;
      default:
        break;
    }

    return result;
  }, [allLevelsWithSource, filters, save.completed, save.lastPlayed, recentCutoff, favorites]);

  const updateFilter = <K extends keyof HallFilters>(key: K, value: HallFilters[K]) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const clearAllFilters = () => {
    onFiltersChange({
      completion: "all",
      recency: "all",
      source: "all",
      favorites: "all",
      sort: "default",
      searchQuery: ""
    });
  };

  const hasActiveFilters =
    filters.completion !== "all" ||
    filters.recency !== "all" ||
    filters.source !== "all" ||
    filters.favorites !== "all" ||
    filters.sort !== "default" ||
    filters.searchQuery.trim() !== "";

  function renderLevelCard(item: LevelWithSource) {
    const isCompleted = save.completed.includes(item.id);
    const lastPlayed = save.lastPlayed[item.id];
    const isWorkshop = item.source === "workshop";
    const isFavorite = favorites.includes(item.id);
    return (
      <div
        className={`level-card ${isCompleted ? "completed" : ""} ${isWorkshop ? "workshop-card" : ""} ${isFavorite ? "favorite-card" : ""}`}
        key={item.id}
      >
        <div className="card-clickable" onClick={() => onSelectLevel(item.id)}>
          <div className="card-header">
            <div className="card-header-left">
              {item.source === "preset" && item.presetIndex !== undefined ? (
                <span className="level-index">{String(item.presetIndex + 1).padStart(2, "0")}</span>
              ) : (
                <span className="workshop-level-tag">✨ 工坊</span>
              )}
              {isCompleted && <span className="completed-badge">✓ 已完成</span>}
            </div>
            <button
              className={`favorite-btn ${isFavorite ? "favorited" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite(item.id);
              }}
              title={isFavorite ? "取消收藏" : "收藏关卡"}
              aria-label={isFavorite ? "取消收藏" : "收藏关卡"}
            >
              {isFavorite ? "★" : "☆"}
            </button>
          </div>
          <h3 className="level-name">{item.name}</h3>
          <LevelPreview level={item} />
          <div className="level-meta">
            <span className="meta-item">
              <i className="meta-icon board-icon" />
              {item.size}×{item.size} 棋盘
            </span>
            <span className="meta-item">
              <i className="meta-icon target-icon" />
              {item.target.length} 目标格
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
        </div>
        {isWorkshop && (
          <div className="card-actions">
            <button
              className="card-action-btn rename-btn"
              onClick={(e) => {
                e.stopPropagation();
                onRenameLevel(item.id);
              }}
              title="重命名"
            >
              ✏️ 重命名
            </button>
            <button
              className="card-action-btn duplicate-btn"
              onClick={(e) => {
                e.stopPropagation();
                onDuplicateLevel(item.id);
              }}
              title="复制"
            >
              📋 复制
            </button>
            <button
              className="card-action-btn export-btn-card"
              onClick={(e) => {
                e.stopPropagation();
                onExportLevel(item.id);
              }}
              title="导出"
            >
              📤 导出
            </button>
            <button
              className="card-action-btn delete-btn"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteLevel(item.id);
              }}
              title="删除"
            >
              🗑️ 删除
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <section className="level-hall">
      <div className="hall-header">
        <div>
          <p className="eyebrow">符文拼接室</p>
          <h1>选择关卡</h1>
        </div>
        <div className="hall-actions">
          <div className="hall-search-wrap">
            <i className="search-icon" />
            <input
              className="hall-search-input"
              type="text"
              placeholder="搜索关卡名称…"
              value={filters.searchQuery}
              onChange={(e) => updateFilter("searchQuery", e.target.value)}
              aria-label="搜索关卡"
            />
            {filters.searchQuery && (
              <button
                className="search-clear-btn"
                onClick={() => updateFilter("searchQuery", "")}
                aria-label="清除搜索"
              >
                ×
              </button>
            )}
          </div>
          <button className="workshop-entry-btn" onClick={onOpenWorkshop}>
            ✨ 创作工坊
          </button>
          <button className="import-entry-btn" onClick={onOpenImport}>
            📥 导入关卡
          </button>
          <button className="achievement-btn" onClick={onOpenAchievements}>
            🏆 成就
          </button>
          <button className="settings-btn" onClick={onOpenSettings}>
            ⚙ 设置
          </button>
          <button className="tutorial-entry-btn" onClick={onOpenTutorial}>
            查看教程
          </button>
          <div className="progress-badge">
            <strong>{completedCount}</strong>
            <span>/ {totalCount} 已完成</span>
          </div>
        </div>
      </div>

      <DailyChallengeCard
        onSelect={onSelectDaily}
        onOpenCalendar={onOpenCalendar}
        dailyRecord={dailyRecord}
        todayDate={todayDate}
        streak={streak}
      />

      <div className="filters-panel">
        <div className="filter-group">
          <span className="filter-label">完成状态</span>
          <div className="filter-chips">
            <button
              className={`filter-chip ${filters.completion === "all" ? "active" : ""}`}
              onClick={() => updateFilter("completion", "all")}
            >
              全部
            </button>
            <button
              className={`filter-chip ${filters.completion === "completed" ? "active" : ""}`}
              onClick={() => updateFilter("completion", "completed")}
            >
              ✓ 已完成
            </button>
            <button
              className={`filter-chip ${filters.completion === "uncompleted" ? "active" : ""}`}
              onClick={() => updateFilter("completion", "uncompleted")}
            >
              未完成
            </button>
          </div>
        </div>

        <div className="filter-group">
          <span className="filter-label">最近游玩</span>
          <div className="filter-chips">
            <button
              className={`filter-chip ${filters.recency === "all" ? "active" : ""}`}
              onClick={() => updateFilter("recency", "all")}
            >
              不限
            </button>
            <button
              className={`filter-chip ${filters.recency === "recent" ? "active" : ""}`}
              onClick={() => updateFilter("recency", "recent")}
            >
              近 {RECENT_DAYS} 天
            </button>
          </div>
        </div>

        <div className="filter-group">
          <span className="filter-label">关卡来源</span>
          <div className="filter-chips">
            <button
              className={`filter-chip ${filters.source === "all" ? "active" : ""}`}
              onClick={() => updateFilter("source", "all")}
            >
              全部
            </button>
            <button
              className={`filter-chip ${filters.source === "preset" ? "active" : ""}`}
              onClick={() => updateFilter("source", "preset")}
            >
              预设关卡
            </button>
            <button
              className={`filter-chip ${filters.source === "workshop" ? "active" : ""}`}
              onClick={() => updateFilter("source", "workshop")}
            >
              工坊关卡
            </button>
          </div>
        </div>

        <div className="filter-group">
          <span className="filter-label">收藏状态</span>
          <div className="filter-chips">
            <button
              className={`filter-chip ${filters.favorites === "all" ? "active" : ""}`}
              onClick={() => updateFilter("favorites", "all")}
            >
              全部
            </button>
            <button
              className={`filter-chip ${filters.favorites === "favorites" ? "active" : ""}`}
              onClick={() => updateFilter("favorites", "favorites")}
            >
              ★ 仅收藏
            </button>
          </div>
        </div>

        <div className="filter-group">
          <span className="filter-label">排序</span>
          <select
            className="sort-select"
            value={filters.sort}
            onChange={(e) => updateFilter("sort", e.target.value as SortKey)}
          >
            <option value="default">默认顺序</option>
            <option value="name-asc">名称 A→Z</option>
            <option value="name-desc">名称 Z→A</option>
            <option value="target-asc">目标格数量 升序</option>
            <option value="target-desc">目标格数量 降序</option>
          </select>
        </div>

        {hasActiveFilters && (
          <button className="clear-filters-btn" onClick={clearAllFilters}>
            清除筛选
          </button>
        )}
      </div>

      <div className="level-section-header">
        <h2 className="level-section-title">
          关卡列表
          <span className="result-count">（{displayedLevels.length} / {allLevelsWithSource.length}）</span>
        </h2>
      </div>

      {displayedLevels.length > 0 ? (
        <div className="level-cards">
          {displayedLevels.map((item) => renderLevelCard(item))}
        </div>
      ) : (
        <div className="empty-result">
          <div className="empty-icon">🔍</div>
          <h3 className="empty-title">没有符合条件的关卡</h3>
          <p className="empty-desc">尝试调整筛选条件或清除筛选后重新查看</p>
          <button className="clear-filters-btn primary" onClick={clearAllFilters}>
            清除所有筛选
          </button>
        </div>
      )}
    </section>
  );
}

function RenameDialog({
  open,
  level,
  onClose,
  onConfirm
}: {
  open: boolean;
  level: Level | null;
  onClose: () => void;
  onConfirm: (newName: string) => void;
}) {
  const [name, setName] = useState("");

  useEffect(() => {
    if (open && level) {
      setName(level.name);
    }
  }, [open, level]);

  if (!open || !level) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed) {
      onConfirm(trimmed);
    }
  }

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-panel" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h2 className="dialog-title">重命名关卡</h2>
          <button className="dialog-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="dialog-body">
            <label className="dialog-label">
              关卡名称
              <input
                className="dialog-input"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={30}
                autoFocus
              />
            </label>
            <p className="dialog-hint">最多 30 个字符</p>
          </div>
          <div className="dialog-actions">
            <button type="button" className="dialog-btn secondary" onClick={onClose}>
              取消
            </button>
            <button type="submit" className="dialog-btn primary" disabled={!name.trim()}>
              确认
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DeleteDialog({
  open,
  level,
  onClose,
  onConfirm
}: {
  open: boolean;
  level: Level | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!open || !level) return null;

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-panel" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h2 className="dialog-title">确认删除</h2>
          <button className="dialog-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>
        <div className="dialog-body">
          <p className="dialog-warning-text">
            确定要删除关卡 <strong>「{level.name}」</strong> 吗？
          </p>
          <div className="dialog-warning-list">
            <p>⚠️ 删除后将同时清除：</p>
            <ul>
              <li>该关卡的完成状态</li>
              <li>该关卡的成就记录（最低步数、最低旋转等）</li>
            </ul>
          </div>
          <p className="dialog-hint danger">此操作无法撤销</p>
        </div>
        <div className="dialog-actions">
          <button className="dialog-btn secondary" onClick={onClose}>
            取消
          </button>
          <button className="dialog-btn danger" onClick={onConfirm}>
            确认删除
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [activePiece, setActivePiece] = useState<string | null>(null);
  const [rotation, setRotation] = useState(0);
  const [view, setView] = useState<View>("hall");
  const [showTutorial, setShowTutorial] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [stats, setStats] = useState<Stats>({ steps: 0, rotations: 0, resets: 0 });
  const [showComplete, setShowComplete] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [achievementsOpen, setAchievementsOpen] = useState(false);
  const [workshopOpen, setWorkshopOpen] = useState(false);
  const [newRecords, setNewRecords] = useState<NewRecords>({ newMinSteps: false, newMinRotations: false, firstNoReset: false, firstCompletion: false });
  const [todayDate, setTodayDate] = useState(getTodayDateString);
  const [dailyChallengeLevel, setDailyChallengeLevel] = useState<Level>(() => generateDailyChallenge());
  const [dailyRecord, setDailyRecord] = useState<DailyChallengeRecord>(() => getDailyRecord());
  const [historyReplayLevel, setHistoryReplayLevel] = useState<Level | null>(null);
  const [historyReplayDate, setHistoryReplayDate] = useState<string | null>(null);
  const [historyReplayRecord, setHistoryReplayRecord] = useState<DailyChallengeRecord | null>(null);
  const [hallFilters, setHallFilters] = useState<HallFilters>({
    completion: "all",
    recency: "all",
    source: "all",
    favorites: "all",
    sort: "default",
    searchQuery: ""
  });
  const [renameLevelId, setRenameLevelId] = useState<string | null>(null);
  const [deleteLevelId, setDeleteLevelId] = useState<string | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [hoverCell, setHoverCell] = useState<Cell | null>(null);
  const [dailyCalendarOpen, setDailyCalendarOpen] = useState(false);
  const [dailyStreak, setDailyStreak] = useState(() => calculateStreak());
  const [dailyCalendarRefreshKey, setDailyCalendarRefreshKey] = useState(0);
  const [solverStatus, setSolverStatus] = useState<SolverStatus>("idle");
  const [solverResult, setSolverResult] = useState<SolverResult | null>(null);
  const [hintResult, setHintResult] = useState<HintResult | null>(null);
  const [isSolving, setIsSolving] = useState(false);
  const [isGettingHint, setIsGettingHint] = useState(false);
  const [showSolverDialog, setShowSolverDialog] = useState(false);
  const [hintHighlight, setHintHighlight] = useState<Set<string>>(new Set());
  const solverAbortRef = useRef(false);
  const prevSolvedRef = useRef(false);
  const hasInteractionRef = useRef(false);

  const { save, setSave } = useSave();
  const { settings, setSettings, settingsOpen, setSettingsOpen, playSound } = useSettings();
  const { workshopLevels, addLevel, renameLevel, deleteLevel, duplicateLevel } = useWorkshop();
  const { favorites, setFavorites, toggleFavorite } = useFavorites();
  const { updateAchievement: updateAchievementHook, touchPlay } = useAchievements();

  const latestState = useMemo(
    () => ({
      placements: save.placements,
      activePiece,
      rotation,
      stats,
      showComplete
    }),
    [save.placements, activePiece, rotation, stats, showComplete]
  );

  const {
    canUndo,
    canRedo,
    captureState,
    undo: undoInternal,
    redo: redoInternal,
    resetHistory
  } = useUndoRedo(latestState, {
    initialUndoStack: save.undoStack || [],
    initialRedoStack: save.redoStack || [],
    onHistoryChange: (undoStack, redoStack) => {
      setSave((current) => ({ ...current, undoStack, redoStack }));
    }
  });

  const undoHook = useCallback(() => {
    undoInternal(
      (state) => {
        setSave((current) => ({ ...current, placements: state.placements }));
        setActivePiece(state.activePiece);
        setRotation(state.rotation);
        setStats(state.stats);
        setShowComplete(state.showComplete);
      },
      () => {
        prevSolvedRef.current = true;
      }
    );
    playSound("select");
  }, [undoInternal, setSave, playSound]);

  const redoHook = useCallback(() => {
    redoInternal(
      (state) => {
        setSave((current) => ({ ...current, placements: state.placements }));
        setActivePiece(state.activePiece);
        setRotation(state.rotation);
        setStats(state.stats);
        setShowComplete(state.showComplete);
      },
      () => {
        prevSolvedRef.current = true;
      }
    );
    playSound("select");
  }, [redoInternal, setSave, playSound]);

  const allLevels = useMemo(() => [...levels, ...workshopLevels], [workshopLevels]);
  const isDailyChallenge = save.levelId === DAILY_CHALLENGE_LEVEL_ID;
  const isHistoryReplay = isHistoryReplayLevelId(save.levelId);
  const isWorkshopLevel = save.levelId.startsWith(WORKSHOP_LEVEL_PREFIX);
  const level: Level = useMemo(() => {
    if (isDailyChallenge) {
      return dailyChallengeLevel;
    }
    if (isHistoryReplay && historyReplayLevel) {
      return historyReplayLevel;
    }
    if (isWorkshopLevel) {
      const found = workshopLevels.find((item) => item.id === save.levelId);
      if (found) return found;
    }
    return levels.find((item) => item.id === save.levelId) ?? levels[0];
  }, [isDailyChallenge, isHistoryReplay, isWorkshopLevel, dailyChallengeLevel, historyReplayLevel, workshopLevels, save.levelId]);

  useEffect(() => {
    function checkDateChange() {
      const newDate = getTodayDateString();
      if (newDate !== todayDate) {
        setTodayDate(newDate);
        setDailyChallengeLevel(generateDailyChallenge(newDate));
        setDailyRecord(getDailyRecord(newDate));
        setDailyStreak(calculateStreak());
        setDailyCalendarRefreshKey((key) => key + 1);
      }
    }
    const interval = setInterval(checkDateChange, 60000);
    return () => clearInterval(interval);
  }, [todayDate]);

  const tutorialRefs: TutorialRefs = {
    pieces: useRef<HTMLDivElement>(null),
    rotate: useRef<HTMLButtonElement>(null),
    board: useRef<HTMLDivElement>(null),
    reset: useRef<HTMLButtonElement>(null),
    hint: useRef<HTMLParagraphElement>(null)
  };

  useEffect(() => {
    if (!loadTutorialCompleted() && view === "game" && !showTutorial) {
      const timer = setTimeout(() => {
        setShowTutorial(true);
        setTutorialStep(0);
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [view, showTutorial]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (view !== "game") return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
      const modKey = isMac ? e.metaKey : e.ctrlKey;
      if (modKey && !e.shiftKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undoHook();
      } else if ((modKey && e.shiftKey && e.key.toLowerCase() === "z") || (modKey && e.key.toLowerCase() === "y")) {
        e.preventDefault();
        redoHook();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [view, undoHook, redoHook]);

  function completeTutorial() {
    saveTutorialCompleted();
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
      rotateCells(piece.cells, placement.rotation).forEach(([row, col]) => map.set(cellKey(row + placement.row, col + placement.col), piece.color));
    });
    return map;
  }, [level, save.placements]);

  type PreviewCell = { valid: boolean; color: string };
  const previewCells = useMemo<Map<string, PreviewCell>>(() => {
    const result = new Map<string, PreviewCell>();
    if (!settings.practiceMode) return result;
    if (!activePiece || !hoverCell) return result;
    const piece = level.pieces.find((item) => item.id === activePiece);
    if (!piece) return result;
    const [hoverRow, hoverCol] = hoverCell;
    const cells = rotateCells(piece.cells, rotation).map(([dr, dc]) => [hoverRow + dr, hoverCol + dc] as Cell);
    const hasInvalidCell = cells.some(([r, c]) => r < 0 || c < 0 || r >= level.size || c >= level.size || occupied.has(cellKey(r, c)));
    for (const [r, c] of cells) {
      const outOfBounds = r < 0 || c < 0 || r >= level.size || c >= level.size;
      if (outOfBounds) continue;
      result.set(cellKey(r, c), { valid: !hasInvalidCell, color: piece.color });
    }
    return result;
  }, [settings.practiceMode, activePiece, hoverCell, level, rotation, occupied]);

  const solved = useMemo(() => {
    const target = new Set(level.target.map(([row, col]) => cellKey(row, col)));
    if (occupied.size !== target.size) return false;
    return [...occupied.keys()].every((key) => target.has(key));
  }, [level.target, occupied]);

  useEffect(() => {
    if (solved && !settings.practiceMode && !isDailyChallenge && !isHistoryReplay && !save.completed.includes(level.id)) {
      setSave((current) => ({ ...current, completed: [...current.completed, level.id] }));
    }
  }, [level.id, save.completed, solved, isDailyChallenge, isHistoryReplay, settings.practiceMode, setSave]);

  useEffect(() => {
    if (solved && !prevSolvedRef.current && hasInteractionRef.current) {
      if (!settings.practiceMode) {
        if (isDailyChallenge) {
          const previousRecord = getDailyRecord();
          const record = updateDailyRecord(stats);
          setNewRecords({
            newMinSteps: stats.steps < previousRecord.minSteps,
            newMinRotations: stats.rotations < previousRecord.minRotations,
            firstNoReset: false,
            firstCompletion: false
          });
          setDailyRecord(record);
          setDailyStreak(calculateStreak());
          setDailyCalendarRefreshKey((key) => key + 1);
        } else if (isHistoryReplay && historyReplayDate) {
          const previousRecord = getDailyRecord(historyReplayDate);
          const record = updateHistoryRecord(historyReplayDate, stats);
          setNewRecords({
            newMinSteps: stats.steps < previousRecord.historyMinSteps,
            newMinRotations: stats.rotations < previousRecord.historyMinRotations,
            firstNoReset: false,
            firstCompletion: false
          });
          setHistoryReplayRecord(record);
          setDailyCalendarRefreshKey((key) => key + 1);
        } else {
          const records = updateAchievementHook(level.id, stats);
          setNewRecords(records);
        }
      } else {
        setNewRecords({ newMinSteps: false, newMinRotations: false, firstNoReset: false, firstCompletion: false });
      }
      playSound("success");
      setShowComplete(true);
    }
    prevSolvedRef.current = solved;
  }, [solved, isDailyChallenge, isHistoryReplay, historyReplayDate, level.id, stats, settings.practiceMode, updateAchievementHook, playSound]);

  function place(row: number, col: number) {
    if (!activePiece) return;
    const piece = level.pieces.find((item) => item.id === activePiece);
    if (!piece) return;
    const cells = rotateCells(piece.cells, rotation).map(([r, c]) => [r + row, c + col] as Cell);
    const out = cells.some(([r, c]) => r < 0 || c < 0 || r >= level.size || c >= level.size);
    const collision = cells.some(([r, c]) => occupied.has(cellKey(r, c)));
    if (out || collision) return;
    captureState();
    hasInteractionRef.current = true;
    setSave((current) => ({ ...current, placements: [...current.placements, { pieceId: activePiece, row, col, rotation }] }));
    setStats((s) => ({ ...s, steps: s.steps + 1 }));
    playSound("place");
    setActivePiece(null);
    setRotation(0);
    setHoverCell(null);
  }

  function switchLevel(levelId: string) {
    hasInteractionRef.current = false;
    prevSolvedRef.current = false;
    resetHistory();
    if (!levelId.startsWith(DAILY_CHALLENGE_LEVEL_ID) && !isHistoryReplayLevelId(levelId)) {
      touchPlay(levelId);
    }
    clearLevelCache(level);
    setSave((current) => ({
      ...current,
      levelId,
      placements: [],
      lastPlayed: { ...current.lastPlayed, [levelId]: new Date().toISOString() }
    }));
    setActivePiece(null);
    setRotation(0);
    setStats({ steps: 0, rotations: 0, resets: 0 });
    setShowComplete(false);
    setShowHint(false);
    setHoverCell(null);
    setSolverStatus("idle");
    setSolverResult(null);
    setHintResult(null);
    setHintHighlight(new Set());
    setShowSolverDialog(false);
    setView("game");
  }

  function switchToDailyChallenge() {
    touchDailyPlayed();
    setDailyRecord(getDailyRecord());
    setDailyStreak(calculateStreak());
    setDailyCalendarRefreshKey((key) => key + 1);
    switchLevel(DAILY_CHALLENGE_LEVEL_ID);
  }

  function switchToHistoryReplay(dateStr: string) {
    touchHistoryPlayed(dateStr);
    const historyLevel = generateDailyChallenge(dateStr, true);
    setHistoryReplayLevel(historyLevel);
    setHistoryReplayDate(dateStr);
    setHistoryReplayRecord(getDailyRecord(dateStr));
    setDailyCalendarRefreshKey((key) => key + 1);
    setDailyCalendarOpen(false);
    switchLevel(historyLevel.id);
  }

  function playWorkshopLevel(newLevel: Level) {
    addLevel(newLevel);
    setWorkshopOpen(false);
    switchLevel(newLevel.id);
  }

  function handleRenameLevel(levelId: string, newName: string) {
    renameLevel(levelId, newName.trim() || "未命名关卡");
    setRenameLevelId(null);
  }

  function handleDeleteLevel(levelId: string) {
    deleteLevel(levelId, levels[0].id);
    setTimeout(() => {
      setSave(readLocalStorage<Save>(STORAGE_KEY, {
        levelId: levels[0].id,
        placements: [],
        completed: [],
        lastPlayed: {},
        undoStack: [],
        redoStack: []
      }));
      setFavorites(readLocalStorage<string[]>(FAVORITES_KEY, []));
    }, 0);
    setDeleteLevelId(null);
  }

  function handleDuplicateLevel(levelId: string) {
    duplicateLevel(levelId);
  }

  function handleExportLevel(levelId: string) {
    const targetLevel = workshopLevels.find((l) => l.id === levelId);
    if (!targetLevel) return;
    const json = exportLevelToJson(targetLevel);
    copyToClipboard(json).catch(() => {});
  }

  function handleImportLevel(importedLevel: Level) {
    addLevel(importedLevel);
    setImportDialogOpen(false);
    switchLevel(importedLevel.id);
  }

  function backToHall() {
    hasInteractionRef.current = false;
    prevSolvedRef.current = false;
    resetHistory();
    setView("hall");
    setActivePiece(null);
    setRotation(0);
    setShowComplete(false);
    setShowHint(false);
    setHoverCell(null);
  }

  function handleSetActivePiece(id: string) {
    if (activePiece !== id) {
      captureState();
    }
    setActivePiece(id);
    setHoverCell(null);
    playSound("select");
  }

  function handleRotate() {
    if (!activePiece) return;
    captureState();
    setRotation((value) => (value + 1) % 4);
    hasInteractionRef.current = true;
    setStats((s) => ({ ...s, rotations: s.rotations + 1 }));
    playSound("rotate");
  }

  function handleReset() {
    if (save.placements.length === 0) return;
    captureState();
    hasInteractionRef.current = true;
    setSave((current) => ({ ...current, placements: [] }));
    setStats((s) => ({ ...s, resets: s.resets + 1 }));
    setHoverCell(null);
    setHintResult(null);
    setHintHighlight(new Set());
    playSound("reset");
  }

  function toggleHint() {
    setShowHint((current) => !current);
  }

  async function handleSolve() {
    if (isSolving || solved) return;
    setIsSolving(true);
    setSolverStatus("solving");
    setShowSolverDialog(true);
    solverAbortRef.current = false;

    try {
      const targetArea = level.target.length;
      const timeoutMs = targetArea > 25 ? 8000 : targetArea > 15 ? 5000 : 3000;
      const result = await solveLevel(level, save.placements, timeoutMs, true);

      setSolverResult(result);
      setSolverStatus(result.status);

      if (result.status === "solved" && result.solution) {
        setHintResult({
          status: "solved",
          nextPlacement: null,
          remainingPlacements: result.solution.filter(
            (p) => !save.placements.some((ep) => ep.pieceId === p.pieceId)
          ),
          message: `找到完整解答，共 ${result.solution.length} 步`,
          isComplete: false
        });
      }
    } catch (e) {
      setSolverStatus("error");
      setSolverResult({
        status: "error",
        solution: null,
        message: e instanceof Error ? e.message : "求解出错",
        solveTimeMs: 0,
        nodesVisited: 0
      });
    } finally {
      setIsSolving(false);
    }
  }

  async function handleGetHint() {
    if (isGettingHint || solved) return;
    setIsGettingHint(true);
    setHintHighlight(new Set());

    try {
      const result = await getHint(level, save.placements, 3000);
      setHintResult(result);

      if (result.status === "solved" && result.nextPlacement) {
        const piece = level.pieces.find((p) => p.id === result.nextPlacement!.pieceId);
        if (piece) {
          const rotatedCells = rotateCells(piece.cells, result.nextPlacement.rotation);
          const highlight = new Set<string>();
          rotatedCells.forEach(([dr, dc]) => {
            highlight.add(cellKey(result.nextPlacement!.row + dr, result.nextPlacement!.col + dc));
          });
          setHintHighlight(highlight);
        }
      }
    } catch (e) {
      setHintResult({
        status: "error",
        nextPlacement: null,
        remainingPlacements: null,
        message: e instanceof Error ? e.message : "提示生成出错",
        isComplete: false
      });
    } finally {
      setIsGettingHint(false);
    }
  }

  function applyFullSolution() {
    if (!solverResult?.solution) return;
    const solution = solverResult.solution.filter(
      (p) => !save.placements.some((ep) => ep.pieceId === p.pieceId)
    );
    if (solution.length === 0) return;

    captureState();
    hasInteractionRef.current = true;
    setSave((current) => ({
      ...current,
      placements: [...solverResult.solution!]
    }));
    setStats((s) => ({ ...s, steps: s.steps + solution.length }));
    setShowSolverDialog(false);
    setHintHighlight(new Set());
    playSound("place");
  }

  function applyNextStep() {
    if (!hintResult?.nextPlacement) return;

    const next = hintResult.nextPlacement;
    captureState();
    hasInteractionRef.current = true;
    setSave((current) => ({
      ...current,
      placements: [...current.placements, next]
    }));
    setStats((s) => ({ ...s, steps: s.steps + 1 }));
    setActivePiece(null);
    setRotation(0);
    setHintHighlight(new Set());
    setHintResult(null);
    playSound("place");
  }

  function clearHint() {
    setHintResult(null);
    setHintHighlight(new Set());
  }

  function nextLevel() {
    if (isDailyChallenge || isHistoryReplay) {
      setShowComplete(false);
      backToHall();
      return;
    }
    const currentIndex = levels.findIndex((item) => item.id === level.id);
    const nextIndex = currentIndex + 1;
    if (nextIndex < levels.length) {
      switchLevel(levels[nextIndex].id);
    } else {
      setShowComplete(false);
      backToHall();
    }
  }

  const targetSet = useMemo(() => new Set(level.target.map(([r, c]) => cellKey(r, c))), [level.target]);
  const currentLevelIndex = levels.findIndex((item) => item.id === level.id);
  const hasNextLevel = isDailyChallenge || isHistoryReplay ? false : currentLevelIndex < levels.length - 1;

  const hintAnalysis = useMemo(() => {
    const missingTargetCells: Cell[] = [];
    level.target.forEach(([r, c]) => {
      if (!occupied.has(cellKey(r, c))) {
        missingTargetCells.push([r, c]);
      }
    });

    const outOfBoundsOrNonTarget: Cell[] = [];
    occupied.forEach((_color, key) => {
      const [r, c] = key.split(":").map(Number);
      if (!targetSet.has(key)) {
        outOfBoundsOrNonTarget.push([r, c]);
      }
    });

    return {
      missingTargetCells,
      outOfBoundsOrNonTarget,
      missingCount: missingTargetCells.length,
      misplacedCount: outOfBoundsOrNonTarget.length
    };
  }, [level.target, occupied, targetSet]);

  const missingTargetSet = useMemo(
    () => new Set(hintAnalysis.missingTargetCells.map(([r, c]) => cellKey(r, c))),
    [hintAnalysis.missingTargetCells]
  );

  const misplacedSet = useMemo(
    () => new Set(hintAnalysis.outOfBoundsOrNonTarget.map(([r, c]) => cellKey(r, c))),
    [hintAnalysis.outOfBoundsOrNonTarget]
  );

  if (view === "hall") {
    return (
      <main className="runes">
        <LevelSelectHall
          levels={levels}
          workshopLevels={workshopLevels}
          save={save}
          filters={hallFilters}
          onFiltersChange={setHallFilters}
          onSelectLevel={switchLevel}
          onOpenTutorial={openTutorial}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenAchievements={() => setAchievementsOpen(true)}
          onOpenWorkshop={() => setWorkshopOpen(true)}
          onSelectDaily={switchToDailyChallenge}
          onOpenCalendar={() => setDailyCalendarOpen(true)}
          dailyRecord={dailyRecord}
          todayDate={todayDate}
          streak={dailyStreak}
          onRenameLevel={(id) => setRenameLevelId(id)}
          onDeleteLevel={(id) => setDeleteLevelId(id)}
          onDuplicateLevel={handleDuplicateLevel}
          onExportLevel={handleExportLevel}
          onOpenImport={() => setImportDialogOpen(true)}
          favorites={favorites}
          onToggleFavorite={toggleFavorite}
        />
        <DailyCalendarPanel
          open={dailyCalendarOpen}
          onClose={() => setDailyCalendarOpen(false)}
          todayDate={todayDate}
          refreshKey={dailyCalendarRefreshKey}
          streak={dailyStreak}
          onSelectHistory={switchToHistoryReplay}
        />
        <SettingsPanel open={settingsOpen} settings={settings} onClose={() => setSettingsOpen(false)} onChange={setSettings} />
        <AchievementPanel open={achievementsOpen} levels={allLevels} workshopLevels={workshopLevels} dailyStreak={dailyStreak} onClose={() => setAchievementsOpen(false)} />
        <WorkshopPanel
          open={workshopOpen}
          onClose={() => setWorkshopOpen(false)}
          onPlayLevel={playWorkshopLevel}
          onOpenImport={() => {
            setWorkshopOpen(false);
            setImportDialogOpen(true);
          }}
        />
        <ImportLevelDialog
          open={importDialogOpen}
          onClose={() => setImportDialogOpen(false)}
          onImport={handleImportLevel}
        />
        <RenameDialog
          open={renameLevelId !== null}
          level={workshopLevels.find((l) => l.id === renameLevelId) || null}
          onClose={() => setRenameLevelId(null)}
          onConfirm={(newName) => {
            if (renameLevelId) {
              handleRenameLevel(renameLevelId, newName);
            }
          }}
        />
        <DeleteDialog
          open={deleteLevelId !== null}
          level={workshopLevels.find((l) => l.id === deleteLevelId) || null}
          onClose={() => setDeleteLevelId(null)}
          onConfirm={() => {
            if (deleteLevelId) {
              handleDeleteLevel(deleteLevelId);
            }
          }}
        />
      </main>
    );
  }

  const levelTag = isDailyChallenge
    ? "✦ 每日挑战"
    : isHistoryReplay
    ? "⏪ 历史回放"
    : isWorkshopLevel
    ? "✨ 工坊关卡"
    : "符文拼接室";
  const heroTitle = isDailyChallenge
    ? `今日符文：${todayDate}`
    : isHistoryReplay && historyReplayDate
    ? `回放符文：${historyReplayDate}`
    : isWorkshopLevel
    ? `挑战自创：${level.name}`
    : "把碎片压进发光的格子";

  return (
    <main className="runes">
      <section className="hero">
        <div>
          <p className={`eyebrow ${isHistoryReplay ? "history-eyebrow" : ""} ${isDailyChallenge ? "daily-eyebrow" : ""}`}>{levelTag}</p>
          <h1>{heroTitle}</h1>
        </div>
        <div className="game-header">
          <span className={`current-level ${isDailyChallenge ? "daily-badge" : ""} ${isHistoryReplay ? "history-badge" : ""} ${isWorkshopLevel ? "workshop-badge" : ""} ${settings.practiceMode ? "practice-badge" : ""}`}>
            {isDailyChallenge
              ? "✦ "
              : isHistoryReplay
              ? "⏪ "
              : isWorkshopLevel
              ? "✨ "
              : "当前："}
            {level.name}
            {settings.practiceMode && <span className="practice-tag">· 练习模式</span>}
          </span>
          <button
            className={`practice-toggle-btn ${settings.practiceMode ? "active" : ""}`}
            onClick={() => setSettings((s) => ({ ...s, practiceMode: !s.practiceMode }))}
            title={settings.practiceMode ? "关闭练习模式" : "开启练习模式"}
            aria-label={settings.practiceMode ? "关闭练习模式" : "开启练习模式"}
          >
            🧪 {settings.practiceMode ? "练习中" : "练习模式"}
          </button>
          <button className="settings-btn" onClick={() => setSettingsOpen(true)}>
            ⚙ 设置
          </button>
          <button className="tutorial-reopen-btn" onClick={openTutorial}>
            教程
          </button>
          <button className={`hint-btn ${showHint ? "active" : ""}`} onClick={toggleHint}>
            💡 提示
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
              const isTarget = targetSet.has(key);
              const isMissingTarget = showHint && missingTargetSet.has(key);
              const isMisplaced = showHint && misplacedSet.has(key);
              const preview = previewCells.get(key);
              const isPreview = !!preview;
              const isPreviewValid = preview?.valid ?? false;
              const classes = [
                isTarget ? `target${settings.highlightTarget ? "" : " no-highlight"}` : "",
                isMissingTarget ? "hint-missing" : "",
                isMisplaced ? "hint-misplaced" : "",
                isPreview ? (isPreviewValid ? "preview-valid" : "preview-invalid") : ""
              ].filter(Boolean).join(" ");
              return (
                <button
                  className={classes}
                  key={key}
                  onClick={() => place(row, col)}
                  onMouseEnter={() => activePiece && setHoverCell([row, col])}
                  onMouseLeave={() => setHoverCell(null)}
                  onTouchStart={(e) => {
                    if (!activePiece) return;
                    const touch = e.touches[0];
                    const element = document.elementFromPoint(touch.clientX, touch.clientY);
                    const btn = element?.closest("button");
                    if (btn) {
                      const idx = Array.from(btn.parentElement?.children ?? []).indexOf(btn);
                      if (idx >= 0) {
                        const r = Math.floor(idx / level.size);
                        const c = idx % level.size;
                        setHoverCell([r, c]);
                      }
                    }
                  }}
                  onTouchMove={(e) => {
                    if (!activePiece) return;
                    const touch = e.touches[0];
                    const element = document.elementFromPoint(touch.clientX, touch.clientY);
                    const btn = element?.closest("button");
                    if (btn) {
                      const idx = Array.from(btn.parentElement?.children ?? []).indexOf(btn);
                      if (idx >= 0) {
                        const r = Math.floor(idx / level.size);
                        const c = idx % level.size;
                        setHoverCell([r, c]);
                      }
                    }
                  }}
                  onTouchEnd={() => setHoverCell(null)}
                >
                  {occupied.has(key) && <i style={{ background: occupied.get(key) }} />}
                  {isPreview && <i className={`preview-layer ${isPreviewValid ? "valid" : "invalid"}`} style={isPreviewValid ? { background: preview!.color } : undefined} />}
                </button>
              );
            })}
          </div>
          {showHint && (
            <div className="hint-panel">
              <div className="hint-panel-header">
                <h3>关卡分析</h3>
              </div>
              <div className="hint-panel-body">
                <div className={`hint-panel-item ${hintAnalysis.missingCount > 0 ? "warn" : "ok"}`}>
                  <span className="hint-panel-label">
                    <i className="hint-icon missing" />
                    未覆盖的目标格
                  </span>
                  <span className="hint-panel-count">
                    {hintAnalysis.missingCount}
                  </span>
                </div>
                <div className={`hint-panel-item ${hintAnalysis.misplacedCount > 0 ? "error" : "ok"}`}>
                  <span className="hint-panel-label">
                    <i className="hint-icon misplaced" />
                    越界或非目标区域
                  </span>
                  <span className="hint-panel-count">
                    {hintAnalysis.misplacedCount}
                  </span>
                </div>
                <div className="hint-panel-legend">
                  <div className="legend-item">
                    <span className="legend-swatch missing-swatch" />
                    <span>需要填充</span>
                  </div>
                  <div className="legend-item">
                    <span className="legend-swatch misplaced-swatch" />
                    <span>放置错误</span>
                  </div>
                </div>
              </div>
            </div>
          )}
          <p ref={tutorialRefs.hint} className={`${solved ? "hint solved" : "hint"} ${settings.practiceMode ? "practice-hint" : ""}`}>
            {solved
              ? settings.practiceMode
                ? "练习完成。切换到普通模式可记录成就。"
                : "符文已闭合，关卡完成。"
              : settings.practiceMode
              ? "🧪 练习模式：悬停预览落点，完成不计入成就。"
              : "选择碎片后点击棋盘放置，已放下的碎片可用重置清空。"}
          </p>
        </div>

        <aside className="panel">
          <div className="piece-head">
            <h2>碎片</h2>
            <button ref={tutorialRefs.reset} onClick={handleReset}>重置</button>
          </div>
          <button ref={tutorialRefs.rotate} className="rotate" onClick={handleRotate}>
            旋转选中碎片
          </button>
          <div className="undo-redo-group">
            <button className="undo-btn" onClick={undoHook} disabled={!canUndo}>
              ↶ 撤销
            </button>
            <button className="redo-btn" onClick={redoHook} disabled={!canRedo}>
              ↷ 重做
            </button>
          </div>
          <div ref={tutorialRefs.pieces} className="pieces">
            {level.pieces.map((piece) => (
              <button className={activePiece === piece.id ? "active" : ""} key={piece.id} onClick={() => handleSetActivePiece(piece.id)}>
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

      <CompleteModal
        open={showComplete}
        levelName={level.name}
        stats={stats}
        hasNext={hasNextLevel}
        newRecords={newRecords}
        onClose={() => setShowComplete(false)}
        onNext={nextLevel}
        onBackToHall={backToHall}
        isHistoryReplay={isHistoryReplay}
        isPracticeMode={settings.practiceMode}
      />

      <SettingsPanel open={settingsOpen} settings={settings} onClose={() => setSettingsOpen(false)} onChange={setSettings} />
    </main>
  );
}
