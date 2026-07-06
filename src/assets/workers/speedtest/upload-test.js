/*
	LibreSpeed Worker - Upload test (multi-stream, with IE11 workaround + mpot POST).
*/

function ulTest(done) {
  tverb("ulTest");
  if (ST.ulCalled) return;
  else ST.ulCalled = true;

  let r = new ArrayBuffer(1048576);
  const maxInt = Math.pow(2, 32) - 1;
  try {
    r = new Uint32Array(r);
    for (let i = 0; i < r.length; i++) r[i] = Math.random() * maxInt;
  } catch (e) {}

  let req = [];
  let reqsmall = [];
  for (let i = 0; i < settings.xhr_ul_blob_megabytes; i++) req.push(r);
  req = new Blob(req);

  r = new ArrayBuffer(262144);
  try {
    r = new Uint32Array(r);
    for (let i = 0; i < r.length; i++) r[i] = Math.random() * maxInt;
  } catch (e) {}
  reqsmall.push(r);
  reqsmall = new Blob(reqsmall);

  const testFunction = function () {
    let totLoaded = 0.0,
      startT = new Date().getTime(),
      bonusT = 0,
      graceTimeDone = false,
      failed = false;
    ST.xhr = [];

    const testStream = function (i, delay) {
      setTimeout(function () {
        if (ST.testState !== 3) return;
        tverb("ul test stream started " + i + " " + delay);
        let prevLoaded = 0;
        let x = new XMLHttpRequest();
        ST.xhr[i] = x;

        let ie11workaround;
        if (settings.forceIE11Workaround) ie11workaround = true;
        else {
          try {
            ST.xhr[i].upload.onprogress;
            ie11workaround = false;
          } catch (e) {
            ie11workaround = true;
          }
        }

        if (ie11workaround) {
          ST.xhr[i].onload = ST.xhr[i].onerror = function () {
            tverb("ul stream progress event (ie11wa)");
            totLoaded += reqsmall.size;
            testStream(i, 0);
          };
          ST.xhr[i].open(
            "POST",
            settings.url_ul + url_sep(settings.url_ul) +
              (settings.mpot ? "cors=true&" : "") + "r=" + Math.random(),
            true
          );
          try { ST.xhr[i].setRequestHeader("Content-Encoding", "identity"); } catch (e) {}
          ST.xhr[i].send(reqsmall);
        } else {
          ST.xhr[i].upload.onprogress = function (event) {
            tverb("ul stream progress event " + i + " " + event.loaded);
            if (ST.testState !== 3) {
              try { x.abort(); } catch (e) {}
            }
            const loadDiff = event.loaded <= 0 ? 0 : event.loaded - prevLoaded;
            if (isNaN(loadDiff) || !isFinite(loadDiff) || loadDiff < 0) return;
            totLoaded += loadDiff;
            prevLoaded = event.loaded;
          };
          ST.xhr[i].upload.onload = function () {
            tverb("ul stream finished " + i);
            testStream(i, 0);
          };
          ST.xhr[i].upload.onerror = function () {
            tverb("ul stream failed " + i);
            if (settings.xhr_ignoreErrors === 0) failed = true;
            try { ST.xhr[i].abort(); } catch (e) {}
            delete ST.xhr[i];
            if (settings.xhr_ignoreErrors === 1) testStream(i, 0);
          };
          ST.xhr[i].open(
            "POST",
            settings.url_ul + url_sep(settings.url_ul) +
              (settings.mpot ? "cors=true&" : "") + "r=" + Math.random(),
            true
          );
          try { ST.xhr[i].setRequestHeader("Content-Encoding", "identity"); } catch (e) {}
          ST.xhr[i].send(req);
        }
      }, delay);
    };

    for (let i = 0; i < settings.xhr_ulMultistream; i++) {
      testStream(i, settings.xhr_multistreamDelay * i);
    }

    ST.interval = setInterval(function () {
      tverb("UL: " + ST.ulStatus + (graceTimeDone ? "" : " (in grace time)"));
      const t = new Date().getTime() - startT;
      if (graceTimeDone) ST.ulProgress = (t + bonusT) / (settings.time_ul_max * 1000);
      if (t < 200) return;

      if (!graceTimeDone) {
        if (t > 1000 * settings.time_ulGraceTime) {
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
        ST.ulStatus = ((speed * 8 * settings.overheadCompensationFactor) /
          (settings.useMebibits ? 1048576 : 1000000)).toFixed(2);

        if ((t + bonusT) / 1000.0 > settings.time_ul_max || failed) {
          if (failed || isNaN(ST.ulStatus)) ST.ulStatus = "Fail";
          clearRequests();
          clearInterval(ST.interval);
          ST.ulProgress = 1;
          tlog("ulTest: " + ST.ulStatus + ", took " + (new Date().getTime() - startT) + "ms");
          done();
        }
      }
    }, 200);
  };

  if (settings.mpot) {
    tverb("Sending POST request before performing upload test");
    ST.xhr = [];
    ST.xhr[0] = new XMLHttpRequest();
    ST.xhr[0].onload = ST.xhr[0].onerror = function () {
      tverb("POST request sent, starting upload test");
      testFunction();
    };
    ST.xhr[0].open("POST", settings.url_ul);
    ST.xhr[0].send();
  } else {
    testFunction();
  }
}