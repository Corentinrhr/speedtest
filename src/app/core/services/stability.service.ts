import { Injectable, signal, NgZone, inject } from '@angular/core';
import {
  StabilityData,
  StabilityPingPoint,
} from '@core/models/speedtest.model';
import { SpeedtestServer } from '@core/models/server.model';
import { environment } from '@env/environment';

@Injectable({ providedIn: 'root' })
export class StabilityService {
  private readonly zone = inject(NgZone);

  private worker: Worker | null = null;
  private updater: ReturnType<typeof setInterval> | null = null;

  private readonly _data = signal<StabilityData | null>(null);
  private readonly _allPingData = signal<StabilityPingPoint[]>([]);
  private readonly _running = signal(false);

  readonly data = this._data.asReadonly();
  readonly allPingData = this._allPingData.asReadonly();
  readonly running = this._running.asReadonly();

  start(
    duration: number,
    server?: SpeedtestServer | null,
    externalTarget?: string
  ): void {
    if (this._running()) return;

    this._running.set(true);
    this._data.set(null);
    this._allPingData.set([]);

    const settings: Record<string, unknown> = {
      duration,
      ping_allowPerformanceApi: true,
    };

    if (externalTarget) {
      settings['url_ping_external'] = externalTarget;
    } else if (server) {
      let serverUrl = server.server;
      if (serverUrl.startsWith('//')) serverUrl = location.protocol + serverUrl;
      if (!serverUrl.endsWith('/')) serverUrl += '/';
      settings['url_ping'] = serverUrl + server.pingURL;
      settings['mpot'] = true;
    }

    this.worker = new Worker(
      `${environment.stabilityWorkerPath}?r=${Math.random()}`
    );

    this.worker.onmessage = (e: MessageEvent) => {
      this.zone.run(() => {
        const data: StabilityData = JSON.parse(e.data);
        this._data.set(data);

        if (data.pingData?.length > 0) {
          this._allPingData.update((prev) => [...prev, ...data.pingData]);
        }

        if (data.testState >= 4) {
          this.cleanup();
          this._running.set(false);
        }
      });
    };

    this.updater = setInterval(() => {
      this.worker?.postMessage('status');
    }, 200);

    this.worker.postMessage('start ' + JSON.stringify(settings));
  }

  abort(): void {
    if (!this._running()) return;
    this.worker?.postMessage('abort');
  }

  reset(): void {
    this.abort();
    this._data.set(null);
    this._allPingData.set([]);
  }

  private cleanup(): void {
    if (this.updater) {
      clearInterval(this.updater);
      this.updater = null;
    }
    if (this.worker) {
      setTimeout(() => {
        this.worker?.terminate();
        this.worker = null;
      }, 500);
    }
  }
}