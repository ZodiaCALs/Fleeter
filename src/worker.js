// Fleeter worker: serves the page (from /public) and a small, locked-down feed service.
// The browser parses everything, so each request stays light enough for Cloudflare's free plan.
import CONFIG from "../public/sources.json";
import "../public/providers.js"; // defines globalThis.FleeterProviders (also used by the desktop/Android app)

const P = globalThis.FleeterProviders;
const SOURCES = CONFIG.sources, GAMES = CONFIG.games, MARKETS = CONFIG.markets;
const LIVE_TTL = 120;                 // seconds the edge may reuse a live copy of a feed
const OG_TTL = 60 * 60 * 24;          // seconds a found preview image is remembered
const CRONS = ["30 5 * * *", "33 5 * * *", "36 5 * * *", "39 5 * * *"]; // keep in step with wrangler.toml
const byId = new Map(SOURCES.map(s => [s.id, s]));
const allowedSites = [...new Set(SOURCES.flatMap(s => s.sites || []))];
const siteAllowed = host => allowedSites.some(d => host === d || host.endsWith("." + d));

const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra } });

// fetch with a timeout and optional edge caching
function edgeFetch(ttl, timeout = 10000) {
  return async (url, init = {}) => {
    const c = new AbortController(); const t = setTimeout(() => c.abort("timeout"), timeout);
    try {
      const headers = Object.assign({ "user-agent": P.BROWSER_UA, "accept-language": "en-GB,en;q=0.9,zh-CN;q=0.8" }, init.headers || {});
      const opts = { method: "GET", headers, redirect: "follow", signal: c.signal };
      if (ttl > 0) opts.cf = { cacheTtl: ttl, cacheEverything: true };
      return await fetch(url, opts);
    } finally { clearTimeout(t); }
  };
}
const kvCache = env => env.FLEETER_KV ? {
  get: k => env.FLEETER_KV.get("c:" + k),
  set: (k, v, ttl) => env.FLEETER_KV.put("c:" + k, v, ttl ? { expirationTtl: Math.max(60, ttl) } : undefined),
} : null;

async function handleFeed(url, env) {
  const src = byId.get(url.searchParams.get("id") || "");
  if (!src) return json({ error: "Unknown source" }, 404);
  if (url.searchParams.get("mode") === "morning" && env.FLEETER_KV) {
    const { value, metadata } = await env.FLEETER_KV.getWithMetadata("feed:" + src.id, { type: "stream" });
    if (value) return new Response(value, { headers: { "content-type": (metadata && metadata.type) || "application/xml; charset=utf-8", "cache-control": "no-store", "x-fleeter-mode": "morning", "x-fleeter-fetched": (metadata && metadata.at) || "" } });
  }
  const t0 = Date.now(); let res;
  try { res = await P.fetchSource(src, edgeFetch(LIVE_TTL), kvCache(env)); }
  catch (e) { return json({ error: "Couldn't reach " + src.name, detail: String(e) }, 502); }
  if (!res.ok) { let msg = `${src.name} answered ${res.status}`; try { const j = await res.json(); if (j && j.error) msg = j.error; } catch {} return json({ error: msg }, 502); }
  return new Response(res.body, { headers: { "content-type": res.headers.get("content-type") || "application/xml; charset=utf-8", "cache-control": "no-store", "x-fleeter-mode": "live", "x-fleeter-fetched": new Date().toISOString(), "x-fleeter-ms": String(Date.now() - t0) } });
}

// Preview image for an article whose feed had none (or only a small one)
async function handleOg(url, ctx) {
  let target; try { target = new URL(url.searchParams.get("url") || ""); } catch { return json({ image: null }, 400); }
  if (!/^https?:$/.test(target.protocol) || !siteAllowed(target.hostname)) return json({ image: null, error: "Site not in the source list" }, 403);
  const cache = caches.default, key = new Request("https://fleeter.cache/og?u=" + encodeURIComponent(target.href));
  const hit = await cache.match(key); if (hit) return hit;
  let image = null;
  try {
    const res = await edgeFetch(OG_TTL, 7000)(target.href, { headers: { accept: "text/html" } });
    if (res.ok) {
      const take = v => { if (!image && v && /^(https?:)?\/\//.test(v)) image = v.replace(/^\/\//, "https://"); };
      await new HTMLRewriter()
        .on('meta[property="og:image"]', { element(e) { take(e.getAttribute("content")); } })
        .on('meta[property="og:image:secure_url"]', { element(e) { take(e.getAttribute("content")); } })
        .on('meta[name="twitter:image"]', { element(e) { take(e.getAttribute("content")); } })
        .on('meta[name="twitter:image:src"]', { element(e) { take(e.getAttribute("content")); } })
        .transform(res).arrayBuffer();
    }
  } catch {}
  const out = json({ image }, 200, { "cache-control": `public, max-age=${OG_TTL}` });
  ctx.waitUntil(cache.put(key, out.clone()));
  return out;
}

// The original article page, passed through untouched so the page can show the whole story
async function handleArticle(url) {
  let target; try { target = new URL(url.searchParams.get("url") || ""); } catch { return json({ error: "Bad address" }, 400); }
  if (!/^https?:$/.test(target.protocol) || !siteAllowed(target.hostname)) return json({ error: "Site not in the source list" }, 403);
  try {
    const res = await edgeFetch(600, 12000)(target.href, { headers: { accept: "text/html,application/xhtml+xml" } });
    if (!res.ok) return json({ error: `The site answered ${res.status}` }, 502);
    return new Response(res.body, { headers: { "content-type": res.headers.get("content-type") || "text/html", "cache-control": "no-store", "x-fleeter-final-url": res.url || target.href } });
  } catch (e) { return json({ error: "Couldn't reach the site", detail: String(e) }, 502); }
}

async function handleMarkets() {
  const data = await P.fetchMarkets(MARKETS, edgeFetch(60, 8000));
  return json({ at: new Date().toISOString(), markets: data });
}

async function handleHealth(url, env) {
  const morningAt = env.FLEETER_KV ? await env.FLEETER_KV.get("morning:at") : null;
  const id = url.searchParams.get("check");
  if (id) {
    const s = byId.get(id); if (!s) return json({ error: "Unknown source" }, 404);
    const t0 = Date.now();
    try { const r = await P.fetchSource(s, edgeFetch(0), kvCache(env)); let note = ""; if (!r.ok) { try { note = (await r.json()).error; } catch {} } return json({ id, name: s.name, ok: r.ok, status: r.status, ms: Date.now() - t0, note }); }
    catch (e) { return json({ id, name: s.name, ok: false, status: 0, ms: Date.now() - t0, error: String(e) }); }
  }
  let stored = [];
  if (env.FLEETER_KV) { const list = await env.FLEETER_KV.list({ prefix: "feed:" }); stored = list.keys.map(k => k.name.slice(5)); }
  return json({ kv: !!env.FLEETER_KV, morningEdition: morningAt, sources: SOURCES.length, storedThisMorning: stored.length,
    missing: SOURCES.filter(s => !stored.includes(s.id)).map(s => s.id), tip: "Add ?check=<source id> to test one source live." });
}

async function collectMorning(env, part) {
  if (!env.FLEETER_KV) return;
  const at = new Date().toISOString(), f = edgeFetch(0, 15000), cache = kvCache(env);
  const mine = SOURCES.filter((_, i) => i % CRONS.length === part);
  for (let i = 0; i < mine.length; i += 6) {            // a few at a time to stay polite and within limits
    await Promise.all(mine.slice(i, i + 6).map(async s => {
      try {
        const r = await P.fetchSource(s, f, cache);
        if (r.ok) await env.FLEETER_KV.put("feed:" + s.id, await r.arrayBuffer(), { metadata: { at, type: r.headers.get("content-type") || "" }, expirationTtl: 60 * 60 * 48 });
      } catch {}
    }));
  }
  if (part === CRONS.length - 1) await env.FLEETER_KV.put("morning:at", at);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method !== "GET") return json({ error: "Read-only" }, 405);
    switch (url.pathname) {
      case "/api/config": return json({
        sources: SOURCES.map(({ id, name, lang, cat, kind, games, sport, league, sites }) => ({ id, name, lang, cat, kind, games: games || [], sport: sport || null, league: league || null, site: (sites || [])[0] || null })),
        games: GAMES, markets: MARKETS, morningEdition: env.FLEETER_KV ? await env.FLEETER_KV.get("morning:at") : null, kv: !!env.FLEETER_KV });
      case "/api/feed": return handleFeed(url, env);
      case "/api/og": return handleOg(url, ctx);
      case "/api/article": return handleArticle(url);
      case "/api/markets": return handleMarkets();
      case "/api/health": return handleHealth(url, env);
    }
    return env.ASSETS ? env.ASSETS.fetch(request) : new Response("Not found", { status: 404 });
  },
  async scheduled(event, env, ctx) { ctx.waitUntil(collectMorning(env, Math.max(0, CRONS.indexOf(event.cron)))); },
};
