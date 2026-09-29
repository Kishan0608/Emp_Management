// Forgot password: { action: "start", email } -> code emailed (active accounts only)
//                  { action: "complete", email, code, password } -> password changed
// "start" always answers the same way, so it cannot be used to discover which emails exist.
import { createClient } from "npm:@supabase/supabase-js@2";

import { codeEmail, cors, json, maskEmail, sendMail, smtpConfigured } from "./mail.ts";

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

  let body: { action?: string; email?: string; code?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid request" });
  }
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(400, { error: "Enter a valid email address" });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: settings } = await admin.from("app_settings").select("email_test_mode").eq("id", 1).single();
  const testMode = !!settings?.email_test_mode;
  const { data: userId } = await admin.rpc("reset_target_internal", { p_email: email });

  if (body.action === "start") {
    if (!smtpConfigured() && !testMode) return json(503, { error: "Email is not set up yet. Please contact your administrator." });
    let testCode: string | undefined;
    if (userId) {
      const { data: code, error } = await admin.rpc("issue_code_internal", { p_user: userId, p_purpose: "reset", p_sent_to: email });
      if (error) return json(429, { error: error.message });
      testCode = code as string;
      if (smtpConfigured()) {
        try {
          await sendMail(email, `${code} is your SKFL password reset code`, codeEmail({
            heading: "Reset your password",
            intro: "Enter this code in the SKFL app to choose a new password.",
            code: code as string,
            footer: "If you did not ask to reset your password, ignore this email. Your password stays the same.",
          }));
        } catch {
          if (!testMode) return json(502, { error: "We could not send the email. Please try again shortly." });
        }
      }
    }
    return json(200, { ok: true, sent_to: maskEmail(email) });
  }

  if (body.action === "complete") {
    const problem = passwordProblem(String(body.password ?? ""));
    if (problem) return json(400, { error: problem });
    if (!userId) return json(400, { error: "That code is not correct" });
    const { error: cErr } = await admin.rpc("check_code_internal", { p_user: userId, p_purpose: "reset", p_code: String(body.code ?? "") });
    if (cErr) return json(400, { error: cErr.message });
    const { error } = await admin.auth.admin.updateUserById(userId as string, { password: String(body.password) });
    if (error) return json(400, { error: error.message });
    await admin.from("audit_logs").insert({ actor_id: userId, action: "auth.password_reset", entity: "users", entity_id: userId });
    return json(200, { ok: true });
  }

  return json(400, { error: "Unknown action" });
});
