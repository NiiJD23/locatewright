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
- **Ask a local** and **AI local guides** for any town or village (uses the viewer's Claude account when opened as a Claude artifact; hidden elsewhere).

## Running it

`index.html` is a single self-contained page. Open it in a browser or host it on any static host (for example Cloudflare Pages). It loads three.js r128 from cdnjs/jsDelivr and fonts from Google Fonts.

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
- Ofgem energy price cap, Water UK average bills, DCMS TV licence fee

Figures checked October 2026. Rents are area averages, not quotes for a specific home.

## Licence

Copyright © 2026 Promintal Consulting Limited. All rights reserved. See [LICENSE](LICENSE). Third-party data remains under its own licence, listed above.
