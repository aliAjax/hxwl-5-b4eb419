import { describe, expect, it, beforeEach } from "vitest";
import {
  validateAndImportLevel,
  exportLevelToJson
} from "./levelImportExport";
import type { Cell, Level, Piece } from "./App";

function createValidLevel(overrides: Partial<Level> = {}): Level {
  const target: Cell[] = [
    [1, 1],
    [1, 2],
    [2, 1],
    [2, 2]
  ];
  const pieces: Piece[] = [
    {
      id: "piece-1",
      name: "方符",
      color: "#d7b84f",
      cells: [
        [0, 0],
        [0, 1],
        [1, 0],
        [1, 1]
      ]
    }
  ];
  return {
    id: "test-level",
    name: "测试关卡",
    size: 5,
    target,
    pieces,
    ...overrides
  };
}

function levelToJson(level: Level): string {
  return JSON.stringify({
    name: level.name,
    size: level.size,
    target: level.target,
    pieces: level.pieces.map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      cells: p.cells
    })),
    exportedAt: new Date().toISOString(),
    version: 1
  });
}

describe("validateAndImportLevel", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("JSON 格式错误时返回无效结果", () => {
    const result = validateAndImportLevel("this is not json");
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("JSON");
    expect(result.level).toBeNull();
  });

  it("空字符串返回 JSON 格式错误", () => {
    const result = validateAndImportLevel("");
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.level).toBeNull();
  });

  it("非对象类型数据返回无效", () => {
    const result = validateAndImportLevel(JSON.stringify([1, 2, 3]));
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.includes("size") || e.includes("name") || e.includes("target"))).toBe(true);
    expect(result.level).toBeNull();
  });

  it("null 值返回无效数据错误", () => {
    const result = validateAndImportLevel("null");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("对象"))).toBe(true);
    expect(result.level).toBeNull();
  });

  it("数字原始类型返回无效数据错误", () => {
    const result = validateAndImportLevel("42");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("对象"))).toBe(true);
    expect(result.level).toBeNull();
  });

  it("缺少 size 字段时返回错误", () => {
    const level = createValidLevel();
    const json = JSON.stringify({
      name: level.name,
      target: level.target,
      pieces: level.pieces
    });

    const result = validateAndImportLevel(json);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("size"))).toBe(true);
    expect(result.level).toBeNull();
  });

  it("size 不是整数时返回错误", () => {
    const level = createValidLevel();
    const json = JSON.stringify({
      name: level.name,
      size: 5.5,
      target: level.target,
      pieces: level.pieces
    });

    const result = validateAndImportLevel(json);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("整数"))).toBe(true);
    expect(result.level).toBeNull();
  });

  it("size 超出范围时返回错误", () => {
    const level = createValidLevel();
    const json = JSON.stringify({
      name: level.name,
      size: 1,
      target: level.target,
      pieces: level.pieces
    });

    const result = validateAndImportLevel(json);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("3-12"))).toBe(true);
    expect(result.level).toBeNull();
  });

  it("缺少 name 字段时返回错误", () => {
    const level = createValidLevel();
    const json = JSON.stringify({
      size: level.size,
      target: level.target,
      pieces: level.pieces
    });

    const result = validateAndImportLevel(json);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("name"))).toBe(true);
    expect(result.level).toBeNull();
  });

  it("name 为空字符串时返回错误", () => {
    const level = createValidLevel();
    const json = JSON.stringify({
      name: "   ",
      size: level.size,
      target: level.target,
      pieces: level.pieces
    });

    const result = validateAndImportLevel(json);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("名称"))).toBe(true);
    expect(result.level).toBeNull();
  });

  it("缺少 target 数组时返回错误", () => {
    const level = createValidLevel();
    const json = JSON.stringify({
      name: level.name,
      size: level.size,
      pieces: level.pieces
    });

    const result = validateAndImportLevel(json);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("target"))).toBe(true);
    expect(result.level).toBeNull();
  });

  it("target 数组为空时返回错误", () => {
    const level = createValidLevel();
    const json = JSON.stringify({
      name: level.name,
      size: level.size,
      target: [],
      pieces: level.pieces
    });

    const result = validateAndImportLevel(json);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("目标格"))).toBe(true);
    expect(result.level).toBeNull();
  });

  it("缺少 pieces 数组时返回错误", () => {
    const level = createValidLevel();
    const json = JSON.stringify({
      name: level.name,
      size: level.size,
      target: level.target
    });

    const result = validateAndImportLevel(json);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("pieces"))).toBe(true);
    expect(result.level).toBeNull();
  });

  it("pieces 数组为空时返回错误", () => {
    const level = createValidLevel();
    const json = JSON.stringify({
      name: level.name,
      size: level.size,
      target: level.target,
      pieces: []
    });

    const result = validateAndImportLevel(json);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("碎片"))).toBe(true);
    expect(result.level).toBeNull();
  });

  it("目标格重复时发出警告并自动去重", () => {
    const targetWithDuplicates: Cell[] = [
      [1, 1],
      [1, 1],
      [1, 2],
      [2, 1],
      [2, 2],
      [2, 2]
    ];
    const pieces: Piece[] = [
      {
        id: "piece-1",
        name: "方符",
        color: "#d7b84f",
        cells: [
          [0, 0],
          [0, 1],
          [1, 0],
          [1, 1]
        ]
      }
    ];

    const json = JSON.stringify({
      name: "测试关卡",
      size: 5,
      target: targetWithDuplicates,
      pieces
    });

    const result = validateAndImportLevel(json);
    expect(result.valid).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some((w) => w.includes("重复") && w.includes("去重"))).toBe(true);
    expect(result.level).not.toBeNull();
    expect(result.level!.target.length).toBe(4);
  });

  it("目标格格式无效时返回错误", () => {
    const json = JSON.stringify({
      name: "测试关卡",
      size: 5,
      target: [[1, "a"], [1, 2]],
      pieces: [
        {
          id: "piece-1",
          name: "方符",
          color: "#d7b84f",
          cells: [[0, 0]]
        }
      ]
    });

    const result = validateAndImportLevel(json);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("格式无效"))).toBe(true);
  });

  it("目标格超出棋盘范围时返回错误", () => {
    const json = JSON.stringify({
      name: "测试关卡",
      size: 3,
      target: [[0, 0], [5, 5]],
      pieces: [
        {
          id: "piece-1",
          name: "方符",
          color: "#d7b84f",
          cells: [[0, 0]]
        }
      ]
    });

    const result = validateAndImportLevel(json);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("超出棋盘"))).toBe(true);
  });

  it("碎片 id 重复时返回错误", () => {
    const json = JSON.stringify({
      name: "测试关卡",
      size: 5,
      target: [[1, 1], [1, 2]],
      pieces: [
        { id: "dup", name: "碎片1", color: "#d7b84f", cells: [[0, 0]] },
        { id: "dup", name: "碎片2", color: "#54a0a8", cells: [[0, 0]] }
      ]
    });

    const result = validateAndImportLevel(json);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("id 重复"))).toBe(true);
  });

  it("碎片内部存在重复格子时发出警告并去重", () => {
    const json = JSON.stringify({
      name: "测试关卡",
      size: 5,
      target: [[1, 1], [1, 2]],
      pieces: [
        {
          id: "piece-1",
          name: "重复格碎片",
          color: "#d7b84f",
          cells: [[0, 0], [0, 0], [0, 1]]
        }
      ]
    });

    const result = validateAndImportLevel(json);
    expect(result.warnings.some((w) => w.includes("内部存在重复格子"))).toBe(true);
    expect(result.warnings.some((w) => w.includes("声明面积 3") && w.includes("实际面积 2"))).toBe(true);
    expect(result.level).not.toBeNull();
    expect(result.level!.pieces[0].cells.length).toBe(2);
  });

  it("碎片面积与目标格数量不匹配时返回错误", () => {
    const json = JSON.stringify({
      name: "测试关卡",
      size: 5,
      target: [[1, 1], [1, 2], [2, 1], [2, 2]],
      pieces: [
        {
          id: "piece-1",
          name: "方符",
          color: "#d7b84f",
          cells: [[0, 0], [0, 1]]
        }
      ]
    });

    const result = validateAndImportLevel(json);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("面积") && e.includes("不相等"))).toBe(true);
  });

  it("碎片格子为空时返回错误", () => {
    const json = JSON.stringify({
      name: "测试关卡",
      size: 5,
      target: [[1, 1]],
      pieces: [
        {
          id: "piece-1",
          name: "空碎片",
          color: "#d7b84f",
          cells: []
        }
      ]
    });

    const result = validateAndImportLevel(json);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("没有格子"))).toBe(true);
  });

  it("合法关卡成功导入并生成 workshop 前缀 id", () => {
    const level = createValidLevel();
    const json = levelToJson(level);

    const result = validateAndImportLevel(json);
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
    expect(result.level).not.toBeNull();
    expect(result.level!.id.startsWith("workshop-")).toBe(true);
    expect(result.level!.name).toBe("测试关卡");
    expect(result.level!.size).toBe(5);
    expect(result.level!.target.length).toBe(4);
    expect(result.level!.pieces.length).toBe(1);
  });

  it("导入后的碎片 cells 被归一化（对齐到原点并排序）", () => {
    const json = JSON.stringify({
      name: "测试关卡",
      size: 5,
      target: [[2, 2], [2, 3], [3, 2], [3, 3]],
      pieces: [
        {
          id: "piece-1",
          name: "偏移碎片",
          color: "#d7b84f",
          cells: [[5, 5], [5, 6], [6, 5], [6, 6]]
        }
      ]
    });

    const result = validateAndImportLevel(json);
    expect(result.valid).toBe(true);
    expect(result.level!.pieces[0].cells).toEqual([
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1]
    ]);
  });

  it("导入后的目标格被排序", () => {
    const json = JSON.stringify({
      name: "测试关卡",
      size: 5,
      target: [[2, 2], [1, 1], [1, 2], [2, 1]],
      pieces: [
        {
          id: "piece-1",
          name: "方符",
          color: "#d7b84f",
          cells: [[0, 0], [0, 1], [1, 0], [1, 1]]
        }
      ]
    });

    const result = validateAndImportLevel(json);
    expect(result.valid).toBe(true);
    expect(result.level!.target).toEqual([
      [1, 1],
      [1, 2],
      [2, 1],
      [2, 2]
    ]);
  });
});

describe("exportLevelToJson", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("导出的 JSON 包含必要字段", () => {
    const level = createValidLevel();
    const json = exportLevelToJson(level);
    const parsed = JSON.parse(json);

    expect(parsed.name).toBe(level.name);
    expect(parsed.size).toBe(level.size);
    expect(parsed.target).toEqual(level.target);
    expect(Array.isArray(parsed.pieces)).toBe(true);
    expect(parsed.pieces.length).toBe(level.pieces.length);
    expect(typeof parsed.exportedAt).toBe("string");
    expect(parsed.version).toBe(1);
  });

  it("导出的碎片字段完整", () => {
    const level = createValidLevel();
    const json = exportLevelToJson(level);
    const parsed = JSON.parse(json);
    const piece = parsed.pieces[0];

    expect(piece.id).toBe(level.pieces[0].id);
    expect(piece.name).toBe(level.pieces[0].name);
    expect(piece.color).toBe(level.pieces[0].color);
    expect(piece.cells).toEqual(level.pieces[0].cells);
  });

  it("导出结果格式为美化 JSON（包含换行和缩进）", () => {
    const level = createValidLevel();
    const json = exportLevelToJson(level);

    expect(json).toContain("\n");
    expect(json).toContain("  ");
  });

  it("导出的 JSON 可以被 validateAndImportLevel 正确解析", () => {
    const level = createValidLevel();
    const exported = exportLevelToJson(level);
    const result = validateAndImportLevel(exported);

    expect(result.valid).toBe(true);
    expect(result.level).not.toBeNull();
    expect(result.level!.name).toBe(level.name);
    expect(result.level!.size).toBe(level.size);
    expect(result.level!.target).toEqual(level.target);
    expect(result.level!.pieces.length).toBe(level.pieces.length);
  });

  it("导出碎片面积不匹配的关卡（仅测试导出本身，不验证导入）", () => {
    const mismatchedLevel: Level = {
      id: "mismatched",
      name: "面积不匹配关卡",
      size: 5,
      target: [[1, 1], [1, 2], [2, 1], [2, 2]],
      pieces: [
        {
          id: "piece-small",
          name: "小碎片",
          color: "#d7b84f",
          cells: [[0, 0]]
        }
      ]
    };

    const json = exportLevelToJson(mismatchedLevel);
    const parsed = JSON.parse(json);

    expect(parsed.name).toBe("面积不匹配关卡");
    expect(parsed.target.length).toBe(4);
    expect(parsed.pieces.length).toBe(1);
    expect(parsed.pieces[0].cells.length).toBe(1);
  });

  it("导出-导入往返后 target 和 pieces cells 排序一致", () => {
    const level: Level = {
      id: "roundtrip",
      name: "往返测试",
      size: 5,
      target: [[2, 2], [0, 0], [0, 1], [1, 0]],
      pieces: [
        {
          id: "p1",
          name: "测试碎片",
          color: "#54a0a8",
          cells: [[0, 1], [1, 0], [0, 0]]
        },
        {
          id: "p2",
          name: "单格碎片",
          color: "#d09b4c",
          cells: [[0, 0]]
        }
      ]
    };

    const exported = exportLevelToJson(level);
    const imported = validateAndImportLevel(exported);

    expect(imported.valid).toBe(true);
    expect(imported.level!.target).toEqual([[0, 0], [0, 1], [1, 0], [2, 2]]);
    expect(imported.level!.pieces[0].cells).toEqual([
      [0, 0],
      [0, 1],
      [1, 0]
    ]);
    expect(imported.level!.pieces[1].cells).toEqual([[0, 0]]);
  });

  it("导入后生成的每个碎片 id 都是唯一的", () => {
    const level: Level = {
      id: "multi",
      name: "多碎片关卡",
      size: 5,
      target: [[1, 1], [1, 2], [2, 1], [2, 2], [3, 3]],
      pieces: [
        { id: "p1", name: "碎片1", color: "#54a0a8", cells: [[0, 0]] },
        { id: "p2", name: "碎片2", color: "#d09b4c", cells: [[0, 0]] },
        { id: "p3", name: "碎片3", color: "#c96161", cells: [[0, 0]] },
        { id: "p4", name: "碎片4", color: "#7c70c7", cells: [[0, 0]] },
        { id: "p5", name: "碎片5", color: "#df6f52", cells: [[0, 0]] }
      ]
    };

    const exported = exportLevelToJson(level);
    const imported = validateAndImportLevel(exported);

    expect(imported.valid).toBe(true);
    const ids = imported.level!.pieces.map((p) => p.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});
