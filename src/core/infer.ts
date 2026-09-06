import type { ColType } from "./types";

const GROUPED_NUMBER = /^[+-]?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?([eE][+-]?\d+)?$/;

export function parseNumberValue(value: string): number | null {
  const s = value.trim();
  if (s === "") return null;
  if (GROUPED_NUMBER.test(s)) {
    const n = Number(s.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(s);
  if (Number.isFinite(n)) return n;
  return null;
}

export function parseIntegerValue(value: string): number | null {
  const s = value.trim();
  if (!/^[+-]?\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const DATE_YMD = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;
const DATE_DMY = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/;

function validDate(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

export function parseDateValue(value: string): number | null {
  const s = value.trim();
  if (s === "") return null;
  let m = DATE_YMD.exec(s);
  if (m) {
    const y = +m[1];
    const mo = +m[2];
    const d = +m[3];
    if (!validDate(y, mo, d)) return null;
    if (m[4] !== undefined) {
      const hh = +m[4];
      const mm = +m[5];
      const ss = m[6] !== undefined ? +m[6] : 0;
      if (hh > 23 || mm > 59 || ss > 59) return null;
      return new Date(y, mo - 1, d, hh, mm, ss).getTime();
    }
    return new Date(y, mo - 1, d).getTime();
  }
  m = DATE_DMY.exec(s);
  if (m) {
    const a = +m[1];
    const b = +m[2];
    const y = +m[3];
    if (validDate(y, a, b)) return new Date(y, a - 1, b).getTime();
    if (validDate(y, b, a)) return new Date(y, b - 1, a).getTime();
    return null;
  }
  return null;
}

export function parseBooleanValue(value: string): boolean | null {
  const s = value.trim().toLowerCase();
  if (s === "true") return true;
  if (s === "false") return false;
  return null;
}

const SAMPLE_SIZE = 2000;
const THRESHOLD = 0.9;

export function inferType(values: string[], mask: Uint8Array): ColType {
  const sample: string[] = [];
  const step = Math.max(1, Math.floor(values.length / SAMPLE_SIZE));
  for (let i = 0; i < values.length && sample.length < SAMPLE_SIZE; i += step) {
    if (!mask[i]) sample.push(values[i]);
  }
  if (sample.length === 0) return "text";

  let bools = 0;
  let ints = 0;
  let nums = 0;
  let dates = 0;
  for (const v of sample) {
    if (parseBooleanValue(v) !== null) bools++;
    if (parseIntegerValue(v) !== null) ints++;
    if (parseNumberValue(v) !== null) nums++;
    if (parseDateValue(v) !== null) dates++;
  }
  const n = sample.length;
  if (bools / n >= THRESHOLD) return "boolean";
  if (ints / n >= THRESHOLD) return "integer";
  if (nums / n >= THRESHOLD) return "number";
  if (dates / n >= THRESHOLD) return "date";
  return "text";
}
