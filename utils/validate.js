/**
 * Client-side email validation & verification (no API calls).
 * "Verified" = passes syntax, known TLD, not disposable, not role-based.
 */

const DISPOSABLE_DOMAINS = new Set([
  // Mailinator family
  "mailinator.com", "mailinator2.com", "tradermail.info",
  // Guerrilla Mail family
  "guerrillamail.com", "guerrillamail.net", "guerrillamail.org",
  "guerrillamail.biz", "guerrillamail.de", "guerrillamail.info",
  "grr.la", "sharklasers.com", "spam4.me", "guerrillamailblock.com",
  // 10 Minute Mail
  "10minutemail.com", "10minutemail.net", "10minutemail.org",
  "10minutemail.de", "10minemail.com", "minutemail.com",
  // Temp Mail
  "tempmail.com", "temp-mail.org", "tempmail.net", "tempmail.io",
  "tempmail.de", "temp-mail.io", "tmpmail.net", "tmpmail.org",
  "tempinbox.com", "tempail.com", "tempr.email", "tempsky.com",
  // Throwaway
  "throwaway.email", "throwam.com", "throwam.net", "throwam.info",
  // Yopmail
  "yopmail.com", "yopmail.fr", "yopmail.net", "cool.fr.nf",
  "jetable.fr.nf", "nospam.ze.tc", "nomail.xl.cx", "mega.zik.dj",
  // Trash Mail
  "trashmail.com", "trashmail.at", "trashmail.io", "trashmail.me",
  "trashmail.net", "trashmail.org", "trashmail.xyz", "discard.email",
  // Fake/Burner
  "fakeinbox.com", "fakeinbox.net", "fakemail.fr", "maildrop.cc",
  "spamgourmet.com", "spamgourmet.net", "spamgourmet.org",
  "spamhereplease.com", "spamfree24.org", "spamherelots.com",
  // Disposable / GNada
  "getnada.com", "nada.email", "dispostable.com", "emailondeck.com",
  "mintemail.com", "mailnesia.com", "anonaddy.com", "anonaddy.me",
  // Spamex / Spam
  "spam.la", "binkmail.com", "bob.email", "clrmail.com",
  "dingbone.com", "eelmail.com", "filzmail.com", "fudgerub.com",
  "lookugly.com", "mockmyid.com", "mt2014.com", "mt2015.com",
  "netmails.net", "objectmail.com", "ownmail.net", "pecinan.com",
  "proxymail.eu", "rcpt.at", "safetymail.info", "sendspamhere.com",
  "shiftmail.com", "sinnlos-mail.de", "skrx.tk", "slopsbox.com",
  "slushmail.com", "snakemail.com", "sofort-mail.de", "sogetthis.com",
  "spikio.com", "spamevader.com", "supergreatmail.com", "suremail.info",
  "teleworm.us", "tempemail.co.za", "tempinbox.co.uk", "thisisnotmyrealemail.com",
  "throwam.com", "tradermail.info", "trash-mail.at", "trash-mail.com",
  "trash-mail.de", "trash-mail.io", "trash-mail.net",
  // Burner Mail / Temp providers
  "burnermail.io", "inboxbear.com", "tempinbox.net", "spammotel.com",
  "mytemp.email", "getonemail.com", "getonemail.net", "drdrb.com",
  "drdrb.net", "emailtemporanea.com", "emailtemporanea.net",
  "emailtemporanea.org", "emailtemporario.com.br", "discard.email",
  "discardmail.com", "discardmail.de", "dispostable.com",
  // Guerrilla forks
  "deadaddress.com", "dumpmail.de", "e4ward.com", "emailgo.de",
  "emailsensei.com", "emailwarden.com", "fastacura.com", "fast-email.com",
  "filzmail.de", "fixmail.tk", "fleckens.hu", "flurried.com",
  "frapmail.com", "free-email.cf", "front14.org", "fugitiveemail.com",
  // More common ones
  "humaility.com", "ieatspam.eu", "ieatspam.info", "incognitomail.com",
  "incognitomail.net", "incognitomail.org", "instant-mail.de",
  "ispuntuaq.com", "jetable.com", "jetable.net", "jetable.org",
  "jnxjn.com", "jourrapide.com", "kasmail.com", "klassmaster.com",
  "klzlk.com", "kurzepost.de", "lifebyfood.com", "link2mail.net",
  "lol.ovpn.to", "lolfreak.net", "lookugly.com", "lortemail.dk",
  "lr78.com", "lukop.dk", "m4ilweb.info", "maggotymeat.ga",
  "mail.mezimages.net", "mail.zfreed.net", "mailbidon.com",
  "mailbiz.biz", "mailblocks.com", "mailbucket.org", "mailchop.com",
  "mailde.net", "mailempty.com", "mailexpire.com", "mailfall.com",
  "mailforspam.com", "mailfreeonline.com", "mailfs.com",
  "mailguard.me", "mailhazard.com", "mailhazard.us", "mailimate.com",
  "mailismagic.com", "mailme.gq", "mailme.ir", "mailme.lv",
  "mailme24.com", "mailmetrash.com", "mailmoat.com", "mailnew.com",
  "mailnull.com", "mailpick.net", "mailproxsy.com", "mailquack.com",
  "mailrock.biz", "mailsac.com", "mailscrap.com", "mailseal.de",
  "mailshell.com", "mailsiphon.com", "mailslite.com", "mailsux.com",
  "mailtechx.com", "mailtemp.info", "mailzilla.com", "meltmail.com",
  "momentics.ru", "moncourrier.fr.nf", "monemail.fr.nf",
  "monmail.fr.nf", "msa.minsmail.com", "mt2009.com", "mx0.wwwnew.eu",
  "mycleaninbox.net", "mykickassmail.com", "mynetstore.de",
  "mypacks.net", "mypartyclip.de", "myphantomemail.com",
  "mysamp.de", "mytempemail.com", "mytempmail.com",
  "nospamfor.us", "nospammail.net", "nospamthanks.info",
  "notmailinator.com", "notsharingmy.info",
  // One-off providers
  "owlpic.com", "pecinan.net", "pecinan.org", "pimpedupmyspace.com",
  "pjjkp.com", "plexolan.de", "politikerclub.de", "poofy.org",
  "pookmail.com", "profilific.com", "proxymail.eu",
  "zoemail.org", "zomg.info",
]);

const ROLE_LOCAL_PARTS = new Set([
  "info",
  "support",
  "noreply",
  "no-reply",
  "donotreply",
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
  "marketing",
  "press",
  "media",
  "jobs",
  "careers",
  "hr",
]);

const FREE_MAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "icloud.com",
  "me.com",
  "aol.com",
  "protonmail.com",
  "proton.me",
  "gmx.com",
  "mail.com",
]);

const VALID_TLDS = new Set([
  "com", "org", "net", "io", "co", "edu", "gov", "uk", "us", "ca", "au",
  "de", "fr", "es", "it", "nl", "be", "ch", "at", "se", "no", "dk", "fi",
  "pl", "cz", "ie", "nz", "in", "sg", "hk", "jp", "kr", "mx", "br", "ar",
  "cl", "pt", "ru", "ua", "za", "me", "tv", "cc", "biz", "info", "pro",
  "name", "xyz", "app", "dev", "ai", "tech", "studio", "agency", "email",
  "cloud", "live", "outlook",
]);

const EMAIL_SYNTAX =
  /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;

/** @typedef {'mx-verified'|'personal'|'no-mx'|'role'|'disposable'|'invalid'|'pending'} EmailTier */

/**
 * @param {string} address
 * @returns {{
 *   tier: EmailTier,
 *   verified: boolean,
 *   label: string,
 *   icon: string,
 *   checks: { syntax: boolean, tld: boolean, notDisposable: boolean, notRole: boolean }
 * }}
 */
export function verifyEmail(address) {
  const email = String(address || "").toLowerCase().trim();
  const checks = {
    syntax: EMAIL_SYNTAX.test(email),
    tld: false,
    notDisposable: true,
    notRole: true,
  };

  if (!checks.syntax) {
    return {
      tier: "invalid",
      verified: false,
      label: "Invalid syntax",
      icon: "⚪",
      checks,
    };
  }

  const [local, domain] = email.split("@");
  const tld = domain?.split(".").pop() || "";
  checks.tld = VALID_TLDS.has(tld);

  if (!checks.tld) {
    return {
      tier: "invalid",
      verified: false,
      label: "Unknown TLD",
      icon: "⚪",
      checks,
    };
  }

  const baseDomain = domain.replace(/^mail\./, "");
  const isDisposable =
    DISPOSABLE_DOMAINS.has(domain) ||
    DISPOSABLE_DOMAINS.has(baseDomain) ||
    /^(temp|throwaway|fake|trash|guerrilla|spam)/i.test(domain);

  checks.notDisposable = !isDisposable;

  if (isDisposable) {
    return {
      tier: "disposable",
      verified: false,
      label: "Disposable / temp mail",
      icon: "🔴",
      checks,
    };
  }

  const localBase = local.split("+")[0];
  const isRole = ROLE_LOCAL_PARTS.has(localBase);
  checks.notRole = !isRole;

  if (isRole) {
    return {
      tier: "role",
      verified: false,
      label: "Role-based (not personal)",
      icon: "🟡",
      checks,
    };
  }

  const isFreeMail = FREE_MAIL_DOMAINS.has(domain);
  return {
    tier: "personal",
    verified: true,
    label: isFreeMail
      ? "Verified — personal inbox"
      : "Verified — business/custom domain",
    icon: "🟢",
    checks,
  };
}

/**
 * Upgrade or downgrade an instant verify result based on an MX lookup outcome.
 * Call this after batchVerifyDomains() resolves.
 *
 * @param {ReturnType<typeof verifyEmail>} instantResult
 * @param {'valid'|'invalid'|'error'} mxStatus
 * @returns {ReturnType<typeof verifyEmail>}
 */
export function applyMxToResult(instantResult, mxStatus) {
  // Non-personal tiers (role, disposable, invalid) are not affected by MX status.
  if (!instantResult.verified) return instantResult;

  if (mxStatus === "valid") {
    return {
      ...instantResult,
      tier: "mx-verified",
      verified: true,
      label: instantResult.label + " · MX confirmed",
      icon: "✅",
    };
  }

  if (mxStatus === "invalid") {
    return {
      ...instantResult,
      tier: "no-mx",
      verified: false,
      label: "No mail server — domain cannot receive email",
      icon: "🟠",
    };
  }

  // mxStatus === 'error': lookup failed, leave as-is (assume valid)
  return instantResult;
}

/** @deprecated Use verifyEmail */
export function classifyEmail(address) {
  return verifyEmail(address);
}

/**
 * @param {string} address
 * @returns {boolean}
 */
export function isVerifiedEmail(address) {
  return verifyEmail(address).verified;
}

/**
 * @param {string[]|{ address: string }[]} emails
 * @returns {{
 *   verified: { address: string, verification: ReturnType<typeof verifyEmail> }[],
 *   unverified: { address: string, verification: ReturnType<typeof verifyEmail> }[],
 *   summary: { total: number, verified: number, role: number, disposable: number, invalid: number }
 * }}
 */
export function verifyEmailList(emails) {
  const list = emails.map((e) =>
    typeof e === "string" ? e : e.address
  );

  const verified = [];
  const unverified = [];
  const summary = {
    total: list.length,
    verified: 0,
    role: 0,
    disposable: 0,
    invalid: 0,
  };

  for (const address of list) {
    const verification = verifyEmail(address);
    const item = { address, verification };

    if (verification.verified) {
      verified.push(item);
      summary.verified += 1;
    } else {
      unverified.push(item);
      if (verification.tier === "role") summary.role += 1;
      else if (verification.tier === "disposable") summary.disposable += 1;
      else summary.invalid += 1;
    }
  }

  return { verified, unverified, summary };
}

/**
 * @param {{ address: string }[]} records
 * @param {'verified'|'role'|'disposable'|'invalid'|'all'} filter
 */
export function filterRecordsByVerification(records, filter) {
  if (filter === "all") return records;
  return records.filter((r) => {
    const v = verifyEmail(r.address);
    if (filter === "verified") return v.verified;
    return v.tier === filter;
  });
}
