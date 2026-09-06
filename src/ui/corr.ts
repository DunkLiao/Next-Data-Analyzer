import type { AnalysisResult, CorrelationResult } from "../core/types";
import { renderChart } from "./charts";
import { clear, el, fmtNum } from "./dom";

export function renderCorr(container: HTMLElement, result: AnalysisResult): void {
  clear(container);
  const corr = result.correlation;
  if (!corr) {
    container.append(el("p", { class: "muted" }, ["數值欄少於 2 個，無法計算相關性。"]));
    return;
  }
  if (corr.truncated) {
    container.append(el("p", { class: "warn-text" }, ["數值欄超過 15 個，僅分析前 15 個欄位。"]));
  }

  let method: "pearson" | "spearman" = "pearson";

  const toggle = el("div", { class: "toolbar" }, [
    el("span", { class: "toolbar-label" }, ["方法："]),
    el("button", { class: "btn small active", id: "btn-pearson" }, ["Pearson（線性）"]),
    el("button", { class: "btn small", id: "btn-spearman" }, ["Spearman（單調/等級）"]),
  ]);
  const chartBox = el("div", { id: "chart-corr", class: "chart chart-wide" });
  const pairsBox = el("div", {});
  container.append(toggle, chartBox, el("h2", {}, ["最強的相關組合（|r| 排序）"]), pairsBox);

  const draw = () => {
    const matrix = method === "pearson" ? corr.pearson : corr.spearman;
    drawHeatmap(corr, matrix);
    renderPairs(pairsBox, corr, matrix);
  };

  container.querySelector("#btn-pearson")!.addEventListener("click", () => {
    method = "pearson";
    container.querySelector("#btn-pearson")!.classList.add("active");
    container.querySelector("#btn-spearman")!.classList.remove("active");
    draw();
  });
  container.querySelector("#btn-spearman")!.addEventListener("click", () => {
    method = "spearman";
    container.querySelector("#btn-spearman")!.classList.add("active");
    container.querySelector("#btn-pearson")!.classList.remove("active");
    draw();
  });

  draw();
}

function drawHeatmap(corr: CorrelationResult, matrix: (number | null)[][]): void {
  const k = corr.columns.length;
  const data: [number, number, number][] = [];
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) {
      const v = matrix[i][j];
      if (v !== null) data.push([j, i, +v.toFixed(3)]);
    }
  }
  const size = Math.min(720, Math.max(320, k * 44 + 120));
  const holder = document.getElementById("chart-corr")!;
  holder.style.height = `${size}px`;
  renderChart("chart-corr", {
    grid: { left: 140, right: 80, top: 90, bottom: 20 },
    tooltip: {
      formatter: (p) => {
        const [x, y, v] = (p as unknown as { data: [number, number, number] }).data;
        return `${corr.columns[y]} × ${corr.columns[x]}<br/>r = ${v}`;
      },
    },
    xAxis: {
      type: "category",
      data: corr.columns,
      position: "top",
      axisLabel: { rotate: 40, fontSize: 10, interval: 0, overflow: "truncate", width: 80 },
    },
    yAxis: {
      type: "category",
      data: corr.columns,
      inverse: false,
      axisLabel: { fontSize: 10, overflow: "truncate", width: 120 },
    },
    visualMap: {
      min: -1,
      max: 1,
      calculable: true,
      orient: "vertical",
      right: 0,
      top: "center",
      inRange: { color: ["#1971c2", "#f8f9fa", "#c92a2a"] },
    },
    series: [{ type: "heatmap", data, label: { show: k <= 10, fontSize: 9, formatter: (p) => (p.data as number[])[2].toFixed(2) } }],
  });
}

function renderPairs(box: HTMLElement, corr: CorrelationResult, matrix: (number | null)[][]): void {
  clear(box);
  const k = corr.columns.length;
  const pairs: { a: string; b: string; r: number }[] = [];
  for (let i = 0; i < k; i++) {
    for (let j = i + 1; j < k; j++) {
      const r = matrix[i][j];
      if (r !== null) pairs.push({ a: corr.columns[i], b: corr.columns[j], r });
    }
  }
  pairs.sort((x, y) => Math.abs(y.r) - Math.abs(x.r));
  const top = pairs.slice(0, 15);
  if (top.length === 0) {
    box.append(el("p", { class: "muted" }, ["沒有足夠的配對資料。"]));
    return;
  }
  box.append(el("div", { class: "table-scroll" }, [
    el("table", { class: "data-table" }, [
      el("thead", {}, [el("tr", {}, ["欄位 A", "欄位 B", "相關係數", "強度"].map((t) => el("th", {}, [t])))]),
      el("tbody", {}, top.map((p) =>
        el("tr", {}, [
          el("td", {}, [p.a]),
          el("td", {}, [p.b]),
          el("td", { class: "strong" }, [fmtNum(p.r)]),
          el("td", {}, [strength(p.r)]),
        ]),
      )),
    ]),
  ]));
}

function strength(r: number): string {
  const a = Math.abs(r);
  if (a >= 0.8) return "極強";
  if (a >= 0.6) return "強";
  if (a >= 0.4) return "中等";
  if (a >= 0.2) return "弱";
  return "極弱";
}
