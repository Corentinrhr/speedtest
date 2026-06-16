import { Component } from '@angular/core';
import { LayoutComponent } from '@shared/components/layout/layout.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [LayoutComponent],
  template: `<app-layout />`,
})
export class AppComponent {}