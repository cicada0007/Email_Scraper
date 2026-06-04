/**
 * Phase 4 — Export engine (CSV + clipboard).
 */

/**
 * @typedef {{ address: string, domain: string, pageUrl: string, foundAt: number }} EmailRecord
 */

/**
 * @param {string} value
 * @returns {string}
 */
function escapeCsv(value) {
  const str = String(value ?? "");
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * @param {number} ms
 * @returns {string}
 */
function formatFoundAt(ms) {
  if (!ms) return "";
  return new Date(ms).toISOString();
}

/**
 * @param {EmailRecord[]|string[]} emails
 * @returns {EmailRecord[]}
 */
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

/**
 * @param {EmailRecord[]} records
 * @returns {string}
 */
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

/**
 * @param {string} content
 * @param {string} filename
 * @param {string} mime
 */
export function downloadFile(content, filename, mime = "text/csv") {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/**
 * CSV export with full columns (popup).
 * @param {EmailRecord[]|string[]} emails
 * @param {string} [filename]
 */
export function exportCSV(emails, filename = "emails.csv") {
  const csv = buildExportCsv(emails);
  downloadFile(csv, filename, "text/csv");
}

/**
 * Download from service worker via chrome.downloads.
 * @param {string} content
 * @param {string} filename
 */
export function downloadFileBackground(content, filename) {
  const dataUrl = `data:text/csv;charset=utf-8,${encodeURIComponent(content)}`;
  return chrome.downloads.download({
    url: dataUrl,
    filename,
    saveAs: false,
  });
}

/**
 * Auto-save milestone export (background).
 * @param {EmailRecord[]} emails
 * @param {number} milestone
 */
export function exportCSVMilestone(emails, milestone) {
  const csv = buildExportCsv(emails);
  return downloadFileBackground(csv, `emailscout-${milestone}-emails.csv`);
}

/**
 * Copy addresses to clipboard.
 * @param {EmailRecord[]|string[]} emails
 */
export async function copyToClipboard(emails) {
  const records = normalizeRecords(emails);
  const text = records.map((e) => e.address).join("\n");

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

/** @deprecated */
export function emailsToCsv(emails) {
  return buildExportCsv(emails);
}

/** @deprecated */
export function downloadCsv(emails, filename) {
  exportCSV(emails, filename);
}

/** @deprecated */
export function emailsToPlainText(emails) {
  return normalizeRecords(emails)
    .map((e) => e.address)
    .join("\n");
}
