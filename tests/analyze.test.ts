import { describe, expect, it } from "vitest";
import { analyze } from "../src/core/analyze";
import type { Dataset } from "../src/core/types";
import { DEFAULT_OPTIONS } from "../src/core/types";

function sampleDataset(): Dataset {
  return {
    name: "test.csv",
    columnNames: ["id", "score", "city", "date"],
    columns: [
      ["A1", "A2", "A3", "A4", "A5", "A6"],
      ["90.5", "NA", "75.2", "88.9", "", "60.1"],
      ["台北", "台中", "台北", "高雄", "台北", "台中"],
      ["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04", "2026-01-05", "2026-01-06"],
    ],
    rowCount: 6,
  };
}

describe("analyze", () => {
  const result = analyze(sampleDataset(), DEFAULT_OPTIONS);

  it("欄位型別推斷", () => {
    expect(result.columns.map((c) => c.type)).toEqual(["text", "number", "text", "date"]);
  });

  it("缺失統計", () => {
    const score = result.columns[1];
    expect(score.missing).toBe(2);
    expect(score.missingPct).toBeCloseTo(2 / 6);
    expect(result.missingSummary.missingCells).toBe(2);
    expect(result.missingSummary.completeRows).toBe(4);
    expect(result.missingSummary.anyMissingRows).toBe(2);
  });

  it("數值欄統計只算有效值", () => {
    const score = result.columns[1];
    expect(score.numeric).toBeDefined();
    expect(score.numeric!.count).toBe(4);
    expect(score.numeric!.mean).toBeCloseTo((90.5 + 75.2 + 88.9 + 60.1) / 4);
  });

  it("類別欄次數", () => {
    const city = result.columns[2];
    expect(city.categorical!.cardinality).toBe(3);
    expect(city.categorical!.top[0]).toEqual({ value: "台北", count: 3 });
  });

  it("日期欄", () => {
    const date = result.columns[3];
    expect(date.date!.count).toBe(6);
    expect(date.date!.unit).toBe("day");
    expect(date.date!.points.length).toBe(6);
  });

  it("缺失模式", () => {
    expect(result.patterns.length).toBe(1);
    expect(result.patterns[0].columns).toEqual(["score"]);
    expect(result.patterns[0].count).toBe(2);
  });

  it("熱力圖結構", () => {
    expect(result.heatmap).not.toBeNull();
    expect(result.heatmap!.cells.length).toBe(6 * 4);
  });

  it("相關性只有一個數值欄時為 null", () => {
    expect(result.correlation).toBeNull();
  });

  it("多個數值欄時計算相關性", () => {
    const ds: Dataset = {
      name: "corr.csv",
      columnNames: ["a", "b"],
      columns: [
        ["1", "2", "3", "4", "5"],
        ["2", "4", "6", "8", "10"],
      ],
      rowCount: 5,
    };
    const r = analyze(ds, DEFAULT_OPTIONS);
    expect(r.correlation).not.toBeNull();
    expect(r.correlation!.pearson[0][1]).toBeCloseTo(1);
    expect(r.correlation!.spearman[0][1]).toBeCloseTo(1);
  });
});
