// One-time account activation: email + activation key + new password.
// Called before the person has a session, so JWT verification is off and the
// key itself is the credential (hashed in the DB, 7-day expiry, 5-attempt lock).
import { createClient } from "npm:@supabase/supabase-js@2";

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

function passwordProblem(p: string): string | null {
  if (p.length < 10) return "Password must be at least 10 characters";
  if (!/[A-Z]/.test(p) || !/[a-z]/.test(p)) return "Password needs an uppercase and a lowercase letter";
  if (!/\d/.test(p)) return "Password needs a number";
  if (!/[^A-Za-z0-9]/.test(p)) return "Password needs a symbol";
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  let body: { email?: string; key?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid request" });
  }
  const email = String(body.email ?? "").trim().toLowerCase();
  const key = String(body.key ?? "").trim().toUpperCase();
  const password = String(body.password ?? "");

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(400, { error: "Enter your work email" });
  if (!/^SKFL-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(key.replace(/\s/g, ""))) return json(400, { error: "Activation key looks like SKFL-XXXX-XXXX" });
  const problem = passwordProblem(password);
  if (problem) return json(400, { error: problem });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userId, error: checkError } = await admin.rpc("activation_check", { p_email: email, p_key: key });
  if (checkError || !userId) return json(400, { error: checkError?.message ?? "Email or activation key is not correct" });

  const { error: pwError } = await admin.auth.admin.updateUserById(userId as string, { password, email_confirm: true, ban_duration: "none" });
  if (pwError) return json(400, { error: pwError.message });

  const { data: status, error: doneError } = await admin.rpc("activation_complete", { p_user: userId });
  if (doneError) return json(400, { error: doneError.message });

  return json(200, { ok: true, status });
});
