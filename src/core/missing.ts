export function buildTokenSet(tokens: string[]): Set<string> {
  const set = new Set<string>();
  for (const t of tokens) {
    const trimmed = t.trim();
    if (trimmed !== "") set.add(trimmed.toLowerCase());
  }
  return set;
}

export function isMissingValue(value: string, tokens: Set<string>): boolean {
  if (value === "") return true;
  const t = value.trim();
  if (t === "") return true;
  return tokens.has(t.toLowerCase());
}

export function missingMask(values: string[], tokens: Set<string>): Uint8Array {
  const mask = new Uint8Array(values.length);
  for (let i = 0; i < values.length; i++) {
    if (isMissingValue(values[i], tokens)) mask[i] = 1;
  }
  return mask;
}

export function countMissing(mask: Uint8Array): number {
  let n = 0;
  for (let i = 0; i < mask.length; i++) n += mask[i];
  return n;
}

export function countUnique(values: string[], mask: Uint8Array, cap = 200000): { unique: number; truncated: boolean } {
  const set = new Set<string>();
  for (let i = 0; i < values.length; i++) {
    if (mask[i]) continue;
    set.add(values[i].trim());
    if (set.size > cap) return { unique: set.size, truncated: true };
  }
  return { unique: set.size, truncated: false };
}

export interface PatternResult {
  patterns: { indices: number[]; count: number }[];
  completeRows: number;
}

export function missingPatterns(masks: Uint8Array[], rowCount: number): PatternResult {
  const counts = new Map<string, { indices: number[]; count: number }>();
  let completeRows = 0;
  for (let r = 0; r < rowCount; r++) {
    const idx: number[] = [];
    for (let c = 0; c < masks.length; c++) {
      if (masks[c][r]) idx.push(c);
    }
    if (idx.length === 0) {
      completeRows++;
      continue;
    }
    const key = idx.join(",");
    const entry = counts.get(key);
    if (entry) entry.count++;
    else counts.set(key, { indices: idx, count: 1 });
  }
  const patterns = [...counts.values()].sort((a, b) => b.count - a.count);
  return { patterns, completeRows };
}
