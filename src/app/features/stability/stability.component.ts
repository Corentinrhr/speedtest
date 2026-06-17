import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { SelectModule } from 'primeng/select';
import { StabilityService } from '@core/services/stability.service';
import { ServerService } from '@core/services/server.service';
import { SpeedtestServer } from '@core/models/server.model';

interface DurationOption {
  label: string;
  value: number;
}

interface TargetOption {
  label: string;
  value: string;
}

@Component({
  selector: 'app-stability',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, CardModule, SelectModule],
  templateUrl: './stability.component.html',
  styleUrl: './stability.component.scss',
})
export class StabilityComponent implements OnInit, OnDestroy {
  private readonly stability = inject(StabilityService);
  private readonly serverService = inject(ServerService);

  readonly data = this.stability.data;
  readonly running = this.stability.running;
  readonly servers = this.serverService.servers;
  readonly selectedServer = this.serverService.selectedServer;
  readonly serversLoading = this.serverService.loading;

  readonly selectedDuration = signal<number>(60);
  readonly selectedTarget = signal<string>('');

  readonly durationOptions: DurationOption[] = [
    { label: '60 Seconds', value: 60 },
    { label: '90 Seconds', value: 90 },
    { label: '2 Minutes', value: 120 },
    { label: '5 Minutes', value: 300 },
  ];

  readonly targetOptions: TargetOption[] = [
    { label: 'Local Server', value: '' },
    { label: 'Google', value: 'https://www.google.com/generate_204' },
    { label: 'Cloudflare', value: 'https://www.cloudflare.com/cdn-cgi/trace' },
  ];

  readonly buttonLabel = computed(() => {
    if (this.running()) return 'Abort';
    return 'Start Stability Test';
  });

  readonly canStart = computed(() => {
    return !!this.selectedTarget() || !this.serversLoading();
  });

  readonly showResults = computed(() => {
    return this.data() !== null;
  });

  readonly rating = computed(() => {
    const d = this.data();
    if (!d || d.avgPing <= 0) return { text: '--', cssClass: 'neutral' };
    const avg = d.avgPing;
    const jit = d.jitter;
    const loss = d.packetLoss;
    if (avg < 30 && jit < 5 && loss < 0.5)
      return { text: 'Great', cssClass: 'great' };
    if (avg < 60 && jit < 15 && loss < 2)
      return { text: 'Good', cssClass: 'good' };
    if (avg < 100 && jit < 30 && loss < 5)
      return { text: 'Poor', cssClass: 'poor' };
    return { text: 'Bad', cssClass: 'bad' };
  });

  async ngOnInit(): Promise<void> {
    await this.serverService.loadServers();
    await this.serverService.selectBestServer();
  }

  ngOnDestroy(): void {
    this.stability.abort();
  }

  onStartStop(): void {
    if (this.running()) {
      this.stability.abort();
    } else {
      if (!this.canStart()) return;
      const target = this.selectedTarget();
      this.stability.start(
        this.selectedDuration(),
        target ? null : this.selectedServer(),
        target || undefined
      );
    }
  }

  onReset(): void {
    this.stability.reset();
  }

  onServerChange(server: SpeedtestServer): void {
    this.serverService.selectServer(server);
  }

  fmt(v: number | undefined): string {
    if (v === undefined || v === null || v <= 0) return '--';
    if (v < 10) return v.toFixed(2);
    if (v < 100) return v.toFixed(1);
    return v.toFixed(0);
  }

  fmtLoss(): string {
    const d = this.data();
    if (!d || d.totalSamples <= 0) return '--';
    return d.packetLoss.toFixed(1);
  }

  fmtTime(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  }
}