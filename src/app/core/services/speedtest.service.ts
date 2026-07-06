import { Injectable, signal, NgZone, inject } from '@angular/core';
import {
  SpeedtestData,
  SpeedtestSettings,
  TestState,
} from '@core/models/speedtest.model';
import { SpeedtestServer } from '@core/models/server.model';
import { environment } from '@env/environment';

/**
 * Angular wrapper around the speedtest_worker.js Web Worker.
 * Communicates via postMessage, same protocol as the original speedtest.js.
 */
@Injectable({ providedIn: 'root' })
export class SpeedtestService {
  private readonly zone = inject(NgZone);

  private worker: Worker | null = null;
  private updater: ReturnType<typeof setInterval> | null = null;

  private readonly _data = signal<SpeedtestData>(this.emptyData());
  private readonly _running = signal(false);
  private readonly _finished = signal(false);

  readonly data = this._data.asReadonly();
  readonly running = this._running.asReadonly();
  readonly finished = this._finished.asReadonly();

  /**
   * Start a speed test with the given settings and optional server.
   */
  start(
    settings: SpeedtestSettings = {},
    server?: SpeedtestServer | null
  ): void {
    if (this._running()) return;

    this._running.set(true);
    this._finished.set(false);
    this._data.set(this.emptyData());

    const workerSettings: Record<string, unknown> = { ...settings };

    if (server) {
      let serverUrl = server.server;
      if (serverUrl.startsWith('//')) {
        serverUrl = location.protocol + serverUrl;
      }
      if (!serverUrl.endsWith('/')) serverUrl += '/';

      workerSettings['url_dl'] = serverUrl + server.dlURL;
      workerSettings['url_ul'] = serverUrl + server.ulURL;
      workerSettings['url_ping'] = serverUrl + server.pingURL;
      workerSettings['url_getIp'] = serverUrl + server.getIpURL;
      workerSettings['mpot'] = true;
    }

    this.worker = new Worker(
      `${environment.workerPath}?r=${Math.random()}`
    );

    this.worker.onmessage = (e: MessageEvent) => {
      this.zone.run(() => {
        const data: SpeedtestData = JSON.parse(e.data);
        this._data.set(data);

        if (data.testState >= TestState.FINISHED) {
          this.cleanup();
          this._running.set(false);
          this._finished.set(true);
        }
      });
    };

    this.updater = setInterval(() => {
      this.worker?.postMessage('status');
    }, 200);

    this.worker.postMessage('start ' + JSON.stringify(workerSettings));
  }

  /**
   * Abort a running test.
   */
  abort(): void {
    if (!this._running()) return;
    this.worker?.postMessage('abort');
  }

  /**
   * Load settings from the server's settings.json.
   */
  async loadSettings(): Promise<SpeedtestSettings> {
    try {
      const response = await fetch(environment.settingsUrl);
      const settings = await response.json();
      return settings as SpeedtestSettings;
    } catch {
      console.warn('Could not load settings.json, using defaults');
      return {};
    }
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

  private emptyData(): SpeedtestData {
    return {
      testState: TestState.NOT_STARTED,
      dlStatus: '',
      ulStatus: '',
      pingStatus: '',
      jitterStatus: '',
      clientIp: '',
      dlProgress: 0,
      ulProgress: 0,
      pingProgress: 0,
      testId: null,
      dlLoadedPing: '',
      dlLoadedJitter: '',
      ulLoadedPing: '',
      ulLoadedJitter: '',
      dlLoadedPingInst: '',
      ulLoadedPingInst: '',
      pingInst: '',
      // Packet loss under load (DL/UL)
      dlPacketLoss: '',
      ulPacketLoss: '',
      dlLostInst: false,
      ulLostInst: false,
      // >>> Idle packet loss (during ping/jitter test) <<<
      pingPacketLoss: '',
      pingLostInst: false,
    };
  }
}