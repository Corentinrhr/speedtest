/*
	LibreSpeed Worker - Telemetry submission.

	Sends the final results (dl/ul/ping/jitter + optional log + ISP info) to the
	configured telemetry endpoint. Uses FormData when available, and falls back
	to a urlencoded POST body otherwise.

	The `done` callback receives the telemetry id (string) on success, or null
	on failure / when telemetry is disabled.
*/

function sendTelemetry(done) {
  if (settings.telemetry_level < 1) return;

  ST.xhr = new XMLHttpRequest();

  ST.xhr.onload = function () {
    try {
      const parts = ST.xhr.responseText.split(" ");
      if (parts[0] == "id") {
        try {
          let id = parts[1];
          done(id);
        } catch (e) {
          done(null);
        }
      } else {
        done(null);
      }
    } catch (e) {
      done(null);
    }
  };

  ST.xhr.onerror = function () {
    console.log("TELEMETRY ERROR " + ST.xhr.status);
    done(null);
  };

  ST.xhr.open(
    "POST",
    settings.url_telemetry + url_sep(settings.url_telemetry) +
      (settings.mpot ? "cors=true&" : "") + "r=" + Math.random(),
    true
  );

  const telemetryIspInfo = {
    processedString: ST.clientIp,
    rawIspInfo: typeof ST.ispInfo === "object" ? ST.ispInfo : ""
  };

  try {
    const fd = new FormData();
    fd.append("ispinfo", JSON.stringify(telemetryIspInfo));
    fd.append("dl", ST.dlStatus);
    fd.append("ul", ST.ulStatus);
    fd.append("ping", ST.pingStatus);
    fd.append("jitter", ST.jitterStatus);
    fd.append("log", settings.telemetry_level > 1 ? log : "");
    fd.append("extra", settings.telemetry_extra);
    ST.xhr.send(fd);
  } catch (ex) {
    const postData =
      "extra=" + encodeURIComponent(settings.telemetry_extra) +
      "&ispinfo=" + encodeURIComponent(JSON.stringify(telemetryIspInfo)) +
      "&dl=" + encodeURIComponent(ST.dlStatus) +
      "&ul=" + encodeURIComponent(ST.ulStatus) +
      "&ping=" + encodeURIComponent(ST.pingStatus) +
      "&jitter=" + encodeURIComponent(ST.jitterStatus) +
      "&log=" + encodeURIComponent(settings.telemetry_level > 1 ? log : "");
    ST.xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
    ST.xhr.send(postData);
  }
}