-- History tables for the Stats tab (see docs/history-stats.md).
-- Paste into Supabase → SQL Editor → Run. Safe to run again after changes.
--
-- Only the server's secret key (Postgres role service_role) can read or
-- write: Row Level Security is on with no policies, and the public API roles
-- (anon, authenticated) get no access to the tables or functions.

-- One row per recorded LTA update. LTA refreshes EVCBatch every 5 minutes;
-- the collector samples every 15.
create table if not exists public.snapshots (
  taken_at   timestamptz primary key,   -- LTA's LastUpdatedTime
  stations   integer not null,
  plugs      integer not null,
  free       integer not null,
  in_use     integer not null,
  no_status  integer not null,
  kw_in_use  real    not null,          -- rated kW of plugs in use (an upper bound)
  districts  jsonb   not null,          -- [[district_no, plugs, free, in_use, no_status], ...]
  operators  jsonb   not null           -- [[operator_key, plugs, free, in_use, no_status], ...]
);

-- Per station per Singapore day: snapshots it appeared in, had a live
-- status in, and was full in (every reporting plug in use).
create table if not exists public.station_days (
  day         date     not null,
  station_id  text     not null,
  samples     smallint not null,
  reporting   smallint not null,
  full_count  smallint not null,
  primary key (day, station_id)
);

-- "Popular times": per site, running totals for each hour of the week in
-- Singapore time. One row per site, 168 slots per array: index =
-- day of week (0 = Sunday) × 24 + hour + 1, so slot 1 is Sunday 12am–1am.
-- site_key is "<postcode>:<operator key>" (the station id if there's no
-- postcode), so a site keeps its history when plugs are added. Only
-- snapshots where the site reported a live status are counted.
create table if not exists public.site_hours (
  site_key    text primary key,
  reporting   integer[] not null default array_fill(0, array[168]),  -- snapshots counted
  plugs       integer[] not null default array_fill(0, array[168]),  -- sum of plugs reporting a status
  in_use      integer[] not null default array_fill(0, array[168]),  -- sum of plugs in use
  full_count  integer[] not null default array_fill(0, array[168])   -- snapshots with every reporting plug in use
);

-- Station catalogue, refreshed daily. station_id is Charger.id, which changes
-- when a station's set of plugs changes; group by postal_code + operator to
-- follow one site over time.
create table if not exists public.stations (
  station_id   text primary key,
  name         text not null,
  operator     text not null,            -- key from lib/operators.ts
  postal_code  text not null,
  district     smallint,                 -- postal district 1–28
  lat          double precision not null,
  lng          double precision not null,
  first_seen   date not null,
  last_seen    date not null
);
create index if not exists stations_last_seen on public.stations (last_seen);

-- Every LTA charge point (evCpId), refreshed daily.
create table if not exists public.plugs (
  ev_cp_id      text primary key,
  station_id    text not null,
  operator      text not null,
  plug_type     text not null,
  current_type  text not null,           -- 'AC' or 'DC'
  kw            real not null,
  price         numeric(8, 4),           -- $/kWh as LTA lists it; 0 = free, null = not listed
  first_seen    date not null,
  last_seen     date not null
);

-- A charge point's listed price changed (checked once a day).
create table if not exists public.price_changes (
  ev_cp_id   text not null,
  day        date not null,
  old_price  numeric(8, 4),
  new_price  numeric(8, 4),
  primary key (ev_cp_id, day)
);

alter table public.snapshots     enable row level security;
alter table public.station_days  enable row level security;
alter table public.site_hours    enable row level security;
alter table public.stations      enable row level security;
alter table public.plugs         enable row level security;
alter table public.price_changes enable row level security;

revoke all on public.snapshots, public.station_days, public.site_hours, public.stations, public.plugs,
  public.price_changes from anon, authenticated;

-- The first version took two arguments; the third has a default, so callers
-- of the old version keep working.
drop function if exists public.record_snapshot(jsonb, jsonb);

-- Record one snapshot, count it towards each station's day and each site's
-- hour of the week. Returns false, changing nothing, if this LTA update was
-- already recorded.
create or replace function public.record_snapshot(
  snapshot jsonb,
  station_samples jsonb,
  site_samples jsonb default '[]'::jsonb  -- [[site_key, plugs reporting, plugs in use, full (0/1)], ...]
)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  taken timestamptz := (snapshot ->> 'taken_at')::timestamptz;
  sgt   timestamp   := taken at time zone 'Asia/Singapore';
  slot  integer     := extract(dow from sgt)::integer * 24 + extract(hour from sgt)::integer + 1;
begin
  insert into public.snapshots (taken_at, stations, plugs, free, in_use, no_status, kw_in_use, districts, operators)
  values (
    taken,
    (snapshot ->> 'stations')::integer,
    (snapshot ->> 'plugs')::integer,
    (snapshot ->> 'free')::integer,
    (snapshot ->> 'in_use')::integer,
    (snapshot ->> 'no_status')::integer,
    (snapshot ->> 'kw_in_use')::real,
    snapshot -> 'districts',
    snapshot -> 'operators'
  )
  on conflict (taken_at) do nothing;
  if not found then
    return false;
  end if;

  insert into public.station_days as d (day, station_id, samples, reporting, full_count)
  select (taken at time zone 'Asia/Singapore')::date, s ->> 0, 1, (s ->> 1)::smallint, (s ->> 2)::smallint
  from jsonb_array_elements(station_samples) as s
  on conflict (day, station_id) do update set
    samples    = d.samples + 1,
    reporting  = d.reporting + excluded.reporting,
    full_count = d.full_count + excluded.full_count;

  insert into public.site_hours (site_key)
  select s ->> 0 from jsonb_array_elements(site_samples) as s
  on conflict (site_key) do nothing;

  update public.site_hours as h set
    reporting[slot]  = h.reporting[slot] + 1,
    plugs[slot]      = h.plugs[slot] + (s ->> 1)::integer,
    in_use[slot]     = h.in_use[slot] + (s ->> 2)::integer,
    full_count[slot] = h.full_count[slot] + (s ->> 3)::integer
  from jsonb_array_elements(site_samples) as s
  where h.site_key = s ->> 0;
  return true;
end;
$$;

-- Refresh the catalogue for one Singapore day and log any listed-price
-- changes since the last refresh. Returns the number of price changes.
create or replace function public.record_catalogue(p_day date, p_stations jsonb, p_plugs jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  changes integer;
begin
  insert into public.stations as t (station_id, name, operator, postal_code, district, lat, lng, first_seen, last_seen)
  select s ->> 0, s ->> 1, s ->> 2, s ->> 3, (s ->> 4)::smallint,
         (s ->> 5)::double precision, (s ->> 6)::double precision, p_day, p_day
  from jsonb_array_elements(p_stations) as s
  on conflict (station_id) do update set
    name        = excluded.name,
    operator    = excluded.operator,
    postal_code = excluded.postal_code,
    district    = excluded.district,
    lat         = excluded.lat,
    lng         = excluded.lng,
    last_seen   = greatest(t.last_seen, excluded.last_seen);

  -- Compare before the plugs are updated. Prices are rounded to the stored
  -- precision so an extra decimal from LTA isn't logged as a change every day.
  insert into public.price_changes as c (ev_cp_id, day, old_price, new_price)
  select p ->> 0, p_day, old.price, round((p ->> 6)::numeric, 4)
  from jsonb_array_elements(p_plugs) as p
  join public.plugs as old on old.ev_cp_id = p ->> 0
  where old.price is distinct from round((p ->> 6)::numeric, 4)
  on conflict (ev_cp_id, day) do update set new_price = excluded.new_price;
  get diagnostics changes = row_count;

  insert into public.plugs as t (ev_cp_id, station_id, operator, plug_type, current_type, kw, price, first_seen, last_seen)
  select p ->> 0, p ->> 1, p ->> 2, p ->> 3, p ->> 4, (p ->> 5)::real, round((p ->> 6)::numeric, 4), p_day, p_day
  from jsonb_array_elements(p_plugs) as p
  on conflict (ev_cp_id) do update set
    station_id   = excluded.station_id,
    operator     = excluded.operator,
    plug_type    = excluded.plug_type,
    current_type = excluded.current_type,
    kw           = excluded.kw,
    price        = excluded.price,
    last_seen    = greatest(t.last_seen, excluded.last_seen);
  return changes;
end;
$$;

-- Everything the Stats tab's Trends section shows, for all of Singapore
-- (p_district null) or one postal district. Shares are the fraction of plugs
-- reporting a status that are in use. p_holidays is a JSON array of
-- 'YYYY-MM-DD' public holidays (lib/holidays.ts), counted with Sundays.
create or replace function public.history_trends(p_district integer default null, p_holidays jsonb default '[]'::jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with base as (
    select taken_at, free, in_use from public.snapshots where p_district is null
    union all
    select s.taken_at, (d ->> 2)::integer, (d ->> 3)::integer
    from public.snapshots as s, jsonb_array_elements(s.districts) as d
    where p_district is not null and (d ->> 0)::integer = p_district
  ),
  b as (
    select taken_at, free, in_use,
           taken_at at time zone 'Asia/Singapore' as sgt,
           in_use::double precision / nullif(free + in_use, 0) as share
    from base
  ),
  latest as (select max(taken_at) as t, max(sgt) as sgt from b),
  holidays as (select value::date as day from jsonb_array_elements_text(p_holidays)),
  cells as (
    select extract(dow from sgt)::integer as dow, extract(hour from sgt)::integer as hour,
           avg(share) as share, count(*) as samples, count(distinct sgt::date) as days
    from b
    group by 1, 2
  ),
  kinds as (
    select case
             when extract(dow from sgt) = 0 or sgt::date in (select day from holidays) then 'rest'
             when extract(dow from sgt) between 1 and 5 then 'work'
           end as kind,
           share, sgt::date as day
    from b
  )
  select jsonb_build_object(
    'since',     (select min(taken_at) from b),
    'latest',    (select t from latest),
    'snapshots', (select count(*) from b),
    'days',      (select count(distinct sgt::date) from b),
    'last24h',   coalesce((
                   select jsonb_agg(jsonb_build_array(taken_at, in_use, free + in_use) order by taken_at)
                   from b where taken_at > (select t from latest) - interval '24 hours'
                 ), '[]'::jsonb),
    'record',    (select jsonb_build_object('t', taken_at, 'inUse', in_use, 'reporting', free + in_use)
                  from b order by in_use desc, taken_at limit 1),
    'cells',     coalesce((
                   select jsonb_agg(jsonb_build_array(dow, hour, round(share::numeric, 4), samples, days) order by dow, hour)
                   from cells where share is not null
                 ), '[]'::jsonb),
    'usualNow',  (select jsonb_build_object('share', round(avg(b.share)::numeric, 4), 'days', count(distinct b.sgt::date))
                  from b, latest
                  where extract(dow from b.sgt) = extract(dow from latest.sgt)
                    and extract(hour from b.sgt) = extract(hour from latest.sgt)
                    and b.sgt::date < latest.sgt::date),
    'night',     (select jsonb_build_object(
                    'night', sum(in_use) filter (where sgt::time >= '22:30' or sgt::time < '07:00'),
                    'all', sum(in_use))
                  from b),
    'restVsWork', (select jsonb_build_object(
                    'rest', round((avg(share) filter (where kind = 'rest'))::numeric, 4),
                    'restDays', count(distinct day) filter (where kind = 'rest'),
                    'work', round((avg(share) filter (where kind = 'work'))::numeric, 4),
                    'workDays', count(distinct day) filter (where kind = 'work'))
                  from kinds)
  );
$$;

-- One station's history for its detail sheet: the last p_days Singapore days
-- from station_days, and listed-price changes for its plugs (identical
-- changes on several plugs grouped into one row, newest first).
create or replace function public.station_history(p_station_id text, p_days integer default 28)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'since', (select min(taken_at) from public.snapshots),
    -- [day, snapshots, with a live status, full]
    'days', coalesce((
      select jsonb_agg(jsonb_build_array(day, samples, reporting, full_count) order by day)
      from public.station_days
      where station_id = p_station_id
        and day > (now() at time zone 'Asia/Singapore')::date - p_days
    ), '[]'::jsonb),
    -- [day, 'AC' | 'DC', plug type, kW, old price, new price, plugs]
    'prices', coalesce((
      select jsonb_agg(jsonb_build_array(day, current_type, plug_type, kw, old_price, new_price, plugs)
                       order by day desc, current_type, kw desc)
      from (
        select pc.day, pl.current_type, pl.plug_type, pl.kw, pc.old_price, pc.new_price, count(*)::integer as plugs
        from public.price_changes as pc
        join public.plugs as pl on pl.ev_cp_id = pc.ev_cp_id
        where pl.station_id = p_station_id
        group by pc.day, pl.current_type, pl.plug_type, pl.kw, pc.old_price, pc.new_price
      ) as c
    ), '[]'::jsonb)
  );
$$;

revoke execute on function public.station_history(text, integer) from public, anon, authenticated;
grant execute on function public.station_history(text, integer) to service_role;

revoke execute on function public.history_trends(integer, jsonb) from public, anon, authenticated;
grant execute on function public.history_trends(integer, jsonb) to service_role;

revoke execute on function public.record_snapshot(jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.record_catalogue(date, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.record_snapshot(jsonb, jsonb, jsonb) to service_role;
grant execute on function public.record_catalogue(date, jsonb, jsonb) to service_role;
