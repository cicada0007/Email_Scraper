const API = "";

const els = {
  statusPill: document.getElementById("status-pill"),
  statCount: document.getElementById("stat-count"),
  statVerified: document.getElementById("stat-verified"),
  statRejected: document.getElementById("stat-rejected"),
  statUpdated: document.getElementById("stat-updated"),
  verifyDetail: document.getElementById("verify-detail"),
  tableBody: document.getElementById("table-body"),
  emptyMsg: document.getElementById("empty-msg"),
  filter: document.getElementById("filter"),
  groupDomain: document.getElementById("group-domain"),
  btnRefresh: document.getElementById("btn-refresh"),
  btnExport: document.getElementById("btn-export"),
  btnVerify: document.getElementById("btn-verify"),
  btnSmtpVerify: document.getElementById("btn-smtp-verify"),
  btnExportVerified: document.getElementById("btn-export-verified"),
  filterChips: document.querySelectorAll(".chip[data-filter]"),
  smtpProgress: document.getElementById("smtp-progress"),
  smtpProgressFill: document.getElementById("smtp-progress-fill"),
  smtpProgressLabel: document.getElementById("smtp-progress-label"),
  dropZone: document.getElementById("drop-zone"),
  csvFileInput: document.getElementById("csv-file-input"),
  browseBtn: document.getElementById("browse-btn"),
  pasteInput: document.getElementById("paste-input"),
  btnImport: document.getElementById("btn-import"),
  btnClearImported: document.getElementById("btn-clear-imported"),
  importStatus: document.getElementById("import-status"),
};

let lastData = { records: [] };
let verificationFilter = "all";

/** @type {Map<string, {status:string, detail:string}>} */
const smtpResults = new Map();

const SMTP_BADGE = {
  live:     { cls: "smtp-live",     text: "✅ SMTP Live" },
  rejected: { cls: "smtp-rejected", text: "❌ Dead Mailbox" },
  unknown:  { cls: "smtp-unknown",  text: "⚠️ SMTP Unknown" },
  "no-mx":  { cls: "smtp-no-mx",   text: "🔴 No MX" },
  timeout:  { cls: "smtp-timeout",  text: "⏱ Timeout" },
  error:    { cls: "smtp-error",    text: "⚫ Error" },
};

async function fetchData() {
  const res = await fetch(`${API}/api/data`);
  if (!res.ok) throw new Error("API error");
  return res.json();
}

function formatTime(ms) {
  if (!ms) return "—";
  return new Date(ms).toLocaleString();
}

function escapeCsv(v) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportCsv(records) {
  const header = "Status,Email Address,Domain,Found At,Timestamp\n";
  const rows = records
    .map((r) => {
      const v = window.EmailVerify.verifyEmail(r.address);
      return [
        escapeCsv(v.label),
        escapeCsv(r.address),
        escapeCsv(r.domain),
        escapeCsv(r.pageUrl),
        escapeCsv(r.foundAt ? new Date(r.foundAt).toISOString() : ""),
      ].join(",");
    })
    .join("\n");
  const blob = new Blob([header + rows], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "touchmail-dashboard.csv";
  a.click();
}

function applyVerificationFilter(records) {
  if (verificationFilter === "all") return records;
  return records.filter((r) => {
    const v = window.EmailVerify.verifyEmail(r.address);
    if (verificationFilter === "verified") return v.verified;
    return v.tier === verificationFilter;
  });
}

function getFiltered(records) {
  let list = applyVerificationFilter(records);
  const q = els.filter.value.trim().toLowerCase();
  if (!q) return list;
  return list.filter(
    (r) =>
      r.address?.includes(q) ||
      r.domain?.includes(q) ||
      r.pageUrl?.toLowerCase().includes(q)
  );
}

function updateVerifyStats(records) {
  const addresses = records.map((r) => r.address);
  const { summary } = window.EmailVerify.verifyEmailList(addresses);
  els.statVerified.textContent = String(summary.verified);
  els.statRejected.textContent = String(
    summary.role + summary.disposable + summary.invalid
  );
  if (els.verifyDetail) {
    els.verifyDetail.textContent = `${summary.verified} verified · ${summary.role} role · ${summary.disposable} blocked · ${summary.invalid} invalid (of ${summary.total})`;
  }
}

function renderRows(records) {
  els.tableBody.innerHTML = "";
  const filtered = getFiltered(records);

  els.emptyMsg.classList.toggle("hidden", filtered.length > 0);
  els.emptyMsg.textContent =
    verificationFilter === "verified"
      ? "No verified emails. Run verification or scrape more results."
      : "No emails match this filter.";

  if (!filtered.length) return;

  if (els.groupDomain.checked) {
    const groups = new Map();
    for (const r of filtered) {
      const d = r.domain || "unknown";
      if (!groups.has(d)) groups.set(d, []);
      groups.get(d).push(r);
    }

    for (const [domain, list] of [...groups.entries()].sort(
      (a, b) => b[1].length - a[1].length
    )) {
      const header = document.createElement("tr");
      header.className = "domain-header";
      header.innerHTML = `<td colspan="5">${domain} (${list.length} emails)</td>`;
      els.tableBody.appendChild(header);

      for (const r of list.sort((a, b) => a.address.localeCompare(b.address))) {
        els.tableBody.appendChild(createRow(r));
      }
    }
  } else {
    for (const r of filtered) {
      els.tableBody.appendChild(createRow(r));
    }
  }
}

function createRow(r) {
  const v = window.EmailVerify.verifyEmail(r.address);
  const smtp = smtpResults.get(r.address.toLowerCase());
  const smtpBadge = smtp ? SMTP_BADGE[smtp.status] || SMTP_BADGE.error : null;

  let rowClass = v.verified ? "row-verified" : `row-${v.tier}`;
  if (smtp && smtp.status === "rejected") rowClass = "row-smtp-rejected";

  const smtpHtml = smtpBadge
    ? `<span class="smtp-badge ${smtpBadge.cls}" title="${smtp.detail}">${smtpBadge.text}</span>`
    : "";

  const tr = document.createElement("tr");
  tr.className = rowClass;
  tr.innerHTML = `
    <td class="status-cell" title="${v.label}">${v.icon} ${v.verified ? "Verified" : v.label}${smtpHtml}</td>
    <td class="addr">${r.address}</td>
    <td>${r.domain || "—"}</td>
    <td class="url" title="${r.pageUrl || ""}">${r.pageUrl || "—"}</td>
    <td>${formatTime(r.foundAt)}</td>
  `;
  return tr;
}

function render(data) {
  lastData = data;
  const records = data.records || [];
  els.statCount.textContent = String(data.count ?? 0);
  els.statUpdated.textContent = formatTime(data.updatedAt);
  updateVerifyStats(records);
  renderRows(records);
}

async function refresh() {
  try {
    const data = await fetchData();
    render(data);
    els.statusPill.textContent = "Live";
    els.statusPill.className = "status-pill live";
  } catch {
    els.statusPill.textContent = "Server offline";
    els.statusPill.className = "status-pill offline";
  }
}

els.filterChips.forEach((chip) => {
  chip.addEventListener("click", () => {
    els.filterChips.forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    verificationFilter = chip.dataset.filter || "all";
    renderRows(lastData.records || []);
  });
});

els.btnVerify.addEventListener("click", () => {
  verificationFilter = "verified";
  els.filterChips.forEach((c) => {
    c.classList.toggle("active", c.dataset.filter === "verified");
  });
  const { summary } = window.EmailVerify.verifyEmailList(
    (lastData.records || []).map((r) => r.address)
  );
  updateVerifyStats(lastData.records || []);
  renderRows(lastData.records || []);
  alert(
    `Verification complete\n\n✓ ${summary.verified} verified\n🟡 ${summary.role} role-based\n🔴 ${summary.disposable} disposable\n⚪ ${summary.invalid} invalid`
  );
});

els.btnExportVerified.addEventListener("click", () => {
  const verified = (lastData.records || []).filter(
    (r) => window.EmailVerify.verifyEmail(r.address).verified
  );
  if (!verified.length) return alert("No verified emails to export");
  exportCsv(verified);
});

els.btnSmtpVerify.addEventListener("click", async () => {
  const records = lastData.records || [];
  if (!records.length) return alert("No emails to verify. Scrape some results first.");

  const candidates = records
    .map((r) => r.address.toLowerCase().trim())
    .filter((a) => a.includes("@"));

  if (!candidates.length) return alert("No valid email addresses found.");

  els.btnSmtpVerify.disabled = true;
  els.btnSmtpVerify.textContent = "Pinging…";
  els.smtpProgress.classList.remove("hidden");
  els.smtpProgressFill.style.width = "0%";

  const BATCH = 20;
  let done = 0;

  try {
    for (let i = 0; i < candidates.length; i += BATCH) {
      const batch = candidates.slice(i, i + BATCH);
      els.smtpProgressLabel.textContent = `Pinging ${done + 1}–${Math.min(done + BATCH, candidates.length)} of ${candidates.length}…`;

      const res = await fetch(`${API}/api/smtp-verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails: batch }),
      });

      if (!res.ok) throw new Error("Server error: " + res.status);
      const data = await res.json();

      for (const [email, result] of Object.entries(data.results || {})) {
        smtpResults.set(email, result);
      }

      done = Math.min(i + BATCH, candidates.length);
      els.smtpProgressFill.style.width = `${Math.round((done / candidates.length) * 100)}%`;

      renderRows(lastData.records || []);
    }

    const live = [...smtpResults.values()].filter((r) => r.status === "live").length;
    const rejected = [...smtpResults.values()].filter((r) => r.status === "rejected").length;
    const unknown = [...smtpResults.values()].filter((r) => r.status === "unknown").length;
    const errors = [...smtpResults.values()].filter((r) => r.status === "error" || r.status === "timeout").length;

    els.smtpProgressLabel.textContent = `Done — ✅ ${live} live · ❌ ${rejected} dead · ⚠️ ${unknown} unknown · ⚫ ${errors} error`;
  } catch (err) {
    els.smtpProgressLabel.textContent = `Error: ${err.message}`;
  } finally {
    els.btnSmtpVerify.disabled = false;
    els.btnSmtpVerify.textContent = "🔌 SMTP Verify Live";
  }
});

els.filter.addEventListener("input", () => renderRows(lastData.records || []));
els.groupDomain.addEventListener("change", () => renderRows(lastData.records || []));
els.btnRefresh.addEventListener("click", refresh);
els.btnExport.addEventListener("click", () => {
  const list = getFiltered(lastData.records || []);
  if (!list.length) return alert("No emails to export");
  exportCsv(list);
});

// ── CSV Import ──────────────────────────────────────────────────────────────

function extractEmailsFromText(text) {
  const matches = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g) || [];
  return [...new Set(matches.map((e) => e.toLowerCase().trim()))];
}

function setImportStatus(msg, type = "") {
  els.importStatus.textContent = msg;
  els.importStatus.className = "import-status" + (type ? ` ${type}` : "");
}

async function importEmailsToStore(emails) {
  if (!emails.length) {
    setImportStatus("No valid emails found in input.", "err");
    return;
  }

  const existing = new Set((lastData.records || []).map((r) => r.address.toLowerCase()));
  const newEmails = emails.filter((e) => !existing.has(e));

  if (!newEmails.length) {
    setImportStatus(`All ${emails.length} emails already in list.`, "");
    return;
  }

  const now = Date.now();
  const records = newEmails.map((email) => ({
    address: email,
    domain: email.split("@")[1] || "",
    pageUrl: "CSV Import",
    foundAt: now,
  }));

  const res = await fetch(`${API}/api/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tabId: "__imported__", records, pageUrl: "CSV Import", updatedAt: now }),
  });

  if (!res.ok) throw new Error("Sync failed: " + res.status);

  await refresh();
  setImportStatus(`Imported ${newEmails.length} new email${newEmails.length !== 1 ? "s" : ""}${emails.length !== newEmails.length ? ` (${emails.length - newEmails.length} dupes skipped)` : ""}.`, "ok");
  els.pasteInput.value = "";
}

async function handleImportText(text) {
  setImportStatus("Parsing…");
  try {
    const emails = extractEmailsFromText(text);
    await importEmailsToStore(emails);
  } catch (err) {
    setImportStatus("Error: " + err.message, "err");
  }
}

function readFileAndImport(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => handleImportText(e.target.result);
  reader.onerror = () => setImportStatus("Failed to read file.", "err");
  reader.readAsText(file);
}

// Drop zone
els.dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  els.dropZone.classList.add("drag-over");
});
els.dropZone.addEventListener("dragleave", () => els.dropZone.classList.remove("drag-over"));
els.dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  els.dropZone.classList.remove("drag-over");
  readFileAndImport(e.dataTransfer.files[0]);
});
els.dropZone.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") els.csvFileInput.click();
});

// Browse button
els.browseBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  els.csvFileInput.click();
});
els.csvFileInput.addEventListener("change", () => {
  readFileAndImport(els.csvFileInput.files[0]);
  els.csvFileInput.value = "";
});

// Paste / textarea import
els.btnImport.addEventListener("click", () => {
  const text = els.pasteInput.value.trim();
  if (!text) {
    setImportStatus("Paste some emails or drop a file first.", "err");
    return;
  }
  handleImportText(text);
});

// Clear only imported emails
els.btnClearImported.addEventListener("click", async () => {
  try {
    await fetch(`${API}/api/clear`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tabId: "__imported__" }),
    });
    await refresh();
    setImportStatus("Imported emails cleared.", "");
  } catch (err) {
    setImportStatus("Error: " + err.message, "err");
  }
});

refresh();
setInterval(refresh, 2000);
