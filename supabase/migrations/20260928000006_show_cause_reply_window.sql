-- =====================================================================
-- 006 NATURAL JUSTICE: the employee must get time to answer a show-cause notice.
-- Found by the role tests: HR could move past "show_cause" immediately.
-- Now the case can only move on after the employee replies, or after the reply window.
-- =====================================================================
alter table public.app_settings add column show_cause_reply_days int not null default 7;
grant update (show_cause_reply_days) on public.app_settings to authenticated;

create or replace function app.check_reply_window() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_days int; v_notice timestamptz;
begin
  if old.stage = 'show_cause' and new.stage = 'employee_reply'
     and not exists (select 1 from public.case_documents d where d.case_id = new.id and d.doc_type = 'reply') then
    select show_cause_reply_days into v_days from public.app_settings where id = 1;
    select max(created_at) into v_notice from public.case_documents where case_id = new.id and doc_type = 'show_cause';
    if v_notice > now() - make_interval(days => v_days) then
      raise exception 'The employee has % days to reply to the show-cause notice (until %)',
        v_days, to_char(v_notice + make_interval(days => v_days), 'DD Mon YYYY');
    end if;
  end if;
  return new;
end $$;

create trigger cases_reply_window before update of stage on public.disciplinary_cases
  for each row execute function app.check_reply_window();
