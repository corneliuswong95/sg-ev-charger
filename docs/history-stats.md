# History-based stats

The Stats tab ([components/StatsView.tsx](../components/StatsView.tsx)) only knows the
latest LTA snapshot. This is the plan for stats over time, and the record of what's
built so far.

**Status:** the collector (phase 1) is built. The charts (phase 3) aren't.

## Constraints

- **Free services only.** Vercel is on Hobby, where cron jobs run at most once a day,
  so Vercel Cron can't take snapshots.
- **LTA updates `EVCBatch` every 5 minutes** (DataMall API User Guide v6.10, §2.29;
  confirmed by sampling on 17 Oct 2026 — new data appears 1–2 minutes after each
  5-minute mark).
- **Licence.** DataMall data is under the Singapore Open Data Licence v1.0, which
  allows storing, deriving and publishing stats. Charts must show a conspicuous
  credit with a link to the licence, e.g. "Contains information from LTA DataMall
  accessed on {date}, made available under the terms of the
  [Singapore Open Data Licence version 1.0](https://datamall.lta.gov.sg/content/datamall/en/SingaporeOpenDataLicence.html)",
  and must not suggest LTA endorses the app.

## How it works

```
GitHub Actions (every 15 min, :07 :22 :37 :52)
  └─ POST https://sg-ev-charger.vercel.app/api/cron/snapshot   Authorization: Bearer $CRON_SECRET
       └─ fetch EVCBatch → recordSnapshot()                    lib/server/history.ts
            └─ Supabase Postgres (free tier)                   db/history.sql
```

- [.github/workflows/history-snapshot.yml](../.github/workflows/history-snapshot.yml) —
  only calls the route. Free because the repo is public. GitHub may start runs late or
  skip some, so small gaps are expected. A monthly job re-enables the workflow, since
  GitHub turns off schedules in public repos after 60 days without activity.
- [app/api/cron/snapshot/route.ts](../app/api/cron/snapshot/route.ts) — checks the
  shared secret, fetches the feed, records it.
- [lib/server/history.ts](../lib/server/history.ts) — builds the rows and calls two SQL
  functions through [lib/server/supabase.ts](../lib/server/supabase.ts).
- [db/history.sql](../db/history.sql) — tables and functions. Paste into Supabase →
  SQL Editor → Run; it can be re-run after changes.

### What's stored

| Table | Written | Contents |
|---|---|---|
| `snapshots` | every run | National counts plus per-district and per-operator counts as JSON arrays. Keyed by LTA's `LastUpdatedTime`, so repeat calls are no-ops |
| `station_days` | every run | Per station per Singapore day: snapshots seen, with a live status, and full (every reporting plug in use) |
| `stations` | daily | Station catalogue: name, operator key, postcode, district, location, first/last seen |
| `plugs` | daily | Every charge point (`evCpId`): station, type, kW, listed price, first/last seen |
| `price_changes` | daily | A charge point's LTA-listed price changed (before lib/priceCorrections.ts) |

Expected size: roughly 150 MB a year, inside the 500 MB free limit for about three
years. Check the real figure after the first week (Supabase → Database → Usage).

### Setup (one-off)

1. Supabase: create a free project (Singapore region) and run `db/history.sql`.
2. Vercel env vars (Production and Preview): `SUPABASE_URL`, `SUPABASE_SECRET_KEY`
   (a `sb_secret_…` key, marked Sensitive), `CRON_SECRET`.
3. GitHub → Settings → Secrets and variables → Actions → repository secret
   `CRON_SECRET`, same value as on Vercel.
4. Merge to `main`: GitHub only runs schedules from the default branch. To check,
   run the workflow by hand from the Actions tab (it has a "Run workflow" button).

The free Supabase project pauses after a week without activity; the collector's
writes keep it awake. If it ever pauses, restore it from the Supabase dashboard.

## Gotchas

- **Station ids aren't permanent.** `Charger.id` is a hash of the station's charge
  point ids ([lib/server/normalize.ts](../lib/server/normalize.ts)), so it changes when
  a plug is added or removed. Group by `postal_code` + `operator` to follow a site;
  plugs are tracked by `evCpId`.
- **Names come from the collector's own normalisation without parking matching**, so
  generic HDB names read "123 Tampines Street 11" rather than "Blk 123 … car park".
  Prefer the live name for the same id when showing a station.
- **"No live status" is not "broken".** Reliability stats should say "reporting".
- **Time zone.** Rows are bucketed by Singapore date; `taken_at` is UTC.
- **Public holidays.** "Sunday vs weekday" needs a public holiday list (MOM publishes
  one) so holidays aren't counted as weekdays.

## Next phases

**Phase 2 — let it collect (1–2 weeks).** Check for gaps in `snapshots`, database
size, and errors in the workflow runs and Vercel logs.

**Phase 3 — Trends section in the Stats tab (after about a week of data).**

| Stat | Example | From |
|---|---|---|
| Busiest hour | Heatmap of plugs in use by weekday × hour, nationally or per district | `snapshots` |
| Sunday vs weekday | "Sundays are 18% busier than Mondays" | `snapshots` + holiday list |
| Night owls | Share of charging between 10.30pm and 7am (HDB night parking hours) | `snapshots` |
| Record moment | "Busiest moment on record: 3,402 plugs in use, Sat 12 Dec, 8.15pm" | `snapshots` |

Read through a cached `app/api/history/route.ts` that returns ready-to-render
aggregates; hide the section until there's at least a week of data, and add the
licence credit above.

**Phase 4 — after about a month.**

| Stat | From |
|---|---|
| Most reliable stations (share of the day reporting) | `station_days` + `stations` |
| Hardest to get (most often full) | `station_days` + `stations` |
| Operator uptime league | `station_days` + `stations` |
| Price changes ("SP raised DC prices at 40 stations this week") | `price_changes` + `plugs` |
| Network growth (plugs over time, new plugs this month) | `plugs.first_seen` / `last_seen` |

Retention: if the database nears its limit, downsample `snapshots` older than 90 days
to hourly.
