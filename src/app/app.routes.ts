import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('@features/speedtest/speedtest.component').then(
        (m) => m.SpeedtestComponent
      ),
  },
  {
    path: 'stability',
    loadComponent: () =>
      import('@features/stability/stability.component').then(
        (m) => m.StabilityComponent
      ),
  },
  {
    path: '**',
    redirectTo: '',
  },
];