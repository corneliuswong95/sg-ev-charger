# SG EV Charger Map

A mobile-first web app showing real-time EV charger availability across Singapore. Live data from LTA DataMall's `EVCBatch` endpoint — covers ~2,700 stations with availability, operator, connector types, charging speed, and pricing.

## Features

- Live `Available / Total` count per station
- Operator (SP Mobility, Strides YTL, Charge+, BlueSG, etc.)
- Connector breakdown — plug type, AC/DC, kW, price per kWh
- Filter chips: All / Available / Fast (≥50 kW) / DC only
- Tap a pin → bottom sheet → Navigate (opens Apple Maps on iOS, Google Maps elsewhere)
- "My location" button
- Dark mode-only, optimized for phone viewports

## Tech stack

- **Next.js 14** (App Router, TypeScript)
- **react-leaflet** + CartoDB dark tiles
- **LTA DataMall** EVCBatch endpoint (server-side proxied)

## Setup

1. **Clone & install**
   ```bash
   git clone git@github.com:corneliuswong95/sg-ev-charger.git
   cd sg-ev-charger
   npm install
   ```

2. **Get an LTA DataMall AccountKey** — free at [datamall.lta.gov.sg](https://datamall.lta.gov.sg).

3. **Create `.env.local`**
   ```
   LTA_ACCOUNT_KEY=your-key-here
   ```

4. **Run**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000).

## How the data flow works

```
Browser ── fetch /api/chargers ──► Next.js Route Handler ── AccountKey ──► LTA DataMall EVCBatch
                                                                          │
                                                                          ▼
                                                                   presigned S3 URL
                                                                          │
                                                                          ▼
                                                                  ~4 MB JSON of stations
```

The proxy lives at [app/api/chargers/route.ts](app/api/chargers/route.ts). The AccountKey stays on the server — the browser never sees it.

## Deploy to Render

1. Push to GitHub (already done).
2. [render.com](https://dashboard.render.com) → New → Web Service → connect this repo.
3. Settings:
   - **Build:** `npm install && npm run build`
   - **Start:** `npm start`
   - **Region:** Singapore (recommended)
4. Environment variables:
   - `LTA_ACCOUNT_KEY` — your LTA key
   - `NODE_VERSION` — `20`

Render auto-deploys on every `git push origin main`.

## Project structure

```
app/
├── api/chargers/route.ts   # LTA proxy
├── globals.css             # dark theme + sheet/marker styles
├── layout.tsx
├── page.tsx                # main composition + state
└── icon.svg                # favicon
components/
├── ChargerSheet.tsx        # bottom sheet
├── Fabs.tsx                # zoom + locate buttons
├── FilterChips.tsx
├── Header.tsx              # logo + count + refresh
└── MapView.tsx             # react-leaflet (dynamic, ssr:false)
lib/
├── chargers.ts             # getStatus / getMaxKw / matchesFilter / uniquePlugSummary
└── types.ts                # Charger, ChargingPoint, PlugType
```

## License

MIT. Data © LTA Singapore, used under the [LTA DataMall terms](https://datamall.lta.gov.sg/content/datamall/en/SingaporeOpenDataLicence.html).
