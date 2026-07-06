import { Component, model, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { CheckboxModule } from 'primeng/checkbox';
import { SliderModule } from 'primeng/slider';
import { InputNumberModule } from 'primeng/inputnumber';

@Component({
  selector: 'app-settings-dialog',
  standalone: true,
  imports: [
    CommonModule, FormsModule, DialogModule,
    CheckboxModule, SliderModule, InputNumberModule,
  ],
  templateUrl: './settings-dialog.component.html',
  styleUrl: './settings-dialog.component.scss',
})
export class SettingsDialogComponent {
  // All state is two-way bound so the parent owns the source of truth.
  readonly visible = model<boolean>(false);
  readonly testPing = model<boolean>(true);
  readonly testDl = model<boolean>(true);
  readonly testUl = model<boolean>(true);
  readonly durationPing = model<number>(5);
  readonly durationDl = model<number>(15);
  readonly durationUl = model<number>(15);

  // Loaded latency: measures latency under load during DL/UL. Enabled by default.
  readonly loadedLatency = model<boolean>(true);

  readonly atLeastOneTest = computed(
    () => this.testPing() || this.testDl() || this.testUl()
  );
}