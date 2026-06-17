import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { SpeedtestService } from '@core/services/speedtest.service';
import { ServerService } from '@core/services/server.service';
import { SpeedtestSettings, TestState } from '@core/models/speedtest.model';
import { SpeedtestServer } from '@core/models/server.model';
import { ServerSelectorComponent } from '@shared/components/server-selector/server-selector.component';

@Component({
  selector: 'app-speedtest',
  standalone: true,
  imports: [CommonModule, ButtonModule, CardModule, ServerSelectorComponent],
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

  readonly buttonLabel = computed(() => {
    if (this.serversLoading()) return 'Loading...';
    if (this.running()) return 'Abort';
    if (this.finished()) return 'Restart';
    return 'Start Test';
  });

  readonly buttonIcon = computed(() => {
    if (this.running()) return 'pi pi-stop';
    return 'pi pi-play';
  });

  readonly buttonSeverity = computed(() => {
    if (this.running()) return 'danger' as const;
    return 'primary' as const;
  });

  readonly buttonDisabled = computed(
    () => this.serversLoading() && !this.running()
  );

  readonly showResults = computed(
    () => this.running() || this.finished()
  );

  readonly downloadSpeed = computed(() => this.formatSpeed(this.data().dlStatus));
  readonly uploadSpeed = computed(() => this.formatSpeed(this.data().ulStatus));
  readonly ping = computed(() => this.formatMetric(this.data().pingStatus));
  readonly jitter = computed(() => this.formatMetric(this.data().jitterStatus));

  readonly currentPhase = computed(() => {
    const state = this.data().testState;
    switch (state) {
      case TestState.STARTING:
        return 'Initializing...';
      case TestState.DOWNLOAD:
        return 'Testing Download...';
      case TestState.PING_JITTER:
        return 'Testing Ping...';
      case TestState.UPLOAD:
        return 'Testing Upload...';
      case TestState.FINISHED:
        return 'Test Complete';
      case TestState.ABORTED:
        return 'Test Aborted';
      default:
        return '';
    }
  });

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
      this.speedtest.start(this.settings, this.selectedServer());
    }
  }

  onServerChange(server: SpeedtestServer): void {
    this.serverService.selectServer(server);
  }

  private formatSpeed(value: string): string {
    if (!value) return '--';
    const n = Number(value);
    if (isNaN(n)) return value;
    if (n < 10) return n.toFixed(2);
    if (n < 100) return n.toFixed(1);
    return n.toFixed(0);
  }

  private formatMetric(value: string): string {
    if (!value) return '--';
    const n = Number(value);
    if (isNaN(n)) return value;
    return n.toFixed(1);
  }
}