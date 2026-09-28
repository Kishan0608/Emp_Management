-- 007: the blanket grant in 004 also reached Supabase's own event-trigger helper.
-- It cannot be called as an RPC, but it should not be granted to app users either.
revoke execute on function public.rls_auto_enable() from authenticated, anon, public;
