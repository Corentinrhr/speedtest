import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Button } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { SpeedtestService } from '@core/services/speedtest.service';
import { ServerService } from '@core/services/server.service';
import { SpeedtestSettings, TestState } from '@core/models/speedtest.model';
import { SpeedtestServer } from '@core/models/server.model';
import { GaugeComponent } from './components/gauge/gauge.component';
import { ServerSelectorComponent } from './components/server-selector/server-selector.component';

@Component({
  selector: 'app-speedtest',
  standalone: true,
  imports: [
    CommonModule,
    Button,
    Dialog,
    GaugeComponent,
    ServerSelectorComponent,
  ],
  templateUrl: './speedtest.component.html',
  styleUrl: './speedtest.component.scss',
})
export class SpeedtestComponent implements OnInit, OnDestroy {
  private readonly speedtest = inject(SpeedtestService);
  private readonly serverService = inject(ServerService);

  private settings: SpeedtestSettings = {};
  private animFrameId = 0;

  readonly data = this.speedtest.data;
  readonly running = this.speedtest.running;
  readonly finished = this.speedtest.finished;
  readonly servers = this.serverService.servers;
  readonly selectedServer = this.serverService.selectedServer;
  readonly serversLoading = this.serverService.loading;

  readonly showPrivacyDialog = signal(false);
  readonly showShareDialog = signal(false);
  readonly telemetryEnabled = signal(false);

  readonly buttonLabel = computed(() => {
    if (this.serversLoading()) return 'Loading...';
    if (this.running()) return 'Abort';
    if (this.finished()) return 'Restart';
    return "Let's start";
  });

  readonly buttonDisabled = computed(
    () => this.serversLoading() && !this.running()
  );

  readonly isDownloading = computed(
    () => this.data().testState === TestState.DOWNLOAD
  );
  readonly isUploading = computed(
    () => this.data().testState === TestState.UPLOAD
  );
  readonly gaugesEnabled = computed(
    () => this.running() || this.finished()
  );
  readonly showPingJitter = computed(
    () => !!this.data().pingStatus && !!this.data().jitterStatus
  );
  readonly canShare = computed(
    () =>
      this.finished() && this.telemetryEnabled() && !!this.data().testId
  );

  readonly shareUrl = computed(() => {
    const testId = this.data().testId;
    if (!testId) return '';
    const base = window.location.href.substring(
      0,
      window.location.href.lastIndexOf('/')
    );
    return `${base}/results/?id=${testId}`;
  });

  readonly formatPing = computed(() => this.formatNumber(this.data().pingStatus));
  readonly formatJitter = computed(() =>
    this.formatNumber(this.data().jitterStatus)
  );

  async ngOnInit(): Promise<void> {
    this.settings = await this.speedtest.loadSettings();

    if (
      this.settings['telemetry_level'] &&
      this.settings['telemetry_level'] !== 'off' &&
      this.settings['telemetry_level'] !== 'disabled'
    ) {
      this.telemetryEnabled.set(true);
    }

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
      this.speedtest.start(this.settings, this.selectedServer());
    }
  }

  onServerChange(server: SpeedtestServer): void {
    this.serverService.selectServer(server);
  }

  async copyShareLink(): Promise<void> {
    const url = this.shareUrl();
    if (url && navigator.clipboard) {
      await navigator.clipboard.writeText(url);
    }
  }

  private formatNumber(value: string): string {
    if (!value) return '00';
    const n = Number(value);
    if (isNaN(n)) return value;
    if (n < 10) return n.toFixed(2);
    if (n < 100) return n.toFixed(1);
    return n.toFixed(0);
  }
}