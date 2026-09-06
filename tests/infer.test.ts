import { describe, expect, it } from "vitest";
import { inferType, parseBooleanValue, parseDateValue, parseNumberValue } from "../src/core/infer";

const noMask = (n: number) => new Uint8Array(n);

describe("parseNumberValue", () => {
  it("一般數字", () => {
    expect(parseNumberValue("123")).toBe(123);
    expect(parseNumberValue("-3.14")).toBeCloseTo(-3.14);
    expect(parseNumberValue("1e3")).toBe(1000);
  });

  it("千分位", () => {
    expect(parseNumberValue("1,234.5")).toBeCloseTo(1234.5);
  });

  it("非數字", () => {
    expect(parseNumberValue("abc")).toBeNull();
    expect(parseNumberValue("12abc")).toBeNull();
    expect(parseNumberValue("")).toBeNull();
  });
});

describe("parseDateValue", () => {
  it("ISO 格式", () => {
    const t = parseDateValue("2026-09-04");
    expect(t).not.toBeNull();
    const d = new Date(t!);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(8);
    expect(d.getDate()).toBe(4);
  });

  it("日期時間", () => {
    expect(parseDateValue("2026/1/5 13:45")).not.toBeNull();
  });

  it("無效日期", () => {
    expect(parseDateValue("2026-13-01")).toBeNull();
    expect(parseDateValue("2026-02-30")).toBeNull();
    expect(parseDateValue("hello")).toBeNull();
  });
});

describe("parseBooleanValue", () => {
  it("true/false 不分大小寫", () => {
    expect(parseBooleanValue("TRUE")).toBe(true);
    expect(parseBooleanValue("false")).toBe(false);
    expect(parseBooleanValue("yes")).toBeNull();
  });
});

describe("inferType", () => {
  it("整數欄", () => {
    expect(inferType(["1", "2", "3", "4"], noMask(4))).toBe("integer");
  });

  it("數值欄", () => {
    expect(inferType(["1.5", "2.25", "3.75", "-4"], noMask(4))).toBe("number");
  });

  it("日期欄", () => {
    expect(inferType(["2026-01-01", "2026-01-02", "2026-01-03"], noMask(3))).toBe("date");
  });

  it("布林欄", () => {
    expect(inferType(["TRUE", "FALSE", "true", "FALSE"], noMask(4))).toBe("boolean");
  });

  it("文字欄", () => {
    expect(inferType(["蘋果", "香蕉", "橘子"], noMask(3))).toBe("text");
  });

  it("容忍少量雜值", () => {
    const values = Array.from({ length: 20 }, (_, i) => String(i + 1));
    values[0] = "問號";
    expect(inferType(values, noMask(20))).toBe("integer");
  });
});
