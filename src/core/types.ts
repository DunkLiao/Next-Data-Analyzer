export type ColType = "integer" | "number" | "date" | "boolean" | "text";

export interface Dataset {
  name: string;
  columnNames: string[];
  columns: string[][];
  rowCount: number;
}

export interface Histogram {
  edges: number[];
  counts: number[];
  binWidth: number;
}

export interface NumericStats {
  count: number;
  mean: number;
  std: number;
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  skew: number;
  kurt: number;
  iqrOutliers: number;
  zOutliers: number;
  histogram: Histogram;
}

export interface CategoricalStats {
  cardinality: number;
  top: { value: string; count: number }[];
  truncated: boolean;
}

export interface DateStats {
  count: number;
  min: number;
  max: number;
  unparseable: number;
  unit: "day" | "month";
  points: { label: string; count: number }[];
}

export interface ColumnResult {
  name: string;
  type: ColType;
  missing: number;
  missingPct: number;
  unique: number;
  uniqueTruncated: boolean;
  numeric?: NumericStats;
  categorical?: CategoricalStats;
  date?: DateStats;
}

export interface MissingSummary {
  totalCells: number;
  missingCells: number;
  missingPct: number;
  completeRows: number;
  anyMissingRows: number;
}

export interface MissingPattern {
  columns: string[];
  count: number;
  pct: number;
}

export interface HeatmapData {
  rowIndices: number[];
  columnOrder: number[];
  cells: number[];
  sampled: boolean;
}

export interface CorrelationResult {
  columns: string[];
  pearson: (number | null)[][];
  spearman: (number | null)[][];
  truncated: boolean;
}

export interface AnalysisResult {
  datasetName: string;
  rowCount: number;
  columnCount: number;
  columns: ColumnResult[];
  preview: string[][];
  missingSummary: MissingSummary;
  heatmap: HeatmapData | null;
  patterns: MissingPattern[];
  correlation: CorrelationResult | null;
  warnings: string[];
}

export interface AnalyzeOptions {
  missingTokens: string[];
  heatmapSampleRows: number;
  previewRows: number;
}

export const DEFAULT_OPTIONS: AnalyzeOptions = {
  missingTokens: [
    "",
    "NA",
    "N/A",
    "NULL",
    "NaN",
    "nan",
    "None",
    "missing",
    "unknown",
    "-",
    "?",
    "未知",
    "缺",
    "缺失",
    "無",
  ],
  heatmapSampleRows: 300,
  previewRows: 200,
};

export type WorkerRequest =
  | { reqId: number; type: "load"; buffer: ArrayBuffer; fileName: string; kind: "csv" | "excel" }
  | { reqId: number; type: "load-text"; text: string; fileName: string }
  | { reqId: number; type: "load-dataset"; dataset: Dataset }
  | { reqId: number; type: "select-sheet"; sheet: string }
  | { reqId: number; type: "redecode"; encoding: string }
  | { reqId: number; type: "analyze"; options: AnalyzeOptions }
  | { reqId: number; type: "histogram"; column: number; bins: number }
  | { reqId: number; type: "rows"; offset: number; limit: number };

export interface LoadInfo {
  kind: "csv" | "excel" | "text" | "database";
  encoding: string | null;
  sheets: string[] | null;
  activeSheet: string | null;
  rowCount: number;
  columnCount: number;
}

export type WorkerResponse =
  | { reqId: number; type: "loaded"; info: LoadInfo }
  | { reqId: number; type: "result"; result: AnalysisResult }
  | { reqId: number; type: "histogram-result"; column: number; histogram: Histogram }
  | { reqId: number; type: "rows-result"; offset: number; rows: string[][]; totalRows: number }
  | { reqId: number; type: "error"; message: string };
