/**
 * Sync scraped emails to local dashboard server.
 */

import { getSettings, getEmails, getAllEmails } from "./storage.js";

export const DEFAULT_DASHBOARD_URL = "http://localhost:3847";

/**
 * @param {string} base
 * @param {string} path
 */
function apiUrl(base, path) {
  return `${base.replace(/\/$/, "")}${path}`;
}

/**
 * @param {number} tabId
 * @param {{ records: object[], pageUrl: string, updatedAt: number }|null} data
 */
export async function syncTabToDashboard(tabId, data) {
  const settings = await getSettings();
  if (settings.dashboardSyncEnabled === false) return;

  const base = settings.dashboardUrl || DEFAULT_DASHBOARD_URL;

  try {
    await fetch(apiUrl(base, "/api/sync"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tabId,
        records: data?.records || [],
        pageUrl: data?.pageUrl || "",
        updatedAt: data?.updatedAt || Date.now(),
      }),
    });
  } catch (err) {
    console.warn("[EmailScout] Dashboard sync failed:", err.message);
  }
}

/**
 * Push all extension storage to dashboard.
 */
export async function syncAllToDashboard() {
  const settings = await getSettings();
  if (settings.dashboardSyncEnabled === false) return;

  const base = settings.dashboardUrl || DEFAULT_DASHBOARD_URL;
  const allRecords = await getAllEmails();

  try {
    await fetch(apiUrl(base, "/api/sync-all"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        records: allRecords,
        updatedAt: Date.now(),
      }),
    });
  } catch (err) {
    console.warn("[EmailScout] Dashboard full sync failed:", err.message);
  }
}

/**
 * @param {number} tabId
 */
export async function clearTabOnDashboard(tabId) {
  const settings = await getSettings();
  if (settings.dashboardSyncEnabled === false) return;

  const base = settings.dashboardUrl || DEFAULT_DASHBOARD_URL;

  try {
    await fetch(apiUrl(base, "/api/clear"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tabId }),
    });
  } catch {
    /* dashboard offline */
  }
}
