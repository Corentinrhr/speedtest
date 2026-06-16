const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf"
};

const PATH_ALIASES = {
  "/styling/": "/frontend/styling/",
  "/javascript/": "/frontend/javascript/",
  "/fonts/": "/frontend/fonts/",
  "/images/": "/frontend/images/",
  "/server-list.json": "/frontend/server-list.json",
  "/settings.json": "/frontend/settings.json"
};

function resolveFilePath(urlPath) {
  for (var alias in PATH_ALIASES) {
    if (urlPath === alias.slice(0, -1) || urlPath.indexOf(alias) === 0) {
      return path.join(__dirname, urlPath.replace(alias, PATH_ALIASES[alias]));
    }
  }
  return path.join(__dirname, urlPath);
}

function setCorsHeaders(res, url) {
  if (url.indexOf("cors=true") !== -1) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST");
    res.setHeader("Access-Control-Allow-Headers", "Content-Encoding, Content-Type");
  }
}

function setNoCacheHeaders(res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.setHeader("Pragma", "no-cache");
}

function handleEmpty(req, res) {
  setCorsHeaders(res, req.url);
  setNoCacheHeaders(res);
  res.setHeader("Connection", "keep-alive");
  res.writeHead(200);
  res.end();
}

function handleGarbage(req, res) {
  var url = new URL(req.url, "http://localhost:" + PORT);
  var ckSize = parseInt(url.searchParams.get("ckSize")) || 4;
  if (ckSize <= 0) ckSize = 4;
  if (ckSize > 1024) ckSize = 1024;

  setCorsHeaders(res, req.url);
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Content-Disposition", "attachment; filename=random.dat");
  setNoCacheHeaders(res);
  res.writeHead(200);

  var remaining = ckSize;
  function sendChunk() {
    if (remaining <= 0 || res.destroyed) {
      res.end();
      return;
    }
    var chunk = crypto.randomBytes(1048576);
    remaining--;
    if (res.write(chunk)) {
      setImmediate(sendChunk);
    } else {
      res.once("drain", sendChunk);
    }
  }
  sendChunk();
}

function handleGetIP(req, res) {
  setCorsHeaders(res, req.url);
  setNoCacheHeaders(res);
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  var fwd = req.headers["x-forwarded-for"];
  var ip = (fwd ? fwd.split(",")[0].trim() : "") || req.socket.remoteAddress || "unknown";
  ip = ip.replace(/^::ffff:/, "");

  res.writeHead(200);
  res.end(
    JSON.stringify({
      processedString: ip + " - Dev Server (local)",
      rawIspInfo: ""
    })
  );
}

function serveStaticFile(req, res, filePath) {
  var resolved = path.resolve(filePath);
  if (resolved.indexOf(path.resolve(__dirname)) !== 0) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.stat(resolved, function (err, stats) {
    if (err || !stats.isFile()) {
      res.writeHead(404);
      res.end("Not Found: " + req.url);
      return;
    }
    var ext = path.extname(resolved).toLowerCase();
    res.setHeader("Content-Type", MIME_TYPES[ext] || "application/octet-stream");
    res.writeHead(200);
    fs.createReadStream(resolved).pipe(res);
  });
}

http
  .createServer(function (req, res) {
    var url = new URL(req.url, "http://localhost:" + PORT);
    var pathname = url.pathname;
    var ts = new Date().toLocaleTimeString();
    console.log("[" + ts + "] " + req.method + " " + pathname);

    if (pathname === "/backend/empty.php") {
      if (req.method === "POST") {
        req.on("data", function () {});
        req.on("end", function () {
          handleEmpty(req, res);
        });
      } else {
        handleEmpty(req, res);
      }
      return;
    }
    if (pathname === "/backend/garbage.php") {
      handleGarbage(req, res);
      return;
    }
    if (pathname === "/backend/getIP.php") {
      handleGetIP(req, res);
      return;
    }

    var filePath = pathname === "/" ? path.join(__dirname, "index.html") : resolveFilePath(pathname);
    serveStaticFile(req, res, filePath);
  })
  .listen(PORT, function () {
    console.log("");
    console.log("  ⚡ LibreSpeed Dev Server");
    console.log("  ========================");
    console.log("  Local:   http://localhost:" + PORT);
    console.log("  Modern:  http://localhost:" + PORT + "/?design=new");
    console.log("  Classic: http://localhost:" + PORT + "/?design=old");
    console.log("");
    console.log("  Edit files and refresh browser to see changes.");
    console.log("");
  });