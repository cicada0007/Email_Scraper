/**
 * MX record verification via Cloudflare DNS-over-HTTPS.
 * Runs in service worker context only (background can make cross-origin requests).
 * Results cached 24h in chrome.storage.local to avoid redundant lookups.
 */

const MX_CACHE_KEY = "touchmail_mx_cache";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 200;
const FETCH_TIMEOUT_MS = 6000;

/** @returns {Promise<Record<string, {result: string, ts: number}>>} */
async function getCacheMap() {
  const { [MX_CACHE_KEY]: map = {} } = await chrome.storage.local.get(MX_CACHE_KEY);
  return map;
}

async function writeCacheMap(map) {
  await chrome.storage.local.set({ [MX_CACHE_KEY]: map });
}

/**
 * @param {string} domain
 * @returns {Promise<'valid'|'invalid'|'error'>}
 */
async function fetchMxRecord(domain) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const res = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=MX`,
      {
        headers: { Accept: "application/dns-json" },
        signal: controller.signal,
      }
    );
    clearTimeout(timer);

    if (!res.ok) return "error";

    const data = await res.json();

    // Status 3 = NXDOMAIN (domain doesn't exist at all)
    if (data.Status === 3) return "invalid";

    // type 15 = MX record
    const hasMx =
      Array.isArray(data.Answer) && data.Answer.some((r) => r.type === 15);

    return hasMx ? "valid" : "invalid";
  } catch {
    return "error";
  }
}

/**
 * Single domain MX check with caching.
 * @param {string} domain
 * @returns {Promise<'valid'|'invalid'|'error'>}
 */
export async function checkMxDomain(domain) {
  const map = await getCacheMap();
  const cached = map[domain];
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.result;
  }

  const result = await fetchMxRecord(domain);

  // Re-read cache before writing to avoid race conditions on concurrent calls
  const fresh = await getCacheMap();
  fresh[domain] = { result, ts: Date.now() };
  await writeCacheMap(fresh);

  return result;
}

/**
 * Batch-verify unique domains with progress callbacks.
 * @param {string[]} domains
 * @param {(checked: number, total: number) => void} [onProgress]
 * @returns {Promise<Map<string, 'valid'|'invalid'|'error'>>}
 */
export async function batchVerifyDomains(domains, onProgress) {
  const unique = [...new Set(domains.map((d) => d.toLowerCase()).filter(Boolean))];
  const resultMap = new Map();

  // Pre-populate from cache
  const cacheMap = await getCacheMap();
  const now = Date.now();
  const toFetch = [];

  for (const domain of unique) {
    const cached = cacheMap[domain];
    if (cached && now - cached.ts < CACHE_TTL_MS) {
      resultMap.set(domain, cached.result);
    } else {
      toFetch.push(domain);
    }
  }

  // Report cached hits immediately
  onProgress?.(unique.length - toFetch.length, unique.length);

  for (let i = 0; i < toFetch.length; i += BATCH_SIZE) {
    const batch = toFetch.slice(i, i + BATCH_SIZE);
    const settled = await Promise.allSettled(batch.map((d) => checkMxDomain(d)));

    batch.forEach((domain, idx) => {
      const r = settled[idx];
      resultMap.set(domain, r.status === "fulfilled" ? r.value : "error");
    });

    onProgress?.(
      unique.length - toFetch.length + Math.min(i + BATCH_SIZE, toFetch.length),
      unique.length
    );

    if (i + BATCH_SIZE < toFetch.length) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }
  }

  return resultMap;
}

/**
 * Clear the MX domain cache (useful for testing).
 */
export async function clearMxCache() {
  await chrome.storage.local.remove(MX_CACHE_KEY);
}
