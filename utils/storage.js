/**
 * Phase 4 — Storage layer (session default, local optional).
 * @typedef {{ address: string, domain: string, pageUrl: string, foundAt: number }} EmailRecord
 */

export const STORAGE_KEY = (tabId) => `emails_tab_${tabId}`;

const SETTINGS_KEY = "emailscout_settings";
const MILESTONES_KEY = "emailscout_milestones";
const TAB_INDEX_KEY = "emailscout_tab_index";

const DEFAULT_SETTINGS = {
  /** Session storage; cleared when tab closes (via cleanupTab). */
  persistLocal: false,
  /** Merge emails across multiple searches in the same tab. */
  accumulateMode: false,
  /** Auto-export CSV at count milestones. */
  autoSaveEnabled: true,
  autoSaveMilestones: [50, 100, 500],
  /** Push results to localhost dashboard (npm start). */
  dashboardSyncEnabled: true,
  dashboardUrl: "http://localhost:3847",
};

/**
 * @returns {Promise<typeof DEFAULT_SETTINGS>}
 */
export async function getSettings() {
  const { [SETTINGS_KEY]: settings } = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...settings };
}

/**
 * @param {Partial<typeof DEFAULT_SETTINGS>} patch
 */
export async function saveSettings(patch) {
  const current = await getSettings();
  await chrome.storage.local.set({
    [SETTINGS_KEY]: { ...current, ...patch },
  });
}

/**
 * @returns {Promise<chrome.storage.StorageArea>}
 */
async function getStorageArea() {
  const { persistLocal } = await getSettings();
  if (persistLocal) return chrome.storage.local;
  // Fallback if session storage is unavailable (older Chrome)
  return chrome.storage.session ?? chrome.storage.local;
}

/**
 * @param {number} tabId
 * @returns {Promise<number[]>}
 */
export async function getTriggeredMilestones(tabId) {
  const { [MILESTONES_KEY]: map = {} } = await chrome.storage.local.get(
    MILESTONES_KEY
  );
  return map[tabId] || [];
}

/**
 * @param {number} tabId
 * @param {number} milestone
 */
export async function markMilestoneTriggered(tabId, milestone) {
  const { [MILESTONES_KEY]: map = {} } = await chrome.storage.local.get(
    MILESTONES_KEY
  );
  const list = map[tabId] || [];
  if (!list.includes(milestone)) {
    map[tabId] = [...list, milestone].sort((a, b) => a - b);
    await chrome.storage.local.set({ [MILESTONES_KEY]: map });
  }
}

/**
 * @param {number} tabId
 */
export async function resetMilestones(tabId) {
  const { [MILESTONES_KEY]: map = {} } = await chrome.storage.local.get(
    MILESTONES_KEY
  );
  delete map[tabId];
  await chrome.storage.local.set({ [MILESTONES_KEY]: map });
}

/**
 * @param {string} address
 * @returns {EmailRecord}
 */
export function createEmailRecord(address, pageUrl) {
  const normalized = address.toLowerCase().trim();
  const domain = normalized.split("@")[1] || "";
  return {
    address: normalized,
    domain,
    pageUrl: pageUrl || "",
    foundAt: Date.now(),
  };
}

/**
 * @param {string[]} addresses
 * @param {string} pageUrl
 * @returns {EmailRecord[]}
 */
export function addressesToRecords(addresses, pageUrl) {
  return addresses.map((a) => createEmailRecord(a, pageUrl));
}

/**
 * @param {EmailRecord[]} existing
 * @param {EmailRecord[]} incoming
 * @returns {EmailRecord[]}
 */
function mergeRecords(existing, incoming) {
  const byAddress = new Map();
  for (const r of existing) {
    byAddress.set(r.address, r);
  }
  for (const r of incoming) {
    if (!byAddress.has(r.address)) {
      byAddress.set(r.address, r);
    }
  }
  return [...byAddress.values()].sort((a, b) => a.address.localeCompare(b.address));
}

/**
 * @param {number} tabId
 * @param {string[]} newEmails
 * @param {string} pageUrl
 * @returns {Promise<EmailRecord[]>}
 */
export async function saveEmails(tabId, newEmails, pageUrl) {
  const storage = await getStorageArea();
  const key = STORAGE_KEY(tabId);
  const settings = await getSettings();

  const { [key]: existing } = await storage.get(key);
  let records = existing?.records || [];

  const isNewSearch =
    pageUrl &&
    existing?.pageUrl &&
    existing.pageUrl !== pageUrl &&
    !settings.accumulateMode;

  if (isNewSearch) {
    records = [];
  }

  const incoming = addressesToRecords(newEmails, pageUrl);
  const merged = mergeRecords(records, incoming);

  const payload = {
    records: merged,
    pageUrl: pageUrl || existing?.pageUrl || "",
    updatedAt: Date.now(),
  };

  await storage.set({ [key]: payload });
  await trackTabId(tabId);

  return merged;
}

/**
 * @param {number} tabId
 * @returns {Promise<{ records: EmailRecord[], pageUrl: string, updatedAt: number }|null>}
 */
export async function getEmails(tabId) {
  const storage = await getStorageArea();
  const key = STORAGE_KEY(tabId);
  const { [key]: data } = await storage.get(key);
  return data || null;
}

/**
 * @param {number} tabId
 */
export async function clearEmails(tabId) {
  const storage = await getStorageArea();
  const key = STORAGE_KEY(tabId);
  await storage.remove(key);
  await resetMilestones(tabId);
}

/**
 * @returns {Promise<EmailRecord[]>}
 */
export async function getAllEmails() {
  const settings = await getSettings();
  const storage = settings.persistLocal
    ? chrome.storage.local
    : chrome.storage.session ?? chrome.storage.local;

  const { [TAB_INDEX_KEY]: tabIds = [] } = await chrome.storage.local.get(
    TAB_INDEX_KEY
  );

  const all = new Map();
  for (const tabId of tabIds) {
    const key = STORAGE_KEY(tabId);
    const { [key]: data } = await storage.get(key);
    for (const r of data?.records || []) {
      if (!all.has(r.address)) all.set(r.address, r);
    }
  }

  return [...all.values()].sort((a, b) => a.address.localeCompare(b.address));
}

/**
 * @param {number} tabId
 */
async function trackTabId(tabId) {
  const { [TAB_INDEX_KEY]: tabIds = [] } = await chrome.storage.local.get(
    TAB_INDEX_KEY
  );
  if (!tabIds.includes(tabId)) {
    await chrome.storage.local.set({ [TAB_INDEX_KEY]: [...tabIds, tabId] });
  }
}

/**
 * Remove tab data when tab closes (session mode behavior).
 * @param {number} tabId
 */
export async function cleanupTab(tabId) {
  await clearEmails(tabId);

  const { [TAB_INDEX_KEY]: tabIds = [] } = await chrome.storage.local.get(
    TAB_INDEX_KEY
  );
  await chrome.storage.local.set({
    [TAB_INDEX_KEY]: tabIds.filter((id) => id !== tabId),
  });

  // Also clear legacy local keys from earlier phases
  await chrome.storage.local.remove(`tabEmails:${tabId}`);
}

/** @deprecated Use getEmails */
export async function getTabEmails(tabId) {
  const data = await getEmails(tabId);
  if (!data) return null;
  return {
    emails: data.records.map((r) => r.address),
    url: data.pageUrl,
    updatedAt: data.updatedAt,
  };
}
