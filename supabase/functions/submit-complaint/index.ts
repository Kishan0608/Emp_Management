// Anonymous complaint intake.
//
// Why an Edge Function: the app never talks to the complaints table. This function
// checks who is signed in, then calls the database as the service role, so database
// and API logs record "service_role" and never the employee.
//
// Rules for this file:
//   - never console.log the user, the request body, headers or IP address
//   - never return anything that identifies the complaint row
import { createClient } from "npm:@supabase/supabase-js@2";

const CATEGORIES = [
  "behaviour",
  "work_quality",
  "attendance",
  "misuse_of_resources",
  "discrimination",
  "safety",
  "other",
];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: auth } = await admin.auth.getUser(token);
  const authorId = auth?.user?.id;
  if (!authorId) return json(401, { error: "Please sign in again" });

  let body: { target_id?: string; category?: string; description?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid request" });
  }

  const targetId = String(body.target_id ?? "");
  const category = String(body.category ?? "");
  const description = String(body.description ?? "");

  if (!UUID.test(targetId)) return json(400, { error: "Choose who the complaint is about" });
  if (!CATEGORIES.includes(category)) return json(400, { error: "Choose a category" });

  const { data, error } = await admin.rpc("submit_complaint_internal", {
    p_author: authorId,
    p_target: targetId,
    p_category: category,
    p_description: description,
  });

  if (error) return json(400, { error: error.message });
  return json(200, { ok: true, remaining: (data as { remaining?: number })?.remaining ?? null });
});
