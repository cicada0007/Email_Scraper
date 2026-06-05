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
  btnExportVerified: document.getElementById("btn-export-verified"),
  filterChips: document.querySelectorAll(".chip[data-filter]"),
};

let lastData = { records: [] };
let verificationFilter = "all";

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
  a.download = "emailscout-dashboard.csv";
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
  const tr = document.createElement("tr");
  tr.className = v.verified ? "row-verified" : `row-${v.tier}`;
  tr.innerHTML = `
    <td class="status-cell" title="${v.label}">${v.icon} ${v.verified ? "Verified" : v.label}</td>
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

els.filter.addEventListener("input", () => renderRows(lastData.records || []));
els.groupDomain.addEventListener("change", () => renderRows(lastData.records || []));
els.btnRefresh.addEventListener("click", refresh);
els.btnExport.addEventListener("click", () => {
  const list = getFiltered(lastData.records || []);
  if (!list.length) return alert("No emails to export");
  exportCsv(list);
});

refresh();
setInterval(refresh, 2000);
