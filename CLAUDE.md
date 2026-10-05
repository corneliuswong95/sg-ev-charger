# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — start Next.js dev server (http://localhost:3000)
- `npm run build` — production build
- `npm start` — serve the production build
- `npx tsc --noEmit` — type-check only (no test runner or linter is configured)

Requires Node ≥ 18 and an `LTA_ACCOUNT_KEY` in `.env.local` (see `.env.example`). The key is consumed server-side only (by [lib/server/lta.ts](lib/server/lta.ts)) — never expose it to the client. Anything under `lib/server/` must only be imported from route handlers.

## Architecture

Next.js 14 App Router, TypeScript strict mode, no global state library. Path alias `@/*` resolves to repo root (configured in [tsconfig.json](tsconfig.json)).

### Data sources

| Source | Used for | Code | Cache |
|---|---|---|---|
| LTA DataMall `EVCBatch` | Stations, connectors, live status, $/kWh | [lib/server/lta.ts](lib/server/lta.ts) | 60 s |
| data.gov.sg "HDB Carpark Information" | Matching stations to HDB car parks (free/night parking rules) | [lib/server/hdb.ts](lib/server/hdb.ts) | 24 h |
| LTA DataMall `CarParkAvailabilityv2` | Live free car lots for the matched HDB car park | [lib/server/lta.ts](lib/server/lta.ts) | 2 min |
| Hand-curated operator terms | Idle fees and other time-based charges | [lib/tariffs.ts](lib/tariffs.ts) | — |

All server caches go through `ttlCache` in [lib/server/cache.ts](lib/server/cache.ts) (in-flight de-dupe, serves stale on error) and are wired up in [lib/server/data.ts](lib/server/data.ts). HDB data is optional: if data.gov.sg fails, chargers still load with `carPark: null`.

### LTA EVCBatch → normalized `Charger[]`

`EVCBatch` returns an envelope with a presigned S3 `Link`, not the data. `fetchEvBatch()` makes **two sequential fetches** (envelope, then link), retrying once on a stale/403 link. The payload is `{ LastUpdatedTime, evLocationsData: [...] }` (older shapes are probed too). Normalize in [lib/server/normalize.ts](lib/server/normalize.ts) and update [lib/types.ts](lib/types.ts) — the client trusts the `Charger` shape.

Facts about the raw data that the normalizer relies on:

- **Availability is per connector** (`chargingPoints[].plugTypes[].evIds[].status`): `"1"` free, `"0"` in use, `""` no live status. Charging-point `status` `"100"` means not reporting. Counts are `available` / `occupied` / `offline` / `total` across evIds.
- **Price**: `priceType` is `"kWh"`, `"free"`, or `""` (no price submitted). `"0.0000"` with type `kWh` is treated as *not listed*, not free. Prices are as reported by operators (most appear GST-inclusive; don't claim this in the UI).
- `operatingHours` is always empty — don't build on it.
- ~40 LTA stations host **several operators**. The normalizer splits them into one `Charger` per operator (nudged ~8 m apart) so prices and fees stay with the right operator.
- LTA's station name and coordinates drift between snapshots, so ids are a hash of the sorted `evCpId`s and the name is the most common charge point name.
- Names/addresses arrive in ALL CAPS and are title-cased server-side via [lib/format.ts](lib/format.ts). Empty or generic names ("MULTI STOREY CAR PARK") fall back to the address.

### HDB car park matching

[lib/server/hdb.ts](lib/server/hdb.ts) converts HDB's SVY21 coordinates ([lib/svy21.ts](lib/svy21.ts)) and matches a station if it is within 25 m of a car park, or within 100 m **and** the block number matches. LTA geocodes most HDB stations to the car park itself, so ~1,900 of ~2,800 stations match. Don't loosen these thresholds without spot-checking: petrol stations and malls next to HDB blocks are the usual false positives. Rate rules (central-area list, caps, free parking) live in [lib/parking.ts](lib/parking.ts). `/api/carparks/[code]` serves one car park's details plus live lots, fetched lazily by the detail sheet.

### Operator fees (`lib/tariffs.ts`)

LTA's feed has no idle fees or time-of-day pricing, so these are curated from each operator's own published pages. Only add figures with a source URL, and bump `TARIFFS_CHECKED` when re-verifying. `appliesAt` decides per station whether a fee applies (e.g. SP/ChargEco idle fees apply at HDB car parks; Shell's don't). Operator brand names and logo domains are in [lib/operators.ts](lib/operators.ts), keyed off LTA's registered company names.

### Client state lives in `app/page.tsx`

[app/page.tsx](app/page.tsx) is the single state holder: data, loading/refreshing/error, tab (`map` | `prices`), filters, operator, search query, selected station id, list expansion, user position. The selection is stored as an **id** and looked up in the latest data so an open sheet updates on refresh. Child components are presentational and receive callbacks. Keep new state here unless it's strictly local.

### Map is client-only and imperatively controlled

[components/MapView.tsx](components/MapView.tsx) uses `react-leaflet`, which touches `window`, so it's imported in `app/page.tsx` via `next/dynamic` with `ssr: false`. **Do not import `MapView` (or anything that pulls in `leaflet`) from a server component or top-level module** — it will break the build.

The map exposes an imperative handle (`MapHandle` with `zoomIn`/`zoomOut`/`flyTo`/`getCenter`) through an `onReady` callback. `flyTo` takes a pixel `offset` so a selected station lands above the bottom sheet (mobile) or right of the side panel (desktop).

Clustering uses `react-leaflet-cluster@2` — v3+ requires React 19 / react-leaflet 5 and silently renders no markers on this stack. Pins are `L.divIcon`s styled by `.pin-*` classes in `globals.css`: colour = status, number = free connectors, yellow corner = 50 kW+. Icons are cached by appearance. Cluster rings show the share of child stations with a free connector (read from each marker's icon class).

### Derived charger logic is centralized

[lib/chargers.ts](lib/chargers.ts) owns derived queries: `getStatus`, `STATUS_LABEL`, `availabilityShort`, `matchesFilters` (filters combine), `matchesOperator`, `matchesQuery`, `cheapestConnector`. When adding a filter or status, extend `FilterKey`/`Status` in [lib/types.ts](lib/types.ts) and the helpers here.

### Styling

All styling is in [app/globals.css](app/globals.css) using CSS custom properties. The visual language is Singapore car park signage: concrete greys (`--bg`), signage blue (`--sign`) for structure, `--go`/`--stop`/`--off` for status, lane yellow (`--amber`) only for extra fees. Barlow is the UI face; Barlow Condensed (`.num`, `--num`) is for numerals. Fonts load via `next/font/google` in [app/layout.tsx](app/layout.tsx). Mobile-first; at ≥768 px the sheets become a left-hand panel. There is no Tailwind or CSS-in-JS framework.
