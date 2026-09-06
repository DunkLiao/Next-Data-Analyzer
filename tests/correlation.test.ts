import { describe, expect, it } from "vitest";
import { pearson, ranks, spearman } from "../src/core/correlation";

describe("pearson", () => {
  it("完全正相關 = 1", () => {
    const x = Float64Array.from([1, 2, 3, 4, 5]);
    const y = Float64Array.from([2, 4, 6, 8, 10]);
    expect(pearson(x, y)).toBeCloseTo(1, 10);
  });

  it("完全負相關 = -1", () => {
    const x = Float64Array.from([1, 2, 3, 4, 5]);
    const y = Float64Array.from([10, 8, 6, 4, 2]);
    expect(pearson(x, y)).toBeCloseTo(-1, 10);
  });

  it("忽略 NaN 配對", () => {
    const x = Float64Array.from([1, 2, NaN, 4, 5]);
    const y = Float64Array.from([2, 4, 999, 8, 10]);
    expect(pearson(x, y)).toBeCloseTo(1, 10);
  });

  it("配對不足回傳 null", () => {
    expect(pearson(Float64Array.from([1, 2]), Float64Array.from([1, 2]))).toBeNull();
  });

  it("常數欄位回傳 null", () => {
    expect(pearson(Float64Array.from([1, 1, 1, 1]), Float64Array.from([1, 2, 3, 4]))).toBeNull();
  });
});

describe("ranks", () => {
  it("相同值取平均排名", () => {
    const r = ranks(Float64Array.from([10, 20, 20, 30]));
    expect(Array.from(r)).toEqual([1, 2.5, 2.5, 4]);
  });

  it("NaN 保持 NaN", () => {
    const r = ranks(Float64Array.from([5, NaN, 1]));
    expect(r[0]).toBe(2);
    expect(Number.isNaN(r[1])).toBe(true);
    expect(r[2]).toBe(1);
  });
});

describe("spearman", () => {
  it("單調非線性關係 = 1", () => {
    const x = Float64Array.from([1, 2, 3, 4, 5]);
    const y = Float64Array.from([1, 4, 9, 16, 25]);
    expect(spearman(x, y)).toBeCloseTo(1, 10);
  });
});
