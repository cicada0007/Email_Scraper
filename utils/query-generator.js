/**
 * Smart search query generator from natural-language niche input.
 */

const CITY_ABBREVS = {
  "los angeles": "LA",
  "new york": "NYC",
  "san francisco": "SF",
  "las vegas": "Vegas",
  "united states": "US",
  "united kingdom": "UK",
};

/**
 * @param {string} text
 * @returns {string}
 */
function shortenLocation(text) {
  let result = text;
  for (const [full, abbr] of Object.entries(CITY_ABBREVS)) {
    if (result.toLowerCase().includes(full)) {
      result = result.replace(new RegExp(full, "gi"), abbr);
    }
  }
  return result;
}

/**
 * @param {string} topic
 * @returns {string}
 */
function singularizeTopic(topic) {
  return topic
    .replace(/\bartists\b/gi, "artist")
    .replace(/\bphotographers\b/gi, "photographer")
    .replace(/\bdesigners\b/gi, "designer")
    .trim();
}

/**
 * @param {string} input
 * @returns {{ base: string, short: string, topic: string, location: string, topicSingular: string }}
 */
export function parseNicheInput(input) {
  const trimmed = input.trim();
  const inMatch = trimmed.match(/\s+in\s+(.+)$/i);
  const location = inMatch ? inMatch[1].trim() : "";
  const topic = trimmed.replace(/\s+in\s+.+$/i, "").trim() || trimmed;
  const base = trimmed.replace(/\s+in\s+/gi, " ").trim();

  return {
    base,
    short: shortenLocation(base),
    topic,
    location,
    topicSingular: singularizeTopic(topic),
  };
}

/**
 * @param {string} input
 * @returns {{ id: string, label: string, query: string }[]}
 */
export function generateSearchQueries(input) {
  const trimmed = input.trim();
  if (!trimmed) return [];

  const { base, short, topicSingular, location } = parseNicheInput(trimmed);
  const locationPhrase = location || base.split(" ").slice(-2).join(" ");

  return [
    {
      id: "gmail",
      label: "Gmail search",
      query: `${base} "@gmail.com"`,
    },
    {
      id: "instagram",
      label: "Instagram + Gmail",
      query: `${short} site:instagram.com "@gmail.com"`,
    },
    {
      id: "contact",
      label: "Contact keywords",
      query: `"${topicSingular}" "contact" "${locationPhrase}" email`,
    },
  ];
}

/**
 * @param {string} query
 * @returns {string}
 */
export function googleSearchUrl(query) {
  const params = new URLSearchParams({ q: query });
  return `https://www.google.com/search?${params.toString()}`;
}
