import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-final-results',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './final-results.component.html',
  styleUrl: './final-results.component.scss',
})
export class FinalResultsComponent {
  readonly download = input.required<string>();
  readonly upload = input.required<string>();
  readonly ping = input.required<string>();
  readonly jitter = input.required<string>();
}