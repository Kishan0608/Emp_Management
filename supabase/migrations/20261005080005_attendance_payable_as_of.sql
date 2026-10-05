-- =====================================================================
-- 029 ATTENDANCE: payable "as of" date
-- compute_payable now reports the last date its deduction actually covers,
-- so the client can label a still-in-progress month's Payable figure
-- (e.g. "Payable (till 5 Oct)") instead of implying it's the final amount.
-- =====================================================================

create or replace function app.compute_payable(p_user uuid, p_month date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_salary numeric; v_joined date; v_days_in_month int; v_per_day numeric;
  v_absent int; v_half int; v_month_start date; v_month_end date; v_bound date;
begin
  select salary_monthly, joined_on into v_salary, v_joined from public.users where id = p_user;
  v_month_start := date_trunc('month', p_month)::date;
  v_month_end   := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
  v_days_in_month := extract(day from v_month_end);
  v_per_day := coalesce(v_salary, 0) / v_days_in_month;
  -- never count future days, and never count days before the employee joined
  v_bound := least(v_month_end, app.local_date());

  select count(*) filter (where status = 'absent'), count(*) filter (where status = 'half_day')
    into v_absent, v_half
  from public.attendance_records
  where user_id = p_user and work_date between greatest(v_month_start, coalesce(v_joined, v_month_start)) and v_bound
    and app.is_working_day(work_date);

  return jsonb_build_object(
    'base_salary', v_salary, 'per_day_rate', round(v_per_day, 2), 'days_in_month', v_days_in_month,
    'absent_days', coalesce(v_absent, 0), 'half_days', coalesce(v_half, 0),
    'deduction', round(v_per_day * (coalesce(v_absent, 0) + 0.5 * coalesce(v_half, 0)), 2),
    'payable_salary', round(coalesce(v_salary, 0) - v_per_day * (coalesce(v_absent, 0) + 0.5 * coalesce(v_half, 0)), 2),
    'as_of', v_bound
  );
end $$;
