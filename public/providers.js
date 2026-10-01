/* Fleeter providers: how to fetch each kind of source.
   Shared by the Cloudflare worker (web version) and the desktop/Android app (which fetches directly).
   Pass in a fetch function; returns a standard Response. JSON sources come back normalised as
   {"format":"fleeter-json","items":[...]} so the page can treat them all alike. */
(function (root) {
  "use strict";
  const BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
  const XML_ACCEPT = "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5";

  /* ---------- MD5 (for Bilibili's WBI request signature) ---------- */
  function md5(str) {
    const bytes = new TextEncoder().encode(str);
    const len = bytes.length, words = new Uint32Array(((len + 8 >>> 6) + 1) << 4);
    for (let i = 0; i < len; i++) words[i >> 2] |= bytes[i] << ((i % 4) * 8);
    words[len >> 2] |= 0x80 << ((len % 4) * 8);
    words[words.length - 2] = (len * 8) >>> 0; words[words.length - 1] = Math.floor(len / 0x20000000);
    const S = [7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];
    const K = new Uint32Array(64); for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296);
    let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
    for (let o = 0; o < words.length; o += 16) {
      let A = a0, B = b0, C = c0, D = d0;
      for (let i = 0; i < 64; i++) {
        let F, g;
        if (i < 16) { F = (B & C) | (~B & D); g = i; }
        else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
        else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
        else { F = C ^ (B | ~D); g = (7 * i) % 16; }
        F = (F + A + K[i] + words[o + g]) >>> 0;
        A = D; D = C; C = B; B = (B + ((F << S[i]) | (F >>> (32 - S[i])))) >>> 0;
      }
      a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
    }
    return [a0, b0, c0, d0].map(v => [0, 8, 16, 24].map(s => ((v >>> s) & 255).toString(16).padStart(2, "0")).join("")).join("");
  }

  /* ---------- helpers ---------- */
  const httpsify = u => (u || "").replace(/^\/\//, "https://").replace(/^http:\/\//, "https://");
  const jsonResponse = (items, extra) => new Response(JSON.stringify(Object.assign({ format: "fleeter-json", items }, extra || {})), { status: 200, headers: { "content-type": "application/json; charset=utf-8" } });
  const errorResponse = (status, message) => new Response(JSON.stringify({ error: message }), { status, headers: { "content-type": "application/json; charset=utf-8" } });
  function chinaTime(s) { // "2026-09-30 18:05:00" or "09/30/2026 18:05:00", Beijing time
    if (!s) return new Date().toISOString();
    if (/^\d+$/.test(String(s))) { const n = +s; return new Date(n < 1e12 ? n * 1000 : n).toISOString(); }
    let m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(s);
    if (m) return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] || "00"}+08:00`).toISOString();
    m = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})(?::(\d{2}))?/.exec(s);
    if (m) return new Date(`${m[3]}-${m[1]}-${m[2]}T${m[4]}:${m[5]}:${m[6] || "00"}+08:00`).toISOString();
    const d = new Date(s); return isNaN(d) ? new Date().toISOString() : d.toISOString();
  }

  /* ---------- YouTube ---------- */
  async function youtube(src, f, cache) {
    const feed = id => f(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`, { headers: { accept: XML_ACCEPT } });
    if (src.channelId) { const r = await feed(src.channelId); if (r.ok) return r; }
    let id = cache ? await cache.get("yt:" + src.handle) : null;
    if (!id) {
      const page = await f(`https://www.youtube.com/@${encodeURIComponent(src.handle)}`, { headers: { accept: "text/html", cookie: "CONSENT=YES+1", "accept-language": "en-GB,en;q=0.9" } });
      if (!page.ok) return page;
      const html = await page.text();
      const m = /"externalId":"(UC[\w-]{22})"/.exec(html) || /youtube\.com\/channel\/(UC[\w-]{22})/.exec(html) || /channel_id=(UC[\w-]{22})/.exec(html);
      id = m && m[1];
      if (id && cache) await cache.set("yt:" + src.handle, id, 60 * 60 * 24 * 30);
    }
    return id ? feed(id) : errorResponse(404, "Couldn't find this YouTube channel");
  }

  /* ---------- Bilibili ---------- */
  const MIXIN = [46,47,18,2,53,8,23,32,15,50,10,31,58,3,45,35,27,43,5,49,33,9,42,19,29,28,14,39,12,38,41,13,37,48,7,16,24,55,40,61,26,17,0,1,60,51,30,4,22,25,54,21,56,59,6,63,57,62,11,36,20,34,44,52];
  function wbiSign(params, imgKey, subKey) {
    const raw = imgKey + subKey, mixin = MIXIN.map(i => raw[i]).join("").slice(0, 32);
    const p = Object.assign({}, params, { wts: Math.floor(Date.now() / 1000) });
    const query = Object.keys(p).sort().map(k => `${encodeURIComponent(k)}=${encodeURIComponent(String(p[k]).replace(/[!'()*]/g, ""))}`).join("&");
    return query + "&w_rid=" + md5(query + mixin);
  }
  async function biliHeaders(f, cache, referer) {
    let cookie = cache ? await cache.get("bili:cookie") : null;
    if (!cookie) {
      try {
        const r = await f("https://api.bilibili.com/x/frontend/finger/spi", { headers: { "user-agent": BROWSER_UA, referer: "https://www.bilibili.com/" } });
        const j = await r.json();
        if (j && j.data && j.data.b_3) { cookie = `buvid3=${j.data.b_3}; buvid4=${j.data.b_4 || ""}`; if (cache) await cache.set("bili:cookie", cookie, 60 * 60 * 24 * 7); }
      } catch {}
    }
    return { "user-agent": BROWSER_UA, referer: referer || "https://www.bilibili.com/", origin: "https://www.bilibili.com", accept: "application/json", ...(cookie ? { cookie } : {}) };
  }
  const biliItem = v => ({
    title: (v.title || "").replace(/<[^>]+>/g, ""), url: `https://www.bilibili.com/video/${v.bvid}`, bvid: v.bvid,
    image: httpsify(v.pic || v.cover), iso: chinaTime(v.pubdate || v.created || v.ctime), summary: v.desc || v.description || "",
    views: (v.stat && (v.stat.view || v.stat.vv)) || v.play || 0, author: (v.owner && v.owner.name) || v.author || "",
    zone: v.tname || "" });
  async function bilibili(src, f, cache) {
    if (src.kind === "bilibili-popular" || src.kind === "bilibili-rank") {
      const url = src.kind === "bilibili-popular" ? "https://api.bilibili.com/x/web-interface/popular?ps=20&pn=1"
        : `https://api.bilibili.com/x/web-interface/ranking/v2?rid=${src.rid || 0}&type=all`;
      const referer = src.kind === "bilibili-popular" ? "https://www.bilibili.com/v/popular/all" : "https://www.bilibili.com/v/popular/rank/all";
      const r = await f(url, { headers: await biliHeaders(f, cache, referer) });
      if (!r.ok) return errorResponse(r.status, `Bilibili answered ${r.status}`);
      const j = await r.json();
      if (j.code !== 0) return errorResponse(502, `Bilibili refused (${j.code} ${j.message || ""})`.trim());
      return jsonResponse(((j.data && j.data.list) || []).slice(0, 20).map(biliItem));
    }
    // An account's newest uploads: try the simple listing first, then the signed one.
    const headers = await biliHeaders(f, cache, `https://space.bilibili.com/${src.uid}/video`);
    try {
      const r = await f(`https://api.bilibili.com/x/series/recArchivesByKeywords?mid=${src.uid}&keywords=&ps=20&pn=1`, { headers });
      if (r.ok) { const j = await r.json(); const list = j && j.code === 0 && j.data && j.data.archives; if (list && list.length) return jsonResponse(list.map(biliItem)); }
    } catch {}
    try {
      const nav = await (await f("https://api.bilibili.com/x/web-interface/nav", { headers })).json();
      const img = nav.data.wbi_img.img_url, sub = nav.data.wbi_img.sub_url;
      const key = u => u.slice(u.lastIndexOf("/") + 1, u.lastIndexOf("."));
      const qs = wbiSign({ mid: src.uid, ps: 20, pn: 1, tid: 0, keyword: "", order: "pubdate", platform: "web", web_location: 1550101, order_avoided: "true",
        dm_img_list: "[]", dm_img_str: "V2ViR0wgMS", dm_cover_img_str: "QU5HTEUgKEludGVsLCBJbnRlbChSKSBIRCBHcmFwaGljcyBEaXJlY3QzRDExIHZzXzVfMCBwc181XzApR29vZ2xlIEluYy4gKEludGVsKQ" }, key(img), key(sub));
      const r = await f(`https://api.bilibili.com/x/space/wbi/arc/search?${qs}`, { headers });
      const j = await r.json();
      if (j.code !== 0) return errorResponse(502, `Bilibili refused (${j.code} ${j.message || ""})`.trim());
      return jsonResponse(((j.data && j.data.list && j.data.list.vlist) || []).map(biliItem));
    } catch (e) { return errorResponse(502, "Bilibili didn't answer: " + (e && e.message || e)); }
  }

  /* ---------- Tencent News ---------- */
  async function tencent(src, f) {
    const ext = encodeURIComponent(JSON.stringify({ pool: ["top", "hot"], is_filter: 7, check_type: true }));
    const url = `https://i.news.qq.com/trpc.qqnews_web.kv_srv.kv_srv_http_proxy/list?sub_srv_id=${src.channel || "24hours"}&srv_id=pc&offset=0&limit=40&strategy=1&ext=${ext}`;
    const r = await f(url, { headers: { "user-agent": BROWSER_UA, referer: "https://news.qq.com/", accept: "application/json" } });
    if (!r.ok) return errorResponse(r.status, `Tencent News answered ${r.status}`);
    const j = await r.json();
    const list = (j && j.data && j.data.list) || [];
    return jsonResponse(list.filter(x => x && x.title && x.url).map(x => ({
      title: x.title, url: httpsify(x.url), iso: chinaTime(x.publish_time || x.update_time || x.time),
      image: httpsify(x.thumb_nail_2x || x.thumb_nail || x.img || x.miniProShareImage || (x.thumb_nail_list && x.thumb_nail_list[0]) || ""),
      summary: x.desc || x.abstract || x.summary || "", author: x.media_name || x.source || "" })));
  }

  /* ---------- NetEase News ---------- */
  async function netease(src, f) {
    if (src.kind === "netease-jsonp") return f(src.url, { headers: { "user-agent": BROWSER_UA, referer: "https://news.163.com/" } }); // GBK; decoded in the page
    const kind = src.headline ? "headline" : "list";
    const r = await f(`https://c.m.163.com/nc/article/${kind}/${src.channel}/0-20.html`, { headers: { "user-agent": BROWSER_UA, referer: "https://m.163.com/", accept: "application/json" } });
    if (!r.ok) return errorResponse(r.status, `NetEase answered ${r.status}`);
    const j = await r.json(); const list = (j && j[src.channel]) || [];
    return jsonResponse(list.filter(x => x && x.title && (x.url || x.docid) && !x.hasHead && x.skipType !== "photoset" && x.skipType !== "special").map(x => ({
      title: x.title, url: httpsify(x.url_3w || x.url || `https://www.163.com/news/article/${x.docid}.html`), iso: chinaTime(x.ptime || x.lmodify),
      image: httpsify(x.imgsrc || ""), summary: x.digest || "", author: x.source || "" })));
  }

  /* ---------- market data (Yahoo Finance charts, 5 days) ---------- */
  async function market(m, f) {
    const r = await f(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(m.symbol)}?range=5d&interval=60m&includePrePost=false`, { headers: { "user-agent": BROWSER_UA, accept: "application/json" } });
    if (!r.ok) return { symbol: m.symbol, name: m.name, error: `answered ${r.status}` };
    const j = await r.json(); const res = j && j.chart && j.chart.result && j.chart.result[0];
    if (!res) return { symbol: m.symbol, name: m.name, error: "no data" };
    const meta = res.meta || {}, ts = res.timestamp || [], close = (res.indicators && res.indicators.quote && res.indicators.quote[0] && res.indicators.quote[0].close) || [];
    const off = meta.gmtoffset || 0, pts = [];
    for (let i = 0; i < ts.length; i++) if (close[i] != null) pts.push([ts[i], close[i]]);
    const day = t => new Date((t + off) * 1000).toISOString().slice(0, 10);
    const lastDay = pts.length ? day(pts[pts.length - 1][0]) : null;
    const before = pts.filter(p => day(p[0]) !== lastDay);
    const price = meta.regularMarketPrice != null ? meta.regularMarketPrice : (pts.length ? pts[pts.length - 1][1] : null);
    const prev = before.length ? before[before.length - 1][1] : (meta.chartPreviousClose != null ? meta.chartPreviousClose : null);
    const start = meta.chartPreviousClose != null ? meta.chartPreviousClose : (pts[0] ? pts[0][1] : null);
    const step = Math.max(1, Math.ceil(pts.length / 48));
    return { symbol: m.symbol, name: m.name, group: m.group, currency: meta.currency || "", price, prev, start,
      time: meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString() : null,
      points: pts.filter((_, i) => i % step === 0 || i === pts.length - 1).map(p => +p[1].toFixed(4)) };
  }

  /* ---------- entry points ---------- */
  async function fetchSource(src, f, cache) {
    switch (src.kind) {
      case "youtube": return youtube(src, f, cache);
      case "bilibili-user": case "bilibili-popular": case "bilibili-rank": return bilibili(src, f, cache);
      case "tencent": return tencent(src, f);
      case "netease-list": case "netease-jsonp": return netease(src, f);
      default: return f(src.url, { headers: { accept: XML_ACCEPT, "user-agent": "Mozilla/5.0 (compatible; FleeterReader/1.1; personal news reader)" } });
    }
  }
  async function fetchMarkets(list, f) { return Promise.all(list.map(m => market(m, f).catch(e => ({ symbol: m.symbol, name: m.name, error: String(e && e.message || e) })))); }

  root.FleeterProviders = { fetchSource, fetchMarkets, md5, wbiSign, chinaTime, BROWSER_UA };
})(typeof globalThis !== "undefined" ? globalThis : this);
