import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Select } from 'primeng/select';
import { SpeedtestServer } from '@core/models/server.model';

@Component({
  selector: 'app-server-selector',
  standalone: true,
  imports: [CommonModule, FormsModule, Select],
  templateUrl: './server-selector.component.html',
  styleUrl: './server-selector.component.scss',
})
export class ServerSelectorComponent {
  readonly servers = input.required<SpeedtestServer[]>();
  readonly selectedServer = input<SpeedtestServer | null>(null);
  readonly disabled = input<boolean>(false);
  readonly loading = input<boolean>(false);

  readonly serverChange = output<SpeedtestServer>();

  onServerSelect(server: SpeedtestServer): void {
    this.serverChange.emit(server);
  }
}