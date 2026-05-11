const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 8080;
const DIST = path.join(__dirname, "dist");

const MIME = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json",
};

function serve(res, filePath) {
  const ext = path.extname(filePath);
  const mime = MIME[ext] || "application/octet-stream";

  try {
    const data = fs.readFileSync(filePath);
    const headers = { "Content-Type": mime };

    // Cache static assets aggressively, HTML never
    if (ext !== ".html") {
      headers["Cache-Control"] = "public, max-age=31536000, immutable";
    } else {
      headers["Cache-Control"] = "no-cache";
    }

    res.writeHead(200, headers);
    res.end(data);
  } catch {
    return false;
  }
  return true;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let filePath = path.join(DIST, url.pathname);

  // Try exact file
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    serve(res, filePath);
    return;
  }

  // Try with index.html in directory
  const indexPath = path.join(filePath, "index.html");
  if (fs.existsSync(indexPath)) {
    serve(res, indexPath);
    return;
  }

  // SPA fallback — serve root index.html for all routes
  const rootIndex = path.join(DIST, "index.html");
  if (fs.existsSync(rootIndex)) {
    serve(res, rootIndex);
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`Hitster serving on port ${PORT}`);
});
