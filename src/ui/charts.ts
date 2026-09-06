import * as echarts from "echarts";

const instances = new Map<string, echarts.ECharts>();

export function renderChart(containerId: string, option: echarts.EChartsOption): echarts.ECharts {
  const container = document.getElementById(containerId);
  if (!container) throw new Error(`找不到圖表容器 #${containerId}`);
  disposeChart(containerId);
  const chart = echarts.init(container);
  chart.setOption(option);
  instances.set(containerId, chart);
  return chart;
}

export function disposeChart(containerId: string): void {
  const existing = instances.get(containerId);
  if (existing) {
    existing.dispose();
    instances.delete(containerId);
  }
}

export function disposeAllCharts(): void {
  for (const [id] of instances) disposeChart(id);
}

export function resizeAllCharts(): void {
  for (const chart of instances.values()) chart.resize();
}

export function chartDataUrl(_id: string, width: number, height: number, option: echarts.EChartsOption): string {
  const off = document.createElement("div");
  off.style.width = `${width}px`;
  off.style.height = `${height}px`;
  off.style.position = "absolute";
  off.style.left = "-99999px";
  document.body.appendChild(off);
  try {
    const chart = echarts.init(off, undefined, { width, height });
    chart.setOption(option);
    const url = chart.getDataURL({ type: "png", pixelRatio: 2, backgroundColor: "#ffffff" });
    chart.dispose();
    return url;
  } finally {
    off.remove();
  }
}

export const PALETTE = [
  "#4f6df5",
  "#22b8cf",
  "#f59f00",
  "#e8590c",
  "#37b24d",
  "#ae3ec9",
  "#d6336c",
  "#1098ad",
  "#6b7280",
];

export function missingColorScale(): [number, string][] {
  return [
    [0, "#eef2ff"],
    [0.25, "#a5b4fc"],
    [0.5, "#f59f00"],
    [0.75, "#e8590c"],
    [1, "#c92a2a"],
  ];
}
