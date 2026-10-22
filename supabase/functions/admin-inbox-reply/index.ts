// admin-inbox-reply: our team's reply to an email in the admin panel's Inbox
// (mail to hello@nriclub.app), sent from hello@nriclub.app through Resend:
//   POST /functions/v1/admin-inbox-reply  { "message_id": "<uuid>", "body": "<plain text>" }
//   with the admin's own session (Authorization: Bearer <access token>).
// The database checks first, as the admin (public.admin_inbox_reply_prepare):
// admin rights as everywhere else, a reply of 1 to 10,000 characters, the
// admin's limits (10 a minute, 200 a day); it gives the address (the
// sender's Reply-To, else From), the "Re:" subject and the original
// Message-ID, so the reply joins the sender's thread (In-Reply-To,
// References). After Resend has sent it, the reply is recorded
// (public.inbox_record_reply, service role only) and shows under the message.
//
// Secrets: RESEND_API_KEY (already set for forward-email), INBOX_FROM
// (optional, default "NRIClub <hello@nriclub.app>"). The gateway checks the
// token (verify JWT on); the database checks it again. Deploy steps and
// tests: docs/DEPLOY-ROUND3.md.

const ALLOWED_ORIGIN = "https://admin.nriclub.app";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const env = (name: string): string => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`The secret ${name} isn't set.`);
  return value;
};

// Answers only the admin site (see member-email).
function cors(origin: string | null): Record<string, string> {
  return origin === ALLOWED_ORIGIN
    ? {
      "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
      "Access-Control-Max-Age": "600",
      Vary: "Origin",
    }
    : { Vary: "Origin" };
}

function reply(origin: string | null, status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

// A database function: as the admin (token) or with the service role.
async function rpc(name: string, body: Record<string, unknown>, token: string | null) {
  const service = env("SUPABASE_SERVICE_ROLE_KEY");
  const res = await fetch(`${env("SUPABASE_URL")}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: token ? env("SUPABASE_ANON_KEY") : service,
      Authorization: `Bearer ${token || service}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(data?.message || `The database said no (${res.status}).`);
    (err as Error & { status?: number }).status = res.status === 401 || data?.code === "42501" ? 403 : 409;
    throw err;
  }
  return data;
}

// The bare address in "Name <a@b.c>" or "a@b.c" (one, no line breaks), or "".
function address(value: string): string {
  const inner = /<([^<>\s]+@[^<>\s]+)>/.exec(value)?.[1] || value.trim();
  return /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/.test(inner) ? inner : "";
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

// A Message-ID as a header value ("<...>"), or "" if it isn't one.
function messageId(value: string): string {
  const v = String(value || "").trim();
  return /^<[^<>\s]+>$/.test(v) ? v : "";
}

Deno.serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get("Origin");
  if (origin !== ALLOWED_ORIGIN) return reply(origin, 403, { error: "Not allowed from this site." });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return reply(origin, 405, { error: "Use POST." });

  const token = /^Bearer\s+(\S+)$/i.exec(req.headers.get("Authorization") || "")?.[1];
  if (!token) return reply(origin, 401, { error: "Sign in first." });
  let id = "";
  let body = "";
  try {
    const json = await req.json();
    id = String(json?.message_id || "");
    body = String(json?.body || "").replace(/\r\n/g, "\n").trim();
  } catch {
    return reply(origin, 400, { error: "Send JSON." });
  }
  if (!UUID.test(id)) return reply(origin, 400, { error: "Unknown message." });

  let prep: { to: string; subject: string; message_id: string; admin: string };
  try {
    prep = await rpc("admin_inbox_reply_prepare", { p_id: id, p_body: body }, token);
  } catch (e) {
    return reply(origin, (e as Error & { status?: number }).status || 500, { error: (e as Error).message });
  }
  const to = address(prep.to);
  if (!to) return reply(origin, 409, { error: "This message has no address we can reply to." });
  const ref = messageId(prep.message_id);
  const subject = String(prep.subject || "Re: your message").replace(/[\r\n]+/g, " ").slice(0, 300);

  let sentId = "";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env("RESEND_API_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: Deno.env.get("INBOX_FROM") || "NRIClub <hello@nriclub.app>",
        to: [to],
        reply_to: "hello@nriclub.app",
        subject,
        text: body,
        ...(ref ? { headers: { "In-Reply-To": ref, References: ref } } : {}),
      }),
    });
    await keepQuota(res);
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`Resend ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
    sentId = String(data?.id || "");
  } catch (e) {
    console.error("admin-inbox-reply: not sent:", (e as Error).message);
    return reply(origin, 502, { error: "The reply couldn't be sent. Please try again." });
  }

  try {
    const saved = await rpc("inbox_record_reply",
      { p_message: id, p_admin: prep.admin, p_body: body, p_resend_id: sentId }, null);
    return reply(origin, 200, { sent: true, reply: saved });
  } catch (e) {
    // Sent, but not recorded: say so, so nobody sends it twice.
    console.error("admin-inbox-reply: sent, but not recorded:", id, (e as Error).message);
    return reply(origin, 200, { sent: true, reply: null });
  }
});
