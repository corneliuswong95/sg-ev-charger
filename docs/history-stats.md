# Plan: history-based stats (not built yet)

The Stats tab ([components/StatsView.tsx](../components/StatsView.tsx), figures in
[lib/stats.ts](../lib/stats.ts)) only knows the latest LTA snapshot. The app keeps no
history: `EVCBatch` is cached for 60 s and then thrown away. Everything below needs
snapshots saved over time.

## Stats this would unlock

| Stat | Example | Needs |
|---|---|---|
| Busiest hour | Heatmap of plugs in use by weekday × hour, nationally or per district | Rollups |
| Sunday vs Monday | "Sundays are 18% busier than Mondays" | Rollups + public holiday list |
| Night owls | Share of charging between 10.30pm and 7am (HDB night parking hours) | Rollups |
| Record moment | "Busiest moment ever: 3,402 plugs in use, Sat 12 Dec, 8.15pm" | Rollups |
| Most reliable station | Share of the day each station reports a live status | Station days |
| Hardest to get | Stations most often fully occupied | Station days |
| Operator uptime league | Share of plugs reporting, per operator, over 30 days | Station days |
| Price changes | "SP raised DC prices at 40 stations this week" | Change log |
| Network growth | Plugs over time; "312 new plugs this month" | Change log |

## What to record

Three tiers, smallest first. Avoid one row per station per snapshot: at ~2,700
stations every 15 minutes that is ~260k rows a day, too much for a free database.

1. **Rollups, every 15 minutes.** One record per snapshot: LTA's `LastUpdatedTime`,
   national free / in use / no status counts, the same per postal district (28) and
   per operator (~20). Roughly 50 small rows per snapshot, ~5k a day.
   `snapshotStats()` in `lib/stats.ts` already computes `live`, `districts` and
   `operators`, so the collector can reuse it.
2. **Station days, once a day.** Per station: samples taken, samples with a live
   status, samples fully occupied. Accumulate in memory (or a small table) during the
   day and write once.
3. **Change log, on change.** Per charge point (`evCpId`): first seen, last seen, and
   each change to a connector's listed price. Only written when something changes.

## Gotchas

- **Station ids aren't stable enough for history.** `Charger.id` is a hash of the
  station's sorted `evCpId`s ([lib/server/normalize.ts](../lib/server/normalize.ts)),
  so it changes when a plug is added or removed. Key history by `evCpId` (or by
  postcode + operator) and map back to stations when reading.
- **Names and coordinates drift** between LTA snapshots; don't use them as keys.
- **Skip duplicate snapshots.** If `LastUpdatedTime` hasn't moved, LTA hasn't
  refreshed; don't record the same data twice.
- **"No live status" is not "broken".** Reliability stats should say "reporting",
  not "working".
- **Time zone.** Bucket by Singapore time (`Asia/Singapore`), not server time.
- **Public holidays.** "Sunday vs weekday" needs a public holiday list (MOM publishes
  one) so holidays aren't counted as weekdays.
- **LTA DataMall terms.** Check that storing and publishing aggregates derived from
  DataMall data is allowed, and what attribution is needed, before shipping.

## Where to run it

The app is deployed on Render (see README). A Next.js route handler only runs when
called, so something must call it on a schedule. Options to weigh (check current
pricing and limits first):

- **Scheduled job → protected route.** A cron service calls
  `POST /api/cron/snapshot` with a secret header (`CRON_SECRET`); the route fetches
  `EVCBatch`, computes rollups and writes them to a hosted Postgres. Simple; needs a
  database and a scheduler (Render cron job, or an external one).
- **GitHub Actions + files in the repo ("git scraping").** A scheduled workflow
  fetches the feed and appends compact daily files to a data branch. No database;
  free for public repos, but Actions schedules can run late, and the repo grows.
- **Rollups only in a key-value store.** Cheapest if only tier 1 is wanted.

Whichever is chosen, keep the LTA key server-side (a CI secret or server env var),
in line with the rule that `LTA_ACCOUNT_KEY` is never exposed to the client.

## Suggested shape in the code

- `lib/server/history.ts` — `recordSnapshot(chargers, updatedAt)` writes tier 1 and
  updates the tier 2/3 state. Server-only, like the rest of `lib/server/`.
- `app/api/cron/snapshot/route.ts` — checks the secret, calls `chargers.get()` from
  [lib/server/data.ts](../lib/server/data.ts), then `recordSnapshot`.
- `app/api/history/route.ts` — returns ready-to-render aggregates (e.g.
  `?view=heatmap&range=30d`), cached for a few minutes.
- A **Trends** section in the Stats tab that appears once there's at least a week
  of data, so it never shows half-empty charts.
- Retention: keep 15-minute rollups for ~90 days, then downsample to hourly.

## Decisions needed before building

1. Where to run the scheduler and store the data (and whether it must be free).
2. Which tiers to start with. Tier 1 alone covers busiest hour, Sunday vs Monday,
   night owls and record moments.
3. How long to keep data.
4. The LTA DataMall terms check above.
