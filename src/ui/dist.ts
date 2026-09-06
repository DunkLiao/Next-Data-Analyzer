import type { AnalysisResult, ColumnResult, Histogram } from "../core/types";
import { PALETTE, renderChart } from "./charts";
import { clear, el, fmtDateTime, fmtInt, fmtNum, fmtPct, toast, TYPE_LABELS } from "./dom";
import type { AnalyzerClient } from "../io/load";

export function renderDist(container: HTMLElement, result: AnalysisResult, client: AnalyzerClient): void {
  clear(container);
  const columns = result.columns;
  const selectable = columns
    .map((c, i) => ({ col: c, index: i }))
    .filter(({ col }) => col.numeric || col.categorical || col.date);

  if (selectable.length === 0) {
    container.append(el("p", { class: "muted" }, ["沒有可分析分布的欄位。"]));
    return;
  }

  const select = el("select", { id: "dist-col-select", class: "select" });
  const groups: Record<string, typeof selectable> = {};
  for (const item of selectable) {
    (groups[item.col.type] ??= []).push(item);
  }
  for (const [type, items] of Object.entries(groups)) {
    const og = el("optgroup", { label: `${TYPE_LABELS[type]}欄` });
    for (const { col, index } of items) og.append(el("option", { value: String(index) }, [col.name]));
    select.append(og);
  }

  const toolbar = el("div", { class: "toolbar" }, [el("label", { class: "toolbar-label" }, ["選擇欄位："]), select]);
  const panel = el("div", { id: "dist-panel" });
  container.append(toolbar, panel);

  const renderColumn = (index: number) => {
    const col = columns[index];
    if (!col) return;
    if (col.numeric) renderNumeric(panel, col, index, client);
    else if (col.date) renderDate(panel, col);
    else renderCategorical(panel, col, result.rowCount - col.missing);
  };

  select.addEventListener("change", () => renderColumn(Number(select.value)));
  renderColumn(Number(select.value));
}

function statRows(pairs: [string, string][]): HTMLElement {
  return el("table", { class: "data-table stat-table" }, [
    el("tbody", {}, pairs.map(([k, v]) => el("tr", {}, [el("th", {}, [k]), el("td", {}, [v])]))),
  ]);
}

function renderNumeric(panel: HTMLElement, col: ColumnResult, index: number, client: AnalyzerClient): void {
  clear(panel);
  const n = col.numeric!;

  const grid = el("div", { class: "dist-grid" });
  const chartBox = el("div", {}, [
    el("h3", {}, [`直方圖：${col.name}`]),
    el("div", { id: "chart-hist", class: "chart" }),
    el("div", { class: "toolbar" }, [
      el("label", { class: "toolbar-label" }, ["分組數："]),
      el("input", { type: "range", id: "bin-slider", min: "1", max: "100", value: String(n.histogram.counts.length) }),
      el("span", { id: "bin-value", class: "muted" }, [String(n.histogram.counts.length)]),
    ]),
  ]);
  const statsBox = el("div", {}, [
    el("h3", {}, ["描述統計"]),
    statRows([
      ["有效筆數", fmtInt(n.count)],
      ["平均數", fmtNum(n.mean)],
      ["標準差", fmtNum(n.std)],
      ["最小值", fmtNum(n.min)],
      ["Q1（25%）", fmtNum(n.q1)],
      ["中位數", fmtNum(n.median)],
      ["Q3（75%）", fmtNum(n.q3)],
      ["最大值", fmtNum(n.max)],
      ["偏度", fmtNum(n.skew)],
      ["峰度（超額）", fmtNum(n.kurt)],
    ]),
    el("h3", {}, ["離群值"]),
    statRows([
      ["IQR 規則（1.5×IQR）", fmtInt(n.iqrOutliers)],
      ["Z 分數（|z| > 3）", fmtInt(n.zOutliers)],
    ]),
  ]);
  grid.append(chartBox, statsBox);
  panel.append(grid);

  const drawHist = (h: Histogram) => {
    const labels = h.counts.map((_, i) => `${fmtNum(h.edges[i])} ~ ${fmtNum(h.edges[i + 1])}`);
    renderChart("chart-hist", {
      grid: { left: 60, right: 20, top: 20, bottom: 70 },
      tooltip: { trigger: "axis" },
      xAxis: { type: "category", data: labels, axisLabel: { rotate: 45, fontSize: 9, interval: 0 } },
      yAxis: { type: "value", name: "筆數" },
      series: [{ type: "bar", data: h.counts, itemStyle: { color: PALETTE[0] }, barCategoryGap: "5%" }],
    });
  };
  drawHist(n.histogram);

  const slider = panel.querySelector("#bin-slider") as HTMLInputElement;
  const binValue = panel.querySelector("#bin-value")!;
  let timer: number | undefined;
  slider.addEventListener("input", () => {
    binValue.textContent = slider.value;
    window.clearTimeout(timer);
    timer = window.setTimeout(async () => {
      try {
        const h = await client.histogram(index, Number(slider.value));
        drawHist(h);
      } catch (e) {
        toast(e instanceof Error ? e.message : String(e), true);
      }
    }, 250);
  });
}

function renderCategorical(panel: HTMLElement, col: ColumnResult, validCount: number): void {
  clear(panel);
  const cat = col.categorical;
  if (!cat || cat.top.length === 0) {
    panel.append(el("p", { class: "muted" }, ["此欄沒有可統計的類別值。"]));
    return;
  }
  const total = Math.max(validCount, cat.top.reduce((acc, t) => acc + t.count, 0));
  const shown = cat.top.slice(0, 30);

  const grid = el("div", { class: "dist-grid" });
  grid.append(
    el("div", {}, [
      el("h3", {}, [`次數分布：${col.name}`]),
      el("div", { id: "chart-cat", class: "chart chart-tall" }),
    ]),
    el("div", {}, [
      el("h3", {}, ["摘要"]),
      statRows([
        ["有效筆數", fmtInt(validCount)],
        ["不重複類別數", fmtInt(cat.cardinality)],
        ["缺失筆數", fmtInt(col.missing)],
        ["最高類別佔比", fmtPct(cat.top[0].count / Math.max(1, total))],
      ]),
      el("h3", {}, ["次數表（前 30）"]),
      el("div", { class: "scroll-y" }, [
        el("table", { class: "data-table" }, [
          el("thead", {}, [el("tr", {}, ["值", "筆數", "佔比"].map((t) => el("th", {}, [t])))]),
          el("tbody", {}, shown.map((t) =>
            el("tr", {}, [
              el("td", {}, [t.value === "" ? "(空白)" : t.value]),
              el("td", {}, [fmtInt(t.count)]),
              el("td", {}, [fmtPct(t.count / Math.max(1, total))]),
            ]),
          )),
        ]),
      ]),
    ]),
  );
  panel.append(grid);

  const names = shown.map((t) => (t.value.length > 18 ? `${t.value.slice(0, 18)}…` : t.value)).reverse();
  const values = shown.map((t) => t.count).reverse();
  renderChart("chart-cat", {
    grid: { left: 150, right: 40, top: 10, bottom: 30 },
    tooltip: { trigger: "axis" },
    xAxis: { type: "value" },
    yAxis: { type: "category", data: names, axisLabel: { width: 140, overflow: "truncate" } },
    series: [{ type: "bar", data: values, itemStyle: { color: PALETTE[1] }, label: { show: true, position: "right", fontSize: 10 } }],
  });
}

function renderDate(panel: HTMLElement, col: ColumnResult): void {
  clear(panel);
  const d = col.date;
  if (!d) {
    panel.append(el("p", { class: "muted" }, ["此欄沒有可解析的日期。"]));
    return;
  }
  const grid = el("div", { class: "dist-grid" });
  grid.append(
    el("div", {}, [
      el("h3", {}, [`時間分布：${col.name}（以${d.unit === "day" ? "日" : "月"}計）`]),
      el("div", { id: "chart-date", class: "chart" }),
    ]),
    el("div", {}, [
      el("h3", {}, ["摘要"]),
      statRows([
        ["有效筆數", fmtInt(d.count)],
        ["最早", fmtDateTime(d.min)],
        ["最晚", fmtDateTime(d.max)],
        ["區間數", fmtInt(d.points.length)],
        ["無法解析", fmtInt(d.unparseable)],
      ]),
    ]),
  );
  panel.append(grid);

  renderChart("chart-date", {
    grid: { left: 60, right: 20, top: 30, bottom: 60 },
    tooltip: { trigger: "axis" },
    xAxis: { type: "category", data: d.points.map((p) => p.label), axisLabel: { rotate: 45, fontSize: 9 } },
    yAxis: { type: "value", name: "筆數" },
    series: [{ type: "line", data: d.points.map((p) => p.count), areaStyle: { opacity: 0.15 }, itemStyle: { color: PALETTE[5] }, showSymbol: d.points.length <= 60 }],
  });
}
