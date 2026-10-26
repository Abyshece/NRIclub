// ============================================================================
// FORWARD-EMAIL: mail sent to hello@nriclub.app (received by Resend) is kept
// in the admin panel's Inbox, and only there. Admins read it and answer from
// the panel (Inbox; the Edge Function admin-inbox-reply sends the replies).
// Until 26 October 2026 a copy also went to the founder's own Gmail inbox;
// consumer Gmail has no data processing agreement (Art. 28 GDPR), so this
// function no longer sends mail anywhere. Its name stays, because Resend's
// webhook calls it by that address.
//
// Resend calls this function with an `email.received` webhook. The webhook
// carries only the email's id, so the function fetches the email and the
// list of its attachments from Resend's Receiving API (reading only), and
// stores the email in private.inbox_messages (public.inbox_store, with the
// service role; of the attachments only their names, types and sizes).
//
// Secrets (Supabase → Edge Functions → Secrets; names only, never in git):
//   RESEND_API_KEY         a Resend API key with full access (it must read
//                          received emails)
//   RESEND_WEBHOOK_SECRET  the signing secret of the webhook (whsec_…)
//   (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are there already.)
// FORWARD_TO and FORWARD_FROM aren't used any more: delete them.
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

// Keeps the email in the admin panel's Inbox (public.inbox_store). The same
// email id is stored once, also when Resend retries.
// deno-lint-ignore no-explicit-any
async function store(emailId: string, email: Record<string, any>, files: { data?: Array<Record<string, any>> }) {
  const url = env("SUPABASE_URL");
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY isn't set");
  const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : v ? [String(v)] : []);
  const headers = (email.headers ?? {}) as Record<string, unknown>;
  const res = await fetch(`${url}/rest/v1/rpc/inbox_store`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      p_email: {
        resend_email_id: emailId,
        message_id: String(email.message_id ?? headers["message-id"] ?? headers["Message-ID"] ?? ""),
        from: String(email.from ?? ""),
        reply_to: list(email.reply_to)[0] ?? "",
        to: list(email.to),
        subject: String(email.subject ?? ""),
        text: String(email.text ?? ""),
        html: String(email.html ?? ""),
        received_at: String(email.created_at ?? ""),
        attachments: (files.data ?? []).map((a) => ({
          filename: String(a.filename ?? "attachment"),
          content_type: String(a.content_type ?? ""),
          ...(typeof a.size === "number" ? { size: a.size } : {}),
        })),
      },
    }),
  });
  if (!res.ok) throw new Error(`inbox_store: ${res.status} ${(await res.text()).slice(0, 300)}`);
}

// Reads from Resend's Receiving API.
async function resend(path: string) {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${env("RESEND_API_KEY")}` } });
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
    await store(event.data.email_id, email, files);
  } catch (e) {
    // A non-2xx answer makes Resend retry later; the email also stays in
    // Resend's dashboard under Emails → Receiving.
    console.error("Not stored in the Inbox:", String(e));
    return new Response("Not stored", { status: 500 });
  }
  return new Response("Stored", { status: 200 });
});
