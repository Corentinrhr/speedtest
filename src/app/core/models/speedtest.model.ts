export enum TestState {
  NOT_STARTED = -1,
  STARTING = 0,
  DOWNLOAD = 1,
  PING_JITTER = 2,
  UPLOAD = 3,
  FINISHED = 4,
  ABORTED = 5,
}

export interface SpeedtestData {
  testState: TestState;
  dlStatus: string;
  ulStatus: string;
  pingStatus: string;
  jitterStatus: string;
  clientIp: string;
  dlProgress: number;
  ulProgress: number;
  pingProgress: number;
  testId: string | null;
  dlLoadedPing: string;
  dlLoadedJitter: string;
  ulLoadedPing: string;
  ulLoadedJitter: string;
  // Instant loaded latency, used to plot the real evolution on charts
  dlLoadedPingInst: string;
  ulLoadedPingInst: string;
  pingInst: string;
}

export interface SpeedtestSettings {
  [key: string]: unknown;
  telemetry_level?: string;
  test_order?: string;
  time_dl_max?: number;
  time_ul_max?: number;
  time_dlGraceTime?: number;
  time_ulGraceTime?: number;
  time_auto?: boolean;
}

export interface StabilityData {
  testState: number;
  currentPing: number;
  avgPing: number;
  minPing: number;
  maxPing: number;
  jitter: number;
  packetLoss: number;
  elapsed: number;
  duration: number;
  progress: number;
  pingData: StabilityPingPoint[];
  totalSamples: number;
  failedSamples: number;
}

export interface StabilityPingPoint {
  t: number;
  ping: number;
  lost: boolean;
}