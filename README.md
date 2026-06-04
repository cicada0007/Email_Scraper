# EmailScout — Email Finder

Chrome extension (Manifest V3) to scrape emails from Google Search results.

## Phase 1 — Foundation

- Manifest V3 with Google Search–scoped host permissions and content script
- Service worker and content script load without errors
- Popup opens (actions disabled until later phases)

## Phase 2 — Core scraping

- `utils/regex.js` — `EMAIL_REGEX`, obfuscated patterns, `extractEmails()`
- `content/content.js` — SERP DOM parser (`#search` observer, Google selectors)
- `background/service-worker.js` — `EMAILS_FOUND`, `GET_EMAILS`, `CLEAR_EMAILS`, badge + per-tab storage

### Test Phase 2

1. Reload the extension on `chrome://extensions`
2. Open: `https://www.google.com/search?q=makeup+artists+"@gmail.com"`
3. Open DevTools → **Console** (page context)
4. Look for:
   - `[EmailScout] SERP scraper ready`
   - `[EmailScout] Extracted emails: [...]`
5. Open the service worker console (extension card → **Service worker**) for stored counts

## Phase 3 — Popup UI

- Live count with animated badge, last-scrape timestamp
- Scrollable list (300px max), click-to-copy, search/filter, domain grouping
- Copy All, Export CSV, Clear
- Updates via `chrome.storage.onChanged` + 2s polling while open

### Test Phase 3

1. Reload extension, run a Google search with visible emails
2. Click the toolbar icon — popup shows emails and count
3. Click an email row → clipboard + green flash
4. Toggle **Group by domain**, use search filter, test **Copy All** / **Export CSV** / **Clear**

## Phase 4 — Storage & export

- `chrome.storage.session` by default (cleared when tab closes); optional **Persist after browser restart** uses `local`
- Email records: `address`, `domain`, `pageUrl`, `foundAt`
- **Accumulate mode**: merge emails across searches in the same tab
- CSV columns: `Email Address`, `Domain`, `Found At`, `Timestamp`
- Auto-export downloads at 50 / 100 / 500 emails (requires `downloads` permission)
- Emails persist across in-tab navigation (no clear on page load)

### Test Phase 4

1. Scrape emails on a Google SERP, paginate or run a new search with **Accumulate** on
2. Export CSV — verify four columns and ISO timestamp
3. Navigate to page 2 of results — emails should remain for the tab
4. Close tab — session storage clears (unless persist is enabled)

## Phase 5 — Advanced features

- **Smart query generator** (Tools tab) — niche → 3 Google queries, one-click open
- **Scrape all pages** — 1–10 pages, 2s delay, progress bar in popup
- **Email validation** — 🟢 personal / 🟡 role / 🔴 disposable (client-side)
- **Domain intelligence** — collapsible groups sorted by count
- **Search history** — last 20 queries with re-run
- **SERP notification bar** — fixed top bar with View mini-list + Export

## Install (developer mode)

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this folder (`email-scraper`)

## Verify Phase 1

1. Confirm the extension card shows **no errors** on `chrome://extensions`
2. Open `https://www.google.com/search?q=test` — check DevTools console for `[EmailScout] Content script active`
3. Click the toolbar icon — popup should open with no console errors

## Structure

```
email-scraper/
├── manifest.json
├── content/          # DOM scraper + in-page UI
├── popup/            # Extension popup
├── background/       # Service worker (badge, storage)
├── icons/
└── utils/            # regex, storage, export
```

## Notes

- Restricted pages (`chrome://`, Chrome Web Store, etc.) cannot be scanned.
- Results are stored per-tab in `chrome.storage.local` (cleared when the tab closes).
