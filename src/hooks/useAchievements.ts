import { useCallback } from "react";
import { useLocalStorage, readLocalStorage, writeLocalStorage } from "./useLocalStorage";
import type { Achievements, LevelRecord, Stats, NewRecords } from "../types";
import { ACHIEVEMENT_KEY } from "./useSave";

function migrateLevelRecord(
  record: Partial<LevelRecord> & {
    firstCompletedAt: string;
    minSteps: number;
    minRotations: number;
    noResetCompleted: boolean;
  }
): LevelRecord {
  return {
    firstCompletedAt: record.firstCompletedAt,
    minSteps: record.minSteps,
    minRotations: record.minRotations,
    noResetCompleted: record.noResetCompleted,
    playCount: record.playCount ?? 1,
    completedCount: record.completedCount ?? 1,
    lastCompletedAt: record.lastCompletedAt || record.firstCompletedAt,
    totalSteps: record.totalSteps ?? record.minSteps,
    totalRotations: record.totalRotations ?? record.minRotations
  };
}

function loadAchievementsRaw(): Achievements {
  try {
    const raw = readLocalStorage<Achievements>(ACHIEVEMENT_KEY, {});
    let needsSave = false;
    for (const key of Object.keys(raw)) {
      const rec = raw[key] as Partial<LevelRecord> & {
        firstCompletedAt: string;
        minSteps: number;
        minRotations: number;
        noResetCompleted: boolean;
      };
      if (
        rec.playCount === undefined ||
        rec.completedCount === undefined ||
        rec.lastCompletedAt === undefined ||
        rec.totalSteps === undefined ||
        rec.totalRotations === undefined
      ) {
        raw[key] = migrateLevelRecord(rec);
        needsSave = true;
      }
    }
    if (needsSave) writeLocalStorage(ACHIEVEMENT_KEY, raw);
    return raw;
  } catch {
    return {};
  }
}

function saveAchievementsRaw(data: Achievements): void {
  writeLocalStorage(ACHIEVEMENT_KEY, data);
}

export function useAchievements() {
  const [achievements, setAchievements] = useLocalStorage<Achievements>(
    ACHIEVEMENT_KEY,
    loadAchievementsRaw
  );

  const touchPlay = useCallback(
    (levelId: string) => {
      setAchievements((prev) => {
        const existing = prev[levelId];
        if (existing) {
          return { ...prev, [levelId]: { ...existing, playCount: existing.playCount + 1 } };
        }
        return {
          ...prev,
          [levelId]: {
            firstCompletedAt: "",
            minSteps: 999999,
            minRotations: 999999,
            noResetCompleted: false,
            playCount: 1,
            completedCount: 0,
            lastCompletedAt: "",
            totalSteps: 0,
            totalRotations: 0
          }
        };
      });
    },
    [setAchievements]
  );

  const updateAchievement = useCallback(
    (levelId: string, stats: Stats): NewRecords => {
      const records: NewRecords = {
        newMinSteps: false,
        newMinRotations: false,
        firstNoReset: false,
        firstCompletion: false
      };
      const now = new Date().toISOString();

      setAchievements((prev) => {
        const existing = prev[levelId];
        let updated: LevelRecord;

        if (existing && existing.firstCompletedAt) {
          updated = {
            ...existing,
            completedCount: existing.completedCount + 1,
            lastCompletedAt: now,
            totalSteps: existing.totalSteps + stats.steps,
            totalRotations: existing.totalRotations + stats.rotations
          };
          if (stats.steps < existing.minSteps) {
            updated.minSteps = stats.steps;
            records.newMinSteps = true;
          }
          if (stats.rotations < existing.minRotations) {
            updated.minRotations = stats.rotations;
            records.newMinRotations = true;
          }
          if (stats.resets === 0 && !existing.noResetCompleted) {
            updated.noResetCompleted = true;
            records.firstNoReset = true;
          }
        } else if (existing && !existing.firstCompletedAt) {
          updated = {
            ...existing,
            firstCompletedAt: now,
            minSteps: stats.steps,
            minRotations: stats.rotations,
            noResetCompleted: stats.resets === 0,
            completedCount: existing.completedCount + 1,
            lastCompletedAt: now,
            totalSteps: existing.totalSteps + stats.steps,
            totalRotations: existing.totalRotations + stats.rotations
          };
          records.newMinSteps = true;
          records.newMinRotations = true;
          records.firstNoReset = stats.resets === 0;
          records.firstCompletion = true;
        } else {
          updated = {
            firstCompletedAt: now,
            minSteps: stats.steps,
            minRotations: stats.rotations,
            noResetCompleted: stats.resets === 0,
            playCount: 1,
            completedCount: 1,
            lastCompletedAt: now,
            totalSteps: stats.steps,
            totalRotations: stats.rotations
          };
          records.newMinSteps = true;
          records.newMinRotations = true;
          records.firstNoReset = stats.resets === 0;
          records.firstCompletion = true;
        }

        return { ...prev, [levelId]: updated };
      });

      return records;
    },
    [setAchievements]
  );

  const deleteAchievement = useCallback(
    (levelId: string) => {
      setAchievements((prev) => {
        const next = { ...prev };
        delete next[levelId];
        return next;
      });
    },
    [setAchievements]
  );

  const reloadAchievements = useCallback(() => {
    setAchievements(loadAchievementsRaw());
  }, [setAchievements]);

  return {
    achievements,
    touchPlay,
    updateAchievement,
    deleteAchievement,
    reloadAchievements
  };
}

export { loadAchievementsRaw as loadAchievements, saveAchievementsRaw as saveAchievements };
