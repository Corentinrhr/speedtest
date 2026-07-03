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

  // Previous running state, used to detect transitions (start of test).
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
        // Collapse to free space.
        if (running && !this.wasRunning) {
          this.sidebarCollapsed.set(true);
        }

        // NOTE: we intentionally do NOT auto-expand the sidebar when the
        // test ends. The sidebar keeps whatever position it currently has,
        // so the user stays in control of its state.

        this.wasRunning = running;
      });
    });
  }

  toggleSidebar(): void {
    // Manual toggle: the user is always in control of the sidebar position.
    this.sidebarCollapsed.update((v) => !v);
  }
}