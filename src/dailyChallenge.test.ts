import { beforeEach, describe, expect, it } from "vitest";
import {
  generateDailyChallenge,
  calculateStreak,
  getDailyRecord,
  updateDailyRecord,
  updateHistoryRecord,
  getTodayDateString,
  getHistoryReplayLevelId,
  isHistoryReplayLevelId,
  extractDateFromHistoryLevelId,
  DAILY_CHALLENGE_LEVEL_ID,
  HISTORY_REPLAY_LEVEL_ID_PREFIX,
  NO_RECORD,
  type DailyChallengeRecord,
  type DailyChallengeSave
} from "./dailyChallenge";
import type { Stats } from "./App";

const DAILY_CHALLENGE_KEY = "hxwl-5-daily-challenge";

function setDailySave(data: DailyChallengeSave) {
  localStorage.setItem(DAILY_CHALLENGE_KEY, JSON.stringify(data));
}

function getDailySave(): DailyChallengeSave {
  try {
    return JSON.parse(localStorage.getItem(DAILY_CHALLENGE_KEY) || "{}") as DailyChallengeSave;
  } catch {
    return {};
  }
}

function createStats(overrides: Partial<Stats> = {}): Stats {
  return {
    steps: 5,
    rotations: 3,
    resets: 0,
    ...overrides
  };
}

describe("generateDailyChallenge", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("同一日期生成稳定的关卡", () => {
    const dateStr = "2026-06-11";
    const level1 = generateDailyChallenge(dateStr);
    const level2 = generateDailyChallenge(dateStr);

    expect(level1.id).toBe(level2.id);
    expect(level1.name).toBe(level2.name);
    expect(level1.size).toBe(level2.size);
    expect(level1.target).toEqual(level2.target);
    expect(level1.pieces).toEqual(level2.pieces);
  });

  it("不同日期生成不同的关卡", () => {
    const levelA = generateDailyChallenge("2026-06-10");
    const levelB = generateDailyChallenge("2026-06-11");
    const levelC = generateDailyChallenge("2026-06-12");

    const allSame =
      levelA.size === levelB.size &&
      levelB.size === levelC.size &&
      JSON.stringify(levelA.target) === JSON.stringify(levelB.target) &&
      JSON.stringify(levelB.target) === JSON.stringify(levelC.target) &&
      JSON.stringify(levelA.pieces) === JSON.stringify(levelB.pieces) &&
      JSON.stringify(levelB.pieces) === JSON.stringify(levelC.pieces);

    expect(allSame).toBe(false);
  });

  it("多次调用同一天日期始终返回相同结果", () => {
    const dateStr = "2025-01-15";
    const results = Array.from({ length: 5 }, () => generateDailyChallenge(dateStr));

    for (let i = 1; i < results.length; i += 1) {
      expect(results[i].id).toBe(results[0].id);
      expect(results[i].target).toEqual(results[0].target);
      expect(results[i].pieces.length).toBe(results[0].pieces.length);
    }
  });

  it("默认使用每日挑战 level id", () => {
    const level = generateDailyChallenge("2026-06-11");
    expect(level.id).toBe(DAILY_CHALLENGE_LEVEL_ID);
    expect(level.name).toContain("每日挑战");
  });

  it("历史回放模式使用带日期的 level id", () => {
    const dateStr = "2026-06-01";
    const level = generateDailyChallenge(dateStr, true);

    expect(level.id).toBe(getHistoryReplayLevelId(dateStr));
    expect(level.id).toContain(HISTORY_REPLAY_LEVEL_ID_PREFIX);
    expect(level.name).toContain("历史回放");
    expect(level.name).toContain(dateStr);
  });

  it("历史回放模式碎片 id 前缀正确", () => {
    const dateStr = "2026-06-01";
    const level = generateDailyChallenge(dateStr, true);

    expect(level.pieces.length).toBeGreaterThan(0);
    for (const piece of level.pieces) {
      expect(piece.id.startsWith(`history-${dateStr}-`)).toBe(true);
    }
  });

  it("默认模式碎片 id 使用 daily- 前缀", () => {
    const level = generateDailyChallenge("2026-06-11", false);

    expect(level.pieces.length).toBeGreaterThan(0);
    for (const piece of level.pieces) {
      expect(piece.id.startsWith("daily-")).toBe(true);
    }
  });

  it("生成的关卡碎片总面积等于目标格数量", () => {
    const level = generateDailyChallenge("2026-06-11");
    const totalPieceArea = level.pieces.reduce((sum, p) => sum + p.cells.length, 0);

    expect(totalPieceArea).toBe(level.target.length);
  });

  it("getHistoryReplayLevelId 生成正确格式", () => {
    expect(getHistoryReplayLevelId("2026-06-01")).toBe("history-replay-2026-06-01");
  });

  it("isHistoryReplayLevelId 正确识别回放 id", () => {
    expect(isHistoryReplayLevelId("history-replay-2026-06-01")).toBe(true);
    expect(isHistoryReplayLevelId(DAILY_CHALLENGE_LEVEL_ID)).toBe(false);
    expect(isHistoryReplayLevelId("workshop-123")).toBe(false);
  });

  it("extractDateFromHistoryLevelId 正确提取日期", () => {
    expect(extractDateFromHistoryLevelId("history-replay-2026-06-01")).toBe("2026-06-01");
    expect(extractDateFromHistoryLevelId(DAILY_CHALLENGE_LEVEL_ID)).toBeNull();
  });
});

describe("calculateStreak - 连续天数计算", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("空记录时连续天数为 0", () => {
    expect(calculateStreak()).toBe(0);
  });

  it("今天已完成时正确计算连续天数", () => {
    const today = getTodayDateString();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;

    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    const twoDaysAgoStr = `${twoDaysAgo.getFullYear()}-${String(twoDaysAgo.getMonth() + 1).padStart(2, "0")}-${String(twoDaysAgo.getDate()).padStart(2, "0")}`;

    setDailySave({
      [today]: { completed: true, minSteps: 10, minRotations: 5, historyMinSteps: NO_RECORD, historyMinRotations: NO_RECORD },
      [yesterdayStr]: { completed: true, minSteps: 8, minRotations: 3, historyMinSteps: NO_RECORD, historyMinRotations: NO_RECORD },
      [twoDaysAgoStr]: { completed: true, minSteps: 12, minRotations: 6, historyMinSteps: NO_RECORD, historyMinRotations: NO_RECORD }
    });

    expect(calculateStreak()).toBe(3);
  });

  it("今天未完成但昨天完成时从昨天开始计算", () => {
    const today = getTodayDateString();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;

    setDailySave({
      [today]: { completed: false, minSteps: NO_RECORD, minRotations: NO_RECORD, historyMinSteps: NO_RECORD, historyMinRotations: NO_RECORD },
      [yesterdayStr]: { completed: true, minSteps: 5, minRotations: 2, historyMinSteps: NO_RECORD, historyMinRotations: NO_RECORD }
    });

    expect(calculateStreak()).toBe(1);
  });

  it("中间断档时从断点停止计算", () => {
    const today = getTodayDateString();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;

    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    const twoDaysAgoStr = `${twoDaysAgo.getFullYear()}-${String(twoDaysAgo.getMonth() + 1).padStart(2, "0")}-${String(twoDaysAgo.getDate()).padStart(2, "0")}`;

    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const threeDaysAgoStr = `${threeDaysAgo.getFullYear()}-${String(threeDaysAgo.getMonth() + 1).padStart(2, "0")}-${String(threeDaysAgo.getDate()).padStart(2, "0")}`;

    setDailySave({
      [today]: { completed: true, minSteps: 10, minRotations: 5, historyMinSteps: NO_RECORD, historyMinRotations: NO_RECORD },
      [yesterdayStr]: { completed: false, minSteps: NO_RECORD, minRotations: NO_RECORD, historyMinSteps: NO_RECORD, historyMinRotations: NO_RECORD },
      [twoDaysAgoStr]: { completed: true, minSteps: 8, minRotations: 3, historyMinSteps: NO_RECORD, historyMinRotations: NO_RECORD },
      [threeDaysAgoStr]: { completed: true, minSteps: 7, minRotations: 2, historyMinSteps: NO_RECORD, historyMinRotations: NO_RECORD }
    });

    expect(calculateStreak()).toBe(1);
  });

  it("记录归一化 - 缺失字段记录被归一化为默认值", () => {
    const today = getTodayDateString();

    const incompleteRecord = {
      completed: true
    } as unknown as DailyChallengeRecord;

    setDailySave({
      [today]: incompleteRecord
    });

    const record = getDailyRecord(today);
    expect(record.minSteps).toBe(NO_RECORD);
    expect(record.minRotations).toBe(NO_RECORD);
    expect(record.historyMinSteps).toBe(NO_RECORD);
    expect(record.historyMinRotations).toBe(NO_RECORD);
    expect(record.completed).toBe(true);
  });

  it("记录归一化 - 非数字 minSteps 被替换为 NO_RECORD", () => {
    const today = getTodayDateString();

    const badRecord = {
      completed: true,
      minSteps: "bad" as unknown as number,
      minRotations: NaN,
      historyMinSteps: Infinity,
      historyMinRotations: null as unknown as number
    } as unknown as DailyChallengeRecord;

    setDailySave({
      [today]: badRecord
    });

    const record = getDailyRecord(today);
    expect(record.minSteps).toBe(NO_RECORD);
    expect(record.minRotations).toBe(NO_RECORD);
    expect(record.historyMinSteps).toBe(NO_RECORD);
    expect(record.historyMinRotations).toBe(NO_RECORD);
  });

  it("记录归一化 - null/undefined 记录返回空记录", () => {
    const record1 = getDailyRecord("nonexistent-date");
    expect(record1.completed).toBe(false);
    expect(record1.minSteps).toBe(NO_RECORD);
    expect(record1.minRotations).toBe(NO_RECORD);
  });

  it("记录归一化 - completed 字段强制转换为布尔值", () => {
    const today = getTodayDateString();

    setDailySave({
      [today]: {
        completed: 1 as unknown as boolean,
        minSteps: NO_RECORD,
        minRotations: NO_RECORD,
        historyMinSteps: NO_RECORD,
        historyMinRotations: NO_RECORD
      } as unknown as DailyChallengeRecord
    });

    const record = getDailyRecord(today);
    expect(typeof record.completed).toBe("boolean");
    expect(record.completed).toBe(true);
  });

  it("updateDailyRecord 正确更新记录并保留归一化值", () => {
    const today = getTodayDateString();
    const stats = createStats({ steps: 8, rotations: 4 });

    const initialRecord = {
      completed: false,
      minSteps: 10,
      minRotations: 5,
      historyMinSteps: 9,
      historyMinRotations: 3
    } as DailyChallengeRecord;

    setDailySave({ [today]: initialRecord });

    const updated = updateDailyRecord(stats);

    expect(updated.completed).toBe(true);
    expect(updated.minSteps).toBe(8);
    expect(updated.minRotations).toBe(4);
    expect(updated.historyMinSteps).toBe(9);
    expect(updated.historyMinRotations).toBe(3);
  });

  it("updateHistoryRecord 仅更新历史记录不影响当日记录", () => {
    const dateStr = "2026-06-01";
    const stats = createStats({ steps: 7, rotations: 3 });

    const initialRecord = {
      completed: true,
      minSteps: 10,
      minRotations: 5,
      historyMinSteps: 9,
      historyMinRotations: 4
    } as DailyChallengeRecord;

    setDailySave({ [dateStr]: initialRecord });

    const updated = updateHistoryRecord(dateStr, stats);

    expect(updated.completed).toBe(true);
    expect(updated.minSteps).toBe(10);
    expect(updated.minRotations).toBe(5);
    expect(updated.historyMinSteps).toBe(7);
    expect(updated.historyMinRotations).toBe(3);
  });
});
