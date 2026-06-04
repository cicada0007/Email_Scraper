// Catches standard emails including subdomains and new TLDs
export const EMAIL_REGEX =
  /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

// Additional patterns for obfuscated emails
export const OBFUSCATED_PATTERNS = [
  /[a-zA-Z0-9._%+\-]+\s*\[at\]\s*[a-zA-Z0-9.\-]+\s*\[dot\]\s*[a-zA-Z]{2,}/gi,
  /[a-zA-Z0-9._%+\-]+\s*\(at\)\s*[a-zA-Z0-9.\-]+\s*\(dot\)\s*[a-zA-Z]{2,}/gi,
];

/**
 * De-obfuscate [at]/[dot] style text and pull standard emails from it.
 * @param {string} chunk
 * @returns {string[]}
 */
function emailsFromObfuscated(chunk) {
  const normalized = chunk
    .replace(/\s*\[at\]\s*/gi, "@")
    .replace(/\s*\(at\)\s*/gi, "@")
    .replace(/\s*\[dot\]\s*/gi, ".")
    .replace(/\s*\(dot\)\s*/gi, ".");

  const re = new RegExp(EMAIL_REGEX.source, EMAIL_REGEX.flags);
  return normalized.match(re) || [];
}

/**
 * @param {string} text
 * @returns {string[]}
 */
export function extractEmails(text) {
  if (!text || typeof text !== "string") return [];

  const found = new Set();

  const re = new RegExp(EMAIL_REGEX.source, EMAIL_REGEX.flags);
  const raw = text.match(re) || [];
  for (const e of raw) {
    found.add(e.toLowerCase().trim());
  }

  for (const pattern of OBFUSCATED_PATTERNS) {
    const obfRe = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = obfRe.exec(text)) !== null) {
      for (const e of emailsFromObfuscated(match[0])) {
        found.add(e.toLowerCase().trim());
      }
    }
  }

  return [...found];
}
