import {
  Component, OnInit, OnDestroy, inject, signal, computed, effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { ChartModule } from 'primeng/chart';
import { FormsModule } from '@angular/forms';
import { SpeedtestService } from '@core/services/speedtest.service';
import { ServerService } from '@core/services/server.service';
import { SpeedtestSettings, TestState } from '@core/models/speedtest.model';
import { SpeedtestServer } from '@core/models/server.model';
import { ServerSelectorComponent } from '@shared/components/server-selector/server-selector.component';

interface SpeedSample { t: number; v: number; }

const GAUGE_TICKS = [0, 1, 10, 50, 100, 1000] as const;

@Component({
  selector: 'app-speedtest',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ButtonModule, CardModule,
    ChartModule, ServerSelectorComponent,
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

  private static readonly MAX_WINDOW_MS = 5 * 60 * 1000;
  private readonly _history = signal<SpeedSample[]>([]);

  // Gauge geometry
  readonly gaugeTicks = GAUGE_TICKS;
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
    () => this.serversLoading() && !this.running()
  );
  readonly showResults = computed(() => this.running() || this.finished());

  readonly activePhase = computed<'download' | 'upload' | 'ping' | 'idle'>(() => {
    switch (this.data().testState) {
      case TestState.DOWNLOAD: return 'download';
      case TestState.UPLOAD: return 'upload';
      case TestState.PING_JITTER: return 'ping';
      case TestState.FINISHED: return 'download';
      default: return 'idle';
    }
  });

  readonly gaugeLabel = computed(() => {
    switch (this.activePhase()) {
      case 'upload': return 'Upload Speed';
      case 'ping': return 'Ping';
      default: return 'Download Speed';
    }
  });

  readonly gaugeProgress = computed(() => {
    const d = this.data();
    switch (this.activePhase()) {
      case 'download': return Math.round(d.dlProgress * 100);
      case 'upload': return Math.round(d.ulProgress * 100);
      case 'ping': return Math.round(d.pingProgress * 100);
      default: return this.finished() ? 100 : 0;
    }
  });

  readonly currentSpeed = computed(() => {
    const d = this.data();
    const raw = this.activePhase() === 'upload' ? d.ulStatus : d.dlStatus;
    const n = Number(raw);
    return isNaN(n) ? 0 : n;
  });

  readonly avgSpeed = computed(() => {
    const h = this._history();
    return h.length ? h.reduce((a, b) => a + b.v, 0) / h.length : 0;
  });
  readonly medianSpeed = computed(() => {
    const v = this._history().map((s) => s.v).sort((a, b) => a - b);
    if (!v.length) return 0;
    const mid = Math.floor(v.length / 2);
    return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
  });
  readonly maxSpeed = computed(() => {
    const h = this._history();
    return h.length ? Math.max(...h.map((s) => s.v)) : 0;
  });

  readonly downloadSpeed = computed(() => this.fmt(this.data().dlStatus));
  readonly uploadSpeed = computed(() => this.fmt(this.data().ulStatus));
  readonly ping = computed(() => this.fmtMetric(this.data().pingStatus));
  readonly jitter = computed(() => this.fmtMetric(this.data().jitterStatus));

  readonly gaugeBgPath = computed(() =>
    this.arcPath(this.startAngle, this.startAngle + this.sweepAngle)
  );
  readonly gaugeValueAngle = computed(() =>
    this.startAngle + this.speedToFraction(this.currentSpeed()) * this.sweepAngle
  );
  readonly gaugeValuePath = computed(() =>
    this.arcPath(this.startAngle, this.gaugeValueAngle())
  );

  readonly gaugeTickMarks = computed(() =>
    GAUGE_TICKS.map((val, i) => {
      const frac = i / (GAUGE_TICKS.length - 1);
      const angle = this.startAngle + frac * this.sweepAngle;
      const outer = this.polar(this.r + 4, angle);
      const inner = this.polar(this.r - 8, angle);
      const label = this.polar(this.r + 20, angle);
      return {
        val: val >= 1000 ? '1G' : String(val),
        x1: inner.x, y1: inner.y, x2: outer.x, y2: outer.y,
        lx: label.x, ly: label.y,
      };
    })
  );

  readonly chartData = computed(() => {
    const h = this._history();
    return {
      labels: h.map((s) => this.fmtClock(s.t)),
      datasets: [{
        data: h.map((s) => s.v),
        borderColor: '#4f46e5',
        backgroundColor: 'rgba(79, 70, 229, 0.08)',
        fill: true, tension: 0.4, pointRadius: 0, borderWidth: 2.5,
      }],
    };
  });

  readonly chartOptions = {
    maintainAspectRatio: false,
    animation: { duration: 250 },
    plugins: { legend: { display: false }, tooltip: { enabled: true } },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: '#94a3b8', maxTicksLimit: 8, autoSkip: true },
      },
      y: {
        grid: { color: 'rgba(148,163,184,0.12)' },
        ticks: { color: '#94a3b8' },
        beginAtZero: true,
      },
    },
  };

  constructor() {
    // allowSignalWrites requis : on écrit _history depuis un effect
    effect(() => {
      const running = this.running();
      const v = this.currentSpeed();
      if (!running || v <= 0) return;
      const now = Date.now();
      this._history.update((h) => {
        const cutoff = now - SpeedtestComponent.MAX_WINDOW_MS;
        return [...h, { t: now, v }].filter((s) => s.t >= cutoff);
      });
    }, { allowSignalWrites: true });
  }

  async ngOnInit(): Promise<void> {
    this.settings = await this.speedtest.loadSettings();
    await this.serverService.loadServers();
    await this.serverService.selectBestServer();
  }

  ngOnDestroy(): void {
    this.speedtest.abort();
  }

  onStartStop(): void {
    if (this.running()) {
      this.speedtest.abort();
    } else {
      this._history.set([]);
      this.speedtest.start(this.settings, this.selectedServer());
    }
  }

  toggleServerSelector(): void {
    this.showServerSelector.update((v) => !v);
  }
  onServerChange(server: SpeedtestServer): void {
    this.serverService.selectServer(server);
  }

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
  private speedToFraction(speed: number): number {
    if (speed <= GAUGE_TICKS[0]) return 0;
    const last = GAUGE_TICKS.length - 1;
    if (speed >= GAUGE_TICKS[last]) return 1;
    for (let i = 1; i <= last; i++) {
      if (speed <= GAUGE_TICKS[i]) {
        const segFrac = (speed - GAUGE_TICKS[i - 1]) / (GAUGE_TICKS[i] - GAUGE_TICKS[i - 1]);
        return (i - 1 + segFrac) / last;
      }
    }
    return 1;
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
  private fmtClock(ts: number): string {
    const d = new Date(ts);
    const p = (x: number) => String(x).padStart(2, '0');
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }
}