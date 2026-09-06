export function pearson(x: Float64Array, y: Float64Array): number | null {
  let n = 0;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  const len = Math.min(x.length, y.length);
  for (let i = 0; i < len; i++) {
    const a = x[i];
    const b = y[i];
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    n++;
    sx += a;
    sy += b;
    sxx += a * a;
    syy += b * b;
    sxy += a * b;
  }
  if (n < 3) return null;
  const cov = sxy - (sx * sy) / n;
  const vx = sxx - (sx * sx) / n;
  const vy = syy - (sy * sy) / n;
  if (vx <= 0 || vy <= 0) return null;
  const r = cov / Math.sqrt(vx * vy);
  return Math.max(-1, Math.min(1, r));
}

export function ranks(values: Float64Array): Float64Array {
  const n = values.length;
  const idx: number[] = [];
  for (let i = 0; i < n; i++) {
    if (Number.isFinite(values[i])) idx.push(i);
  }
  idx.sort((a, b) => values[a] - values[b]);
  const out = new Float64Array(n).fill(NaN);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && values[idx[j + 1]] === values[idx[i]]) j++;
    const avgRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) out[idx[k]] = avgRank;
    i = j + 1;
  }
  return out;
}

export function spearman(x: Float64Array, y: Float64Array): number | null {
  return pearson(ranks(x), ranks(y));
}
