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
import { FormsModule } from '@angular/forms';
import { SpeedtestService } from '@core/services/speedtest.service';
import { ServerService } from '@core/services/server.service';
import { SpeedtestSettings, TestState } from '@core/models/speedtest.model';
import { SpeedtestServer } from '@core/models/server.model';
import { ServerSelectorComponent } from '@shared/components/server-selector/server-selector.component';

interface SpeedSample { t: number; v: number; }

// Echelles des gauges : Mb/s pour dl/ul, ms pour la latence
const SPEED_TICKS = [0, 1, 10, 50, 100, 1000] as const;
const PING_TICKS = [0, 5, 20, 50, 100, 300] as const;

type Phase = 'download' | 'upload' | 'ping';

@Component({
  selector: 'app-speedtest',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ButtonModule, CardModule,
    ChartModule, DialogModule, CheckboxModule, SliderModule,
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

  // ---- Etat pliage des cartes ----
  readonly collapsedDl = signal(false);
  readonly collapsedUl = signal(false);
  readonly collapsedPing = signal(false);

  // ---- Dialog settings ----
  readonly showSettings = signal(false);
  readonly testPing = signal(true);   // latence a vide
  readonly testDl = signal(true);     // download
  readonly testUl = signal(true);     // upload
  readonly durationDl = signal(15);   // secondes
  readonly durationUl = signal(15);
  readonly durationPing = signal(5);

  private static readonly MAX_WINDOW_MS = 5 * 60 * 1000;

  // Un historique par phase
  private readonly _historyDl = signal<SpeedSample[]>([]);
  private readonly _historyUl = signal<SpeedSample[]>([]);
  private readonly _historyPing = signal<SpeedSample[]>([]);

  // Geometrie de la gauge (partagee)
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

  // Au moins un type de test doit etre coche
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

  // ---- Progression par phase ----
  readonly dlProgress = computed(() => Math.round(this.data().dlProgress * 100));
  readonly ulProgress = computed(() => Math.round(this.data().ulProgress * 100));
  readonly pingProgress = computed(() => Math.round(this.data().pingProgress * 100));

  // ---- Valeur courante par phase ----
  readonly currentDl = computed(() => this.num(this.data().dlStatus));
  readonly currentUl = computed(() => this.num(this.data().ulStatus));
  readonly currentPing = computed(() => this.num(this.data().pingStatus));

  // ---- Latence sous charge (loaded latency) ----
  readonly dlLoadedPing = computed(() => this.fmtMetric(this.data().dlLoadedPing));
  readonly dlLoadedJitter = computed(() => this.fmtMetric(this.data().dlLoadedJitter));
  readonly ulLoadedPing = computed(() => this.fmtMetric(this.data().ulLoadedPing));
  readonly ulLoadedJitter = computed(() => this.fmtMetric(this.data().ulLoadedJitter));

  // ---- Stats Download ----
  readonly avgDl = computed(() => this.avg(this._historyDl()));
  readonly medianDl = computed(() => this.median(this._historyDl()));
  readonly maxDl = computed(() => this.max(this._historyDl()));

  // ---- Stats Upload ----
  readonly avgUl = computed(() => this.avg(this._historyUl()));
  readonly medianUl = computed(() => this.median(this._historyUl()));
  readonly maxUl = computed(() => this.max(this._historyUl()));

  // ---- Stats Ping ----
  readonly avgPing = computed(() => this.avg(this._historyPing()));
  readonly medianPing = computed(() => this.median(this._historyPing()));
  readonly maxPing = computed(() => this.max(this._historyPing()));

  // ---- Valeurs finales formatees ----
  readonly downloadSpeed = computed(() => this.fmt(this.data().dlStatus));
  readonly uploadSpeed = computed(() => this.fmt(this.data().ulStatus));
  readonly ping = computed(() => this.fmtMetric(this.data().pingStatus));
  readonly jitter = computed(() => this.fmtMetric(this.data().jitterStatus));

  // ---- Fond de gauge (identique pour toutes) ----
  readonly gaugeBgPath = computed(() =>
    this.arcPath(this.startAngle, this.startAngle + this.sweepAngle)
  );

  // ---- Gauges par phase ----
  readonly gaugeDlPath = computed(() =>
    this.valuePath(this.currentDl(), SPEED_TICKS)
  );
  readonly gaugeUlPath = computed(() =>
    this.valuePath(this.currentUl(), SPEED_TICKS)
  );
  readonly gaugePingPath = computed(() =>
    this.valuePath(this.currentPing(), PING_TICKS)
  );

  // ---- Ticks (calcules une fois par echelle) ----
  readonly speedTickMarks = computed(() => this.buildTicks(SPEED_TICKS));
  readonly pingTickMarks = computed(() => this.buildTicks(PING_TICKS));

  // ---- Donnees de graphe par phase ----
  readonly chartDlData = computed(() => this.buildChart(this._historyDl(), '#4f46e5'));
  readonly chartUlData = computed(() => this.buildChart(this._historyUl(), '#f5576c'));
  readonly chartPingData = computed(() => this.buildChart(this._historyPing(), '#4facfe'));

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
    // Enregistre la valeur courante dans le bon historique selon la phase
    effect(() => {
      if (!this.running()) return;
      const phase = this.activePhase();
      const now = Date.now();

      const push = (sig: typeof this._historyDl, v: number) => {
        if (v <= 0) return;
        sig.update((h) => {
          const cutoff = now - SpeedtestComponent.MAX_WINDOW_MS;
          return [...h, { t: now, v }].filter((s) => s.t >= cutoff);
        });
      };

      if (phase === 'download') push(this._historyDl, this.currentDl());
      else if (phase === 'upload') push(this._historyUl, this.currentUl());
      else if (phase === 'ping') push(this._historyPing, this.currentPing());
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

  // ---- Construit le test_order a partir des cases cochees ----
  private buildTestOrder(): string {
    // I = IP (toujours), puis les phases selectionnees separees par _
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

      const runSettings: SpeedtestSettings = {
        ...this.settings,
        test_order: this.buildTestOrder(),
        time_dl_max: this.durationDl(),
        time_ul_max: this.durationUl(),
        // count_ping approx : ~1 ping toutes les 100ms => durationPing * 10
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

  // ---- Pliage des cartes ----
  toggleDl(): void { this.collapsedDl.update((v) => !v); }
  toggleUl(): void { this.collapsedUl.update((v) => !v); }
  togglePing(): void { this.collapsedPing.update((v) => !v); }

  // ================= Helpers geometrie =================
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
  private buildChart(h: SpeedSample[], color: string) {
    return {
      labels: h.map((s) => this.fmtClock(s.t)),
      datasets: [{
        data: h.map((s) => s.v),
        borderColor: color,
        backgroundColor: color + '14',
        fill: true, tension: 0.4, pointRadius: 0, borderWidth: 2.5,
      }],
    };
  }

  // ================= Helpers stats =================
  private avg(h: SpeedSample[]): number {
    return h.length ? h.reduce((a, b) => a + b.v, 0) / h.length : 0;
  }
  private median(h: SpeedSample[]): number {
    const v = h.map((s) => s.v).sort((a, b) => a - b);
    if (!v.length) return 0;
    const mid = Math.floor(v.length / 2);
    return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
  }
  private max(h: SpeedSample[]): number {
    return h.length ? Math.max(...h.map((s) => s.v)) : 0;
  }

  // ================= Helpers format =================
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
  private fmtClock(ts: number): string {
    const d = new Date(ts);
    const p = (x: number) => String(x).padStart(2, '0');
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }
}