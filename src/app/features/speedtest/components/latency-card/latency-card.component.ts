import { Component, computed, input, model } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CardModule } from 'primeng/card';
import { ChartModule } from 'primeng/chart';
import { GaugeComponent } from '../gauge/gauge.component';
import { fmtNum } from '../../shared/format.util';
import {
  SpeedSample, buildPingChart, buildPingOptions,
} from '../../shared/chart-options.util';

const PING_TICKS = [0, 5, 20, 50, 100, 300] as const;

export interface PingStats {
  min: number; avg: number; median: number; max: number; jitter: string;
}

@Component({
  selector: 'app-latency-card',
  standalone: true,
  imports: [CommonModule, CardModule, ChartModule, GaugeComponent],
  templateUrl: './latency-card.component.html',
  styleUrl: './latency-card.component.scss',
})
export class LatencyCardComponent {
  readonly current = input.required<number>();
  readonly progress = input.required<number>();
  readonly history = input.required<SpeedSample[]>();
  readonly stats = input.required<PingStats>();
  readonly showResults = input<boolean>(false);

  readonly collapsed = model<boolean>(false);

  readonly pingTicks = PING_TICKS;

  readonly chartData = computed(() => buildPingChart(this.history(), '#4facfe'));
  readonly chartOptions = buildPingOptions();

  fmtNum = fmtNum;

  toggle(): void {
    this.collapsed.update((v) => !v);
  }
}