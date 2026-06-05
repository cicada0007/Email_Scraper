/**
 * Dashboard copy of verification logic (keep in sync with utils/validate.js).
 */
(function (global) {
  const DISPOSABLE_DOMAINS = new Set([
    "tempmail.com", "guerrillamail.com", "mailinator.com", "yopmail.com",
    "10minutemail.com", "throwaway.email", "temp-mail.org",
  ]);
  const ROLE_LOCAL_PARTS = new Set([
    "info", "support", "noreply", "no-reply", "contact", "admin", "sales",
    "hello", "help", "office", "team", "mail", "webmaster",
  ]);
  const VALID_TLDS = new Set([
    "com", "org", "net", "io", "co", "edu", "uk", "us", "ca", "au", "de",
    "fr", "es", "it", "app", "dev", "ai", "tech", "studio", "agency",
  ]);
  const SYNTAX = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;

  function verifyEmail(address) {
    const email = String(address || "").toLowerCase().trim();
    if (!SYNTAX.test(email)) {
      return { tier: "invalid", verified: false, label: "Invalid", icon: "⚪" };
    }
    const [local, domain] = email.split("@");
    const tld = domain.split(".").pop();
    if (!VALID_TLDS.has(tld)) {
      return { tier: "invalid", verified: false, label: "Bad TLD", icon: "⚪" };
    }
    if (
      DISPOSABLE_DOMAINS.has(domain) ||
      /^(temp|throwaway|fake|trash|guerrilla)/i.test(domain)
    ) {
      return { tier: "disposable", verified: false, label: "Disposable", icon: "🔴" };
    }
    if (ROLE_LOCAL_PARTS.has(local.split("+")[0])) {
      return { tier: "role", verified: false, label: "Role-based", icon: "🟡" };
    }
    return {
      tier: "personal",
      verified: true,
      label: "Verified",
      icon: "🟢",
    };
  }

  function verifyEmailList(addresses) {
    const verified = [];
    const unverified = [];
    const summary = { total: addresses.length, verified: 0, role: 0, disposable: 0, invalid: 0 };

    for (const address of addresses) {
      const v = verifyEmail(address);
      if (v.verified) {
        verified.push({ address, verification: v });
        summary.verified++;
      } else {
        unverified.push({ address, verification: v });
        if (v.tier === "role") summary.role++;
        else if (v.tier === "disposable") summary.disposable++;
        else summary.invalid++;
      }
    }
    return { verified, unverified, summary };
  }

  global.EmailVerify = { verifyEmail, verifyEmailList };
})(window);
