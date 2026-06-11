import { useEffect, useMemo, useRef, useState } from "react";
import type { Level, Piece } from "./types";
import {
  generateWorkshopLevel,
  type ColorPalette,
  type Complexity,
  type GeneratorParams,
  type GeneratorProgress,
  WORKSHOP_LEVEL_PREFIX
} from "./levelGenerator";
import { exportLevelToJson, copyToClipboard} from "./levelImportExport";
import { cellKey } from "./boardUtils";

const PALETTE_PREVIEWS: Record<ColorPalette, string[]> = {
  classic: ["#54a0a8", "#d09b4c", "#c96161", "#7c70c7", "#df6f52"],
  ocean: ["#3e8eb5", "#5bb4d4", "#6a8fc9", "#4a6fa5", "#7bc4e0"],
  forest: ["#4f8f5c", "#6ab57a", "#8fbf73", "#5a9e6f", "#95e2a4"],
  sunset: ["#df6f52", "#e8944a", "#c96161", "#d78f4f", "#e8a967"],
  aurora: ["#7c70c7", "#9f6fc9", "#6a8fc9", "#a07cd4", "#8fa6d9"]
};

const PALETTE_NAMES: Record<ColorPalette, string> = {
  classic: "经典符文",
  ocean: "深海蓝调",
  forest: "翠林绿意",
  sunset: "暮光赤霞",
  aurora: "极光幻紫"
};

const COMPLEXITY_LABELS: Record<Complexity, { name: string; desc: string }> = {
  simple: { name: "初级", desc: "目标区域较小，容易覆盖" },
  normal: { name: "进阶", desc: "面积适中，需要思考" },
  complex: { name: "大师", desc: "大面积目标，高挑战" }
};

function MiniPreview({ level }: { level: Level | null }) {
  if (!level) {
    return (
      <div className="mini-preview-placeholder">
        <span>生成后预览</span>
      </div>
    );
  }
  const targetSet = useMemo(
    () => new Set(level.target.map(([r, c]) => cellKey(r, c))),
    [level.target]
  );
  return (
    <div className="mini-preview">
      <div className="mini-preview-section">
        <div className="mini-preview-label">目标形状 · {level.target.length}格</div>
        <div
          className="mini-preview-grid"
          style={{ gridTemplateColumns: `repeat(${level.size}, 1fr)` }}
        >
          {Array.from({ length: level.size * level.size }).map((_, i) => {
            const r = Math.floor(i / level.size);
            const c = i % level.size;
            const t = targetSet.has(cellKey(r, c));
            return <span key={i} className={`mini-cell ${t ? "target" : ""}`} />;
          })}
        </div>
      </div>
      <div className="mini-preview-section">
        <div className="mini-preview-label">符文碎片 · {level.pieces.length}个</div>
        <div className="mini-pieces">
          {level.pieces.map((p) => (
            <MiniPiece key={p.id} piece={p} />
          ))}
        </div>
      </div>
    </div>
  );
}

function MiniPiece({ piece }: { piece: Piece }) {
  const rows = Math.max(...piece.cells.map(([r]) => r)) + 1;
  const cols = Math.max(...piece.cells.map(([c]) => c)) + 1;
  const set = useMemo(
    () => new Set(piece.cells.map(([r, c]) => cellKey(r, c))),
    [piece.cells]
  );
  return (
    <div className="mini-piece" title={`${piece.name} · ${piece.cells.length}格`}>
      <div
        className="mini-piece-grid"
        style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
      >
        {Array.from({ length: rows * cols }).map((_, i) => {
          const r = Math.floor(i / cols);
          const c = i % cols;
          const filled = set.has(cellKey(r, c));
          return (
            <span
              key={i}
              className="mini-piece-cell"
              style={filled ? { background: piece.color } : undefined}
            />
          );
        })}
      </div>
    </div>
  );
}

export default function WorkshopPanel({
  open,
  onClose,
  onPlayLevel,
  onOpenImport
}: {
  open: boolean;
  onClose: () => void;
  onPlayLevel: (level: Level) => void;
  onOpenImport: () => void;
}) {
  const [boardSize, setBoardSize] = useState(6);
  const [complexity, setComplexity] = useState<Complexity>("normal");
  const [pieceCount, setPieceCount] = useState(4);
  const [palette, setPalette] = useState<ColorPalette>("classic");
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState<GeneratorProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Level | null>(null);
  const [exported, setExported] = useState(false);
  const abortRef = useRef<{ aborted: boolean }>({ aborted: false });

  const maxPieceCount = useMemo(() => {
    const maxArea = Math.floor(boardSize * boardSize * 0.7);
    return Math.max(2, Math.min(10, Math.floor(maxArea / 2)));
  }, [boardSize]);

  const minPieceCount = 2;

  useEffect(() => {
    if (pieceCount > maxPieceCount) setPieceCount(maxPieceCount);
    if (pieceCount < minPieceCount) setPieceCount(minPieceCount);
  }, [maxPieceCount, pieceCount]);

  useEffect(() => {
    if (!open) {
      abortRef.current.aborted = true;
    }
    return () => {
      abortRef.current.aborted = true;
    };
  }, [open]);

  if (!open) return null;

  const params: GeneratorParams = { boardSize, complexity, pieceCount, palette };

  async function handleGenerate() {
    setError(null);
    setResult(null);
    setGenerating(true);
    setProgress(null);
    abortRef.current = { aborted: false };
    const signal = abortRef.current;

    try {
      const level = await generateWorkshopLevel(
        params,
        (p) => setProgress(p),
        signal
      );
      if (signal.aborted) return;
      setResult(level);
    } catch (e) {
      if (!signal.aborted) {
        setError(e instanceof Error ? e.message : "生成失败");
      }
    } finally {
      if (!signal.aborted) {
        setGenerating(false);
      }
    }
  }

  function handleCancel() {
    abortRef.current.aborted = true;
    setGenerating(false);
    setProgress(null);
  }

  function handlePlay() {
    if (result) {
      onPlayLevel(result);
    }
  }

  function handleExport() {
    if (!result) return;
    const json = exportLevelToJson(result);
    copyToClipboard(json)
      .then(() => {
        setExported(true);
        setTimeout(() => setExported(false), 2000);
      })
      .catch(() => {});
  }

  return (
    <div className="workshop-overlay" onClick={onClose}>
      <div className="workshop-panel" onClick={(e) => e.stopPropagation()}>
        <div className="workshop-header">
          <div>
            <p className="eyebrow workshop-eyebrow">✦ 创作工坊</p>
            <h2 className="workshop-title">生成专属符文关卡</h2>
          </div>
          <div className="workshop-header-actions">
            <button
              className="workshop-import-btn"
              onClick={onOpenImport}
              disabled={generating}
            >
              📥 导入关卡
            </button>
            <button
              className="workshop-close"
              onClick={onClose}
              aria-label="关闭创作工坊"
            >
              ×
            </button>
          </div>
        </div>

        <div className="workshop-body">
          <div className="workshop-config">
            <div className="config-group">
              <label className="config-label">
                棋盘大小
                <span className="config-desc">{boardSize}×{boardSize} 格</span>
              </label>
              <div className="size-options">
                {[5, 6, 7, 8].map((s) => (
                  <button
                    key={s}
                    className={`size-option ${boardSize === s ? "active" : ""}`}
                    onClick={() => setBoardSize(s)}
                    disabled={generating}
                  >
                    {s}×{s}
                  </button>
                ))}
              </div>
            </div>

            <div className="config-group">
              <label className="config-label">
                目标复杂度
                <span className="config-desc">
                  {COMPLEXITY_LABELS[complexity].desc}
                </span>
              </label>
              <div className="complexity-options">
                {(["simple", "normal", "complex"] as const).map((c) => (
                  <button
                    key={c}
                    className={`complexity-option ${complexity === c ? "active" : ""}`}
                    onClick={() => setComplexity(c)}
                    disabled={generating}
                  >
                    {COMPLEXITY_LABELS[c].name}
                  </button>
                ))}
              </div>
            </div>

            <div className="config-group">
              <label className="config-label">
                碎片数量
                <span className="config-desc">
                  {pieceCount} 个（建议 2-{maxPieceCount}）
                </span>
              </label>
              <div className="slider-wrap workshop-slider">
                <input
                  className="slider"
                  type="range"
                  min={minPieceCount}
                  max={maxPieceCount}
                  step={1}
                  value={pieceCount}
                  onChange={(e) => setPieceCount(Number(e.target.value))}
                  disabled={generating}
                />
                <span className="slider-value">{pieceCount}</span>
              </div>
            </div>

            <div className="config-group">
              <label className="config-label">
                颜色风格
                <span className="config-desc">{PALETTE_NAMES[palette]}</span>
              </label>
              <div className="palette-options">
                {(Object.keys(PALETTE_PREVIEWS) as ColorPalette[]).map((p) => (
                  <button
                    key={p}
                    className={`palette-option ${palette === p ? "active" : ""}`}
                    onClick={() => setPalette(p)}
                    disabled={generating}
                    title={PALETTE_NAMES[p]}
                  >
                    <div className="palette-swatches">
                      {PALETTE_PREVIEWS[p].map((c, i) => (
                        <span
                          key={i}
                          className="palette-swatch"
                          style={{ background: c }}
                        />
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="workshop-preview-col">
            <div className="workshop-preview-card">
              <MiniPreview level={result} />
            </div>

            {generating && progress && (
              <div className="progress-card">
                <div className="progress-header">
                  <span className="progress-step">
                    步骤 {progress.step} / {progress.totalSteps}
                  </span>
                  <span className="progress-attempt">
                    第 {progress.attempt} 次尝试
                  </span>
                </div>
                <div className="progress-bar-wrap">
                  <div
                    className="progress-bar"
                    style={{
                      width: `${(progress.step / progress.totalSteps) * 100}%`
                    }}
                  />
                </div>
                <div className="progress-message">{progress.message}</div>
                <button className="cancel-generate-btn" onClick={handleCancel}>
                  取消生成
                </button>
              </div>
            )}

            {error && !generating && (
              <div className="error-card">
                <div className="error-icon">⚠</div>
                <div className="error-title">生成失败</div>
                <div className="error-message">{error}</div>
                <div className="error-tip">
                  提示：尝试减小碎片数量或降低复杂度，重新生成
                </div>
              </div>
            )}

            {result && !generating && (
              <div className="result-card">
                <div className="result-success-icon">✦</div>
                <div className="result-title">生成成功</div>
                <div className="result-stats">
                  <div className="result-stat">
                    <span className="stat-label">棋盘</span>
                    <span className="stat-val">{result.size}×{result.size}</span>
                  </div>
                  <div className="result-stat">
                    <span className="stat-label">目标格</span>
                    <span className="stat-val">{result.target.length}</span>
                  </div>
                  <div className="result-stat">
                    <span className="stat-label">碎片</span>
                    <span className="stat-val">{result.pieces.length}</span>
                  </div>
                </div>
                <div className="workshop-note">
                  ✓ 目标区域连通 · 碎片完全覆盖 · 至少一种解法存在
                </div>
                <div className="result-actions">
                  <button className="export-btn" onClick={handleExport}>
                    {exported ? "✓ 已复制" : "📤 导出关卡"}
                  </button>
                  <button className="play-workshop-btn" onClick={handlePlay}>
                    立即试玩 →
                  </button>
                </div>
              </div>
            )}

            {!generating && !error && !result && (
              <div className="idle-card">
                <div className="idle-hint">
                  调整参数后点击下方按钮开始生成
                </div>
                <ul className="check-list">
                  <li>✓ 目标区域自动保持连通</li>
                  <li>✓ 碎片面积完全覆盖目标</li>
                  <li>✓ 生成时即验证至少一种解法</li>
                  <li>✓ 尽量避免碎片形状完全重复</li>
                </ul>
              </div>
            )}
          </div>
        </div>

        <div className="workshop-footer">
          <button
            className="workshop-btn secondary"
            onClick={onClose}
            disabled={generating}
          >
            关闭
          </button>
          <button
            className="workshop-btn primary"
            onClick={handleGenerate}
            disabled={generating}
          >
            {generating ? "生成中…" : "✨ 生成关卡"}
          </button>
        </div>
      </div>
    </div>
  );
}

export { WORKSHOP_LEVEL_PREFIX };
