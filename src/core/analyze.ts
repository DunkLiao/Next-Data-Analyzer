import { categoricalStats } from "./categorical";
import { spearman, pearson } from "./correlation";
import { dateStats } from "./dates";
import { inferType, parseNumberValue } from "./infer";
import { buildTokenSet, countMissing, countUnique, missingMask, missingPatterns } from "./missing";
import { numericStats } from "./stats";
import type {
  AnalyzeOptions,
  AnalysisResult,
  ColumnResult,
  CorrelationResult,
  Dataset,
  HeatmapData,
} from "./types";

const MAX_CORR_COLUMNS = 15;

function analyzeColumn(name: string, values: string[], mask: Uint8Array, rowCount: number): ColumnResult {
  const missing = countMissing(mask);
  const { unique, truncated } = countUnique(values, mask);
  const type = inferType(values, mask);
  const result: ColumnResult = {
    name,
    type,
    missing,
    missingPct: rowCount > 0 ? missing / rowCount : 0,
    unique,
    uniqueTruncated: truncated,
  };

  if (type === "integer" || type === "number") {
    const nums = new Float64Array(values.length);
    for (let i = 0; i < values.length; i++) {
      nums[i] = mask[i] ? NaN : parseNumberValue(values[i]) ?? NaN;
    }
    result.numeric = numericStats(nums) ?? undefined;
    result.categorical = unique <= 50 ? categoricalStats(values, mask) : undefined;
  } else if (type === "date") {
    result.date = dateStats(values, mask) ?? undefined;
  } else {
    result.categorical = categoricalStats(values, mask);
  }
  return result;
}

function buildHeatmap(
  masks: Uint8Array[],
  rowCount: number,
  missingRates: number[],
  sampleRows: number,
): HeatmapData | null {
  const colCount = masks.length;
  if (colCount === 0 || rowCount === 0) return null;
  const columnOrder = masks.map((_, i) => i).sort((a, b) => missingRates[b] - missingRates[a]);
  const sampled = rowCount > sampleRows;
  const rowIndices: number[] = [];
  if (sampled) {
    for (let i = 0; i < sampleRows; i++) {
      rowIndices.push(Math.floor((i * rowCount) / sampleRows));
    }
  } else {
    for (let r = 0; r < rowCount; r++) rowIndices.push(r);
  }
  const cells = new Array<number>(rowIndices.length * colCount);
  for (let r = 0; r < rowIndices.length; r++) {
    const row = rowIndices[r];
    for (let c = 0; c < colCount; c++) {
      cells[r * colCount + c] = masks[columnOrder[c]][row];
    }
  }
  return { rowIndices, columnOrder, cells, sampled };
}

function buildCorrelation(ds: Dataset, masks: Uint8Array[], types: string[]): CorrelationResult | null {
  const candidates: number[] = [];
  for (let c = 0; c < ds.columnNames.length; c++) {
    if (types[c] === "integer" || types[c] === "number") candidates.push(c);
  }
  if (candidates.length < 2) return null;
  const truncated = candidates.length > MAX_CORR_COLUMNS;
  const chosen = candidates.slice(0, MAX_CORR_COLUMNS);

  const series = chosen.map((c) => {
    const values = ds.columns[c];
    const mask = masks[c];
    const arr = new Float64Array(values.length);
    for (let i = 0; i < values.length; i++) {
      arr[i] = mask[i] ? NaN : parseNumberValue(values[i]) ?? NaN;
    }
    return arr;
  });

  const k = chosen.length;
  const mk = (): (number | null)[][] => Array.from({ length: k }, () => new Array<number | null>(k).fill(null));
  const p = mk();
  const s = mk();
  for (let i = 0; i < k; i++) {
    p[i][i] = 1;
    s[i][i] = 1;
    for (let j = i + 1; j < k; j++) {
      const rp = pearson(series[i], series[j]);
      const rs = spearman(series[i], series[j]);
      p[i][j] = p[j][i] = rp;
      s[i][j] = s[j][i] = rs;
    }
  }
  return { columns: chosen.map((c) => ds.columnNames[c]), pearson: p, spearman: s, truncated };
}

export function analyze(ds: Dataset, options: AnalyzeOptions): AnalysisResult {
  const warnings: string[] = [];
  const tokens = buildTokenSet(options.missingTokens);
  const rowCount = ds.rowCount;
  const colCount = ds.columnNames.length;

  const masks = ds.columns.map((values) => missingMask(values, tokens));
  const columns: ColumnResult[] = ds.columns.map((values, c) =>
    analyzeColumn(ds.columnNames[c], values, masks[c], rowCount),
  );

  const missingCells = columns.reduce((acc, col) => acc + col.missing, 0);
  const { patterns, completeRows } = missingPatterns(masks, rowCount);
  const topPatterns = patterns.slice(0, 12).map((p) => ({
    columns: p.indices.map((i) => ds.columnNames[i]),
    count: p.count,
    pct: rowCount > 0 ? p.count / rowCount : 0,
  }));

  const heatmap = buildHeatmap(
    masks,
    rowCount,
    columns.map((c) => c.missingPct),
    options.heatmapSampleRows,
  );

  const correlation = buildCorrelation(
    ds,
    masks,
    columns.map((c) => c.type),
  );
  if (correlation?.truncated) {
    warnings.push(`數值欄超過 ${MAX_CORR_COLUMNS} 個，相關性矩陣僅包含前 ${MAX_CORR_COLUMNS} 欄`);
  }

  const preview = options.previewRows > 0
    ? Array.from({ length: Math.min(options.previewRows, rowCount) }, (_, r) =>
        ds.columns.map((col) => col[r]),
      )
    : [];

  return {
    datasetName: ds.name,
    rowCount,
    columnCount: colCount,
    columns,
    preview,
    missingSummary: {
      totalCells: rowCount * colCount,
      missingCells,
      missingPct: rowCount * colCount > 0 ? missingCells / (rowCount * colCount) : 0,
      completeRows,
      anyMissingRows: rowCount - completeRows,
    },
    heatmap,
    patterns: topPatterns,
    correlation,
    warnings,
  };
}
