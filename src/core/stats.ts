import type { Histogram, NumericStats } from "./types";

export function quantileSorted(sorted: Float64Array, p: number): number {
  const n = sorted.length;
  if (n === 0) return NaN;
  if (n === 1) return sorted[0];
  const idx = (n - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export function computeHistogram(values: Float64Array, bins?: number): Histogram {
  const n = values.length;
  if (n === 0) return { edges: [0, 1], counts: [0], binWidth: 1 };
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < n; i++) {
    const v = values[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (min === max) {
    return { edges: [min, min + 1], counts: [n], binWidth: 1 };
  }
  let k = bins ?? 0;
  if (!k || k < 1) {
    const sorted = Float64Array.from(values).sort();
    const iqr = quantileSorted(sorted, 0.75) - quantileSorted(sorted, 0.25);
    if (iqr > 0) {
      const width = (2 * iqr) / Math.cbrt(n);
      k = Math.ceil((max - min) / width);
    } else {
      k = Math.ceil(Math.log2(n)) + 1;
    }
    k = Math.max(1, Math.min(k, 80));
  }
  k = Math.max(1, Math.min(Math.floor(k), 200));
  const binWidth = (max - min) / k;
  const edges: number[] = [];
  for (let i = 0; i <= k; i++) edges.push(min + i * binWidth);
  edges[k] = max;
  const counts = new Array<number>(k).fill(0);
  for (let i = 0; i < n; i++) {
    let b = Math.floor((values[i] - min) / binWidth);
    if (b >= k) b = k - 1;
    if (b < 0) b = 0;
    counts[b]++;
  }
  return { edges, counts, binWidth };
}

export function numericStats(raw: Float64Array, bins?: number): NumericStats | null {
  const values = raw.filter((v) => Number.isFinite(v));
  const n = values.length;
  if (n === 0) return null;
  values.sort();

  let sum = 0;
  for (let i = 0; i < n; i++) sum += values[i];
  const mean = sum / n;

  let m2 = 0;
  let m3 = 0;
  let m4 = 0;
  for (let i = 0; i < n; i++) {
    const d = values[i] - mean;
    const d2 = d * d;
    m2 += d2;
    m3 += d2 * d;
    m4 += d2 * d2;
  }
  m2 /= n;
  m3 /= n;
  m4 /= n;
  const std = n > 1 ? Math.sqrt((m2 * n) / (n - 1)) : 0;
  const skew = m2 > 0 ? (Math.sqrt(n * (n - 1)) / (n - 2 || 1)) * (m3 / Math.pow(m2, 1.5)) : 0;
  const kurt = m2 > 0 ? m4 / (m2 * m2) - 3 : 0;

  const min = values[0];
  const max = values[n - 1];
  const q1 = quantileSorted(values, 0.25);
  const median = quantileSorted(values, 0.5);
  const q3 = quantileSorted(values, 0.75);
  const iqr = q3 - q1;
  const loFence = q1 - 1.5 * iqr;
  const hiFence = q3 + 1.5 * iqr;
  let iqrOutliers = 0;
  let zOutliers = 0;
  for (let i = 0; i < n; i++) {
    const v = values[i];
    if (v < loFence || v > hiFence) iqrOutliers++;
    if (std > 0 && Math.abs(v - mean) > 3 * std) zOutliers++;
  }

  return {
    count: n,
    mean,
    std,
    min,
    q1,
    median,
    q3,
    max,
    skew: Number.isFinite(skew) ? skew : 0,
    kurt,
    iqrOutliers,
    zOutliers,
    histogram: computeHistogram(values, bins),
  };
}
