/*
	LibreSpeed Worker - Settings: defaults, custom-settings parsing, browser quirks.
*/

// Global settings object (read everywhere). Overridable via the start command.
var settings = {
  mpot: false,
  test_order: "IP_D_U",
  time_ul_max: 15,
  time_dl_max: 15,
  time_auto: true,
  time_ulGraceTime: 3,
  time_dlGraceTime: 1.5,
  count_ping: 10,
  url_dl: "backend/garbage.php",
  url_ul: "backend/empty.php",
  url_ping: "backend/empty.php",
  url_getIp: "backend/getIP.php",
  getIp_ispInfo: true,
  getIp_ispInfo_distance: "km",
  xhr_dlMultistream: 6,
  xhr_ulMultistream: 3,
  xhr_multistreamDelay: 300,
  xhr_ignoreErrors: 1,
  xhr_dlUseBlob: false,
  xhr_ul_blob_megabytes: 20,
  garbagePhp_chunkSize: 100,
  enable_quirks: true,
  ping_allowPerformanceApi: true,
  overheadCompensationFactor: 1.06,
  useMebibits: false,
  telemetry_level: 0,
  url_telemetry: "results/telemetry.php",
  telemetry_extra: "",
  forceIE11Workaround: false,
  loadedLatency: true,
  loadedLatency_interval: 100,
  loadedLatency_timeout: 2000,
  // Timeout above which an idle ping is counted as lost.
  idlePing_timeout: 2000,
  // >>> BUG FIX: number of initial loaded-latency pings ignored for loss/stats
  //     at the start of each DL/UL phase, ON TOP of the connection warm-up.
  //     This prevents the first measured ping (fired right when the link gets
  //     saturated, especially in UPLOAD) from being wrongly counted as lost.
  bgPinger_graceCount: 1
};

var Settings = {
  // Parse the "start {json}" command payload and apply browser quirks.
  applyFromMessage: function (rawMessage) {
    try {
      let s = {};
      try {
        const ss = rawMessage.substring(5); // strip "start"
        if (ss) s = JSON.parse(ss);
      } catch (e) {
        twarn("Error parsing custom settings JSON. Please check your syntax");
      }

      for (let key in s) {
        if (typeof settings[key] !== "undefined") settings[key] = s[key];
        else twarn("Unknown setting ignored: " + key);
      }

      this._applyQuirks(s);

      if (typeof s.telemetry_level !== "undefined") {
        settings.telemetry_level =
          s.telemetry_level === "basic" ? 1 :
          s.telemetry_level === "full" ? 2 :
          s.telemetry_level === "debug" ? 3 : 0;
      }

      settings.test_order = settings.test_order.toUpperCase();
    } catch (e) {
      twarn(
        "Possible error in custom test settings. Some settings might not have been applied. Exception: " + e
      );
    }
  },

  _applyQuirks: function (s) {
    const ua = navigator.userAgent;

    if (settings.enable_quirks || (typeof s.enable_quirks !== "undefined" && s.enable_quirks)) {
      if (/Firefox.(\d+\.\d+)/i.test(ua)) {
        if (typeof s.ping_allowPerformanceApi === "undefined") {
          settings.ping_allowPerformanceApi = false;
        }
      }
      if (/Edge.(\d+\.\d+)/i.test(ua)) {
        if (typeof s.xhr_dlMultistream === "undefined") {
          settings.xhr_dlMultistream = 3;
        }
      }
      if (/Chrome.(\d+)/i.test(ua) && !!self.fetch) {
        if (typeof s.xhr_dlMultistream === "undefined") {
          settings.xhr_dlMultistream = 5;
        }
      }
    }

    if (/Edge.(\d+\.\d+)/i.test(ua)) settings.forceIE11Workaround = true;
    if (/PlayStation 4.(\d+\.\d+)/i.test(ua)) settings.forceIE11Workaround = true;
    if (/Chrome.(\d+)/i.test(ua) && /Android|iPhone|iPad|iPod|Windows Phone/i.test(ua)) {
      settings.xhr_ul_blob_megabytes = 4;
    }
    if (/^((?!chrome|android|crios|fxios).)*safari/i.test(ua)) {
      settings.forceIE11Workaround = true;
    }
  }
};