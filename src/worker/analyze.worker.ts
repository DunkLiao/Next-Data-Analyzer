import { analyze } from "../core/analyze";
import { parseNumberValue } from "../core/infer";
import type { Dataset, WorkerRequest, WorkerResponse } from "../core/types";
import { computeHistogram } from "../core/stats";
import { parseDelimited } from "../io/csv";
import { decodeBuffer } from "../io/encoding";
import { extractSheet, readWorkbook } from "../io/excel";
import type { WorkBook } from "xlsx";

let rawBuffer: ArrayBuffer | null = null;
let workbook: WorkBook | null = null;
let dataset: Dataset | null = null;
let kind: "csv" | "excel" | "text" | null = null;
let encoding: string | null = null;
let activeSheet: string | null = null;

function currentSheets(): string[] | null {
  return workbook ? [...workbook.SheetNames] : null;
}

function post(msg: WorkerResponse, transfer?: Transferable[]): void {
  if (transfer) (self as unknown as Worker).postMessage(msg, transfer);
  else (self as unknown as Worker).postMessage(msg);
}

function loadCsv(buffer: ArrayBuffer, fileName: string, forceEncoding?: string): void {
  rawBuffer = buffer;
  const decoded = decodeBuffer(buffer, forceEncoding);
  encoding = decoded.encoding;
  dataset = parseDelimited(decoded.text, fileName);
}

function loadExcel(buffer: ArrayBuffer, fileName: string): void {
  rawBuffer = buffer;
  workbook = readWorkbook(buffer);
  encoding = null;
  activeSheet = workbook.SheetNames[0];
  dataset = extractSheet(workbook, activeSheet, fileName);
}

function handle(msg: WorkerRequest): void {
  try {
    switch (msg.type) {
      case "load": {
        workbook = null;
        activeSheet = null;
        kind = msg.kind;
        if (msg.kind === "csv") loadCsv(msg.buffer, msg.fileName);
        else loadExcel(msg.buffer, msg.fileName);
        post({
          reqId: msg.reqId,
          type: "loaded",
          info: {
            kind: msg.kind,
            encoding,
            sheets: currentSheets(),
            activeSheet,
            rowCount: dataset!.rowCount,
            columnCount: dataset!.columnNames.length,
          },
        });
        break;
      }
      case "load-text": {
        workbook = null;
        rawBuffer = null;
        activeSheet = null;
        kind = "text";
        encoding = "剪貼簿";
        dataset = parseDelimited(msg.text, msg.fileName);
        post({
          reqId: msg.reqId,
          type: "loaded",
          info: {
            kind: "text",
            encoding,
            sheets: null,
            activeSheet: null,
            rowCount: dataset.rowCount,
            columnCount: dataset.columnNames.length,
          },
        });
        break;
      }
      case "select-sheet": {
        const wb = workbook;
        if (!wb) throw new Error("目前沒有載入 Excel 活頁簿");
        activeSheet = msg.sheet;
        dataset = extractSheet(wb, msg.sheet, dataset?.name.split(" [")[0] ?? "data");
        post({
          reqId: msg.reqId,
          type: "loaded",
          info: {
            kind: "excel",
            encoding,
            sheets: [...wb.SheetNames],
            activeSheet,
            rowCount: dataset.rowCount,
            columnCount: dataset.columnNames.length,
          },
        });
        break;
      }
      case "redecode": {
        if (!rawBuffer || kind !== "csv") throw new Error("只有 CSV 檔案可以重新選擇編碼");
        loadCsv(rawBuffer, dataset?.name ?? "data.csv", msg.encoding);
        post({
          reqId: msg.reqId,
          type: "loaded",
          info: {
            kind: "csv",
            encoding,
            sheets: null,
            activeSheet: null,
            rowCount: dataset!.rowCount,
            columnCount: dataset!.columnNames.length,
          },
        });
        break;
      }
      case "analyze": {
        if (!dataset) throw new Error("尚未載入資料");
        const result = analyze(dataset, msg.options);
        post({ reqId: msg.reqId, type: "result", result });
        break;
      }
      case "histogram": {
        if (!dataset) throw new Error("尚未載入資料");
        const values = dataset.columns[msg.column];
        if (!values) throw new Error("欄位不存在");
        const nums: number[] = [];
        for (const v of values) {
          const n = parseNumberValue(v);
          if (n !== null && Number.isFinite(n)) nums.push(n);
        }
        const histogram = computeHistogram(Float64Array.from(nums), msg.bins);
        post({ reqId: msg.reqId, type: "histogram-result", column: msg.column, histogram });
        break;
      }
      case "rows": {
        if (!dataset) throw new Error("尚未載入資料");
        const { offset, limit } = msg;
        const end = Math.min(offset + limit, dataset.rowCount);
        const rows: string[][] = [];
        for (let r = offset; r < end; r++) {
          rows.push(dataset.columns.map((col) => col[r]));
        }
        post({ reqId: msg.reqId, type: "rows-result", offset, rows, totalRows: dataset.rowCount });
        break;
      }
    }
  } catch (e) {
    post({ reqId: msg.reqId, type: "error", message: e instanceof Error ? e.message : String(e) });
  }
}

self.onmessage = (e: MessageEvent<WorkerRequest>) => handle(e.data);
