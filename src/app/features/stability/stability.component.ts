import {
  Component,
  OnInit,
  OnDestroy,
  AfterViewInit,
  inject,
  signal,
  computed,
  viewChild,
  ElementRef,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Button } from 'primeng/button';
import { Select } from 'primeng/select';
import { Slider } from 'primeng/slider';
import { Toast } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { StabilityService } from '@core/services/stability.service';
import { ServerService } from '@core/services/server.service';
import { StabilityPingPoint } from '@core/models/speedtest.model';
import { SpeedtestServer } from '@core/models/server.model';

interface DurationOption {
  label: string;
  value: number;
}

interface TargetOption {
  label: string;
  value: string;
}

interface Rating {
  text: string;
  cssClass: string;
}

@Component({
  selector: 'app-stability',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    Button,
    Select,
    Slider,
    Toast,
  ],
  providers: [MessageService],
  templateUrl: './stability.component.html',
  styleUrl: './stability.component.scss',
})
export class StabilityComponent implements OnInit, OnDestroy, AfterViewInit {
  private readonly stability = inject(StabilityService);
  private readonly serverService = inject(ServerService);
  private readonly messageService = inject(MessageService);

  private animFrameId = 0;
  private audioCtx: AudioContext | null = null;
  private lastBeepTime = 0;

  readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('pingChart');

  // Services signals
  readonly data = this.stability.data;
  readonly allPingData = this.stability.allPingData;
  readonly running = this.stability.running;
  readonly servers = this.serverService.servers;
  readonly selectedServer = this.serverService.selectedServer;
  readonly serversLoading = this.serverService.loading;

  // Local state
  readonly selectedDuration = signal<number>(60);
  readonly selectedTarget = signal<string>('');
  readonly alertThreshold = signal<number>(0);

  readonly durationOptions: DurationOption[] = [
    { label: '60 Seconds', value: 60 },
    { label: '90 Seconds', value: 90 },
    { label: '2 Minutes', value: 120 },
    { label: '3 Minutes', value: 180 },
    { label: '5 Minutes', value: 300 },
  ];

  readonly targetOptions: TargetOption[] = [
    { label: 'Local Server', value: '' },
    { label: 'Google', value: 'https://www.google.com/generate_204' },
    { label: 'Cloudflare', value: 'https://www.cloudflare.com/cdn-cgi/trace' },
    { label: 'Apple', value: 'https://www.apple.com/library/test/success.html' },
  ];

  readonly thresholdLabel = computed(() => {
    const v = this.alertThreshold();
    return v > 0 ? `${v} ms` : 'Off';
  });

  readonly rating = computed<Rating>(() => {
    const d = this.data();
    if (!d || d.avgPing <= 0) return { text: '--', cssClass: 'none' };
    const avg = d.avgPing;
    const jit = d.jitter;
    const loss = d.packetLoss;
    if (avg < 30 && jit < 5 && loss < 0.5)
      return { text: 'Great', cssClass: 'great' };
    if (avg < 60 && jit < 15 && loss < 2)
      return { text: 'Good', cssClass: 'good' };
    if (avg < 100 && jit < 30 && loss < 5)
      return { text: 'Poor', cssClass: 'poor' };
    return { text: 'Bad', cssClass: 'bad' };
  });

  readonly buttonLabel = computed(() => {
    if (this.serversLoading() && !this.selectedTarget()) return 'Finding...';
    if (this.running()) return 'Abort';
    return 'Start';
  });

  readonly canStart = computed(() => {
    return !!this.selectedTarget() || !this.serversLoading();
  });

  // Effect to check alert threshold
  private thresholdEffect = effect(() => {
    const d = this.data();
    const threshold = this.alertThreshold();
    if (d && threshold > 0 && d.currentPing > threshold) {
      this.playBeep();
      this.messageService.add({
        severity: 'warn',
        summary: 'Latency Alert',
        detail: `Ping ${d.currentPing.toFixed(0)}ms exceeds threshold of ${threshold}ms`,
        life: 2000,
      });
    }
  });

  async ngOnInit(): Promise<void> {
    await this.serverService.loadServers();
    await this.serverService.selectBestServer();
  }

  ngAfterViewInit(): void {
    this.startRenderLoop();
  }

  ngOnDestroy(): void {
    this.stability.abort();
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
    }
  }

  onStartStop(): void {
    if (this.running()) {
      this.stability.abort();
    } else {
      if (!this.canStart()) return;
      const target = this.selectedTarget();
      this.stability.start(
        this.selectedDuration(),
        target ? null : this.selectedServer(),
        target || undefined
      );
    }
  }

  onReset(): void {
    this.stability.reset();
  }

  onServerChange(server: SpeedtestServer): void {
    this.serverService.selectServer(server);
  }

  downloadCsv(): void {
    const pingData = this.allPingData();
    if (pingData.length === 0) return;

    let csv = 'elapsed_s,ping_ms,failed\n';
    for (const d of pingData) {
      csv += `${d.t.toFixed(3)},${d.ping.toFixed(2)},${d.lost ? '1' : '0'}\n`;
    }

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stability_test_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // === Formatting helpers ===

  fmt(v: number | undefined): string {
    if (v === undefined || v === null || v <= 0) return '--';
    if (v < 10) return v.toFixed(2);
    if (v < 100) return v.toFixed(1);
    return v.toFixed(0);
  }

  fmtTime(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  }

  fmtLoss(): string {
    const d = this.data();
    if (!d || d.totalSamples <= 0) return '--';
    return d.packetLoss.toFixed(1);
  }

  // === Chart rendering ===

  private startRenderLoop(): void {
    const render = () => {
      this.drawChart();
      this.animFrameId = requestAnimationFrame(render);
    };
    this.animFrameId = requestAnimationFrame(render);
  }

  private drawChart(): void {
    const canvasEl = this.canvasRef();
    if (!canvasEl) return;
    const canvas = canvasEl.nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dp = window.devicePixelRatio || 1;
    const cw = canvas.clientWidth * dp;
    const ch = canvas.clientHeight * dp;
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }
    ctx.clearRect(0, 0, cw, ch);

    const VISIBLE_SECONDS = 60;
    const padL = 50 * dp;
    const padR = 15 * dp;
    const padT = 15 * dp;
    const padB = 30 * dp;
    const plotW = cw - padL - padR;
    const plotH = ch - padT - padB;

    // Theme colors
    const isDark = true; // always dark theme
    const lineColor = isDark ? '#9090FF' : '#6060AA';
    const fillColor = isDark
      ? 'rgba(144,144,255,0.15)'
      : 'rgba(96,96,170,0.15)';
    const gridColor = isDark ? '#404040' : '#E0E0E0';
    const textColor = isDark ? '#A0A0A0' : '#808080';
    const lostColor = '#e74c3c';
    const thresholdColor = 'rgba(231,76,60,0.6)';

    const data = this.allPingData();

    // Time window
    let maxTime = 0;
    if (data.length > 0) maxTime = data[data.length - 1].t;
    let timeStart: number;
    let timeEnd: number;
    if (maxTime <= VISIBLE_SECONDS) {
      timeStart = 0;
      timeEnd = Math.max(VISIBLE_SECONDS, maxTime);
    } else {
      timeEnd = maxTime;
      timeStart = maxTime - VISIBLE_SECONDS;
    }

    // Binary search for first visible point
    let lo = 0;
    let hi = data.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (data[mid].t < timeStart) lo = mid + 1;
      else hi = mid - 1;
    }
    const visStart = lo;

    // Y-axis scale
    let yMax = 50;
    for (let i = visStart; i < data.length && data[i].t <= timeEnd; i++) {
      if (!data[i].lost && data[i].ping > yMax) yMax = data[i].ping;
    }
    yMax = Math.ceil((yMax * 1.2) / 10) * 10;

    const fontSize = 11 * dp;
    ctx.font = `${fontSize}px sans-serif`;
    ctx.textBaseline = 'middle';

    // Horizontal grid
    const ySteps = this.getYSteps(yMax);
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = dp;
    ctx.fillStyle = textColor;
    ctx.textAlign = 'right';
    for (const yVal of ySteps) {
      if (yVal > yMax) continue;
      const y = padT + plotH - (yVal / yMax) * plotH;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + plotW, y);
      ctx.stroke();
      ctx.fillText(`${yVal}`, padL - 5 * dp, y);
    }

    // Vertical grid (time ticks)
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const timeSpan = timeEnd - timeStart;
    const tickInterval = timeSpan <= 60 ? 10 : timeSpan <= 120 ? 15 : 30;
    const firstTick = Math.ceil(timeStart / tickInterval) * tickInterval;
    for (let t = firstTick; t <= timeEnd; t += tickInterval) {
      const x = padL + ((t - timeStart) / timeSpan) * plotW;
      ctx.beginPath();
      ctx.strokeStyle = gridColor;
      ctx.moveTo(x, padT);
      ctx.lineTo(x, padT + plotH);
      ctx.stroke();
      ctx.fillStyle = textColor;
      ctx.fillText(this.fmtTime(t), x, padT + plotH + 4 * dp);
    }

    // Axis label
    ctx.fillStyle = textColor;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText('ms', padL - 5 * dp, padT - 2 * dp);

    // Plot border
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = dp;
    ctx.strokeRect(padL, padT, plotW, plotH);

    // Alert threshold line
    const threshold = this.alertThreshold();
    if (threshold > 0 && threshold <= yMax) {
      const threshY = padT + plotH - (threshold / yMax) * plotH;
      ctx.save();
      ctx.setLineDash([6 * dp, 4 * dp]);
      ctx.strokeStyle = thresholdColor;
      ctx.lineWidth = 1.5 * dp;
      ctx.beginPath();
      ctx.moveTo(padL, threshY);
      ctx.lineTo(padL + plotW, threshY);
      ctx.stroke();
      ctx.restore();
    }

    if (data.length < 2) return;

    // Visible data
    const visible: StabilityPingPoint[] = [];
    for (let i = visStart; i < data.length && data[i].t <= timeEnd; i++) {
      visible.push(data[i]);
    }
    if (visible.length < 1) return;

    // Filled area
    ctx.beginPath();
    let started = false;
    for (const pt of visible) {
      if (pt.lost) continue;
      const px = padL + ((pt.t - timeStart) / timeSpan) * plotW;
      const py = padT + plotH - (pt.ping / yMax) * plotH;
      if (!started) {
        ctx.moveTo(px, padT + plotH);
        ctx.lineTo(px, py);
        started = true;
      } else {
        ctx.lineTo(px, py);
      }
    }
    if (started) {
      for (let i = visible.length - 1; i >= 0; i--) {
        if (!visible[i].lost) {
          const px = padL + ((visible[i].t - timeStart) / timeSpan) * plotW;
          ctx.lineTo(px, padT + plotH);
          break;
        }
      }
      ctx.closePath();
      ctx.fillStyle = fillColor;
      ctx.fill();
    }

    // Line
    ctx.beginPath();
    started = false;
    for (const pt of visible) {
      if (pt.lost) {
        started = false;
        continue;
      }
      const px = padL + ((pt.t - timeStart) / timeSpan) * plotW;
      const py = padT + plotH - (pt.ping / yMax) * plotH;
      if (!started) {
        ctx.moveTo(px, py);
        started = true;
      } else {
        ctx.lineTo(px, py);
      }
    }
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2 * dp;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Failed markers
    for (const pt of visible) {
      if (!pt.lost) continue;
      const px = padL + ((pt.t - timeStart) / timeSpan) * plotW;
      ctx.beginPath();
      ctx.arc(px, padT + plotH - 10 * dp, 3 * dp, 0, Math.PI * 2);
      ctx.fillStyle = lostColor;
      ctx.fill();
    }
  }

  private getYSteps(yMax: number): number[] {
    if (yMax <= 50) return [10, 20, 30, 40, 50];
    if (yMax <= 100) return [20, 40, 60, 80, 100];
    if (yMax <= 200) return [50, 100, 150, 200];
    if (yMax <= 500) return [100, 200, 300, 400, 500];
    const step = Math.ceil(yMax / 5 / 100) * 100;
    const steps: number[] = [];
    for (let v = step; v <= yMax; v += step) steps.push(v);
    return steps;
  }

  private playBeep(): void {
    const now = Date.now();
    if (now - this.lastBeepTime < 2000) return;
    this.lastBeepTime = now;
    try {
      if (!this.audioCtx) {
        this.audioCtx = new (window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext)();
      }
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.frequency.value = 800;
      gain.gain.value = 0.3;
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start();
      osc.stop(this.audioCtx.currentTime + 0.1);
    } catch {
      // audio not available
    }
  }
}