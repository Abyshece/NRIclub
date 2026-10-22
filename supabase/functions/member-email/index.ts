// member-email: the short email a member gets when our team approves them,
// asks them for more information, declines them or blocks them (the in-app
// notice stays as it is). The admin panel (admin.nriclub.app) calls it a few
// seconds after the decision, once the decision's Undo has gone:
//   POST /functions/v1/member-email  { "member_id": "<uuid>", "kind": "approved" | "needs_info" | "rejected" | "blocked" }
//   with the admin's own session (Authorization: Bearer <access token>).
// The database decides what may be sent (public.admin_member_email, called as
// the admin): admin rights as everywhere else, the decision still the
// member's current one and less than an hour old, one email per decision,
// and the admin's limits (30 a minute, 300 a day). The email says only what
// the member already sees in the app. The address is read here with the
// service role, from Supabase Auth.
//
// Secrets (Edge Functions > Secrets): RESEND_API_KEY, MAIL_FROM (e.g.
// "NRIClub <hello@send.nriclub.app>"). SUPABASE_URL, SUPABASE_ANON_KEY and
// SUPABASE_SERVICE_ROLE_KEY are there already. The gateway checks the token
// (verify JWT on); the database checks it again, as the admin's own request.
// Deploy steps and tests: docs/DEPLOY-ROUND3.md.

const ALLOWED_ORIGIN = "https://admin.nriclub.app";
const REPLY_TO = "hello@nriclub.app";
const SITE = "https://nriclub.app";
const KINDS = ["approved", "needs_info", "rejected", "blocked"] as const;
type Kind = (typeof KINDS)[number];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const env = (name: string): string => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`The secret ${name} isn't set.`);
  return value;
};

// Answers only the admin site: other origins get no CORS headers, so a
// browser on another site can't read the answer (or send with credentials).
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

// What the database says the email may say (public.admin_member_email).
type Decision = {
  kind: Kind;
  first_name: string;
  message: string;
  rule: string;
  reason: string;
  decided_at: string;
};

// The database's answer to the admin's request, as the admin. Throws with
// the database's message (e.g. "Admins only", "already gone out").
async function decision(token: string, memberId: string, kind: Kind): Promise<Decision> {
  const res = await fetch(`${env("SUPABASE_URL")}/rest/v1/rpc/admin_member_email`, {
    method: "POST",
    headers: { apikey: env("SUPABASE_ANON_KEY"), Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_member: memberId, p_kind: kind }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(data?.message || `The database said no (${res.status}).`);
    (err as Error & { status?: number }).status = res.status === 401 || data?.code === "42501" ? 403 : 409;
    throw err;
  }
  return data as Decision;
}

// The member's sign-in address, from Supabase Auth (service role).
async function memberAddress(memberId: string): Promise<string> {
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  const res = await fetch(`${env("SUPABASE_URL")}/auth/v1/admin/users/${memberId}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`Couldn't read the member's address (${res.status}).`);
  const user = await res.json();
  const email = String(user?.email || "").trim();
  if (!email || /[\r\n]/.test(email)) throw new Error("The member has no email address.");
  return email;
}

// The email, in plain text: short, no marketing.
function compose(d: Decision): { subject: string; text: string } {
  const hi = d.first_name ? `Hi ${d.first_name},` : "Hello,";
  const quote = (s: string) => s.trim().split(/\r?\n/).map((line) => `  ${line}`).join("\n");
  const foot = "You're getting this email because of a decision about your NRIClub account.";
  switch (d.kind) {
    case "approved":
      return {
        subject: "You're verified on NRIClub",
        text: `${hi}\n\nOur team has checked your details and you're now a verified member of NRIClub. Welcome!\n\n`
          + `Sign in to meet Indians in your city: ${SITE}\n\nNRIClub\n\n${foot}\n`,
      };
    case "needs_info":
      return {
        subject: "NRIClub: we need a little more information",
        text: `${hi}\n\nThanks for joining NRIClub. Before we can verify you, we need a little more information:\n\n`
          + `${quote(d.message)}\n\nSign in to update your details: ${SITE}\n\n`
          + `Questions? Reply to this email.\n\nNRIClub\n\n${foot}\n`,
      };
    case "rejected":
      return {
        subject: "Your NRIClub membership request",
        text: `${hi}\n\nThanks for your interest in NRIClub. Our team looked at your request and couldn't approve it:\n\n`
          + `${quote(d.message)}\n\nThink we got it wrong? Reply to this email and a person on our team will look at it again.\n\n`
          + `NRIClub · ${SITE}\n\n${foot}\n`,
      };
    case "blocked": {
      const why = `${d.rule.trim() || "our Terms of Use"}${d.reason.trim() ? `, because ${d.reason.trim().replace(/[.\s]+$/, "")}.` : "."}`;
      return {
        subject: "Your NRIClub account is blocked",
        text: `${hi}\n\nOur team has blocked your NRIClub account. A person on our team decided this; no automated tools were used.\n\n`
          + `Reason: ${why}\n\nThink we got it wrong? Reply to this email within 6 months, and a person on our team will look at it again. `
          + `You can also go to court.\n\nYou can still sign in at ${SITE} to download your data or delete your account.\n\n`
          + `NRIClub\n\n${foot}\n`,
      };
    }
  }
}

// Sends it through Resend. The idempotency key makes a repeated request for
// the same decision send nothing more (the database already allows one).
async function send(to: string, memberId: string, d: Decision): Promise<void> {
  const { subject, text } = compose(d);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env("RESEND_API_KEY")}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `member-email/${memberId}/${d.kind}/${d.decided_at}`.slice(0, 256),
    },
    body: JSON.stringify({ from: env("MAIL_FROM"), to: [to], reply_to: REPLY_TO, subject, text }),
  });
  if (!res.ok) throw new Error(`Resend refused the email (${res.status}): ${(await res.text()).slice(0, 300)}`);
}

Deno.serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get("Origin");
  if (origin !== ALLOWED_ORIGIN) return reply(origin, 403, { error: "Not allowed from this site." });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return reply(origin, 405, { error: "Use POST." });

  const token = /^Bearer\s+(\S+)$/i.exec(req.headers.get("Authorization") || "")?.[1];
  if (!token) return reply(origin, 401, { error: "Sign in first." });
  let body: { member_id?: unknown; kind?: unknown };
  try {
    body = await req.json();
  } catch {
    return reply(origin, 400, { error: "Send JSON." });
  }
  const memberId = String(body?.member_id || "");
  const kind = String(body?.kind || "") as Kind;
  if (!UUID.test(memberId) || !KINDS.includes(kind)) return reply(origin, 400, { error: "Unknown member or kind of email." });

  let d: Decision;
  try {
    d = await decision(token, memberId, kind);
  } catch (e) {
    const status = (e as Error & { status?: number }).status || 500;
    return reply(origin, status, { error: (e as Error).message });
  }
  try {
    await send(await memberAddress(memberId), memberId, d);
  } catch (e) {
    // The database noted the email as sent; this one didn't go. The panel
    // says so, and our team can write from hello@nriclub.app.
    console.error("member-email:", (e as Error).message);
    return reply(origin, 502, { error: "The email couldn't be sent." });
  }
  return reply(origin, 200, { sent: true });
});
