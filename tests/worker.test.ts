import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_OPTIONS, type WorkerRequest, type WorkerResponse } from "../src/core/types";

let scope: { onmessage: ((event: { data: WorkerRequest }) => void) | null; postMessage: ReturnType<typeof vi.fn> };

function send(request: WorkerRequest): WorkerResponse {
  scope.postMessage.mockClear();
  scope.onmessage!({ data: request });
  expect(scope.postMessage).toHaveBeenCalledTimes(1);
  const response = scope.postMessage.mock.calls[0][0] as WorkerResponse;
  expect(response.reqId).toBe(request.reqId);
  return response;
}

function sample(name: string): ArrayBuffer {
  return Uint8Array.from(readFileSync(new URL(`../src/assets/samples/${name}`, import.meta.url))).buffer;
}

beforeEach(async () => {
  vi.resetModules();
  scope = { onmessage: null, postMessage: vi.fn() };
  vi.stubGlobal("self", scope);
  await import("../src/worker/analyze.worker");
});
afterEach(() => vi.unstubAllGlobals());

describe("worker message contract", () => {
  it("loads the shipped UTF-8 sample, analyzes and paginates its rows", () => {
    const loaded = send({ reqId: 1, type: "load", kind: "csv", buffer: sample("sample-utf8.csv"), fileName: "sample.csv" });
    expect(loaded).toMatchObject({ type: "loaded", info: { kind: "csv", encoding: "UTF-8 (BOM)", columnCount: 10, sheets: null, activeSheet: null } });
    const result = send({ reqId: 2, type: "analyze", options: { ...DEFAULT_OPTIONS, previewRows: 2 } });
    expect(result.type).toBe("result");
    if (result.type !== "result") throw new Error("Expected analysis result");
    expect(result.result.datasetName).toBe("sample.csv");
    expect(result.result.columns[0].name).toBe("日期");
    expect(result.result.preview).toHaveLength(2);
    expect(result.result.rowCount).toBeGreaterThan(2);
    expect(send({ reqId: 3, type: "rows", offset: 1, limit: 1 })).toEqual({
      reqId: 3, type: "rows-result", offset: 1, rows: [result.result.preview[1]], totalRows: result.result.rowCount,
    });
    expect(send({ reqId: 4, type: "rows", offset: result.result.rowCount, limit: 10 })).toMatchObject({ rows: [] });
  });

  it("redecodes the shipped Big5 sample using the original bytes", () => {
    expect(send({ reqId: 1, type: "load", kind: "csv", buffer: sample("sample-big5.csv"), fileName: "big5.csv" })).toMatchObject({ type: "loaded", info: { encoding: "Big5" } });
    const original = send({ reqId: 2, type: "rows", offset: 0, limit: 2 });
    expect(send({ reqId: 3, type: "redecode", encoding: "utf-8" })).toMatchObject({ type: "loaded", info: { encoding: "UTF-8" } });
    const garbled = send({ reqId: 4, type: "rows", offset: 0, limit: 2 });
    expect(garbled.type === "rows-result" && garbled.rows.flat().join()).toContain("\ufffd");
    expect(send({ reqId: 5, type: "redecode", encoding: "big5" })).toMatchObject({ type: "loaded", info: { encoding: "BIG5" } });
    const restored = send({ reqId: 6, type: "rows", offset: 0, limit: 2 });
    expect(restored).toEqual({ ...original, reqId: 6 });
  });

  it("returns requested histogram bins while excluding missing and nonnumeric cells", () => {
    send({ reqId: 1, type: "load-text", fileName: "pasted", text: "value,label\n1,a\n2,b\n3,c\n4,d\nNA,e\n,f\ninvalid,g" });
    const response = send({ reqId: 2, type: "histogram", column: 0, bins: 2 });
    expect(response.type).toBe("histogram-result");
    if (response.type !== "histogram-result") throw new Error("Expected histogram");
    expect(response.column).toBe(0);
    expect(response.histogram.counts).toEqual([2, 2]);
    expect(response.histogram.edges).toEqual([1, 2.5, 4]);
    expect(send({ reqId: 3, type: "histogram", column: 20, bins: 2 })).toMatchObject({ type: "error", message: "欄位不存在" });
    expect(send({ reqId: 4, type: "redecode", encoding: "big5" })).toMatchObject({ type: "error", message: "只有 CSV 檔案可以重新選擇編碼" });
  });

  it("loads database query results as a dataset for analysis and pagination", () => {
    const loaded = send({
      reqId: 1,
      type: "load-dataset",
      dataset: {
        name: "資料庫：銷售查詢",
        columnNames: ["customer", "amount", "closed_at"],
        columns: [
          ["A", "B", "C"],
          ["1200.5", "", "900"],
          ["2026-09-01", "2026-09-02", ""],
        ],
        rowCount: 3,
      },
    });
    expect(loaded).toMatchObject({
      type: "loaded",
      info: { kind: "database", encoding: null, sheets: null, activeSheet: null, rowCount: 3, columnCount: 3 },
    });
    const result = send({ reqId: 2, type: "analyze", options: { ...DEFAULT_OPTIONS, previewRows: 2 } });
    expect(result.type).toBe("result");
    if (result.type !== "result") throw new Error("Expected analysis result");
    expect(result.result.datasetName).toBe("資料庫：銷售查詢");
    expect(result.result.columns[1].type).toBe("number");
    expect(result.result.preview).toEqual([
      ["A", "1200.5", "2026-09-01"],
      ["B", "", "2026-09-02"],
    ]);
    expect(send({ reqId: 3, type: "rows", offset: 2, limit: 2 })).toMatchObject({
      type: "rows-result",
      rows: [["C", "900", ""]],
      totalRows: 3,
    });
  });

  it("reports errors before any data is loaded", () => {
    expect(send({ reqId: 9, type: "analyze", options: DEFAULT_OPTIONS })).toEqual({ reqId: 9, type: "error", message: "尚未載入資料" });
  });
});
