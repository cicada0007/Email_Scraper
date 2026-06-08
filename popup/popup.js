import { exportCSV, copyToClipboard } from "../utils/export.js";
import { STORAGE_KEY } from "../utils/storage.js";
import { verifyEmail } from "../utils/validate.js";
import {
  generateSearchQueries,
  googleSearchUrl,
} from "../utils/query-generator.js";

const $ = (sel) => document.querySelector(sel);

const els = {
  statText: $("#stat-text"),
  liveBadge: $("#live-badge"),
  lastScrape: $("#last-scrape"),
  emailList: $("#email-list"),
  emptyState: $("#empty-state"),
  search: $("#search"),
  groupByDomain: $("#group-by-domain"),
  accumulateMode: $("#accumulate-mode"),
  persistLocal: $("#persist-local"),
  autoSave: $("#auto-save"),
  status: $("#status"),
  btnCopy: $("#btn-copy"),
  btnCsv: $("#btn-csv"),
  btnClear: $("#btn-clear"),
  btnHelp: $("#btn-help"),
  helpDialog: $("#help-dialog"),
  helpClose: $("#help-close"),
  nicheInput: $("#niche-input"),
  btnGenerate: $("#btn-generate"),
  queryList: $("#query-list"),
  pageCount: $("#page-count"),
  pageCountVal: $("#page-count-val"),
  btnScrapeAll: $("#btn-scrape-all"),
  progressWrap: $("#progress-wrap"),
  progressFill: $("#progress-fill"),
  progressText: $("#progress-text"),
  historyList: $("#history-list"),
  historyEmpty: $("#history-empty"),
  dashboardSync: $("#dashboard-sync"),
  tabs: document.querySelectorAll(".tab"),
  panelEmails: $("#panel-emails"),
  panelTools: $("#panel-tools"),
  verifyBadge: $("#verify-badge"),
  verifySummary: $("#verify-summary"),
  btnVerifyRun: $("#btn-verify-run"),
  btnCopyVerified: $("#btn-copy-verified"),
  btnCsvVerified: $("#btn-csv-verified"),
  filterChips: document.querySelectorAll(".chip[data-filter]"),
  verifyProgress: $("#verify-progress"),
  verifyBarFill: $("#verify-bar-fill"),
  verifyProgressText: $("#verify-progress-text"),
};

/** @type {import('../utils/storage.js').EmailRecord[]} */
let allRecords = [];
let lastCount = 0;
let lastUpdatedAt = null;
let activeTabId = null;
let storageKey = null;
let verificationFilter = "all";
let isVerifying = false;
const collapsedDomains = new Set();

/**
 * Stores deep (MX-checked) verification results keyed by email address.
 * Populated after "Run MX verification" completes.
 * @type {Map<string, {tier: string, verified: boolean, label: string, icon: string}>}
 */
const deepVerifyResults = new Map();

/**
 * Returns the best available verification result for an address:
 * deep MX result if it exists, otherwise the instant static result.
 * @param {string} address
 */
function getEffectiveTierResult(address) {
  return deepVerifyResults.get(address) || verifyEmail(address);
}

function setStatus(msg, isError = false) {
  els.status.textContent = msg;
  els.status.classList.toggle("error", isError);
  if (msg && !isError) {
    setTimeout(() => {
      if (els.status.textContent === msg) els.status.textContent = "";
    }, 2200);
  }
}

function formatTimestamp(ms) {
  if (!ms) return "Not scanned yet";
  return `Last scrape: ${new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })}`;
}

function pulseBadge() {
  els.liveBadge.classList.remove("pulse");
  void els.liveBadge.offsetWidth;
  els.liveBadge.classList.add("pulse");
  els.liveBadge.addEventListener(
    "animationend",
    () => els.liveBadge.classList.remove("pulse"),
    { once: true }
  );
}

function updateStats(count, updatedAt) {
  els.statText.textContent = count === 1 ? "email found" : "emails found";
  els.liveBadge.textContent = count > 99 ? "99+" : String(count);
  if (count !== lastCount) {
    if (count > lastCount) pulseBadge();
    lastCount = count;
  }
  if (updatedAt !== lastUpdatedAt) {
    els.lastScrape.textContent = formatTimestamp(updatedAt);
    lastUpdatedAt = updatedAt;
  }
}

function getFilteredRecords() {
  let list = allRecords;

  if (verificationFilter !== "all") {
    list = list.filter((r) => {
      const result = getEffectiveTierResult(r.address);
      if (verificationFilter === "verified") return result.verified;
      return result.tier === verificationFilter;
    });
  }

  const q = els.search.value.trim().toLowerCase();
  if (!q) return list;
  return list.filter(
    (r) =>
      r.address.includes(q) ||
      r.domain.includes(q) ||
      r.pageUrl.toLowerCase().includes(q)
  );
}

function updateVerificationStats() {
  const summary = { total: allRecords.length, verified: 0, noMx: 0, role: 0, disposable: 0, invalid: 0 };

  for (const r of allRecords) {
    const result = getEffectiveTierResult(r.address);
    if (result.verified) summary.verified++;
    else if (result.tier === "no-mx") summary.noMx++;
    else if (result.tier === "role") summary.role++;
    else if (result.tier === "disposable") summary.disposable++;
    else summary.invalid++;
  }

  const hasMxData = deepVerifyResults.size > 0;

  if (els.verifyBadge) {
    els.verifyBadge.textContent = `${summary.verified} verified`;
    els.verifyBadge.classList.toggle("has-verified", summary.verified > 0);
  }
  if (els.verifySummary) {
    const parts = [`${summary.verified} verified`];
    if (hasMxData && summary.noMx > 0) parts.push(`${summary.noMx} no-MX`);
    if (summary.role > 0) parts.push(`${summary.role} role`);
    if (summary.disposable > 0) parts.push(`${summary.disposable} blocked`);
    if (summary.invalid > 0) parts.push(`${summary.invalid} invalid`);
    parts.push(`of ${summary.total}`);
    const hint = hasMxData ? "" : " · click Run MX to deep-check domains";
    els.verifySummary.textContent = parts.join(" · ") + hint;
  }
}

function groupByDomain(records) {
  const groups = new Map();
  for (const r of records) {
    const domain = r.domain || "unknown";
    if (!groups.has(domain)) groups.set(domain, []);
    groups.get(domain).push(r);
  }
  return [...groups.entries()].sort(([a], [b]) => b[1].length - a[1].length);
}

async function copyRecord(record, rowEl) {
  await copyToClipboard([record]);
  rowEl.classList.add("copied");
  setStatus(`Copied ${record.address}`);
  setTimeout(() => rowEl.classList.remove("copied"), 900);
}

function createEmailRow(record) {
  const { tier, label, icon } = getEffectiveTierResult(record.address);
  const row = document.createElement("div");
  row.className = `email-row tier-${tier}`;
  row.setAttribute("role", "listitem");
  row.title = `${label}${record.pageUrl ? ` · ${record.pageUrl}` : ""}`;

  const dot = document.createElement("span");
  dot.className = `tier-dot tier-${tier}`;
  dot.textContent = icon;
  dot.setAttribute("aria-hidden", "true");

  const addr = document.createElement("span");
  addr.className = "email-addr";
  addr.textContent = record.address;

  row.append(dot, addr);
  row.addEventListener("click", () => copyRecord(record, row));
  return row;
}

function renderList() {
  const filtered = getFilteredRecords();
  els.emailList.innerHTML = "";

  const showEmpty = allRecords.length === 0 || filtered.length === 0;
  els.emptyState.classList.toggle("hidden", !showEmpty);
  els.emptyState.textContent =
    allRecords.length === 0
      ? "No emails found yet. Open a Google SERP."
      : "No emails match your filter.";

  if (showEmpty) return;

  if (els.groupByDomain.checked) {
    for (const [domain, records] of groupByDomain(filtered)) {
      const group = document.createElement("div");
      group.className = "domain-group";

      const collapsed = collapsedDomains.has(domain);
      if (collapsed) group.classList.add("collapsed");

      const header = document.createElement("button");
      header.type = "button";
      header.className = "domain-header";
      header.innerHTML = `<span class="domain-chevron">${collapsed ? "▶" : "▼"}</span> ${domain} <span class="domain-count">(${records.length} emails)</span>`;
      header.addEventListener("click", () => {
        if (collapsedDomains.has(domain)) collapsedDomains.delete(domain);
        else collapsedDomains.add(domain);
        renderList();
      });

      const body = document.createElement("div");
      body.className = "domain-body";
      for (const record of records.sort((a, b) =>
        a.address.localeCompare(b.address)
      )) {
        body.appendChild(createEmailRow(record));
      }

      group.append(header, body);
      els.emailList.appendChild(group);
    }
  } else {
    for (const record of filtered) {
      els.emailList.appendChild(createEmailRow(record));
    }
  }
}

function applyData(data) {
  allRecords =
    data.records ||
    (data.emails || []).map((address) => ({
      address,
      domain: address.split("@")[1] || "",
      pageUrl: "",
      foundAt: data.updatedAt || Date.now(),
    }));

  updateStats(data.count ?? allRecords.length, data.updatedAt ?? null);
  updateVerificationStats();
  renderList();
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function sendMessage(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (response) => {
      if (chrome.runtime.lastError) resolve(null);
      else resolve(response);
    });
  });
}

async function fetchEmails(tabId) {
  return (
    (await sendMessage({ type: "GET_EMAILS", tabId })) || {
      records: [],
      count: 0,
      updatedAt: null,
    }
  );
}

async function requestFreshScan(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "SCAN_PAGE" });
  } catch {
    /* unavailable */
  }
}

async function load() {
  const tab = await getActiveTab();
  activeTabId = tab?.id ?? null;
  storageKey = activeTabId != null ? STORAGE_KEY(activeTabId) : null;

  const settings = (await sendMessage({ type: "GET_SETTINGS" }))?.settings || {};
  els.accumulateMode.checked = Boolean(settings.accumulateMode);
  els.persistLocal.checked = Boolean(settings.persistLocal);
  els.autoSave.checked = settings.autoSaveEnabled !== false;
  if (els.dashboardSync) {
    els.dashboardSync.checked = settings.dashboardSyncEnabled !== false;
  }

  if (activeTabId != null) {
    await requestFreshScan(activeTabId);
    applyData(await fetchEmails(activeTabId));
  } else {
    applyData({ records: [], count: 0, updatedAt: null });
  }

  await loadSearchHistory();
}

async function loadSearchHistory() {
  const res = await sendMessage({ type: "GET_SEARCH_HISTORY" });
  const history = res?.history || [];
  els.historyList.innerHTML = "";
  els.historyEmpty.classList.toggle("hidden", history.length > 0);

  for (const entry of history) {
    const li = document.createElement("li");
    li.className = "history-item";
    li.innerHTML = `
      <span class="history-query" title="${entry.query}">${entry.query}</span>
      <span class="history-meta">${entry.emailCount} emails</span>
      <button type="button" class="btn-history-run">Re-run</button>
    `;
    li.querySelector(".btn-history-run").addEventListener("click", () => {
      chrome.tabs.create({ url: entry.url || googleSearchUrl(entry.query) });
    });
    els.historyList.appendChild(li);
  }
}

function renderQueries(queries) {
  els.queryList.innerHTML = "";
  if (!queries.length) return;

  for (const item of queries) {
    const li = document.createElement("li");
    li.className = "query-item";
    li.innerHTML = `
      <span class="query-label">${item.label}</span>
      <code class="query-text">${item.query}</code>
      <button type="button" class="btn-query-open">Open in Google</button>
    `;
    li.querySelector(".btn-query-open").addEventListener("click", () => {
      chrome.tabs.create({ url: googleSearchUrl(item.query) });
    });
    els.queryList.appendChild(li);
  }
}

function setupTabs() {
  els.tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const name = tab.dataset.tab;
      els.tabs.forEach((t) => t.classList.toggle("active", t === tab));
      els.panelEmails.classList.toggle("active", name === "emails");
      els.panelEmails.hidden = name !== "emails";
      els.panelTools.classList.toggle("active", name === "tools");
      els.panelTools.hidden = name !== "tools";
      if (name === "tools") loadSearchHistory();
    });
  });
}

function setupProgressListener() {
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type !== "SCRAPE_PROGRESS") return;

    const { page, total, status } = msg;
    els.progressWrap.classList.remove("hidden");

    if (status === "done" || status === "no_next") {
      const pct = 100;
      els.progressFill.style.width = `${pct}%`;
      els.progressText.textContent =
        status === "no_next"
          ? `Finished at page ${page} (no more results)`
          : `Done — scraped ${total} page(s)`;
      els.btnScrapeAll.disabled = false;
      if (activeTabId != null) {
        fetchEmails(activeTabId).then(applyData);
      }
      setTimeout(() => els.progressWrap.classList.add("hidden"), 3000);
      return;
    }

    const pct = total ? Math.round((page / total) * 100) : 0;
    els.progressFill.style.width = `${pct}%`;
    els.progressText.textContent =
      status === "waiting"
        ? `Waiting before page ${page + 1}/${total}…`
        : `Scraping page ${page}/${total}…`;
  });
}

function handleStorageChange(changes, area) {
  if (!storageKey || !changes[storageKey]) return;
  if (area !== "local" && area !== "session") return;
  const entry = changes[storageKey].newValue;
  if (!entry) {
    applyData({ records: [], count: 0, updatedAt: null });
    return;
  }
  applyData({
    records: entry.records || [],
    count: entry.records?.length || 0,
    updatedAt: entry.updatedAt ?? null,
  });
}

async function saveSettingsFromUI() {
  await sendMessage({
    type: "SET_SETTINGS",
    settings: {
      accumulateMode: els.accumulateMode.checked,
      persistLocal: els.persistLocal.checked,
      autoSaveEnabled: els.autoSave.checked,
      dashboardSyncEnabled: els.dashboardSync?.checked ?? true,
    },
  });
  setStatus("Settings saved");
}

const DASHBOARD_URL = "http://localhost:3847";


els.dashboardSync?.addEventListener("change", saveSettingsFromUI);

// Events
els.search.addEventListener("input", renderList);
els.groupByDomain.addEventListener("change", renderList);

els.filterChips?.forEach((chip) => {
  chip.addEventListener("click", () => {
    els.filterChips.forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    verificationFilter = chip.dataset.filter || "all";
    renderList();
    const label =
      verificationFilter === "verified"
        ? "Showing verified emails only"
        : verificationFilter === "all"
          ? "Showing all emails"
          : `Showing ${verificationFilter} emails`;
    setStatus(label);
  });
});

function setVerifyProgress(pct, text) {
  if (!els.verifyProgress || !els.verifyBarFill || !els.verifyProgressText) return;
  els.verifyProgress.classList.remove("hidden");
  els.verifyBarFill.style.width = `${pct}%`;
  els.verifyProgressText.textContent = text;
}

function hideVerifyProgress() {
  els.verifyProgress?.classList.add("hidden");
  if (els.verifyBarFill) els.verifyBarFill.style.width = "0%";
}

function setupVerifyListener() {
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "VERIFY_PROGRESS") {
      if (msg.phase === "instant") {
        // Apply instant results immediately so rows update before MX starts
        for (const [address, result] of Object.entries(msg.results || {})) {
          deepVerifyResults.set(address, result);
        }
        updateVerificationStats();
        renderList();
        setVerifyProgress(0, `Checking ${msg.domainsTotal || "…"} domains via DNS…`);
      } else if (msg.phase === "mx") {
        const pct = msg.domainsTotal > 0
          ? Math.round((msg.domainsDone / msg.domainsTotal) * 100)
          : 0;
        setVerifyProgress(pct, `DNS lookup: ${msg.domainsDone}/${msg.domainsTotal} domains`);
      }
    }

    if (msg.type === "VERIFY_COMPLETE") {
      isVerifying = false;
      if (els.btnVerifyRun) {
        els.btnVerifyRun.disabled = false;
        els.btnVerifyRun.textContent = "Run MX verification";
      }

      for (const [address, result] of Object.entries(msg.results || {})) {
        deepVerifyResults.set(address, result);
      }

      updateVerificationStats();
      renderList();

      // Switch to verified filter to show confirmed results
      verificationFilter = "verified";
      els.filterChips?.forEach((c) => {
        c.classList.toggle("active", c.dataset.filter === "verified");
      });
      renderList();

      const verified = [...deepVerifyResults.values()].filter((r) => r.verified).length;
      const noMx = [...deepVerifyResults.values()].filter((r) => r.tier === "no-mx").length;

      setVerifyProgress(100, `Done — ${verified} verified · ${noMx} no-MX domains filtered`);
      setTimeout(hideVerifyProgress, 4000);

      setStatus(`MX check complete: ${verified} deliverable emails found`);
    }
  });
}

els.btnVerifyRun?.addEventListener("click", async () => {
  if (isVerifying) return;
  if (!allRecords.length) return setStatus("No emails to verify.", true);

  isVerifying = true;
  deepVerifyResults.clear();

  if (els.btnVerifyRun) {
    els.btnVerifyRun.disabled = true;
    els.btnVerifyRun.textContent = "Verifying…";
  }

  const uniqueDomains = [...new Set(allRecords.map((r) => r.domain).filter(Boolean))];
  setVerifyProgress(0, `Starting — ${uniqueDomains.length} unique domain(s) to check`);

  const res = await sendMessage({
    type: "VERIFY_EMAILS",
    records: allRecords.map((r) => ({ address: r.address, domain: r.domain })),
  });

  if (!res?.ok) {
    isVerifying = false;
    if (els.btnVerifyRun) {
      els.btnVerifyRun.disabled = false;
      els.btnVerifyRun.textContent = "Run MX verification";
    }
    hideVerifyProgress();
    setStatus("Verification failed — reload the extension.", true);
  }
});

function getVerifiedRecords() {
  return allRecords.filter((r) => getEffectiveTierResult(r.address).verified);
}

els.btnCopyVerified?.addEventListener("click", async () => {
  const list = getVerifiedRecords();
  if (!list.length) return setStatus("No verified emails.", true);
  await copyToClipboard(list);
  setStatus(`Copied ${list.length} verified email(s)`);
});

els.btnCsvVerified?.addEventListener("click", () => {
  const list = getVerifiedRecords();
  if (!list.length) return setStatus("No verified emails.", true);
  exportCSV(list, "touchmail-verified.csv");
  setStatus(`Exported ${list.length} verified email(s)`);
});

els.btnCopy.addEventListener("click", async () => {
  const list = getFilteredRecords();
  if (!list.length) return setStatus("Nothing to copy.", true);
  await copyToClipboard(list);
  setStatus(`Copied ${list.length} email(s)`);
});

els.btnCsv.addEventListener("click", () => {
  const list = getFilteredRecords();
  if (!list.length) return setStatus("Nothing to export.", true);
  exportCSV(list, "touchmail-export.csv");
  setStatus(`Exported ${list.length} email(s)`);
});

els.btnClear.addEventListener("click", async () => {
  if (activeTabId == null) return;
  const res = await sendMessage({ type: "CLEAR_EMAILS", tabId: activeTabId });
  applyData({ records: [], count: 0, updatedAt: null, ...res });
  setStatus("Cleared");
});

els.accumulateMode.addEventListener("change", saveSettingsFromUI);
els.persistLocal.addEventListener("change", saveSettingsFromUI);
els.autoSave.addEventListener("change", saveSettingsFromUI);

els.btnGenerate.addEventListener("click", () => {
  const queries = generateSearchQueries(els.nicheInput.value);
  if (!queries.length) return setStatus("Enter a niche to generate queries.", true);
  renderQueries(queries);
  setStatus(`Generated ${queries.length} queries`);
});

els.pageCount.addEventListener("input", () => {
  els.pageCountVal.textContent = els.pageCount.value;
});

els.btnScrapeAll.addEventListener("click", async () => {
  if (activeTabId == null) return setStatus("No active tab.", true);

  const pageCount = Number(els.pageCount.value);
  els.btnScrapeAll.disabled = true;
  els.progressWrap.classList.remove("hidden");
  els.progressText.textContent = "Starting…";
  els.progressFill.style.width = "0%";

  try {
    const res = await chrome.tabs.sendMessage(activeTabId, {
      type: "START_SCRAPE_ALL",
      pageCount,
    });
    if (res?.error) setStatus(res.error, true);
    else setStatus(`Scraping up to ${pageCount} pages…`);
  } catch {
    setStatus("Open a Google Search page first.", true);
    els.btnScrapeAll.disabled = false;
    els.progressWrap.classList.add("hidden");
  }
});

els.btnHelp.addEventListener("click", () => els.helpDialog.showModal());
els.helpClose.addEventListener("click", () => els.helpDialog.close());

chrome.storage.onChanged.addListener((changes, area) => {
  handleStorageChange(changes, area);
  if (changes.touchmail_search_history) loadSearchHistory();
});

setupTabs();
setupProgressListener();
setupVerifyListener();
load();
setInterval(async () => {
  if (activeTabId == null) return;
  applyData(await fetchEmails(activeTabId));
}, 2500);
