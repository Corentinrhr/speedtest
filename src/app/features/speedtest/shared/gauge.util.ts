// Shared SVG gauge geometry helpers used by the reusable gauge component.
// Centralised here so every gauge (DL / UL / Ping) uses the exact same math.

export interface TickMark {
  val: string;
  x1: number; y1: number;
  x2: number; y2: number;
  lx: number; ly: number;
}

// Gauge geometry constants (viewBox is 220x200).
const CX = 110;
const CY = 110;
const R = 90;
const START_ANGLE = 135;
const SWEEP_ANGLE = 270;

function polar(radius: number, angleDeg: number): { x: number; y: number } {
  const a = (angleDeg * Math.PI) / 180;
  return { x: CX + radius * Math.cos(a), y: CY + radius * Math.sin(a) };
}

export function arcPath(fromDeg: number, toDeg: number): string {
  const start = polar(R, fromDeg);
  const end = polar(R, toDeg);
  const largeArc = toDeg - fromDeg > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${R} ${R} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

export function gaugeBgPath(): string {
  return arcPath(START_ANGLE, START_ANGLE + SWEEP_ANGLE);
}

// Convert a value into a 0..1 fraction along the (non-linear) tick scale.
export function toFraction(value: number, ticks: readonly number[]): number {
  const last = ticks.length - 1;
  if (value <= ticks[0]) return 0;
  if (value >= ticks[last]) return 1;
  for (let i = 1; i <= last; i++) {
    if (value <= ticks[i]) {
      const segFrac = (value - ticks[i - 1]) / (ticks[i] - ticks[i - 1]);
      return (i - 1 + segFrac) / last;
    }
  }
  return 1;
}

export function valuePath(value: number, ticks: readonly number[]): string {
  const angle = START_ANGLE + toFraction(value, ticks) * SWEEP_ANGLE;
  return arcPath(START_ANGLE, angle);
}

export function buildTicks(ticks: readonly number[]): TickMark[] {
  return ticks.map((val, i) => {
    const frac = i / (ticks.length - 1);
    const angle = START_ANGLE + frac * SWEEP_ANGLE;
    const outer = polar(R + 4, angle);
    const inner = polar(R - 8, angle);
    const label = polar(R + 20, angle);
    return {
      val: val >= 1000 ? '1G' : String(val),
      x1: inner.x, y1: inner.y, x2: outer.x, y2: outer.y,
      lx: label.x, ly: label.y,
    };
  });
}