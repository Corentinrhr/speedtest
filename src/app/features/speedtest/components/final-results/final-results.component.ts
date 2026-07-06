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
  readonly download = input.required<ResultMetric>();
  readonly upload = input.required<ResultMetric>();
  readonly ping = input.required<ResultMetric>();
  readonly jitter = input.required<ResultMetric>();

  // Format helper: "--" when no data.
  fmt(n: number): string {
    if (!n || n <= 0) return '--';
    return n < 10 ? n.toFixed(2) : n < 100 ? n.toFixed(1) : n.toFixed(0);
  }
}