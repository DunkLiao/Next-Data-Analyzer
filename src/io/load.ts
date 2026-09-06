import { invoke } from "@tauri-apps/api/core";
import type { Dataset, LoadInfo, WorkerRequest, WorkerResponse } from "../core/types";
import AnalyzeWorker from "../worker/analyze.worker.ts?worker";

type Pending = { resolve: (v: WorkerResponse) => void; reject: (e: Error) => void };

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export class AnalyzerClient {
  private worker: Worker;
  private nextReqId = 1;
  private pending = new Map<number, Pending>();

  constructor() {
    this.worker = new AnalyzeWorker();
    this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;
      const p = this.pending.get(msg.reqId);
      if (!p) return;
      this.pending.delete(msg.reqId);
      if (msg.type === "error") p.reject(new Error(msg.message));
      else p.resolve(msg);
    };
    this.worker.onerror = (e) => {
      for (const [, p] of this.pending) p.reject(new Error(e.message || "Worker 發生錯誤"));
      this.pending.clear();
    };
  }

  private call(msg: DistributiveOmit<WorkerRequest, "reqId">, transfer?: Transferable[]): Promise<WorkerResponse> {
    const reqId = this.nextReqId++;
    const full = { ...msg, reqId } as WorkerRequest;
    return new Promise((resolve, reject) => {
      this.pending.set(reqId, { resolve, reject });
      if (transfer) this.worker.postMessage(full, transfer);
      else this.worker.postMessage(full);
    });
  }

  async loadFile(path: string, fileName: string): Promise<LoadInfo> {
    const raw = await invoke<ArrayBuffer | number[]>("read_file_bytes", { path });
    const buffer = raw instanceof ArrayBuffer ? raw : new Uint8Array(raw).buffer;
    const lower = fileName.toLowerCase();
    const kind = lower.endsWith(".xlsx") || lower.endsWith(".xls") ? "excel" : "csv";
    const res = await this.call({ type: "load", buffer, fileName, kind }, [buffer]);
    return (res as Extract<WorkerResponse, { type: "loaded" }>).info;
  }

  async loadBuffer(buffer: ArrayBuffer, fileName: string, kind: "csv" | "excel"): Promise<LoadInfo> {
    const res = await this.call({ type: "load", buffer, fileName, kind }, [buffer]);
    return (res as Extract<WorkerResponse, { type: "loaded" }>).info;
  }

  async loadText(text: string, fileName: string): Promise<LoadInfo> {
    const res = await this.call({ type: "load-text", text, fileName });
    return (res as Extract<WorkerResponse, { type: "loaded" }>).info;
  }

  async loadDataset(dataset: Dataset): Promise<LoadInfo> {
    const res = await this.call({ type: "load-dataset", dataset });
    return (res as Extract<WorkerResponse, { type: "loaded" }>).info;
  }

  async selectSheet(sheet: string): Promise<LoadInfo> {
    const res = await this.call({ type: "select-sheet", sheet });
    return (res as Extract<WorkerResponse, { type: "loaded" }>).info;
  }

  async redecode(encoding: string): Promise<LoadInfo> {
    const res = await this.call({ type: "redecode", encoding });
    return (res as Extract<WorkerResponse, { type: "loaded" }>).info;
  }

  async analyze(options: import("../core/types").AnalyzeOptions) {
    const res = await this.call({ type: "analyze", options });
    return (res as Extract<WorkerResponse, { type: "result" }>).result;
  }

  async histogram(column: number, bins: number) {
    const res = await this.call({ type: "histogram", column, bins });
    return (res as Extract<WorkerResponse, { type: "histogram-result" }>).histogram;
  }

  async rows(offset: number, limit: number) {
    const res = await this.call({ type: "rows", offset, limit });
    return res as Extract<WorkerResponse, { type: "rows-result" }>;
  }
}
