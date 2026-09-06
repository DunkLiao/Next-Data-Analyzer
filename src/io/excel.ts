import * as XLSX from "xlsx";
import type { Dataset } from "../core/types";
import { dedupeNames } from "./csv";

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function cellToString(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) {
    const date = `${v.getFullYear()}-${pad2(v.getMonth() + 1)}-${pad2(v.getDate())}`;
    if (v.getHours() === 0 && v.getMinutes() === 0 && v.getSeconds() === 0) return date;
    return `${date} ${pad2(v.getHours())}:${pad2(v.getMinutes())}:${pad2(v.getSeconds())}`;
  }
  if (typeof v === "number") return Object.is(v, -0) ? "0" : String(v);
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  return String(v);
}

export function readWorkbook(buf: ArrayBuffer): XLSX.WorkBook {
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  if (wb.SheetNames.length === 0) throw new Error("活頁簿中沒有任何工作表");
  return wb;
}

export function extractSheet(wb: XLSX.WorkBook, sheetName: string, name: string): Dataset {
  const sheet = wb.Sheets[sheetName];
  if (!sheet) throw new Error(`找不到工作表「${sheetName}」`);
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: "" });
  const cleaned = rows.filter((r) => r.some((c) => cellToString(c).trim() !== ""));
  if (cleaned.length === 0) throw new Error(`工作表「${sheetName}」內容為空`);
  const width = Math.max(...cleaned.map((r) => r.length));
  const header = dedupeNames(cleaned[0].map((h, i) => (i < cleaned[0].length ? cellToString(h) : "")));
  const colCount = Math.max(header.length, width);
  while (header.length < colCount) header.push(`(欄 ${header.length + 1})`);
  const columns: string[][] = Array.from({ length: colCount }, () => []);
  for (let r = 1; r < cleaned.length; r++) {
    const row = cleaned[r];
    for (let c = 0; c < colCount; c++) {
      columns[c].push(c < row.length ? cellToString(row[c]) : "");
    }
  }
  return { name: `${name} [${sheetName}]`, columnNames: header, columns, rowCount: cleaned.length - 1 };
}
