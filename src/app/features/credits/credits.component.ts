import { Component } from '@angular/core';
import { CardModule } from 'primeng/card';

@Component({
  selector: 'app-credits',
  standalone: true,
  imports: [CardModule],
  templateUrl: './credits.component.html',
  styleUrl: './credits.component.scss',
})
export class CreditsComponent {}