-- =====================================================================
-- Stream feedback/support conversations live, so the thread updates the
-- moment a reply or status change lands instead of needing pull-to-refresh.
-- RLS (feedback_read / feedback_replies_read) still applies to the stream.
-- =====================================================================

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'feedback_items') then
    alter publication supabase_realtime add table public.feedback_items;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'feedback_replies') then
    alter publication supabase_realtime add table public.feedback_replies;
  end if;
end $$;
