import {
  Component, OnInit, OnDestroy, inject, signal, computed, effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { ChartModule } from 'primeng/chart';
import { DialogModule } from 'primeng/dialog';
import { CheckboxModule } from 'primeng/checkbox';
import { SliderModule } from 'primeng/slider';
import { InputNumberModule } from 'primeng/inputnumber';
import { FormsModule } from '@angular/forms';
import { SpeedtestService } from '@core/services/speedtest.service';
import { ServerService } from '@core/services/server.service';
import { SpeedtestSettings, TestState } from '@core/models/speedtest.model';
import { SpeedtestServer } from '@core/models/server.model';
import { ServerSelectorComponent } from '@shared/components/server-selector/server-selector.component';

interface SpeedSample { t: number; v: number; }
// Sample carrying both speed (v) and loaded latency (lat) for the dual axis
interface DualSample { t: number; v: number; lat: number | null; }

const SPEED_TICKS = [0, 1, 10, 50, 100, 1000] as const;
const PING_TICKS = [0, 5, 20, 50, 100, 300] as const;

// Colors used both for gauges and for color-coding the chart axes
const COLOR_DL = '#4f46e5';   // blue/indigo  -> Download
const COLOR_UL = '#f5576c';   // red          -> Upload
const COLOR_LAT = '#4b5563';  // dark gray    -> Loaded latency

type Phase = 'download' | 'upload' | 'ping';

@Component({
  selector: 'app-speedtest',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ButtonModule, CardModule,
    ChartModule, DialogModule, CheckboxModule, SliderModule,
    InputNumberModule,
    ServerSelectorComponent,
  ],
  templateUrl: './speedtest.component.html',
  styleUrl: './speedtest.component.scss',
})
export class SpeedtestComponent implements OnInit, OnDestroy {
  private readonly speedtest = inject(SpeedtestService);
  private readonly serverService = inject(ServerService);

  private settings: SpeedtestSettings = {};

  readonly data = this.speedtest.data;
  readonly running = this.speedtest.running;
  readonly finished = this.speedtest.finished;
  readonly servers = this.serverService.servers;
  readonly selectedServer = this.serverService.selectedServer;
  readonly serversLoading = this.serverService.loading;

  readonly showServerSelector = signal(false);

  readonly collapsedDl = signal(false);
  readonly collapsedUl = signal(false);
  readonly collapsedPing = signal(false);

  readonly showSettings = signal(false);
  readonly testPing = signal(true);
  readonly testDl = signal(true);
  readonly testUl = signal(true);
  readonly durationDl = signal(15);
  readonly durationUl = signal(15);
  readonly durationPing = signal(5);

  private static readonly MAX_WINDOW_MS = 5 * 60 * 1000;

  private readonly _historyDl = signal<DualSample[]>([]);
  private readonly _historyUl = signal<DualSample[]>([]);
  private readonly _historyPing = signal<SpeedSample[]>([]);

  // Sampling clock: capture one point every SAMPLE_INTERVAL_MS while running
  private lastSampleAt = 0;
  private static readonly SAMPLE_INTERVAL_MS = 250;

  // Keep the last known loaded latency so the line never drops back to null
  private lastDlLat: number | null = null;
  private lastUlLat: number | null = null;

  private readonly cx = 110;
  private readonly cy = 110;
  private readonly r = 90;
  private readonly startAngle = 135;
  private readonly sweepAngle = 270;

  readonly buttonLabel = computed(() => {
    if (this.serversLoading()) return 'Loading...';
    if (this.running()) return 'Abort';
    if (this.finished()) return 'Restart';
    return 'Start Test';
  });
  readonly buttonIcon = computed(() =>
    this.running() ? 'pi pi-stop' : 'pi pi-play'
  );
  readonly buttonDisabled = computed(
    () => (this.serversLoading() && !this.running()) || !this.atLeastOneTest()
  );
  readonly showResults = computed(() => this.running() || this.finished());

  readonly atLeastOneTest = computed(
    () => this.testPing() || this.testDl() || this.testUl()
  );

  readonly activePhase = computed<Phase | 'idle'>(() => {
    switch (this.data().testState) {
      case TestState.DOWNLOAD: return 'download';
      case TestState.UPLOAD: return 'upload';
      case TestState.PING_JITTER: return 'ping';
      default: return 'idle';
    }
  });

  readonly dlProgress = computed(() => Math.round(this.data().dlProgress * 100));
  readonly ulProgress = computed(() => Math.round(this.data().ulProgress * 100));
  readonly pingProgress = computed(() => Math.round(this.data().pingProgress * 100));

  readonly currentDl = computed(() => this.num(this.data().dlStatus));
  readonly currentUl = computed(() => this.num(this.data().ulStatus));
  readonly currentPing = computed(() => this.num(this.data().pingStatus));

  readonly dlLoadedPing = computed(() => this.fmtMetric(this.data().dlLoadedPing));
  readonly dlLoadedJitter = computed(() => this.fmtMetric(this.data().dlLoadedJitter));
  readonly ulLoadedPing = computed(() => this.fmtMetric(this.data().ulLoadedPing));
  readonly ulLoadedJitter = computed(() => this.fmtMetric(this.data().ulLoadedJitter));

  readonly avgDl = computed(() => this.avg(this._historyDl()));
  readonly medianDl = computed(() => this.median(this._historyDl()));
  readonly maxDl = computed(() => this.max(this._historyDl()));
  readonly minDl = computed(() => this.min(this._historyDl()));

  readonly avgUl = computed(() => this.avg(this._historyUl()));
  readonly medianUl = computed(() => this.median(this._historyUl()));
  readonly maxUl = computed(() => this.max(this._historyUl()));
  readonly minUl = computed(() => this.min(this._historyUl()));

  readonly avgPing = computed(() => this.avg(this._historyPing()));
  readonly medianPing = computed(() => this.median(this._historyPing()));
  readonly maxPing = computed(() => this.max(this._historyPing()));
  readonly minPing = computed(() => this.min(this._historyPing()));

  // ===== Loaded-latency stats (computed from the chart history) =====
  // We extract the non-null "lat" values captured during DL/UL to build
  // min / average / max / jitter KPIs for the loaded latency.
  readonly dlLatMin = computed(() => this.latMin(this._historyDl()));
  readonly dlLatAvg = computed(() => this.latAvg(this._historyDl()));
  readonly dlLatMax = computed(() => this.latMax(this._historyDl()));
  readonly dlLatJitter = computed(() => this.latJitter(this._historyDl()));

  readonly ulLatMin = computed(() => this.latMin(this._historyUl()));
  readonly ulLatAvg = computed(() => this.latAvg(this._historyUl()));
  readonly ulLatMax = computed(() => this.latMax(this._historyUl()));
  readonly ulLatJitter = computed(() => this.latJitter(this._historyUl()));

  readonly downloadSpeed = computed(() => this.fmt(this.data().dlStatus));
  readonly uploadSpeed = computed(() => this.fmt(this.data().ulStatus));
  readonly ping = computed(() => this.fmtMetric(this.data().pingStatus));

  // Jitter is defined as max latency minus min latency over the idle history
  readonly jitter = computed(() => {
    const vals = this._historyPing().map((s) => s.v).filter((v) => v > 0);
    if (vals.length < 2) return '--';
    return (Math.max(...vals) - Math.min(...vals)).toFixed(1);
  });

  readonly gaugeBgPath = computed(() =>
    this.arcPath(this.startAngle, this.startAngle + this.sweepAngle)
  );

  readonly gaugeDlPath = computed(() => this.valuePath(this.currentDl(), SPEED_TICKS));
  readonly gaugeUlPath = computed(() => this.valuePath(this.currentUl(), SPEED_TICKS));
  readonly gaugePingPath = computed(() => this.valuePath(this.currentPing(), PING_TICKS));

  readonly speedTickMarks = computed(() => this.buildTicks(SPEED_TICKS));
  readonly pingTickMarks = computed(() => this.buildTicks(PING_TICKS));

  readonly chartDlData = computed(() => this.buildDualChart(this._historyDl(), COLOR_DL));
  readonly chartUlData = computed(() => this.buildDualChart(this._historyUl(), COLOR_UL));
  readonly chartPingData = computed(() => this.buildPingChart(this._historyPing(), '#4facfe'));

  // ===== Chart options for the speed cards =====
  // The left Y axis (speed) is color-coded per card (blue for DL, red for UL),
  // and the right Y axis (loaded latency) is always dark gray.
  readonly chartDlOptions = this.buildDualOptions(COLOR_DL, COLOR_LAT);
  readonly chartUlOptions = this.buildDualOptions(COLOR_UL, COLOR_LAT);

  // Chart options for the latency card: single Y axis (ms)
  readonly chartOptions = {
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

  constructor() {
    // Sample data on a fixed clock so the number of points matches the duration.
    // data() changes on every worker status (~200ms), so this effect re-runs often.
    effect(() => {
      const d = this.data();
      if (!this.running()) return;

      const now = Date.now();
      if (now - this.lastSampleAt < SpeedtestComponent.SAMPLE_INTERVAL_MS) return;
      this.lastSampleAt = now;

      const phase = this.activePhase();
      const cutoff = now - SpeedtestComponent.MAX_WINDOW_MS;

      if (phase === 'download') {
        const v = this.num(d.dlStatus);
        if (v <= 0) return;
        // Read instant loaded latency; keep last known value if missing this tick
        const inst = this.num(d.dlLoadedPingInst);
        if (inst > 0) this.lastDlLat = inst;
        this._historyDl.update((h) =>
          [...h, { t: now, v, lat: this.lastDlLat }].filter((s) => s.t >= cutoff)
        );
      } else if (phase === 'upload') {
        const v = this.num(d.ulStatus);
        if (v <= 0) return;
        const inst = this.num(d.ulLoadedPingInst);
        if (inst > 0) this.lastUlLat = inst;
        this._historyUl.update((h) =>
          [...h, { t: now, v, lat: this.lastUlLat }].filter((s) => s.t >= cutoff)
        );
      } else if (phase === 'ping') {
        // Use the instant idle latency to get one point per sample tick
        const v = this.num(d.pingInst) || this.num(d.pingStatus);
        if (v <= 0) return;
        this._historyPing.update((h) =>
          [...h, { t: now, v }].filter((s) => s.t >= cutoff)
        );
      }
    });
  }

  async ngOnInit(): Promise<void> {
    this.settings = await this.speedtest.loadSettings();
    await this.serverService.loadServers();
    await this.serverService.selectBestServer();
  }

  ngOnDestroy(): void {
    this.speedtest.abort();
  }

  private buildTestOrder(): string {
    const parts: string[] = [];
    if (this.testPing()) parts.push('P');
    if (this.testDl()) parts.push('D');
    if (this.testUl()) parts.push('U');
    return 'I_' + parts.join('_');
  }

  onStartStop(): void {
    if (this.running()) {
      this.speedtest.abort();
    } else {
      if (!this.atLeastOneTest()) return;
      this._historyDl.set([]);
      this._historyUl.set([]);
      this._historyPing.set([]);
      this.lastSampleAt = 0; // reset sampling clock
      this.lastDlLat = null; // reset loaded latency memory
      this.lastUlLat = null;

      const runSettings: SpeedtestSettings = {
        ...this.settings,
        test_order: this.buildTestOrder(),
        time_dl_max: this.durationDl(),
        time_ul_max: this.durationUl(),
        count_ping: Math.max(1, this.durationPing() * 10),
      };
      this.speedtest.start(runSettings, this.selectedServer());
    }
  }

  toggleServerSelector(): void {
    this.showServerSelector.update((v) => !v);
  }
  openSettings(): void {
    this.showSettings.set(true);
  }
  onServerChange(server: SpeedtestServer): void {
    this.serverService.selectServer(server);
  }

  toggleDl(): void { this.collapsedDl.update((v) => !v); }
  toggleUl(): void { this.collapsedUl.update((v) => !v); }
  togglePing(): void { this.collapsedPing.update((v) => !v); }

  // ================= Geometry helpers =================
  private polar(radius: number, angleDeg: number): { x: number; y: number } {
    const a = (angleDeg * Math.PI) / 180;
    return { x: this.cx + radius * Math.cos(a), y: this.cy + radius * Math.sin(a) };
  }
  private arcPath(fromDeg: number, toDeg: number): string {
    const start = this.polar(this.r, fromDeg);
    const end = this.polar(this.r, toDeg);
    const largeArc = toDeg - fromDeg > 180 ? 1 : 0;
    return `M ${start.x} ${start.y} A ${this.r} ${this.r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
  }
  private valuePath(value: number, ticks: readonly number[]): string {
    const angle = this.startAngle + this.toFraction(value, ticks) * this.sweepAngle;
    return this.arcPath(this.startAngle, angle);
  }
  private toFraction(value: number, ticks: readonly number[]): number {
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
  private buildTicks(ticks: readonly number[]) {
    return ticks.map((val, i) => {
      const frac = i / (ticks.length - 1);
      const angle = this.startAngle + frac * this.sweepAngle;
      const outer = this.polar(this.r + 4, angle);
      const inner = this.polar(this.r - 8, angle);
      const label = this.polar(this.r + 20, angle);
      return {
        val: val >= 1000 ? '1G' : String(val),
        x1: inner.x, y1: inner.y, x2: outer.x, y2: outer.y,
        lx: label.x, ly: label.y,
      };
    });
  }

  // ================= Chart builders =================
  // Builds a shared chart-options object where axis tick colors match the units.
  // speedColor -> left Y axis (Mb/s), latColor -> right Y axis (Latency ms).
  private buildDualOptions(speedColor: string, latColor: string) {
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
          // Color-coded to the speed unit (blue for DL, red for UL)
          ticks: { color: speedColor },
          beginAtZero: true,
          title: { display: true, text: 'Mb/s', color: speedColor },
        },
        y1: {
          type: 'linear', position: 'right',
          grid: { drawOnChartArea: false },
          // Color-coded to the loaded-latency unit (dark gray)
          ticks: { color: latColor },
          beginAtZero: true,
          title: { display: true, text: 'Latency (ms)', color: latColor },
        },
      },
    };
  }

  // Speed chart with a second line for loaded latency (thin dark gray, no fill)
  private buildDualChart(h: DualSample[], color: string) {
    return {
      labels: h.map((s) => this.fmtClock(s.t)),
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
      ],
    };
  }

  // Idle latency chart with hoverable points
  private buildPingChart(h: SpeedSample[], color: string) {
    return {
      labels: h.map((s) => this.fmtClock(s.t)),
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

  // ================= Stats helpers (speed) =================
  private avg(h: { v: number }[]): number {
    return h.length ? h.reduce((a, b) => a + b.v, 0) / h.length : 0;
  }
  private median(h: { v: number }[]): number {
    const v = h.map((s) => s.v).sort((a, b) => a - b);
    if (!v.length) return 0;
    const mid = Math.floor(v.length / 2);
    return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
  }
  private max(h: { v: number }[]): number {
    return h.length ? Math.max(...h.map((s) => s.v)) : 0;
  }
  private min(h: { v: number }[]): number {
    return h.length ? Math.min(...h.map((s) => s.v)) : 0;
  }

  // ================= Stats helpers (loaded latency) =================
  // Extract only valid (non-null, > 0) loaded-latency values from a DualSample list.
  private latValues(h: DualSample[]): number[] {
    return h.map((s) => s.lat).filter((v): v is number => v !== null && v > 0);
  }
  private latMin(h: DualSample[]): number {
    const v = this.latValues(h);
    return v.length ? Math.min(...v) : 0;
  }
  private latAvg(h: DualSample[]): number {
    const v = this.latValues(h);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
  }
  private latMax(h: DualSample[]): number {
    const v = this.latValues(h);
    return v.length ? Math.max(...v) : 0;
  }
  // Jitter = spread of the loaded latency (max - min)
  private latJitter(h: DualSample[]): number {
    const v = this.latValues(h);
    return v.length < 2 ? 0 : Math.max(...v) - Math.min(...v);
  }

  // ================= Format helpers =================
  private num(value: string): number {
    const n = Number(value);
    return isNaN(n) ? 0 : n;
  }
  private fmt(value: string): string {
    if (!value) return '--';
    const n = Number(value);
    if (isNaN(n)) return value;
    return n < 10 ? n.toFixed(2) : n < 100 ? n.toFixed(1) : n.toFixed(0);
  }
  private fmtMetric(value: string): string {
    if (!value) return '--';
    const n = Number(value);
    return isNaN(n) ? value : n.toFixed(1);
  }
  fmtNum(n: number): string {
    return n < 10 ? n.toFixed(2) : n < 100 ? n.toFixed(1) : n.toFixed(0);
  }
  // Formats a latency value; shows "--" when there is no data yet
  fmtLat(n: number): string {
    return n > 0 ? n.toFixed(1) : '--';
  }
  private fmtClock(ts: number): string {
    const d = new Date(ts);
    const p = (x: number) => String(x).padStart(2, '0');
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }
}