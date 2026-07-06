import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface ResultMetric {
  avg: number;
  median: number;
}

// Jitter uses a different pair of stats: max spread + median of successive diffs.
export interface JitterMetric {
  max: number;
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
  readonly download = input.required<ResultMetric>();
  readonly upload = input.required<ResultMetric>();
  readonly ping = input.required<ResultMetric>();
  readonly jitter = input.required<JitterMetric>();

  // Timestamp of when the test finished (defaults to "now" if not provided).
  readonly testDate = input<Date>(new Date());

  // Format helper: "--" when no data.
  fmt(n: number): string {
    if (!n || n <= 0) return '--';
    return n < 10 ? n.toFixed(2) : n < 100 ? n.toFixed(1) : n.toFixed(0);
  }

  // Format the test date as "DD/MM/YYYY HH:mm:ss".
  fmtDate(d: Date): string {
    const p = (x: number) => String(x).padStart(2, '0');
    return (
      `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ` +
      `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
    );
  }
}