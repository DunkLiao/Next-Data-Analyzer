import { describe, expect, it } from "vitest";
import { computeHistogram, numericStats, quantileSorted } from "../src/core/stats";

describe("quantileSorted", () => {
  it("線性內插（type 7）", () => {
    const s = Float64Array.from([1, 2, 3, 4, 5]);
    expect(quantileSorted(s, 0.5)).toBe(3);
    expect(quantileSorted(s, 0.25)).toBe(2);
    expect(quantileSorted(s, 0)).toBe(1);
    expect(quantileSorted(s, 1)).toBe(5);
  });

  it("單筆資料", () => {
    expect(quantileSorted(Float64Array.from([42]), 0.5)).toBe(42);
  });
});

describe("numericStats", () => {
  it("基本描述統計", () => {
    const s = numericStats(Float64Array.from([1, 2, 3, 4, 5]))!;
    expect(s.count).toBe(5);
    expect(s.mean).toBe(3);
    expect(s.median).toBe(3);
    expect(s.min).toBe(1);
    expect(s.max).toBe(5);
    expect(s.std).toBeCloseTo(Math.sqrt(2.5), 10);
  });

  it("忽略 NaN", () => {
    const s = numericStats(Float64Array.from([1, NaN, 3]))!;
    expect(s.count).toBe(2);
    expect(s.mean).toBe(2);
  });

  it("空資料回傳 null", () => {
    expect(numericStats(Float64Array.from([]))).toBeNull();
    expect(numericStats(Float64Array.from([NaN, NaN]))).toBeNull();
  });

  it("IQR 離群值偵測", () => {
    const data = [10, 11, 12, 13, 14, 15, 100];
    const s = numericStats(Float64Array.from(data))!;
    expect(s.iqrOutliers).toBe(1);
  });

  it("常態對稱資料偏度接近 0", () => {
    const data = [-3, -2, -1, 0, 1, 2, 3];
    const s = numericStats(Float64Array.from(data))!;
    expect(Math.abs(s.skew)).toBeLessThan(0.01);
  });
});

describe("computeHistogram", () => {
  it("總數等於資料筆數", () => {
    const values = Float64Array.from(Array.from({ length: 100 }, (_, i) => i));
    const h = computeHistogram(values, 10);
    expect(h.counts.reduce((a, b) => a + b, 0)).toBe(100);
    expect(h.edges.length).toBe(11);
    expect(h.edges[0]).toBe(0);
    expect(h.edges[10]).toBe(99);
  });

  it("單一值資料", () => {
    const h = computeHistogram(Float64Array.from([5, 5, 5]));
    expect(h.counts[0]).toBe(3);
  });

  it("分組數上限保護", () => {
    const values = Float64Array.from(Array.from({ length: 50 }, (_, i) => i));
    const h = computeHistogram(values, 99999);
    expect(h.counts.length).toBeLessThanOrEqual(200);
  });
});
