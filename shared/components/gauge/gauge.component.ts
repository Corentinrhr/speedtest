import { Component, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-gauge',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './gauge.component.html',
  styleUrl: './gauge.component.scss',
})
export class GaugeComponent {
  readonly type = input.required<'download' | 'upload'>();
  readonly speed = input<string>('');
  readonly progress = input<number>(0);
  readonly enabled = input<boolean>(false);
  readonly oscillate = input<boolean>(false);

  readonly displaySpeed = computed(() => {
    const s = this.speed();
    if (!s) return '00';
    const n = Number(s);
    if (isNaN(n)) return s;
    if (n < 10) return n.toFixed(2);
    if (n < 100) return n.toFixed(1);
    return n.toFixed(0);
  });

  readonly speedRotation = computed(() => {
    const speed = Number(this.speed()) || 0;
    if (speed <= 0) return 0;

    const logMin = Math.log10(1);
    const logMax = Math.log10(10001);
    const logSpeed = Math.log10(speed + 1);

    const power = (logSpeed - logMin) / (logMax - logMin);
    const osc = this.oscillate()
      ? 1 + 0.01 * Math.sin(Date.now() / 100)
      : 1;
    return Math.max(0, Math.min(power * osc * 180, 180));
  });

  readonly progressRotation = computed(() => this.progress() * 180);
}