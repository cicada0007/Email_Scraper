/**
 * Phase 5 — Google SERP scraper, notification bar, multi-page scrape.
 */

(function () {
  if (!location.pathname.startsWith("/search")) {
    return;
  }

  /** @type {import('../utils/regex.js').extractEmails} */
  let extractEmails;

  const SERP_SELECTORS = [
    ".VwiC3b",
    ".yuRUbf a",
    ".yuRUbf cite",
    "cite",
    "#search .g",
    ".IsZvec",
    ".hgKElc",
    "[data-sncf]",
  ];

  const NEXT_PAGE_SELECTORS = [
    "#pnnext",
    'a[aria-label="Next page"]',
    'a[aria-label="Next"]',
    "#botstuff a#pnnext",
    "a#pnnext",
  ];

  const BAR_ID = "touchmail-serp-bar";
  const PAGE_DELAY_MS = 2000;

  let observer = null;
  let scrapeTimer = null;
  let lastSignature = "";
  let lastPageCount = 0;
  let scrapeAllActive = false;

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function collectSerpText() {
    const parts = [];
    for (const selector of SERP_SELECTORS) {
      document.querySelectorAll(selector).forEach((el) => {
        const text = el.textContent?.trim();
        if (text) parts.push(text);
        if (el instanceof HTMLAnchorElement && el.href) parts.push(el.href);
        const sncf = el.getAttribute?.("data-sncf");
        if (sncf) parts.push(sncf);
      });
    }
    return parts.join("\n");
  }

  function findNextPageLink() {
    for (const sel of NEXT_PAGE_SELECTORS) {
      const el = document.querySelector(sel);
      if (el instanceof HTMLAnchorElement && el.href) return el;
    }
    return null;
  }

  function updateNotificationBar(count) {
    lastPageCount = count;
    const bar = document.getElementById(BAR_ID);
    if (!bar) return;
    const countEl = bar.querySelector(".es-bar-count");
    if (countEl) {
      countEl.textContent =
        count === 1 ? "1 email" : `${count} emails on this page`;
    }
    bar.classList.toggle("es-bar-has-results", count > 0);
  }

  function ensureNotificationBar() {
    if (document.getElementById(BAR_ID)) return;

    const bar = document.createElement("div");
    bar.id = BAR_ID;
    bar.innerHTML = `
      <div class="es-bar-inner">
        <span class="es-bar-brand">TouchMail</span>
        <span class="es-bar-msg">found <strong class="es-bar-count">0 emails</strong> on this page</span>
        <div class="es-bar-actions">
          <button type="button" class="es-bar-btn" data-action="view">View</button>
          <button type="button" class="es-bar-btn es-bar-btn-primary" data-action="export">Export</button>
          <button type="button" class="es-bar-btn es-bar-close" data-action="dismiss" aria-label="Dismiss">×</button>
        </div>
      </div>
      <div class="es-bar-mini hidden" id="es-bar-mini"></div>
    `;

    bar.addEventListener("click", onBarClick);
    document.documentElement.prepend(bar);
    document.documentElement.classList.add("touchmail-bar-active");
  }

  function onBarClick(e) {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;

    const action = btn.dataset.action;
    if (action === "dismiss") {
      document.getElementById(BAR_ID)?.remove();
      document.documentElement.classList.remove("touchmail-bar-active");
      return;
    }
    if (action === "view") {
      toggleBarMiniList();
      return;
    }
    if (action === "export") {
      chrome.runtime.sendMessage({ type: "EXPORT_TAB_CSV" });
    }
  }

  function toggleBarMiniList() {
    const mini = document.getElementById("es-bar-mini");
    if (!mini) return;

    if (!mini.classList.contains("hidden")) {
      mini.classList.add("hidden");
      return;
    }

    chrome.runtime.sendMessage({ type: "GET_EMAILS" }, (response) => {
      if (chrome.runtime.lastError || !response?.records?.length) {
        mini.innerHTML = "<p class='es-bar-empty'>No emails stored yet.</p>";
      } else {
        const items = response.records
          .slice(0, 8)
          .map(
            (r) =>
              `<button type="button" class="es-bar-email" data-email="${r.address}">${r.address}</button>`
          )
          .join("");
        const more =
          response.records.length > 8
            ? `<p class="es-bar-more">+${response.records.length - 8} more in extension popup</p>`
            : "";
        mini.innerHTML = items + more;
        mini.querySelectorAll("[data-email]").forEach((el) => {
          el.addEventListener("click", () => {
            navigator.clipboard.writeText(el.dataset.email);
          });
        });
      }
      mini.classList.remove("hidden");
    });
  }

  function reportEmails(emails) {
    const pageEmails = emails.length;
    updateNotificationBar(pageEmails);

    console.log("[TouchMail] Extracted emails:", emails);

    chrome.runtime.sendMessage(
      {
        type: "EMAILS_FOUND",
        emails,
        url: location.href,
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.warn("[TouchMail]", chrome.runtime.lastError.message);
          return;
        }
        if (response?.count != null) {
          console.log(
            `[TouchMail] Stored ${response.count} email(s) for this tab`
          );
        }
      }
    );

    return pageEmails;
  }

  function scrape() {
    const text = collectSerpText();
    const signature = `${text.length}:${text.slice(0, 200)}`;

    if (!extractEmails) return [];

    const emails = extractEmails(text);

    if (signature === lastSignature && emails.length === 0) {
      return emails;
    }
    lastSignature = signature;

    reportEmails(emails);
    return emails;
  }

  function scheduleScrape(delayMs = 300) {
    if (scrapeAllActive) return;
    clearTimeout(scrapeTimer);
    scrapeTimer = setTimeout(scrape, delayMs);
  }

  function attachObserver(root) {
    if (observer) observer.disconnect();

    observer = new MutationObserver(() => {
      if (!scrapeAllActive) scheduleScrape(400);
    });

    observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  function waitForSearchRoot() {
    const root = document.querySelector("#search");
    if (root) {
      attachObserver(root);
      scheduleScrape(500);
      return;
    }

    const docObserver = new MutationObserver(() => {
      const searchRoot = document.querySelector("#search");
      if (searchRoot) {
        docObserver.disconnect();
        attachObserver(searchRoot);
        scheduleScrape(500);
      }
    });

    docObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  async function waitForSerpSettle() {
    await delay(800);
    let stable = 0;
    let lastLen = 0;

    for (let i = 0; i < 15; i++) {
      const len = collectSerpText().length;
      if (len === lastLen) stable += 1;
      else stable = 0;
      lastLen = len;
      if (stable >= 2) break;
      await delay(400);
    }
  }

  function sendProgress(page, total, status) {
    chrome.runtime.sendMessage({
      type: "SCRAPE_PROGRESS",
      page,
      total,
      status,
      url: location.href,
    });
  }

  async function scrapeAllPages(totalPages) {
    if (scrapeAllActive) {
      return { ok: false, error: "Scrape already running" };
    }

    scrapeAllActive = true;
    const maxPages = Math.min(Math.max(1, totalPages), 10);

    chrome.runtime.sendMessage({ type: "SET_SETTINGS", settings: { accumulateMode: true } });

    sendProgress(0, maxPages, "starting");

    for (let page = 1; page <= maxPages; page++) {
      sendProgress(page, maxPages, "scraping");

      lastSignature = "";
      scrape();
      await waitForSerpSettle();

      if (page >= maxPages) break;

      const next = findNextPageLink();
      if (!next) {
        sendProgress(page, maxPages, "no_next");
        break;
      }

      sendProgress(page, maxPages, "waiting");
      lastSignature = "";
      next.click();
      await waitForSerpSettle();
      await delay(PAGE_DELAY_MS);
    }

    scrapeAllActive = false;
    sendProgress(maxPages, maxPages, "done");
    return { ok: true };
  }

  async function init() {
    const regexUrl = chrome.runtime.getURL("utils/regex.js");
    try {
      ({ extractEmails } = await import(regexUrl));
    } catch (err) {
      console.error("[TouchMail] Failed to load regex module:", err);
      return;
    }

    ensureNotificationBar();
    console.log("[TouchMail] SERP scraper ready");
    waitForSearchRoot();

    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg.type === "SCAN_PAGE") {
        lastSignature = "";
        scrape();
        sendResponse({ ok: true, count: lastPageCount });
        return true;
      }

      if (msg.type === "START_SCRAPE_ALL") {
        scrapeAllPages(msg.pageCount || 1).then(sendResponse);
        return true;
      }

      if (msg.type === "STOP_SCRAPE_ALL") {
        scrapeAllActive = false;
        sendResponse({ ok: true });
        return true;
      }

      if (msg.type === "EMAIL_COUNT_UPDATE") {
        updateNotificationBar(msg.count ?? 0);
        return false;
      }

      return false;
    });

    window.addEventListener("popstate", () => {
      if (!scrapeAllActive) {
        lastSignature = "";
        scheduleScrape(800);
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
