import { Component, signal } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';

/**
 * Pour ajouter un nouvel onglet dans la sidebar :
 * 1. Ajouter une entrée dans le tableau MENU_ITEMS ci-dessous
 * 2. Créer le composant dans features/
 * 3. Ajouter la route dans app.routes.ts
 * C'est tout !
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
  readonly menuItems = MENU_ITEMS;
  readonly sidebarCollapsed = signal(false);

  toggleSidebar(): void {
    this.sidebarCollapsed.update((v) => !v);
  }
}