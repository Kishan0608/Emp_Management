-- =====================================================================
-- 039 LOCATION: one row per person per day, points in a JSON list
--
-- location_points kept one row per GPS fix (~600 rows per person per day,
-- ~230 bytes each with its 3 indexes). location_days keeps ONE row per
-- person per day; the day's fixes are a compact JSON list, oldest first:
--
--   points = [[epoch_ms, latitude, longitude, accuracy_m, speed_mps], ...]
--
-- Same behaviour: one fix a minute, kept app_settings.location_retention_days
-- (30). The four functions keep their exact inputs and outputs, so neither app
-- changes. Every existing point is copied and checked before the old table is
-- dropped. One row per person-day keeps each append small (a day is ~25 KB at
-- most), which suits the ~60-70 people tracked per day.
--
-- Numbers keep full precision: accuracy/speed (stored as real) go through
-- float8 -> numeric before JSON, because with extra_float_digits = 0 Postgres
-- writes real as 6 digits only. New points keep the phone's numbers exactly.
-- The old table is removed separately (20261007161000) after checking.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Table
-- ---------------------------------------------------------------------
create table if not exists public.location_days (
  user_id     uuid  not null references public.users(id) on update cascade on delete cascade,
  work_date   date  not null,
  points      jsonb not null default '[]'::jsonb,
  point_count int   not null default 0,
  last_point  jsonb,                                  -- newest entry of points, for the live board
  updated_at  timestamptz not null default now(),
  primary key (user_id, work_date),                   -- one row per person per day
  constraint location_days_points_array check (jsonb_typeof(points) = 'array'),
  constraint location_days_count_ok check (point_count >= 0)
);
alter table public.location_days enable row level security;   -- no policies: functions only
revoke all on public.location_days from anon, authenticated;

-- [epoch_ms, lat, lng, accuracy_m, speed_mps] -> the object shape the apps already read
create or replace function app.location_point_json(p jsonb)
 returns jsonb language sql immutable set search_path to '' as $function$
  select jsonb_build_object(
    'recorded_at', to_jsonb(to_timestamp(0) + (p ->> 0)::bigint * interval '1 millisecond'),
    'latitude',   p -> 1,
    'longitude',  p -> 2,
    'accuracy_m', p -> 3,
    'speed_mps',  p -> 4)
$function$;

-- ---------------------------------------------------------------------
-- 2. Copy every existing point, then check nothing was missed or changed
-- ---------------------------------------------------------------------
insert into public.location_days (user_id, work_date, points, point_count, last_point, updated_at)
select lp.user_id, lp.work_date,
       jsonb_agg(jsonb_build_array((extract(epoch from lp.recorded_at) * 1000)::bigint, lp.latitude::numeric, lp.longitude::numeric,
                                   lp.accuracy_m::float8::numeric, lp.speed_mps::float8::numeric)
                 order by lp.recorded_at),
       count(*),
       (array_agg(jsonb_build_array((extract(epoch from lp.recorded_at) * 1000)::bigint, lp.latitude::numeric, lp.longitude::numeric,
                                    lp.accuracy_m::float8::numeric, lp.speed_mps::float8::numeric)
                  order by lp.recorded_at desc))[1],
       max(lp.created_at)
from public.location_points lp
group by lp.user_id, lp.work_date
on conflict (user_id, work_date) do nothing;

do $$
declare v_src bigint; v_dst bigint; v_same bigint;
begin
  select count(*) into v_src from public.location_points;
  select coalesce(sum(point_count), 0) into v_dst from public.location_days;
  -- every original point must come back with the same time, position, accuracy and speed
  select count(*) into v_same
  from public.location_points lp
  join public.location_days ld on ld.user_id = lp.user_id and ld.work_date = lp.work_date
  cross join lateral jsonb_array_elements(ld.points) e
  where (app.location_point_json(e) ->> 'recorded_at')::timestamptz = lp.recorded_at
    and (e ->> 1)::double precision = lp.latitude
    and (e ->> 2)::double precision = lp.longitude
    and (e ->> 3)::real is not distinct from lp.accuracy_m
    and (e ->> 4)::real is not distinct from lp.speed_mps;
  if v_dst <> v_src or v_same <> v_src then
    raise exception 'Stopped: % points in the old table, % copied, % identical. Nothing was changed.', v_src, v_dst, v_same;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 3. Functions (same inputs and outputs as before)
-- ---------------------------------------------------------------------

-- Adds points to one person-day. p_new: entries sorted by time, no repeats.
create or replace function app.location_append(p_user uuid, p_date date, p_new jsonb)
 returns integer language plpgsql security definer set search_path to '' as $function$
declare r public.location_days; v_all jsonb; v_n int;
begin
  if p_new is null or jsonb_array_length(p_new) = 0 then return 0; end if;
  insert into public.location_days (user_id, work_date) values (p_user, p_date) on conflict do nothing;
  select * into r from public.location_days where user_id = p_user and work_date = p_date for update;

  if r.last_point is null or (p_new -> 0 ->> 0)::bigint > (r.last_point ->> 0)::bigint then
    -- usual case: everything is newer than what is stored, so just append
    v_n := r.point_count + jsonb_array_length(p_new);
    if v_n > 3000 then raise exception 'Too many location points for one day'; end if;
    update public.location_days
       set points = points || p_new, point_count = v_n, last_point = p_new -> -1, updated_at = now()
     where user_id = p_user and work_date = p_date;
    return jsonb_array_length(p_new);
  end if;

  -- late upload from an offline queue (or a repeat): merge, drop repeats by time, keep oldest-first
  select jsonb_agg(e order by (e ->> 0)::bigint), count(*)
    into v_all, v_n
  from (select distinct on ((e ->> 0)::bigint) e
          from (select e from jsonb_array_elements(r.points) e
                union all
                select e from jsonb_array_elements(p_new) e) m
         order by (e ->> 0)::bigint) d;
  if v_n > 3000 then raise exception 'Too many location points for one day'; end if;
  update public.location_days
     set points = v_all, point_count = v_n, last_point = v_all -> -1, updated_at = now()
   where user_id = p_user and work_date = p_date;
  return v_n - r.point_count;
end $function$;
revoke execute on function app.location_append(uuid, date, jsonb) from public, anon, authenticated;

create or replace function public.record_location_points(p_points jsonb)
 returns integer language plpgsql security definer set search_path to '' as $function$
declare v_inserted int := 0; v_day record;
begin
  if not app.is_active_user() then raise exception 'Not signed in' using errcode = '42501'; end if;
  if not exists (select 1 from public.users u where u.id = auth.uid() and u.location_sharing_enabled) then
    raise exception 'Location sharing is off' using errcode = '42501';
  end if;
  if jsonb_typeof(p_points) <> 'array' then raise exception 'Expected a list of location points'; end if;
  if jsonb_array_length(p_points) > 500 then raise exception 'Too many points in one batch (max 500)'; end if;

  for v_day in
    -- The phone's numbers are kept exactly as sent (JSON numbers), only checked here.
    with incoming as (
      select (p ->> 'recorded_at')::timestamptz as recorded_at,
             p -> 'latitude'   as latitude,
             p -> 'longitude'  as longitude,
             p -> 'accuracy_m' as accuracy_m,
             p -> 'speed_mps'  as speed_mps
      from jsonb_array_elements(p_points) p
      where jsonb_typeof(p -> 'latitude') = 'number' and jsonb_typeof(p -> 'longitude') = 'number'
    ),
    valid as (
      select app.local_date(recorded_at) as work_date,
             (extract(epoch from date_trunc('milliseconds', recorded_at)) * 1000)::bigint as ms,
             latitude, longitude,
             case when jsonb_typeof(accuracy_m) = 'number' and (accuracy_m #>> '{}')::float8 >= 0 then accuracy_m end as accuracy_m,
             case when jsonb_typeof(speed_mps) = 'number' and (speed_mps #>> '{}')::float8 >= 0 then speed_mps end as speed_mps
      from incoming
      where recorded_at between now() - interval '2 days' and now() + interval '5 minutes'
        and (latitude #>> '{}')::float8 between -90 and 90
        and (longitude #>> '{}')::float8 between -180 and 180
    ),
    one_per_ms as (select distinct on (work_date, ms) * from valid order by work_date, ms)
    select work_date, jsonb_agg(jsonb_build_array(ms, latitude, longitude, accuracy_m, speed_mps) order by ms) as pts
    from one_per_ms group by work_date order by work_date
  loop
    v_inserted := v_inserted + app.location_append(auth.uid(), v_day.work_date, v_day.pts);
  end loop;
  return v_inserted;
end $function$;

create or replace function public.location_live(p_log boolean default false)
 returns jsonb language plpgsql security definer set search_path to '' as $function$
begin
  if not app.is_active_user() then raise exception 'Not signed in' using errcode = '42501'; end if;
  if p_log then
    begin
      perform app.audit('location.view_live', 'users', null, jsonb_build_object('viewer_role', app.uid_role()));
    exception when others then
      null;
    end;
  end if;

  return coalesce((
    select jsonb_agg(x order by x.sharing_enabled desc, x.full_name) from (
      select u.id as user_id, u.full_name, u.role, u.job_title, u.organization_id,
        (select d.name from public.departments d where d.id = u.department_id) as department,
        (select o.name from public.organizations o where o.id = u.organization_id) as organization,
        (select app.location_point_json(ld.last_point) from public.location_days ld
          where ld.user_id = u.id and ld.last_point is not null
          order by ld.work_date desc limit 1) as last_point,
        coalesce((select ld.point_count from public.location_days ld
                   where ld.user_id = u.id and ld.work_date = app.local_date()), 0) as points_today,
        u.location_sharing_enabled as sharing_enabled,
        case when u.location_sharing_enabled then u.location_device_status end as device_status,
        case when u.location_sharing_enabled then u.location_status_at end as status_at
      from public.users u
      where u.is_active and u.account_status = 'active'
        and (u.location_sharing_enabled or exists (select 1 from public.location_days ld where ld.user_id = u.id and ld.point_count > 0))
        and app.can_track_location(u.id)
    ) x), '[]'::jsonb);
end $function$;

create or replace function public.location_day(p_target uuid, p_date date default null, p_log boolean default false)
 returns jsonb language plpgsql security definer set search_path to '' as $function$
declare
  v_date date := coalesce(p_date, app.local_date());
  v_person record;
begin
  if not app.is_active_user() then raise exception 'Not signed in' using errcode = '42501'; end if;
  if not app.can_track_location(p_target) then
    raise exception 'Not permitted to view location' using errcode = '42501';
  end if;

  select id, full_name, role, location_sharing_enabled as sharing_enabled
  into v_person from public.users where id = p_target;
  if not found then raise exception 'Person not found' using errcode = 'P0002'; end if;

  if p_log then
    begin
      perform app.audit('location.view_history', 'users', p_target,
        jsonb_build_object('date', v_date, 'viewer_role', app.uid_role()));
    exception when others then
      null;
    end;
  end if;

  return jsonb_build_object(
    'person', to_jsonb(v_person),
    'work_date', v_date,
    'points', coalesce((
      select jsonb_agg(app.location_point_json(t.e) order by t.ord)
      from public.location_days ld
      cross join lateral jsonb_array_elements(ld.points) with ordinality as t(e, ord)
      where ld.user_id = p_target and ld.work_date = v_date
    ), '[]'::jsonb));
end $function$;

create or replace function app.purge_location_points()
 returns void language sql security definer set search_path to '' as $function$
  delete from public.location_days d
  where d.work_date < app.local_date() - (select s.location_retention_days from public.app_settings s where s.id = 1)
$function$;

