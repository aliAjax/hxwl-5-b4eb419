import { useCallback } from "react";
import { useLocalStorage, readLocalStorage, writeLocalStorage } from "./useLocalStorage";
import type { Level, Save, Achievements } from "../types";
import { WORKSHOP_STORAGE_KEY, STORAGE_KEY, ACHIEVEMENT_KEY, FAVORITES_KEY, TUTORIAL_KEY } from "./useSave";
import { WORKSHOP_LEVEL_PREFIX } from "../levelGenerator";

function getInitialWorkshopLevels(): Level[] {
  const parsed = readLocalStorage<Level[]>(WORKSHOP_STORAGE_KEY, []);
  return Array.isArray(parsed) ? parsed : [];
}

export function useWorkshop() {
  const [workshopLevels, setWorkshopLevels] = useLocalStorage<Level[]>(
    WORKSHOP_STORAGE_KEY,
    getInitialWorkshopLevels
  );

  const addLevel = useCallback(
    (level: Level): Level[] => {
      let updated: Level[] = [];
      setWorkshopLevels((prev) => {
        const exists = prev.some((l) => l.id === level.id);
        if (exists) {
          updated = prev;
          return prev;
        }
        updated = [level, ...prev].slice(0, 20);
        return updated;
      });
      return updated;
    },
    [setWorkshopLevels]
  );

  const renameLevel = useCallback(
    (levelId: string, newName: string): Level[] => {
      let updated: Level[] = [];
      setWorkshopLevels((prev) => {
        updated = prev.map((l) =>
          l.id === levelId ? { ...l, name: newName.trim() || "未命名关卡" } : l
        );
        return updated;
      });
      return updated;
    },
    [setWorkshopLevels]
  );

  const deleteLevel = useCallback(
    (levelId: string, defaultLevelId: string = "gate"): Level[] => {
      let updated: Level[] = [];
      setWorkshopLevels((prev) => {
        updated = prev.filter((l) => l.id !== levelId);
        writeLocalStorage(WORKSHOP_STORAGE_KEY, updated);
        return updated;
      });

      const save = readLocalStorage<Save | null>(STORAGE_KEY, null);
      if (save) {
        const newCompleted = save.completed.filter((id) => id !== levelId);
        const newLastPlayed = { ...save.lastPlayed };
        delete newLastPlayed[levelId];
        const newLevelId = save.levelId === levelId ? defaultLevelId : save.levelId;
        const newPlacements = save.levelId === levelId ? [] : save.placements;
        writeLocalStorage(STORAGE_KEY, {
          ...save,
          levelId: newLevelId,
          placements: newPlacements,
          completed: newCompleted,
          lastPlayed: newLastPlayed
        });
      }

      const achievements = readLocalStorage<Achievements | null>(ACHIEVEMENT_KEY, null);
      if (achievements) {
        delete achievements[levelId];
        writeLocalStorage(ACHIEVEMENT_KEY, achievements);
      }

      const favorites = readLocalStorage<string[] | null>(FAVORITES_KEY, null);
      if (favorites) {
        writeLocalStorage(FAVORITES_KEY, favorites.filter((id) => id !== levelId));
      }

      return updated;
    },
    [setWorkshopLevels]
  );

  const duplicateLevel = useCallback(
    (levelId: string): Level[] => {
      let updated: Level[] = [];
      setWorkshopLevels((prev) => {
        const source = prev.find((l) => l.id === levelId);
        if (!source) {
          updated = prev;
          return prev;
        }

        const newId = `${WORKSHOP_LEVEL_PREFIX}${Date.now()}`;
        const newLevel: Level = {
          ...source,
          id: newId,
          name: `${source.name} 副本`,
          pieces: source.pieces.map((p, i) => ({
            ...p,
            id: `${WORKSHOP_LEVEL_PREFIX}${Date.now()}-${i}`
          }))
        };

        updated = [newLevel, ...prev].slice(0, 20);
        return updated;
      });
      return updated;
    },
    [setWorkshopLevels]
  );

  const getLevelById = useCallback(
    (levelId: string): Level | undefined => {
      return workshopLevels.find((l) => l.id === levelId);
    },
    [workshopLevels]
  );

  const reloadWorkshop = useCallback(() => {
    setWorkshopLevels(getInitialWorkshopLevels());
  }, [setWorkshopLevels]);

  return {
    workshopLevels,
    setWorkshopLevels,
    addLevel,
    renameLevel,
    deleteLevel,
    duplicateLevel,
    getLevelById,
    reloadWorkshop
  };
}
