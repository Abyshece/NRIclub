// ============================================================================
// FORWARD-EMAIL: mail sent to hello@nriclub.app (received by Resend) is
// kept in the admin panel's Inbox and, if FORWARD_TO is set, forwarded to
// the founder's own inbox.
//
// Resend calls this function with an `email.received` webhook. The webhook
// carries only the email's id, so the function fetches the email and its
// attachments from Resend's Receiving API. It stores the email in
// private.inbox_messages (public.inbox_store, with the service role; of the
// attachments only their names, types and sizes) and sends a copy to
// FORWARD_TO. Each step works without the other: a failed store doesn't stop
// the copy, and the other way round. Reply-To of the copy is the original
// sender, so pressing Reply in the inbox answers them (send the reply "as"
// hello@nriclub.app, see docs/EMAIL-SETUP.md); the admin panel replies too.
//
// Secrets (Supabase → Edge Functions → Secrets; names only, never in git):
//   RESEND_API_KEY         a Resend API key with full access
//   RESEND_WEBHOOK_SECRET  the signing secret of the webhook (whsec_…)
//   FORWARD_TO             optional: the address the copies go to (none: no copies)
//   FORWARD_FROM           optional, default "NRIClub inbox <hello@nriclub.app>"
//   (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are there already.)
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
// email id is stored once, also when Resend retries. Before the 2026-10-25
// database update there is no inbox_store; the copy still goes.
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

// Resend's own counters in its answer (x-resend-monthly-quota: emails this
// month; x-resend-daily-quota: today, on the free plan), kept for the admin
// panel's "Emails this month" (public.resend_quota_store, service role).
// Never throws: a missing counter or a failed store changes nothing else.
async function keepQuota(res: Response): Promise<Record<string, unknown> | null> {
  const count = (name: string) => {
    const v = (res.headers.get(name) || "").trim();
    return /^\d+$/.test(v) ? Number(v) : null;
  };
  const monthly = count("x-resend-monthly-quota");
  const daily = count("x-resend-daily-quota");
  if (monthly === null && daily === null) return null;
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return null;
    const stored = await fetch(`${url}/rest/v1/rpc/resend_quota_store`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_monthly_used: monthly, p_daily_used: daily }),
    });
    return stored.ok ? await stored.json() : null;
  } catch {
    return null;
  }
}

async function resend(path: string, init: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${env("RESEND_API_KEY")}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (init.method === "POST") await keepQuota(res);
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

  // deno-lint-ignore no-explicit-any
  let email: Record<string, any>;
  // deno-lint-ignore no-explicit-any
  let files: { data?: any[] };
  try {
    email = await resend(`/emails/receiving/${emailId}`);
    files = await resend(`/emails/receiving/${emailId}/attachments`).catch(() => ({ data: [] }));
  } catch (e) {
    // A non-2xx answer makes Resend retry later; the email also stays in
    // Resend's dashboard under Emails → Receiving.
    console.error(String(e));
    return new Response("Couldn't fetch the email", { status: 500 });
  }

  let stored = true;
  try {
    await store(event.data.email_id, email, files);
  } catch (e) {
    stored = false;
    console.error("Not stored in the Inbox:", String(e));
  }
  // No forwarding address: the Inbox is the only copy (if storing failed
  // too, Resend retries).
  if (!env("FORWARD_TO")) return new Response(stored ? "Stored" : "Storing failed", { status: stored ? 200 : 500 });

  try {
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
    return new Response(stored ? "Stored and forwarded" : "Forwarded", { status: 200 });
  } catch (e) {
    // Not stored either: a non-2xx answer makes Resend retry later (the
    // email also stays in Resend's dashboard under Emails → Receiving).
    // Stored: the Inbox has it, so it isn't sent again.
    console.error(String(e));
    return new Response(stored ? "Stored; forwarding failed" : "Forwarding failed", { status: stored ? 200 : 500 });
  }
});
