// Self sign-up, step 1: email + password -> account created (no access) + 6-digit email code.
import { createClient } from "npm:@supabase/supabase-js@2";

import { codeEmail, json, cors, maskEmail, sendMail, smtpConfigured } from "./mail.ts";

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

  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid request" });
  }
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(400, { error: "Enter a valid email address" });
  const problem = passwordProblem(password);
  if (problem) return json(400, { error: problem });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: settings } = await admin.from("app_settings").select("email_test_mode").eq("id", 1).single();
  const testMode = !!settings?.email_test_mode;
  if (!smtpConfigured() && !testMode) return json(503, { error: "Email is not set up yet. Please contact your administrator." });

  // Existing account? Only an unfinished email step may be restarted.
  const { data: existing } = await admin.from("users").select("id, account_status").ilike("email", email).maybeSingle();
  let userId: string;
  if (existing) {
    if (existing.account_status !== "email_pending") return json(409, { error: "An account with this email already exists. Please sign in." });
    userId = existing.id;
    const { error } = await admin.auth.admin.updateUserById(userId, { password });
    if (error) return json(400, { error: error.message });
  } else {
    const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !created.user) return json(400, { error: error?.message ?? "Could not create the account" });
    userId = created.user.id;
    await admin.rpc("mark_email_pending_internal", { p_user: userId });
  }

  const { data: code, error: codeError } = await admin.rpc("issue_code_internal", { p_user: userId, p_purpose: "email", p_sent_to: email });
  if (codeError || !code) return json(429, { error: codeError?.message ?? "Could not create a code" });

  if (smtpConfigured()) {
    try {
      await sendMail(email, `${code} is your SKFL verification code`, codeEmail({
        heading: "Verify your email",
        intro: "Welcome to Shree Karni Fabcom Ltd. Enter this code in the SKFL app to confirm this email address belongs to you.",
        code: code as string,
        footer: "If you did not try to create an SKFL account, you can ignore this email.",
      }));
    } catch (e) {
      if (!testMode) return json(502, { error: "We could not send the email. Please try again shortly." });
      console.error("mail failed", (e as Error).message);
    }
  }
  return json(200, { ok: true, sent_to: maskEmail(email) });
});
