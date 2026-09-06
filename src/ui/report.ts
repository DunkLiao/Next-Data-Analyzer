import { save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import type { AnalysisResult, ColumnResult } from "../core/types";
import { chartDataUrl, PALETTE } from "./charts";
import { fmtDateTime, fmtInt, fmtNum, fmtPct, toast, TYPE_LABELS } from "./dom";

const MAX_DIST_CHARTS = 24;

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function missingBarImage(result: AnalysisResult): string | null {
  const sorted = [...result.columns].sort((a, b) => b.missingPct - a.missingPct).slice(0, 40);
  if (sorted.length === 0) return null;
  const height = Math.max(220, sorted.length * 22 + 60);
  return chartDataUrl("rep-missing-bar", 900, height, {
    grid: { left: 160, right: 60, top: 10, bottom: 30 },
    xAxis: { type: "value", max: 100, axisLabel: { formatter: "{value}%" } },
    yAxis: { type: "category", data: sorted.map((c) => c.name).reverse(), axisLabel: { width: 140, overflow: "truncate" } },
    series: [{ type: "bar", data: sorted.map((c) => +(c.missingPct * 100).toFixed(2)).reverse(), itemStyle: { color: "#4f6df5" } }],
  });
}

function heatmapImage(result: AnalysisResult): string | null {
  const heat = result.heatmap;
  if (!heat) return null;
  const colNames = heat.columnOrder.map((i) => result.columns[i].name);
  const data: [number, number, number][] = [];
  for (let r = 0; r < heat.rowIndices.length; r++) {
    for (let c = 0; c < heat.columnOrder.length; c++) {
      if (heat.cells[r * heat.columnOrder.length + c]) data.push([c, r, 1]);
    }
  }
  const height = Math.min(600, Math.max(200, heat.rowIndices.length * 2 + 90));
  return chartDataUrl("rep-heat", 900, height, {
    grid: { left: 60, right: 20, top: 60, bottom: 10 },
    xAxis: { type: "category", data: colNames, position: "top", axisLabel: { rotate: 45, fontSize: 8, interval: 0 } },
    yAxis: { type: "category", data: heat.rowIndices.map((r) => String(r + 1)), axisLabel: { fontSize: 7 } },
    visualMap: { show: false, min: 0, max: 1, inRange: { color: ["#e9ecef", "#c92a2a"] } },
    series: [{ type: "heatmap", data, silent: true }],
  });
}

function histImage(col: ColumnResult): string | null {
  const n = col.numeric;
  if (!n) return null;
  const h = n.histogram;
  return chartDataUrl(`rep-hist-${col.name}`, 560, 300, {
    grid: { left: 50, right: 15, top: 20, bottom: 60 },
    xAxis: {
      type: "category",
      data: h.counts.map((_, i) => `${fmtNum(h.edges[i])}~${fmtNum(h.edges[i + 1])}`),
      axisLabel: { rotate: 45, fontSize: 8, interval: Math.floor(h.counts.length / 10) },
    },
    yAxis: { type: "value" },
    series: [{ type: "bar", data: h.counts, itemStyle: { color: PALETTE[0] }, barCategoryGap: "5%" }],
  });
}

function catImage(col: ColumnResult): string | null {
  const cat = col.categorical;
  if (!cat || cat.top.length === 0) return null;
  const shown = cat.top.slice(0, 15);
  const height = Math.max(200, shown.length * 24 + 60);
  return chartDataUrl(`rep-cat-${col.name}`, 560, height, {
    grid: { left: 140, right: 40, top: 10, bottom: 25 },
    xAxis: { type: "value" },
    yAxis: { type: "category", data: shown.map((t) => (t.value.length > 14 ? `${t.value.slice(0, 14)}…` : t.value)).reverse(), axisLabel: { width: 130, overflow: "truncate" } },
    series: [{ type: "bar", data: shown.map((t) => t.count).reverse(), itemStyle: { color: PALETTE[1] } }],
  });
}

function dateImage(col: ColumnResult): string | null {
  const d = col.date;
  if (!d) return null;
  return chartDataUrl(`rep-date-${col.name}`, 560, 300, {
    grid: { left: 50, right: 15, top: 20, bottom: 60 },
    xAxis: { type: "category", data: d.points.map((p) => p.label), axisLabel: { rotate: 45, fontSize: 8 } },
    yAxis: { type: "value" },
    series: [{ type: "line", data: d.points.map((p) => p.count), areaStyle: { opacity: 0.15 }, itemStyle: { color: PALETTE[5] }, showSymbol: false }],
  });
}

function corrImage(result: AnalysisResult): string | null {
  const corr = result.correlation;
  if (!corr) return null;
  const k = corr.columns.length;
  const data: [number, number, number][] = [];
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) {
      const v = corr.pearson[i][j];
      if (v !== null) data.push([j, i, +v.toFixed(3)]);
    }
  }
  const size = Math.max(320, k * 40 + 120);
  return chartDataUrl("rep-corr", size + 160, size, {
    grid: { left: 130, right: 30, top: 90, bottom: 10 },
    xAxis: { type: "category", data: corr.columns, position: "top", axisLabel: { rotate: 40, fontSize: 8, interval: 0 } },
    yAxis: { type: "category", data: corr.columns, axisLabel: { fontSize: 8, width: 110, overflow: "truncate" } },
    visualMap: { show: false, min: -1, max: 1, inRange: { color: ["#1971c2", "#f8f9fa", "#c92a2a"] } },
    series: [{ type: "heatmap", data, silent: true }],
  });
}

function columnSection(col: ColumnResult): string {
  const parts: string[] = [];
  parts.push(`<h3>${esc(col.name)} <span class="badge">${TYPE_LABELS[col.type]}</span> <span class="muted">缺失 ${fmtInt(col.missing)}（${fmtPct(col.missingPct)}）</span></h3>`);
  if (col.numeric) {
    const n = col.numeric;
    const img = histImage(col);
    parts.push(`<div class="row"><div class="col">${img ? `<img src="${img}"/>` : ""}</div><div class="col">
      <table><tr><th>筆數</th><td>${fmtInt(n.count)}</td><th>平均</th><td>${fmtNum(n.mean)}</td></tr>
      <tr><th>標準差</th><td>${fmtNum(n.std)}</td><th>中位數</th><td>${fmtNum(n.median)}</td></tr>
      <tr><th>最小</th><td>${fmtNum(n.min)}</td><th>Q1</th><td>${fmtNum(n.q1)}</td></tr>
      <tr><th>Q3</th><td>${fmtNum(n.q3)}</td><th>最大</th><td>${fmtNum(n.max)}</td></tr>
      <tr><th>偏度</th><td>${fmtNum(n.skew)}</td><th>峰度</th><td>${fmtNum(n.kurt)}</td></tr>
      <tr><th>離群(IQR)</th><td>${fmtInt(n.iqrOutliers)}</td><th>離群(|z|&gt;3)</th><td>${fmtInt(n.zOutliers)}</td></tr></table></div></div>`);
  } else if (col.date) {
    const img = dateImage(col);
    if (img) parts.push(`<img src="${img}"/>`);
  } else if (col.categorical) {
    const img = catImage(col);
    parts.push(`<div class="row"><div class="col">${img ? `<img src="${img}"/>` : ""}</div><div class="col"><table>
      <tr><th>類別數</th><td>${fmtInt(col.categorical.cardinality)}</td></tr>
      ${col.categorical.top.slice(0, 5).map((t) => `<tr><td>${esc(t.value === "" ? "(空白)" : t.value)}</td><td>${fmtInt(t.count)}</td></tr>`).join("")}
      </table></div></div>`);
  }
  return `<section>${parts.join("")}</section>`;
}

export function buildReportHtml(result: AnalysisResult, meta: { source: string; encoding: string | null }): string {
  const ms = result.missingSummary;
  const missingBar = missingBarImage(result);
  const heat = heatmapImage(result);
  const corrImg = corrImage(result);
  const distCols = result.columns.filter((c) => c.numeric || c.categorical || c.date).slice(0, MAX_DIST_CHARTS);

  const colTableRows = result.columns
    .map((c, i) => `<tr><td>${i + 1}</td><td>${esc(c.name)}</td><td>${TYPE_LABELS[c.type]}</td><td>${fmtInt(c.missing)}</td><td>${fmtPct(c.missingPct)}</td><td>${fmtInt(c.unique)}</td></tr>`)
    .join("");

  const patternRows = result.patterns
    .map((p) => `<tr><td>${esc(p.columns.join("、"))}</td><td>${fmtInt(p.count)}</td><td>${fmtPct(p.pct)}</td></tr>`)
    .join("");

  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8"/>
<title>資料分析報告 - ${esc(result.datasetName)}</title>
<style>
  body{font-family:"Microsoft JhengHei","PingFang TC",sans-serif;margin:0;background:#f5f6f8;color:#1f2430;}
  .wrap{max-width:1000px;margin:0 auto;padding:32px 24px;}
  header{background:#1e2a52;color:#fff;padding:28px 24px;border-radius:8px;}
  header h1{margin:0 0 6px;font-size:22px;}
  header .meta{opacity:.85;font-size:13px;}
  h2{margin:36px 0 12px;font-size:18px;border-left:4px solid #4f6df5;padding-left:10px;}
  h3{margin:20px 0 8px;font-size:15px;}
  .cards{display:flex;gap:12px;flex-wrap:wrap;margin:16px 0;}
  .card{background:#fff;border-radius:8px;padding:14px 18px;flex:1;min-width:160px;box-shadow:0 1px 3px rgba(0,0,0,.08);}
  .card .l{font-size:12px;color:#6b7280;}
  .card .v{font-size:20px;font-weight:700;margin-top:4px;}
  table{border-collapse:collapse;background:#fff;font-size:13px;width:100%;}
  th,td{border:1px solid #e5e7eb;padding:6px 10px;text-align:left;}
  th{background:#f0f2f8;}
  img{max-width:100%;background:#fff;border-radius:8px;}
  .row{display:flex;gap:16px;flex-wrap:wrap;}
  .col{flex:1;min-width:280px;}
  section{background:#fff;border-radius:8px;padding:14px 18px;margin-bottom:14px;box-shadow:0 1px 3px rgba(0,0,0,.06);}
  .badge{background:#e7ebff;color:#3b5bdb;border-radius:6px;padding:2px 8px;font-size:12px;}
  .muted{color:#6b7280;font-size:12px;font-weight:400;}
  footer{margin-top:32px;color:#9ca3af;font-size:12px;text-align:center;}
</style>
</head>
<body>
<div class="wrap">
<header>
  <h1>資料分析報告：${esc(result.datasetName)}</h1>
  <div class="meta">來源：${esc(meta.source)}${meta.encoding ? `｜編碼：${esc(meta.encoding)}` : ""}｜產生時間：${fmtDateTime(Date.now())}｜${fmtInt(result.rowCount)} 列 × ${fmtInt(result.columnCount)} 欄</div>
</header>

<h2>缺失值總覽</h2>
<div class="cards">
  <div class="card"><div class="l">總儲存格數</div><div class="v">${fmtInt(ms.totalCells)}</div></div>
  <div class="card"><div class="l">缺失儲存格</div><div class="v">${fmtInt(ms.missingCells)}</div></div>
  <div class="card"><div class="l">整體缺失率</div><div class="v">${fmtPct(ms.missingPct)}</div></div>
  <div class="card"><div class="l">完整資料列</div><div class="v">${fmtInt(ms.completeRows)}</div></div>
  <div class="card"><div class="l">含缺失資料列</div><div class="v">${fmtInt(ms.anyMissingRows)}</div></div>
</div>
<section>
<table>
  <tr><th>#</th><th>欄位</th><th>型別</th><th>缺失數</th><th>缺失率</th><th>不重複值</th></tr>
  ${colTableRows}
</table>
</section>
${missingBar ? `<section><h3>各欄缺失率</h3><img src="${missingBar}"/></section>` : ""}
${heat ? `<section><h3>缺失模式熱力圖</h3><img src="${heat}"/></section>` : ""}
${patternRows ? `<section><h3>常見缺失組合</h3><table><tr><th>缺失的欄位組合</th><th>列數</th><th>佔比</th></tr>${patternRows}</table></section>` : ""}

<h2>分布分析</h2>
${distCols.map(columnSection).join("")}
${result.columns.length > MAX_DIST_CHARTS ? `<p class="muted">（僅顯示前 ${MAX_DIST_CHARTS} 個欄位的分布圖）</p>` : ""}

${corrImg ? `<h2>相關性（Pearson）</h2><section><img src="${corrImg}"/></section>` : ""}

<footer>Next Data Analyzer 自動產生</footer>
</div>
</body>
</html>`;
}

export async function exportHtmlReport(result: AnalysisResult, meta: { source: string; encoding: string | null }): Promise<void> {
  toast("正在產生報告…");
  await new Promise((r) => setTimeout(r, 30));
  const html = buildReportHtml(result, meta);
  const path = await save({
    defaultPath: "analysis-report.html",
    filters: [{ name: "HTML 報告", extensions: ["html"] }],
  });
  if (!path) return;
  const bytes = new TextEncoder().encode(html);
  await invoke("save_file_bytes", { path, bytes: Array.from(bytes) });
  toast(`報告已儲存：${path}`);
}

function csvEscape(s: string): string {
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function buildStatsCsv(result: AnalysisResult): string {
  const header = ["#", "欄位", "型別", "缺失數", "缺失率%", "不重複值", "平均數", "中位數", "標準差", "最小值", "最大值", "類別數", "最高類別"];
  const lines = [header.join(",")];
  result.columns.forEach((c, i) => {
    const row = [
      String(i + 1),
      csvEscape(c.name),
      c.type,
      String(c.missing),
      (c.missingPct * 100).toFixed(2),
      String(c.unique),
      c.numeric ? c.numeric.mean.toPrecision(8) : "",
      c.numeric ? c.numeric.median.toPrecision(8) : "",
      c.numeric ? c.numeric.std.toPrecision(8) : "",
      c.numeric ? c.numeric.min.toPrecision(8) : "",
      c.numeric ? c.numeric.max.toPrecision(8) : "",
      c.categorical ? String(c.categorical.cardinality) : "",
      c.categorical && c.categorical.top.length > 0 ? csvEscape(c.categorical.top[0].value) : "",
    ];
    lines.push(row.join(","));
  });
  return `\uFEFF${lines.join("\r\n")}`;
}

export async function exportStatsCsv(result: AnalysisResult): Promise<void> {
  const csv = buildStatsCsv(result);
  const path = await save({
    defaultPath: "column-stats.csv",
    filters: [{ name: "CSV", extensions: ["csv"] }],
  });
  if (!path) return;
  const bytes = new TextEncoder().encode(csv);
  await invoke("save_file_bytes", { path, bytes: Array.from(bytes) });
  toast(`統計表已儲存：${path}`);
}
