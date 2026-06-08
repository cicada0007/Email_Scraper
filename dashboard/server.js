/**
 * TouchMail local dashboard — http://localhost:3847
 * Run: npm start  (or node dashboard/server.js)
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const net = require("net");
const dns = require("dns").promises;

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

// ---------------------------------------------------------------------------
// SMTP live-inbox verification
// ---------------------------------------------------------------------------

const SMTP_TIMEOUT_MS = 12000;
const SMTP_CONCURRENCY = 5;
const SMTP_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/** @type {Map<string, {status:string, detail:string, ts:number}>} */
const smtpCache = new Map();

async function resolveMxHosts(domain) {
  try {
    const records = await dns.resolveMx(domain);
    return records.sort((a, b) => a.priority - b.priority).map((r) => r.exchange);
  } catch {
    return [];
  }
}

function smtpHandshake(host, email) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let buf = "";
    let stage = "banner";
    let settled = false;

    const finish = (result) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        socket.destroy();
        resolve(result);
      }
    };

    const timer = setTimeout(
      () => finish({ status: "timeout", detail: `Timed out on ${host}` }),
      SMTP_TIMEOUT_MS
    );

    const send = (cmd) => { try { socket.write(cmd + "\r\n"); } catch { /* ignore write errors */ } };

    const onLine = (code, isLast, text) => {
      if (!isLast) return; // wait for final line of multi-line response
      if (stage === "banner") {
        if (code === 220) { stage = "ehlo"; send("EHLO touchmail.local"); }
        else finish({ status: "error", detail: `Unexpected banner ${code}: ${text}` });
      } else if (stage === "ehlo") {
        if (code === 250) { stage = "mail"; send("MAIL FROM:<verify@touchmail.local>"); }
        else finish({ status: "error", detail: `EHLO rejected ${code}: ${text}` });
      } else if (stage === "mail") {
        if (code === 250) { stage = "rcpt"; send(`RCPT TO:<${email}>`); }
        else finish({ status: "error", detail: `MAIL FROM rejected ${code}: ${text}` });
      } else if (stage === "rcpt") {
        send("QUIT");
        if (code === 250 || code === 251) {
          finish({ status: "live", detail: "Mailbox is accepting mail" });
        } else if (code >= 550 && code <= 559) {
          finish({ status: "rejected", detail: `Mailbox does not exist (${code})` });
        } else if (code === 421 || (code >= 450 && code <= 452)) {
          finish({ status: "unknown", detail: `Temporary failure (${code}) — greylisted or rate-limited` });
        } else {
          finish({ status: "unknown", detail: `Unexpected RCPT response ${code}: ${text}` });
        }
      }
    };

    socket.on("data", (data) => {
      buf += data.toString("ascii");
      let nl;
      while ((nl = buf.indexOf("\r\n")) !== -1) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 2);
        const code = parseInt(line.slice(0, 3), 10);
        const isLast = line[3] === " " || line.length <= 3;
        if (!isNaN(code)) onLine(code, isLast, line.slice(4));
      }
    });

    socket.on("error", (err) => finish({ status: "error", detail: err.message }));
    socket.on("close", () => { if (!settled) finish({ status: "error", detail: "Connection closed unexpectedly" }); });

    socket.connect(25, host);
  });
}

async function smtpPing(email) {
  const cached = smtpCache.get(email);
  if (cached && Date.now() - cached.ts < SMTP_CACHE_TTL_MS) {
    return { status: cached.status, detail: cached.detail, fromCache: true };
  }

  const domain = email.split("@")[1];
  const hosts = await resolveMxHosts(domain);

  if (!hosts.length) {
    const r = { status: "no-mx", detail: "No MX records found for domain" };
    smtpCache.set(email, { ...r, ts: Date.now() });
    return r;
  }

  let lastResult = { status: "error", detail: "No hosts tried" };
  for (const host of hosts.slice(0, 2)) {
    lastResult = await smtpHandshake(host, email);
    if (lastResult.status !== "error" && lastResult.status !== "timeout") break;
  }

  smtpCache.set(email, { ...lastResult, ts: Date.now() });
  return lastResult;
}

async function runSmtpBatch(emails) {
  const results = {};
  for (let i = 0; i < emails.length; i += SMTP_CONCURRENCY) {
    const batch = emails.slice(i, i + SMTP_CONCURRENCY);
    const settled = await Promise.allSettled(batch.map((e) => smtpPing(e)));
    batch.forEach((email, idx) => {
      const r = settled[idx];
      results[email] = r.status === "fulfilled" ? r.value : { status: "error", detail: String(r.reason) };
    });
  }
  return results;
}

// ---------------------------------------------------------------------------

const MIME = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
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

  if (url === "/api/smtp-verify" && req.method === "POST") {
    const body = await parseBody(req);
    const emails = (Array.isArray(body.emails) ? body.emails : [])
      .map((e) => String(e).toLowerCase().trim())
      .filter((e) => e.includes("@"))
      .slice(0, 500);
    const results = await runSmtpBatch(emails);
    sendJson(res, 200, { ok: true, results });
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
  console.log(`\n TouchMail Dashboard`);
  console.log(`   http://localhost:${PORT}\n`);
  console.log(`   Waiting for extension sync…\n`);
});

module.exports = { server, PORT };
