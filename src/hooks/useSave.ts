import { useCallback } from "react";
import { useLocalStorage, readLocalStorage, writeLocalStorage } from "./useLocalStorage";
import type { Save, Placement, HistoryState } from "../types";

const STORAGE_KEY = "hxwl-5-runes";
const TUTORIAL_KEY = "hxwl-5-runes-tutorial";
const WORKSHOP_STORAGE_KEY = "hxwl-5-workshop-levels";
const ACHIEVEMENT_KEY = "hxwl-5-runes-achievements";
const FAVORITES_KEY = "hxwl-5-runes-favorites";

function getInitialSave(): Save {
  return readLocalStorage<Save>(STORAGE_KEY, {
    levelId: "gate",
    placements: [],
    completed: [],
    lastPlayed: {},
    undoStack: [],
    redoStack: []
  });
}

export function useSave() {
  const [save, setSave] = useLocalStorage<Save>(STORAGE_KEY, getInitialSave);

  const updatePlacements = useCallback((placements: Placement[]) => {
    setSave((prev) => ({ ...prev, placements }));
  }, [setSave]);

  const addPlacement = useCallback((placement: Placement) => {
    setSave((prev) => ({ ...prev, placements: [...prev.placements, placement] }));
  }, [setSave]);

  const clearPlacements = useCallback(() => {
    setSave((prev) => ({ ...prev, placements: [] }));
  }, [setSave]);

  const switchLevel = useCallback((levelId: string) => {
    setSave((prev) => ({
      ...prev,
      levelId,
      placements: [],
      lastPlayed: { ...prev.lastPlayed, [levelId]: new Date().toISOString() }
    }));
  }, [setSave]);

  const markCompleted = useCallback((levelId: string) => {
    setSave((prev) => {
      if (prev.completed.includes(levelId)) return prev;
      return { ...prev, completed: [...prev.completed, levelId] };
    });
  }, [setSave]);

  const updateHistory = useCallback((undoStack: HistoryState[], redoStack: HistoryState[]) => {
    setSave((prev) => ({ ...prev, undoStack, redoStack }));
  }, [setSave]);

  const reloadSave = useCallback(() => {
    const fresh = getInitialSave();
    setSave(fresh);
    return fresh;
  }, [setSave]);

  return {
    save,
    setSave,
    updatePlacements,
    addPlacement,
    clearPlacements,
    switchLevel,
    markCompleted,
    updateHistory,
    reloadSave
  };
}

export function loadTutorialCompleted(): boolean {
  return localStorage.getItem(TUTORIAL_KEY) === "1";
}

export function saveTutorialCompleted(): void {
  localStorage.setItem(TUTORIAL_KEY, "1");
}

export { STORAGE_KEY, TUTORIAL_KEY, WORKSHOP_STORAGE_KEY, ACHIEVEMENT_KEY, FAVORITES_KEY };
