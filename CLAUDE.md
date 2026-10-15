# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — start Next.js dev server (http://localhost:3000)
- `npm run build` — production build
- `npm start` — serve the production build
- `npx tsc --noEmit` — type-check only (no test runner or linter is configured)

Requires Node ≥ 18. Environment variables (see `.env.example`), all server-side only — never expose them to the client:

- `LTA_ACCOUNT_KEY` — **required**; used by [lib/server/lta.ts](lib/server/lta.ts).
- `URA_ACCESS_KEY` — optional; turns on URA car park rates in [lib/server/ura.ts](lib/server/ura.ts).
- `ONEMOTORING_INLINE=0` — optional kill switch; goes back to linking to OneMotoring instead of showing its rates (see below).

Anything under `lib/server/` must only be imported from route handlers.

## Architecture

Next.js 14 App Router, TypeScript strict mode, no global state library. Path alias `@/*` resolves to repo root (configured in [tsconfig.json](tsconfig.json)).

### Data sources

| Source | Used for | Code | Cache |
|---|---|---|---|
| LTA DataMall `EVCBatch` | Stations, connectors, live status, $/kWh | [lib/server/lta.ts](lib/server/lta.ts) | 60 s |
| data.gov.sg "HDB Carpark Information" | Matching stations to HDB car parks (free/night parking rules) | [lib/server/hdb.ts](lib/server/hdb.ts) | 24 h |
| LTA DataMall `CarParkAvailabilityv2` | Live free car lots (HDB, URA, ~40 major malls) and URA/mall car park locations | [lib/server/lta.ts](lib/server/lta.ts) | 2 min |
| URA Data Service `Car_Park_Details` | URA public car park rates by time band (**optional**: only if `URA_ACCESS_KEY` is set) | [lib/server/ura.ts](lib/server/ura.ts) | 24 h |
| data.gov.sg "Capacity of URA Parking Places" | URA car park locations + capacity without a key | [lib/server/ura.ts](lib/server/ura.ts) | 24 h |
| LTA OneMotoring "Parking Rates" (7 HTML pages) | ~420 mall/office/hotel car parks, matched by name. Shown inline under **LTA's written permission (Oct 2026, 12 months, renewable)** — keep to its terms: only the charger's own car park, text as published, credit "LTA OneMotoring" + updated date + link + GST note, fetch at most daily. `ONEMOTORING_INLINE=0` reverts to link-only | [lib/server/onemotoring.ts](lib/server/onemotoring.ts) | 24 h |
| JTC public car park price list (PDF) | Rates for 17 JTC car parks with chargers, hand-curated | [lib/curatedParking.ts](lib/curatedParking.ts) | — |
| Car park owners' own websites | Rates for 67 malls, hospitals and attractions, hand-curated | [lib/curatedMalls.ts](lib/curatedMalls.ts) | — |
| OneMap (SLA) Grey tiles | Base map (CARTO now needs an API key) | [components/MapView.tsx](components/MapView.tsx) | — |
| Hand-curated operator terms | Idle fees and other time-based charges | [lib/tariffs.ts](lib/tariffs.ts) | — |

All server caches go through `ttlCache` in [lib/server/cache.ts](lib/server/cache.ts) (in-flight de-dupe, serves stale on error) and are wired up in [lib/server/data.ts](lib/server/data.ts). Only `EVCBatch` is required: every parking source goes through `optional()` in `parkingSources()`, so if one fails chargers still load and just get less parking info.

### LTA EVCBatch → normalized `Charger[]`

`EVCBatch` returns an envelope with a presigned S3 `Link`, not the data. `fetchEvBatch()` makes **two sequential fetches** (envelope, then link), retrying once on a stale/403 link. The payload is `{ LastUpdatedTime, evLocationsData: [...] }` (older shapes are probed too). Normalize in [lib/server/normalize.ts](lib/server/normalize.ts) and update [lib/types.ts](lib/types.ts) — the client trusts the `Charger` shape.

Facts about the raw data that the normalizer relies on:

- **Availability is per connector** (`chargingPoints[].plugTypes[].evIds[].status`): `"1"` free, `"0"` in use, `""` no live status. Charging-point `status` `"100"` means not reporting. Counts are `available` / `occupied` / `offline` / `total` across evIds.
- **Price**: `priceType` is `"kWh"`, `"free"`, or `""` (no price submitted). `"0.0000"` with type `kWh` is treated as *not listed*, not free. Prices are as reported by operators (most appear GST-inclusive; don't claim this in the UI).
- **LTA prices can be wrong or stale.** Cross-checks against SP's and CDG's own listings matched ~99%, but LTA has had AC/DC prices swapped at some SP sites. Fixes live in [lib/priceCorrections.ts](lib/priceCorrections.ts): each one is tied to a station, operator and the exact wrong LTA price, so it stops applying once LTA is fixed, and the sheet shows what LTA listed. Operators that set live prices per site in their app only (Volt, Tesla) get a `priceCaveat` in [lib/tariffs.ts](lib/tariffs.ts), shown on the station and as a "Check app price" tag in the Prices tab. Don't "correct" a price without the operator's own published figure.
- `operatingHours` is always empty — don't build on it.
- ~40 LTA stations host **several operators**. The normalizer splits them into one `Charger` per operator (nudged ~8 m apart) so prices and fees stay with the right operator.
- LTA's station name and coordinates drift between snapshots, so ids are a hash of the sorted `evCpId`s and the name is the most common charge point name.
- Names/addresses arrive in ALL CAPS and are title-cased server-side via [lib/format.ts](lib/format.ts). Empty or generic names ("MULTI STOREY CAR PARK") fall back to the address.

### Parking matching (`lib/server/carparks.ts`)

Each station gets at most one `CarParkRef { kind: 'hdb' | 'ura' | 'jtc' | 'mall', code }`, matched in this order:

1. **HDB** — [lib/server/hdb.ts](lib/server/hdb.ts) converts HDB's SVY21 coordinates ([lib/svy21.ts](lib/svy21.ts)) and matches within 25 m, or within 100 m **and** the block number matches. ~1,900 stations. Don't loosen these thresholds without spot-checking: petrol stations and malls next to HDB blocks are the usual false positives.
2. **Curated** — `CURATED_CAR_PARKS` (JTC entries in [lib/curatedParking.ts](lib/curatedParking.ts) + `CURATED_MALLS` in [lib/curatedMalls.ts](lib/curatedMalls.ts)), regex on `${raw name} | ${raw address}`. The normalizer tries the displayed charge-point name first, then LTA's station-level name (they often differ, e.g. "GOLDEN VILLAGE (GV SUNTEC CITY)" vs "CITIBANK SUNTEC CITY MALL"). An entry's `ltaName` links it to LTA's live lots. Only add rates read on the owner's own page/PDF, with `source` and `checked`. Curated beats OneMotoring, so owner-published rates show inline.
3. **URA** — within 60 m, and either an off-street URA car park sharing a name word, or one with the same name. Kerbside service roads/back lanes and petrol stations never match.
4. **OneMotoring** — strict name match: the station's core words must equal the car park's, which may only add generic words (Hotel, Mall, Centre…); bracketed qualifiers like "(Tampines)" must appear in the station too.
5. **LTA-listed malls** — within 30 m (or 120 m with the same name) of an LTA-agency car park in the lots feed: live lots only.

`/api/parking/[kind]/[code]` returns a ready-to-render `ParkingDetails` (title, rate lines, live lots, notes, sources, and `link` when we can only point to the rates), fetched lazily by the detail sheet. Curated mall entries are generated from the owners' pages and then hand-reviewed: keep labels like "Mon–Fri, 7am to 5.59pm", put non-rate facts (height limits, gantry hours) in `notes`, and leave out pages that are stale, incomplete or ambiguous about which car park has the chargers. HDB rate rules (central-area list, caps, free parking) and URA band formatting live in [lib/parking.ts](lib/parking.ts). Fee rules that depend on location must test `c.carPark?.kind === 'hdb'`, not just `c.carPark`.

### Operator fees (`lib/tariffs.ts`)

LTA's feed has no idle fees or time-of-day pricing, so these are curated from each operator's own published pages. Only add figures with a source URL, and bump `TARIFFS_CHECKED` when re-verifying. `appliesAt` decides per station whether a fee applies (e.g. SP/ChargEco idle fees apply at HDB car parks; Shell's don't). Operator brand names and logo domains are in [lib/operators.ts](lib/operators.ts), keyed off LTA's registered company names.

### Client state lives in `app/page.tsx`

[app/page.tsx](app/page.tsx) is the single state holder: data, loading/refreshing/error, tab (`map` | `prices`), filters, operator, search query, selected station id, list expansion, user position. The selection is stored as an **id** and looked up in the latest data so an open sheet updates on refresh. Child components are presentational and receive callbacks. Keep new state here unless it's strictly local.

### Map is client-only and imperatively controlled

[components/MapView.tsx](components/MapView.tsx) uses `react-leaflet`, which touches `window`, so it's imported in `app/page.tsx` via `next/dynamic` with `ssr: false`. **Do not import `MapView` (or anything that pulls in `leaflet`) from a server component or top-level module** — it will break the build.

The map exposes an imperative handle (`MapHandle` with `zoomIn`/`zoomOut`/`flyTo`/`fitBounds`/`getCenter`) through an `onReady` callback. `flyTo` takes a pixel `offset` so a selected station lands above the bottom sheet (mobile) or right of the side panel (desktop); `fitBounds` takes padding for the same reason and is used to frame search results. Tiles are OneMap Grey (SLA) — its attribution is required, and `maxBounds` keeps the view on Singapore since OneMap only covers it.

Clustering uses `react-leaflet-cluster@2` — v4 requires React 19 / react-leaflet 5 and silently renders no markers on this stack. Pins are `L.divIcon`s styled by `.pin-*` classes in `globals.css`: colour = status, number = free connectors, yellow corner = 50 kW+. Icons are cached by appearance. Cluster rings show the share of child stations with a free connector (read from each marker's icon class).

### Prices tab (`components/PricesView.tsx`)

Ranks stations by their cheapest listed $/kWh for the chosen current (AC/DC). Stations listed as free are shown separately, stations with no price are counted but not ranked, and "typical" is the median. "By operator" uses each operator's median price and range. Time-based fee tags come from `timeFeeTag()` in [lib/tariffs.ts](lib/tariffs.ts): yellow when a fee definitely applies, outlined when it may. Each expanded operator row has "Show … on the map", which calls `showOperator()` in `app/page.tsx` (clears search and filters, sets the operator filter, fits the map to that operator's stations).

### Detail sheet (`components/ChargerSheet.tsx`)

The full header scrolls with the content; once it has scrolled away, a slim sticky bar (`.detail-mini`: name, status, close) fades in. It's an overlay with zero layout height, so toggling it never shifts the content — don't turn it back into a shrinking sticky header.

### Derived charger logic is centralized

[lib/chargers.ts](lib/chargers.ts) owns derived queries: `getStatus`, `STATUS_LABEL`, `availabilityShort`, `matchesFilters` (filters combine), `matchesOperator`, `matchesQuery`, `cheapestConnector`. When adding a filter or status, extend `FilterKey`/`Status` in [lib/types.ts](lib/types.ts) and the helpers here.

### Styling

All styling is in [app/globals.css](app/globals.css) using CSS custom properties. The visual language is Singapore car park signage: concrete greys (`--bg`), signage blue (`--sign`) for structure, `--go`/`--stop`/`--off` for status, lane yellow (`--amber`) only for extra fees. Barlow is the UI face; Barlow Condensed (`.num`, `--num`) is for numerals. Fonts load via `next/font/google` in [app/layout.tsx](app/layout.tsx). Mobile-first; at ≥768 px the sheets become a left-hand panel. There is no Tailwind or CSS-in-JS framework.

### Dependencies

Next.js 14.2.x has open security advisories whose only fix is Next 16. Upgrading means React 19, `react-leaflet` 5 and `react-leaflet-cluster` 4 together — plan it as one change and re-test the map (markers, clusters, sheets).
