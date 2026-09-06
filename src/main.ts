import { open } from "@tauri-apps/plugin-dialog";
import { readText } from "@tauri-apps/plugin-clipboard-manager";
import { AnalyzerClient } from "./io/load";
import { DEFAULT_OPTIONS } from "./core/types";
import type { AnalyzeOptions, AnalysisResult, LoadInfo } from "./core/types";
import { renderOverview } from "./ui/overview";
import { renderMissing } from "./ui/missing";
import { renderDist } from "./ui/dist";
import { renderCorr } from "./ui/corr";
import { exportHtmlReport, exportStatsCsv } from "./ui/report";
import { resizeAllCharts } from "./ui/charts";
import { el, fmtInt, toast } from "./ui/dom";
import sampleUtf8Url from "./assets/samples/sample-utf8.csv?url";
import sampleBig5Url from "./assets/samples/sample-big5.csv?url";

const state = {
  client: new AnalyzerClient(),
  loadInfo: null as LoadInfo | null,
  source: "",
  result: null as AnalysisResult | null,
  options: { ...DEFAULT_OPTIONS, missingTokens: [...DEFAULT_OPTIONS.missingTokens] } as AnalyzeOptions,
  busy: false,
};

type TabId = "overview" | "missing" | "dist" | "corr" | "report";
let activeTab: TabId = "overview";

function $(id: string): HTMLElement {
  return document.getElementById(id)!;
}

async function runAnalysis(): Promise<void> {
  if (!state.loadInfo) return;
  state.result = await state.client.analyze(state.options);
  renderActiveTab();
}

async function withBusy(fn: () => Promise<void>): Promise<void> {
  if (state.busy) return;
  state.busy = true;
  document.body.classList.add("busy");
  try {
    await fn();
  } catch (e) {
    toast(e instanceof Error ? e.message : String(e), true);
  } finally {
    state.busy = false;
    document.body.classList.remove("busy");
  }
}

function updateHeaderInfo(): void {
  const box = $("dataset-info");
  box.replaceChildren();
  if (!state.loadInfo || !state.result) return;
  const info = state.loadInfo;
  box.append(
    el("span", { class: "chip chip-strong" }, [state.result.datasetName]),
    el("span", { class: "chip" }, [`${fmtInt(state.result.rowCount)} 列 × ${fmtInt(state.result.columnCount)} 欄`]),
  );
  if (info.encoding) box.append(el("span", { class: "chip" }, [`編碼：${info.encoding}`]));

  const encodingSelect = $("encoding-select") as HTMLSelectElement;
  if (info.kind === "csv") {
    encodingSelect.hidden = false;
    encodingSelect.value = "";
  } else {
    encodingSelect.hidden = true;
  }

  const sheetSelect = $("sheet-select") as HTMLSelectElement;
  if (info.sheets && info.sheets.length > 1) {
    sheetSelect.replaceChildren(...info.sheets.map((s) => el("option", { value: s }, [s])));
    sheetSelect.value = info.activeSheet ?? info.sheets[0];
    sheetSelect.hidden = false;
  } else {
    sheetSelect.hidden = true;
  }
}

function renderActiveTab(): void {
  if (!state.result) return;
  $("welcome").hidden = true;
  for (const t of ["overview", "missing", "dist", "corr", "report"] as TabId[]) {
    $(`tab-${t}`).hidden = t !== activeTab;
  }
  const container = $(`tab-${activeTab}`);
  switch (activeTab) {
    case "overview":
      renderOverview(container, state.result, state.client, state.options);
      break;
    case "missing":
      renderMissing(container, state.result);
      break;
    case "dist":
      renderDist(container, state.result, state.client);
      break;
    case "corr":
      renderCorr(container, state.result);
      break;
    case "report":
      renderReportTab(container);
      break;
  }
  requestAnimationFrame(() => resizeAllCharts());
}

function renderReportTab(container: HTMLElement): void {
  container.replaceChildren();
  container.append(
    el("h2", {}, ["匯出分析結果"]),
    el("div", { class: "report-actions" }, [
      el("div", { class: "card action-card" }, [
        el("div", { class: "card-label" }, ["HTML 視覺化報告"]),
        el("p", { class: "muted" }, ["包含缺失值總覽、熱力圖、各欄分布圖與相關性矩陣的自含式網頁報告，可用瀏覽器開啟或轉寄。"]),
        el("button", { class: "btn primary", id: "btn-export-html" }, ["產生 HTML 報告"]),
      ]),
      el("div", { class: "card action-card" }, [
        el("div", { class: "card-label" }, ["欄位統計 CSV"]),
        el("p", { class: "muted" }, ["每個欄位的型別、缺失統計與描述統計摘要，方便導入 Excel 或其他工具繼續處理。"]),
        el("button", { class: "btn", id: "btn-export-csv" }, ["匯出統計 CSV"]),
      ]),
    ]),
  );
  $("btn-export-html").addEventListener("click", () =>
    withBusy(async () => {
      if (!state.result) return;
      await exportHtmlReport(state.result, { source: state.source, encoding: state.loadInfo?.encoding ?? null });
    }),
  );
  $("btn-export-csv").addEventListener("click", () =>
    withBusy(async () => {
      if (!state.result) return;
      await exportStatsCsv(state.result);
    }),
  );
}

async function openFile(): Promise<void> {
  const selected = await open({
    multiple: false,
    filters: [
      { name: "資料檔", extensions: ["csv", "tsv", "txt", "xlsx", "xls"] },
      { name: "所有檔案", extensions: ["*"] },
    ],
  });
  if (!selected) return;
  const path = String(selected);
  const fileName = path.split(/[\\/]/).pop() ?? path;
  await withBusy(async () => {
    toast(`正在載入 ${fileName}…`);
    state.loadInfo = await state.client.loadFile(path, fileName);
    state.source = path;
    await runAnalysis();
    updateHeaderInfo();
    activeTab = "overview";
    syncTabButtons();
    toast(`已載入 ${fileName}（${fmtInt(state.result!.rowCount)} 列）`);
  });
}

async function pasteFromClipboard(): Promise<void> {
  await withBusy(async () => {
    const text = await readText();
    if (!text || text.trim() === "") {
      toast("剪貼簿沒有內容", true);
      return;
    }
    toast("正在解析剪貼簿內容…");
    state.loadInfo = await state.client.loadText(text, "剪貼簿資料");
    state.source = "剪貼簿";
    await runAnalysis();
    updateHeaderInfo();
    activeTab = "overview";
    syncTabButtons();
    toast(`已載入剪貼簿資料（${fmtInt(state.result!.rowCount)} 列）`);
  });
}

async function loadSample(url: string, name: string, kind: "csv" | "excel"): Promise<void> {
  await withBusy(async () => {
    toast(`正在載入範例 ${name}…`);
    const resp = await fetch(url);
    const buffer = await resp.arrayBuffer();
    state.loadInfo = await state.client.loadBuffer(buffer, name, kind);
    state.source = `內建範例：${name}`;
    await runAnalysis();
    updateHeaderInfo();
    activeTab = "overview";
    syncTabButtons();
    toast(`已載入範例（${fmtInt(state.result!.rowCount)} 列）`);
  });
}

function syncTabButtons(): void {
  document.querySelectorAll<HTMLButtonElement>(".tabs button").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === activeTab);
  });
}

function openSettings(): void {
  const modal = $("modal");
  const textarea = $("tokens-input") as HTMLTextAreaElement;
  textarea.value = state.options.missingTokens.filter((t) => t !== "").join("\n");
  modal.hidden = false;
}

function wireEvents(): void {
  $("btn-open").addEventListener("click", () => void openFile());
  $("btn-open-2").addEventListener("click", () => void openFile());
  $("btn-paste").addEventListener("click", () => void pasteFromClipboard());
  $("btn-paste-2").addEventListener("click", () => void pasteFromClipboard());
  $("btn-sample-utf8").addEventListener("click", () => void loadSample(sampleUtf8Url, "sample-utf8.csv", "csv"));
  $("btn-sample-big5").addEventListener("click", () => void loadSample(sampleBig5Url, "sample-big5.csv", "csv"));
  $("btn-settings").addEventListener("click", openSettings);

  $("modal-cancel").addEventListener("click", () => {
    $("modal").hidden = true;
  });
  $("modal-save").addEventListener("click", () =>
    withBusy(async () => {
      const textarea = $("tokens-input") as HTMLTextAreaElement;
      const tokens = textarea.value
        .split(/\n|,|，/)
        .map((t) => t.trim())
        .filter((t) => t !== "");
      state.options.missingTokens = ["", ...tokens];
      $("modal").hidden = true;
      if (state.loadInfo) {
        toast("正在重新分析…");
        await runAnalysis();
        toast("已更新缺失值判定");
      }
    }),
  );

  document.querySelectorAll<HTMLButtonElement>(".tabs button").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeTab = btn.dataset.tab as TabId;
      syncTabButtons();
      renderActiveTab();
    });
  });

  ($("sheet-select") as HTMLSelectElement).addEventListener("change", (e) =>
    withBusy(async () => {
      const sheet = (e.target as HTMLSelectElement).value;
      toast(`正在切換工作表「${sheet}」…`);
      state.loadInfo = await state.client.selectSheet(sheet);
      await runAnalysis();
      updateHeaderInfo();
      toast("已切換工作表");
    }),
  );

  ($("encoding-select") as HTMLSelectElement).addEventListener("change", (e) =>
    withBusy(async () => {
      const enc = (e.target as HTMLSelectElement).value;
      if (!enc) return;
      toast(`正在以 ${enc.toUpperCase()} 重新解碼…`);
      state.loadInfo = await state.client.redecode(enc);
      await runAnalysis();
      updateHeaderInfo();
      toast(`已改用 ${enc.toUpperCase()} 解碼`);
    }),
  );

  window.addEventListener("resize", () => resizeAllCharts());
}

wireEvents();
