import { describe, expect, it } from "vitest";
import { dedupeNames, parseDelimited } from "../src/io/csv";

describe("parseDelimited", () => {
  it("解析 CSV 並轉為欄式結構", () => {
    const ds = parseDelimited("a,b,c\n1,2,3\n4,5,6", "t.csv");
    expect(ds.columnNames).toEqual(["a", "b", "c"]);
    expect(ds.rowCount).toBe(2);
    expect(ds.columns[0]).toEqual(["1", "4"]);
    expect(ds.columns[2]).toEqual(["3", "6"]);
  });

  it("解析 TSV", () => {
    const ds = parseDelimited("a\tb\n1\t2", "t.tsv");
    expect(ds.columnNames).toEqual(["a", "b"]);
    expect(ds.columns[1]).toEqual(["2"]);
  });

  it("短列補空值", () => {
    const ds = parseDelimited("a,b,c\n1,2", "t.csv");
    expect(ds.columns[2]).toEqual([""]);
  });

  it("空檔案拋錯", () => {
    expect(() => parseDelimited("", "t.csv")).toThrow();
    expect(() => parseDelimited("\n\n", "t.csv")).toThrow();
  });
});

describe("dedupeNames", () => {
  it("重複欄名加後綴", () => {
    expect(dedupeNames(["a", "a", "b", "a"])).toEqual(["a", "a (2)", "b", "a (3)"]);
  });

  it("空欄名補預設值", () => {
    expect(dedupeNames(["", " "])).toEqual(["(未命名)", "(未命名) (2)"]);
  });
});
