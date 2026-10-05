# SG EV Charger Map

A mobile-first web app showing real-time EV charger availability across Singapore. Live data from LTA DataMall's `EVCBatch` endpoint — covers ~2,700 stations with availability, operator, connector types, charging speed, and pricing.

## Features

- **Map** — every public charger in Singapore; each pin shows how many connectors are free right now (green = free, red = all in use, grey = no live status, yellow corner = 50 kW+)
- **Search** by place, street, postcode or operator; filters for available now, fast (50 kW+), DC, and operator
- **Station details** — per-connector type, power, live status and price per kWh
- **Prices tab** — every charger ranked cheapest first (AC or DC), plus an operator comparison
- **Extra charges** — idle fees and other time-based charges from each operator's published terms, with sources, and whether they apply at that station
- **Parking** — for stations in HDB car parks (~1,900 of them): HDB rates, day/night caps, free parking on Sundays and public holidays, and live free car lots
- Get directions (Apple Maps on iOS, Google Maps elsewhere)

## Tech stack

- **Next.js 14** (App Router, TypeScript)
- **react-leaflet** + CartoDB dark tiles
- **LTA DataMall** EVCBatch and CarParkAvailabilityv2 (server-side proxied)
- **data.gov.sg** HDB Carpark Information

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
├── api/chargers/route.ts        # normalized chargers (LTA + HDB match)
├── api/carparks/[code]/route.ts # one HDB car park + live lots
├── globals.css                  # design tokens + all styles
├── layout.tsx                   # fonts (Barlow / Barlow Condensed)
└── page.tsx                     # state holder
components/
├── MapView.tsx                  # react-leaflet (dynamic, ssr:false)
├── TopBar.tsx                   # search + filters
├── StationListSheet.tsx         # swipeable list of nearby / matching stations
├── ChargerSheet.tsx             # station details, fees, parking
├── PricesView.tsx               # cheapest-first ranking + operator comparison
└── TabBar.tsx, Fabs.tsx, …
lib/
├── server/                      # LTA + data.gov.sg clients, caches, normalizer
├── tariffs.ts                   # curated idle / time-based fees with sources
├── parking.ts                   # HDB parking rules
├── chargers.ts                  # status / filter helpers
├── operators.ts                 # brand names + logos
└── types.ts
```

## License

MIT. Data © LTA Singapore and HDB, used under the [Singapore Open Data Licence](https://datamall.lta.gov.sg/content/datamall/en/SingaporeOpenDataLicence.html). Operator fee details are summarised from each operator's published terms (linked in the app).
