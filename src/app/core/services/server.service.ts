import { Injectable, signal, computed } from '@angular/core';
import { SpeedtestServer } from '@core/models/server.model';
import { environment } from '@env/environment';

@Injectable({ providedIn: 'root' })
export class ServerService {
  private readonly _servers = signal<SpeedtestServer[]>([]);
  private readonly _selectedServer = signal<SpeedtestServer | null>(null);
  private readonly _loading = signal(true);

  readonly servers = this._servers.asReadonly();
  readonly selectedServer = this._selectedServer.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly hasMultipleServers = computed(() => this._servers().length > 1);

  async loadServers(): Promise<void> {
    this._loading.set(true);
    try {
      const response = await fetch(
        `${environment.serverListUrl}?r=${Math.random()}`
      );
      const servers: SpeedtestServer[] = await response.json();
      if (Array.isArray(servers) && servers.length > 0) {
        this._servers.set(servers);
        if (servers.length === 1) {
          this._selectedServer.set(servers[0]);
        }
      }
    } catch (e) {
      console.error('Failed to load server list:', e);
      this._servers.set([]);
    } finally {
      this._loading.set(false);
    }
  }

  selectServer(server: SpeedtestServer): void {
    this._selectedServer.set(server);
  }

  /**
   * Ping a server and return the round-trip time in ms, or -1 on failure.
   */
  async pingServer(server: SpeedtestServer): Promise<number> {
    const baseUrl = this.joinUrl(server.server, server.pingURL);
    const url = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}cors=true&r=${Math.random()}`;

    return new Promise<number>((resolve) => {
      const xhr = new XMLHttpRequest();
      const t = Date.now();
      xhr.onload = () => resolve(Date.now() - t);
      xhr.onerror = () => resolve(-1);
      xhr.open('GET', url);
      try {
        xhr.timeout = 2000;
        xhr.ontimeout = () => resolve(-1);
      } catch {
        // timeout not supported
      }
      xhr.send();
    });
  }

  /**
   * Find the server with the lowest ping from the loaded list.
   */
  async selectBestServer(): Promise<SpeedtestServer | null> {
    const servers = this._servers();
    if (servers.length === 0) return null;
    if (servers.length === 1) {
      this._selectedServer.set(servers[0]);
      return servers[0];
    }

    const results = await Promise.all(
      servers.map(async (s) => {
        const rtt = await this.pingServer(s);
        return { server: { ...s, pingT: rtt }, rtt };
      })
    );

    // Update servers with ping times
    this._servers.set(results.map((r) => r.server));

    const reachable = results.filter((r) => r.rtt > 0);
    if (reachable.length === 0) return null;

    reachable.sort((a, b) => a.rtt - b.rtt);
    const best = reachable[0].server;
    this._selectedServer.set(best);
    return best;
  }

  private joinUrl(server: string, path: string): string {
    let base = server;
    if (base.startsWith('//')) {
      base = location.protocol + base;
    }
    if (!base.endsWith('/') && !path.startsWith('/')) {
      base += '/';
    }
    return base + path;
  }
}