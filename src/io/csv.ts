import Papa from "papaparse";
import type { Dataset } from "../core/types";

export function dedupeNames(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((raw) => {
    const base = raw.trim() === "" ? "(未命名)" : raw.trim();
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n === 0 ? base : `${base} (${n + 1})`;
  });
}

export function parseDelimited(text: string, name: string): Dataset {
  const parsed = Papa.parse<string[]>(text.trim(), {
    skipEmptyLines: "greedy",
  });
  const rows = parsed.data.filter((r) => r.length > 1 || (r.length === 1 && r[0].trim() !== ""));
  if (rows.length === 0) throw new Error("檔案內容為空");
  const header = dedupeNames(rows[0].map((h) => String(h ?? "")));
  const colCount = header.length;
  const columns: string[][] = Array.from({ length: colCount }, () => []);
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    for (let c = 0; c < colCount; c++) {
      columns[c].push(c < row.length ? String(row[c] ?? "") : "");
    }
  }
  return { name, columnNames: header, columns, rowCount: rows.length - 1 };
}
