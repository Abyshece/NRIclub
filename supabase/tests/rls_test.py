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

DSN = sys.argv[1] if len(sys.argv) > 1 else "dbname=nriclub_test user=postgres"

ALICE = "00000000-0000-0000-0000-00000000000a"
BOB = "00000000-0000-0000-0000-00000000000b"
CAROL = "00000000-0000-0000-0000-00000000000c"
ADMIN = "00000000-0000-0000-0000-0000000000ad"

failures = []


def psql(sql, role=None, uid=None):
    prelude = ""
    if role:
        claims = json.dumps({"sub": uid, "role": role} if uid else {"role": role})
        prelude = f"SET ROLE {role}; SELECT set_config('request.jwt.claims', '{claims}', false);\n"
    proc = subprocess.run(
        ["psql", DSN, "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", "-c", prelude + sql],
        capture_output=True, text=True,
    )
    lines = [l for l in proc.stdout.strip().splitlines() if l != ""]
    if role:
        lines = lines[1:]  # drop set_config's output
    return proc.returncode == 0, "\n".join(lines), proc.stderr.strip()


def check(name, sql, as_user=None, expect="ok", role="authenticated"):
    """expect: 'ok', 'error', or the exact text the last statement prints."""
    if as_user is None and role == "authenticated":
        role = None  # run as the table owner (setup / inspection)
    ok, out, err = psql(sql, role, as_user)
    if expect == "error":
        passed = not ok
    elif expect == "ok":
        passed = ok
    else:
        passed = ok and out == expect
    print(("PASS " if passed else "FAIL ") + name)
    if not passed:
        failures.append(name)
        print(f"     expected: {expect!r}\n     got ok={ok} out={out!r}\n     err={err[:300]}")


def setup():
    ok, _, err = psql(f"""
      INSERT INTO auth.users (id, email, raw_user_meta_data, email_confirmed_at) VALUES
        ('{ALICE}', 'alice@example.com', '{{"full_name": "Alice A", "location": "Berlin, Germany", "hometown": "Pune", "profession": "Engineer", "occupation_status": "Student", "years_abroad": "1-3 years", "linkedin_url": "https://linkedin.com/in/alice", "gdpr_consent": true, "marketing_consent": false}}', now()),
        ('{BOB}', 'bob@example.com', '{{"full_name": "Bob B"}}', now()),
        ('{CAROL}', 'carol@example.com', '{{"full_name": "Carol C"}}', NULL),
        ('{ADMIN}', 'admin@example.com', '{{"full_name": "Admin"}}', now());
      INSERT INTO public.admins (user_id) VALUES ('{ADMIN}');
    """)
    if not ok:
        sys.exit("setup failed: " + err)


def main():
    setup()

    # --- signup trigger -----------------------------------------------------
    check("signup trigger fills profile from metadata",
          f"SELECT name || '|' || location || '|' || occupation_status || '|' || linkedin_url || '|' || email_verified FROM profiles WHERE id = '{ALICE}'",
          expect="Alice A|Berlin, Germany|Student|https://linkedin.com/in/alice|true")
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
    check("member cannot self-verify / unblock / fake email_verified",
          "UPDATE profiles SET linkedin_verified = true, status = 'active', email_verified = true WHERE id = auth.uid() "
          "RETURNING linkedin_verified::text || status", as_user=CAROL, expect="falseactive")
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
    check("admin can approve a member",
          f"UPDATE profiles SET linkedin_verified = true WHERE id = '{BOB}' RETURNING linkedin_verified::text",
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
          f"INSERT INTO notifications (user_id, type, actor_id, text) VALUES ('{BOB}', 'like', '{ALICE}', 'Alice liked your post')",
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
          f"INSERT INTO notifications (user_id, type, actor_id, text, read) VALUES ('{BOB}', 'like', '{ALICE}', 'Alice liked your post', true)",
          as_user=ALICE)
    check("read flag forced false on insert",
          f"SELECT read::text FROM notifications WHERE user_id = '{BOB}'", expect="false")
    check("cannot spoof the actor",
          f"INSERT INTO notifications (user_id, type, actor_id, text) VALUES ('{BOB}', 'like', '{CAROL}', 'Carol liked')",
          as_user=ALICE, expect="error")
    check("cannot send actorless notifications",
          f"INSERT INTO notifications (user_id, type, text) VALUES ('{BOB}', 'group', 'Your group was approved')",
          as_user=ALICE, expect="error")
    check("Namaste notification needs a matching pending request",
          f"INSERT INTO notifications (user_id, type, actor_id, text) VALUES ('{BOB}', 'request', '{ALICE}', 'Alice sent you a Namaste')",
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
    check("admin blocks carol", f"UPDATE profiles SET status = 'blocked' WHERE id = '{CAROL}' RETURNING status", as_user=ADMIN, expect="blocked")
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
    check("blocked member can still edit profile",
          "UPDATE profiles SET linkedin_url = 'https://linkedin.com/in/carol' WHERE id = auth.uid() RETURNING status",
          as_user=CAROL, expect="blocked")
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

    # --- account deletion ---------------------------------------------------
    check("delete_my_account removes auth user and data",
          "SELECT public.delete_my_account()", as_user=CAROL)
    check("carol gone everywhere",
          f"SELECT (SELECT count(*) FROM auth.users WHERE id = '{CAROL}') + (SELECT count(*) FROM profiles WHERE id = '{CAROL}') + "
          f"(SELECT count(*) FROM reports WHERE reporter_id = '{CAROL}')", expect="0")

    print(f"\n{len(failures)} failure(s)")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
