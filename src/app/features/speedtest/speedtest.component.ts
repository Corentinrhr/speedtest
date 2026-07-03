import {
  Component, OnInit, OnDestroy, inject, signal, computed, effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { CardModule } from 'primeng/card';

import { SpeedtestService } from '@core/services/speedtest.service';
import { ServerService } from '@core/services/server.service';
import { SpeedtestSettings, TestState } from '@core/models/speedtest.model';
import { SpeedtestServer } from '@core/models/server.model';
import { ServerSelectorComponent } from '@shared/components/server-selector/server-selector.component';

// Sub-components
import { ActionBarComponent } from './components/action-bar/action-bar.component';
import { LatencyCardComponent, PingStats } from './components/latency-card/latency-card.component';
import { SpeedCardComponent, SpeedStats } from './components/speed-card/speed-card.component';
import { FinalResultsComponent } from './components/final-results/final-results.component';
import { SettingsDialogComponent } from './components/settings-dialog/settings-dialog.component';

// Shared helpers
import { DualSample, SpeedSample } from './shared/chart-options.util';
import {
  num, fmt, fmtMetric, avg, median, max, min,
  latMin, latAvg, latMax, latJitter,
} from './shared/format.util';

type Phase = 'download' | 'upload' | 'ping';

@Component({
  selector: 'app-speedtest',
  standalone: true,
  imports: [
    CommonModule,
    CardModule,
    ServerSelectorComponent,
    ActionBarComponent,
    LatencyCardComponent,
    SpeedCardComponent,
    FinalResultsComponent,
    SettingsDialogComponent,
  ],
  templateUrl: './speedtest.component.html',
  styleUrl: './speedtest.component.scss',
})
export class SpeedtestComponent implements OnInit, OnDestroy {
  private readonly speedtest = inject(SpeedtestService);
  private readonly serverService = inject(ServerService);

  private settings: SpeedtestSettings = {};

  // ── Service state ──
  readonly data = this.speedtest.data;
  readonly running = this.speedtest.running;
  readonly finished = this.speedtest.finished;
  readonly servers = this.serverService.servers;
  readonly selectedServer = this.serverService.selectedServer;
  readonly serversLoading = this.serverService.loading;

  readonly showServerSelector = signal(false);

  // ── Collapsed state (owned here, two-way bound to the cards) ──
  readonly collapsedDl = signal(false);
  readonly collapsedUl = signal(false);
  readonly collapsedPing = signal(false);

  // ── Settings dialog state (two-way bound to the dialog) ──
  readonly showSettings = signal(false);
  readonly testPing = signal(true);
  readonly testDl = signal(true);
  readonly testUl = signal(true);
  readonly durationDl = signal(15);
  readonly durationUl = signal(15);
  readonly durationPing = signal(5);

  // ── Sampling internals ──
  private static readonly MAX_WINDOW_MS = 5 * 60 * 1000;
  private static readonly SAMPLE_INTERVAL_MS = 250;

  private readonly _historyDl = signal<DualSample[]>([]);
  private readonly _historyUl = signal<DualSample[]>([]);
  private readonly _historyPing = signal<SpeedSample[]>([]);

  private lastSampleAt = 0;
  private lastDlLat: number | null = null;
  private lastUlLat: number | null = null;

  // Expose history to the template.
  readonly historyDl = this._historyDl.asReadonly();
  readonly historyUl = this._historyUl.asReadonly();
  readonly historyPing = this._historyPing.asReadonly();

  // ── Action bar ──
  readonly buttonLabel = computed(() => {
    if (this.serversLoading()) return 'Loading...';
    if (this.running()) return 'Abort';
    if (this.finished()) return 'Restart';
    return 'Start Test';
  });
  readonly buttonIcon = computed(() =>
    this.running() ? 'pi-stop' : 'pi-play'
  );
  readonly buttonDisabled = computed(
    () => (this.serversLoading() && !this.running()) || !this.atLeastOneTest()
  );

  readonly showResults = computed(() => this.running() || this.finished());
  readonly atLeastOneTest = computed(
    () => this.testPing() || this.testDl() || this.testUl()
  );

  // ── Current phase (drives which history gets sampled) ──
  readonly activePhase = computed<Phase | 'idle'>(() => {
    switch (this.data().testState) {
      case TestState.DOWNLOAD: return 'download';
      case TestState.UPLOAD: return 'upload';
      case TestState.PING_JITTER: return 'ping';
      default: return 'idle';
    }
  });

  // ── Live values for the gauges ──
  readonly currentDl = computed(() => num(this.data().dlStatus));
  readonly currentUl = computed(() => num(this.data().ulStatus));
  readonly currentPing = computed(() => num(this.data().pingStatus));

  readonly dlProgress = computed(() => Math.round(this.data().dlProgress * 100));
  readonly ulProgress = computed(() => Math.round(this.data().ulProgress * 100));
  readonly pingProgress = computed(() => Math.round(this.data().pingProgress * 100));

  // ── Aggregated stats passed to the cards ──
  readonly dlStats = computed<SpeedStats>(() => ({
    min: min(this._historyDl()),
    avg: avg(this._historyDl()),
    median: median(this._historyDl()),
    max: max(this._historyDl()),
    latMin: latMin(this._historyDl()),
    latAvg: latAvg(this._historyDl()),
    latMax: latMax(this._historyDl()),
    latJitter: latJitter(this._historyDl()),
  }));

  readonly ulStats = computed<SpeedStats>(() => ({
    min: min(this._historyUl()),
    avg: avg(this._historyUl()),
    median: median(this._historyUl()),
    max: max(this._historyUl()),
    latMin: latMin(this._historyUl()),
    latAvg: latAvg(this._historyUl()),
    latMax: latMax(this._historyUl()),
    latJitter: latJitter(this._historyUl()),
  }));

  readonly pingStats = computed<PingStats>(() => ({
    min: min(this._historyPing()),
    avg: avg(this._historyPing()),
    median: median(this._historyPing()),
    max: max(this._historyPing()),
    jitter: this.jitterStr(),
  }));

  // ── Final results ──
  readonly downloadSpeed = computed(() => fmt(this.data().dlStatus));
  readonly uploadSpeed = computed(() => fmt(this.data().ulStatus));
  readonly ping = computed(() => fmtMetric(this.data().pingStatus));

  // Jitter (idle) = spread of the idle latency history.
  private jitterStr(): string {
    const vals = this._historyPing().map((s) => s.v).filter((v) => v > 0);
    if (vals.length < 2) return '--';
    return (Math.max(...vals) - Math.min(...vals)).toFixed(1);
  }
  readonly jitter = computed(() => this.jitterStr());

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
        const v = num(d.dlStatus);
        if (v <= 0) return;
        const inst = num(d.dlLoadedPingInst);
        if (inst > 0) this.lastDlLat = inst;
        this._historyDl.update((h) =>
          [...h, { t: now, v, lat: this.lastDlLat }].filter((s) => s.t >= cutoff)
        );
      } else if (phase === 'upload') {
        const v = num(d.ulStatus);
        if (v <= 0) return;
        const inst = num(d.ulLoadedPingInst);
        if (inst > 0) this.lastUlLat = inst;
        this._historyUl.update((h) =>
          [...h, { t: now, v, lat: this.lastUlLat }].filter((s) => s.t >= cutoff)
        );
      } else if (phase === 'ping') {
        const v = num(d.pingInst) || num(d.pingStatus);
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

  // ── Test lifecycle ──
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
      return;
    }
    if (!this.atLeastOneTest()) return;

    // Reset histories + sampling state.
    this._historyDl.set([]);
    this._historyUl.set([]);
    this._historyPing.set([]);
    this.lastSampleAt = 0;
    this.lastDlLat = null;
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

  openSettings(): void {
    this.showSettings.set(true);
  }

  onServerChange(server: SpeedtestServer): void {
    this.serverService.selectServer(server);
  }
}