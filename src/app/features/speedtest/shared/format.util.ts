// Shared formatting and statistics helpers used across the speedtest components.

export function num(value: string | number | undefined | null): number {
  const n = Number(value);
  return isNaN(n) ? 0 : n;
}

export function fmt(value: string | number | undefined | null): string {
  if (value === '' || value === undefined || value === null) return '--';
  const n = Number(value);
  if (isNaN(n)) return String(value);
  return n < 10 ? n.toFixed(2) : n < 100 ? n.toFixed(1) : n.toFixed(0);
}

export function fmtMetric(value: string | number | undefined | null): string {
  if (value === '' || value === undefined || value === null) return '--';
  const n = Number(value);
  return isNaN(n) ? String(value) : n.toFixed(1);
}

export function fmtNum(n: number): string {
  return n < 10 ? n.toFixed(2) : n < 100 ? n.toFixed(1) : n.toFixed(0);
}

// Formats a latency value; shows "--" when there is no data yet.
export function fmtLat(n: number): string {
  return n > 0 ? n.toFixed(1) : '--';
}

export function fmtClock(ts: number): string {
  const d = new Date(ts);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// ── Stats over { v } samples ──
export function avg(h: { v: number }[]): number {
  return h.length ? h.reduce((a, b) => a + b.v, 0) / h.length : 0;
}
export function median(h: { v: number }[]): number {
  const v = h.map((s) => s.v).sort((a, b) => a - b);
  if (!v.length) return 0;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}
export function max(h: { v: number }[]): number {
  return h.length ? Math.max(...h.map((s) => s.v)) : 0;
}
export function min(h: { v: number }[]): number {
  return h.length ? Math.min(...h.map((s) => s.v)) : 0;
}

// ── Loaded-latency stats over { lat } samples ──
export function latValues(h: { lat: number | null }[]): number[] {
  return h.map((s) => s.lat).filter((v): v is number => v !== null && v > 0);
}
export function latMin(h: { lat: number | null }[]): number {
  const v = latValues(h);
  return v.length ? Math.min(...v) : 0;
}
export function latAvg(h: { lat: number | null }[]): number {
  const v = latValues(h);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
}
export function latMax(h: { lat: number | null }[]): number {
  const v = latValues(h);
  return v.length ? Math.max(...v) : 0;
}
export function latJitter(h: { lat: number | null }[]): number {
  const v = latValues(h);
  return v.length < 2 ? 0 : Math.max(...v) - Math.min(...v);
}