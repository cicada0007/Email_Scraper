/**
 * Client-side email validation & classification (no API calls).
 */

const DISPOSABLE_DOMAINS = new Set([
  "tempmail.com",
  "temp-mail.org",
  "guerrillamail.com",
  "guerrillamail.net",
  "mailinator.com",
  "10minutemail.com",
  "throwaway.email",
  "yopmail.com",
  "fakeinbox.com",
  "sharklasers.com",
  "trashmail.com",
  "getnada.com",
  "maildrop.cc",
  "dispostable.com",
  "tempail.com",
  "emailondeck.com",
]);

const ROLE_LOCAL_PARTS = new Set([
  "info",
  "support",
  "noreply",
  "no-reply",
  "contact",
  "admin",
  "sales",
  "hello",
  "help",
  "office",
  "team",
  "mail",
  "enquiries",
  "inquiries",
  "billing",
  "service",
  "customerservice",
  "webmaster",
  "postmaster",
]);

const VALID_TLDS = new Set([
  "com",
  "org",
  "net",
  "io",
  "co",
  "edu",
  "gov",
  "uk",
  "us",
  "ca",
  "au",
  "de",
  "fr",
  "es",
  "it",
  "nl",
  "be",
  "ch",
  "at",
  "se",
  "no",
  "dk",
  "fi",
  "pl",
  "cz",
  "ie",
  "nz",
  "in",
  "sg",
  "hk",
  "jp",
  "kr",
  "mx",
  "br",
  "ar",
  "cl",
  "pt",
  "ru",
  "ua",
  "za",
  "me",
  "tv",
  "cc",
  "biz",
  "info",
  "pro",
  "name",
  "xyz",
  "app",
  "dev",
  "ai",
  "tech",
  "studio",
  "agency",
  "email",
  "cloud",
  "live",
  "outlook",
]);

const EMAIL_SYNTAX =
  /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;

/**
 * @typedef {'personal'|'role'|'disposable'|'invalid'} EmailTier
 */

/**
 * @param {string} address
 * @returns {{ tier: EmailTier, label: string, icon: string }}
 */
export function classifyEmail(address) {
  const email = String(address || "").toLowerCase().trim();

  if (!EMAIL_SYNTAX.test(email)) {
    return {
      tier: "invalid",
      label: "Invalid syntax",
      icon: "⚪",
    };
  }

  const [local, domain] = email.split("@");
  const tld = domain?.split(".").pop() || "";

  if (!VALID_TLDS.has(tld)) {
    return {
      tier: "invalid",
      label: "Unknown TLD",
      icon: "⚪",
    };
  }

  const baseDomain = domain.replace(/^mail\./, "");
  if (
    DISPOSABLE_DOMAINS.has(domain) ||
    DISPOSABLE_DOMAINS.has(baseDomain) ||
    /^(temp|throwaway|fake|trash|guerrilla)/i.test(domain)
  ) {
    return {
      tier: "disposable",
      label: "Disposable / blocked domain",
      icon: "🔴",
    };
  }

  const localBase = local.split("+")[0];
  if (ROLE_LOCAL_PARTS.has(localBase)) {
    return {
      tier: "role",
      label: "Role-based email",
      icon: "🟡",
    };
  }

  return {
    tier: "personal",
    label: "Likely personal email",
    icon: "🟢",
  };
}
