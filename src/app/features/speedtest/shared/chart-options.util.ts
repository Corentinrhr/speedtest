import { fmtClock } from './format.util';

export const COLOR_DL = '#4f46e5';   // blue/indigo -> Download
export const COLOR_UL = '#f5576c';   // red         -> Upload
export const COLOR_LAT = '#4b5563';  // dark gray   -> Loaded latency
export const COLOR_LOSS = '#ef4444'; // red         -> Packet loss markers

export interface DualSample { t: number; v: number; lat: number | null; lost?: boolean; }
export interface SpeedSample { t: number; v: number; }

// Chart options for the speed cards: dual Y axes (speed + loaded latency).
export function buildDualOptions(speedColor: string, latColor: string) {
  return {
    maintainAspectRatio: false,
    animation: { duration: 250 },
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: true, labels: { color: '#94a3b8', usePointStyle: true } },
      tooltip: {
        enabled: true,
        callbacks: {
          label: (ctx: { dataset: { label?: string }; parsed: { y: number | null } }) => {
            const label = ctx.dataset.label ?? '';
            const val = ctx.parsed.y;
            // Packet loss markers: show a dedicated message.
            if (label.toLowerCase().includes('packet loss')) {
              return val === null || val === undefined ? '' : 'Packet lost';
            }
            if (val === null || val === undefined) return `${label}: --`;
            const unit = label.toLowerCase().includes('latency') ? ' ms' : ' Mb/s';
            return `${label}: ${val.toFixed(2)}${unit}`;
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
      y1: {
        type: 'linear', position: 'right',
        grid: { drawOnChartArea: false },
        ticks: { color: latColor },
        beginAtZero: true,
        title: { display: true, text: 'Latency (ms)', color: latColor },
      },
    },
  };
}

// Chart options for the latency card: single Y axis (ms).
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
          label: (ctx: { parsed: { y: number | null } }) => {
            const val = ctx.parsed.y;
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

// Speed chart with a second line for loaded latency + a marker dataset for packet loss.
export function buildDualChart(h: DualSample[], color: string) {
  // >>> FIX: plot loss markers on the SPEED axis (y) at the speed value,
  // so they are always visible on the chart (previously placed on y1 at 0 => invisible).
  const lossData = h.map((s) => (s.lost ? s.v : null));
  const hasLoss = lossData.some((v) => v !== null);

  const datasets: unknown[] = [
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
    {
      label: 'Loaded latency',
      data: h.map((s) => s.lat),
      borderColor: COLOR_LAT,
      backgroundColor: 'transparent',
      fill: false,
      tension: 0.3,
      pointRadius: 3,
      pointHoverRadius: 6,
      pointBackgroundColor: COLOR_LAT,
      borderWidth: 1.5,
      spanGaps: true,
      yAxisID: 'y1',
    },
  ];

  // Only add the loss dataset if there is at least one lost packet.
  if (hasLoss) {
    datasets.push({
      label: 'Packet loss',
      data: lossData,
      borderColor: 'transparent',
      backgroundColor: COLOR_LOSS,
      showLine: false,
      pointStyle: 'crossRot',      // draws an "x" marker
      pointRadius: 9,
      pointHoverRadius: 12,
      pointBorderColor: COLOR_LOSS,
      pointBorderWidth: 3,
      pointBackgroundColor: COLOR_LOSS,
      spanGaps: false,
      yAxisID: 'y',                // >>> FIX: same axis as the speed line
    });
  }

  return {
    labels: h.map((s) => fmtClock(s.t)),
    datasets,
  };
}

// Idle latency chart with hoverable points.
export function buildPingChart(h: SpeedSample[], color: string) {
  return {
    labels: h.map((s) => fmtClock(s.t)),
    datasets: [{
      label: 'Latency',
      data: h.map((s) => s.v),
      borderColor: color,
      backgroundColor: color + '14',
      fill: true,
      tension: 0.4,
      pointRadius: 3,
      pointHoverRadius: 6,
      pointBackgroundColor: color,
      borderWidth: 2.5,
    }],
  };
}