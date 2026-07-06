/*
	LibreSpeed Worker - Shared mutable state.

	Everything the main thread can observe lives on the `ST` namespace so that
	the different test modules read/write ONE single source of truth.

	The public postMessage payload (ST.snapshot()) is identical to the original
	worker, so speedtest.service.ts does not need any change.
*/

var ST = {
  // -1=not started, 0=starting, 1=download, 2=ping+jitter, 3=upload, 4=finished, 5=aborted
  testState: -1,

  dlStatus: "",
  ulStatus: "",
  pingStatus: "",
  jitterStatus: "",
  clientIp: "",

  dlProgress: 0,
  ulProgress: 0,
  pingProgress: 0,

  testId: null,

  // Loaded latency (under load) results.
  dlLoadedPing: "",
  dlLoadedJitter: "",
  ulLoadedPing: "",
  ulLoadedJitter: "",
  dlLoadedPingInst: "",
  ulLoadedPingInst: "",

  // Idle ping (pingTest).
  pingInst: "",

  // Packet loss under load (percentage 0-100 as string).
  dlPacketLoss: "",
  ulPacketLoss: "",
  dlLostInst: false,   // one-shot: a DL ping was just lost
  ulLostInst: false,   // one-shot: a UL ping was just lost
  dlLostCount: 0,      // cumulative (delta pattern)
  ulLostCount: 0,

  // Idle packet loss (pingTest).
  pingPacketLoss: "",
  pingLostInst: false, // one-shot: an idle ping was just lost
  pingLostCount: 0,    // cumulative (delta pattern)

  // Internals not sent to the main thread.
  xhr: null,
  interval: null,
  test_pointer: 0,

  // Guards so each phase runs only once.
  ipCalled: false,
  dlCalled: false,
  ulCalled: false,
  ptCalled: false,

  // ISP info captured by getIp, forwarded in telemetry.
  ispInfo: "",

  // Build the exact JSON payload historically sent to the main thread.
  snapshot: function () {
    return {
      testState: this.testState,
      dlStatus: this.dlStatus,
      ulStatus: this.ulStatus,
      pingStatus: this.pingStatus,
      clientIp: this.clientIp,
      jitterStatus: this.jitterStatus,
      dlProgress: this.dlProgress,
      ulProgress: this.ulProgress,
      pingProgress: this.pingProgress,
      testId: this.testId,
      dlLoadedPing: this.dlLoadedPing,
      dlLoadedJitter: this.dlLoadedJitter,
      ulLoadedPing: this.ulLoadedPing,
      ulLoadedJitter: this.ulLoadedJitter,
      dlLoadedPingInst: this.dlLoadedPingInst,
      ulLoadedPingInst: this.ulLoadedPingInst,
      pingInst: this.pingInst,
      dlPacketLoss: this.dlPacketLoss,
      ulPacketLoss: this.ulPacketLoss,
      dlLostInst: this.dlLostInst,
      ulLostInst: this.ulLostInst,
      dlLostCount: this.dlLostCount,
      ulLostCount: this.ulLostCount,
      pingPacketLoss: this.pingPacketLoss,
      pingLostInst: this.pingLostInst,
      pingLostCount: this.pingLostCount
    };
  },

  // Reset the one-shot "lost" flags AFTER they have been reported once, so the
  // main thread never double-counts a loss and stale flags cannot survive.
  resetOneShotFlags: function () {
    this.pingLostInst = false;
    this.dlLostInst = false;
    this.ulLostInst = false;
  },

  // Full reset used on abort.
  resetAll: function () {
    this.dlStatus = "";
    this.ulStatus = "";
    this.pingStatus = "";
    this.jitterStatus = "";
    this.clientIp = "";
    this.dlProgress = 0;
    this.ulProgress = 0;
    this.pingProgress = 0;
    this.dlLoadedPing = "";
    this.dlLoadedJitter = "";
    this.ulLoadedPing = "";
    this.ulLoadedJitter = "";
    this.dlLoadedPingInst = "";
    this.ulLoadedPingInst = "";
    this.pingInst = "";
    this.dlPacketLoss = "";
    this.ulPacketLoss = "";
    this.dlLostInst = false;
    this.ulLostInst = false;
    this.dlLostCount = 0;
    this.ulLostCount = 0;
    this.pingPacketLoss = "";
    this.pingLostInst = false;
    this.pingLostCount = 0;
  }
};