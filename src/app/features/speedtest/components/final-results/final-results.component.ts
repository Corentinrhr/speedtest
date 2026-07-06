import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface ResultMetric {
  avg: number;
  median: number;
}

@Component({
  selector: 'app-final-results',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './final-results.component.html',
  styleUrl: './final-results.component.scss',
})
export class FinalResultsComponent {
  readonly download = input<ResultMetric>({ avg: 0, median: 0 });
  readonly upload = input<ResultMetric>({ avg: 0, median: 0 });
  readonly ping = input<ResultMetric>({ avg: 0, median: 0 });
  readonly jitter = input<ResultMetric>({ avg: 0, median: 0 });

  // Packet loss percentages: idle (ping), download, upload.
  readonly downloadLoss = input<number>(0);
  readonly uploadLoss = input<number>(0);
  readonly idleLoss = input<number>(0);

  readonly testDate = input<Date>(new Date());

  fmt(n: number | undefined | null): string {
    if (n === undefined || n === null || isNaN(n) || n <= 0) return '--';
    return n < 10 ? n.toFixed(2) : n < 100 ? n.toFixed(1) : n.toFixed(0);
  }

  fmtLoss(n: number | undefined | null): string {
    if (n === undefined || n === null || isNaN(n)) return '--';
    return n.toFixed(n < 10 ? 1 : 0);
  }

  fmtDate(d: Date | undefined | null): string {
    const dd = d ?? new Date();
    const p = (x: number) => String(x).padStart(2, '0');
    return (
      `${p(dd.getDate())}/${p(dd.getMonth() + 1)}/${dd.getFullYear()} ` +
      `${p(dd.getHours())}:${p(dd.getMinutes())}:${p(dd.getSeconds())}`
    );
  }
}