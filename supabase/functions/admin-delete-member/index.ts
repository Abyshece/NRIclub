// admin-delete-member: deletes a member's account from the admin panel
// (admin.nriclub.app), because the member asked us to (e.g. by email, when
// they can't do it themselves: Art. 17 GDPR) or because it is blocked:
//   POST /functions/v1/admin-delete-member
//     { "member_id": "<uuid>", "reason": "member_request" | "blocked_account", "note": "<for our record, optional>" }
//   with the admin's own session (Authorization: Bearer <access token>).
// The database checks first, as the admin (public.admin_check_member_delete):
// admin rights as everywhere else, the member exists, not an admin's account
// nor the admin's own, a known reason ('blocked_account' only for a blocked
// account), and the admin's limits (10 a minute, 50 a day). Then, with the
// service role:
//   1. the member's photo files in Storage (their folder in avatars,
//      post-images and marketplace-images, as the site uploads them) are
//      deleted; a file that can't be deleted doesn't stop the rest (the
//      admin panel's photo clean-up deletes what is left);
//   2. the member gets a short email saying so (Resend), while their address
//      still exists; if it can't be sent, the account is still deleted and
//      the answer says emailed: false, so the panel asks the admin to tell
//      the member;
//   3. Supabase Auth deletes the account; the database deletes everything
//      the member owns with it, as when members delete their own account;
//   4. the deletion is recorded in private.moderation_action
//      (public.admin_record_member_delete, service role only).
// Answers { deleted, emailed, recorded, files: { deleted, failed } }.
// GET /functions/v1/admin-delete-member?ready=1 (an admin's session):
// { ready } says whether the database has this update, so the panel can say
// so before an admin fills in the form.
//
// Secrets: RESEND_API_KEY and MAIL_FROM, as member-email (already set).
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are there
// already. Deploy with verify JWT off, like the others: the database checks
// the token itself, as the admin's own request, before anything else is
// done. Deploy steps: docs/DEPLOY-ROUND3.md.

const ALLOWED_ORIGIN = "https://admin.nriclub.app";
const REPLY_TO = "hello@nriclub.app";
const SITE = "https://nriclub.app";
const REASONS = ["member_request", "blocked_account"] as const;
type Reason = (typeof REASONS)[number];
const BUCKETS = ["avatars", "post-images", "marketplace-images"];
const NOTE_MAX = 500;
const NEEDS_UPDATE = "Deleting accounts needs the database update of 1 November 2026.";
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
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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

type Failure = Error & { status?: number; missing?: boolean };

// A database function: as the admin (token) or with the service role. A
// function the database doesn't have yet (before its update) is status 501.
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
    const missing = data?.code === "PGRST202" || data?.code === "42883";
    const err: Failure = new Error(missing ? NEEDS_UPDATE : data?.message || `The database said no (${res.status}).`);
    err.missing = missing;
    err.status = missing ? 501 : res.status === 401 || data?.code === "42501" ? 403 : 409;
    throw err;
  }
  return data;
}

// Resend's counters in its answer, for the panel's "Emails this month" (as
// member-email does). Never throws.
async function keepQuota(res: Response): Promise<void> {
  const count = (name: string) => {
    const v = (res.headers.get(name) || "").trim();
    return /^\d+$/.test(v) ? Number(v) : null;
  };
  const monthly = count("x-resend-monthly-quota");
  const daily = count("x-resend-daily-quota");
  if (monthly === null && daily === null) return;
  try {
    const key = env("SUPABASE_SERVICE_ROLE_KEY");
    await fetch(`${env("SUPABASE_URL")}/rest/v1/rpc/resend_quota_store`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_monthly_used: monthly, p_daily_used: daily }),
    });
  } catch { /* the counter stays as it was */ }
}

// ---- Photo files -------------------------------------------------------------

const storage = (path: string, method: string, body: unknown) => {
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  return fetch(`${env("SUPABASE_URL")}/storage/v1/${path}`, {
    method,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
};

// Every file in a folder of a bucket, and in its folders (as deleteMyFiles
// in src/supabaseApi.js lists a member's own).
async function listFiles(bucket: string, folder: string, depth = 0): Promise<string[]> {
  const paths: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const res = await storage(`object/list/${bucket}`, "POST", { prefix: `${folder}/`, limit: 1000, offset });
    if (!res.ok) throw new Error(`Listing ${bucket} failed (${res.status})`);
    const rows = (await res.json().catch(() => [])) || [];
    for (const r of rows) {
      if (!r?.name) continue;
      if (r.id) paths.push(`${folder}/${r.name}`);
      else if (depth < 3) paths.push(...await listFiles(bucket, `${folder}/${r.name}`, depth + 1));
    }
    if (rows.length < 1000) return paths;
  }
}

// Deletes the member's photo files, bucket by bucket (their id is the first
// part of each file's name). Never throws: { deleted, failed }, failed
// counting the files that are still there and each bucket that couldn't
// be listed.
async function deleteFiles(memberId: string): Promise<{ deleted: number; failed: number }> {
  let deleted = 0;
  let failed = 0;
  for (const bucket of BUCKETS) {
    let paths: string[] = [];
    try {
      paths = await listFiles(bucket, memberId);
    } catch (e) {
      console.error("admin-delete-member:", (e as Error).message);
      failed += 1;
      continue;
    }
    for (let i = 0; i < paths.length; i += 100) {
      const chunk = paths.slice(i, i + 100);
      try {
        const res = await storage(`object/${bucket}`, "DELETE", { prefixes: chunk });
        const rows = res.ok ? await res.json().catch(() => []) : [];
        const gone = new Set((Array.isArray(rows) ? rows : []).map((r) => r?.name));
        const n = chunk.filter((p) => gone.has(p)).length;
        deleted += n;
        failed += chunk.length - n;
      } catch {
        failed += chunk.length;
      }
    }
  }
  return { deleted, failed };
}

// ---- The email to the member -------------------------------------------------

// What the database says about the member (public.admin_check_member_delete).
type Check = {
  actor: string;
  email: string | null;
  first_name: string;
  blocked: boolean;
  blocked_on: string | null;
  appeal_until: string | null;
};

// The email, in plain text: short, no marketing.
function compose(c: Check, reason: Reason): { subject: string; text: string } {
  const hi = c.first_name ? `Hi ${c.first_name},` : "Hello,";
  const policy = `Our Privacy Policy explains this: ${SITE}/privacy`;
  const foot = "You're getting this email because your NRIClub account was deleted.";
  if (reason === "member_request") {
    return {
      subject: "Your NRIClub account has been deleted",
      text: `${hi}\n\nYour NRIClub account has been deleted, as you asked. Your profile, everything you posted, your photos and your `
        + "messages are gone, as if you had deleted the account yourself.\n\n"
        + "What we keep: our team's records of decisions about your account or what you posted, without your name, and the "
        + `emails about your request, for 3 years. ${policy}\n\nYou're welcome back any time.\n\nNRIClub\n\n${foot}\n`,
    };
  }
  const blocked = c.blocked_on ? `Your NRIClub account, blocked on ${c.blocked_on}, has been deleted.` : "Your blocked NRIClub account has been deleted.";
  const appeal = c.appeal_until
    ? `Think we got the block wrong? Reply to this email by ${c.appeal_until}, and a person on our team will look at it again. `
      + "You can also go to court.\n\n"
    : "";
  return {
    subject: "Your NRIClub account has been deleted",
    text: `${hi}\n\n${blocked} Your profile, everything you posted, your photos and your messages are gone.\n\n`
      + "What we keep: our team's records of decisions about your account, the block included, without your name; the "
      + "short record that stops a blocked account from simply signing up again; and emails about requests concerning "
      + `your data, for 3 years. ${policy}\n\n${appeal}NRIClub\n\n${foot}\n`,
  };
}

// Sends it through Resend. The idempotency key makes a second try for the
// same member (e.g. after the deletion failed) send nothing more.
async function sendEmail(c: Check, memberId: string, reason: Reason): Promise<void> {
  const to = String(c.email || "").trim();
  if (!to || /[\r\n]/.test(to)) throw new Error("The member has no email address.");
  const { subject, text } = compose(c, reason);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env("RESEND_API_KEY")}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `admin-delete-member/${memberId}`,
    },
    body: JSON.stringify({ from: env("MAIL_FROM"), to: [to], reply_to: REPLY_TO, subject, text }),
  });
  await keepQuota(res);
  if (!res.ok) throw new Error(`Resend refused the email (${res.status}): ${(await res.text()).slice(0, 300)}`);
}

// Whether the database has this update, for an admin: { ready }.
async function ready(origin: string | null, token: string): Promise<Response> {
  try {
    await rpc("admin_check_member_delete", { p_member: null, p_reason: null }, token);
    return reply(origin, 200, { ready: true });
  } catch (e) {
    const err = e as Failure;
    if (err.missing) return reply(origin, 200, { ready: false, error: NEEDS_UPDATE });
    return reply(origin, err.status || 500, { error: err.message });
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get("Origin");
  if (origin !== ALLOWED_ORIGIN) return reply(origin, 403, { error: "Not allowed from this site." });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  const token = /^Bearer\s+(\S+)$/i.exec(req.headers.get("Authorization") || "")?.[1];
  if (req.method === "GET" && new URL(req.url).searchParams.get("ready")) {
    if (!token) return reply(origin, 401, { error: "Sign in first." });
    return ready(origin, token);
  }
  if (req.method !== "POST") return reply(origin, 405, { error: "Use POST." });
  if (!token) return reply(origin, 401, { error: "Sign in first." });
  let body: { member_id?: unknown; reason?: unknown; note?: unknown };
  try {
    body = await req.json();
  } catch {
    return reply(origin, 400, { error: "Send JSON." });
  }
  const memberId = String(body?.member_id || "");
  const reason = String(body?.reason || "") as Reason;
  const note = typeof body?.note === "string" ? body.note.trim() : "";
  if (!UUID.test(memberId)) return reply(origin, 400, { error: "Unknown member." });
  if (!REASONS.includes(reason)) return reply(origin, 400, { error: "Choose why the account is deleted." });
  if (note.length > NOTE_MAX) return reply(origin, 400, { error: `Keep the note to ${NOTE_MAX} characters.` });

  let check: Check;
  try {
    check = await rpc("admin_check_member_delete", { p_member: memberId, p_reason: reason }, token);
  } catch (e) {
    return reply(origin, (e as Failure).status || 500, { error: (e as Error).message });
  }

  const files = await deleteFiles(memberId);

  let emailed = true;
  try {
    await sendEmail(check, memberId, reason);
  } catch (e) {
    emailed = false;
    console.error("admin-delete-member: email not sent:", memberId, (e as Error).message);
  }

  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  const res = await fetch(`${env("SUPABASE_URL")}/auth/v1/admin/users/${memberId}`, {
    method: "DELETE",
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  // Already gone (e.g. deleted twice at once): the record below still says so.
  if (!res.ok && res.status !== 404) {
    console.error("admin-delete-member: delete failed", res.status, (await res.text()).slice(0, 300));
    return reply(origin, 502, { error: "The account couldn't be deleted. Please try again.", emailed, files });
  }

  try {
    await rpc("admin_record_member_delete",
      { p_actor: check.actor, p_member: memberId, p_reason: reason, p_note: note, p_emailed: emailed }, null);
  } catch (e) {
    // The account is gone; only the record is missing. Logged for our team.
    console.error("admin-delete-member: deleted, but not recorded:", memberId, (e as Error).message);
    return reply(origin, 200, { deleted: true, emailed, recorded: false, files });
  }
  return reply(origin, 200, { deleted: true, emailed, recorded: true, files });
});
