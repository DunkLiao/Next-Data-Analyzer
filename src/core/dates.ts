import { parseDateValue } from "./infer";
import type { DateStats } from "./types";

const DAY_MS = 86400000;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function dateStats(values: string[], mask: Uint8Array): DateStats | null {
  const stamps: number[] = [];
  let unparseable = 0;
  for (let i = 0; i < values.length; i++) {
    if (mask[i]) continue;
    const t = parseDateValue(values[i]);
    if (t === null) unparseable++;
    else stamps.push(t);
  }
  if (stamps.length === 0) return null;
  stamps.sort((a, b) => a - b);
  const min = stamps[0];
  const max = stamps[stamps.length - 1];
  const spanDays = (max - min) / DAY_MS;
  const unit: "day" | "month" = spanDays <= 180 ? "day" : "month";

  const buckets = new Map<string, number>();
  for (const t of stamps) {
    const d = new Date(t);
    const key = unit === "day"
      ? `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
      : `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  const points = [...buckets.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([label, count]) => ({ label, count }));

  return { count: stamps.length, min, max, unparseable, unit, points };
}
