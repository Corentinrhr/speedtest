/*
	LibreSpeed - Worker (MOD: DL/UL latency under load + instantaneous latency + packet loss + IDLE packet loss)
	by Federico Dossena
	https://github.com/librespeed/speedtest/
	GNU LGPLv3 License

	>>> FIXES applied (v3):
	  1. dlLostInst / ulLostInst are now reset after each status report (one-shot),
	     exactly like pingLostInst, to avoid stale flags and double-counting.
	  2. Added cumulative loss counters (dlLostCount / ulLostCount / pingLostCount)
	     so the main thread can use a robust delta pattern and never miss an event.
	  3. pingTest now uses a local xhr variable instead of the shared xhr[0]
	     to avoid race conditions between consecutive pings.
	  4. WARM-UP PING (i === 0 for idle, count === 0 for bgPinger) is no longer
	     counted in `sent` nor `lost`. This removes false-positive packet loss
	     caused by the initial DNS + TCP + TLS connection establishment.
*/

// data reported to main thread
let testState = -1; // -1=not started, 0=starting, 1=download test, 2=ping+jitter test, 3=upload test, 4=finished, 5=abort
let dlStatus = "";
let ulStatus = "";
let pingStatus = "";
let jitterStatus = "";
let clientIp = "";
let dlProgress = 0;
let ulProgress = 0;
let pingProgress = 0;
let testId = null;
let dlLoadedPing = "";
let dlLoadedJitter = "";
let ulLoadedPing = "";
let ulLoadedJitter = "";
let dlLoadedPingInst = "";
let ulLoadedPingInst = "";
let pingInst = "";
// >>> MOD: packet loss under load <<<
let dlPacketLoss = "";   // percentage 0-100 as string
let ulPacketLoss = "";   // percentage 0-100 as string
let dlLostInst = false;  // true for one status cycle when a DL ping was just lost
let ulLostInst = false;  // true for one status cycle when a UL ping was just lost
// >>> FIX: cumulative loss counters (delta pattern) <<<
let dlLostCount = 0;     // total DL losses since test start
let ulLostCount = 0;     // total UL losses since test start
// >>> MOD: IDLE packet loss (during pingTest) <<<
let pingPacketLoss = ""; // percentage 0-100 as string
let pingLostInst = false;// true for one status cycle when an idle ping was just lost
// >>> FIX: cumulative idle loss counter (delta pattern) <<<
let pingLostCount = 0;   // total idle losses since test start

let log = "";
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

// test settings. can be overridden by sending specific values with the start command
let settings = {
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
	// >>> MOD: timeout above which an idle ping is counted as lost <<<
	idlePing_timeout: 2000
};

let xhr = null;
let interval = null;
let test_pointer = 0;

function url_sep(url) {
	return url.match(/\?/) ? "&" : "?";
}

/*
   MOD: Independent background pinger (loaded latency for DL/UL).
   Also counts packet loss under load.

   >>> FIX v3: the very first ping of each phase (count === 0) is a WARM-UP.
   It is never counted in `sent`/`lost`, so a slow/failed connection setup
   under load is not reported as packet loss.
*/
let bgPinger = {
	running: false,
	target: null,
	xhr: null,
	prevInstspd: 0,
	count: 0,
	sent: 0,
	lost: 0,
	ping: 0,
	jitter: 0,

	start: function(target) {
		this.running = true;
		this.target = target;
		this.prevInstspd = 0;
		this.count = 0;
		this.sent = 0;
		this.lost = 0;
		this.ping = 0;
		this.jitter = 0;
		if (target === "dl") {
			dlLoadedPingInst = "";
			dlPacketLoss = "";
			dlLostInst = false;
			dlLostCount = 0; // >>> FIX: reset cumulative counter at phase start
		} else if (target === "ul") {
			ulLoadedPingInst = "";
			ulPacketLoss = "";
			ulLostInst = false;
			ulLostCount = 0; // >>> FIX: reset cumulative counter at phase start
		}
		this._loop();
	},

	stop: function() {
		this.running = false;
		if (this.xhr) {
			try { this.xhr.abort(); } catch (e) {}
			this.xhr = null;
		}
	},

	_commitLoss: function() {
		const loss = this.sent > 0
			? ((this.lost / this.sent) * 100).toFixed(2)
			: "0.00";
		if (this.target === "dl") {
			dlPacketLoss = loss;
			dlLostInst = true;
			dlLostCount++; // >>> FIX: increment cumulative counter on each real loss
		} else if (this.target === "ul") {
			ulPacketLoss = loss;
			ulLostInst = true;
			ulLostCount++; // >>> FIX: increment cumulative counter on each real loss
		}
	},

	_commit: function(instspd) {
		const p = this.ping.toFixed(2);
		const j = this.jitter.toFixed(2);
		const inst = instspd.toFixed(2);
		const loss = this.sent > 0
			? ((this.lost / this.sent) * 100).toFixed(2)
			: "0.00";
		if (this.target === "dl") {
			dlLoadedPing = p;
			dlLoadedJitter = j;
			dlLoadedPingInst = inst;
			dlPacketLoss = loss;
			// >>> FIX: do NOT force dlLostInst=false here.
			// The status handler is now the single owner of the one-shot reset,
			// so a loss that happened between two commits is never swallowed.
		} else if (this.target === "ul") {
			ulLoadedPing = p;
			ulLoadedJitter = j;
			ulLoadedPingInst = inst;
			ulPacketLoss = loss;
			// >>> FIX: same as above for UL.
		}
	},

	_onLost: function() {
		if (!this.running) return;

		// >>> FIX v3: warm-up (count === 0) is NOT counted as a loss.
		// A failed/slow connection setup under load is not a real packet loss.
		if (this.count === 0) {
			this.count++;          // consume the warm-up slot
			this.prevInstspd = 0;
			setTimeout(this._loop.bind(this), settings.loadedLatency_interval);
			return;
		}

		this.sent++;
		this.lost++;
		this.prevInstspd = 0;
		this._commitLoss();
		setTimeout(this._loop.bind(this), settings.loadedLatency_interval);
	},

	_loop: function() {
		if (!this.running) return;
		const prevT = new Date().getTime();
		let settled = false;

		const timeoutTimer = setTimeout(function() {
			if (settled || !this.running) return;
			settled = true;
			try { if (this.xhr) this.xhr.abort(); } catch (e) {}
			this._onLost();
		}.bind(this), settings.loadedLatency_timeout);

		this.xhr = new XMLHttpRequest();
		this.xhr.onload = function() {
			if (settled || !this.running) return;
			settled = true;
			clearTimeout(timeoutTimer);

			// >>> FIX v3: warm-up (count === 0) only primes the connection.
			// We don't measure its latency and we don't count it in `sent`.
			if (this.count === 0) {
				this.count++;
				this.prevInstspd = 0;
				const rttWarm = new Date().getTime() - prevT;
				const delayWarm = Math.max(0, settings.loadedLatency_interval - rttWarm);
				setTimeout(this._loop.bind(this), delayWarm);
				return;
			}

			let instspd = new Date().getTime() - prevT;
			if (settings.ping_allowPerformanceApi) {
				try {
					let p = performance.getEntries();
					p = p[p.length - 1];
					let d = p.responseStart - p.requestStart;
					if (d <= 0) d = p.duration;
					if (d > 0 && d < instspd) instspd = d;
				} catch (e) {}
			}
			if (instspd < 1) instspd = this.prevInstspd;
			if (instspd < 1) instspd = 1;

			const instjitter = Math.abs(instspd - this.prevInstspd);
			// count === 1 is the first *measured* ping (warm-up was count 0).
			if (this.count === 1) {
				this.ping = instspd;
			} else {
				if (instspd < this.ping) this.ping = instspd;
				if (this.count === 2) this.jitter = instjitter;
				else this.jitter = instjitter > this.jitter
					? this.jitter * 0.3 + instjitter * 0.7
					: this.jitter * 0.8 + instjitter * 0.2;
			}
			this.prevInstspd = instspd;
			this.count++;
			this.sent++;
			this._commit(instspd);

			const rtt = new Date().getTime() - prevT;
			const delay = Math.max(0, settings.loadedLatency_interval - rtt);
			setTimeout(this._loop.bind(this), delay);
		}.bind(this);

		this.xhr.onerror = function() {
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

this.addEventListener("message", function(e) {
	const params = e.data.split(" ");
	if (params[0] === "status") {
		postMessage(
			JSON.stringify({
				testState: testState,
				dlStatus: dlStatus,
				ulStatus: ulStatus,
				pingStatus: pingStatus,
				clientIp: clientIp,
				jitterStatus: jitterStatus,
				dlProgress: dlProgress,
				ulProgress: ulProgress,
				pingProgress: pingProgress,
				testId: testId,
				dlLoadedPing: dlLoadedPing,
				dlLoadedJitter: dlLoadedJitter,
				ulLoadedPing: ulLoadedPing,
				ulLoadedJitter: ulLoadedJitter,
				dlLoadedPingInst: dlLoadedPingInst,
				ulLoadedPingInst: ulLoadedPingInst,
				pingInst: pingInst,
				dlPacketLoss: dlPacketLoss,
				ulPacketLoss: ulPacketLoss,
				dlLostInst: dlLostInst,
				ulLostInst: ulLostInst,
				// >>> FIX: expose cumulative counters (delta pattern) <<<
				dlLostCount: dlLostCount,
				ulLostCount: ulLostCount,
				// >>> MOD: idle packet loss <<<
				pingPacketLoss: pingPacketLoss,
				pingLostInst: pingLostInst,
				// >>> FIX: expose cumulative idle counter (delta pattern) <<<
				pingLostCount: pingLostCount
			})
		);
		// >>> FIX: reset ALL one-shot "lost" flags AFTER they have been reported once,
		// so the main thread never counts the same loss multiple times, and stale
		// flags cannot survive across status cycles.
		pingLostInst = false;
		dlLostInst = false; // <-- FIX
		ulLostInst = false; // <-- FIX
	}
	if (params[0] === "start" && testState === -1) {
		testState = 0;
		try {
			let s = {};
			try {
				const ss = e.data.substring(5);
				if (ss) s = JSON.parse(ss);
			} catch (e) {
				twarn("Error parsing custom settings JSON. Please check your syntax");
			}
			for (let key in s) {
				if (typeof settings[key] !== "undefined") settings[key] = s[key];
				else twarn("Unknown setting ignored: " + key);
			}
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
			if (/Edge.(\d+\.\d+)/i.test(ua)) {
				settings.forceIE11Workaround = true;
			}
			if (/PlayStation 4.(\d+\.\d+)/i.test(ua)) {
				settings.forceIE11Workaround = true;
			}
			if (/Chrome.(\d+)/i.test(ua) && /Android|iPhone|iPad|iPod|Windows Phone/i.test(ua)) {
				settings.xhr_ul_blob_megabytes = 4;
			}
			if (/^((?!chrome|android|crios|fxios).)*safari/i.test(ua)) {
				settings.forceIE11Workaround = true;
			}
			if (typeof s.telemetry_level !== "undefined") settings.telemetry_level = s.telemetry_level === "basic" ? 1 : s.telemetry_level === "full" ? 2 : s.telemetry_level === "debug" ? 3 : 0;
			settings.test_order = settings.test_order.toUpperCase();
		} catch (e) {
			twarn("Possible error in custom test settings. Some settings might not have been applied. Exception: " + e);
		}
		tverb(JSON.stringify(settings));
		test_pointer = 0;
		let iRun = false, dRun = false, uRun = false, pRun = false;
		const runNextTest = function() {
			if (testState == 5) return;
			if (test_pointer >= settings.test_order.length) {
				if (settings.telemetry_level > 0)
					sendTelemetry(function(id) {
						testState = 4;
						if (id != null) testId = id;
					});
				else testState = 4;
				return;
			}
			switch (settings.test_order.charAt(test_pointer)) {
				case "I":
					{
						test_pointer++;
						if (iRun) { runNextTest(); return; } else iRun = true;
						getIp(runNextTest);
					}
					break;
				case "D":
					{
						test_pointer++;
						if (dRun) { runNextTest(); return; } else dRun = true;
						testState = 1;
						if (settings.loadedLatency) bgPinger.start("dl");
						dlTest(function() {
							if (settings.loadedLatency) bgPinger.stop();
							runNextTest();
						});
					}
					break;
				case "U":
					{
						test_pointer++;
						if (uRun) { runNextTest(); return; } else uRun = true;
						testState = 3;
						if (settings.loadedLatency) bgPinger.start("ul");
						ulTest(function() {
							if (settings.loadedLatency) bgPinger.stop();
							runNextTest();
						});
					}
					break;
				case "P":
					{
						test_pointer++;
						if (pRun) { runNextTest(); return; } else pRun = true;
						testState = 2;
						pingTest(runNextTest);
					}
					break;
				case "_":
					{
						test_pointer++;
						setTimeout(runNextTest, 1000);
					}
					break;
				default:
					test_pointer++;
			}
		};
		runNextTest();
	}
	if (params[0] === "abort") {
		if (testState >= 4) return;
		tlog("manually aborted");
		bgPinger.stop();
		clearRequests();
		runNextTest = null;
		if (interval) clearInterval(interval);
		if (settings.telemetry_level > 1) sendTelemetry(function() {});
		testState = 5;
		dlStatus = "";
		ulStatus = "";
		pingStatus = "";
		jitterStatus = "";
		clientIp = "";
		dlProgress = 0;
		ulProgress = 0;
		pingProgress = 0;
		dlLoadedPing = "";
		dlLoadedJitter = "";
		ulLoadedPing = "";
		ulLoadedJitter = "";
		dlLoadedPingInst = "";
		ulLoadedPingInst = "";
		pingInst = "";
		dlPacketLoss = "";
		ulPacketLoss = "";
		dlLostInst = false;
		ulLostInst = false;
		// >>> FIX: reset cumulative counters on abort <<<
		dlLostCount = 0;
		ulLostCount = 0;
		// >>> MOD: reset idle packet loss <<<
		pingPacketLoss = "";
		pingLostInst = false;
		pingLostCount = 0; // >>> FIX
	}
});

function clearRequests() {
	tverb("stopping pending XHRs");
	if (xhr) {
		for (let i = 0; i < xhr.length; i++) {
			try {
				xhr[i].onprogress = null;
				xhr[i].onload = null;
				xhr[i].onerror = null;
			} catch (e) {}
			try {
				xhr[i].upload.onprogress = null;
				xhr[i].upload.onload = null;
				xhr[i].upload.onerror = null;
			} catch (e) {}
			try { xhr[i].abort(); } catch (e) {}
			try { delete xhr[i]; } catch (e) {}
		}
		xhr = null;
	}
}

let ipCalled = false;
let ispInfo = "";
function getIp(done) {
	tverb("getIp");
	if (ipCalled) return;
	else ipCalled = true;
	let startT = new Date().getTime();
	xhr = new XMLHttpRequest();
	xhr.onload = function() {
		tlog("IP: " + xhr.responseText + ", took " + (new Date().getTime() - startT) + "ms");
		try {
			const data = JSON.parse(xhr.responseText);
			clientIp = data.processedString;
			ispInfo = data.rawIspInfo;
		} catch (e) {
			clientIp = xhr.responseText;
			ispInfo = "";
		}
		done();
	};
	xhr.onerror = function() {
		tlog("getIp failed, took " + (new Date().getTime() - startT) + "ms");
		done();
	};
	xhr.open("GET", settings.url_getIp + url_sep(settings.url_getIp) + (settings.mpot ? "cors=true&" : "") + (settings.getIp_ispInfo ? "isp=true" + (settings.getIp_ispInfo_distance ? "&distance=" + settings.getIp_ispInfo_distance + "&" : "&") : "&") + "r=" + Math.random(), true);
	xhr.send();
}

let dlCalled = false;
function dlTest(done) {
	tverb("dlTest");
	if (dlCalled) return;
	else dlCalled = true;
	let totLoaded = 0.0,
		startT = new Date().getTime(),
		bonusT = 0,
		graceTimeDone = false,
		failed = false;
	xhr = [];
	const testStream = function(i, delay) {
		setTimeout(
			function() {
				if (testState !== 1) return;
				tverb("dl test stream started " + i + " " + delay);
				let prevLoaded = 0;
				let x = new XMLHttpRequest();
				xhr[i] = x;
				xhr[i].onprogress = function(event) {
					tverb("dl stream progress event " + i + " " + event.loaded);
					if (testState !== 1) {
						try { x.abort(); } catch (e) {}
					}
					const loadDiff = event.loaded <= 0 ? 0 : event.loaded - prevLoaded;
					if (isNaN(loadDiff) || !isFinite(loadDiff) || loadDiff < 0) return;
					totLoaded += loadDiff;
					prevLoaded = event.loaded;
				}.bind(this);
				xhr[i].onload = function() {
					tverb("dl stream finished " + i);
					try { xhr[i].abort(); } catch (e) {}
					testStream(i, 0);
				}.bind(this);
				xhr[i].onerror = function() {
					tverb("dl stream failed " + i);
					if (settings.xhr_ignoreErrors === 0) failed = true;
					try { xhr[i].abort(); } catch (e) {}
					delete xhr[i];
					if (settings.xhr_ignoreErrors === 1) testStream(i, 0);
				}.bind(this);
				try {
					if (settings.xhr_dlUseBlob) xhr[i].responseType = "blob";
					else xhr[i].responseType = "arraybuffer";
				} catch (e) {}
				xhr[i].open("GET", settings.url_dl + url_sep(settings.url_dl) + (settings.mpot ? "cors=true&" : "") + "r=" + Math.random() + "&ckSize=" + settings.garbagePhp_chunkSize, true);
				xhr[i].send();
			}.bind(this),
			1 + delay
		);
	}.bind(this);
	for (let i = 0; i < settings.xhr_dlMultistream; i++) {
		testStream(i, settings.xhr_multistreamDelay * i);
	}
	interval = setInterval(
		function() {
			tverb("DL: " + dlStatus + (graceTimeDone ? "" : " (in grace time)"));
			const t = new Date().getTime() - startT;
			if (graceTimeDone) dlProgress = (t + bonusT) / (settings.time_dl_max * 1000);
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
				dlStatus = ((speed * 8 * settings.overheadCompensationFactor) / (settings.useMebibits ? 1048576 : 1000000)).toFixed(2);
				if ((t + bonusT) / 1000.0 > settings.time_dl_max || failed) {
					if (failed || isNaN(dlStatus)) dlStatus = "Fail";
					clearRequests();
					clearInterval(interval);
					dlProgress = 1;
					tlog("dlTest: " + dlStatus + ", took " + (new Date().getTime() - startT) + "ms");
					done();
				}
			}
		}.bind(this),
		200
	);
}

let ulCalled = false;
function ulTest(done) {
	tverb("ulTest");
	if (ulCalled) return;
	else ulCalled = true;
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
	const testFunction = function() {
		let totLoaded = 0.0,
			startT = new Date().getTime(),
			bonusT = 0,
			graceTimeDone = false,
			failed = false;
		xhr = [];
		const testStream = function(i, delay) {
			setTimeout(
				function() {
					if (testState !== 3) return;
					tverb("ul test stream started " + i + " " + delay);
					let prevLoaded = 0;
					let x = new XMLHttpRequest();
					xhr[i] = x;
					let ie11workaround;
					if (settings.forceIE11Workaround) ie11workaround = true;
					else {
						try {
							xhr[i].upload.onprogress;
							ie11workaround = false;
						} catch (e) {
							ie11workaround = true;
						}
					}
					if (ie11workaround) {
						xhr[i].onload = xhr[i].onerror = function() {
							tverb("ul stream progress event (ie11wa)");
							totLoaded += reqsmall.size;
							testStream(i, 0);
						};
						xhr[i].open("POST", settings.url_ul + url_sep(settings.url_ul) + (settings.mpot ? "cors=true&" : "") + "r=" + Math.random(), true);
						try {
							xhr[i].setRequestHeader("Content-Encoding", "identity");
						} catch (e) {}
						xhr[i].send(reqsmall);
					} else {
						xhr[i].upload.onprogress = function(event) {
							tverb("ul stream progress event " + i + " " + event.loaded);
							if (testState !== 3) {
								try { x.abort(); } catch (e) {}
							}
							const loadDiff = event.loaded <= 0 ? 0 : event.loaded - prevLoaded;
							if (isNaN(loadDiff) || !isFinite(loadDiff) || loadDiff < 0) return;
							totLoaded += loadDiff;
							prevLoaded = event.loaded;
						}.bind(this);
						xhr[i].upload.onload = function() {
							tverb("ul stream finished " + i);
							testStream(i, 0);
						}.bind(this);
						xhr[i].upload.onerror = function() {
							tverb("ul stream failed " + i);
							if (settings.xhr_ignoreErrors === 0) failed = true;
							try { xhr[i].abort(); } catch (e) {}
							delete xhr[i];
							if (settings.xhr_ignoreErrors === 1) testStream(i, 0);
						}.bind(this);
						xhr[i].open("POST", settings.url_ul + url_sep(settings.url_ul) + (settings.mpot ? "cors=true&" : "") + "r=" + Math.random(), true);
						try {
							xhr[i].setRequestHeader("Content-Encoding", "identity");
						} catch (e) {}
						xhr[i].send(req);
					}
				}.bind(this),
				delay
			);
		}.bind(this);
		for (let i = 0; i < settings.xhr_ulMultistream; i++) {
			testStream(i, settings.xhr_multistreamDelay * i);
		}
		interval = setInterval(
			function() {
				tverb("UL: " + ulStatus + (graceTimeDone ? "" : " (in grace time)"));
				const t = new Date().getTime() - startT;
				if (graceTimeDone) ulProgress = (t + bonusT) / (settings.time_ul_max * 1000);
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
					ulStatus = ((speed * 8 * settings.overheadCompensationFactor) / (settings.useMebibits ? 1048576 : 1000000)).toFixed(2);
					if ((t + bonusT) / 1000.0 > settings.time_ul_max || failed) {
						if (failed || isNaN(ulStatus)) ulStatus = "Fail";
						clearRequests();
						clearInterval(interval);
						ulProgress = 1;
						tlog("ulTest: " + ulStatus + ", took " + (new Date().getTime() - startT) + "ms");
						done();
					}
				}
			}.bind(this),
			200
		);
	}.bind(this);
	if (settings.mpot) {
		tverb("Sending POST request before performing upload test");
		xhr = [];
		xhr[0] = new XMLHttpRequest();
		xhr[0].onload = xhr[0].onerror = function() {
			tverb("POST request sent, starting upload test");
			testFunction();
		}.bind(this);
		xhr[0].open("POST", settings.url_ul);
		xhr[0].send();
	} else testFunction();
}

let ptCalled = false;
function pingTest(done) {
	tverb("pingTest");
	if (ptCalled) return;
	else ptCalled = true;
	const startT = new Date().getTime();
	let prevT = null;
	let ping = 0.0;
	let jitter = 0.0;
	let i = 0;
	let prevInstspd = 0;

	// >>> MOD: idle packet loss counters <<<
	let sent = 0;
	let lost = 0;

	// >>> FIX: reset cumulative idle counter at phase start <<<
	pingLostCount = 0;

	xhr = [];

	// Commit the current loss percentage into the shared pingPacketLoss field.
	const commitLoss = function() {
		pingPacketLoss = sent > 0
			? ((lost / sent) * 100).toFixed(2)
			: "0.00";
	};

	const doPing = function() {
		tverb("ping");
		pingProgress = i / settings.count_ping;
		prevT = new Date().getTime();

		let settled = false;

		// >>> FIX v3: remember whether THIS ping is the warm-up (i === 0).
		// The warm-up primes DNS + TCP + TLS and must NOT be counted in
		// sent/lost, otherwise a slow/failed setup shows up as packet loss.
		const isWarmup = (i === 0);

		// >>> FIX: use a LOCAL xhr instead of the shared xhr[0].
		// This avoids race conditions where a stale timeout/onerror from a
		// previous ping could interfere with the current one.
		let localXhr = new XMLHttpRequest();
		xhr[0] = localXhr; // kept for clearRequests() compatibility

		// >>> MOD: manual timeout to detect a lost idle ping <<<
		const timeoutTimer = setTimeout(function() {
			if (settled) return;
			settled = true;
			try { localXhr.abort(); } catch (e) {}

			// >>> FIX v3: a warm-up timeout is NOT a real packet loss.
			if (!isWarmup) {
				sent++;
				lost++;
				commitLoss();
				pingLostInst = true;   // one-shot flag: the main thread will read it once
				pingLostCount++;       // cumulative counter (delta pattern)
			}
			prevInstspd = 0;
			i++;
			if (i < settings.count_ping) doPing();
			else {
				pingProgress = 1;
				tlog("ping: " + pingStatus + " jitter: " + jitterStatus +
					" loss: " + pingPacketLoss + "%, took " + (new Date().getTime() - startT) + "ms");
				done();
			}
		}, settings.idlePing_timeout);

		localXhr.onload = function() {
			if (settled) return;
			settled = true;
			clearTimeout(timeoutTimer);
			tverb("pong");
			if (i === 0) {
				// Warm-up succeeded: prime prevT, don't measure latency and
				// don't count this ping (neither sent nor lost).
				prevT = new Date().getTime();
			} else {
				let instspd = new Date().getTime() - prevT;
				if (settings.ping_allowPerformanceApi) {
					try {
						let p = performance.getEntries();
						p = p[p.length - 1];
						let d = p.responseStart - p.requestStart;
						if (d <= 0) d = p.duration;
						if (d > 0 && d < instspd) instspd = d;
					} catch (e) {
						tverb("Performance API not supported, using estimate");
					}
				}
				if (instspd < 1) instspd = prevInstspd;
				if (instspd < 1) instspd = 1;
				const instjitter = Math.abs(instspd - prevInstspd);
				if (i === 1) ping = instspd;
				else {
					if (instspd < ping) ping = instspd;
					if (i === 2) jitter = instjitter;
					else jitter = instjitter > jitter ? jitter * 0.3 + instjitter * 0.7 : jitter * 0.8 + instjitter * 0.2;
				}
				prevInstspd = instspd;
				pingInst = instspd.toFixed(2);
			}
			pingStatus = ping.toFixed(2);
			jitterStatus = jitter.toFixed(2);

			// >>> FIX v3: only count in `sent` if this is NOT the warm-up.
			if (!isWarmup) {
				sent++;
				commitLoss();
			}

			i++;
			tverb("ping: " + pingStatus + " jitter: " + jitterStatus + " loss: " + pingPacketLoss + "%");
			if (i < settings.count_ping) doPing();
			else {
				pingProgress = 1;
				tlog("ping: " + pingStatus + " jitter: " + jitterStatus +
					" loss: " + pingPacketLoss + "%, took " + (new Date().getTime() - startT) + "ms");
				done();
			}
		}.bind(this);

		localXhr.onerror = function() {
			if (settled) return;
			settled = true;
			clearTimeout(timeoutTimer);
			tverb("ping failed");

			// >>> FIX v3: a warm-up network error is NOT counted as loss.
			// It may just be the first DNS resolution / TLS handshake failing.
			if (!isWarmup) {
				sent++;
				lost++;
				commitLoss();
				pingLostInst = true;
				pingLostCount++;
			}
			prevInstspd = 0;

			// >>> FIX v3: a single failed warm-up must not fail the whole test
			// in the "hard fail" mode either.
			if (settings.xhr_ignoreErrors === 0 && !isWarmup) {
				pingStatus = "Fail";
				jitterStatus = "Fail";
				clearRequests();
				tlog("ping test failed, took " + (new Date().getTime() - startT) + "ms");
				pingProgress = 1;
				done();
				return;
			}
			i++;
			if (i < settings.count_ping) doPing();
			else {
				pingProgress = 1;
				tlog("ping: " + pingStatus + " jitter: " + jitterStatus +
					" loss: " + pingPacketLoss + "%, took " + (new Date().getTime() - startT) + "ms");
				done();
			}
		}.bind(this);

		localXhr.open("GET", settings.url_ping + url_sep(settings.url_ping) + (settings.mpot ? "cors=true&" : "") + "r=" + Math.random(), true);
		localXhr.send();
	}.bind(this);
	doPing();
}

function sendTelemetry(done) {
	if (settings.telemetry_level < 1) return;
	xhr = new XMLHttpRequest();
	xhr.onload = function() {
		try {
			const parts = xhr.responseText.split(" ");
			if (parts[0] == "id") {
				try {
					let id = parts[1];
					done(id);
				} catch (e) {
					done(null);
				}
			} else done(null);
		} catch (e) {
			done(null);
		}
	};
	xhr.onerror = function() {
		console.log("TELEMETRY ERROR " + xhr.status);
		done(null);
	};
	xhr.open("POST", settings.url_telemetry + url_sep(settings.url_telemetry) + (settings.mpot ? "cors=true&" : "") + "r=" + Math.random(), true);
	const telemetryIspInfo = {
		processedString: clientIp,
		rawIspInfo: typeof ispInfo === "object" ? ispInfo : ""
	};
	try {
		const fd = new FormData();
		fd.append("ispinfo", JSON.stringify(telemetryIspInfo));
		fd.append("dl", dlStatus);
		fd.append("ul", ulStatus);
		fd.append("ping", pingStatus);
		fd.append("jitter", jitterStatus);
		fd.append("log", settings.telemetry_level > 1 ? log : "");
		fd.append("extra", settings.telemetry_extra);
		xhr.send(fd);
	} catch (ex) {
		const postData = "extra=" + encodeURIComponent(settings.telemetry_extra) + "&ispinfo=" + encodeURIComponent(JSON.stringify(telemetryIspInfo)) + "&dl=" + encodeURIComponent(dlStatus) + "&ul=" + encodeURIComponent(ulStatus) + "&ping=" + encodeURIComponent(pingStatus) + "&jitter=" + encodeURIComponent(jitterStatus) + "&log=" + encodeURIComponent(settings.telemetry_level > 1 ? log : "");
		xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
		xhr.send(postData);
	}
}