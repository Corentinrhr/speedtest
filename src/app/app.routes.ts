import { Routes } from '@angular/router';
import { LayoutComponent } from '@shared/components/layout/layout.component';

export const routes: Routes = [
  {
    path: '',
    component: LayoutComponent,
    children: [
      {
        path: '',
        redirectTo: 'speedtest',
        pathMatch: 'full',
      },
      {
        path: 'speedtest',
        loadComponent: () =>
          import('@features/speedtest/speedtest.component').then(
            (m) => m.SpeedtestComponent
          ),
        data: { title: 'Speed Test' },
      },
      {
        path: 'stability',
        loadComponent: () =>
          import('@features/stability/stability.component').then(
            (m) => m.StabilityComponent
          ),
        data: { title: 'Stability Test' },
      },
      {
        path: 'credits',
        loadComponent: () =>
          import('@features/credits/credits.component').then(
            (m) => m.CreditsComponent
          ),
        data: { title: 'Credits' },
      },
    ],
  },
  {
    path: '**',
    redirectTo: 'speedtest',
  },
];