import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-action-bar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './action-bar.component.html',
  styleUrl: './action-bar.component.scss',
})
export class ActionBarComponent {
  readonly label = input.required<string>();
  readonly icon = input.required<string>();
  readonly disabled = input<boolean>(false);
  readonly running = input<boolean>(false);

  readonly startStop = output<void>();
  readonly openSettings = output<void>();
}