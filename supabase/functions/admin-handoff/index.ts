// admin-handoff: the "Admin panel" button on the members' site (nriclub.app)
// opens the admin panel (admin.nriclub.app) already signed in:
//   POST /functions/v1/admin-handoff  {}
//   with the member's own session (Authorization: Bearer <access token>).
// Only for an account in public.admins that isn't blocked: the database
// says so, as the caller (public.admin_mfa_status). Supabase Auth then makes
// a one-time sign-in code for that same account: the hashed token of a
// magic link, which is never emailed. The button sends it to
// admin.nriclub.app/#handoff=<code> (after the #, so it never reaches a
// server or a log); the admin site takes it out of the address bar at once
// and trades it for a session of its own (POST /auth/v1/verify, type
// magiclink). So the two sites still keep separate sessions, and once
// "Require two-step login for admin rights" is on, the admin site still asks
// for the 6-digit code: the code alone gives no admin rights. It works once
// and expires with Auth's email OTP expiry.
//
// Secrets: none of its own (SUPABASE_URL, SUPABASE_ANON_KEY and
// SUPABASE_SERVICE_ROLE_KEY are there already). Deploy with verify JWT off,
// like the others: the database and Auth check the token themselves.

const ALLOWED_ORIGINS = ["https://nriclub.app", "https://www.nriclub.app"];

const env = (name: string): string => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`The secret ${name} isn't set.`);
  return value;
};

// Answers only the members' site, where the button is.
function cors(origin: string | null): Record<string, string> {
  return origin && ALLOWED_ORIGINS.includes(origin)
    ? {
      "Access-Control-Allow-Origin": origin,
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

// The hashed token from Auth's answer: at the top level (Auth's REST API),
// under properties (as supabase-js shows it), or in the link itself.
function hashedToken(data: Record<string, unknown> | null): string {
  const props = (data?.properties || {}) as Record<string, unknown>;
  const direct = String(data?.hashed_token || props.hashed_token || "");
  if (direct) return direct;
  try {
    return new URL(String(data?.action_link || props.action_link || "")).searchParams.get("token") || "";
  } catch {
    return "";
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get("Origin");
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) return reply(origin, 403, { error: "Not allowed from this site." });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return reply(origin, 405, { error: "Use POST." });

  const token = /^Bearer\s+(\S+)$/i.exec(req.headers.get("Authorization") || "")?.[1];
  if (!token) return reply(origin, 401, { error: "Sign in first." });
  const url = env("SUPABASE_URL");
  const anon = env("SUPABASE_ANON_KEY");

  // An admin account that isn't blocked (two-step login is the admin site's
  // to ask for).
  const status = await fetch(`${url}/rest/v1/rpc/admin_mfa_status`, {
    method: "POST",
    headers: { apikey: anon, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: "{}",
  });
  if (status.status === 401) return reply(origin, 401, { error: "Sign in first." });
  const access = await status.json().catch(() => null);
  if (!status.ok || !access?.listed || access.active === false) {
    return reply(origin, 403, { error: "Only for the NRIClub team." });
  }

  // The caller's own account; the code is only ever for that one.
  const me = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anon, Authorization: `Bearer ${token}` } });
  const user = await me.json().catch(() => null);
  if (!me.ok || !user?.email) return reply(origin, 401, { error: "Sign in first." });

  const service = env("SUPABASE_SERVICE_ROLE_KEY");
  const link = await fetch(`${url}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "magiclink", email: user.email }),
  });
  const data = await link.json().catch(() => null);
  const code = link.ok ? hashedToken(data) : "";
  if (!code) {
    // Never logs the token; only what went wrong.
    console.error("admin-handoff: no code", link.status, String(data?.msg || data?.error_description || data?.message || "").slice(0, 200));
    return reply(origin, 502, { error: "Couldn't open the admin panel signed in. Please log in there." });
  }
  return reply(origin, 200, { code });
});
