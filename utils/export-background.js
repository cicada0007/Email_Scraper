/**
 * Service-worker-safe export helpers (no DOM APIs).
 */

function escapeCsv(value) {
  const str = String(value ?? "");
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function formatFoundAt(ms) {
  if (!ms) return "";
  return new Date(ms).toISOString();
}

function normalizeRecords(emails) {
  if (!emails?.length) return [];
  if (typeof emails[0] === "string") {
    return emails.map((address) => ({
      address: String(address).toLowerCase(),
      domain: String(address).split("@")[1] || "",
      pageUrl: "",
      foundAt: Date.now(),
    }));
  }
  return emails;
}

export function buildExportCsv(records) {
  const header = "Email Address,Domain,Found At,Timestamp\n";
  const rows = normalizeRecords(records)
    .map((e) =>
      [
        escapeCsv(e.address),
        escapeCsv(e.domain),
        escapeCsv(e.pageUrl),
        escapeCsv(formatFoundAt(e.foundAt)),
      ].join(",")
    )
    .join("\n");
  return header + rows;
}

export function downloadFileBackground(content, filename) {
  const dataUrl = `data:text/csv;charset=utf-8,${encodeURIComponent(content)}`;
  return chrome.downloads.download({
    url: dataUrl,
    filename,
    saveAs: false,
  });
}

export function exportCSVMilestone(emails, milestone) {
  const csv = buildExportCsv(emails);
  return downloadFileBackground(csv, `emailscout-${milestone}-emails.csv`);
}
