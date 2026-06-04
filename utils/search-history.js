/**
 * Recent Google search history (last 20).
 */

const HISTORY_KEY = "emailscout_search_history";
const MAX_ENTRIES = 20;

/**
 * @typedef {{ query: string, emailCount: number, url: string, scrapedAt: number }} SearchHistoryEntry
 */

/**
 * @param {string} url
 * @returns {string|null}
 */
export function extractGoogleQuery(url) {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("google.")) return null;
    const q = u.searchParams.get("q");
    return q ? decodeURIComponent(q.replace(/\+/g, " ")) : null;
  } catch {
    return null;
  }
}

/**
 * @param {string} query
 * @param {number} emailCount
 * @param {string} url
 */
export async function addSearchHistory(query, emailCount, url) {
  if (!query?.trim()) return;

  const { [HISTORY_KEY]: history = [] } = await chrome.storage.local.get(
    HISTORY_KEY
  );

  const entry = {
    query: query.trim(),
    emailCount,
    url: url || "",
    scrapedAt: Date.now(),
  };

  const filtered = history.filter(
    (h) => h.query.toLowerCase() !== entry.query.toLowerCase()
  );
  const merged = [entry, ...filtered].slice(0, MAX_ENTRIES);

  await chrome.storage.local.set({ [HISTORY_KEY]: merged });
}

/**
 * @returns {Promise<SearchHistoryEntry[]>}
 */
export async function getSearchHistory() {
  const { [HISTORY_KEY]: history = [] } = await chrome.storage.local.get(
    HISTORY_KEY
  );
  return history;
}
