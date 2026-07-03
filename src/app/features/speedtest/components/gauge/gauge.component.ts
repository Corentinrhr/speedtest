import { Component, computed, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { fmtNum } from '../../shared/format.util';
import {
  gaugeBgPath, valuePath, buildTicks, TickMark,
} from '../../shared/gauge.util';

type GaugeVariant = 'dl' | 'ul' | 'ping';

@Component({
  selector: 'app-gauge',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './gauge.component.html',
  styleUrl: './gauge.component.scss',
})
export class GaugeComponent {
  // Current value shown in the middle of the gauge.
  readonly value = input.required<number>();
  // Completion percentage (0-100) shown above the gauge.
  readonly progress = input<number>(0);
  // Unit label under the center value (e.g. "ms" or "Mb/s").
  readonly unit = input<string>('');
  // Tick scale used to place the arc + tick marks.
  readonly ticks = input.required<readonly number[]>();
  // Visual variant -> selects the gradient (dl / ul / ping).
  readonly variant = input<GaugeVariant>('dl');

  readonly bgPath = computed(() => gaugeBgPath());
  readonly valPath = computed(() => valuePath(this.value(), this.ticks()));
  readonly tickMarks = computed<TickMark[]>(() => buildTicks(this.ticks()));

  readonly gradientId = computed(() => 'grad-' + this.variant());
  readonly arcClass = computed(() => 'grad-' + this.variant());

  fmtNum = fmtNum;
}