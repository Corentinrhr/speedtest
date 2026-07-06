/*
	LibreSpeed Worker - Shared utilities (logging, url helpers, perf timing).
	Loaded first via importScripts so every other module can use it.
*/

// Telemetry log buffer (populated by tlog/tverb, sent by telemetry.js).
var log = "";

function tlog(s) {
  if (settings.telemetry_level >= 2) {
    log += Date.now() + ": " + s + "\n";
  }
}

function tverb(s) {
  if (settings.telemetry_level >= 3) {
    log += Date.now() + ": " + s + "\n";
  }
}

function twarn(s) {
  if (settings.telemetry_level >= 2) {
    log += Date.now() + " WARN: " + s + "\n";
  }
  console.warn(s);
}

// Append the correct query separator to a URL.
function url_sep(url) {
  return url.match(/\?/) ? "&" : "?";
}

/*
	Refine an elapsed-time (ms) estimate using the Performance API when allowed.
	Returns the best available instantaneous RTT. Falls back to the raw estimate.
*/
function refineWithPerformanceApi(estimateMs) {
  if (!settings.ping_allowPerformanceApi) return estimateMs;
  try {
    let p = performance.getEntries();
    p = p[p.length - 1];
    let d = p.responseStart - p.requestStart;
    if (d <= 0) d = p.duration;
    if (d > 0 && d < estimateMs) return d;
  } catch (e) {
    // Performance API not supported; keep the estimate.
  }
  return estimateMs;
}

// Abort and detach every pending XHR held in the shared ST.xhr array.
function clearRequests() {
  tverb("stopping pending XHRs");
  if (ST.xhr) {
    for (let i = 0; i < ST.xhr.length; i++) {
      try {
        ST.xhr[i].onprogress = null;
        ST.xhr[i].onload = null;
        ST.xhr[i].onerror = null;
      } catch (e) {}
      try {
        ST.xhr[i].upload.onprogress = null;
        ST.xhr[i].upload.onload = null;
        ST.xhr[i].upload.onerror = null;
      } catch (e) {}
      try { ST.xhr[i].abort(); } catch (e) {}
      try { delete ST.xhr[i]; } catch (e) {}
    }
    ST.xhr = null;
  }
}