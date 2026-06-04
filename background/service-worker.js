/**
 * Phase 4 — Message hub, storage, badge, auto-save milestones.
 */

import {
  saveEmails,
  getEmails,
  clearEmails,
  cleanupTab,
  getSettings,
  saveSettings,
  getTriggeredMilestones,
  markMilestoneTriggered,
} from "../utils/storage.js";
import {
  exportCSVMilestone,
  buildExportCsv,
  downloadFileBackground,
} from "../utils/export.js";
import {
  addSearchHistory,
  extractGoogleQuery,
  getSearchHistory,
} from "../utils/search-history.js";

const BADGE_COLOR = "#6c63ff";
const BADGE_COLOR_EMPTY = "#3a3a5c";

const AUTO_MILESTONES = [50, 100, 500];

/**
 * @param {number} tabId
 * @param {number} count
 */
async function updateBadge(tabId, count) {
  const text = count > 0 ? (count > 99 ? "99+" : String(count)) : "";
  await chrome.action.setBadgeText({ tabId, text });
  await chrome.action.setBadgeBackgroundColor({
    tabId,
    color: count > 0 ? BADGE_COLOR : BADGE_COLOR_EMPTY,
  });
}

/**
 * @param {number} tabId
 * @param {{ records: import('../utils/storage.js').EmailRecord[] }} data
 */
async function checkAutoSaveMilestones(tabId, data) {
  const settings = await getSettings();
  if (!settings.autoSaveEnabled) return;

  const count = data.records.length;
  const triggered = await getTriggeredMilestones(tabId);
  const milestones = settings.autoSaveMilestones || AUTO_MILESTONES;

  for (const milestone of milestones) {
    if (count >= milestone && !triggered.includes(milestone)) {
      try {
        await exportCSVMilestone(data.records, milestone);
        await markMilestoneTriggered(tabId, milestone);
        console.log(`[EmailScout] Auto-export at ${milestone} emails`);
      } catch (err) {
        console.warn("[EmailScout] Auto-export failed:", err);
      }
    }
  }
}

/**
 * @param {{ records: import('../utils/storage.js').EmailRecord[], pageUrl: string, updatedAt: number }|null} stored
 */
function toEmailDataResponse(stored) {
  if (!stored) {
    return {
      type: "EMAILS_DATA",
      emails: [],
      records: [],
      count: 0,
      url: "",
      updatedAt: null,
    };
  }
  return {
    type: "EMAILS_DATA",
    emails: stored.records.map((r) => r.address),
    records: stored.records,
    count: stored.records.length,
    url: stored.pageUrl,
    updatedAt: stored.updatedAt,
  };
}

chrome.runtime.onInstalled.addListener((details) => {
  console.log(`[EmailScout] ${details.reason}`);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = message.tabId ?? sender.tab?.id;

  if (message.type === "EMAILS_FOUND") {
    if (tabId == null) {
      sendResponse({ ok: false });
      return false;
    }

    (async () => {
      const pageUrl = message.url || sender.tab?.url || "";
      const merged = await saveEmails(
        tabId,
        message.emails || [],
        pageUrl
      );
      const stored = await getEmails(tabId);

      await updateBadge(tabId, merged.length);
      if (stored) await checkAutoSaveMilestones(tabId, stored);

      const searchQuery = extractGoogleQuery(pageUrl);
      if (searchQuery) {
        await addSearchHistory(searchQuery, merged.length, pageUrl);
      }

      try {
        chrome.tabs.sendMessage(tabId, {
          type: "EMAIL_COUNT_UPDATE",
          count: merged.length,
        });
      } catch {
        /* tab may not have content script */
      }

      console.log(
        `[EmailScout] Tab ${tabId}: ${merged.length} email(s)`,
        merged.map((r) => r.address)
      );

      sendResponse({
        ok: true,
        count: merged.length,
        emails: merged.map((r) => r.address),
        records: merged,
      });
    })();

    return true;
  }

  if (message.type === "GET_EMAILS") {
    const queryTabId = message.tabId ?? tabId;
    if (queryTabId == null) {
      sendResponse(toEmailDataResponse(null));
      return false;
    }

    (async () => {
      const stored = await getEmails(queryTabId);
      sendResponse(toEmailDataResponse(stored));
    })();

    return true;
  }

  if (message.type === "GET_SETTINGS") {
    (async () => {
      sendResponse({ type: "SETTINGS_DATA", settings: await getSettings() });
    })();
    return true;
  }

  if (message.type === "SET_SETTINGS") {
    (async () => {
      await saveSettings(message.settings || {});
      sendResponse({
        type: "SETTINGS_DATA",
        settings: await getSettings(),
      });
    })();
    return true;
  }

  if (message.type === "GET_SEARCH_HISTORY") {
    (async () => {
      sendResponse({
        type: "SEARCH_HISTORY_DATA",
        history: await getSearchHistory(),
      });
    })();
    return true;
  }

  if (message.type === "EXPORT_TAB_CSV") {
    const exportTabId = message.tabId ?? tabId;
    if (exportTabId == null) {
      sendResponse({ ok: false });
      return false;
    }

    (async () => {
      const stored = await getEmails(exportTabId);
      const records = stored?.records || [];
      if (!records.length) {
        sendResponse({ ok: false, error: "No emails" });
        return;
      }
      const csv = buildExportCsv(records);
      await downloadFileBackground(csv, "emailscout-export.csv");
      sendResponse({ ok: true, count: records.length });
    })();

    return true;
  }

  if (message.type === "SCRAPE_PROGRESS") {
    chrome.runtime.sendMessage(message).catch(() => {});
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === "CLEAR_EMAILS") {
    const clearTabId = message.tabId ?? tabId;
    if (clearTabId == null) {
      sendResponse(toEmailDataResponse(null));
      return false;
    }

    (async () => {
      await clearEmails(clearTabId);
      await updateBadge(clearTabId, 0);
      sendResponse(toEmailDataResponse(null));
    })();

    return true;
  }

  return false;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  cleanupTab(tabId);
});

// Keep emails when navigating within the same tab (no clear on loading).
