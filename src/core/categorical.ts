import type { CategoricalStats } from "./types";

const MAX_TRACKED = 50000;

export function categoricalStats(values: string[], mask: Uint8Array, topK = 500): CategoricalStats {
  const counts = new Map<string, number>();
  let capped = false;
  for (let i = 0; i < values.length; i++) {
    if (mask[i]) continue;
    const v = values[i].trim();
    const c = counts.get(v);
    if (c !== undefined) {
      counts.set(v, c + 1);
    } else if (counts.size < MAX_TRACKED) {
      counts.set(v, 1);
    } else {
      capped = true;
    }
  }
  const top = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, topK)
    .map(([value, count]) => ({ value, count }));
  return { cardinality: counts.size, top, truncated: capped || counts.size > topK };
}
