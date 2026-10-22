// ============================================================================
// FORWARD-EMAIL: mail sent to hello@nriclub.app (received by Resend) is
// forwarded to the founder's own inbox.
//
// Resend calls this function with an `email.received` webhook. The webhook
// carries only the email's id, so the function fetches the email and its
// attachments from Resend's Receiving API and sends a copy to FORWARD_TO.
// Reply-To is the original sender, so pressing Reply in the inbox answers
// them (send the reply "as" hello@nriclub.app, see docs/EMAIL-SETUP.md).
//
// Secrets (Supabase → Edge Functions → Secrets; names only, never in git):
//   RESEND_API_KEY         a Resend API key with full access
//   RESEND_WEBHOOK_SECRET  the signing secret of the webhook (whsec_…)
//   FORWARD_TO             the address the copies go to
//   FORWARD_FROM           optional, default "NRIClub inbox <hello@nriclub.app>"
// Deploy without JWT checks (Resend can't send a Supabase token); the
// webhook signature is checked instead:
//   supabase functions deploy forward-email --no-verify-jwt
// ============================================================================

const API = "https://api.resend.com";
const env = (name: string) => Deno.env.get(name) ?? "";

// Resend signs webhooks the Svix way: HMAC-SHA256 over "<id>.<timestamp>.<body>"
// with the base64 secret after "whsec_"; the header holds "v1,<base64>" items.
async function verified(req: Request, body: string): Promise<boolean> {
  const id = req.headers.get("svix-id");
  const timestamp = req.headers.get("svix-timestamp");
  const signatures = req.headers.get("svix-signature");
  const secret = env("RESEND_WEBHOOK_SECRET");
  if (!id || !timestamp || !signatures || !secret.startsWith("whsec_")) return false;
  // Refuse old or future-dated deliveries (replays): five minutes either way.
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const key = await crypto.subtle.importKey(
    "raw", Uint8Array.from(atob(secret.slice(6)), (c) => c.charCodeAt(0)),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${timestamp}.${body}`)));
  const expected = btoa(String.fromCharCode(...mac));
  return signatures.split(" ").some((s) => {
    const [version, sig] = s.split(",");
    if (version !== "v1" || !sig || sig.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
    return diff === 0;
  });
}

async function resend(path: string, init: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${env("RESEND_API_KEY")}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`Resend ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const body = await req.text();
  if (!(await verified(req, body))) return new Response("Bad signature", { status: 401 });

  let event: { type?: string; data?: { email_id?: string } };
  try { event = JSON.parse(body); } catch { return new Response("Bad JSON", { status: 400 }); }
  // Other event types (sent, delivered…) aren't for this function.
  if (event.type !== "email.received" || !event.data?.email_id) return new Response("Ignored", { status: 200 });
  const emailId = encodeURIComponent(event.data.email_id);

  try {
    const email = await resend(`/emails/receiving/${emailId}`);
    const files = await resend(`/emails/receiving/${emailId}/attachments`).catch(() => ({ data: [] }));
    // Resend fetches each file from its signed link (valid for an hour).
    const attachments = (files.data ?? []).filter((a: { download_url?: string }) => a.download_url).map((a: {
      filename?: string; download_url: string; content_type?: string; content_id?: string;
    }) => ({
      filename: a.filename || "attachment",
      path: a.download_url,
      ...(a.content_type ? { content_type: a.content_type } : {}),
      ...(a.content_id ? { content_id: a.content_id.replace(/^<|>$/g, "") } : {}),
    }));
    const sender = (email.reply_to?.[0] || email.from || "").toString();
    const note = `Forwarded from hello@nriclub.app. From: ${email.from} · To: ${(email.to ?? []).join(", ")} · ${email.created_at ?? ""}`;
    await resend("/emails", {
      method: "POST",
      // The same email id never goes out twice, also when Resend retries.
      headers: { "Idempotency-Key": `forward-${event.data.email_id}` },
      body: JSON.stringify({
        from: env("FORWARD_FROM") || "NRIClub inbox <hello@nriclub.app>",
        to: [env("FORWARD_TO")],
        ...(sender ? { reply_to: sender } : {}),
        subject: `[hello@] ${email.subject || "(no subject)"}`,
        text: `${note}\n\n${email.text ?? ""}`,
        ...(email.html ? { html: `<p style="font:13px sans-serif;color:#666">${note.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!))}</p><hr>${email.html}` } : {}),
        ...(attachments.length ? { attachments } : {}),
      }),
    });
    return new Response("Forwarded", { status: 200 });
  } catch (e) {
    // A non-2xx answer makes Resend retry later; the email also stays in
    // Resend's dashboard under Emails → Receiving.
    console.error(String(e));
    return new Response("Forwarding failed", { status: 500 });
  }
});
