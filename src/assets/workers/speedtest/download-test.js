/*
	LibreSpeed Worker - Download test (multi-stream).
*/

function dlTest(done) {
  tverb("dlTest");
  if (ST.dlCalled) return;
  else ST.dlCalled = true;

  let totLoaded = 0.0,
    startT = new Date().getTime(),
    bonusT = 0,
    graceTimeDone = false,
    failed = false;
  ST.xhr = [];

  const testStream = function (i, delay) {
    setTimeout(function () {
      if (ST.testState !== 1) return;
      tverb("dl test stream started " + i + " " + delay);
      let prevLoaded = 0;
      let x = new XMLHttpRequest();
      ST.xhr[i] = x;

      ST.xhr[i].onprogress = function (event) {
        tverb("dl stream progress event " + i + " " + event.loaded);
        if (ST.testState !== 1) {
          try { x.abort(); } catch (e) {}
        }
        const loadDiff = event.loaded <= 0 ? 0 : event.loaded - prevLoaded;
        if (isNaN(loadDiff) || !isFinite(loadDiff) || loadDiff < 0) return;
        totLoaded += loadDiff;
        prevLoaded = event.loaded;
      };

      ST.xhr[i].onload = function () {
        tverb("dl stream finished " + i);
        try { ST.xhr[i].abort(); } catch (e) {}
        testStream(i, 0);
      };

      ST.xhr[i].onerror = function () {
        tverb("dl stream failed " + i);
        if (settings.xhr_ignoreErrors === 0) failed = true;
        try { ST.xhr[i].abort(); } catch (e) {}
        delete ST.xhr[i];
        if (settings.xhr_ignoreErrors === 1) testStream(i, 0);
      };

      try {
        if (settings.xhr_dlUseBlob) ST.xhr[i].responseType = "blob";
        else ST.xhr[i].responseType = "arraybuffer";
      } catch (e) {}

      ST.xhr[i].open(
        "GET",
        settings.url_dl + url_sep(settings.url_dl) +
          (settings.mpot ? "cors=true&" : "") +
          "r=" + Math.random() + "&ckSize=" + settings.garbagePhp_chunkSize,
        true
      );
      ST.xhr[i].send();
    }, 1 + delay);
  };

  for (let i = 0; i < settings.xhr_dlMultistream; i++) {
    testStream(i, settings.xhr_multistreamDelay * i);
  }

  ST.interval = setInterval(function () {
    tverb("DL: " + ST.dlStatus + (graceTimeDone ? "" : " (in grace time)"));
    const t = new Date().getTime() - startT;
    if (graceTimeDone) ST.dlProgress = (t + bonusT) / (settings.time_dl_max * 1000);
    if (t < 200) return;

    if (!graceTimeDone) {
      if (t > 1000 * settings.time_dlGraceTime) {
        if (totLoaded > 0) {
          startT = new Date().getTime();
          bonusT = 0;
          totLoaded = 0.0;
        }
        graceTimeDone = true;
      }
    } else {
      const speed = totLoaded / (t / 1000.0);
      if (settings.time_auto) {
        const bonus = (5.0 * speed) / 100000;
        bonusT += bonus > 400 ? 400 : bonus;
      }
      ST.dlStatus = ((speed * 8 * settings.overheadCompensationFactor) /
        (settings.useMebibits ? 1048576 : 1000000)).toFixed(2);

      if ((t + bonusT) / 1000.0 > settings.time_dl_max || failed) {
        if (failed || isNaN(ST.dlStatus)) ST.dlStatus = "Fail";
        clearRequests();
        clearInterval(ST.interval);
        ST.dlProgress = 1;
        tlog("dlTest: " + ST.dlStatus + ", took " + (new Date().getTime() - startT) + "ms");
        done();
      }
    }
  }, 200);
}