// Signed-in onboarding person asks for a code:
//   purpose "email"    -> code to their own email (resend)
//   purpose "approver" -> code to the manager / HR / Boss they chose to report to
// Codes are created server-side and never returned to the requester (except in test mode).
import { createClient } from "npm:@supabase/supabase-js@2";

import { codeEmail, cors, json, maskEmail, sendMail, smtpConfigured } from "./mail.ts";

const roleLabel: Record<string, string> = { boss: "Boss", hr: "HR", manager: "Manager", employee: "Employee" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: auth } = await admin.auth.getUser(token);
  const userId = auth?.user?.id;
  if (!userId) return json(401, { error: "Please sign in again" });

  let body: { purpose?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid request" });
  }
  const purpose = body.purpose === "approver" ? "approver" : "email";

  const { data: settings } = await admin.from("app_settings").select("email_test_mode").eq("id", 1).single();
  const testMode = !!settings?.email_test_mode;
  if (!smtpConfigured() && !testMode) return json(503, { error: "Email is not set up yet. Please contact your administrator." });

  const { data: target, error: tErr } = await admin.rpc("onboarding_mail_target_internal", { p_user: userId, p_purpose: purpose });
  if (tErr || !target) return json(400, { error: tErr?.message ?? "Not available" });
  const t = target as { to: string; name: string; about: string; details?: Record<string, string> };

  const { data: code, error: cErr } = await admin.rpc("issue_code_internal", { p_user: userId, p_purpose: purpose, p_sent_to: t.to });
  if (cErr || !code) return json(429, { error: cErr?.message ?? "Could not create a code" });

  if (smtpConfigured()) {
    const mail = purpose === "email"
      ? codeEmail({
        heading: "Verify your email",
        intro: "Enter this code in the SKFL app to confirm this email address belongs to you.",
        code: code as string,
        footer: "If you did not try to create an SKFL account, you can ignore this email.",
      })
      : codeEmail({
        heading: `${t.about} is joining your team`,
        intro: `Hello ${t.name}, ${t.about} has signed up for the SKFL app and chose you as the person they report to. If this is correct, give them this code so they can finish activating their account.`,
        code: code as string,
        details: [
          ["Name", t.about],
          ["Email", t.details?.email ?? ""],
          ["Job title", t.details?.job_title ?? ""],
          ["Department", t.details?.department ?? ""],
          ["Role", roleLabel[t.details?.role ?? ""] ?? ""],
        ],
        footer: "If you don't know this person or the details are wrong, do not share the code. Their account will stay inactive.",
      });
    try {
      await sendMail(t.to, purpose === "email" ? `${code} is your SKFL verification code` : `Approval code for ${t.about} · SKFL`, mail);
    } catch (e) {
      if (!testMode) return json(502, { error: "We could not send the email. Please try again shortly." });
      console.error("mail failed", (e as Error).message);
    }
  }
  return json(200, { ok: true, sent_to: maskEmail(t.to) });
});
