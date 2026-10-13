#!/usr/bin/env python3
"""Row-level-security tests for the NRIclub schema.

Runs against a plain PostgreSQL database that has the Supabase stand-in
(supabase/tests/supabase_stub.sql) and the migrations applied. Each check runs
as the API role a real request would use (anon or authenticated + JWT claims).

    python3 supabase/tests/rls_test.py "host=/var/run/postgresql port=5432 dbname=nriclub_test user=postgres"
"""
import json
import subprocess
import sys
import time

DSN = sys.argv[1] if len(sys.argv) > 1 else "dbname=nriclub_test user=postgres"

ALICE = "00000000-0000-0000-0000-00000000000a"
BOB = "00000000-0000-0000-0000-00000000000b"
CAROL = "00000000-0000-0000-0000-00000000000c"
ADMIN = "00000000-0000-0000-0000-0000000000ad"
LEGACY = "00000000-0000-0000-0000-0000000000e1"
IVAN = "00000000-0000-0000-0000-0000000000e2"
RESTORED = "00000000-0000-0000-0000-0000000000e3"
GITA = "00000000-0000-0000-0000-0000000000e4"
HARI = "00000000-0000-0000-0000-0000000000e5"
DAVE = "00000000-0000-0000-0000-0000000000e6"
DAVE2 = "00000000-0000-0000-0000-0000000000e7"
EVE = "00000000-0000-0000-0000-0000000000e8"
FRANK = "00000000-0000-0000-0000-0000000000e9"
BO = "00000000-0000-0000-0000-0000000000ea"
CAROL2 = "00000000-0000-0000-0000-0000000000eb"
NONAME = "00000000-0000-0000-0000-0000000000ec"
RESTORED_BLOCKED = "00000000-0000-0000-0000-0000000000ed"
CONVO2 = "30000000-0000-0000-0000-000000000002"
TERMS = {"age_confirmed": True, "terms_version": "2026-10"}  # what the signup form sends
STORE = "https://abcdefgh.supabase.co/storage/v1/object/public"
BOB_POST = "10000000-0000-0000-0000-000000000005"

failures = []


def psql_args(sql, role=None, uid=None):
    prelude = ""
    if role:
        claims = json.dumps({"sub": uid, "role": role} if uid else {"role": role})
        prelude = f"SET ROLE {role}; SELECT set_config('request.jwt.claims', '{claims}', false);\n"
    return ["psql", DSN, "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", "-c", prelude + sql]


def psql(sql, role=None, uid=None):
    proc = subprocess.run(psql_args(sql, role, uid), capture_output=True, text=True)
    lines = [l for l in proc.stdout.strip().splitlines() if l != ""]
    if role:
        lines = lines[1:]  # drop set_config's output
    return proc.returncode == 0, "\n".join(lines), proc.stderr.strip()


def check(name, sql, as_user=None, expect="ok", role="authenticated", error_has=None):
    """expect: 'ok', 'error', or the exact text the last statement prints.
    error_has: the call must fail with this text in the error."""
    if as_user is None and role == "authenticated":
        role = None  # run as the table owner (setup / inspection)
    ok, out, err = psql(sql, role, as_user)
    if error_has is not None:
        expect = f"error: {error_has}"
        passed = not ok and error_has in err
    elif expect == "error":
        passed = not ok
    elif expect == "ok":
        passed = ok
    else:
        passed = ok and out == expect
    print(("PASS " if passed else "FAIL ") + name)
    if not passed:
        failures.append(name)
        print(f"     expected: {expect!r}\n     got ok={ok} out={out!r}\n     err={err[:300]}")


def verdict(name, passed, detail=""):
    print(("PASS " if passed else "FAIL ") + name)
    if not passed:
        failures.append(name)
        print(f"     {detail}")


def in_background(sql, as_user):
    """Start a session as a member that keeps running (e.g. holds locks while
    it sleeps); wait for it with .communicate()."""
    return subprocess.Popen(psql_args(sql, "authenticated", as_user),
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)


def sign_up(uid, email, meta):
    """A new auth user, as Supabase Auth would create it (the trigger does the rest)."""
    ok, _, err = psql(f"INSERT INTO auth.users (id, email, raw_user_meta_data, email_confirmed_at) "
                      f"VALUES ('{uid}', '{email}', '{json.dumps(meta)}', now())")
    if not ok:
        sys.exit(f"sign-up of {email} failed: {err}")


# Counts of other members' rows a member can read, table by table.
OTHERS = """SELECT concat_ws(',',
  (SELECT count(*) FROM profiles WHERE id <> auth.uid()),
  (SELECT count(*) FROM posts WHERE user_id <> auth.uid()),
  (SELECT count(*) FROM comments WHERE user_id <> auth.uid()),
  (SELECT count(*) FROM likes WHERE user_id <> auth.uid()),
  (SELECT count(*) FROM group_members WHERE user_id <> auth.uid()),
  (SELECT count(*) FROM connections WHERE auth.uid() NOT IN (requester_id, recipient_id)),
  (SELECT count(*) FROM events WHERE organizer_id <> auth.uid()),
  (SELECT count(*) FROM event_rsvps WHERE user_id <> auth.uid()),
  (SELECT count(*) FROM marketplace WHERE user_id <> auth.uid()),
  (SELECT count(*) FROM docs WHERE user_id <> auth.uid()),
  (SELECT count(*) FROM doc_comments WHERE user_id <> auth.uid()),
  (SELECT count(*) FROM help_requests WHERE user_id <> auth.uid()),
  (SELECT count(*) FROM help_responses WHERE user_id <> auth.uid()))"""
NONE_OF_OTHERS = ",".join(["0"] * 13)


def setup():
    ok, _, err = psql(f"""
      INSERT INTO auth.users (id, email, raw_user_meta_data, email_confirmed_at) VALUES
        ('{ALICE}', 'alice@example.com', '{{"full_name": "Alice A", "location": "Berlin, Germany", "hometown": "Pune", "profession": "Engineer", "occupation_status": "Student", "years_abroad": "1-3 years", "linkedin_url": "https://linkedin.com/in/alice", "gdpr_consent": true, "marketing_consent": false}}', now()),
        ('{BOB}', 'bob@example.com', '{{"full_name": "Bob B"}}', now()),
        ('{CAROL}', 'carol@example.com', '{{"full_name": "Carol C"}}', NULL),
        ('{ADMIN}', 'admin@example.com', '{{"full_name": "Admin"}}', now());
      INSERT INTO public.admins (user_id) VALUES ('{ADMIN}');
      -- Alice, Bob and Carol have submitted their verification details
      -- (pending members can use everything); the admin is approved. All
      -- four confirmed 18+ and accepted the Terms.
      UPDATE public.profile_private SET verification_status = 'pending', submitted_at = now()
        WHERE id IN ('{ALICE}', '{BOB}', '{CAROL}');
      UPDATE public.profile_private SET verification_status = 'approved' WHERE id = '{ADMIN}';
      UPDATE public.profile_private SET age_confirmed_at = now(), terms_accepted_at = now(), terms_version = '2026-10';
    """)
    if not ok:
        sys.exit("setup failed: " + err)


def main():
    setup()

    # --- signup trigger -----------------------------------------------------
    check("signup trigger fills profile from metadata",
          f"SELECT name || '|' || location || '|' || occupation_status || '|' || linkedin_url || '|' || email_verified FROM profiles WHERE id = '{ALICE}'",
          expect="Alice A|Berlin, Germany|Student|https://www.linkedin.com/in/alice|true")
    check("signup trigger stores email + consent privately",
          f"SELECT email || '|' || gdpr_consent || '|' || (gdpr_consent_date IS NOT NULL) FROM profile_private WHERE id = '{ALICE}'",
          expect="alice@example.com|true|true")
    check("unconfirmed email -> email_verified false",
          f"SELECT email_verified::text FROM profiles WHERE id = '{CAROL}'", expect="false")

    # --- anon ---------------------------------------------------------------
    check("anon cannot read profiles", "SELECT count(*) FROM profiles", role="anon", expect="error")
    check("anon cannot read posts", "SELECT count(*) FROM posts", role="anon", expect="error")
    check("anon cannot call delete_my_account", "SELECT public.delete_my_account()", role="anon", expect="error")

    # --- admins -------------------------------------------------------------
    check("member cannot make themselves admin",
          f"INSERT INTO admins (user_id) VALUES ('{ALICE}')", as_user=ALICE, expect="error")
    check("member sees no admin rows", "SELECT count(*) FROM admins", as_user=ALICE, expect="0")
    check("admin sees own admin row", "SELECT count(*) FROM admins", as_user=ADMIN, expect="1")

    # --- profiles -----------------------------------------------------------
    check("member can edit own profile fields",
          "UPDATE profiles SET name = 'Alice Updated', bio = 'hi' WHERE id = auth.uid() RETURNING name",
          as_user=ALICE, expect="Alice Updated")
    check("member cannot self-verify / fake email_verified",
          "UPDATE profiles SET linkedin_verified = true, email_verified = true WHERE id = auth.uid() "
          "RETURNING linkedin_verified::text || email_verified", as_user=CAROL, expect="falsefalse")
    check("member cannot approve or unblock themselves",
          "UPDATE profile_private SET verification_status = 'approved', status = 'active' WHERE id = auth.uid() "
          "RETURNING verification_status || status", as_user=CAROL, expect="pendingactive")
    check("carol's email_verified unchanged after attempt",
          f"SELECT email_verified::text FROM profiles WHERE id = '{CAROL}'", expect="false")
    check("member cannot edit someone else's profile",
          f"UPDATE profiles SET name = 'hacked' WHERE id = '{BOB}' RETURNING id", as_user=ALICE, expect="")
    check("member cannot read others' private data (emails)",
          "SELECT count(*) FROM profile_private", as_user=ALICE, expect="1")
    check("member cannot change own stored email",
          "UPDATE profile_private SET email = 'x@evil.com' WHERE id = auth.uid() RETURNING email",
          as_user=ALICE, expect="alice@example.com")
    check("admin can read all private data", "SELECT count(*) FROM profile_private", as_user=ADMIN, expect="4")
    check("admin can approve a member -> Verified badge",
          f"UPDATE profile_private SET verification_status = 'approved' WHERE id = '{BOB}'; "
          f"SELECT linkedin_verified::text FROM profiles WHERE id = '{BOB}'",
          as_user=ADMIN, expect="true")
    check("profiles cannot be deleted via the API",
          "DELETE FROM profiles WHERE id = auth.uid() RETURNING id", as_user=ALICE, expect="")

    # --- auth sync ----------------------------------------------------------
    check("confirming email flips email_verified",
          f"UPDATE auth.users SET email_confirmed_at = now() WHERE id = '{CAROL}'; "
          f"SELECT email_verified::text FROM profiles WHERE id = '{CAROL}'", expect="true")
    check("email change syncs to profile_private",
          f"UPDATE auth.users SET email = 'bob2@example.com' WHERE id = '{BOB}'; "
          f"SELECT email FROM profile_private WHERE id = '{BOB}'", expect="bob2@example.com")
    check("gdpr consent date stamped server-side",
          "UPDATE profile_private SET gdpr_consent = true, gdpr_consent_date = '2000-01-01' WHERE id = auth.uid() "
          "RETURNING (gdpr_consent_date > now() - interval '1 minute')::text", as_user=BOB, expect="true")

    # --- groups -------------------------------------------------------------
    check("member group request is forced unapproved",
          f"INSERT INTO groups (id, name, created_by, is_approved, members_count) VALUES ('70000000-0000-0000-0000-000000000001', 'Indians in Testville', '{ALICE}', true, 9999) "
          "RETURNING is_approved::text || members_count", as_user=ALICE, expect="false0")
    check("member cannot request a group in someone else's name",
          f"INSERT INTO groups (name, created_by) VALUES ('Indians in Spoof', '{BOB}')", as_user=ALICE, expect="error")
    check("other members don't see pending groups",
          "SELECT count(*) FROM groups WHERE name = 'Indians in Testville'", as_user=BOB, expect="0")
    check("requester sees own pending group",
          "SELECT count(*) FROM groups WHERE name = 'Indians in Testville'", as_user=ALICE, expect="1")
    check("cannot join an unapproved group",
          f"INSERT INTO group_members (group_id, user_id) VALUES ('70000000-0000-0000-0000-000000000001', '{BOB}')",
          as_user=BOB, expect="error")
    check("member cannot approve groups",
          "UPDATE groups SET is_approved = true WHERE name = 'Indians in Testville' RETURNING id", as_user=ALICE, expect="")
    check("admin approves group",
          "UPDATE groups SET is_approved = true WHERE name = 'Indians in Testville' RETURNING is_approved::text",
          as_user=ADMIN, expect="true")
    check("joining forces role=member and bumps count",
          f"INSERT INTO group_members (group_id, user_id, role) SELECT id, '{BOB}', 'admin' FROM groups WHERE name = 'Indians in Testville' RETURNING role; "
          , as_user=BOB, expect="member")
    check("members_count maintained", "SELECT members_count FROM groups WHERE name = 'Indians in Testville'", expect="1")
    check("member cannot delete groups",
          "DELETE FROM groups WHERE name = 'Indians in Testville' RETURNING id", as_user=ALICE, expect="")

    # --- posts / likes / comments ------------------------------------------
    check("post counters forced to zero",
          f"INSERT INTO posts (id, user_id, content, likes_count, comments_count) VALUES ('10000000-0000-0000-0000-000000000001', '{ALICE}', 'hello', 999, 999) "
          "RETURNING likes_count::text || comments_count", as_user=ALICE, expect="00")
    check("bob posts (for the notification checks)",
          f"INSERT INTO posts (id, user_id, content) VALUES ('{BOB_POST}', '{BOB}', 'my post') RETURNING 1",
          as_user=BOB, expect="1")
    check("cannot post as someone else",
          f"INSERT INTO posts (user_id, content) VALUES ('{BOB}', 'spoof')", as_user=ALICE, expect="error")
    check("like updates likes_count",
          f"INSERT INTO likes (post_id, user_id) VALUES ('10000000-0000-0000-0000-000000000001', '{BOB}'); "
          "SELECT likes_count FROM posts WHERE id = '10000000-0000-0000-0000-000000000001'", as_user=BOB, expect="1")
    check("comment updates comments_count",
          f"INSERT INTO comments (post_id, user_id, content) VALUES ('10000000-0000-0000-0000-000000000001', '{BOB}', 'nice'); "
          "SELECT comments_count FROM posts WHERE id = '10000000-0000-0000-0000-000000000001'", as_user=BOB, expect="1")
    check("owner cannot inflate counters",
          "UPDATE posts SET likes_count = 500, content = 'edited' WHERE id = '10000000-0000-0000-0000-000000000001' "
          "RETURNING likes_count::text || content", as_user=ALICE, expect="1edited")
    check("cannot edit someone else's post",
          "UPDATE posts SET content = 'x' WHERE id = '10000000-0000-0000-0000-000000000001' RETURNING id", as_user=BOB, expect="")
    check("cannot delete someone else's post",
          "DELETE FROM posts WHERE id = '10000000-0000-0000-0000-000000000001' RETURNING id", as_user=BOB, expect="")
    check("unlike decrements",
          "DELETE FROM likes WHERE user_id = auth.uid(); SELECT likes_count FROM posts WHERE id = '10000000-0000-0000-0000-000000000001'",
          as_user=BOB, expect="0")

    # --- connections --------------------------------------------------------
    check("Namaste request forced to pending",
          f"INSERT INTO connections (id, requester_id, recipient_id, status) VALUES ('20000000-0000-0000-0000-000000000001', '{ALICE}', '{BOB}', 'accepted') RETURNING status",
          as_user=ALICE, expect="pending")
    check("requester cannot accept own request",
          "UPDATE connections SET status = 'accepted' WHERE id = '20000000-0000-0000-0000-000000000001' RETURNING id",
          as_user=ALICE, expect="")
    check("outsider cannot see pending request",
          "SELECT count(*) FROM connections", as_user=CAROL, expect="0")
    check("recipient accepts, cannot rewrite parties",
          f"UPDATE connections SET status = 'accepted', requester_id = '{CAROL}' WHERE id = '20000000-0000-0000-0000-000000000001' "
          "RETURNING status || '|' || requester_id", as_user=BOB, expect=f"accepted|{ALICE}")
    check("accepted connections visible to members",
          "SELECT count(*) FROM connections", as_user=CAROL, expect="1")
    check("'Nobody' namaste setting is enforced",
          f"INSERT INTO user_settings (user_id, namaste_requests) VALUES ('{CAROL}', 'Nobody'); ", as_user=CAROL)
    check("request to 'Nobody' user rejected",
          f"INSERT INTO connections (requester_id, recipient_id) VALUES ('{ALICE}', '{CAROL}')", as_user=ALICE, expect="error")

    # --- conversations / messages ------------------------------------------
    check("other members can't read someone's settings row",
          "SELECT count(*) FROM user_settings", as_user=ALICE, expect="0")
    check("get_member_preferences exposes only the contact settings",
          f"SELECT namaste_requests FROM public.get_member_preferences('{CAROL}')", as_user=ALICE, expect="Nobody")
    check("anon cannot call get_member_preferences",
          f"SELECT * FROM public.get_member_preferences('{CAROL}')", role="anon", expect="error")
    check("start conversation",
          f"INSERT INTO conversations (id, participant_1, participant_2) VALUES ('30000000-0000-0000-0000-000000000001', '{ALICE}', '{BOB}') RETURNING 1",
          as_user=ALICE, expect="1")
    check("duplicate conversation (reversed pair) rejected",
          f"INSERT INTO conversations (participant_1, participant_2) VALUES ('{BOB}', '{ALICE}')", as_user=BOB, expect="error")
    check("cannot create conversation between two other people",
          f"INSERT INTO conversations (participant_1, participant_2) VALUES ('{BOB}', '{CAROL}')", as_user=ALICE, expect="error")
    check("participant sends message, last_message updated",
          f"INSERT INTO messages (conversation_id, sender_id, content) VALUES ('30000000-0000-0000-0000-000000000001', '{ALICE}', 'hey bob'); "
          "SELECT last_message_text FROM conversations WHERE id = '30000000-0000-0000-0000-000000000001'", as_user=ALICE, expect="hey bob")
    check("outsider cannot read the conversation", "SELECT count(*) FROM messages", as_user=CAROL, expect="0")
    check("outsider cannot inject a message",
          f"INSERT INTO messages (conversation_id, sender_id, content) VALUES ('30000000-0000-0000-0000-000000000001', '{CAROL}', 'spam')",
          as_user=CAROL, expect="error")
    check("cannot send as the other participant",
          f"INSERT INTO messages (conversation_id, sender_id, content) VALUES ('30000000-0000-0000-0000-000000000001', '{BOB}', 'spoof')",
          as_user=ALICE, expect="error")
    check("bob blocks alice", f"INSERT INTO blocks (blocker_id, blocked_id) VALUES ('{BOB}', '{ALICE}') RETURNING 1", as_user=BOB, expect="1")
    check("blocked user cannot notify the blocker",
          f"INSERT INTO notifications (user_id, type, actor_id, text, reference_id) VALUES ('{BOB}', 'like', '{ALICE}', 'Alice liked your post', '{BOB_POST}')",
          as_user=ALICE, expect="error")
    check("blocked user cannot message",
          f"INSERT INTO messages (conversation_id, sender_id, content) VALUES ('30000000-0000-0000-0000-000000000001', '{ALICE}', 'still here?')",
          as_user=ALICE, expect="error")
    check("blocker cannot message either",
          f"INSERT INTO messages (conversation_id, sender_id, content) VALUES ('30000000-0000-0000-0000-000000000001', '{BOB}', 'bye')",
          as_user=BOB, expect="error")
    check("blocked user can't see the block row", "SELECT count(*) FROM blocks", as_user=ALICE, expect="0")
    check("bob unblocks", f"DELETE FROM blocks WHERE blocker_id = '{BOB}' RETURNING 1", as_user=BOB, expect="1")
    check("'Connections Only' rejects non-connections",
          f"INSERT INTO user_settings (user_id, receive_messages) VALUES ('{BOB}', 'Connections Only'); "
          f"DELETE FROM connections WHERE id = '20000000-0000-0000-0000-000000000001'", as_user=BOB)
    check("message to 'Connections Only' user from stranger rejected",
          f"INSERT INTO messages (conversation_id, sender_id, content) VALUES ('30000000-0000-0000-0000-000000000001', '{ALICE}', 'hi')",
          as_user=ALICE, expect="error")

    # --- notifications ------------------------------------------------------
    check("notify another member in own name",
          f"INSERT INTO notifications (user_id, type, actor_id, text, read, reference_id) VALUES ('{BOB}', 'like', '{ALICE}', 'Alice liked your post', true, '{BOB_POST}')",
          as_user=ALICE)
    check("read flag forced false on insert",
          f"SELECT read::text FROM notifications WHERE user_id = '{BOB}'", expect="false")
    check("cannot spoof the actor",
          f"INSERT INTO notifications (user_id, type, actor_id, text, reference_id) VALUES ('{BOB}', 'like', '{CAROL}', 'Carol liked', '{BOB_POST}')",
          as_user=ALICE, expect="error")
    check("cannot send actorless notifications",
          f"INSERT INTO notifications (user_id, type, text) VALUES ('{BOB}', 'group', 'Your group was approved')",
          as_user=ALICE, expect="error")
    check("Namaste notification needs a matching pending request",
          f"INSERT INTO notifications (user_id, type, actor_id, text) VALUES ('{BOB}', 'request', '{ALICE}', 'Alice sent you a Namaste')",
          as_user=ALICE, expect="error")
    check("members cannot send verification or system notifications",
          f"INSERT INTO notifications (user_id, type, actor_id, text) VALUES ('{BOB}', 'verification', '{ALICE}', 'You are verified')",
          as_user=ALICE, expect="error")
    check("admin can send system notifications",
          f"INSERT INTO notifications (user_id, type, text) VALUES ('{ALICE}', 'group', 'Your community was approved') RETURNING 1",
          as_user=ADMIN, expect="1")
    check("cannot read others' notifications", "SELECT count(*) FROM notifications", as_user=CAROL, expect="0")
    check("recipient marks read but can't rewrite text",
          "UPDATE notifications SET read = true, text = 'changed' WHERE user_id = auth.uid() RETURNING read::text || text",
          as_user=BOB, expect="trueAlice liked your post")

    # --- reports ------------------------------------------------------------
    check("report forced to pending",
          f"INSERT INTO reports (reporter_id, reported_post_id, reason, status) VALUES ('{BOB}', '10000000-0000-0000-0000-000000000001', '[POST] spam', 'resolved') RETURNING status",
          as_user=BOB, expect="pending")
    check("report can reference non-post content ids",
          f"INSERT INTO reports (reporter_id, reported_post_id, reason) VALUES ('{BOB}', gen_random_uuid(), '[MARKETPLACE] scam') RETURNING 1",
          as_user=BOB, expect="1")
    check("others can't read reports", "SELECT count(*) FROM reports", as_user=ALICE, expect="0")
    check("member cannot resolve/delete reports",
          "DELETE FROM reports RETURNING id", as_user=BOB, expect="")
    check("admin sees and resolves reports",
          "UPDATE reports SET status = 'resolved' RETURNING 1", as_user=ADMIN, expect="1\n1")
    check("admin can delete reported post",
          "DELETE FROM posts WHERE id = '10000000-0000-0000-0000-000000000001' RETURNING 1", as_user=ADMIN, expect="1")

    # --- events / help / marketplace / docs ---------------------------------
    check("event counters forced, organizer must be self",
          f"INSERT INTO events (id, title, date, time, organizer_id, organizer_name, attendees_count) VALUES ('40000000-0000-0000-0000-000000000001', 'Diwali', 'Nov 1, 2026 • 6:00 PM', '18:00', '{ALICE}', 'Alice', 300) RETURNING attendees_count",
          as_user=ALICE, expect="0")
    check("cannot create event for someone else",
          f"INSERT INTO events (title, date, organizer_id) VALUES ('x', 'y', '{BOB}')", as_user=ALICE, expect="error")
    check("RSVP bumps attendees",
          f"INSERT INTO event_rsvps (event_id, user_id) VALUES ('40000000-0000-0000-0000-000000000001', '{BOB}'); "
          "SELECT attendees_count FROM events WHERE id = '40000000-0000-0000-0000-000000000001'", as_user=BOB, expect="1")
    check("help request forced open, responses counted",
          f"INSERT INTO help_requests (id, user_id, title, description, status, responses_count) VALUES ('50000000-0000-0000-0000-000000000001', '{ALICE}', 'Anmeldung?', 'How?', 'Resolved', 7) RETURNING status || responses_count",
          as_user=ALICE, expect="Open0")
    check("help response increments count",
          f"INSERT INTO help_responses (request_id, user_id, content) VALUES ('50000000-0000-0000-0000-000000000001', '{BOB}', 'Go to Bürgeramt'); "
          "SELECT responses_count FROM help_requests WHERE id = '50000000-0000-0000-0000-000000000001'", as_user=BOB, expect="1")
    check("listing image_url size limit",
          f"INSERT INTO marketplace (user_id, title, price, image_url) VALUES ('{ALICE}', 'Sofa', '€50', repeat('x', 30000))",
          as_user=ALICE, expect="error")
    check("listing create ok",
          f"INSERT INTO marketplace (id, user_id, title, price) VALUES ('60000000-0000-0000-0000-000000000001', '{ALICE}', 'Sofa', '€50') RETURNING status",
          as_user=ALICE, expect="active")
    check("cannot delete someone else's listing",
          "DELETE FROM marketplace WHERE id = '60000000-0000-0000-0000-000000000001' RETURNING 1", as_user=BOB, expect="")
    check("doc likes_count protected",
          f"INSERT INTO docs (user_id, title, likes_count) VALUES ('{ALICE}', 'Visa guide', 99) RETURNING likes_count",
          as_user=ALICE, expect="0")

    # --- blocked members ----------------------------------------------------
    check("carol posts before being blocked",
          f"INSERT INTO posts (id, user_id, content) VALUES ('10000000-0000-0000-0000-000000000003', '{CAROL}', 'hello') RETURNING 1",
          as_user=CAROL, expect="1")
    check("admin blocks carol",
          f"UPDATE profile_private SET status = 'blocked' WHERE id = '{CAROL}' RETURNING status", as_user=ADMIN, expect="blocked")
    check("other members can't see who is blocked",
          f"SELECT count(*) FROM profile_private WHERE id = '{CAROL}'", as_user=ALICE, expect="0")
    check("blocked member cannot post",
          f"INSERT INTO posts (user_id, content) VALUES ('{CAROL}', 'spam')", as_user=CAROL, expect="error")
    check("blocked member cannot list items",
          f"INSERT INTO marketplace (user_id, title, price) VALUES ('{CAROL}', 'x', '1')", as_user=CAROL, expect="error")
    check("post for the blocked-member checks",
          f"INSERT INTO posts (id, user_id, content) VALUES ('10000000-0000-0000-0000-000000000002', '{ALICE}', 'hi') RETURNING 1",
          as_user=ALICE, expect="1")
    check("blocked member cannot like",
          f"INSERT INTO likes (post_id, user_id) VALUES ('10000000-0000-0000-0000-000000000002', '{CAROL}')", as_user=CAROL, expect="error")
    check("blocked member cannot RSVP",
          f"INSERT INTO event_rsvps (event_id, user_id) VALUES ('40000000-0000-0000-0000-000000000001', '{CAROL}')",
          as_user=CAROL, expect="error")
    check("blocked member cannot join groups",
          f"INSERT INTO group_members (group_id, user_id) VALUES ('70000000-0000-0000-0000-000000000001', '{CAROL}')",
          as_user=CAROL, expect="error")
    check("blocked member cannot edit their posts",
          "UPDATE posts SET content = 'edited' WHERE id = '10000000-0000-0000-0000-000000000003' RETURNING 1",
          as_user=CAROL, expect="")
    check("blocked member cannot send notifications",
          f"INSERT INTO notifications (user_id, type, actor_id, text, reference_id) VALUES ('{ALICE}', 'like', '{CAROL}', 'Carol liked your post', '10000000-0000-0000-0000-000000000002')",
          as_user=CAROL, expect="error")
    check("blocked member can still edit profile",
          "UPDATE profiles SET linkedin_url = 'https://linkedin.com/in/carol' WHERE id = auth.uid() RETURNING linkedin_url",
          as_user=CAROL, expect="https://www.linkedin.com/in/carol")
    check("blocked member can still report bugs",
          f"INSERT INTO reports (reporter_id, reported_post_id, reason) VALUES ('{CAROL}', '{CAROL}', '[BUG] Feed: broken') RETURNING 1",
          as_user=CAROL, expect="1")

    # --- storage ------------------------------------------------------------
    check("upload into own folder",
          f"INSERT INTO storage.objects (bucket_id, name) VALUES ('avatars', '{ALICE}/avatar_1.png') RETURNING 1",
          as_user=ALICE, expect="1")
    check("cannot upload into someone else's folder",
          f"INSERT INTO storage.objects (bucket_id, name) VALUES ('avatars', '{BOB}/avatar_1.png')", as_user=ALICE, expect="error")
    check("cannot overwrite someone else's file",
          f"UPDATE storage.objects SET metadata = '{{}}' WHERE name = '{ALICE}/avatar_1.png' RETURNING 1", as_user=BOB, expect="")
    check("cannot delete someone else's file",
          f"DELETE FROM storage.objects WHERE name = '{ALICE}/avatar_1.png' RETURNING 1", as_user=BOB, expect="")
    check("cannot upload to other buckets",
          f"INSERT INTO storage.objects (bucket_id, name) VALUES ('private-stuff', '{ALICE}/x.png')", as_user=ALICE, expect="error")

    # --- member verification ------------------------------------------------
    diana = "00000000-0000-0000-0000-0000000000d1"
    check("signup records country, age and terms; starts incomplete",
          f"""INSERT INTO auth.users (id, email, raw_user_meta_data, email_confirmed_at) VALUES ('{diana}', 'diana@example.com',
          '{{"full_name": "  Diana D  ", "country_code": "de", "age_confirmed": true, "terms_version": "2026-10",
            "linkedin_url": "de.linkedin.com/in/Diana-D/"}}', now());
          SELECT p.name || '|' || p.country_code || '|' || pp.verification_status || '|' || p.linkedin_url || '|'
            || (pp.age_confirmed_at IS NOT NULL) || '|' || pp.terms_version
          FROM profiles p JOIN profile_private pp USING (id) WHERE id = '{diana}'""",
          expect="Diana D|DE|incomplete|https://www.linkedin.com/in/diana-d|true|2026-10")
    check("member cannot set their own verification status",
          "UPDATE profile_private SET verification_status = 'approved' WHERE id = auth.uid() RETURNING verification_status",
          as_user=diana, expect="incomplete")
    check("member who hasn't submitted their details cannot post",
          f"INSERT INTO posts (user_id, content) VALUES ('{diana}', 'hi')", as_user=diana, expect="error")
    check("... or message",
          f"INSERT INTO conversations (participant_1, participant_2) VALUES ('{diana}', '{ALICE}')", as_user=diana, expect="error")
    check("... but can edit their profile",
          "UPDATE profiles SET bio = 'Hi' WHERE id = auth.uid() RETURNING bio", as_user=diana, expect="Hi")
    check("member cannot write review fields",
          "UPDATE profile_private SET verification_message = 'ok', submitted_at = now(), terms_version = 'x' "
          "WHERE id = auth.uid() RETURNING (submitted_at IS NULL)::text || verification_message || terms_version",
          as_user=diana, expect="true2026-10")
    check("submit rejects a non-LinkedIn link",
          "SELECT public.submit_verification('Munich', 'DE', 'Munich, Germany', 'https://twitter.com/diana', '', '', NULL)",
          as_user=diana, expect="error")
    check("submit without LinkedIn needs a real explanation",
          "SELECT public.submit_verification('Munich', 'DE', 'Munich, Germany', '', 'student', '', NULL)",
          as_user=diana, expect="error")
    check("submit needs a city and country",
          "SELECT public.submit_verification('', 'XX1', '', 'linkedin.com/in/diana-d', '', '', NULL)",
          as_user=diana, expect="error")
    sign_up(LEGACY, "legacy@example.com", {"full_name": "Lena Legacy"})
    check("submit needs 18+ and the Terms (older accounts)",
          "SELECT public.submit_verification('Berlin', 'DE', 'Berlin, Germany', 'linkedin.com/in/lena', '', '', NULL)",
          as_user=LEGACY, error_has="18 or older")
    check("submit can record 18+ and the current Terms version",
          "SELECT public.submit_verification('Berlin', 'DE', 'Berlin, Germany', 'linkedin.com/in/lena', '', '', NULL, true); "
          "SELECT (age_confirmed_at IS NOT NULL)::text || '|' || terms_version FROM profile_private",
          as_user=LEGACY, expect="pending\ntrue|2026-10")
    check("valid submission moves to pending",
          "SELECT public.submit_verification('Munich', 'de', 'Munich, Germany', 'linkedin.com/in/Diana-D', '', '', 'Engineer at SAP')",
          as_user=diana, expect="pending")
    check("submission stored",
          f"SELECT city || '|' || country_code || '|' || location || '|' || profession FROM profiles WHERE id = '{diana}'",
          expect="Munich|DE|Munich, Germany|Engineer at SAP")
    check("members cannot review", f"SELECT public.review_member('{diana}', 'approved', '', '')", as_user=ALICE, expect="error")
    check("members cannot read the queue", "SELECT count(*) FROM public.admin_verification_queue()", as_user=ALICE, expect="error")
    check("members cannot read the verification history", "SELECT count(*) FROM verification_log", as_user=diana, expect="0")
    check("admin queue shows the applicant with email and duplicate check",
          f"SELECT name || '|' || email || '|' || same_linkedin_count FROM public.admin_verification_queue() WHERE id = '{diana}'",
          as_user=ADMIN, expect="Diana D|diana@example.com|0")
    check("asking for more info needs a message",
          f"SELECT public.review_member('{diana}', 'needs_info', '  ', '')", as_user=ADMIN, expect="error")
    check("admin asks for more info",
          f"SELECT public.review_member('{diana}', 'needs_info', 'Your LinkedIn link does not open.', 'checked twice')",
          as_user=ADMIN, expect="needs_info")
    check("member sees the admin's message and a notification",
          "SELECT (SELECT verification_message FROM profile_private) || '|' || "
          "(SELECT count(*) FROM notifications WHERE type = 'verification')",
          as_user=diana, expect="Your LinkedIn link does not open.|1")
    check("member resubmits",
          "SELECT public.submit_verification('Munich', 'DE', 'Munich, Germany', 'https://www.linkedin.com/in/diana-d/', '', '', NULL)",
          as_user=diana, expect="pending")
    check("admin approves -> Verified badge",
          f"SELECT public.review_member('{diana}', 'approved', '', ''); "
          f"SELECT linkedin_verified::text FROM profiles WHERE id = '{diana}'", as_user=ADMIN, expect="approved\ntrue")
    check("an invalid LinkedIn link is rejected on profile edit",
          "UPDATE profiles SET linkedin_url = 'https://twitter.com/diana' WHERE id = auth.uid()", as_user=diana, expect="error")
    check("changing LinkedIn after approval sends the member back to review",
          "UPDATE profiles SET linkedin_url = 'linkedin.com/in/Someone-Else' WHERE id = auth.uid(); "
          "SELECT (SELECT verification_status FROM profile_private) || '|' || linkedin_verified || '|' || linkedin_url "
          "FROM profiles WHERE id = auth.uid()",
          as_user=diana, expect="pending|false|https://www.linkedin.com/in/someone-else")
    check("editing other fields keeps approval",
          f"SELECT public.review_member('{diana}', 'approved', '', ''); "
          f"UPDATE profiles SET bio = 'Hello' WHERE id = '{diana}'; "
          f"SELECT verification_status FROM profile_private WHERE id = '{diana}'",
          as_user=ADMIN, expect="approved\napproved")
    check("changing name after approval sends the member back to review",
          "UPDATE profiles SET name = 'Diana Other' WHERE id = auth.uid(); "
          "SELECT verification_status FROM profile_private", as_user=diana, expect="pending")
    check("admin approves again", f"SELECT public.review_member('{diana}', 'approved', '', '')", as_user=ADMIN, expect="approved")
    check("only the latest decision waits in the member's notifications",
          "SELECT count(*) FROM notifications WHERE type = 'verification' AND NOT read", as_user=diana, expect="1")
    check("approved member posts",
          f"INSERT INTO posts (id, user_id, content) VALUES ('10000000-0000-0000-0000-000000000004', '{diana}', 'hello') RETURNING 1",
          as_user=diana, expect="1")
    check("admin rejects",
          f"SELECT public.review_member('{diana}', 'rejected', 'We could not verify your identity.', '')",
          as_user=ADMIN, expect="rejected")
    check("rejected member cannot post",
          f"INSERT INTO posts (user_id, content) VALUES ('{diana}', 'hi')", as_user=diana, expect="error")
    check("rejected member cannot edit their posts",
          "UPDATE posts SET content = 'edited' WHERE id = '10000000-0000-0000-0000-000000000004' RETURNING 1",
          as_user=diana, expect="")
    check("rejected member cannot resubmit",
          "SELECT public.submit_verification('Munich', 'DE', 'Munich', 'linkedin.com/in/diana-d', '', '', NULL)",
          as_user=diana, expect="error")
    check("admin sees the full history",
          f"SELECT count(*) FROM verification_log WHERE member_id = '{diana}'", as_user=ADMIN, expect="9")

    # =========================================================================
    # Fixes from the Phase 1 review (migration 20261013000000_review_fixes)
    # =========================================================================

    # --- who can see other members (F2) -------------------------------------
    check("content from other members for the visibility checks", f"""
          INSERT INTO connections (requester_id, recipient_id, status) VALUES
            ('{ALICE}', '{BOB}', 'accepted'), ('{BOB}', '{diana}', 'accepted');
          INSERT INTO comments (post_id, user_id, content) VALUES ('10000000-0000-0000-0000-000000000002', '{BOB}', 'hi alice');
          INSERT INTO likes (post_id, user_id) VALUES ('10000000-0000-0000-0000-000000000002', '{BOB}');
          INSERT INTO doc_comments (doc_id, user_id, content) SELECT id, '{BOB}', 'useful' FROM docs WHERE title = 'Visa guide';
          INSERT INTO events (title, date, location, organizer_id) VALUES ('Cricket', 'Sun', 'Torstr. 12, 10119 Berlin', '{BOB}');
          INSERT INTO marketplace (user_id, title, price) VALUES ('{BOB}', 'Bike', '€80');
          INSERT INTO docs (user_id, title) VALUES ('{BOB}', 'Blue Card');
          INSERT INTO help_requests (user_id, title, description) VALUES ('{BOB}', 'Flat?', 'Looking for a flat')""")
    every_table = f"SELECT bool_and(n::int > 0)::text FROM unnest(string_to_array(({OTHERS}), ',')) n"
    check("an active member sees other members' rows in every table", every_table, as_user=ALICE, expect="true")
    check("an admin sees other members' rows in every table", every_table, as_user=ADMIN, expect="true")
    check("a rejected member sees none of other members' rows", OTHERS, as_user=diana, expect=NONE_OF_OTHERS)
    check("... but still their own profile, posts and connections",
          "SELECT (SELECT count(*) FROM profiles WHERE id = auth.uid()) || '|' || "
          "(SELECT count(*) FROM posts WHERE user_id = auth.uid()) || '|' || (SELECT count(*) FROM connections)",
          as_user=diana, expect="1|1|1")
    check("... and the approved communities (Get verified suggests cities from them)",
          "SELECT (count(*) > 0)::text FROM groups", as_user=diana, expect="true")
    check("... but can't look up other members' contact settings",
          f"SELECT count(*) FROM public.get_member_preferences('{BOB}')", as_user=diana, expect="0")
    check("a blocked member sees none of other members' rows", OTHERS, as_user=CAROL, expect=NONE_OF_OTHERS)
    check("... but still their own post", "SELECT count(*) FROM posts WHERE user_id = auth.uid()", as_user=CAROL, expect="1")
    sign_up(IVAN, "ivan@example.com", {"full_name": "Ivan I", **TERMS})
    check("a member who hasn't submitted their details sees none of other members' rows",
          OTHERS, as_user=IVAN, expect=NONE_OF_OTHERS)
    check("... but sees the approved communities for Get verified",
          "SELECT (count(*) > 0)::text FROM groups", as_user=IVAN, expect="true")

    # --- 18+ and the Terms (F14) --------------------------------------------
    sign_up(RESTORED, "restored@example.com", {"full_name": "Rita Restored"})
    check("a restored member is approved without 18+ and Terms records",
          f"UPDATE profile_private SET verification_status = 'approved' WHERE id = '{RESTORED}' "
          "RETURNING (age_confirmed_at IS NULL AND terms_accepted_at IS NULL)::text", expect="true")
    check("... and can't post until they accept them",
          f"INSERT INTO posts (user_id, content) VALUES ('{RESTORED}', 'hi')", as_user=RESTORED, expect="error")
    check("... or see other members", "SELECT count(*) FROM profiles", as_user=RESTORED, expect="1")
    check("accept_terms refuses an outdated Terms version",
          "SELECT public.accept_terms('2025-01')", as_user=RESTORED, error_has="Terms of Use have been updated")
    check("accept_terms refuses a missing version", "SELECT public.accept_terms(NULL)", as_user=RESTORED, expect="error")
    check("anon cannot call accept_terms", "SELECT public.accept_terms('2026-10')", role="anon", expect="error")
    check("accept_terms records 18+ and the current Terms",
          "SELECT public.accept_terms('2026-10'); SELECT (age_confirmed_at IS NOT NULL)::text || '|' || "
          "(terms_accepted_at IS NOT NULL) || '|' || terms_version FROM profile_private",
          as_user=RESTORED, expect="2026-10\ntrue|true|2026-10")
    check("accepting again keeps the first acceptance date",
          "SELECT public.accept_terms('2026-10'); SELECT (terms_accepted_at < now())::text FROM profile_private",
          as_user=RESTORED, expect="2026-10\ntrue")
    check("members can't backdate or change their acceptance",
          "UPDATE profile_private SET terms_accepted_at = '2020-01-01', terms_version = '2030-01' WHERE id = auth.uid() "
          "RETURNING (terms_accepted_at > '2020-01-01')::text || terms_version", as_user=RESTORED, expect="true2026-10")
    check("once accepted, the member can post and see other members",
          f"INSERT INTO posts (user_id, content) VALUES ('{RESTORED}', 'hello again') RETURNING 1; "
          "SELECT (count(*) > 1)::text FROM profiles", as_user=RESTORED, expect="1\ntrue")

    # --- verification decisions (F5, F6, F31) -------------------------------
    sign_up(GITA, "gita@example.com", {"full_name": "Gita G", **TERMS})
    for decision in ("approved", "needs_info", "pending"):
        check(f"'{decision}' is refused for a member who hasn't submitted their details",
              f"SELECT public.review_member('{GITA}', '{decision}', 'Please add your city and LinkedIn', '')",
              as_user=ADMIN, error_has="hasn't submitted their details")
    check("... so they still can't post",
          f"INSERT INTO posts (user_id, content) VALUES ('{GITA}', 'hi')", as_user=GITA, expect="error")
    check("gita submits", "SELECT public.submit_verification('Pune', 'IN', '', 'linkedin.com/in/gita', '', '', NULL)",
          as_user=GITA, expect="pending")
    check("gita swaps identity while waiting for review",
          "UPDATE profiles SET name = 'Satya Nadella', linkedin_url = 'linkedin.com/in/satyanadella' WHERE id = auth.uid() "
          "RETURNING name", as_user=GITA, expect="Satya Nadella")
    check("approving the details the admin saw is refused",
          f"SELECT public.review_member('{GITA}', 'approved', '', '', 'Gita G', 'https://www.linkedin.com/in/gita')",
          as_user=ADMIN, error_has="This member changed their details. Reload to see the latest.")
    check("... a changed LinkedIn link alone is enough to refuse",
          f"SELECT public.review_member('{GITA}', 'approved', '', '', 'Satya Nadella', 'https://www.linkedin.com/in/gita')",
          as_user=ADMIN, error_has="changed their details")
    check("... so nothing was decided and there's no badge",
          f"SELECT pp.verification_status || '|' || p.linkedin_verified FROM profile_private pp JOIN profiles p USING (id) "
          f"WHERE id = '{GITA}'", expect="pending|false")
    check("... and the change is in the admin's history",
          f"SELECT admin_note FROM verification_log WHERE member_id = '{GITA}' AND admin_note <> ''", as_user=ADMIN,
          expect="Changed their name or LinkedIn while waiting for review. Before: Gita G, https://www.linkedin.com/in/gita.")
    check("approving the details the admin sees now works",
          f"SELECT public.review_member('{GITA}', 'approved', '', '', 'Satya Nadella', 'https://www.linkedin.com/in/satyanadella')",
          as_user=ADMIN, expect="approved")
    check("approving an approved member is refused",
          f"SELECT public.review_member('{GITA}', 'approved', '', '')", as_user=ADMIN, error_has="isn't waiting for review")
    check("asking an approved member for more info is refused",
          f"SELECT public.review_member('{GITA}', 'needs_info', 'More please', '')", as_user=ADMIN,
          error_has="isn't waiting for review")
    check("Move to pending reopens an approved member",
          f"SELECT public.review_member('{GITA}', 'pending', '', '')", as_user=ADMIN, expect="pending")
    check("... and tells them with one unread notification",
          "SELECT text FROM notifications WHERE type = 'verification' AND NOT read", as_user=GITA,
          expect="Your profile is back in review.")
    check("moving a waiting member to pending is refused",
          f"SELECT public.review_member('{GITA}', 'pending', '', '')", as_user=ADMIN, error_has="already waiting")
    check("rejecting works from any status",
          f"SELECT public.review_member('{GITA}', 'rejected', 'We could not verify your profile.', '')",
          as_user=ADMIN, expect="rejected")
    check("approving a rejected member is refused",
          f"SELECT public.review_member('{GITA}', 'approved', '', '')", as_user=ADMIN, error_has="back to pending first")
    check("asking a rejected member for more info is refused",
          f"SELECT public.review_member('{GITA}', 'needs_info', 'More please', '')", as_user=ADMIN,
          error_has="back to pending first")
    check("Undo of a rejection (back to pending) works",
          f"SELECT public.review_member('{GITA}', 'pending', '', 'Undo')", as_user=ADMIN, expect="pending")
    check("... and drops the rejection's moderation record",
          f"SELECT count(*) FROM private.moderation_record WHERE member_id = '{GITA}'", expect="0")
    check("every decision left exactly one unread notification",
          "SELECT count(*) FROM notifications WHERE type = 'verification' AND NOT read", as_user=GITA, expect="1")
    check("rejecting a member who hasn't submitted their details is allowed",
          f"SELECT public.review_member('{IVAN}', 'rejected', 'This looks like a test account.', '')",
          as_user=ADMIN, expect="rejected")
    check("... but moving them to pending is refused (they'd get in without any details)",
          f"SELECT public.review_member('{IVAN}', 'pending', '', '')", as_user=ADMIN,
          error_has="hasn't submitted their details")
    check("the old 4-argument review_member is gone",
          "SELECT count(*) FROM pg_proc WHERE proname = 'review_member'", expect="1")

    # --- a submission and a decision at the same moment (F25) ---------------
    sign_up(HARI, "hari@example.com", {"full_name": "Hari H", **TERMS})
    check("hari submits", "SELECT public.submit_verification('Pune', 'IN', '', 'linkedin.com/in/hari', '', '', NULL)",
          as_user=HARI, expect="pending")
    check("admin asks hari for more info",
          f"SELECT public.review_member('{HARI}', 'needs_info', 'Your link does not open.', '')", as_user=ADMIN,
          expect="needs_info")
    admin = in_background(f"BEGIN; SELECT public.review_member('{HARI}', 'rejected', 'We could not verify you.', ''); "
                          "SELECT pg_sleep(2); COMMIT;", ADMIN)
    time.sleep(1)
    started = time.time()
    check("a resubmission during a rejection waits for it, then is refused",
          "SELECT public.submit_verification('Pune', 'IN', '', 'linkedin.com/in/hari', '', '', NULL)",
          as_user=HARI, error_has="can't be changed right now")
    waited = time.time() - started
    _, admin_err = admin.communicate()
    verdict("... (it waited for the admin's row lock)", waited > 0.5 and not admin_err.strip(),
            f"waited {waited:.2f}s; admin session: {admin_err.strip()[:200]}")
    check("... and the rejection stands",
          f"SELECT verification_status FROM profile_private WHERE id = '{HARI}'", expect="rejected")
    check("admin moves hari back to pending",
          f"SELECT public.review_member('{HARI}', 'pending', '', '')", as_user=ADMIN, expect="pending")
    member = in_background("BEGIN; UPDATE profiles SET name = 'Someone Else' WHERE id = auth.uid(); "
                           "SELECT pg_sleep(2); COMMIT;", HARI)
    time.sleep(1)
    started = time.time()
    check("an approval during a rename waits for it, then is refused",
          f"SELECT public.review_member('{HARI}', 'approved', '', '', 'Hari H', 'https://www.linkedin.com/in/hari')",
          as_user=ADMIN, error_has="changed their details")
    waited = time.time() - started
    _, member_err = member.communicate()
    verdict("... (it waited for the member's row lock)", waited > 0.5 and not member_err.strip(),
            f"waited {waited:.2f}s; member session: {member_err.strip()[:200]}")
    check("... so the new name wasn't approved",
          f"SELECT pp.verification_status || '|' || p.linkedin_verified FROM profile_private pp JOIN profiles p USING (id) "
          f"WHERE id = '{HARI}'", expect="pending|false")

    # --- removed members signing up again (F7) ------------------------------
    sign_up(DAVE, "dave@example.com", {"full_name": "Dave D", **TERMS})
    check("dave submits", "SELECT public.submit_verification('Pune', 'IN', '', 'linkedin.com/in/Dave-Scam', '', '', NULL)",
          as_user=DAVE, expect="pending")
    check("admin rejects dave with a private note",
          f"SELECT public.review_member('{DAVE}', 'rejected', 'We could not verify you.', 'scammer, reported by 3 members')",
          as_user=ADMIN, expect="rejected")
    check("the rejection is kept in a private moderation record",
          "SELECT decision || '|' || admin_note || '|' || (email_hash = encode(sha256('dave@example.com'::bytea), 'hex')) "
          f"|| '|' || linkedin_slug FROM private.moderation_record WHERE member_id = '{DAVE}'",
          expect="rejected|scammer, reported by 3 members|true|dave-scam")
    check("members can't read moderation records", "SELECT count(*) FROM private.moderation_record",
          as_user=ALICE, expect="error")
    check("dave deletes his account", "SELECT public.delete_my_account()", as_user=DAVE)
    check("the moderation record outlives the account",
          f"SELECT count(*) FROM private.moderation_record WHERE member_id = '{DAVE}'", expect="1")
    sign_up(DAVE2, "Dave@Example.com", {"full_name": "Dave D", **TERMS})
    check("signing up again with the same email is flagged",
          f"SELECT review_flag FROM profile_private WHERE id = '{DAVE2}'", expect="previously rejected")
    check("... members can't clear the flag",
          "UPDATE profile_private SET review_flag = '' WHERE id = auth.uid() RETURNING review_flag",
          as_user=DAVE2, expect="previously rejected")
    check("... after submitting they wait for review",
          "SELECT public.submit_verification('Pune', 'IN', '', 'linkedin.com/in/dave-scam', '', '', NULL)",
          as_user=DAVE2, expect="pending")
    check("... without access: no posting",
          f"INSERT INTO posts (user_id, content) VALUES ('{DAVE2}', 'I am back')", as_user=DAVE2, expect="error")
    check("... and no browsing", "SELECT count(*) FROM profiles", as_user=DAVE2, expect="1")
    check("the admin queue shows the flag",
          f"SELECT review_flag FROM public.admin_verification_queue() WHERE id = '{DAVE2}'", as_user=ADMIN,
          expect="previously rejected")
    check("approving clears the flag",
          f"SELECT public.review_member('{DAVE2}', 'approved', '', ''); "
          f"SELECT (review_flag = '')::text FROM profile_private WHERE id = '{DAVE2}'", as_user=ADMIN, expect="approved\ntrue")
    check("... and gives access", f"INSERT INTO posts (user_id, content) VALUES ('{DAVE2}', 'hello') RETURNING 1",
          as_user=DAVE2, expect="1")
    check("Undo of the approval flags them again",
          f"SELECT public.review_member('{DAVE2}', 'pending', '', 'Undo'); "
          f"SELECT review_flag FROM profile_private WHERE id = '{DAVE2}'", as_user=ADMIN, expect="pending\npreviously rejected")
    check("... so they wait for an admin again",
          f"INSERT INTO posts (user_id, content) VALUES ('{DAVE2}', 'still here')", as_user=DAVE2, expect="error")
    check("admin approves dave's new account again",
          f"SELECT public.review_member('{DAVE2}', 'approved', '', '')", as_user=ADMIN, expect="approved")
    sign_up(EVE, "eve@example.com", {"full_name": "Eve E", **TERMS})
    check("another email with the rejected LinkedIn link is flagged at submit",
          "SELECT public.submit_verification('Pune', 'IN', '', 'https://in.linkedin.com/in/dave-scam/', '', '', NULL); "
          "SELECT review_flag FROM profile_private", as_user=EVE, expect="pending\npreviously rejected")
    sign_up(FRANK, "frank@example.com", {"full_name": "Frank F", **TERMS})
    check("frank submits a note instead of LinkedIn",
          "SELECT public.submit_verification('Pune', 'IN', '', '', 'I moved to Pune for work last year.', '', NULL)",
          as_user=FRANK, expect="pending")
    check("adding the rejected LinkedIn link later flags him",
          "UPDATE profiles SET linkedin_url = 'linkedin.com/in/dave-scam' WHERE id = auth.uid(); "
          "SELECT review_flag FROM profile_private", as_user=FRANK, expect="previously rejected")
    check("... and he waits for an admin before posting",
          f"INSERT INTO posts (user_id, content) VALUES ('{FRANK}', 'hi')", as_user=FRANK, expect="error")
    check("admin blocks and unblocks frank",
          f"UPDATE profile_private SET status = 'blocked' WHERE id = '{FRANK}'; "
          f"UPDATE profile_private SET status = 'active' WHERE id = '{FRANK}' RETURNING status", as_user=ADMIN, expect="active")
    check("... which leaves no block record",
          f"SELECT count(*) FROM private.moderation_record WHERE member_id = '{FRANK}'", expect="0")
    check("a member restored as blocked gets a moderation record too", f"""
          ALTER TABLE auth.users DISABLE TRIGGER on_auth_user_created;
          INSERT INTO auth.users (id, email) VALUES ('{RESTORED_BLOCKED}', 'rob@example.com');
          ALTER TABLE auth.users ENABLE TRIGGER on_auth_user_created;
          INSERT INTO profiles (id, name) VALUES ('{RESTORED_BLOCKED}', 'Rob');
          INSERT INTO profile_private (id, email, status) VALUES ('{RESTORED_BLOCKED}', 'rob@example.com', 'blocked');
          SELECT decision FROM private.moderation_record WHERE member_id = '{RESTORED_BLOCKED}'""", expect="blocked")

    # --- blocked members can't submit (F30) ---------------------------------
    sign_up(BO, "bo@example.com", {"full_name": "Bo B", **TERMS})
    check("admin blocks bo before he submits",
          f"UPDATE profile_private SET status = 'blocked' WHERE id = '{BO}' RETURNING status", as_user=ADMIN, expect="blocked")
    check("a blocked member can't submit their details",
          "SELECT public.submit_verification('Pune', 'IN', '', 'linkedin.com/in/bo-b', '', '', NULL)",
          as_user=BO, error_has="has been blocked")
    check("... so they don't enter the review queue",
          f"SELECT verification_status FROM profile_private WHERE id = '{BO}'", expect="incomplete")

    # --- the server sets dates, previews and organiser names (F10, F21) -----
    made_up_dates = [
        ("posts", "INSERT INTO posts (user_id, content, created_at, updated_at) VALUES "
                  "(auth.uid(), 'from the future', '2099-01-01', '2099-01-01') RETURNING (created_at = now() AND updated_at = now())::text"),
        ("comments", f"INSERT INTO comments (post_id, user_id, content, created_at) VALUES "
                     f"('{BOB_POST}', auth.uid(), 'old news', '1999-01-01') RETURNING (created_at = now())::text"),
        ("likes", f"INSERT INTO likes (post_id, user_id, created_at) VALUES "
                  f"('{BOB_POST}', auth.uid(), '2099-01-01') RETURNING (created_at = now())::text"),
        ("connections", f"INSERT INTO connections (requester_id, recipient_id, created_at) VALUES "
                        f"(auth.uid(), '{GITA}', '2099-01-01') RETURNING (created_at = now())::text"),
        ("groups", "INSERT INTO groups (name, created_by, created_at) VALUES "
                   "('Indians in Futureville', auth.uid(), '2099-01-01') RETURNING (created_at = now())::text"),
        ("group_members", "INSERT INTO group_members (group_id, user_id, joined_at) SELECT id, auth.uid(), '2099-01-01' "
                          "FROM groups WHERE name = 'Indians in Testville' RETURNING (joined_at = now())::text"),
        ("events", "INSERT INTO events (title, date, organizer_id, created_at) VALUES "
                   "('Garba night', 'Oct 20, 2026', auth.uid(), '2099-01-01') RETURNING (created_at = now())::text"),
        ("event_rsvps", "INSERT INTO event_rsvps (event_id, user_id, created_at) VALUES "
                        "('40000000-0000-0000-0000-000000000001', auth.uid(), '2099-01-01') RETURNING (created_at = now())::text"),
        ("marketplace", "INSERT INTO marketplace (user_id, title, price, created_at) VALUES "
                        "(auth.uid(), 'Desk', '€20', '2099-01-01') RETURNING (created_at = now())::text"),
        ("docs", "INSERT INTO docs (user_id, title, created_at) VALUES "
                 "(auth.uid(), 'Anmeldung', '2099-01-01') RETURNING (created_at = now())::text"),
        ("doc_comments", "INSERT INTO doc_comments (doc_id, user_id, content, created_at) SELECT id, auth.uid(), 'thanks', "
                         "'2099-01-01' FROM docs WHERE title = 'Visa guide' RETURNING (created_at = now())::text"),
        ("help_requests", "INSERT INTO help_requests (user_id, title, description, created_at) VALUES "
                          "(auth.uid(), 'Tax?', 'How?', '2099-01-01') RETURNING (created_at = now())::text"),
        ("help_responses", "INSERT INTO help_responses (request_id, user_id, content, created_at) VALUES "
                           "('50000000-0000-0000-0000-000000000001', auth.uid(), 'Ask Bob', '2099-01-01') "
                           "RETURNING (created_at = now())::text"),
        ("reports", f"INSERT INTO reports (reporter_id, reported_post_id, reason, created_at) VALUES "
                    f"(auth.uid(), '{BOB_POST}', '[POST] test', '2099-01-01') RETURNING (created_at = now())::text"),
        ("blocks", f"INSERT INTO blocks (blocker_id, blocked_id, created_at) VALUES "
                   f"(auth.uid(), '{LEGACY}', '2099-01-01') RETURNING (created_at = now())::text"),
    ]
    for table, sql in made_up_dates:
        check(f"{table}: a made-up date is replaced by the server's", sql, as_user=ALICE, expect="true")
    check("notifications: a made-up date is replaced by the server's",
          f"INSERT INTO notifications (user_id, type, actor_id, text, reference_id, created_at) VALUES "
          f"('{BOB}', 'comment', '{ALICE}', 'Alice commented', '{BOB_POST}', '2099-01-01')", as_user=ALICE)
    check("... (checked)", f"SELECT (max(created_at) <= now())::text FROM notifications WHERE user_id = '{BOB}'", expect="true")
    check("a conversation can't start with a 10 MB preview dated 2999",
          f"INSERT INTO conversations (id, participant_1, participant_2, last_message_text, last_message_at, created_at) "
          f"VALUES ('{CONVO2}', auth.uid(), '{GITA}', repeat('x', 10000000), '2999-01-01', '2999-01-01') "
          "RETURNING (last_message_text = '' AND last_message_at = now() AND created_at = now())::text",
          as_user=ALICE, expect="true")
    check("messages start unread, with the server's date",
          f"INSERT INTO messages (conversation_id, sender_id, content, read, created_at) VALUES "
          f"('{CONVO2}', auth.uid(), repeat('y', 600), true, '1999-01-01') RETURNING (NOT read AND created_at = now())::text",
          as_user=ALICE, expect="true")
    check("the preview is the start of the last message",
          f"SELECT char_length(last_message_text) FROM conversations WHERE id = '{CONVO2}'", as_user=GITA, expect="500")
    check("a preview longer than 500 characters is refused",
          f"UPDATE conversations SET last_message_text = repeat('x', 501) WHERE id = '{CONVO2}'", expect="error")
    check("members can't delete a conversation",
          f"DELETE FROM conversations WHERE id = '{CONVO2}' RETURNING 1", as_user=GITA, expect="")
    check("admins can't read the messages in it",
          f"SELECT count(*) FROM messages WHERE conversation_id = '{CONVO2}'", as_user=ADMIN, expect="0")
    check("admins can't see who talks to whom",
          f"SELECT count(*) FROM conversations WHERE id = '{CONVO2}'", as_user=ADMIN, expect="0")
    check("admins can't delete a conversation through the API",
          f"DELETE FROM conversations WHERE id = '{CONVO2}' RETURNING 1", as_user=ADMIN, expect="")
    check("an event shows the organiser's own name",
          "INSERT INTO events (id, title, date, organizer_id, organizer_name) VALUES "
          "('40000000-0000-0000-0000-000000000003', 'Holi', 'Mar 2027', auth.uid(), 'NRIClub Team') RETURNING organizer_name",
          as_user=ALICE, expect="Alice Updated")
    check("... also when the event is edited",
          "UPDATE events SET organizer_name = 'NRIClub Team' WHERE id = '40000000-0000-0000-0000-000000000003' "
          "RETURNING organizer_name", as_user=ALICE, expect="Alice Updated")
    check("admins can still name the host",
          "INSERT INTO events (title, date, organizer_id, organizer_name) VALUES "
          "('Diwali Mela', 'Nov 2026', auth.uid(), 'NRIClub Team') RETURNING organizer_name",
          as_user=ADMIN, expect="NRIClub Team")

    # --- notifications must be about something real (F22) -------------------
    check("'message' notifications are refused",
          f"INSERT INTO notifications (user_id, type, actor_id, text) VALUES ('{BOB}', 'message', '{ALICE}', 'Cheap followers!')",
          as_user=ALICE, expect="error")
    check("a like notification without a post is refused",
          f"INSERT INTO notifications (user_id, type, actor_id, text) VALUES ('{BOB}', 'like', '{ALICE}', 'Free text')",
          as_user=ALICE, expect="error")
    check("a like notification about someone else's post is refused",
          f"INSERT INTO notifications (user_id, type, actor_id, text, reference_id) VALUES "
          f"('{BOB}', 'like', '{ALICE}', 'Free text', '10000000-0000-0000-0000-000000000002')", as_user=ALICE, expect="error")
    check("a comment notification about a made-up id is refused",
          f"INSERT INTO notifications (user_id, type, actor_id, text, reference_id) VALUES "
          f"('{BOB}', 'comment', '{ALICE}', 'Free text', gen_random_uuid())", as_user=ALICE, expect="error")
    check("a comment notification about the recipient's post works",
          f"INSERT INTO notifications (user_id, type, actor_id, text, reference_id) VALUES "
          f"('{BOB}', 'comment', '{ALICE}', 'Alice commented', '{BOB_POST}')", as_user=ALICE)
    check("a Namaste notification about the matching request works",
          f"INSERT INTO connections (id, requester_id, recipient_id) VALUES ('20000000-0000-0000-0000-000000000009', auth.uid(), '{DAVE2}'); "
          f"INSERT INTO notifications (user_id, type, actor_id, text, reference_id) VALUES "
          f"('{DAVE2}', 'request', '{ALICE}', 'Alice sent you a Namaste request', '20000000-0000-0000-0000-000000000009')",
          as_user=ALICE)

    # --- image links must be the member's own uploads (F23) ------------------
    def set_avatar(url):
        return f"UPDATE profiles SET avatar_url = '{url}' WHERE id = auth.uid() RETURNING avatar_url"
    check("an avatar from another site is refused", set_avatar("https://tracker.example/pixel.png"),
          as_user=ALICE, error_has="upload the photo")
    check("an avatar in someone else's folder is refused", set_avatar(f"{STORE}/avatars/{BOB}/a.png"),
          as_user=ALICE, expect="error")
    check("an avatar from another bucket is refused", set_avatar(f"{STORE}/post-images/{ALICE}/a.png"),
          as_user=ALICE, expect="error")
    check("a link that climbs out of the folder is refused", set_avatar(f"{STORE}/avatars/{ALICE}/../{BOB}/a.png"),
          as_user=ALICE, expect="error")
    check("... also when the dots are encoded", set_avatar(f"{STORE}/avatars/{ALICE}/%2E%2E/{BOB}/a.png"),
          as_user=ALICE, expect="error")
    check("an avatar in the member's own folder works", set_avatar(f"{STORE}/avatars/{ALICE}/avatar_1.png?t=1"),
          as_user=ALICE, expect=f"{STORE}/avatars/{ALICE}/avatar_1.png?t=1")
    check("a post image from another site is refused",
          "INSERT INTO posts (user_id, content, image_url) VALUES (auth.uid(), 'pic', 'https://tracker.example/p.png')",
          as_user=ALICE, expect="error")
    check("a post image upload works",
          f"INSERT INTO posts (user_id, content, image_url) VALUES (auth.uid(), 'pic', '{STORE}/post-images/{ALICE}/1.png') "
          "RETURNING 1", as_user=ALICE, expect="1")
    check("an event photo from another site is refused",
          "UPDATE events SET image_url = 'https://tracker.example/e.png' WHERE id = '40000000-0000-0000-0000-000000000003'",
          as_user=ALICE, expect="error")
    check("an event photo upload works",
          f"UPDATE events SET image_url = '{STORE}/post-images/{ALICE}/2.png' WHERE id = '40000000-0000-0000-0000-000000000003' "
          "RETURNING 1", as_user=ALICE, expect="1")
    own_photo = f"{STORE}/marketplace-images/{ALICE}"
    for label, photos in [("an outside link", '["https://tracker.example/x.png"]'),
                          ("one outside link among uploads", f'["{own_photo}/1.png", "https://tracker.example/x.png"]'),
                          ("a single link instead of a list", f"{own_photo}/1.png"),
                          ("a list of numbers", "[1]"),
                          ("a JSON object", '{"url": "x"}'),
                          ("text that isn't JSON", "not json")]:
        check(f"listing photos: {label} is refused",
              f"INSERT INTO marketplace (user_id, title, price, image_url) VALUES (auth.uid(), 'Lamp', '€5', '{photos}')",
              as_user=ALICE, expect="error")
    for label, photos in [("no photos", "[]"), ("uploads", f'["{own_photo}/1.png", "{own_photo}/2.png"]')]:
        check(f"listing photos: {label} work",
              f"INSERT INTO marketplace (user_id, title, price, image_url) VALUES (auth.uid(), 'Lamp', '€5', '{photos}') "
              "RETURNING 1", as_user=ALICE, expect="1")
    check("set this project's Storage address",
          "INSERT INTO private.app_config (key, value) VALUES "
          "('storage_public_url', 'https://myproject.supabase.co/storage/v1/object/public/')")
    check("then another Supabase project's link is refused",
          set_avatar(f"https://otherproject.supabase.co/storage/v1/object/public/avatars/{ALICE}/a.png"),
          as_user=ALICE, expect="error")
    check("... and this project's link works",
          set_avatar(f"https://myproject.supabase.co/storage/v1/object/public/avatars/{ALICE}/a.png"),
          as_user=ALICE, expect=f"https://myproject.supabase.co/storage/v1/object/public/avatars/{ALICE}/a.png")
    check("admins can't link outside images either",
          "UPDATE profiles SET avatar_url = 'https://tracker.example/a.png' WHERE id = auth.uid()", as_user=ADMIN, expect="error")
    check("removing a photo always works", "UPDATE profiles SET avatar_url = '' WHERE id = auth.uid() "
          "RETURNING (avatar_url = '')::text", as_user=ALICE, expect="true")
    check("members can't read or change the database settings",
          "SELECT count(*) FROM private.app_config", as_user=ALICE, expect="error")
    check("unset the Storage address", "DELETE FROM private.app_config")
    check("an older outside link is kept and the member can still edit their profile",
          f"UPDATE profiles SET avatar_url = 'https://legacy.example/a.png' WHERE id = '{ALICE}'; "
          "SELECT 1", expect="1")
    check("... (checked)", "UPDATE profiles SET bio = 'Still here' WHERE id = auth.uid() RETURNING avatar_url",
          as_user=ALICE, expect="https://legacy.example/a.png")

    # --- accounts without a name (F24) -------------------------------------
    sign_up(NONAME, "priya.sharma83@example.com", {})
    check("an account created without a name gets an empty name, not part of the email",
          f"SELECT (name = '')::text FROM profiles WHERE id = '{NONAME}'", expect="true")

    # --- marketing consent has one home (F18) -------------------------------
    check("user_settings.marketing_emails is marked as no longer used",
          "SELECT (col_description('public.user_settings'::regclass, attnum) LIKE 'Deprecated%')::text "
          "FROM pg_attribute WHERE attrelid = 'public.user_settings'::regclass AND attname = 'marketing_emails'",
          expect="true")
    check("members set their marketing consent in profile_private",
          "UPDATE profile_private SET marketing_consent = true WHERE id = auth.uid() RETURNING marketing_consent::text",
          as_user=ALICE, expect="true")

    # --- Download my data (F16) ---------------------------------------------
    check("the export covers every kind of the member's data",
          "SELECT string_agg(k, ',' ORDER BY k) FROM jsonb_object_keys(public.export_my_data()) k", as_user=ALICE,
          expect="blocks,comments,connections,conversations,doc_comments,docs,event_rsvps,events_organised,exported_at,"
                 "group_memberships,groups_requested,help_requests,help_responses,likes,marketplace_listings,messages,"
                 "notifications,posts,profile,profile_private,reports_filed,user_settings,verification_log")
    check("... with the member's profile, private details and rows of each kind",
          "SELECT concat_ws('|', d->'profile'->>'name', d->'profile_private'->>'email', d->'profile_private'->>'terms_version', "
          "d->'profile_private'->>'marketing_consent', (SELECT bool_and(jsonb_array_length(v) > 0)::text FROM jsonb_each(d) e(k, v) "
          "WHERE jsonb_typeof(v) = 'array' AND k <> 'verification_log')) FROM (SELECT public.export_my_data() d) x",
          as_user=ALICE, expect="Alice Updated|alice@example.com|2026-10|true|true")
    check("... and only the member's own rows",
          "SELECT (bool_and(p->>'user_id' = auth.uid()::text) AND position('bob2@example.com' IN public.export_my_data()::text) = 0)::text "
          "FROM jsonb_array_elements(public.export_my_data()->'posts') p", as_user=ALICE, expect="true")
    check("the verification history has decisions and messages, not the admins' notes",
          "SELECT jsonb_array_length(d->'verification_log') || '|' || "
          "(SELECT string_agg(k, ',' ORDER BY k) FROM jsonb_object_keys(d->'verification_log'->0) k) || '|' || "
          "(position('checked twice' IN d::text) = 0) || '|' || (position('Your LinkedIn link does not open.' IN d::text) > 0) "
          "FROM (SELECT public.export_my_data() d) x", as_user=diana, expect="9|created_at,decision,member_message|true|true")
    check("blocked members can download their data too",
          "SELECT (public.export_my_data()->'profile'->>'id' = auth.uid()::text)::text", as_user=CAROL, expect="true")
    check("anon cannot call export_my_data", "SELECT public.export_my_data()", role="anon", expect="error")

    # --- the review queue beyond 1,000 members (F13) -------------------------
    check("unfinished sign-ups are listed newest first",
          "SELECT (count(*) >= 2 AND array_agg(created_at ORDER BY ordinality) = array_agg(created_at ORDER BY created_at DESC))::text "
          "FROM public.admin_verification_queue(ARRAY['incomplete']) WITH ORDINALITY", as_user=ADMIN, expect="true")

    # --- account deletion ---------------------------------------------------
    check("delete_my_account removes auth user and data",
          "SELECT public.delete_my_account()", as_user=CAROL)
    check("carol gone everywhere",
          f"SELECT (SELECT count(*) FROM auth.users WHERE id = '{CAROL}') + (SELECT count(*) FROM profiles WHERE id = '{CAROL}') + "
          f"(SELECT count(*) FROM reports WHERE reporter_id = '{CAROL}')", expect="0")
    sign_up(CAROL2, "carol@example.com", {"full_name": "Carol C", **TERMS})
    check("signing up again after a block is flagged",
          f"SELECT review_flag FROM profile_private WHERE id = '{CAROL2}'", expect="previously blocked")

    print(f"\n{len(failures)} failure(s)")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
