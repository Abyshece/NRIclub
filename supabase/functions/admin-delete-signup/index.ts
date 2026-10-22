// admin-delete-signup: deletes an account that never finished signing up
// (never confirmed its email address, or never sent its check details), from
// the admin panel (admin.nriclub.app):
//   POST /functions/v1/admin-delete-signup  { "member_id": "<uuid>" }
//   with the admin's own session (Authorization: Bearer <access token>).
// The database checks first, as the admin (public.admin_check_signup_delete):
// admin rights as everywhere else, the account still unfinished (not waiting
// for review, approved, declined or blocked, not an admin, not their own),
// and the admin's limits (20 a minute, 200 a day). Then Supabase Auth deletes
// the account (service role); the database deletes the profile with it. Last,
// the deletion is recorded in private.moderation_action
// (public.admin_record_signup_delete, service role only).
//
// Secrets: none of its own (SUPABASE_URL, SUPABASE_ANON_KEY and
// SUPABASE_SERVICE_ROLE_KEY are there already). The gateway checks the token
// (verify JWT on); the database checks it again. Deploy steps and tests:
// docs/DEPLOY-ROUND3.md.

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

Deno.serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get("Origin");
  if (origin !== ALLOWED_ORIGIN) return reply(origin, 403, { error: "Not allowed from this site." });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return reply(origin, 405, { error: "Use POST." });

  const token = /^Bearer\s+(\S+)$/i.exec(req.headers.get("Authorization") || "")?.[1];
  if (!token) return reply(origin, 401, { error: "Sign in first." });
  let memberId = "";
  try {
    memberId = String((await req.json())?.member_id || "");
  } catch {
    return reply(origin, 400, { error: "Send JSON." });
  }
  if (!UUID.test(memberId)) return reply(origin, 400, { error: "Unknown member." });

  let check: { actor: string; email_confirmed: boolean };
  try {
    check = await rpc("admin_check_signup_delete", { p_member: memberId }, token);
  } catch (e) {
    return reply(origin, (e as Error & { status?: number }).status || 500, { error: (e as Error).message });
  }

  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  const res = await fetch(`${env("SUPABASE_URL")}/auth/v1/admin/users/${memberId}`, {
    method: "DELETE",
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  // Already gone (e.g. deleted twice at once): the record below still says so.
  if (!res.ok && res.status !== 404) {
    console.error("admin-delete-signup: delete failed", res.status, (await res.text()).slice(0, 300));
    return reply(origin, 502, { error: "The account couldn't be deleted. Please try again." });
  }

  try {
    await rpc("admin_record_signup_delete",
      { p_actor: check.actor, p_member: memberId, p_email_confirmed: !!check.email_confirmed }, null);
  } catch (e) {
    // The account is gone; only the record is missing. Logged for our team.
    console.error("admin-delete-signup: deleted, but not recorded:", memberId, (e as Error).message);
    return reply(origin, 200, { deleted: true, recorded: false });
  }
  return reply(origin, 200, { deleted: true, recorded: true });
});
