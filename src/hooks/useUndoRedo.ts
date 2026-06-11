import { useRef, useCallback, useEffect } from "react";
import type { HistoryState, Stats, Placement } from "../types";

type UseUndoRedoOptions = {
  initialUndoStack?: HistoryState[];
  initialRedoStack?: HistoryState[];
  onHistoryChange?: (undoStack: HistoryState[], redoStack: HistoryState[]) => void;
};

type LatestState = {
  placements: Placement[];
  activePiece: string | null;
  rotation: number;
  stats: Stats;
  showComplete: boolean;
};

export function useUndoRedo(
  latestState: LatestState,
  options: UseUndoRedoOptions = {}
) {
  const { initialUndoStack = [], initialRedoStack = [], onHistoryChange } = options;

  const undoStackRef = useRef<HistoryState[]>(initialUndoStack);
  const redoStackRef = useRef<HistoryState[]>(initialRedoStack);
  const isPerformingUndoRedoRef = useRef(false);
  const latestStateRef = useRef<LatestState>(latestState);

  useEffect(() => {
    latestStateRef.current = latestState;
  }, [latestState]);

  const persistHistory = useCallback(() => {
    onHistoryChange?.(undoStackRef.current, redoStackRef.current);
  }, [onHistoryChange]);

  const captureState = useCallback(() => {
    if (isPerformingUndoRedoRef.current) return;
    const latest = latestStateRef.current;
    const state: HistoryState = {
      placements: [...latest.placements],
      activePiece: latest.activePiece,
      rotation: latest.rotation,
      stats: { ...latest.stats },
      showComplete: latest.showComplete
    };
    undoStackRef.current.push(state);
    redoStackRef.current = [];
    persistHistory();
  }, [persistHistory]);

  const clearRedoStack = useCallback(() => {
    redoStackRef.current = [];
    persistHistory();
  }, [persistHistory]);

  const canUndo = useCallback(() => {
    return undoStackRef.current.length > 0;
  }, []);

  const canRedo = useCallback(() => {
    return redoStackRef.current.length > 0;
  }, []);

  type UndoResult = {
    state: HistoryState;
    setSolved: (value: boolean) => void;
  };

  const undo = useCallback(
    (applyState: (state: HistoryState) => void, markSolved?: () => void) => {
      if (!canUndo()) return;
      isPerformingUndoRedoRef.current = true;
      const prevState = undoStackRef.current.pop()!;
      const latest = latestStateRef.current;
      const currentState: HistoryState = {
        placements: [...latest.placements],
        activePiece: latest.activePiece,
        rotation: latest.rotation,
        stats: { ...latest.stats },
        showComplete: latest.showComplete
      };
      redoStackRef.current.push(currentState);

      applyState(prevState);
      if (prevState.showComplete) {
        markSolved?.();
      }
      persistHistory();

      setTimeout(() => {
        isPerformingUndoRedoRef.current = false;
      }, 0);
    },
    [canUndo, persistHistory]
  );

  const redo = useCallback(
    (applyState: (state: HistoryState) => void, markSolved?: () => void) => {
      if (!canRedo()) return;
      isPerformingUndoRedoRef.current = true;
      const nextState = redoStackRef.current.pop()!;
      const latest = latestStateRef.current;
      const currentState: HistoryState = {
        placements: [...latest.placements],
        activePiece: latest.activePiece,
        rotation: latest.rotation,
        stats: { ...latest.stats },
        showComplete: latest.showComplete
      };
      undoStackRef.current.push(currentState);

      applyState(nextState);
      if (nextState.showComplete) {
        markSolved?.();
      }
      persistHistory();

      setTimeout(() => {
        isPerformingUndoRedoRef.current = false;
      }, 0);
    },
    [canRedo, persistHistory]
  );

  const resetHistory = useCallback(() => {
    undoStackRef.current = [];
    redoStackRef.current = [];
    persistHistory();
  }, [persistHistory]);

  return {
    captureState,
    clearRedoStack,
    canUndo,
    canRedo,
    undo,
    redo,
    resetHistory,
    undoStackRef,
    redoStackRef
  };
}
