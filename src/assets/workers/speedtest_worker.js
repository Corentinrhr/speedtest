/*
	LibreSpeed - Worker (REFACTORED by Corentinrhr)
	by Federico Dossena — https://github.com/librespeed/speedtest/
	GNU LGPLv3 License

	This file is a thin orchestrator. All logic lives in ./speedtest/*.js,
	loaded via importScripts(). The public postMessage protocol is UNCHANGED,
	so speedtest.service.ts / speedtest.js keep working as-is.
*/

// Resolve the base folder of this worker so importScripts works regardless of
// the cache-busting query string (?r=...).
(function () {
  var base = "";
  try {
    base = self.location.href.replace(/[?#].*$/, "").replace(/[^/]*$/, "");
  } catch (e) {
    base = "";
  }
  importScripts(
    base + "speedtest/utils.js",
    base + "speedtest/state.js",
    base + "speedtest/settings.js",
    base + "speedtest/bg-pinger.js",
    base + "speedtest/ip-test.js",
    base + "speedtest/download-test.js",
    base + "speedtest/upload-test.js",
    base + "speedtest/ping-test.js",
    base + "speedtest/telemetry.js"
  );
})();

// runNextTest is defined here because it drives the whole test sequence and
// needs access to every test module.
var runNextTest = null;

this.addEventListener("message", function (e) {
  const params = e.data.split(" ");

  // ── STATUS ──
  if (params[0] === "status") {
    postMessage(JSON.stringify(ST.snapshot()));
    ST.resetOneShotFlags(); // one-shot "lost" flags consumed after each report
    return;
  }

  // ── START ──
  if (params[0] === "start" && ST.testState === -1) {
    ST.testState = 0;
    Settings.applyFromMessage(e.data);
    tverb(JSON.stringify(settings));

    ST.test_pointer = 0;
    let iRun = false, dRun = false, uRun = false, pRun = false;

    runNextTest = function () {
      if (ST.testState == 5) return;
      if (ST.test_pointer >= settings.test_order.length) {
        if (settings.telemetry_level > 0) {
          sendTelemetry(function (id) {
            ST.testState = 4;
            if (id != null) ST.testId = id;
          });
        } else {
          ST.testState = 4;
        }
        return;
      }

      switch (settings.test_order.charAt(ST.test_pointer)) {
        case "I":
          ST.test_pointer++;
          if (iRun) { runNextTest(); return; } else iRun = true;
          getIp(runNextTest);
          break;

        case "D":
          ST.test_pointer++;
          if (dRun) { runNextTest(); return; } else dRun = true;
          ST.testState = 1;
          if (settings.loadedLatency) bgPinger.start("dl");
          dlTest(function () {
            if (settings.loadedLatency) bgPinger.stop();
            runNextTest();
          });
          break;

        case "U":
          ST.test_pointer++;
          if (uRun) { runNextTest(); return; } else uRun = true;
          ST.testState = 3;
          if (settings.loadedLatency) bgPinger.start("ul");
          ulTest(function () {
            if (settings.loadedLatency) bgPinger.stop();
            runNextTest();
          });
          break;

        case "P":
          ST.test_pointer++;
          if (pRun) { runNextTest(); return; } else pRun = true;
          ST.testState = 2;
          pingTest(runNextTest);
          break;

        case "_":
          ST.test_pointer++;
          setTimeout(runNextTest, 1000);
          break;

        default:
          ST.test_pointer++;
      }
    };

    runNextTest();
    return;
  }

  // ── ABORT ──
  if (params[0] === "abort") {
    if (ST.testState >= 4) return;
    tlog("manually aborted");
    bgPinger.stop();
    clearRequests();
    runNextTest = null;
    if (ST.interval) clearInterval(ST.interval);
    if (settings.telemetry_level > 1) sendTelemetry(function () {});
    ST.testState = 5;
    ST.resetAll();
  }
});