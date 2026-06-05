/**
 * EmailScout local dashboard — http://localhost:3847
 * Run: npm start  (or node dashboard/server.js)
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT) || 3847;
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_FILE = path.join(__dirname, "data.json");

/** @type {{ tabs: Record<string, { records: object[], pageUrl: string, updatedAt: number }>, updatedAt: number|null }} */
let store = { tabs: {}, updatedAt: null };

function loadStore() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      store = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    }
  } catch {
    store = { tabs: {}, updatedAt: null };
  }
}

function persistStore() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
}

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(res, status, data) {
  cors(res);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function getAggregated() {
  const seen = new Set();
  const allRecords = [];

  for (const tab of Object.values(store.tabs)) {
    for (const r of tab.records || []) {
      if (!seen.has(r.address)) {
        seen.add(r.address);
        allRecords.push(r);
      }
    }
  }

  allRecords.sort((a, b) => a.address.localeCompare(b.address));

  return {
    tabs: store.tabs,
    records: allRecords,
    count: allRecords.length,
    updatedAt: store.updatedAt,
    tabCount: Object.keys(store.tabs).length,
  };
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

const MIME = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

function serveStatic(req, res) {
  let filePath = req.url.split("?")[0];
  if (filePath === "/") filePath = "/index.html";
  const fullPath = path.join(PUBLIC_DIR, path.normalize(filePath));

  if (!fullPath.startsWith(PUBLIC_DIR)) {
    sendJson(res, 403, { error: "Forbidden" });
    return;
  }

  fs.readFile(fullPath, (err, data) => {
    if (err) {
      sendJson(res, 404, { error: "Not found" });
      return;
    }
    const ext = path.extname(fullPath);
    cors(res);
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  });
}

async function handleApi(req, res) {
  const url = req.url.split("?")[0];

  if (req.method === "OPTIONS") {
    cors(res);
    res.writeHead(204);
    res.end();
    return;
  }

  if (url === "/api/health" && req.method === "GET") {
    sendJson(res, 200, { ok: true, port: PORT });
    return;
  }

  if (url === "/api/data" && req.method === "GET") {
    sendJson(res, 200, getAggregated());
    return;
  }

  if (url === "/api/sync" && req.method === "POST") {
    const body = await parseBody(req);
    const tabId = String(body.tabId ?? "default");
    store.tabs[tabId] = {
      records: body.records || [],
      pageUrl: body.pageUrl || "",
      updatedAt: body.updatedAt || Date.now(),
    };
    store.updatedAt = Date.now();
    persistStore();
    sendJson(res, 200, { ok: true, ...getAggregated() });
    return;
  }

  if (url === "/api/sync-all" && req.method === "POST") {
    const body = await parseBody(req);
    store.tabs.all = {
      records: body.records || [],
      pageUrl: "",
      updatedAt: body.updatedAt || Date.now(),
    };
    store.updatedAt = Date.now();
    persistStore();
    sendJson(res, 200, { ok: true, ...getAggregated() });
    return;
  }

  if (url === "/api/clear" && req.method === "POST") {
    const body = await parseBody(req);
    if (body.tabId != null) {
      delete store.tabs[String(body.tabId)];
    } else {
      store.tabs = {};
    }
    store.updatedAt = Date.now();
    persistStore();
    sendJson(res, 200, { ok: true, ...getAggregated() });
    return;
  }

  sendJson(res, 404, { error: "Unknown API route" });
}

const server = http.createServer(async (req, res) => {
  if (req.url.startsWith("/api/")) {
    try {
      await handleApi(req, res);
    } catch (e) {
      sendJson(res, 400, { error: String(e.message) });
    }
    return;
  }
  serveStatic(req, res);
});

loadStore();

server.listen(PORT, () => {
  console.log(`\n⚡ EmailScout Dashboard`);
  console.log(`   http://localhost:${PORT}\n`);
  console.log(`   Waiting for extension sync…\n`);
});
