/*
	LibreSpeed Worker - Client IP + ISP info retrieval.
*/

function getIp(done) {
  tverb("getIp");
  if (ST.ipCalled) return;
  else ST.ipCalled = true;

  const startT = new Date().getTime();
  ST.xhr = new XMLHttpRequest();

  ST.xhr.onload = function () {
    tlog("IP: " + ST.xhr.responseText + ", took " + (new Date().getTime() - startT) + "ms");
    try {
      const data = JSON.parse(ST.xhr.responseText);
      ST.clientIp = data.processedString;
      ST.ispInfo = data.rawIspInfo;
    } catch (e) {
      ST.clientIp = ST.xhr.responseText;
      ST.ispInfo = "";
    }
    done();
  };

  ST.xhr.onerror = function () {
    tlog("getIp failed, took " + (new Date().getTime() - startT) + "ms");
    done();
  };

  ST.xhr.open(
    "GET",
    settings.url_getIp + url_sep(settings.url_getIp) +
      (settings.mpot ? "cors=true&" : "") +
      (settings.getIp_ispInfo
        ? "isp=true" +
          (settings.getIp_ispInfo_distance
            ? "&distance=" + settings.getIp_ispInfo_distance + "&"
            : "&")
        : "&") +
      "r=" + Math.random(),
    true
  );
  ST.xhr.send();
}