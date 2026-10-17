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
alter table public.stations      enable row level security;
alter table public.plugs         enable row level security;
alter table public.price_changes enable row level security;

revoke all on public.snapshots, public.station_days, public.stations, public.plugs, public.price_changes
  from anon, authenticated;

-- Record one snapshot and count it towards each station's day. Returns false,
-- changing nothing, if this LTA update was already recorded.
create or replace function public.record_snapshot(snapshot jsonb, station_samples jsonb)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  taken timestamptz := (snapshot ->> 'taken_at')::timestamptz;
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

revoke execute on function public.record_snapshot(jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.record_catalogue(date, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.record_snapshot(jsonb, jsonb) to service_role;
grant execute on function public.record_catalogue(date, jsonb, jsonb) to service_role;
