// Boss-only (app or admin panel): add a person and issue their one-time activation key.
// The account starts as 'invited' with a random password nobody knows; the person
// sets their own password when they activate with the key.
import { createClient } from "npm:@supabase/supabase-js@2";

const ROLES = ["boss", "hr", "manager", "employee"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function unguessablePassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("") + "Aa#1";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const url = Deno.env.get("SUPABASE_URL")!;
  const authHeader = req.headers.get("Authorization") ?? "";

  // Check the caller with THEIR token so the database's own role rules apply.
  const asCaller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: ctx, error: ctxError } = await asCaller.rpc("my_context");
  if (ctxError || !ctx) return json(401, { error: "Please sign in again" });
  const caller = ctx as { user: { id: string; role: string; account_status: string; is_active: boolean } };
  if (caller.user.role !== "boss" || caller.user.account_status !== "active" || !caller.user.is_active) {
    return json(403, { error: "Only the Boss can add people" });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid request" });
  }
  const email = String(body.email ?? "").trim().toLowerCase();
  const fullName = String(body.full_name ?? "").trim();
  const role = String(body.role ?? "employee");
  const departmentId = body.department_id ? String(body.department_id) : null;
  const managerId = body.manager_id ? String(body.manager_id) : null;
  const jobTitle = String(body.job_title ?? "").trim() || null;

  if (!EMAIL.test(email)) return json(400, { error: "Enter a valid email" });
  if (fullName.length < 2) return json(400, { error: "Enter the person's full name" });
  if (!ROLES.includes(role)) return json(400, { error: "Invalid role" });
  if (departmentId && !UUID.test(departmentId)) return json(400, { error: "Invalid department" });
  if (managerId && !UUID.test(managerId)) return json(400, { error: "Invalid manager" });

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: unguessablePassword(),
    email_confirm: true,
    app_metadata: { invited: true },
    user_metadata: { full_name: fullName },
  });
  if (createError || !created.user) {
    const msg = createError?.message ?? "Could not create the account";
    return json(400, { error: msg.includes("already") ? "Someone with this email already exists" : msg });
  }

  const { error: updateError } = await admin
    .from("users")
    .update({ role, department_id: departmentId, manager_id: managerId, job_title: jobTitle })
    .eq("id", created.user.id);
  if (updateError) return json(400, { error: updateError.message });

  const { data: key, error: keyError } = await admin.rpc("issue_activation_key_internal", { p_user: created.user.id, p_by: caller.user.id });
  if (keyError || !key) return json(400, { error: keyError?.message ?? "Could not issue the activation key" });

  await admin.from("audit_logs").insert({
    actor_id: caller.user.id,
    action: "user.invite",
    entity: "users",
    entity_id: created.user.id,
    meta: { role, email },
  });

  return json(200, { ok: true, user_id: created.user.id, activation_key: key });
});
