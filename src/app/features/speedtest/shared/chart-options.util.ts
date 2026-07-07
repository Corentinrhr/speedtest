import { fmtClock } from './format.util';

export const COLOR_DL = '#4f46e5';   // blue/indigo -> Download
export const COLOR_UL = '#f5576c';   // red         -> Upload
export const COLOR_LAT = '#4b5563';  // dark gray   -> Loaded latency
export const COLOR_LOSS = '#ef4444'; // red         -> Packet loss markers

// Fixed Y position for packet loss markers on the LATENCY chart.
// Placed near the top of the latency axis so they clearly stand out from the
// latency curve without overlapping it.
export const LOSS_MARKER_Y = 2000;

export interface DualSample { t: number; v: number; lat: number | null; lost?: boolean; }
export interface SpeedSample { t: number; v: number; lost?: boolean; }

/* ============================================================
   SPEED CHART (top) — single axis: Mb/s
   ============================================================ */

export function buildSpeedOptions(speedColor: string) {
  return {
    maintainAspectRatio: false,
    animation: { duration: 250 },
    interaction: { mode: 'index', intersect: false },
    plugins: {
      // >>> Legend hidden (no 'Speed' label / point on top of the chart).
      legend: { display: false },
      tooltip: {
        enabled: true,
        callbacks: {
          label: (ctx: { dataset: { label?: string }; parsed: { y: number | null } }) => {
            const label = ctx.dataset.label ?? '';
            const val = ctx.parsed.y;
            if (val === null || val === undefined) return `${label}: --`;
            return `${label}: ${val.toFixed(2)} Mb/s`;
          },
        },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: '#94a3b8', maxTicksLimit: 8, autoSkip: true } },
      y: {
        type: 'linear', position: 'left',
        grid: { color: 'rgba(148,163,184,0.12)' },
        ticks: { color: speedColor },
        beginAtZero: true,
        title: { display: true, text: 'Mb/s', color: speedColor },
      },
    },
  };
}

export function buildSpeedChart(h: DualSample[], color: string) {
  return {
    labels: h.map((s) => fmtClock(s.t)),
    datasets: [
      {
        label: 'Speed',
        data: h.map((s) => s.v),
        borderColor: color,
        backgroundColor: color + '14',
        fill: true,
        tension: 0.4,
        pointRadius: 3,
        pointHoverRadius: 6,
        pointBackgroundColor: color,
        borderWidth: 2.5,
        yAxisID: 'y',
      },
    ],
  };
}

/* ============================================================
   LATENCY + PACKET LOSS CHART (bottom) — single axis: ms
   ============================================================ */

export function buildLatencyOptions() {
  return {
    maintainAspectRatio: false,
    animation: { duration: 250 },
    interaction: { mode: 'index', intersect: false },
    plugins: {
      // >>> Legend hidden (no 'Loaded latency' label / point on top of the chart).
      legend: { display: false },
      tooltip: {
        enabled: true,
        callbacks: {
          label: (ctx: { dataset: { label?: string }; parsed: { y: number | null } }) => {
            const label = ctx.dataset.label ?? '';
            const val = ctx.parsed.y;
            if (label.toLowerCase().includes('packet loss')) {
              return val === null || val === undefined ? '' : 'Packet lost';
            }
            if (val === null || val === undefined) return `${label}: --`;
            return `${label}: ${val.toFixed(2)} ms`;
          },
        },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: '#94a3b8', maxTicksLimit: 8, autoSkip: true } },
      y: {
        type: 'linear', position: 'left',
        grid: { color: 'rgba(148,163,184,0.12)' },
        ticks: { color: COLOR_LAT },
        beginAtZero: true,
        title: { display: true, text: 'Latency (ms)', color: COLOR_LAT },
      },
    },
  };
}

/*
   Build the latency + packet-loss chart with its OWN time labels.

   >>> Independent time scale:
   The latency samples and the packet-loss markers are merged into a single
   ordered timeline (by timestamp). Latency points and loss markers therefore
   share the same X axis and "follow each other" chronologically, but a loss
   marker never sits on the exact same X slot as a latency point unless they
   truly share the same timestamp — because each distinct timestamp gets its
   own label. This keeps markers visually next to (not on top of) the curve.
*/
export function buildLatencyChart(h: DualSample[]) {
  // 1. Build a merged, de-duplicated, time-ordered set of timestamps coming
  //    from BOTH latency points and loss events.
  const points = h
    .map((s) => ({ t: s.t, lat: s.lat, lost: !!s.lost }))
    .sort((a, b) => a.t - b.t);

  const labels = points.map((p) => fmtClock(p.t));

  const latData = points.map((p) => (p.lost ? null : p.lat));
  const lossData = points.map((p) => (p.lost ? LOSS_MARKER_Y : null));
  const hasLoss = lossData.some((v) => v !== null);

  const datasets: unknown[] = [
    {
      label: 'Loaded latency',
      data: latData,
      borderColor: COLOR_LAT,
      backgroundColor: COLOR_LAT + '14',
      fill: false,
      tension: 0.3,
      pointRadius: 3,
      pointHoverRadius: 6,
      pointBackgroundColor: COLOR_LAT,
      borderWidth: 2,
      spanGaps: true,
      yAxisID: 'y',
    },
  ];

  if (hasLoss) {
    datasets.push({
      label: 'Packet loss',
      data: lossData,
      borderColor: 'transparent',
      backgroundColor: COLOR_LOSS,
      showLine: false,
      pointStyle: 'crossRot',
      pointRadius: 9,
      pointHoverRadius: 12,
      pointBorderColor: COLOR_LOSS,
      pointBorderWidth: 3,
      pointBackgroundColor: COLOR_LOSS,
      spanGaps: false,
      yAxisID: 'y',
    });
  }

  return { labels, datasets };
}

/* ============================================================
   IDLE LATENCY CHART (unchanged) — used by the latency-card
   ============================================================ */

export function buildPingOptions() {
  return {
    maintainAspectRatio: false,
    animation: { duration: 250 },
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        enabled: true,
        callbacks: {
          label: (ctx: { dataset: { label?: string }; parsed: { y: number | null } }) => {
            const label = ctx.dataset.label ?? '';
            const val = ctx.parsed.y;
            if (label.toLowerCase().includes('packet loss')) {
              return val === null || val === undefined ? '' : 'Packet lost';
            }
            return val === null || val === undefined ? '--' : `${val.toFixed(2)} ms`;
          },
        },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: '#94a3b8', maxTicksLimit: 8, autoSkip: true } },
      y: { grid: { color: 'rgba(148,163,184,0.12)' }, ticks: { color: '#94a3b8' }, beginAtZero: true },
    },
  };
}

export function buildPingChart(h: SpeedSample[], color: string) {
  const lossData = h.map((s) => (s.lost ? LOSS_MARKER_Y : null));
  const hasLoss = lossData.some((v) => v !== null);

  const datasets: unknown[] = [
    {
      label: 'Latency',
      data: h.map((s) => (s.lost ? null : s.v)),
      borderColor: color,
      backgroundColor: color + '14',
      fill: true,
      tension: 0.4,
      pointRadius: 3,
      pointHoverRadius: 6,
      pointBackgroundColor: color,
      borderWidth: 2.5,
      spanGaps: true,
    },
  ];

  if (hasLoss) {
    datasets.push({
      label: 'Packet loss',
      data: lossData,
      borderColor: 'transparent',
      backgroundColor: COLOR_LOSS,
      showLine: false,
      pointStyle: 'crossRot',
      pointRadius: 9,
      pointHoverRadius: 12,
      pointBorderColor: COLOR_LOSS,
      pointBorderWidth: 3,
      pointBackgroundColor: COLOR_LOSS,
      spanGaps: false,
    });
  }

  return {
    labels: h.map((s) => fmtClock(s.t)),
    datasets,
  };
}
