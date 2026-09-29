// Branded SKFL email sender (Gmail SMTP over SSL, port 465).
// Secrets (Supabase → Edge Functions → Secrets): SMTP_USER (the Gmail address), SMTP_PASS (a Gmail App Password).
// Optional: SMTP_HOST (default smtp.gmail.com), SMTP_PORT (default 465).
// Copied into each function folder as mail.ts so every function deploys standalone.
import nodemailer from "npm:nodemailer@6.9.16";

export function smtpConfigured() {
  return !!(Deno.env.get("SMTP_USER") && Deno.env.get("SMTP_PASS"));
}

export function codeEmail(opts: { heading: string; intro: string; code: string; details?: [string, string][]; footer: string }) {
  const rows = (opts.details ?? [])
    .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#71717a">${k}</td><td style="padding:4px 0;color:#18181b;font-weight:600">${v}</td></tr>`)
    .join("");
  const html = `<!doctype html><html><body style="margin:0;background:#f6f5f1;font-family:Segoe UI,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:18px;overflow:hidden;border:1px solid #e9e6df">
      <tr><td style="background:linear-gradient(45deg,#34332f,#605b57,#2f2e2b);background-color:#3a3935;padding:26px;text-align:center">
        <div style="font-size:34px;font-weight:800;letter-spacing:2px;color:#e5e3ac">SKFL</div>
        <div style="font-size:11px;letter-spacing:3px;color:#d8ce89;margin-top:4px">SHREE KARNI FABCOM LTD</div>
      </td></tr>
      <tr><td style="padding:28px 28px 8px">
        <h1 style="margin:0 0 8px;font-size:20px;color:#18181b">${opts.heading}</h1>
        <p style="margin:0;color:#52525b;font-size:15px;line-height:22px">${opts.intro}</p>
      </td></tr>
      <tr><td align="center" style="padding:18px 28px">
        <div style="display:inline-block;padding:14px 26px;border-radius:14px;background:#f8f6e7;border:1px solid #e6e1b6;font-family:Consolas,Menlo,monospace;font-size:34px;font-weight:700;letter-spacing:10px;color:#1c1b19">${opts.code}</div>
        <div style="color:#a1a1aa;font-size:12px;margin-top:10px">Valid for 10 minutes · never share it with anyone you don't know</div>
      </td></tr>
      ${rows ? `<tr><td style="padding:4px 28px 8px"><table style="font-size:14px">${rows}</table></td></tr>` : ""}
      <tr><td style="padding:14px 28px 26px;color:#71717a;font-size:13px;line-height:19px">${opts.footer}</td></tr>
    </table>
    <div style="color:#a1a1aa;font-size:11px;margin-top:14px">Shree Karni Fabcom Ltd · automated message</div>
  </td></tr></table></body></html>`;
  const text = `${opts.heading}\n\n${opts.intro}\n\nCode: ${opts.code} (valid 10 minutes)\n\n${(opts.details ?? []).map(([k, v]) => `${k}: ${v}`).join("\n")}\n\n${opts.footer}\n— Shree Karni Fabcom Ltd`;
  return { html, text };
}

export async function sendMail(to: string, subject: string, body: { html: string; text: string }) {
  const user = Deno.env.get("SMTP_USER")!;
  const transport = nodemailer.createTransport({
    host: Deno.env.get("SMTP_HOST") ?? "smtp.gmail.com",
    port: Number(Deno.env.get("SMTP_PORT") ?? 465),
    secure: true,
    auth: { user, pass: Deno.env.get("SMTP_PASS")! },
  });
  await transport.sendMail({ from: `"SKFL · Shree Karni Fabcom Ltd" <${user}>`, to, subject, html: body.html, text: body.text });
}

export function maskEmail(e: string) {
  const [name, domain] = e.split("@");
  return `${name.slice(0, 2)}${"•".repeat(Math.max(1, name.length - 2))}@${domain}`;
}

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
