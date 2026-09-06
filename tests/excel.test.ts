import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { extractSheet, readWorkbook } from "../src/io/excel";

describe("Excel import", () => {
  it.each(["xlsx", "biff8"] as const)("reads %s workbooks and selects sheets", (bookType) => {
    const source = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(source, XLSX.utils.aoa_to_sheet([["first"], [1]]), "One");
    XLSX.utils.book_append_sheet(source, XLSX.utils.aoa_to_sheet([["second"], [2], [3]]), "Two");
    const wb = readWorkbook(XLSX.write(source, { type: "array", bookType }));
    expect(wb.SheetNames).toEqual(["One", "Two"]);
    expect(extractSheet(wb, "Two", "book.xls")).toEqual({
      name: "book.xls [Two]", columnNames: ["second"], columns: [["2", "3"]], rowCount: 2,
    });
  });

  it("removes blank rows, normalizes cells and fills missing column names", () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      [], ["date", "flag", "number", "", ""],
      [new Date(2026, 8, 5), true, 12.5, "value"],
      [" ", "", null],
      [new Date(2026, 8, 5, 12, 34, 56), false, -0, null, "tail"],
    ], { cellDates: true }), "Data");
    const ds = extractSheet(wb, "Data", "test.xlsx");
    expect(ds.columnNames).toEqual(["date", "flag", "number", "(未命名)", "(未命名) (2)"]);
    expect(ds.rowCount).toBe(2);
    expect(ds.columns).toEqual([
      ["2026-09-05", "2026-09-05 12:34:56"], ["TRUE", "FALSE"], ["12.5", "0"], ["value", ""], ["", "tail"],
    ]);
  });

  it("preserves Excel dates through workbook serialization", () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["date"], [new Date(2026, 8, 5)]], { cellDates: true }), "Data");
    const decoded = readWorkbook(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
    expect(extractSheet(decoded, "Data", "dates.xlsx").columns).toEqual([["2026-09-05"]]);
  });

  it("rejects missing and empty sheets with readable errors", () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[" "], []]), "Empty");
    expect(() => extractSheet(wb, "Missing", "test")).toThrow("找不到工作表「Missing」");
    expect(() => extractSheet(wb, "Empty", "test")).toThrow("工作表「Empty」內容為空");
  });
});
