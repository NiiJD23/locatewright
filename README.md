# LocateWright

**Know a place before you move.** LocateWright is an interactive relocation guide to the United Kingdom. Pick a nation, region and council area, then any city, town or village, to see who lives there, how people talk, what they eat, its history and sights, what rent and local tax really cost, where to pay for council services and what to sort out in your first month.

Designed and developed by Promintal Consulting UK.

## Features

- **3D relief map** of England, Scotland, Wales and Northern Ireland (three.js): hill-shaded uplands, animated sea, pillars for the 49 places with full guides (height = rent or local tax) and a dot for every other settlement.
- **19,928 places**: every named city, town and village in Great Britain (OS Open Names) plus the main towns of Northern Ireland, each linked to its council.
- **Browse or search**: nation › region › council area (all 361 councils) › place, or search by name (English or Welsh) or postcode district.
- **Full guides for 49 places**: people, local phrasebook, languages, food, history, places to visit, neighbourhoods with postcodes, transport, environment and clean-air rules, council office address.
- **Living costs**: 2026/27 Band D council tax for every council in England, Scotland and Wales, NI domestic rate poundages, ONS rents, Ofgem price cap, water bills and TV licence.
- **Compare** up to three places, **Budget** planner, **Settle-in** checklist per nation.
- **Visitor analytics** with a private live dashboard at `/admin` (Cloudflare Worker + D1).
- **Ask a local** and **AI local guides** for any town or village (shown only where an AI runtime is available; hidden on the public site).

## Visitor analytics

Open **`/admin`** (for example `https://locatewright.promintal.com/admin`) and enter the `ADMIN_TOKEN`. The dashboard refreshes every 15 seconds and shows:

- **Live now:** who has LocateWright open, which place they are looking at, their city, country and device
- **Visits and unique visitors** for the last 24 hours, 7 days and 30 days, with a 30-day chart
- **Most viewed places** (full guides and every other town or village), **councils** and **nations**
- **Visitor journey:** visited, opened a place, read a guide tab, compared or budgeted, opened Settle in
- **Guide tabs read**, **sections used**, **map layers**, and whether places were found by **search or the map**
- **Searches with no result**, to show which places people expect to find
- **Referring sites, countries, cities, devices**, a **recent activity** feed and a **CSV download**

Tracking is off when the page is opened as a file, on localhost, inside the AI runtime, and when the browser sends Do Not Track or Global Privacy Control. Crawlers are not counted.

## Data and privacy

- Stored: a random visitor ID (kept in the browser), page views, places, tabs, sections and map layers opened, search words with no match, the referring site's name, device type, and country and city from Cloudflare.
- Not stored: IP addresses, names, emails, Budget figures or Ask-a-local text. There are no cookies.
- Events are deleted after about 13 months. The notice is in `public/privacy.html`, linked from the footer; have it reviewed before relying on it.

## Deploy to Cloudflare (locatewright.promintal.com)

1. **Deploy from Git.** Workers & Pages → Create → Import a repository → this repo. Deploy command `npx wrangler deploy`, no build command. Every push to `main` redeploys. Use a Worker, not a Pages project, so the analytics API runs.
2. **Database.** `wrangler.jsonc` binds a D1 database named `locatewright`. Wrangler creates it on the first deploy; tables are created on first use.
3. **Admin token.** Worker → Settings → Variables and Secrets → Add. Type *Secret*, name `ADMIN_TOKEN`, value a long random password only you know.
4. **Domain.** Worker → Domains & Routes → Add → Custom domain → `locatewright.promintal.com`.

Run locally with `npm install`, a `.dev.vars` file containing `ADMIN_TOKEN=...`, then `npm run dev`. (Tracking is off on localhost, so test events with curl or a mapped hostname.)

## Project layout

```
public/
  index.html      the app (HTML, CSS, JavaScript and data in one file)
  admin.html      visitor analytics dashboard (needs ADMIN_TOKEN)
  privacy.html    privacy notice
  sources.html    every data source, linked from the footer
  _headers        security headers
src/worker.js     serves public/ and the analytics API (/api/event, /api/admin/*)
wrangler.jsonc    Cloudflare Worker config with the D1 database binding
data-build/       scripts and sources for the embedded data
```

`public/index.html` also works on its own: open it in a browser or host it anywhere static (analytics then stay off).

## Rebuilding the data

`data-build/` holds the scripts that produced the embedded data:

- `build_outlines.mjs` builds simplified nation outlines from Natural Earth (`world-atlas`, `topojson-client`, `@turf/turf`).
- `build_gazetteer.py` builds the settlement gazetteer from OS Open Names / ONSPD (via the `uk-address-lookup` npm package), GeoNames (via `reverse_geocoder`), ONS council boundaries and mySociety's council list (`pyproj`, `shapely`).
- `source/` holds the hand-written place guides and the 2026/27 Band D table.

## Data sources

- ONS Price Index of Private Rents and local housing statistics (Open Government Licence v3.0)
- MHCLG, Welsh Government and Scottish Government council tax 2026/27; DoF NI rate poundages 2026/27 (OGL v3.0)
- OS Open Names and ONS Postcode Directory, contains OS data © Crown copyright and database right; ONS boundaries (OGL v3.0)
- mySociety UK local authority names and codes (see that repository for its licence)
- GeoNames (CC BY 4.0); Natural Earth (public domain)
- Font: Selawik by Microsoft (github.com/microsoft/Selawik), SIL Open Font License 1.1, compiled from the source UFOs to WOFF2 in `public/fonts/` (licence in `public/fonts/Selawik-OFL.txt`)
- Ofgem energy price cap, Water UK average bills, DCMS TV licence fee

Figures checked October 2026. Rents are area averages, not quotes for a specific home.

## Licence

Copyright © 2026 Promintal Consulting Limited. All rights reserved. See [LICENSE](LICENSE). Third-party data remains under its own licence, listed above.
