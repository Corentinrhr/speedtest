/*
	LibreSpeed Worker - Background pinger (loaded latency + packet loss under load).
*/

var bgPinger = {
  running: false,
  target: null,
  xhr: null,
  prevInstspd: 0,
  count: 0,      // total attempts (includes warm-up + grace)
  measured: 0,   // successful measured attempts past the grace window
  sent: 0,       // counted attempts (past warm-up + grace)
  lost: 0,       // counted losses
  ping: 0,
  jitter: 0,

  start: function (target) {
    this.running = true;
    this.target = target;
    this.prevInstspd = 0;
    this.count = 0;
    this.measured = 0;
    this.sent = 0;
    this.lost = 0;
    this.ping = 0;
    this.jitter = 0;

    if (target === "dl") {
      ST.dlLoadedPingInst = "";
      ST.dlPacketLoss = "";
      ST.dlLostInst = false;
      ST.dlLostCount = 0;
    } else if (target === "ul") {
      ST.ulLoadedPingInst = "";
      ST.ulPacketLoss = "";
      ST.ulLostInst = false;
      ST.ulLostCount = 0;
    }
    this._loop();
  },

  stop: function () {
    this.running = false;
    if (this.xhr) {
      try { this.xhr.abort(); } catch (e) {}
      this.xhr = null;
    }
  },

  // Number of non-counted attempts at the start of a phase:
  // 1 connection warm-up + N grace pings.
  _graceAttempts: function () {
    var g = settings.bgPinger_graceCount;
    if (typeof g !== "number" || g < 0) g = 0;
    return 1 + g;
  },

  // True while `count` is still within the warm-up + grace window.
  _inGraceWindow: function () {
    return this.count < this._graceAttempts();
  },

  _commitLoss: function () {
    const loss = this.sent > 0
      ? ((this.lost / this.sent) * 100).toFixed(2)
      : "0.00";
    if (this.target === "dl") {
      ST.dlPacketLoss = loss;
      ST.dlLostInst = true;
      ST.dlLostCount++;
    } else if (this.target === "ul") {
      ST.ulPacketLoss = loss;
      ST.ulLostInst = true;
      ST.ulLostCount++;
    }
  },

  _commit: function (instspd) {
    const p = this.ping.toFixed(2);
    const j = this.jitter.toFixed(2);
    const inst = instspd.toFixed(2);
    const loss = this.sent > 0
      ? ((this.lost / this.sent) * 100).toFixed(2)
      : "0.00";
    if (this.target === "dl") {
      ST.dlLoadedPing = p;
      ST.dlLoadedJitter = j;
      ST.dlLoadedPingInst = inst;
      ST.dlPacketLoss = loss;
    } else if (this.target === "ul") {
      ST.ulLoadedPing = p;
      ST.ulLoadedJitter = j;
      ST.ulLoadedPingInst = inst;
      ST.ulPacketLoss = loss;
    }
  },

  _scheduleNext: function (rttMs) {
    const delay = Math.max(0, settings.loadedLatency_interval - (rttMs || 0));
    setTimeout(this._loop.bind(this), delay);
  },

  _onLost: function () {
    if (!this.running) return;

    // Warm-up OR grace ping: never counted as a loss, just retried.
    if (this._inGraceWindow()) {
      this.count++;
      this.prevInstspd = 0;
      this._scheduleNext(0);
      return;
    }

    this.sent++;
    this.lost++;
    this.prevInstspd = 0;
    this._commitLoss();
    this._scheduleNext(0);
  },

  _loop: function () {
    if (!this.running) return;
    const prevT = new Date().getTime();
    let settled = false;

    const timeoutTimer = setTimeout(function () {
      if (settled || !this.running) return;
      settled = true;
      try { if (this.xhr) this.xhr.abort(); } catch (e) {}
      this._onLost();
    }.bind(this), settings.loadedLatency_timeout);

    this.xhr = new XMLHttpRequest();
    this.xhr.onload = function () {
      if (settled || !this.running) return;
      settled = true;
      clearTimeout(timeoutTimer);

      const rttEstimate = new Date().getTime() - prevT;

      // Warm-up / grace ping: prime the connection, do NOT measure or count.
      if (this._inGraceWindow()) {
        this.count++;
        // A successful grace ping still gives us a baseline for jitter.
        let instspd = refineWithPerformanceApi(rttEstimate);
        if (instspd < 1) instspd = 1;
        this.prevInstspd = instspd;
        this._scheduleNext(rttEstimate);
        return;
      }

      let instspd = refineWithPerformanceApi(rttEstimate);
      if (instspd < 1) instspd = this.prevInstspd;
      if (instspd < 1) instspd = 1;

      const instjitter = Math.abs(instspd - this.prevInstspd);

      // First MEASURED ping (past the grace window) seeds the ping value.
      if (this.measured === 0) {
        this.ping = instspd;
      } else {
        if (instspd < this.ping) this.ping = instspd;
        if (this.measured === 1) this.jitter = instjitter;
        else this.jitter = instjitter > this.jitter
          ? this.jitter * 0.3 + instjitter * 0.7
          : this.jitter * 0.8 + instjitter * 0.2;
      }

      this.prevInstspd = instspd;
      this.count++;
      this.measured++;
      this.sent++;
      this._commit(instspd);

      this._scheduleNext(new Date().getTime() - prevT);
    }.bind(this);

    this.xhr.onerror = function () {
      if (settled || !this.running) return;
      settled = true;
      clearTimeout(timeoutTimer);
      this._onLost();
    }.bind(this);

    this.xhr.open(
      "GET",
      settings.url_ping + url_sep(settings.url_ping) +
      (settings.mpot ? "cors=true&" : "") + "r=" + Math.random(),
      true
    );
    this.xhr.send();
  }
};