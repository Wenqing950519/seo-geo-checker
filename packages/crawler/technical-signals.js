const SEARCH_BOTS = ["Googlebot", "OAI-SearchBot", "Claude-SearchBot"];
const POLICY_BOTS = ["GPTBot", "ClaudeBot", "Google-Extended"];

async function fetchTechnicalSignals(siteUrl, homepage = {}) {
  const root = siteRoot(homepage.finalUrl || siteUrl);
  const robotsUrl = new URL("/robots.txt", root).toString();
  const robotsResource = await fetchTextResource(robotsUrl, "text/plain");
  const parsedRobots = parseRobotsTxt(robotsResource.ok ? robotsResource.body : "");
  const sitemapCandidates = [...new Set([
    ...parsedRobots.sitemaps,
    new URL("/sitemap.xml", root).toString()
  ])].slice(0, 3);
  const sitemapResources = await Promise.all(sitemapCandidates.map((url) => fetchTextResource(url, "xml")));
  const sitemap = chooseSitemap(sitemapResources, homepage.finalUrl || siteUrl);
  const representativeUrls = chooseRepresentativeUrls([...(sitemap.urls || []), ...(homepage.internalLinks || [])], homepage.finalUrl || siteUrl);
  const llms = await fetchTextResource(new URL("/llms.txt", root).toString(), "text/plain");
  const botAccess = {};

  for (const bot of [...SEARCH_BOTS, ...POLICY_BOTS]) {
    botAccess[bot] = robotsResource.status === 401 || robotsResource.status === 403
      ? { status: "unknown", allowed: null, reason: "robots.txt 無法讀取" }
      : evaluateRobotsAccess(parsedRobots, bot, "/");
  }

  return {
    robots: {
      url: robotsUrl,
      exists: robotsResource.ok,
      status: robotsResource.status,
      readable: robotsResource.ok || robotsResource.status === 404,
      sitemaps: parsedRobots.sitemaps,
      botAccess
    },
    sitemap,
    representativeUrls,
    llms: {
      exists: llms.ok,
      status: llms.status,
      note: "實驗性導覽檔，不列入分數"
    }
  };
}

function siteRoot(value) {
  const url = new URL(value);
  return `${url.protocol}//${url.host}/`;
}

async function fetchTextResource(url, expectedType) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      headers: {
        "User-Agent": "GEOCheck-Audit/2.0",
        "Accept": expectedType === "xml" ? "application/xml,text/xml,text/plain,*/*" : `${expectedType},*/*`
      },
      signal: controller.signal
    });
    const body = await response.text();
    return {
      url: response.url || url,
      ok: response.ok && body.length > 0,
      status: response.status,
      contentType: response.headers.get("content-type") || "",
      body: body.slice(0, 1_000_000)
    };
  } catch (error) {
    return { url, ok: false, status: 0, contentType: "", body: "", error: error.message };
  } finally {
    clearTimeout(timer);
  }
}

function parseRobotsTxt(text) {
  const groups = [];
  const sitemaps = [];
  let current = null;
  for (const rawLine of String(text || "").split(/\r?\n/)) {
    const line = rawLine.replace(/\s*#.*$/, "").trim();
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (key === "sitemap") {
      if (value) sitemaps.push(value);
      continue;
    }
    if (key === "user-agent") {
      if (!current || current.rules.length > 0) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      continue;
    }
    if (current && (key === "allow" || key === "disallow")) {
      current.rules.push({ type: key, path: value });
    }
  }
  return { groups, sitemaps: [...new Set(sitemaps)] };
}

function evaluateRobotsAccess(parsed, userAgent, path = "/") {
  const token = String(userAgent).toLowerCase();
  const specific = parsed.groups.filter((group) => group.agents.some((agent) => agent !== "*" && token.includes(agent)));
  const matchingGroups = specific.length
    ? specific
    : parsed.groups.filter((group) => group.agents.includes("*"));
  const candidates = matchingGroups
    .flatMap((group) => group.rules)
    .filter((rule) => rule.path && robotsPathMatches(rule.path, path))
    .sort((a, b) => b.path.length - a.path.length || (a.type === "allow" ? -1 : 1));
  if (!candidates.length) return { status: "allowed", allowed: true, reason: "沒有符合的封鎖規則" };
  const winner = candidates[0];
  const allowed = winner.type === "allow";
  return { status: allowed ? "allowed" : "blocked", allowed, reason: `${winner.type}: ${winner.path}` };
}

function robotsPathMatches(pattern, path) {
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\$$/, "$");
  try {
    return new RegExp(`^${escaped}`).test(path);
  } catch {
    return path.startsWith(pattern);
  }
}

function chooseSitemap(resources, homepageUrl) {
  for (const resource of resources) {
    if (!resource.ok || !/<(?:urlset|sitemapindex)\b/i.test(resource.body)) continue;
    const urls = [...resource.body.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((match) => decodeXml(match[1]));
    const homepage = normalizeComparableUrl(homepageUrl);
    return {
      exists: true,
      valid: true,
      status: resource.status,
      url: resource.url,
      urlCount: urls.length,
      homepageIncluded: urls.some((url) => normalizeComparableUrl(url) === homepage),
      urls: urls.slice(0, 500)
    };
  }
  const first = resources[0] || {};
  return {
    exists: resources.some((resource) => resource.ok),
    valid: false,
    status: first.status || 0,
    url: first.url || "",
    urlCount: 0,
    homepageIncluded: false,
    urls: []
  };
}

function chooseRepresentativeUrls(urls, homepageUrl, limit = 3) {
  const home = new URL(homepageUrl);
  const priorities = [
    /\/(?:about|brand|company|story)(?:\/|$)/i,
    /\/(?:menu|product|service|services)(?:\/|$)/i,
    /\/(?:store|stores|location|locations|shop)(?:\/|$)/i,
    /\/(?:faq|contact|news)(?:\/|$)/i
  ];
  const candidates = [];
  for (const value of urls || []) {
    try {
      const url = new URL(value, homepageUrl);
      url.hash = "";
      if (url.origin !== home.origin || normalizeComparableUrl(url) === normalizeComparableUrl(home)) continue;
      const score = priorities.reduce((best, pattern, index) => pattern.test(url.pathname) ? Math.max(best, priorities.length - index) : best, 0);
      candidates.push({ url: url.toString(), score });
    } catch { /* ignore malformed URLs */ }
  }
  return [...new Map(candidates.sort((a, b) => b.score - a.score).map((item) => [item.url, item])).values()]
    .slice(0, limit)
    .map((item) => item.url);
}

function normalizeComparableUrl(value) {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, "") || "/"}`;
  } catch {
    return String(value || "");
  }
}

function decodeXml(value) {
  return String(value).replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

module.exports = { chooseRepresentativeUrls, evaluateRobotsAccess, fetchTechnicalSignals, parseRobotsTxt, POLICY_BOTS, SEARCH_BOTS };
