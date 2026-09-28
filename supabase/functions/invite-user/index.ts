// Boss-only: create an invited account with a one-time password.
// Sign-up is invite-only; the database trigger rejects any account without "invited": true.
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

function tempPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const core = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
  return `${core}#9`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const url = Deno.env.get("SUPABASE_URL")!;
  const authHeader = req.headers.get("Authorization") ?? "";

  // Check the caller with THEIR token, so the database's own role and 2FA rules apply.
  const asCaller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: ctx, error: ctxError } = await asCaller.rpc("my_context");
  if (ctxError || !ctx) return json(401, { error: "Please sign in again" });
  const caller = (ctx as { user: { id: string; role: string }; mfa_required: boolean; aal: string });
  if (caller.user.role !== "boss") return json(403, { error: "Only the Boss can invite people" });
  if (caller.mfa_required && caller.aal !== "aal2") return json(403, { error: "Two-factor verification required" });

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

  const password = tempPassword();
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { invited: true },
    user_metadata: { full_name: fullName },
  });
  if (createError || !created.user) {
    return json(400, { error: createError?.message ?? "Could not create the account" });
  }

  const { error: updateError } = await admin.from("users").update({
    role,
    department_id: departmentId,
    manager_id: managerId,
    job_title: jobTitle,
    must_change_password: true,
  }).eq("id", created.user.id);
  if (updateError) return json(400, { error: updateError.message });

  await admin.from("audit_logs").insert({
    actor_id: caller.user.id,
    action: "user.invite",
    entity: "users",
    entity_id: created.user.id,
    meta: { role, email },
  });
  await admin.from("notifications").insert({
    user_id: created.user.id,
    kind: "welcome",
    title: "Welcome aboard",
    body: "Please change your one-time password and read the privacy notice.",
  });

  return json(200, { ok: true, user_id: created.user.id, temp_password: password });
});
