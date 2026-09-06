import { buildTokenSet, isMissingValue } from "../core/missing";
import type { AnalyzeOptions, AnalysisResult } from "../core/types";
import { clear, el, fmtInt, fmtNum, fmtPct, toast, TYPE_LABELS } from "./dom";
import type { AnalyzerClient } from "../io/load";

const PAGE_SIZE = 50;

export function renderOverview(container: HTMLElement, result: AnalysisResult, client: AnalyzerClient, options: AnalyzeOptions): void {
  clear(container);
  const { missingSummary } = result;

  const cards = el("div", { class: "cards" }, [
    card("資料列數", fmtInt(result.rowCount)),
    card("欄位數", fmtInt(result.columnCount)),
    card("缺失儲存格", `${fmtInt(missingSummary.missingCells)} (${fmtPct(missingSummary.missingPct)})`, missingSummary.missingPct > 0 ? "warn" : "ok"),
    card("完整資料列", `${fmtInt(missingSummary.completeRows)} (${fmtPct(result.rowCount ? missingSummary.completeRows / result.rowCount : 0)})`),
  ]);
  container.append(cards);

  container.append(el("h2", {}, ["欄位概況"]));
  container.append(el("div", { class: "table-scroll" }, [buildColumnTable(result)]));

  container.append(el("h2", {}, ["資料預覽"]));
  const previewBox = el("div", { class: "preview-box" });
  container.append(previewBox);
  let page = 0;

  const tokens = buildTokenSet(options.missingTokens);
  const loadPage = async () => {
    try {
      const res = await client.rows(page * PAGE_SIZE, PAGE_SIZE);
      renderPreview(previewBox, result, tokens, res.rows, res.offset, res.totalRows, () => {
        const maxPage = Math.max(0, Math.ceil(res.totalRows / PAGE_SIZE) - 1);
        if (page < maxPage) {
          page++;
          void loadPage();
        }
      }, () => {
        if (page > 0) {
          page--;
          void loadPage();
        }
      }, page);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), true);
    }
  };
  void loadPage();
}

function card(label: string, value: string, tone?: "warn" | "ok"): HTMLElement {
  return el("div", { class: `card${tone ? ` ${tone}` : ""}` }, [
    el("div", { class: "card-label" }, [label]),
    el("div", { class: "card-value" }, [value]),
  ]);
}

function buildColumnTable(result: AnalysisResult): HTMLElement {
  const thead = el("thead", {}, [
    el("tr", {}, ["#", "欄位名稱", "型別", "缺失數", "缺失率", "不重複值", "摘要"].map((t) => el("th", {}, [t]))),
  ]);
  const rows = result.columns.map((col, i) => {
    const bar = el("div", { class: "mini-bar" }, [
      el("div", {
        class: "mini-bar-fill",
        style: `width:${Math.min(100, col.missingPct * 100).toFixed(1)}%`,
      }),
    ]);
    const missCell = el("td", { class: col.missingPct > 0.5 ? "danger-text" : "" }, [fmtInt(col.missing)]);
    return el("tr", {}, [
      el("td", { class: "muted" }, [String(i + 1)]),
      el("td", { class: "strong" }, [col.name]),
      el("td", {}, [el("span", { class: `type-badge t-${col.type}` }, [TYPE_LABELS[col.type]])]),
      missCell,
      el("td", {}, [el("div", { class: "mini-bar-wrap" }, [bar, el("span", { class: "mini-bar-label" }, [fmtPct(col.missingPct)])])]),
      el("td", {}, [col.uniqueTruncated ? `≥${fmtInt(col.unique)}` : fmtInt(col.unique)]),
      el("td", { class: "muted" }, [columnSummary(col)]),
    ]);
  });
  return el("table", { class: "data-table" }, [thead, el("tbody", {}, rows)]);
}

function columnSummary(col: AnalysisResult["columns"][number]): string {
  if (col.numeric) return `平均 ${fmtNum(col.numeric.mean)}、中位數 ${fmtNum(col.numeric.median)}`;
  if (col.date) return `${col.date.points.length} 個${col.date.unit === "day" ? "日" : "月"}區間`;
  if (col.categorical && col.categorical.top.length > 0) {
    const top = col.categorical.top[0];
    return `最多：「${truncate(top.value, 16)}」(${fmtInt(top.count)})`;
  }
  return "—";
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

function renderPreview(
  box: HTMLElement,
  result: AnalysisResult,
  tokens: Set<string>,
  rows: string[][],
  offset: number,
  totalRows: number,
  onNext: () => void,
  onPrev: () => void,
  page: number,
): void {
  clear(box);
  const thead = el("thead", {}, [
    el("tr", {}, [el("th", {}, ["#"]), ...result.columns.map((c) => el("th", {}, [c.name]))]),
  ]);
  const tbody = el("tbody", {}, rows.map((row, r) =>
    el("tr", {}, [
      el("td", { class: "muted" }, [fmtInt(offset + r + 1)]),
      ...row.map((v) => {
        const isMiss = isMissingValue(v, tokens);
        return el("td", { class: isMiss ? "cell-missing" : "" }, [isMiss ? "∅" : v]);
      }),
    ]),
  ));
  box.append(el("table", { class: "data-table scroll" }, [thead, tbody]));

  const maxPage = Math.max(0, Math.ceil(totalRows / PAGE_SIZE) - 1);
  box.append(
    el("div", { class: "pager" }, [
      el("button", { class: "btn small", id: "prev-page" }, ["← 上一頁"]),
      el("span", { class: "muted" }, [`第 ${fmtInt(page + 1)} / ${fmtInt(maxPage + 1)} 頁（共 ${fmtInt(totalRows)} 列）`]),
      el("button", { class: "btn small", id: "next-page" }, ["下一頁 →"]),
    ]),
  );
  box.querySelector("#prev-page")!.addEventListener("click", onPrev);
  box.querySelector("#next-page")!.addEventListener("click", onNext);
}
