-- =====================================================================
-- 040 Remove the old one-row-per-point table.
-- Every point was copied to location_days and checked in 039 (time, position,
-- accuracy and speed identical). Stops if the counts no longer match.
-- =====================================================================
do $$
declare v_src bigint; v_dst bigint;
begin
  select count(*) into v_src from public.location_points;
  select coalesce(sum(point_count), 0) into v_dst from public.location_days;
  if v_dst < v_src then
    raise exception 'Stopped: location_days has % points, location_points has %. Nothing was removed.', v_dst, v_src;
  end if;
end $$;

drop table public.location_points;
