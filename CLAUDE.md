# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — start Next.js dev server (http://localhost:3000)
- `npm run build` — production build
- `npm start` — serve the production build
- `npx tsc --noEmit` — type-check only (no test runner or linter is configured)

Requires Node ≥ 18 and an `LTA_ACCOUNT_KEY` in `.env.local` (see `.env.example`). The key is consumed server-side only by [app/api/chargers/route.ts](app/api/chargers/route.ts) — never expose it to the client.

## Architecture

Next.js 14 App Router, TypeScript strict mode, no global state library. Path alias `@/*` resolves to repo root (configured in [tsconfig.json](tsconfig.json)).

### Data flow: LTA DataMall → normalized `Charger[]`

The LTA DataMall `EVCBatch` endpoint returns an envelope containing a one-time S3 `Link`, not the data itself. [app/api/chargers/route.ts](app/api/chargers/route.ts) performs **two sequential fetches**: first to `EVCBATCH_URL` with the `AccountKey` header, then to the `Link` URL returned in the envelope (`value[0].Link` or top-level `Link`). The raw shape also varies (`raw` may be an array, or wrapped in `value` or `chargingStations`), so the code probes all three. If you add fields or filters, normalize in `normalize()` and update [lib/types.ts](lib/types.ts) — the rest of the app trusts the `Charger` shape.

Availability is **derived**, not given: `deriveAvailability()` counts each `chargingPoint.evIds` entry with `status === '1'` as available; if `evIds` is absent it falls back to the point-level `status === 1`. Don't read availability from raw LTA fields directly.

The route uses `export const revalidate = 60` and `next: { revalidate: 60 }` on the inner fetches, so responses are cached for 60s at the edge.

### Client state lives in `app/page.tsx`

[app/page.tsx](app/page.tsx) is the single state holder: chargers, loading/refreshing/error, active filter, selected charger, user position. Child components are presentational and receive callbacks. There is no context/store — keep new state here unless it's strictly local.

### Map is client-only and imperatively controlled

[components/MapView.tsx](components/MapView.tsx) uses `react-leaflet`, which touches `window`, so it's imported in `app/page.tsx` via `next/dynamic` with `ssr: false`. **Do not import `MapView` (or anything that pulls in `leaflet`) from a server component or top-level module** — it will break the build.

The map exposes an imperative handle (`MapHandle` with `zoomIn`/`zoomOut`/`flyTo`) through an `onReady` callback rather than via refs. `app/page.tsx` stores the handle in a `useRef` and calls it from FABs, geolocation, and marker selection. When extending map controls, add to `MapHandle` in `MapView.tsx` and the consuming ref will pick it up.

Marker icons are inline-styled `L.divIcon` HTML. Color encodes status (green/red/grey from `getStatus`) and size encodes fast-charging (≥50 kW from `getMaxKw`).

### Derived charger logic is centralized

[lib/chargers.ts](lib/chargers.ts) owns all derived queries: `getStatus`, `getMaxKw`, `hasDC`, `matchesFilter`, `uniquePlugSummary`, `STATUS_LABEL`. Filter chips, marker styling, and the detail sheet all go through these helpers — when adding a new filter or status, extend `FilterKey`/`Status` in [lib/types.ts](lib/types.ts) and the helpers here in one place.

### Styling

All styling is in `app/globals.css` using CSS custom properties (`--green`, `--red`, `--surface2`, etc.). The app is mobile-first and locks `userScalable: false` in [app/layout.tsx](app/layout.tsx). There is no Tailwind or CSS-in-JS framework.
