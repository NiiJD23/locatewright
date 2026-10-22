// LocateWright Worker: serves ./public and runs the visitor analytics API.
//   POST /api/event               record one event (same-site only, crawlers ignored)
//   GET  /api/admin/summary       dashboard data      (Authorization: Bearer ADMIN_TOKEN)
//   GET  /api/admin/events.csv    raw events as CSV   (Authorization: Bearer ADMIN_TOKEN)
// Data lives in the D1 database bound as DB. Tables are created on first use.
// IP addresses are never stored. Events older than about 13 months are deleted.

const TYPES = new Set(["pageview", "heartbeat", "place", "tab", "view", "layer", "search_miss", "ai_guide"]);
const NATIONS = new Set(["england", "scotland", "wales", "ni"]);
const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|quora|pinterest|vkshare|whatsapp|telegram|discord|curl|wget|python|httpclient|headless|lighthouse|pagespeed|gtmetrix|uptime|monitor/i;
const RETAIN_MS = 400 * 24 * 3600 * 1000;
const DAY = 24 * 3600 * 1000;

let ready = null;
function ensureSchema(db) {
  if (!ready) ready = db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, type TEXT NOT NULL,
      vid TEXT NOT NULL, sid TEXT, path TEXT, ref TEXT, detail TEXT,
      place TEXT, place_name TEXT, nation TEXT, council TEXT, featured INTEGER,
      country TEXT, city TEXT, device TEXT)`),
    db.prepare("CREATE INDEX IF NOT EXISTS ev_ts ON events (ts)"),
    db.prepare("CREATE INDEX IF NOT EXISTS ev_type_ts ON events (type, ts)"),
    db.prepare("CREATE INDEX IF NOT EXISTS ev_vid_ts ON events (vid, ts)"),
  ]).catch(e => { ready = null; throw e; });
  return ready;
}

const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra } });
const clip = (v, n) => (typeof v === "string" ? v.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n) : null) || null;

function device(ua) {
  if (/iPad|Tablet|Nexus (7|9|10)|SM-T|Kindle|Silk/i.test(ua)) return "tablet";
  if (/Mobi|iPhone|Android.*Mobile|IEMobile|Opera Mini/i.test(ua)) return "mobile";
  return "desktop";
}
function refHost(ref, selfHost) {
  try { const h = new URL(ref).hostname.replace(/^www\./, ""); return h && h !== selfHost.replace(/^www\./, "") ? h : null; } catch { return null; }
}

async function recordEvent(request, env) {
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== url.host) return new Response(null, { status: 403 });
  const ua = request.headers.get("user-agent") || "";
  if (!ua || BOT.test(ua)) return new Response(null, { status: 204 });
  if (Number(request.headers.get("content-length") || 0) > 4096) return new Response(null, { status: 413 });
  let e;
  try { e = JSON.parse(await request.text()); } catch { return new Response(null, { status: 400 }); }
  if (!e || !TYPES.has(e.type) || typeof e.vid !== "string" || !/^[A-Za-z0-9-]{8,64}$/.test(e.vid)) return new Response(null, { status: 400 });
  const cf = request.cf || {};
  await ensureSchema(env.DB);
  const now = Date.now();
  await env.DB.prepare(`INSERT INTO events (ts,type,vid,sid,path,ref,detail,place,place_name,nation,council,featured,country,city,device)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
    now, e.type, e.vid,
    /^[A-Za-z0-9-]{8,64}$/.test(e.sid || "") ? e.sid : null,
    clip(e.path, 120),
    e.type === "pageview" ? refHost(e.ref, url.hostname) : null,
    clip(e.type === "search_miss" ? String(e.detail || "").toLowerCase() : e.detail, 60),
    clip(e.place, 16), clip(e.place_name, 80),
    NATIONS.has(e.nation) ? e.nation : null,
    clip(e.council, 80),
    e.featured === true ? 1 : e.featured === false ? 0 : null,
    clip(cf.country, 4), clip(cf.city, 60), device(ua),
  ).run();
  if (Math.random() < 0.01) await env.DB.prepare("DELETE FROM events WHERE ts < ?").bind(now - RETAIN_MS).run();
  return new Response(null, { status: 204 });
}

function authorised(request, env) {
  const h = request.headers.get("authorization") || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!env.ADMIN_TOKEN || !token || token.length !== env.ADMIN_TOKEN.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i++) diff |= token.charCodeAt(i) ^ env.ADMIN_TOKEN.charCodeAt(i);
  return diff === 0;
}

async function summary(env, url) {
  await ensureSchema(env.DB);
  const db = env.DB, now = Date.now();
  const days = Math.min(365, Math.max(1, Number(url.searchParams.get("days")) || 30));
  const since = now - days * DAY;
  const all = (sql, ...b) => db.prepare(sql).bind(...b).all().then(r => r.results);
  const one = (sql, ...b) => db.prepare(sql).bind(...b).first();
  const VISIT = "type IN ('pageview','place','view','tab','layer','search_miss','ai_guide')";
  const totals = async from => one(`SELECT
      (SELECT COUNT(*) FROM events WHERE type='pageview' AND ts>=?1) AS visits,
      (SELECT COUNT(DISTINCT vid) FROM events WHERE ${VISIT} AND ts>=?1) AS visitors,
      (SELECT COUNT(*) FROM events WHERE type='place' AND ts>=?1) AS places,
      (SELECT COUNT(DISTINCT place) FROM events WHERE type='place' AND ts>=?1) AS distinct_places`, from);
  const top = (col, type, lim = 15) => all(`SELECT ${col} AS k, COUNT(*) AS n, COUNT(DISTINCT vid) AS u FROM events
      WHERE type ${Array.isArray(type) ? `IN (${type.map(t => `'${t}'`).join(",")})` : `='${type}'`} AND ts>=? AND ${col} IS NOT NULL
      GROUP BY ${col} ORDER BY n DESC LIMIT ${lim}`, since);

  const [d1, d7, d30, live, daily, places, councils, nations, views, tabs, via, misses, refs, countries, cities, devices, guides, layers, recent, funnel] = await Promise.all([
    totals(now - DAY), totals(now - 7 * DAY), totals(now - 30 * DAY),
    all(`SELECT e.vid, e.ts, e.detail, e.place_name, e.council, e.country, e.city, e.device FROM events e
         JOIN (SELECT vid, MAX(id) AS id FROM events WHERE ts>=? GROUP BY vid) l ON l.id=e.id ORDER BY e.ts DESC LIMIT 100`, now - 90000),
    all(`SELECT strftime('%Y-%m-%d', ts/1000, 'unixepoch') AS day,
           SUM(type='pageview') AS visits, COUNT(DISTINCT CASE WHEN ${VISIT} THEN vid END) AS visitors, SUM(type='place') AS places
         FROM events WHERE ts>=? GROUP BY day ORDER BY day`, now - 30 * DAY),
    all(`SELECT place_name AS k, council AS c, nation, MAX(featured) AS f, COUNT(*) AS n, COUNT(DISTINCT vid) AS u FROM events
         WHERE type='place' AND ts>=? AND place_name IS NOT NULL GROUP BY place, place_name ORDER BY n DESC LIMIT 25`, since),
    top("council", "place"), top("nation", "place"), top("detail", "view"), top("detail", "tab"), top("detail", "place"),
    top("detail", "search_miss", 25), top("ref", "pageview"),
    top("country", "pageview"),
    all(`SELECT city || ', ' || country AS k, COUNT(*) AS n, COUNT(DISTINCT vid) AS u FROM events
         WHERE type='pageview' AND ts>=? AND city IS NOT NULL GROUP BY k ORDER BY n DESC LIMIT 15`, since),
    top("device", "pageview"), top("place_name", "ai_guide"), top("detail", "layer"),
    all(`SELECT ts, type, detail, place_name, council, country, city, device FROM events
         WHERE type<>'heartbeat' ORDER BY id DESC LIMIT 60`),
    one(`SELECT COUNT(DISTINCT CASE WHEN ${VISIT} THEN vid END) AS visited,
           COUNT(DISTINCT CASE WHEN type='place' THEN vid END) AS opened_place,
           COUNT(DISTINCT CASE WHEN type='tab' THEN vid END) AS read_tabs,
           COUNT(DISTINCT CASE WHEN type='view' AND detail IN ('compare','budget') THEN vid END) AS planned,
           COUNT(DISTINCT CASE WHEN type='view' AND detail='settle' THEN vid END) AS settle
         FROM events WHERE ts>=?`, since),
  ]);
  return { now, days, totals: { d1, d7, d30 }, live, daily, places, councils, nations, views, tabs, via, misses, refs, countries, cities, devices, guides, layers, recent, funnel };
}

async function eventsCsv(env, url) {
  await ensureSchema(env.DB);
  const days = Math.min(400, Math.max(1, Number(url.searchParams.get("days")) || 30));
  const { results } = await env.DB.prepare(`SELECT ts,type,vid,detail,place_name,council,nation,ref,country,city,device FROM events
     WHERE ts>=? AND type<>'heartbeat' ORDER BY ts DESC LIMIT 50000`).bind(Date.now() - days * DAY).all();
  const cols = ["time", "type", "visitor", "detail", "place", "council", "nation", "referrer", "country", "city", "device"];
  const esc = v => { if (v == null) return ""; let s = String(v); if (/^[=+\-@]/.test(s)) s = "'" + s; return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const rows = results.map(r => [new Date(r.ts).toISOString(), r.type, r.vid.slice(0, 8), r.detail, r.place_name, r.council, r.nation, r.ref, r.country, r.city, r.device].map(esc).join(","));
  return new Response([cols.join(","), ...rows].join("\n"), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="locatewright-events-${days}d.csv"`, "cache-control": "no-store" },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      try {
        if (!env.DB) return json({ error: "Analytics database is not configured." }, 503);
        if (url.pathname === "/api/event") return request.method === "POST" ? await recordEvent(request, env) : new Response(null, { status: 405 });
        if (url.pathname.startsWith("/api/admin/")) {
          if (request.method !== "GET") return new Response(null, { status: 405 });
          if (!authorised(request, env)) return json({ error: "Wrong or missing admin token." }, 401);
          if (url.pathname === "/api/admin/summary") return json(await summary(env, url));
          if (url.pathname === "/api/admin/events.csv") return await eventsCsv(env, url);
        }
        return json({ error: "Not found" }, 404);
      } catch (err) {
        console.error(err);
        return json({ error: "Server error" }, 500);
      }
    }
    return env.ASSETS.fetch(request);
  },
};
