import type { AnalysisResult } from "../core/types";
import { renderChart } from "./charts";
import { clear, el, fmtInt, fmtPct } from "./dom";

export function renderMissing(container: HTMLElement, result: AnalysisResult): void {
  clear(container);
  const { missingSummary } = result;

  container.append(
    el("div", { class: "cards" }, [
      card("總儲存格數", fmtInt(missingSummary.totalCells)),
      card("缺失儲存格", fmtInt(missingSummary.missingCells), missingSummary.missingCells > 0 ? "warn" : "ok"),
      card("整體缺失率", fmtPct(missingSummary.missingPct), missingSummary.missingPct > 0.2 ? "warn" : undefined),
      card("含缺失的資料列", `${fmtInt(missingSummary.anyMissingRows)} (${fmtPct(result.rowCount ? missingSummary.anyMissingRows / result.rowCount : 0)})`),
    ]),
  );

  container.append(el("h2", {}, ["各欄缺失率"]));
  const colsSorted = [...result.columns].sort((a, b) => b.missingPct - a.missingPct);
  container.append(el("div", { id: "chart-missing-bar", class: "chart chart-tall" }));
  renderMissingBar(colsSorted);

  if (result.heatmap) {
    container.append(el("h2", {}, ["缺失模式熱力圖", el("span", { class: "muted h2-note" }, [result.heatmap.sampled ? `（列數過多，已等距抽樣 ${result.heatmap.rowIndices.length} 列）` : "（每一列）"])]));
    container.append(el("div", { id: "chart-missing-heat", class: "chart chart-tall" }));
    renderHeatmap(result);
  }

  if (result.patterns.length > 0) {
    container.append(el("h2", {}, ["常見缺失組合"]));
    const thead = el("thead", {}, [el("tr", {}, ["#", "缺失的欄位組合", "列數", "佔比"].map((t) => el("th", {}, [t])))]);
    const tbody = el("tbody", {}, result.patterns.map((p, i) =>
      el("tr", {}, [
        el("td", { class: "muted" }, [String(i + 1)]),
        el("td", {}, p.columns.map((c) => el("span", { class: "chip" }, [c]))),
        el("td", {}, [fmtInt(p.count)]),
        el("td", {}, [fmtPct(p.pct)]),
      ]),
    ));
    container.append(el("div", { class: "table-scroll" }, [el("table", { class: "data-table" }, [thead, tbody])]));
  } else {
    container.append(el("p", { class: "ok-text" }, ["沒有缺失值，資料完整。"]));
  }
}

function card(label: string, value: string, tone?: "warn" | "ok"): HTMLElement {
  return el("div", { class: `card${tone ? ` ${tone}` : ""}` }, [
    el("div", { class: "card-label" }, [label]),
    el("div", { class: "card-value" }, [value]),
  ]);
}

function renderMissingBar(colsSorted: AnalysisResult["columns"]): void {
  const names = colsSorted.map((c) => c.name).reverse();
  const values = colsSorted.map((c) => +(c.missingPct * 100).toFixed(2)).reverse();
  renderChart("chart-missing-bar", {
    grid: { left: 160, right: 60, top: 10, bottom: 30 },
    tooltip: { trigger: "axis", valueFormatter: (v) => `${v}%` },
    xAxis: { type: "value", max: 100, axisLabel: { formatter: "{value}%" } },
    yAxis: { type: "category", data: names, axisLabel: { width: 140, overflow: "truncate" } },
    series: [
      {
        type: "bar",
        data: values,
        itemStyle: {
          color: (p) => ((p.value as number) > 50 ? "#c92a2a" : (p.value as number) > 10 ? "#e8590c" : "#4f6df5"),
        },
        label: { show: true, position: "right", formatter: "{c}%", fontSize: 10 },
      },
    ],
  });
}

function renderHeatmap(result: AnalysisResult): void {
  const heat = result.heatmap!;
  const colNames = heat.columnOrder.map((i) => result.columns[i].name);
  const data: [number, number, number][] = [];
  for (let r = 0; r < heat.rowIndices.length; r++) {
    for (let c = 0; c < heat.columnOrder.length; c++) {
      if (heat.cells[r * heat.columnOrder.length + c]) data.push([c, r, 1]);
    }
  }
  const height = Math.min(720, Math.max(240, heat.rowIndices.length * 3 + 90));
  const holder = document.getElementById("chart-missing-heat")!;
  holder.style.height = `${height}px`;
  renderChart("chart-missing-heat", {
    grid: { left: 70, right: 20, top: 60, bottom: 20 },
    tooltip: {
      formatter: (p) => {
        const [c, r] = (p as unknown as { data: [number, number, number] }).data;
        return `第 ${heat.rowIndices[r] + 1} 列<br/>${colNames[c]}：缺失`;
      },
    },
    xAxis: {
      type: "category",
      data: colNames,
      position: "top",
      axisLabel: { rotate: 45, fontSize: 10, interval: 0, overflow: "truncate", width: 80 },
    },
    yAxis: {
      type: "category",
      data: heat.rowIndices.map((r) => String(r + 1)),
      axisLabel: { fontSize: 9, interval: Math.floor(heat.rowIndices.length / 10) },
    },
    visualMap: { show: false, min: 0, max: 1, inRange: { color: ["#e9ecef", "#c92a2a"] } },
    series: [{ type: "heatmap", data, progressive: 2000 }],
  });
}
