// Live smoke test against the Supabase project using the demo accounts.
// Writes no data. Run: npm run test:smoke
import { createClient } from '@supabase/supabase-js';
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const client = () => createClient(url, key, { auth: { persistSession: false } });
const out = [];
const ok = (name, cond, extra='') => out.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -> ' + extra : ''}`);

// employee
const emp = client();
let r = await emp.auth.signInWithPassword({ email: 'neha@example.com', password: 'Demo@2026' });
ok('employee signs in', !r.error, r.error?.message);
let ctx = await emp.rpc('my_context');
ok('my_context returns role', ctx.data?.user?.role === 'employee', ctx.error?.message ?? ctx.data?.user?.role);
let dash = await emp.rpc('dashboard_stats', { p_org: null });
ok('dashboard works', !!dash.data?.my_tasks, dash.error?.message);
let t = await emp.from('tasks').select('id,title,assignee:users!tasks_assignee_id_fkey(full_name)').limit(5);
ok('tasks with joined assignee', !t.error && t.data.length > 0, t.error?.message ?? `${t.data.length} rows`);
let codes = await emp.from('auth_codes').select('*');
ok('sign-up codes table blocked for employee', !!codes.error || codes.data.length === 0, codes.error?.message ?? `${codes.data.length} rows`);
let inv = await emp.functions.invoke('invite-user', { body: { email: 'x@example.com', full_name: 'X Y' } });
let body = inv.error ? await inv.error.context.json() : inv.data;
ok('employee cannot invite', body.error === 'Only the Boss can add people', JSON.stringify(body));
let store = await emp.storage.from('task-files').list('');
ok('storage bucket reachable (RLS)', !store.error, store.error?.message);

// anonymous caller
const anon = client();
let a = await anon.from('users').select('id');
ok('logged-out caller sees no users', (a.data ?? []).length === 0 || !!a.error, a.error?.message ?? `${a.data.length} rows`);
let fa = await anon.functions.invoke('invite-user', { body: {} });
ok('logged-out caller rejected by edge fn', !!fa.error, fa.error?.context?.status);

// boss: one-time activation, no per-login code
const boss = client();
await boss.auth.signInWithPassword({ email: 'boss@example.com', password: 'Demo@2026' });
ctx = await boss.rpc('my_context');
ok('boss is active, no per-login code required', ctx.data?.user?.account_status === 'active' && ctx.data?.mfa_required === false);
let fr = await boss.from('feedback_items').select('id, replies').limit(5);
ok('feedback replies stored on the item', !fr.error && (fr.data ?? []).every((f) => Array.isArray(f.replies)), fr.error?.message);
let people = await boss.rpc('admin_people');
ok('boss opens admin panel list', !people.error, people.error?.message);
let np = await emp.rpc('admin_people');
ok('employee blocked from admin panel', !!np.error, np.error?.message);

// wrong password
const bad = client();
r = await bad.auth.signInWithPassword({ email: 'neha@example.com', password: 'wrong-password' });
ok('wrong password rejected', !!r.error, r.error?.message);

console.log(out.join('\n'));
