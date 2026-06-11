import { useEffect, useState } from "react";
import type { Level } from "./types";
import {
  validateAndImportLevel,
  copyToClipboard,
  exportLevelToJson,
  type ImportValidationResult
} from "./levelImportExport";

export default function ImportLevelDialog({
  open,
  onClose,
  onImport
}: {
  open: boolean;
  onClose: () => void;
  onImport: (level: Level) => void;
}) {
  const [jsonText, setJsonText] = useState("");
  const [validation, setValidation] = useState<ImportValidationResult | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) {
      setJsonText("");
      setValidation(null);
      setCopied(false);
    }
  }, [open]);

  if (!open) return null;

  function handleValidate() {
    const result = validateAndImportLevel(jsonText);
    setValidation(result);
  }

  function handleImport() {
    if (validation?.valid && validation.level) {
      onImport(validation.level);
      onClose();
    }
  }

  function handleCopyExample() {
    const exampleLevel: Level = {
      id: "example",
      name: "示例关卡",
      size: 5,
      target: [
        [1, 1], [1, 2], [1, 3],
        [2, 1], [2, 2], [2, 3],
        [3, 1], [3, 2], [3, 3]
      ],
      pieces: [
        { id: "p1", name: "方符", color: "#54a0a8", cells: [[0, 0], [0, 1], [1, 0], [1, 1]] },
        { id: "p2", name: "竖符", color: "#d09b4c", cells: [[0, 0], [1, 0], [2, 0]] },
        { id: "p3", name: "横符", color: "#c96161", cells: [[0, 0], [0, 1]] }
      ]
    };
    const json = exportLevelToJson(exampleLevel);
    copyToClipboard(json).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }

  function handlePaste() {
    navigator.clipboard?.readText().then((text) => {
      setJsonText(text);
    }).catch(() => {});
  }

  return (
    <div className="dialog-overlay import-dialog-overlay" onClick={onClose}>
      <div className="dialog-panel import-dialog-panel" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h2 className="dialog-title">导入关卡</h2>
          <button className="dialog-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>

        <div className="dialog-body import-dialog-body">
          <div className="import-actions-bar">
            <button className="import-action-btn" onClick={handlePaste}>
              📋 粘贴
            </button>
            <button className="import-action-btn" onClick={handleCopyExample}>
              {copied ? "✓ 已复制" : "📝 复制示例"}
            </button>
          </div>

          <label className="dialog-label">
            关卡 JSON 数据
            <textarea
              className="import-textarea"
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              placeholder="将关卡 JSON 数据粘贴到这里…"
              rows={12}
            />
          </label>

          {validation && (
            <div className={`validation-result ${validation.valid ? "valid" : "invalid"}`}>
              {validation.valid && (
                <div className="validation-status success">
                  <span className="validation-icon">✓</span>
                  <span>校验通过，可以导入</span>
                </div>
              )}
              {!validation.valid && (
                <div className="validation-status error">
                  <span className="validation-icon">✕</span>
                  <span>校验失败</span>
                </div>
              )}

              {validation.errors.length > 0 && (
                <div className="validation-section">
                  <div className="validation-section-title">错误 ({validation.errors.length})</div>
                  <ul className="validation-list">
                    {validation.errors.map((err, i) => (
                      <li key={i} className="validation-item error">
                        <span className="validation-bullet">•</span>
                        {err}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {validation.warnings.length > 0 && (
                <div className="validation-section">
                  <div className="validation-section-title">警告 ({validation.warnings.length})</div>
                  <ul className="validation-list">
                    {validation.warnings.map((warn, i) => (
                      <li key={i} className="validation-item warning">
                        <span className="validation-bullet">•</span>
                        {warn}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {validation.valid && validation.level && (
                <div className="validation-preview">
                  <div className="validation-section-title">关卡信息</div>
                  <div className="preview-stats">
                    <div className="preview-stat">
                      <span className="stat-label">棋盘</span>
                      <span className="stat-val">{validation.level.size}×{validation.level.size}</span>
                    </div>
                    <div className="preview-stat">
                      <span className="stat-label">目标格</span>
                      <span className="stat-val">{validation.level.target.length}</span>
                    </div>
                    <div className="preview-stat">
                      <span className="stat-label">碎片</span>
                      <span className="stat-val">{validation.level.pieces.length}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <p className="dialog-hint">
            导入的关卡将保存到工坊关卡列表，可立即试玩
          </p>
        </div>

        <div className="dialog-actions">
          <button className="dialog-btn secondary" onClick={onClose}>
            取消
          </button>
          {!validation && (
            <button
              className="dialog-btn primary"
              onClick={handleValidate}
              disabled={!jsonText.trim()}
            >
              校验
            </button>
          )}
          {validation && !validation.valid && (
            <button
              className="dialog-btn primary"
              onClick={handleValidate}
              disabled={!jsonText.trim()}
            >
              重新校验
            </button>
          )}
          {validation && validation.valid && (
            <button
              className="dialog-btn primary"
              onClick={handleImport}
            >
              导入并试玩 →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
