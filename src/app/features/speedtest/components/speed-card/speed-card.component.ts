import { Component, computed, input, model } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CardModule } from 'primeng/card';
import { ChartModule } from 'primeng/chart';
import { GaugeComponent } from '../gauge/gauge.component';
import { fmtNum, fmtLat } from '../../shared/format.util';
import {
  DualSample, COLOR_DL, COLOR_UL, COLOR_LAT,
  buildDualChart, buildDualOptions,
} from '../../shared/chart-options.util';

const SPEED_TICKS = [0, 1, 10, 50, 100, 1000] as const;

export interface SpeedStats {
  min: number; avg: number; median: number; max: number;
  latMin: number; latAvg: number; latMax: number; latJitter: number;
}

type SpeedKind = 'dl' | 'ul';

@Component({
  selector: 'app-speed-card',
  standalone: true,
  imports: [CommonModule, CardModule, ChartModule, GaugeComponent],
  templateUrl: './speed-card.component.html',
  styleUrl: './speed-card.component.scss',
})
export class SpeedCardComponent {
  // 'dl' or 'ul' -> drives title, icon, colors and gauge variant.
  readonly kind = input.required<SpeedKind>();
  readonly current = input.required<number>();
  readonly progress = input.required<number>();
  readonly history = input.required<DualSample[]>();
  readonly stats = input.required<SpeedStats>();
  readonly showResults = input<boolean>(false);

  // Collapsed state is two-way bound so the parent can persist it if needed.
  readonly collapsed = model<boolean>(false);

  readonly speedTicks = SPEED_TICKS;

  readonly isDl = computed(() => this.kind() === 'dl');
  readonly title = computed(() => (this.isDl() ? 'Download Speed' : 'Upload Speed'));
  readonly headIcon = computed(() => (this.isDl() ? 'pi-arrow-down' : 'pi-arrow-up'));
  readonly iconClass = computed(() => (this.isDl() ? 'dl' : 'ul'));
  readonly cardClass = computed(() => (this.isDl() ? 'card-download' : 'card-upload'));
  readonly kpiClass = computed(() => (this.isDl() ? 'dl' : 'ul'));
  readonly kpiPrefix = computed(() => (this.isDl() ? 'DL' : 'UL'));

  private readonly color = computed(() => (this.isDl() ? COLOR_DL : COLOR_UL));

  readonly chartData = computed(() => buildDualChart(this.history(), this.color()));
  readonly chartOptions = computed(() => buildDualOptions(this.color(), COLOR_LAT));

  fmtNum = fmtNum;
  fmtLat = fmtLat;

  toggle(): void {
    this.collapsed.update((v) => !v);
  }
}