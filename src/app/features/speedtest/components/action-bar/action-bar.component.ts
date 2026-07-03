import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';

@Component({
  selector: 'app-action-bar',
  standalone: true,
  imports: [CommonModule, ButtonModule, TooltipModule],
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