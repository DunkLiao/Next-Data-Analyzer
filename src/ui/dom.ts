export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string>,
  children?: (Node | string)[],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") node.className = v;
      else node.setAttribute(k, v);
    }
  }
  if (children) {
    for (const c of children) {
      node.append(c);
    }
  }
  return node;
}

export function clear(node: HTMLElement): void {
  node.replaceChildren();
}

export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

export function fmtPct(fraction: number, digits = 1): string {
  return `${(fraction * 100).toFixed(digits)}%`;
}

export function fmtNum(x: number): string {
  if (!Number.isFinite(x)) return "—";
  if (x === 0) return "0";
  const abs = Math.abs(x);
  if (abs >= 1e12 || abs < 1e-4) return x.toExponential(3);
  if (Number.isInteger(x) && abs < 1e15) return fmtInt(x);
  const digits = abs >= 1000 ? 2 : abs >= 1 ? 4 : 6;
  return x.toLocaleString("en-US", { maximumFractionDigits: digits });
}

export function fmtDateTime(t: number): string {
  const d = new Date(t);
  const p = (n: number) => (n < 10 ? `0${n}` : String(n));
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export const TYPE_LABELS: Record<string, string> = {
  integer: "整數",
  number: "數值",
  date: "日期",
  boolean: "布林",
  text: "文字",
};

let toastTimer: number | undefined;

export function toast(message: string, isError = false): void {
  const box = document.getElementById("toast")!;
  box.textContent = message;
  box.className = isError ? "toast show error" : "toast show";
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    box.className = "toast";
  }, 4000);
}
