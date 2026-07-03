import { Component, signal, inject, effect, untracked } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { SpeedtestService } from '@core/services/speedtest.service';

/**
 * To add a new tab to the sidebar:
 * 1. Add an entry to the MENU_ITEMS array below
 * 2. Create the component in features/
 * 3. Add the route in app.routes.ts
 * That's it!
 */

interface MenuItem {
  label: string;
  icon: string;
  route: string;
}

const MENU_ITEMS: MenuItem[] = [
  { label: 'Speed Test', icon: 'pi pi-bolt', route: '/speedtest' },
  { label: 'Stability Test', icon: 'pi pi-chart-line', route: '/stability' },
  { label: 'Credits', icon: 'pi pi-info-circle', route: '/credits' },
];

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    ButtonModule,
  ],
  templateUrl: './layout.component.html',
  styleUrl: './layout.component.scss',
})
export class LayoutComponent {
  // Access the running state of the speed test to auto-collapse the sidebar.
  private readonly speedtest = inject(SpeedtestService);

  readonly menuItems = MENU_ITEMS;
  readonly sidebarCollapsed = signal(false);

  // Remembers whether the CURRENT collapse was triggered automatically by a
  // test. Only an auto-collapse gets auto-expanded at the end, so a manual
  // choice by the user is never overridden.
  private autoCollapsed = false;

  // Previous running state, used to detect transitions (start / end of test).
  private wasRunning = false;

  constructor() {
    // IMPORTANT: this effect depends ONLY on `running()`.
    // We never READ `sidebarCollapsed()` here, otherwise writing it would
    // re-trigger the effect and fight against the manual toggle button.
    // All writes are wrapped in `untracked()` for the same reason.
    effect(() => {
      const running = this.speedtest.running();

      untracked(() => {
        // Transition NOT running -> running : a test just started.
        if (running && !this.wasRunning) {
          // Collapse to free space (remember it was automatic).
          this.sidebarCollapsed.set(true);
          this.autoCollapsed = true;
        }

        // Transition running -> NOT running : the test just ended.
        if (!running && this.wasRunning) {
          // Auto-expand ONLY if WE collapsed it automatically.
          if (this.autoCollapsed) {
            this.sidebarCollapsed.set(false);
            this.autoCollapsed = false;
          }
        }

        this.wasRunning = running;
      });
    });
  }

  toggleSidebar(): void {
    // Manual toggle always wins. It also clears the auto-collapse flag so the
    // sidebar won't be automatically re-expanded against the user's wish.
    this.sidebarCollapsed.update((v) => !v);
    this.autoCollapsed = false;
  }
}