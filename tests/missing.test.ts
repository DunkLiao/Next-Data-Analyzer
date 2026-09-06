import { describe, expect, it } from "vitest";
import { buildTokenSet, countMissing, countUnique, isMissingValue, missingMask, missingPatterns } from "../src/core/missing";

const tokens = buildTokenSet(["NA", "N/A", "NULL", "NaN", "未知"]);

describe("isMissingValue", () => {
  it("空白值一律視為缺失", () => {
    expect(isMissingValue("", tokens)).toBe(true);
    expect(isMissingValue("   ", tokens)).toBe(true);
  });

  it("代碼不分大小寫、去除空白", () => {
    expect(isMissingValue("NA", tokens)).toBe(true);
    expect(isMissingValue(" na ", tokens)).toBe(true);
    expect(isMissingValue("null", tokens)).toBe(true);
    expect(isMissingValue("未知", tokens)).toBe(true);
  });

  it("正常值不是缺失", () => {
    expect(isMissingValue("0", tokens)).toBe(false);
    expect(isMissingValue("hello", tokens)).toBe(false);
    expect(isMissingValue("NBA", tokens)).toBe(false);
  });
});

describe("missingMask / countMissing", () => {
  it("逐欄計算缺失", () => {
    const mask = missingMask(["1", "NA", "3", "", "5"], tokens);
    expect(Array.from(mask)).toEqual([0, 1, 0, 1, 0]);
    expect(countMissing(mask)).toBe(2);
  });
});

describe("countUnique", () => {
  it("只計算非缺失值", () => {
    const values = ["a", "b", "a", "NA", "", "b"];
    const mask = missingMask(values, tokens);
    expect(countUnique(values, mask).unique).toBe(2);
  });
});

describe("missingPatterns", () => {
  it("找出缺失組合與完整列", () => {
    const colA = missingMask(["1", "", "3", ""], tokens);
    const colB = missingMask(["x", "NA", "z", "w"], tokens);
    const { patterns, completeRows } = missingPatterns([colA, colB], 4);
    expect(completeRows).toBe(2);
    expect(patterns[0]).toEqual({ indices: [0, 1], count: 1 });
    expect(patterns[1]).toEqual({ indices: [0], count: 1 });
  });
});
