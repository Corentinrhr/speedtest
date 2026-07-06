/*
	LibreSpeed Worker - Idle ping/jitter test + idle packet loss.

	Uses a LOCAL xhr per ping (avoids race conditions between consecutive pings)
	and treats the very first ping (i === 0) as a warm-up that is NOT counted in
	sent/lost.
*/

function pingTest(done) {
  tverb("pingTest");
  if (ST.ptCalled) return;
  else ST.ptCalled = true;

  const startT = new Date().getTime();
  let prevT = null;
  let ping = 0.0;
  let jitter = 0.0;
  let i = 0;
  let prevInstspd = 0;

  // Idle packet loss counters.
  let sent = 0;
  let lost = 0;

  ST.pingLostCount = 0;
  ST.xhr = [];

  const commitLoss = function () {
    ST.pingPacketLoss = sent > 0
      ? ((lost / sent) * 100).toFixed(2)
      : "0.00";
  };

  const finish = function () {
    ST.pingProgress = 1;
    tlog(
      "ping: " + ST.pingStatus + " jitter: " + ST.jitterStatus +
      " loss: " + ST.pingPacketLoss + "%, took " + (new Date().getTime() - startT) + "ms"
    );
    done();
  };

  const doPing = function () {
    tverb("ping");
    ST.pingProgress = i / settings.count_ping;
    prevT = new Date().getTime();

    let settled = false;
    const isWarmup = (i === 0);

    let localXhr = new XMLHttpRequest();
    ST.xhr[0] = localXhr; // kept for clearRequests() compatibility

    const timeoutTimer = setTimeout(function () {
      if (settled) return;
      settled = true;
      try { localXhr.abort(); } catch (e) {}

      if (!isWarmup) {
        sent++;
        lost++;
        commitLoss();
        ST.pingLostInst = true;
        ST.pingLostCount++;
      }
      prevInstspd = 0;
      i++;
      if (i < settings.count_ping) doPing();
      else finish();
    }, settings.idlePing_timeout);

    localXhr.onload = function () {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      tverb("pong");

      if (i === 0) {
        // Warm-up succeeded: prime prevT, don't measure or count.
        prevT = new Date().getTime();
      } else {
        let instspd = refineWithPerformanceApi(new Date().getTime() - prevT);
        if (instspd < 1) instspd = prevInstspd;
        if (instspd < 1) instspd = 1;

        const instjitter = Math.abs(instspd - prevInstspd);
        if (i === 1) ping = instspd;
        else {
          if (instspd < ping) ping = instspd;
          if (i === 2) jitter = instjitter;
          else jitter = instjitter > jitter
            ? jitter * 0.3 + instjitter * 0.7
            : jitter * 0.8 + instjitter * 0.2;
        }
        prevInstspd = instspd;
        ST.pingInst = instspd.toFixed(2);
      }

      ST.pingStatus = ping.toFixed(2);
      ST.jitterStatus = jitter.toFixed(2);

      if (!isWarmup) {
        sent++;
        commitLoss();
      }

      i++;
      tverb("ping: " + ST.pingStatus + " jitter: " + ST.jitterStatus + " loss: " + ST.pingPacketLoss + "%");
      if (i < settings.count_ping) doPing();
      else finish();
    };

    localXhr.onerror = function () {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      tverb("ping failed");

      if (!isWarmup) {
        sent++;
        lost++;
        commitLoss();
        ST.pingLostInst = true;
        ST.pingLostCount++;
      }
      prevInstspd = 0;

      // A single failed warm-up must not fail the whole test in hard-fail mode.
      if (settings.xhr_ignoreErrors === 0 && !isWarmup) {
        ST.pingStatus = "Fail";
        ST.jitterStatus = "Fail";
        clearRequests();
        tlog("ping test failed, took " + (new Date().getTime() - startT) + "ms");
        ST.pingProgress = 1;
        done();
        return;
      }

      i++;
      if (i < settings.count_ping) doPing();
      else finish();
    };

    localXhr.open(
      "GET",
      settings.url_ping + url_sep(settings.url_ping) +
        (settings.mpot ? "cors=true&" : "") + "r=" + Math.random(),
      true
    );
    localXhr.send();
  };

  doPing();
}