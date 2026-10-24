#!/usr/bin/env python3
"""Row-level-security tests for the NRIclub schema.

Runs against a plain PostgreSQL database that has the Supabase stand-in
(supabase/tests/supabase_stub.sql) and the migrations applied. Each check runs
as the API role a real request would use (anon or authenticated + JWT claims).

    python3 supabase/tests/rls_test.py "host=/var/run/postgresql port=5432 dbname=nriclub_test user=postgres"
"""
import json
import os
import re
import subprocess
import sys
import time

DSN = sys.argv[1] if len(sys.argv) > 1 else "dbname=nriclub_test user=postgres"
REVIEW_FIXES = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "migrations",
                            "20261013000000_review_fixes.sql")
ACCESS_CONSENT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "migrations",
                              "20261019000000_access_consent.sql")
NOTIFICATIONS_LIMITS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "migrations",
                                    "20261020000000_notifications_limits_privacy.sql")
MODERATION = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "migrations",
                          "20261021000000_moderation_dsa.sql")
STORAGE_IMAGES = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "migrations",
                              "20261022000000_storage_images.sql")
ADMIN_ACCESS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "migrations",
                            "20261023000000_admin_access.sql")
AMBASSADORS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "migrations",
                           "20261024000000_ambassador_applications.sql")
MEMBER_FIXES = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "migrations",
                            "20261025000000_member_fixes.sql")
ADMIN_TOOLS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "migrations",
                           "20261025100000_admin_tools.sql")
TRAVEL_BOARD = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "migrations",
                            "20261026000000_travel_board.sql")
AMBASSADOR_PANEL = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "migrations",
                                "20261027000000_ambassador_panel.sql")

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
MALLORY = "00000000-0000-0000-0000-0000000000f0"
MALLORY2 = "00000000-0000-0000-0000-0000000000f1"
PRIYA = "00000000-0000-0000-0000-0000000000f2"
SQUATTED = "00000000-0000-0000-0000-0000000000f3"
DAVE_PLUS = "00000000-0000-0000-0000-0000000000f4"
ENCODED = "00000000-0000-0000-0000-0000000000f5"
PROBE = "00000000-0000-0000-0000-0000000000f6"
OLGA = "00000000-0000-0000-0000-0000000000f7"
TROLL = "00000000-0000-0000-0000-0000000000f8"
VICTIM = "00000000-0000-0000-0000-0000000000f9"
BAD = "00000000-0000-0000-0000-0000000000fa"
HAL = "00000000-0000-0000-0000-0000000000fb"
SPAMMER = "00000000-0000-0000-0000-0000000000fc"
ANITA = "00000000-0000-0000-0000-0000000000fd"
PLANTED = "00000000-0000-0000-0000-0000000000fe"
ROGUE = "00000000-0000-0000-0000-0000000000ff"
ROGUE2 = "00000000-0000-0000-0000-0000000001a1"
JOSE1 = "00000000-0000-0000-0000-000000000201"
JOSE2 = "00000000-0000-0000-0000-000000000202"
JOSE3 = "00000000-0000-0000-0000-000000000203"
CONVO2 = "30000000-0000-0000-0000-000000000002"
TERMS_VERSION = "2026-10-23"
ART9_VERSION = "2026-10-19"  # of the Art. 9 consent wording
WAIT = "00000000-0000-0000-0000-000000000301"
WAIT2 = "00000000-0000-0000-0000-000000000302"
AMBA = "00000000-0000-0000-0000-000000000303"
STORE = "https://abcdefgh.supabase.co/storage/v1/object/public"
BOB_POST = "10000000-0000-0000-0000-000000000005"

failures = []


def psql_args(sql, role=None, uid=None, claims=None):
    """claims: more JWT claims for the request, e.g. {"aal": "aal2"}."""
    prelude = ""
    if role:
        claims = json.dumps({**({"sub": uid, "role": role} if uid else {"role": role}), **(claims or {})})
        prelude = f"SET ROLE {role}; SELECT set_config('request.jwt.claims', '{claims}', false);\n"
    return ["psql", DSN, "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", "-c", prelude + sql]


def psql(sql, role=None, uid=None, claims=None):
    proc = subprocess.run(psql_args(sql, role, uid, claims), capture_output=True, text=True)
    lines = [l for l in proc.stdout.strip().splitlines() if l != ""]
    if role:
        lines = lines[1:]  # drop set_config's output
    return proc.returncode == 0, "\n".join(lines), proc.stderr.strip()


def check(name, sql, as_user=None, expect="ok", role="authenticated", error_has=None, claims=None):
    """expect: 'ok', 'error', or the exact text the last statement prints.
    error_has: the call must fail with this text in the error. claims: more
    JWT claims, e.g. {"aal": "aal2"} for a session signed in with the code."""
    if as_user is None and role == "authenticated":
        role = None  # run as the table owner (setup / inspection)
    ok, out, err = psql(sql, role, as_user, claims)
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


def sign_up(uid, email, meta, accept_terms=False, confirmed=True):
    """A new auth user, as Supabase Auth would create it (the trigger does the
    rest). accept_terms: then they confirm 18+, accept the Terms and give the
    Art. 9 consent, as the site does once the email code is confirmed (the
    signup data can't)."""
    ok, _, err = psql(f"INSERT INTO auth.users (id, email, raw_user_meta_data, email_confirmed_at) "
                      f"VALUES ('{uid}', '{email}', '{json.dumps(meta)}', {'now()' if confirmed else 'NULL'})")
    if not ok:
        sys.exit(f"sign-up of {email} failed: {err}")
    if accept_terms:
        ok, _, err = psql(f"SELECT public.accept_terms('{TERMS_VERSION}', true)", "authenticated", uid)
        if not ok:
            sys.exit(f"accept_terms for {email} failed: {err}")


def moderate(kind, target, action, ground="terms", rule="Spam, scams or advertising (§ 6)",
             facts="it sent the same advert to many members", reports=None, urgent=None, notice=None, member=None):
    """A call of public.admin_moderate (migration 20261021000000), the way the
    admin panel makes it."""
    args = [f"p_kind => '{kind}'", f"p_id => '{target}'", f"p_action => '{action}'"]
    if action != "unblock":
        args += [f"p_ground => '{ground}'", f"p_rule => '{rule}'", f"p_explanation => '{facts}'"]
    if reports:
        args.append("p_report_ids => ARRAY[" + ", ".join(f"'{r}'::uuid" for r in reports) + "]")
    if urgent:
        args.append(f"p_urgent => '{urgent}'")
    if notice:
        args.append(f"p_notice => '{notice}'")
    if member:
        args.append(f"p_member => '{member}'")
    return f"public.admin_moderate({', '.join(args)})"


def block(uid, urgent="fraud"):
    """An admin blocks a member straight away (a serious case), then the
    member's status is read."""
    return f"DO $$BEGIN PERFORM {moderate('member', uid, 'block', urgent=urgent)}; END$$; " \
           f"SELECT status FROM profile_private WHERE id = '{uid}'"


def unblock(uid):
    return f"DO $$BEGIN PERFORM {moderate('member', uid, 'unblock')}; END$$; " \
           f"SELECT status FROM profile_private WHERE id = '{uid}'"


def migration_section(banner, path=REVIEW_FIXES):
    """A migration (the review fixes unless given) from its '-- <banner>'
    heading to the end."""
    with open(path, encoding="utf-8") as f:
        text = f.read()
    return text[text.index(f"-- {banner}\n"):]


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
      -- The signup trigger only takes the name and country from metadata, so
      -- Alice's other details are filled in the way the profile form would.
      UPDATE public.profiles SET location = 'Berlin, Germany', hometown = 'Pune', profession = 'Engineer',
        occupation_status = 'Student', years_abroad = '1-3 years', linkedin_url = 'https://www.linkedin.com/in/alice'
        WHERE id = '{ALICE}';
      -- Alice, Bob and Carol have submitted their verification details and
      -- wait for review (an admin approves them below); the admin is
      -- approved.
      UPDATE public.profile_private SET verification_status = 'pending', submitted_at = now()
        WHERE id IN ('{ALICE}', '{BOB}', '{CAROL}');
      UPDATE public.profile_private SET verification_status = 'approved' WHERE id = '{ADMIN}';
    """)
    if not ok:
        sys.exit("setup failed: " + err)
    # All four confirm 18+, accept the Terms and give the Art. 9 consent.
    for uid in (ALICE, BOB, CAROL, ADMIN):
        ok, _, err = psql(f"SELECT public.accept_terms('{TERMS_VERSION}', true)", "authenticated", uid)
        if not ok:
            sys.exit("setup failed: " + err)


def main():
    setup()

    # --- signup trigger -----------------------------------------------------
    check("signup trigger takes only the name and country from metadata",
          f"""INSERT INTO auth.users (id, email, raw_user_meta_data, email_confirmed_at) VALUES
            ('00000000-0000-0000-0000-0000000000e9', 'meta@example.com',
             '{{"full_name": "Meta M", "country_code": "fr", "location": "Paris", "hometown": "Pune", "profession": "Spy",
               "occupation_status": "Student", "years_abroad": "1-3 years", "linkedin_url": "linkedin.com/in/squatter"}}', now());
          SELECT name || '|' || country_code || '|' || location || '|' || hometown || '|' || profession || '|'
            || occupation_status || '|' || years_abroad || '|' || linkedin_url || '|' || email_verified
          FROM profiles WHERE id = '00000000-0000-0000-0000-0000000000e9';
          DELETE FROM auth.users WHERE id = '00000000-0000-0000-0000-0000000000e9'""",
          expect="Meta M|FR|||||||true")
    check("... and no consent, 18+ or Terms record from it (Q3, C8)",
          f"""INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
            ('{PLANTED}', 'planted@example.com',
             '{{"full_name": "Mallory M", "art9_consent": true, "art9_consent_at": "2026-01-01", "age_confirmed": true,
               "terms_version": "{TERMS_VERSION}"}}');
          SELECT concat_ws('|', art9_consent_at IS NULL, art9_consent_version IS NULL, age_confirmed_at IS NULL,
            terms_accepted_at IS NULL, terms_version IS NULL,
            (SELECT count(*) FROM terms_acceptances WHERE member_id = '{PLANTED}'))
          FROM profile_private WHERE id = '{PLANTED}';
          DELETE FROM auth.users WHERE id = '{PLANTED}'""",
          expect="t|t|t|t|t|0")
    check("signup trigger stores the name and email confirmation",
          f"SELECT name || '|' || location || '|' || occupation_status || '|' || linkedin_url || '|' || email_verified FROM profiles WHERE id = '{ALICE}'",
          expect="Alice A|Berlin, Germany|Student|https://www.linkedin.com/in/alice|true")
    check("signup trigger stores the email privately",
          f"SELECT email FROM profile_private WHERE id = '{ALICE}'", expect="alice@example.com")
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
    check("admins can't change a member's status directly (C23)",
          f"UPDATE profile_private SET verification_status = 'approved', status = 'blocked' WHERE id = '{BOB}' "
          "RETURNING 1", as_user=ADMIN, expect="")
    check("... nor their profile", f"UPDATE profiles SET name = 'Bobby', avatar_url = '' WHERE id = '{BOB}' RETURNING 1",
          as_user=ADMIN, expect="")
    check("admin approves a member (review_member) -> Verified badge",
          f"SELECT public.review_member('{BOB}', 'approved', '', ''); "
          f"SELECT linkedin_verified::text FROM profiles WHERE id = '{BOB}'",
          as_user=ADMIN, expect="approved\ntrue")
    check("admin approves alice and carol too",
          f"SELECT public.review_member('{ALICE}', 'approved', '', ''); SELECT public.review_member('{CAROL}', 'approved', '', '')",
          as_user=ADMIN, expect="approved\napproved")
    # (Their "You're verified" notifications aren't part of the checks below.)
    psql("DELETE FROM notifications WHERE type = 'verification'")
    check("profiles cannot be deleted via the API",
          "DELETE FROM profiles WHERE id = auth.uid() RETURNING id", as_user=ALICE, expect="")

    # --- auth sync ----------------------------------------------------------
    check("confirming email flips email_verified",
          f"UPDATE auth.users SET email_confirmed_at = now() WHERE id = '{CAROL}'; "
          f"SELECT email_verified::text FROM profiles WHERE id = '{CAROL}'", expect="true")
    check("email change syncs to profile_private",
          f"UPDATE auth.users SET email = 'bob2@example.com' WHERE id = '{BOB}'; "
          f"SELECT email FROM profile_private WHERE id = '{BOB}'", expect="bob2@example.com")
    check("members can't set, backdate or reword their Art. 9 consent (C8)",
          "UPDATE profile_private SET art9_consent_at = '2000-01-01', art9_consent_version = 'x' WHERE id = auth.uid() "
          "RETURNING (art9_consent_at > '2000-01-01')::text || art9_consent_version", as_user=BOB,
          expect=f"true{ART9_VERSION}")
    check("... nor drop it", "UPDATE profile_private SET art9_consent_at = NULL WHERE id = auth.uid() "
          "RETURNING (art9_consent_at IS NOT NULL)::text", as_user=BOB, expect="true")

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
    check("admins can't approve groups by hand (C23)",
          "UPDATE groups SET is_approved = true WHERE name = 'Indians in Testville' RETURNING is_approved::text",
          as_user=ADMIN, expect="")
    check("admin approves group (admin_set_group)",
          "SELECT public.admin_set_group(id, 'approve') ->> 'is_approved' FROM groups WHERE name = 'Indians in Testville'",
          as_user=ADMIN, expect="true")
    check("... and the member who asked is told",
          f"SELECT type || '|' || text FROM notifications WHERE user_id = '{ALICE}'",
          expect='group|Your community "Indians in Testville" has been approved!')
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
    check("members can't write notifications, not even in their own name (the database does, C5)",
          f"INSERT INTO notifications (user_id, type, actor_id, text, read, reference_id) VALUES ('{BOB}', 'like', '{ALICE}', 'Alice liked your post', true, '{BOB_POST}')",
          as_user=ALICE, expect="error")
    check("the database told bob about alice's Namaste request, unread",
          f"SELECT type || '|' || read || '|' || text FROM notifications WHERE user_id = '{BOB}'",
          expect="request|false|sent you a Namaste request")
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
    check("admins can't write notifications either: the database's functions send our team's messages (C23)",
          f"INSERT INTO notifications (user_id, type, text) VALUES ('{ALICE}', 'group', 'Your community was approved') RETURNING 1",
          as_user=ADMIN, expect="error")
    check("cannot read others' notifications", "SELECT count(*) FROM notifications", as_user=CAROL, expect="0")
    check("recipient marks read but can't rewrite text",
          "UPDATE notifications SET read = true, text = 'changed' WHERE user_id = auth.uid() RETURNING read::text || text",
          as_user=BOB, expect="truesent you a Namaste request")

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
    check("admin sees the reports", "SELECT count(*) FROM reports", as_user=ADMIN, expect="2")
    check("... but can't close them by hand (C23)", "UPDATE reports SET status = 'resolved' RETURNING 1",
          as_user=ADMIN, expect="")
    check("... nor delete them", "DELETE FROM reports RETURNING 1", as_user=ADMIN, expect="")
    check("admin closes them, saying why (admin_close_reports)",
          "SELECT count(*) FROM public.admin_close_reports(ARRAY(SELECT id FROM reports), 'reviewed', "
          "'we found no breach of our rules')", as_user=ADMIN, expect="2")
    psql(f"DELETE FROM notifications WHERE type = 'report' AND user_id = '{BOB}'")  # (not part of the checks below)
    check("admins can't delete content directly (C23)",
          "DELETE FROM posts WHERE id = '10000000-0000-0000-0000-000000000001' RETURNING 1", as_user=ADMIN, expect="")
    check("admin removes a post (admin_moderate), and its author gets the reasons",
          f"SELECT ({moderate('post', '10000000-0000-0000-0000-000000000001', 'remove')} ->> 'statement') "
          "LIKE 'We removed your post \"%\" on %'", as_user=ADMIN, expect="t")

    # --- events / help / marketplace / docs ---------------------------------
    check("event counters forced, organizer must be self",
          f"INSERT INTO events (id, title, date, time, organizer_id, organizer_name, attendees_count) VALUES ('40000000-0000-0000-0000-000000000001', 'Diwali', '2030-11-01', '18:00', '{ALICE}', 'Alice', 300) RETURNING attendees_count",
          as_user=ALICE, expect="0")
    check("cannot create event for someone else",
          f"INSERT INTO events (title, date, organizer_id) VALUES ('x', '2030-01-01', '{BOB}')", as_user=ALICE, expect="error")
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
    check("admin blocks carol", block(CAROL), as_user=ADMIN, expect="blocked")
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
    check("blocked member can't change their profile, e.g. rename themselves (C14)",
          "UPDATE profiles SET name = 'NRIClub Support Team', bio = 'Re-verify now' WHERE id = auth.uid() RETURNING name",
          as_user=CAROL, expect="")
    check("... (checked)", f"SELECT name FROM profiles WHERE id = '{CAROL}'", expect="Carol C")
    check("blocked member can't file reports (C14)",
          f"INSERT INTO reports (reporter_id, reported_post_id, reason) VALUES ('{CAROL}', '10000000-0000-0000-0000-000000000002', '[POST] spam')",
          as_user=CAROL, expect="error")
    check("... nor feedback (they can write to the team or use the public page)",
          f"INSERT INTO reports (reporter_id, reported_post_id, reason) VALUES ('{CAROL}', '{CAROL}', '[BUG] Feed: broken')",
          as_user=CAROL, expect="error")
    check("blocked member can't upload a profile photo (C14)",
          f"INSERT INTO storage.objects (bucket_id, name) VALUES ('avatars', '{CAROL}/avatar_2.png')", as_user=CAROL,
          expect="error")
    check("... or a post photo",
          f"INSERT INTO storage.objects (bucket_id, name) VALUES ('post-images', '{CAROL}/2.png')", as_user=CAROL,
          expect="error")
    check("a place carol added before the block", f"""
          INSERT INTO places (id, city, name, created_by) VALUES ('80000000-0000-0000-0000-000000000001', 'Berlin', 'Spice Shop', '{CAROL}');
          SELECT 1""", expect="1")
    check("blocked member can't edit their places (C14)",
          "UPDATE places SET name = 'Visit my scam site' WHERE id = '80000000-0000-0000-0000-000000000001' RETURNING 1",
          as_user=CAROL, expect="")

    # --- storage ------------------------------------------------------------
    check("upload into own folder",
          f"INSERT INTO storage.objects (bucket_id, name) VALUES ('avatars', '{ALICE}/avatar_1.png') RETURNING 1",
          as_user=ALICE, expect="1")
    check("a verified member uploads post and listing photos",
          f"INSERT INTO storage.objects (bucket_id, name) VALUES ('post-images', '{ALICE}/1.png'), "
          f"('marketplace-images', '{ALICE}/1.png') RETURNING 1", as_user=ALICE, expect="1\n1")
    check("... and replaces them", f"UPDATE storage.objects SET metadata = '{{}}' WHERE name = '{ALICE}/1.png' RETURNING 1",
          as_user=ALICE, expect="1\n1")
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
    check("signup records the name and country, not the LinkedIn link, 18+ or Terms in the signup data; starts incomplete",
          f"""INSERT INTO auth.users (id, email, raw_user_meta_data, email_confirmed_at) VALUES ('{diana}', 'diana@example.com',
          '{{"full_name": "  Diana D  ", "country_code": "de", "age_confirmed": true, "terms_version": "2026-10",
            "linkedin_url": "de.linkedin.com/in/Diana-D/"}}', now());
          SELECT p.name || '|' || p.country_code || '|' || pp.verification_status || '|' || p.linkedin_url || '|'
            || (pp.age_confirmed_at IS NOT NULL) || '|' || COALESCE(pp.terms_version, 'none')
          FROM profiles p JOIN profile_private pp USING (id) WHERE id = '{diana}'""",
          expect="Diana D|DE|incomplete||false|none")
    check("the site records 18+, the Terms and the Art. 9 consent once the email code is confirmed (accept_terms, Q3, C8)",
          f"SELECT public.accept_terms('{TERMS_VERSION}', true); "
          "SELECT concat_ws('|', age_confirmed_at IS NOT NULL, terms_version, art9_consent_at IS NOT NULL, art9_consent_version) "
          "FROM profile_private",
          as_user=diana, expect=f"{TERMS_VERSION}\nt|{TERMS_VERSION}|t|{ART9_VERSION}")
    check("... and keeps both in the member's history (C22)",
          "SELECT string_agg(kind || '=' || version, ',' ORDER BY kind) FROM terms_acceptances",
          as_user=diana, expect=f"art9={ART9_VERSION},terms={TERMS_VERSION}")
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
          as_user=diana, expect=f"true{TERMS_VERSION}")
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
          as_user=LEGACY, expect=f"pending\ntrue|{TERMS_VERSION}")
    check("... in the member's history too, and no consent of any kind (C8, C22)",
          "SELECT (SELECT string_agg(kind || '=' || version, ',') FROM terms_acceptances) || '|' || "
          "(art9_consent_at IS NULL) FROM profile_private",
          as_user=LEGACY, expect=f"terms={TERMS_VERSION}|true")
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
          "SELECT (SELECT verification_status FROM profile_private) || '|' || linkedin_verified || '|' || "
          "(SELECT l.linkedin_url FROM public.profile_links(ARRAY[auth.uid()]) l) "
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
    sign_up(IVAN, "ivan@example.com", {"full_name": "Ivan I"}, accept_terms=True)
    check("a member who hasn't submitted their details sees none of other members' rows",
          OTHERS, as_user=IVAN, expect=NONE_OF_OTHERS)
    check("... but sees the approved communities for Get verified",
          "SELECT (count(*) > 0)::text FROM groups", as_user=IVAN, expect="true")

    # --- members waiting for review wait (C3) -------------------------------
    sign_up(WAIT, "wait@example.com", {"full_name": "Wanda W"}, accept_terms=True)
    check("wanda sends her details", "SELECT public.submit_verification('Berlin', 'DE', '', 'linkedin.com/in/wanda-w', "
          "'', '', NULL)", as_user=WAIT, expect="pending")
    check("a member waiting for review sees none of other members' rows (C3)", OTHERS, as_user=WAIT,
          expect=NONE_OF_OTHERS)
    check("... nor their places, open mentoring times, thanks or reviews",
          "SELECT concat_ws(',', (SELECT count(*) FROM places), (SELECT count(*) FROM place_recommendations), "
          "(SELECT count(*) FROM mentor_slots), (SELECT count(*) FROM answer_thanks), (SELECT count(*) FROM mentor_reviews))",
          as_user=WAIT, expect="0,0,0,0,0")
    check("... nor their contact settings",
          f"SELECT count(*) FROM public.get_member_preferences('{BOB}')", as_user=WAIT, expect="0")
    check("... but sees her own profile and the approved communities",
          "SELECT (SELECT count(*) FROM profiles) || '|' || ((SELECT count(*) FROM groups) > 0)", as_user=WAIT,
          expect="1|true")
    check("... and can edit her profile", "UPDATE profiles SET bio = 'Hello!' WHERE id = auth.uid() RETURNING bio",
          as_user=WAIT, expect="Hello!")
    check("... and add a profile photo",
          f"INSERT INTO storage.objects (bucket_id, name) VALUES ('avatars', '{WAIT}/avatar_1.png') RETURNING 1",
          as_user=WAIT, expect="1")
    check("... and send the team feedback",
          f"INSERT INTO reports (reporter_id, reported_post_id, reason) VALUES ('{WAIT}', '{WAIT}', '[BUG] Profile: photo') "
          "RETURNING 1", as_user=WAIT, expect="1")
    wait_cannot = [
        ("post", f"INSERT INTO posts (user_id, content) VALUES ('{WAIT}', 'hi')"),
        ("comment", f"INSERT INTO comments (post_id, user_id, content) VALUES ('10000000-0000-0000-0000-000000000002', '{WAIT}', 'hi')"),
        ("like", f"INSERT INTO likes (post_id, user_id) VALUES ('10000000-0000-0000-0000-000000000002', '{WAIT}')"),
        ("join a group", f"INSERT INTO group_members (group_id, user_id) SELECT id, '{WAIT}' FROM groups WHERE name = 'Indians in Testville'"),
        ("ask for a group", f"INSERT INTO groups (name, created_by) VALUES ('Indians in Waitville', '{WAIT}')"),
        ("create an event", f"INSERT INTO events (title, date, organizer_id) VALUES ('Meetup', '2030-06-07', '{WAIT}')"),
        ("RSVP", f"INSERT INTO event_rsvps (event_id, user_id) VALUES ('40000000-0000-0000-0000-000000000001', '{WAIT}')"),
        ("list something", f"INSERT INTO marketplace (user_id, title, price) VALUES ('{WAIT}', 'Sofa', '1')"),
        ("write a guide", f"INSERT INTO docs (user_id, title) VALUES ('{WAIT}', 'Guide')"),
        ("ask a question", f"INSERT INTO help_requests (user_id, title, description) VALUES ('{WAIT}', 'Q', 'Q')"),
        ("answer one", f"INSERT INTO help_responses (request_id, user_id, content) VALUES ('50000000-0000-0000-0000-000000000001', '{WAIT}', 'A')"),
        ("add a place", f"INSERT INTO places (city, name, created_by) VALUES ('Berlin', 'Shop', '{WAIT}')"),
        ("start a conversation", f"INSERT INTO conversations (participant_1, participant_2) VALUES ('{WAIT}', '{ALICE}')"),
        ("send a Namaste request", f"INSERT INTO connections (requester_id, recipient_id) VALUES ('{WAIT}', '{ALICE}')"),
        ("notify anyone", f"INSERT INTO notifications (user_id, type, actor_id, text, reference_id) VALUES "
                          f"('{BOB}', 'like', '{WAIT}', 'liked', '{BOB_POST}')"),
        ("report a member", f"INSERT INTO reports (reporter_id, reported_user_id, reason) VALUES ('{WAIT}', '{BOB}', 'spam')"),
        ("upload a post photo", f"INSERT INTO storage.objects (bucket_id, name) VALUES ('post-images', '{WAIT}/1.png')"),
        ("upload a listing photo", f"INSERT INTO storage.objects (bucket_id, name) VALUES ('marketplace-images', '{WAIT}/1.png')"),
    ]
    for what, sql in wait_cannot:
        check(f"... but can't {what}", sql, as_user=WAIT, expect="error")
    check("a conversation an approved member starts with her", f"""
          INSERT INTO conversations (id, participant_1, participant_2) VALUES ('30000000-0000-0000-0000-000000000301', '{ALICE}', '{WAIT}');
          INSERT INTO messages (conversation_id, sender_id, content) VALUES ('30000000-0000-0000-0000-000000000301', '{ALICE}', 'welcome!');
          SELECT 1""", as_user=ALICE, expect="1")
    check("... she can't answer while she waits",
          f"INSERT INTO messages (conversation_id, sender_id, content) VALUES ('30000000-0000-0000-0000-000000000301', '{WAIT}', 'thanks')",
          as_user=WAIT, expect="error")
    check("a Namaste request to her", f"INSERT INTO connections (id, requester_id, recipient_id) VALUES "
          f"('20000000-0000-0000-0000-000000000301', '{ALICE}', '{WAIT}') RETURNING 1", as_user=ALICE, expect="1")
    check("... she can't accept while she waits",
          "UPDATE connections SET status = 'accepted' WHERE id = '20000000-0000-0000-0000-000000000301'", as_user=WAIT,
          expect="error")
    check("an approved mentor with an open time", f"""
          UPDATE profiles SET mentor_open = true WHERE id = '{ALICE}';
          INSERT INTO mentor_slots (id, mentor_id, starts_at) VALUES ('90000000-0000-0000-0000-000000000301', '{ALICE}', now() + interval '3 days');
          SELECT 1""", expect="1")
    check("... she can't book while she waits",
          "SELECT public.book_mentor_session('90000000-0000-0000-0000-000000000301', 'CV', '')", as_user=WAIT,
          error_has="once your membership is confirmed")
    check("... and gets no notifications about what other members do (their words stay with members)",
          f"SELECT private.notify('{WAIT}', 'answer', '{ALICE}', 'needs urgent help in Berlin: a doctor', NULL); "
          f"SELECT count(*) FROM notifications WHERE user_id = '{WAIT}' AND type = 'answer'", expect="0")
    check("asked for more information, she still waits",
          f"SELECT public.review_member('{WAIT}', 'needs_info', 'Your LinkedIn link does not open.', '')", as_user=ADMIN,
          expect="needs_info")
    check("... (sees nothing)", OTHERS, as_user=WAIT, expect=NONE_OF_OTHERS)
    check("... (posts nothing)", f"INSERT INTO posts (user_id, content) VALUES ('{WAIT}', 'hi')", as_user=WAIT, expect="error")
    check("... (but can still send feedback)",
          f"INSERT INTO reports (reporter_id, reported_post_id, reason) VALUES ('{WAIT}', '{WAIT}', '[IDEA] Dark mode') RETURNING 1",
          as_user=WAIT, expect="1")
    check("she answers and an admin approves her",
          "SELECT public.submit_verification('Berlin', 'DE', '', 'linkedin.com/in/wanda-w', '', '', NULL)", as_user=WAIT,
          expect="pending")
    check("... (approved)", f"SELECT public.review_member('{WAIT}', 'approved', '', '')", as_user=ADMIN, expect="approved")
    check("once approved she sees other members and their content", every_table, as_user=WAIT, expect="true")
    check("... and takes part: posts, messages and Namaste", f"""
          INSERT INTO posts (user_id, content) VALUES ('{WAIT}', 'hello all');
          INSERT INTO messages (conversation_id, sender_id, content) VALUES ('30000000-0000-0000-0000-000000000301', '{WAIT}', 'thanks!');
          UPDATE connections SET status = 'accepted' WHERE id = '20000000-0000-0000-0000-000000000301';
          SELECT 1""", as_user=WAIT, expect="1")
    check("... and can book a mentor",
          "SELECT (public.book_mentor_session('90000000-0000-0000-0000-000000000301', 'CV', '') IS NOT NULL)::text",
          as_user=WAIT, expect="true")
    check("... and gets notifications",
          f"SELECT private.notify('{WAIT}', 'answer', '{ALICE}', 'answered your question', NULL); "
          f"SELECT count(*) FROM notifications WHERE user_id = '{WAIT}' AND type = 'answer'", expect="1")
    check("an approved member without the Art. 9 consent can't take part (C8)",
          f"UPDATE profile_private SET art9_consent_at = NULL, art9_consent_version = NULL WHERE id = '{WAIT}'; SELECT 1",
          expect="1")
    check("... (sees nothing)", OTHERS, as_user=WAIT, expect=NONE_OF_OTHERS)
    check("... (contacts nobody)",
          f"INSERT INTO messages (conversation_id, sender_id, content) VALUES ('30000000-0000-0000-0000-000000000301', '{WAIT}', 'hi')",
          as_user=WAIT, expect="error")
    check("accepting the Terms again without it changes nothing",
          f"SELECT public.accept_terms('{TERMS_VERSION}'); SELECT (art9_consent_at IS NULL)::text FROM profile_private",
          as_user=WAIT, expect=f"{TERMS_VERSION}\ntrue")
    check("... giving it lets her take part again",
          f"SELECT public.accept_terms('{TERMS_VERSION}', true); "
          f"INSERT INTO posts (user_id, content) VALUES ('{WAIT}', 'back') RETURNING 1", as_user=WAIT,
          expect=f"{TERMS_VERSION}\n1")
    check("... and her history has each consent",
          "SELECT string_agg(kind, ',' ORDER BY accepted_at, kind) FROM terms_acceptances", as_user=WAIT,
          expect="art9,terms,art9")

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
    check("anon cannot call accept_terms", f"SELECT public.accept_terms('{TERMS_VERSION}', true)", role="anon",
          expect="error")
    check("the one-argument accept_terms is gone (C8)",
          "SELECT string_agg(pg_get_function_identity_arguments(oid), ',') FROM pg_proc WHERE proname = 'accept_terms'",
          expect="p_version text, p_art9 boolean")
    check("accept_terms records 18+ and the current Terms",
          f"SELECT public.accept_terms('{TERMS_VERSION}'); SELECT (age_confirmed_at IS NOT NULL)::text || '|' || "
          "(terms_accepted_at IS NOT NULL) || '|' || terms_version FROM profile_private",
          as_user=RESTORED, expect=f"{TERMS_VERSION}\ntrue|true|{TERMS_VERSION}")
    check("... but without the Art. 9 consent they still can't post (C8)",
          f"INSERT INTO posts (user_id, content) VALUES ('{RESTORED}', 'hi')", as_user=RESTORED, expect="error")
    check("... or see other members", "SELECT count(*) FROM profiles", as_user=RESTORED, expect="1")
    check("giving the Art. 9 consent records it with the server's time and its wording's version",
          f"SELECT public.accept_terms('{TERMS_VERSION}', true); "
          "SELECT (art9_consent_at > now() - interval '1 minute')::text || '|' || art9_consent_version FROM profile_private",
          as_user=RESTORED, expect=f"{TERMS_VERSION}\ntrue|{ART9_VERSION}")
    check("accepting again keeps the first acceptance and consent dates, and adds nothing to the history",
          f"SELECT public.accept_terms('{TERMS_VERSION}', true); "
          "SELECT (terms_accepted_at < now() AND art9_consent_at < now())::text || '|' || "
          "(SELECT count(*) FROM terms_acceptances) FROM profile_private",
          as_user=RESTORED, expect=f"{TERMS_VERSION}\ntrue|2")
    check("members can't backdate or change their acceptance",
          "UPDATE profile_private SET terms_accepted_at = '2020-01-01', terms_version = '2030-01' WHERE id = auth.uid() "
          "RETURNING (terms_accepted_at > '2020-01-01')::text || terms_version", as_user=RESTORED,
          expect=f"true{TERMS_VERSION}")
    check("... or their history",
          f"INSERT INTO terms_acceptances (member_id, kind, version) VALUES ('{RESTORED}', 'terms', '2030-01')",
          as_user=RESTORED, expect="error")
    check("... (nor change or delete it)",
          "UPDATE terms_acceptances SET version = '2030-01' RETURNING 1; DELETE FROM terms_acceptances RETURNING 1",
          as_user=RESTORED, expect="error")
    check("once accepted, the member can post and see other members",
          f"INSERT INTO posts (user_id, content) VALUES ('{RESTORED}', 'hello again') RETURNING 1; "
          "SELECT (count(*) > 1)::text FROM profiles", as_user=RESTORED, expect="1\ntrue")

    # --- verification decisions (F5, F6, F31) -------------------------------
    sign_up(GITA, "gita@example.com", {"full_name": "Gita G"}, accept_terms=True)
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
    sign_up(HARI, "hari@example.com", {"full_name": "Hari H"}, accept_terms=True)
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
    sign_up(DAVE, "dave@example.com", {"full_name": "Dave D"}, accept_terms=True)
    check("dave submits", "SELECT public.submit_verification('Pune', 'IN', '', 'linkedin.com/in/Dave-Scam', '', '', NULL)",
          as_user=DAVE, expect="pending")
    check("admin rejects dave with a private note",
          f"SELECT public.review_member('{DAVE}', 'rejected', 'We could not verify you.', 'scammer, reported by 3 members')",
          as_user=ADMIN, expect="rejected")
    check("the rejection is kept in a private moderation record, with a keyed hash of the email",
          "SELECT decision || '|' || admin_note || '|' || linkedin_slug || '|' || (email_hash = encode(sha256(convert_to("
          "(SELECT value FROM private.app_config WHERE key = 'moderation_salt') || 'dave@example.com', 'UTF8')), 'hex')) "
          f"FROM private.moderation_record WHERE member_id = '{DAVE}'",
          expect="rejected|scammer, reported by 3 members|dave-scam|true")
    check("... so a guessed address can't be tested against it (R18)",
          "SELECT count(*) FROM private.moderation_record WHERE email_hash IN "
          "(encode(sha256('dave@example.com'::bytea), 'hex'), encode(sha256('Dave@Example.com'::bytea), 'hex'))",
          expect="0")
    check("members can't read moderation records", "SELECT count(*) FROM private.moderation_record",
          as_user=ALICE, expect="error")
    check("dave deletes his account", "SELECT public.delete_my_account()", as_user=DAVE)
    check("the moderation record outlives the account, without the account id (R18)",
          f"SELECT (SELECT count(*) FROM private.moderation_record WHERE member_id = '{DAVE}') || '|' || "
          "(SELECT count(*) FROM private.moderation_record WHERE linkedin_slug = 'dave-scam' AND member_id IS NULL)",
          expect="0|1")
    sign_up(DAVE2, "Dave@Example.com", {"full_name": "Dave D"}, accept_terms=True)
    check("signing up again with the same email holds them for review",
          f"SELECT review_flag FROM profile_private WHERE id = '{DAVE2}'", expect="held")
    check("... (the hold says it was the email address)",
          f"SELECT matched_on FROM private.review_hold WHERE member_id = '{DAVE2}'", expect="email")
    check("... members can't clear the flag",
          "UPDATE profile_private SET review_flag = '' WHERE id = auth.uid() RETURNING review_flag",
          as_user=DAVE2, expect="held")
    check("... after submitting they wait for review",
          "SELECT public.submit_verification('Pune', 'IN', '', 'linkedin.com/in/dave-scam', '', '', NULL)",
          as_user=DAVE2, expect="pending")
    check("... without access: no posting",
          f"INSERT INTO posts (user_id, content) VALUES ('{DAVE2}', 'I am back')", as_user=DAVE2, expect="error")
    check("... and no browsing", "SELECT count(*) FROM profiles", as_user=DAVE2, expect="1")
    check("the admin queue shows the hold and what it matched (R16)",
          "SELECT concat_ws('|', review_flag, flag_decision, flag_matched_on, flag_note, (flag_date < now())::text) "
          f"FROM public.admin_verification_queue() WHERE id = '{DAVE2}'", as_user=ADMIN,
          expect="held|rejected|both|scammer, reported by 3 members|true")
    check("approving clears the flag",
          f"SELECT public.review_member('{DAVE2}', 'approved', '', ''); "
          f"SELECT (review_flag = '')::text FROM profile_private WHERE id = '{DAVE2}'", as_user=ADMIN, expect="approved\ntrue")
    check("... and the hold", f"SELECT count(*) FROM private.review_hold WHERE member_id = '{DAVE2}'", expect="0")
    check("... and gives access", f"INSERT INTO posts (user_id, content) VALUES ('{DAVE2}', 'hello') RETURNING 1",
          as_user=DAVE2, expect="1")
    check("Undo of the approval holds them again",
          f"SELECT public.review_member('{DAVE2}', 'pending', '', 'Undo'); "
          f"SELECT review_flag FROM profile_private WHERE id = '{DAVE2}'", as_user=ADMIN, expect="pending\nheld")
    check("... with what matched", f"SELECT matched_on FROM private.review_hold WHERE member_id = '{DAVE2}'", expect="both")
    check("... so they wait for an admin again",
          f"INSERT INTO posts (user_id, content) VALUES ('{DAVE2}', 'still here')", as_user=DAVE2, expect="error")
    check("admin approves dave's new account again",
          f"SELECT public.review_member('{DAVE2}', 'approved', '', '')", as_user=ADMIN, expect="approved")
    sign_up(EVE, "eve@example.com", {"full_name": "Eve E"}, accept_terms=True)
    check("another email with the rejected LinkedIn link is held at submit",
          "SELECT public.submit_verification('Pune', 'IN', '', 'https://in.linkedin.com/in/dave-scam/', '', '', NULL); "
          "SELECT review_flag FROM profile_private", as_user=EVE, expect="pending\nheld")
    sign_up(FRANK, "frank@example.com", {"full_name": "Frank F"}, accept_terms=True)
    check("frank submits a note instead of LinkedIn",
          "SELECT public.submit_verification('Pune', 'IN', '', '', 'I moved to Pune for work last year.', '', NULL)",
          as_user=FRANK, expect="pending")
    check("a LinkedIn link added later isn't looked up, so nobody can test links on their own flag (R7)",
          "UPDATE profiles SET linkedin_url = 'linkedin.com/in/dave-scam' WHERE id = auth.uid(); "
          "SELECT review_flag FROM profile_private", as_user=FRANK, expect="")
    check("... the admin sees the change in the history",
          f"SELECT admin_note FROM verification_log WHERE member_id = '{FRANK}' AND admin_note <> ''", as_user=ADMIN,
          expect="Changed their name or LinkedIn while waiting for review. Before: Frank F, no LinkedIn.")
    check("admin blocks and unblocks frank", f"{block(FRANK)}; {unblock(FRANK)}", as_user=ADMIN, expect="blocked\nactive")
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
    sign_up(BO, "bo@example.com", {"full_name": "Bo B"}, accept_terms=True)
    check("admin blocks bo before he submits", block(BO), as_user=ADMIN, expect="blocked")
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
                   "('Garba night', '2030-10-20', auth.uid(), '2099-01-01') RETURNING (created_at = now())::text"),
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
    check("notifications: members can't write one, so not with a made-up date either (C5)",
          f"INSERT INTO notifications (user_id, type, actor_id, text, reference_id, created_at) VALUES "
          f"('{BOB}', 'comment', '{ALICE}', 'Alice commented', '{BOB_POST}', '2099-01-01')", as_user=ALICE,
          expect="error")
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
          "('40000000-0000-0000-0000-000000000003', 'Holi', '2031-03-01', auth.uid(), 'NRIClub Team') RETURNING organizer_name",
          as_user=ALICE, expect="Alice Updated")
    check("... also when the event is edited",
          "UPDATE events SET organizer_name = 'NRIClub Team' WHERE id = '40000000-0000-0000-0000-000000000003' "
          "RETURNING organizer_name", as_user=ALICE, expect="Alice Updated")
    check("admins can still name the host",
          "INSERT INTO events (title, date, organizer_id, organizer_name) VALUES "
          "('Diwali Mela', '2030-11-15', auth.uid(), 'NRIClub Team') RETURNING organizer_name",
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
    check("... and so is one about the recipient's post: the database writes those now (C5)",
          f"INSERT INTO notifications (user_id, type, actor_id, text, reference_id) VALUES "
          f"('{BOB}', 'comment', '{ALICE}', 'Alice commented', '{BOB_POST}')", as_user=ALICE, expect="error")
    check("a Namaste request works",
          f"INSERT INTO connections (id, requester_id, recipient_id) VALUES ('20000000-0000-0000-0000-000000000009', auth.uid(), '{DAVE2}')",
          as_user=ALICE)
    check("... and a notification about it from the member is refused: the database wrote it (C5)",
          f"INSERT INTO notifications (user_id, type, actor_id, text, reference_id) VALUES "
          f"('{DAVE2}', 'request', '{ALICE}', 'Alice sent you a Namaste request', '20000000-0000-0000-0000-000000000009')",
          as_user=ALICE, expect="error")

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
    check("unset the Storage address", "DELETE FROM private.app_config WHERE key = 'storage_public_url'")
    check("an older outside link is kept and the member can still edit their profile",
          f"UPDATE profiles SET avatar_url = 'https://legacy.example/a.png' WHERE id = '{ALICE}'; "
          "SELECT 1", expect="1")
    check("... (checked)", "UPDATE profiles SET bio = 'Still here' WHERE id = auth.uid() RETURNING avatar_url",
          as_user=ALICE, expect="https://legacy.example/a.png")

    # --- accounts without a name (F24) -------------------------------------
    sign_up(NONAME, "priya.sharma83@example.com", {})
    check("an account created without a name gets an empty name, not part of the email",
          f"SELECT (name = '')::text FROM profiles WHERE id = '{NONAME}'", expect="true")

    # --- no consents nobody was asked for (C8) -----------------------------
    check("the made-up consent columns are gone",
          "SELECT count(*) FROM pg_attribute WHERE attrelid IN ('public.profile_private'::regclass, "
          "'public.user_settings'::regclass) AND NOT attisdropped "
          "AND attname IN ('gdpr_consent', 'gdpr_consent_date', 'marketing_consent', 'marketing_emails')", expect="0")

    # --- Download my data (F16) ---------------------------------------------
    check("the export covers every kind of the member's data",
          "SELECT string_agg(k, ',' ORDER BY k) FROM jsonb_object_keys(public.export_my_data()) k", as_user=ALICE,
          expect="account,ambassador_agreement,ambassador_applications,ambassador_log,ambassador_welcomes_given,"
                 "answer_thanks,blocks,comments,connections,conversations,"
                 "conversations_hidden,doc_comments,docs,"
                 "event_rsvps,events_organised,exported_at,files,group_memberships,groups_requested,help_requests,"
                 "help_responses,invite_code,likes,marketplace_listings,mentor_reviews_received,mentor_reviews_written,mentor_times,"
                 "mentoring_sessions,messages,moderation_actions_about_me,name_changes,notifications,place_recommendations,"
                 "places_added,posts,profile,"
                 "profile_private,rate_limit_log,readme,reports_about_me,reports_filed,sessions,terms_acceptances,"
                 "travel_posts,travel_rules_accepted,urgent_questions_sent,user_settings,verification_log,"
                 "welcomed_by_your_city_ambassador")
    check("... with the member's profile, private details, consent and rows of each kind",
          "SELECT concat_ws('|', d->'profile'->>'name', d->'profile_private'->>'email', d->'profile_private'->>'terms_version', "
          "d->'profile_private'->>'art9_consent_version', d->'terms_acceptances'->0->>'kind', "
          "(SELECT bool_and(jsonb_array_length(v) > 0)::text FROM jsonb_each(d) e(k, v) "
          "WHERE jsonb_typeof(v) = 'array' AND k NOT IN ('verification_log', 'conversations_hidden', 'places_added', "
          "'place_recommendations', 'answer_thanks', 'mentor_reviews_written', 'mentor_reviews_received', 'sessions', "
          "'files', 'urgent_questions_sent', 'reports_about_me', 'ambassador_applications', 'travel_posts', "
          "'ambassador_agreement', 'ambassador_welcomes_given', 'welcomed_by_your_city_ambassador', 'ambassador_log'))) "
          "FROM (SELECT public.export_my_data() d) x",
          as_user=ALICE, expect=f"Alice Updated|alice@example.com|{TERMS_VERSION}|{ART9_VERSION}|art9|true")
    check("... and only the member's own rows",
          "SELECT (bool_and(p->>'user_id' = auth.uid()::text) AND position('bob2@example.com' IN public.export_my_data()::text) = 0)::text "
          "FROM jsonb_array_elements(public.export_my_data()->'posts') p", as_user=ALICE, expect="true")
    check("the verification history has decisions and messages, not the admins' notes",
          "SELECT jsonb_array_length(d->'verification_log') || '|' || "
          "(SELECT string_agg(k, ',' ORDER BY k) FROM jsonb_object_keys(d->'verification_log'->1) k) || '|' || "
          "(position('checked twice' IN d::text) = 0) || '|' || (position('Your LinkedIn link does not open.' IN d::text) > 0) "
          "FROM (SELECT public.export_my_data() d) x", as_user=diana, expect="9|created_at,decision,member_message|true|true")
    check("... but with the notes the member's own changes wrote, e.g. their name and link before (R19)",
          "SELECT string_agg(e->>'note', ' / ' ORDER BY e->>'created_at') "
          "FROM jsonb_array_elements(public.export_my_data()->'verification_log') e WHERE e->>'note' <> ''",
          as_user=GITA, expect="Changed their name or LinkedIn while waiting for review. Before: Gita G, "
                               "https://www.linkedin.com/in/gita.")
    check("... never an admin's note about them",
          "SELECT (position('Undo' IN public.export_my_data()::text) = 0)::text", as_user=GITA, expect="true")
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
    sign_up(CAROL2, "carol@example.com", {"full_name": "Carol C"}, accept_terms=True)
    check("signing up again after a block holds them for review",
          f"SELECT review_flag FROM profile_private WHERE id = '{CAROL2}'", expect="held")
    check("... and the admin sees it was a block",
          "SELECT concat_ws('|', flag_decision, flag_matched_on) "
          f"FROM public.admin_verification_queue(ARRAY['incomplete']) WHERE id = '{CAROL2}'", as_user=ADMIN,
          expect="blocked|email")

    review_fixes_2()
    review_fixes_3()
    access_consent()
    notifications_limits_privacy()
    moderation_dsa()
    storage_images()
    admin_access()
    ambassador_applications()
    member_fixes()
    admin_tools()
    travel_board()
    ambassador_panel()

    print(f"\n{len(failures)} failure(s)")
    sys.exit(1 if failures else 0)


def review_fixes_2():
    """Fixes from the review of the Phase 1 fixes (R1-R26). Runs after main()'s
    checks and uses the members they leave behind."""

    # --- emails and LinkedIn links in a standard form (R9) -----------------
    for email, canonical in [("  Dave.Kumar+NRI@GoogleMail.com ", "davekumar@gmail.com"),
                             ("d.k+1@example.com", "d.k@example.com"),
                             ("+tag@example.com", "+tag@example.com"),
                             ("not an address", "not an address")]:
        check(f"canonical email of '{email.strip()}'", f"SELECT private.canonical_email('{email}')", expect=canonical)
    check("an empty email has no canonical form", "SELECT (private.canonical_email('  ') IS NULL)::text", expect="true")
    for link, slug in [("https://www.linkedin.com/in/d%61ve-kumar", "dave-kumar"),
                       ("in.linkedin.com/in/Dave-Kumar/?trk=x", "dave-kumar"),
                       ("linkedin.com/in/%44%41VE-kumar", "dave-kumar"),
                       ("linkedin.com/in/dave%7Ekumar", "dave~kumar"),
                       # Other escapes stay escapes, in lower case (Q2): accented
                       # and non-Latin names keep a key.
                       ("linkedin.com/in/d%C3%A9ve", "d%c3%a9ve"),
                       ("LinkedIn.com/in/J%c3%BCrgen-M%C3%BCller-4b2a1c/", "j%c3%bcrgen-m%c3%bcller-4b2a1c"),
                       ("linkedin.com/in/%E5%BC%A0%E4%BC%9F-12345", "%e5%bc%a0%e4%bc%9f-12345"),
                       ("linkedin.com/in/dave%3Ax", "dave%3ax"),
                       # Not a single profile name, so not a profile link.
                       ("linkedin.com/in/dave%2fx", ""),
                       ("linkedin.com/in/dave%00x", ""),
                       ("linkedin.com/in/dave-kumar%20", ""),
                       ("linkedin.com/in/dave%3Fx", ""),
                       ("linkedin.com/in/dave%23x", ""),
                       ("linkedin.com/in/dave%2541", ""),
                       ("linkedin.com/in/dave%7F", ""),
                       ("linkedin.com/in/dave%zz", ""),
                       ("https://twitter.com/dave", "")]:
        check(f"LinkedIn slug of '{link}'", f"SELECT COALESCE(private.linkedin_slug('{link}'), '')", expect=slug)
    escaped = ("SELECT 'linkedin.com/in/ab%' || upper(lpad(to_hex(b), 2, '0')) || 'cd' AS link, b "
               "FROM generate_series(0, 255) b")
    check("every link normalize_linkedin accepts has a match key, whatever it escapes (Q2)",
          f"SELECT count(*) FROM ({escaped}) x "
          "WHERE private.normalize_linkedin(link) IS NOT NULL AND private.linkedin_slug(link) IS NULL", expect="0")
    check("... and only escapes of control characters, space, # % / and ? are refused",
          f"SELECT string_agg(to_hex(b), ',' ORDER BY b) FILTER (WHERE b >= 32) || '|' || count(*) FILTER (WHERE b < 32) "
          f"FROM ({escaped}) x WHERE private.normalize_linkedin(link) IS NULL", expect="20,23,25,2f,3f,7f|32")
    check("members can't hash emails for the moderation records",
          "SELECT private.email_hash('dave@example.com')", as_user=ALICE, expect="error")
    check("... or look the records up",
          f"SELECT * FROM private.moderation_match('{ALICE}', 'dave@example.com', 'linkedin.com/in/dave-scam')",
          as_user=ALICE, expect="error")
    check("... or end their own hold",
          f"SELECT private.recheck_review_hold('{DAVE2}', 'new@example.com', NULL)", as_user=DAVE2, expect="error")
    sign_up(DAVE_PLUS, "Dave+NRI@example.com", {"full_name": "Dave D"}, accept_terms=True)
    check("a plus-address of a rejected email is held at signup (R9)",
          f"SELECT review_flag FROM profile_private WHERE id = '{DAVE_PLUS}'", expect="held")
    sign_up(ENCODED, "someone.new@example.com", {"full_name": "Dave D"}, accept_terms=True)
    check("a percent-encoded copy of a rejected LinkedIn link is held at submit (R9)",
          "SELECT public.submit_verification('Pune', 'IN', '', 'linkedin.com/in/d%61ve-scam', '', '', NULL); "
          "SELECT review_flag FROM profile_private", as_user=ENCODED, expect="pending\nheld")
    check("... and the admin queue counts it with the other accounts using that link",
          "SELECT (q.same_linkedin_count > 0 AND q.same_linkedin_count = (SELECT count(*) FROM "
          "public.profile_links(ARRAY(SELECT id FROM profiles)) l WHERE l.linkedin_url = 'https://www.linkedin.com/in/dave-scam'))::text "
          f"FROM public.admin_verification_queue() q WHERE q.id = '{ENCODED}'", as_user=ADMIN, expect="true")

    # --- the flag can't be used to test links (R7) -------------------------
    sign_up(PROBE, "probe@example.com", {"full_name": "Pat Probe"}, accept_terms=True)
    check("an unfinished account that sets a rejected LinkedIn link isn't held (R7)",
          "UPDATE profiles SET linkedin_url = 'linkedin.com/in/dave-scam' WHERE id = auth.uid(); "
          "SELECT review_flag FROM profile_private", as_user=PROBE, expect="")
    check("the flag members can read only ever says 'held'",
          f"UPDATE profile_private SET review_flag = 'previously rejected' WHERE id = '{PROBE}'", expect="error")
    check("members can't read what they matched", "SELECT count(*) FROM private.review_hold",
          as_user=DAVE_PLUS, expect="error")

    # --- signup checks the email only; submit checks again (R8) -------------
    sign_up(SQUATTED, "priya.s@example.com",
            {"full_name": "Mallory M", "linkedin_url": "linkedin.com/in/dave-scam"}, accept_terms=True)
    check("signup data with a rejected LinkedIn link doesn't hold the account (R8)",
          f"SELECT review_flag FROM profile_private WHERE id = '{SQUATTED}'", expect="")
    check("the address's owner submits their own link and isn't held",
          "SELECT public.submit_verification('Berlin', 'DE', '', 'linkedin.com/in/priya-s', '', '', NULL); "
          "SELECT review_flag FROM profile_private", as_user=SQUATTED, expect="pending")
    check("... and takes part once approved, as everyone does",
          f"SELECT public.review_member('{SQUATTED}', 'approved', '', '')", as_user=ADMIN, expect="approved")
    check("... (checked)", f"INSERT INTO posts (user_id, content) VALUES ('{SQUATTED}', 'hello') RETURNING 1",
          as_user=SQUATTED, expect="1")
    check("sending the details again with another link doesn't end a hold (Q1)",
          "SELECT public.submit_verification('Pune', 'IN', '', 'linkedin.com/in/eve-e', '', '', NULL); "
          "SELECT review_flag FROM profile_private", as_user=EVE, expect="pending\nheld")
    check("... nor does sending them without a link, when asked for more information",
          f"SELECT public.review_member('{EVE}', 'needs_info', 'Please tell us how you know the community.', '')",
          as_user=ADMIN, expect="needs_info")
    check("... (checked)",
          "SELECT public.submit_verification('Pune', 'IN', '', '', 'I moved to Pune for work last year.', '', NULL); "
          "SELECT review_flag FROM profile_private", as_user=EVE, expect="pending\nheld")
    check("... so they still can't take part",
          f"INSERT INTO posts (user_id, content) VALUES ('{EVE}', 'I am in') RETURNING 1", as_user=EVE, expect="error")
    check("... or see other members", "SELECT count(*) FROM profiles", as_user=EVE, expect="1")
    check("... and the admin still sees what they matched",
          "SELECT concat_ws('|', review_flag, flag_decision, flag_matched_on, flag_note) "
          f"FROM public.admin_verification_queue() WHERE id = '{EVE}'", as_user=ADMIN,
          expect="held|rejected|linkedin|scammer, reported by 3 members")
    check("only an admin's approval ends the hold (Q1)",
          f"SELECT public.review_member('{EVE}', 'approved', '', '')", as_user=ADMIN, expect="approved")
    check("... (checked)", f"SELECT review_flag || '|' || (SELECT count(*) FROM private.review_hold WHERE member_id = '{EVE}') "
          f"FROM profile_private WHERE id = '{EVE}'", expect="|0")
    check("... and gives access", f"INSERT INTO posts (user_id, content) VALUES ('{EVE}', 'hello') RETURNING 1",
          as_user=EVE, expect="1")
    check("a member held for their email stays held whatever link they submit",
          "SELECT public.submit_verification('Pune', 'IN', '', 'linkedin.com/in/dave-new', '', '', NULL); "
          "SELECT review_flag FROM profile_private", as_user=DAVE_PLUS, expect="pending\nheld")
    check("... also after confirming a new email address and sending the details again (Q1)",
          f"UPDATE auth.users SET email = 'dave.new@example.com' WHERE id = '{DAVE_PLUS}'; SELECT 1", expect="1")
    check("... (checked)",
          "SELECT public.submit_verification('Pune', 'IN', '', '', 'I moved to Pune for work last year.', '', NULL); "
          "SELECT review_flag FROM profile_private", as_user=DAVE_PLUS, expect="pending\nheld")
    check("deleting a held account removes what it matched too",
          "SELECT public.delete_my_account()", as_user=DAVE_PLUS)
    check("... (checked)", f"SELECT count(*) FROM private.review_hold WHERE member_id = '{DAVE_PLUS}'", expect="0")

    # --- a rejected member can't plant someone else's link (R1) -------------
    sign_up(MALLORY, "mallory@example.com", {"full_name": "Mallory M"}, accept_terms=True)
    check("mallory submits her own link",
          "SELECT public.submit_verification('Pune', 'IN', '', 'linkedin.com/in/mallory-m', '', '', NULL)",
          as_user=MALLORY, expect="pending")
    check("admin rejects mallory",
          f"SELECT public.review_member('{MALLORY}', 'rejected', 'We could not verify you.', 'fake profile')",
          as_user=ADMIN, expect="rejected")
    check("a rejected member can still change her LinkedIn link, e.g. to someone else's",
          "UPDATE profiles SET linkedin_url = 'linkedin.com/in/victim-priya' WHERE id = auth.uid(); "
          "SELECT linkedin_url FROM public.profile_links(ARRAY[auth.uid()])",
          as_user=MALLORY, expect="https://www.linkedin.com/in/victim-priya")
    check("her email change adds a record with the link, note and date the admin decided on (R1)",
          f"UPDATE auth.users SET email = 'mallory2@example.com' WHERE id = '{MALLORY}'; "
          "SELECT string_agg(DISTINCT linkedin_slug || '|' || admin_note, ',') || '|' || count(*) || '|' "
          f"|| count(DISTINCT created_at) FROM private.moderation_record WHERE member_id = '{MALLORY}'",
          expect="mallory-m|fake profile|2|1")
    check("blocking her also keeps the reviewed link", block(MALLORY), as_user=ADMIN, expect="blocked")
    check("... and so does another email change while blocked",
          f"UPDATE auth.users SET email = 'mallory3@example.com' WHERE id = '{MALLORY}'; "
          "SELECT count(*) FILTER (WHERE linkedin_slug = 'mallory-m') || '|' || count(*) "
          f"FROM private.moderation_record WHERE member_id = '{MALLORY}'", expect="5|5")
    check("... while the same address written differently adds nothing",
          f"UPDATE auth.users SET email = 'Mallory3+x@Example.com' WHERE id = '{MALLORY}'; "
          f"SELECT count(*) FROM private.moderation_record WHERE member_id = '{MALLORY}'", expect="5")
    check("no record holds the planted link",
          "SELECT count(*) FROM private.moderation_record WHERE linkedin_slug = 'victim-priya'", expect="0")
    sign_up(PRIYA, "priya@example.com", {"full_name": "Priya P"}, accept_terms=True)
    check("the planted link's owner submits it and isn't held",
          "SELECT public.submit_verification('Berlin', 'DE', '', 'linkedin.com/in/victim-priya', '', '', NULL); "
          "SELECT review_flag FROM profile_private", as_user=PRIYA, expect="pending")
    check("... and takes part once approved, as everyone does",
          f"SELECT public.review_member('{PRIYA}', 'approved', '', '')", as_user=ADMIN, expect="approved")
    check("... (checked)", f"INSERT INTO posts (user_id, content) VALUES ('{PRIYA}', 'hello') RETURNING 1",
          as_user=PRIYA, expect="1")
    sign_up(MALLORY2, "mallory2@example.com", {"full_name": "Mallory M"}, accept_terms=True)
    check("mallory signing up with her earlier address is held",
          f"SELECT review_flag FROM profile_private WHERE id = '{MALLORY2}'", expect="held")
    check("... and the admin sees it was the block, matched on the email (R16)",
          "SELECT concat_ws('|', flag_decision, flag_matched_on, (flag_note = '')::text, (flag_date IS NOT NULL)::text) "
          f"FROM public.admin_verification_queue(ARRAY['incomplete']) WHERE id = '{MALLORY2}'", as_user=ADMIN,
          expect="blocked|email|true|true")

    # --- only active members accept Namaste requests (R10) ------------------
    check("an active member sends Namaste requests to accounts that can't take part",
          f"INSERT INTO connections (requester_id, recipient_id) VALUES (auth.uid(), '{PROBE}'), (auth.uid(), '{MALLORY}') "
          "RETURNING 1", as_user=ALICE, expect="1\n1")
    for who, label in [(PROBE, "an unfinished account"), (MALLORY, "a rejected, blocked account")]:
        check(f"{label} can't accept a Namaste request (R10)",
              "UPDATE connections SET status = 'accepted' WHERE recipient_id = auth.uid() RETURNING 1",
              as_user=who, expect="error")
        check("... but can ignore it",
              "UPDATE connections SET status = 'blocked' WHERE recipient_id = auth.uid() RETURNING status",
              as_user=who, expect="blocked")
        check("... and remove it", "DELETE FROM connections WHERE recipient_id = auth.uid() RETURNING 1",
              as_user=who, expect="1")

    # --- the current Terms version (R20) ------------------------------------
    sign_up(OLGA, "olga@example.com", {"full_name": "Olga O"}, accept_terms=True)
    check("olga submits", "SELECT public.submit_verification('Pune', 'IN', '', 'linkedin.com/in/olga-o', '', '', NULL)",
          as_user=OLGA, expect="pending")
    check("olga is approved", f"SELECT public.review_member('{OLGA}', 'approved', '', '')", as_user=ADMIN,
          expect="approved")
    check("olga accepted an older version of the Terms",
          f"UPDATE profile_private SET terms_version = '2025-01', terms_accepted_at = '2025-01-15' WHERE id = '{OLGA}' "
          "RETURNING 1", expect="1")
    check("... so she can't take part until she accepts the current one (R20)",
          f"INSERT INTO posts (user_id, content) VALUES ('{OLGA}', 'hi')", as_user=OLGA, expect="error")
    check("... or see other members", "SELECT count(*) FROM profiles", as_user=OLGA, expect="1")
    check("alice sends olga a Namaste request",
          f"INSERT INTO connections (requester_id, recipient_id) VALUES (auth.uid(), '{OLGA}') RETURNING 1",
          as_user=ALICE, expect="1")
    check("... which olga can't accept yet",
          "UPDATE connections SET status = 'accepted' WHERE recipient_id = auth.uid()", as_user=OLGA, expect="error")
    check("the site asks which version is current, signed in or not (C22)",
          "SELECT public.current_terms_version()", role="anon", expect=TERMS_VERSION)
    check("... (signed in)", "SELECT public.current_terms_version()", as_user=OLGA, expect=TERMS_VERSION)
    check("accepting the current version records a new acceptance",
          f"SELECT public.accept_terms('{TERMS_VERSION}'); "
          "SELECT terms_version || '|' || (terms_accepted_at > '2025-01-15') FROM profile_private",
          as_user=OLGA, expect=f"{TERMS_VERSION}\n{TERMS_VERSION}|true")
    check("... and keeps the earlier one in her history (C22)",
          "SELECT string_agg(version, ',' ORDER BY accepted_at) FROM terms_acceptances WHERE kind = 'terms'",
          as_user=OLGA, expect=f"{TERMS_VERSION},{TERMS_VERSION}")
    check("... and lets her take part again",
          f"INSERT INTO posts (user_id, content) VALUES ('{OLGA}', 'hi') RETURNING 1", as_user=OLGA, expect="1")
    check("an admin moves olga back to review", f"SELECT public.review_member('{OLGA}', 'pending', '', '')",
          as_user=ADMIN, expect="pending")
    check("ticking the Terms box when submitting also records the current version",
          f"UPDATE profile_private SET terms_version = '2025-01', terms_accepted_at = '2025-01-15' WHERE id = '{OLGA}'",
          expect="ok")
    check("... (checked)",
          "SELECT public.submit_verification('Pune', 'IN', '', 'linkedin.com/in/olga-o', '', '', NULL, true); "
          "SELECT terms_version || '|' || (terms_accepted_at > '2025-01-15') FROM profile_private",
          as_user=OLGA, expect=f"pending\n{TERMS_VERSION}|true")

    # --- decisions on an out-of-date status (R15) ---------------------------
    check("a decision on a status that has changed since is refused (R15)",
          f"SELECT public.review_member('{OLGA}', 'rejected', 'Sorry', '', NULL, NULL, 'approved')", as_user=ADMIN,
          error_has="This member's status changed. Reload to see the latest.")
    check("... and changes nothing", f"SELECT verification_status FROM profile_private WHERE id = '{OLGA}'",
          expect="pending")
    check("with the status, name and link the admin saw, it goes through",
          f"SELECT public.review_member('{OLGA}', 'approved', '', '', 'Olga O', 'https://www.linkedin.com/in/olga-o', "
          "'pending')", as_user=ADMIN, expect="approved")
    check("a late Undo of a rejection can't take back someone else's approval",
          f"SELECT public.review_member('{OLGA}', 'pending', '', 'Undo', NULL, NULL, 'rejected')", as_user=ADMIN,
          error_has="status changed")
    check("anon cannot call review_member", f"SELECT public.review_member('{OLGA}', 'pending', '', '')",
          role="anon", expect="error")

    # --- rejected before sending details (R4) -------------------------------
    check("moving a rejected member who never sent details to pending says what to do instead (R4)",
          f"SELECT public.review_member('{IVAN}', 'pending', '', '', NULL, NULL, 'rejected')", as_user=ADMIN,
          error_has="Move them back to unfinished instead.")
    check("they can be moved back to unfinished",
          f"SELECT public.review_member('{IVAN}', 'incomplete', '', 'Rejected by mistake', NULL, NULL, 'rejected')",
          as_user=ADMIN, expect="incomplete")
    check("... which drops the rejection's moderation record",
          f"SELECT count(*) FROM private.moderation_record WHERE member_id = '{IVAN}'", expect="0")
    check("... doesn't notify them, and leaves no stale rejection waiting",
          "SELECT count(*) FROM notifications WHERE type = 'verification' AND NOT read", as_user=IVAN, expect="0")
    check("... and is in the admin's history",
          f"SELECT decision || '|' || admin_note FROM verification_log WHERE member_id = '{IVAN}' "
          "ORDER BY created_at DESC LIMIT 1", as_user=ADMIN, expect="incomplete|Rejected by mistake")
    check("... so they can send their details",
          "SELECT public.submit_verification('Pune', 'IN', '', 'linkedin.com/in/ivan-i', '', '', NULL)",
          as_user=IVAN, expect="pending")
    check("a rejected member who sent details can't be moved back to unfinished",
          f"SELECT public.review_member('{MALLORY}', 'incomplete', '', '')", as_user=ADMIN,
          error_has="Move them back to pending instead.")
    check("... nor can a member who isn't rejected",
          f"SELECT public.review_member('{IVAN}', 'incomplete', '', '')", as_user=ADMIN,
          error_has="Only a rejected member who never sent their details")
    check("Undo of rejecting an unfinished member ends their hold too",
          f"SELECT public.review_member('{MALLORY2}', 'rejected', 'Not now.', ''); "
          f"SELECT public.review_member('{MALLORY2}', 'incomplete', '', 'Undo'); "
          f"SELECT (review_flag = '')::text FROM profile_private WHERE id = '{MALLORY2}'", as_user=ADMIN,
          expect="rejected\nincomplete\ntrue")
    check("... until they send their details and are checked again",
          "SELECT public.submit_verification('Pune', 'IN', '', '', 'I am new in Pune and work at a bank.', '', NULL); "
          "SELECT review_flag FROM profile_private", as_user=MALLORY2, expect="pending\nheld")
    check("Move to pending gives a member approved without a submission date one",
          f"SELECT public.review_member('{RESTORED}', 'pending', '', ''); "
          f"SELECT (submitted_at IS NOT NULL)::text FROM profile_private WHERE id = '{RESTORED}'", as_user=ADMIN,
          expect="pending\ntrue")
    check("... so a rejection after that can be undone",
          f"SELECT public.review_member('{RESTORED}', 'rejected', 'Sorry', ''); "
          f"SELECT public.review_member('{RESTORED}', 'pending', '', 'Undo', NULL, NULL, 'rejected')", as_user=ADMIN,
          expect="rejected\npending")

    # --- the migration's changes to existing rows (R3, R4, R21) -------------
    # Members as an earlier site or the Phase 1 reset left them; then the
    # migration's EXISTING DATA section runs again; then everything is undone.
    rahul, sunil, meena, nina = (f"00000000-0000-0000-0000-0000000001{n}" for n in ("01", "02", "03", "04"))
    check("existing rows: names and submission dates", f"""
          BEGIN;
          INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
            ('{rahul}', 'rahul@gmail.com', '{{"full_name": "rahul"}}'),
            ('{sunil}', 'sunil@example.com', '{{}}'),
            ('{meena}', 'meena@example.com', '{{"name": "meena"}}'),
            ('{nina}', 'nina@example.com', '{{}}');
          UPDATE profiles SET name = 'sunil' WHERE id = '{sunil}';
          UPDATE profiles SET name = 'nina@example.com' WHERE id = '{nina}';
          UPDATE profile_private SET verification_status = 'approved'
            WHERE id IN ('{rahul}', '{sunil}', '{meena}');
          UPDATE profile_private SET verification_status = 'rejected' WHERE id = '{nina}';
          {migration_section("EXISTING DATA")}
          SELECT string_agg(pp.email || '=' || p.name || '/' ||
                            COALESCE((pp.submitted_at = pp.created_at)::text, 'none'), ',' ORDER BY pp.email)
          FROM profiles p JOIN profile_private pp USING (id)
          WHERE p.id IN ('{rahul}', '{sunil}', '{meena}', '{nina}');
          ROLLBACK;""",
          expect="meena@example.com=meena/true,nina@example.com=/none,"
                 "rahul@gmail.com=rahul/true,sunil@example.com=/true")
    omar = "00000000-0000-0000-0000-000000000105"
    check("existing rows: a rejected member whose history shows they sent details gets the first date (R4)", f"""
          BEGIN;
          INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ('{omar}', 'omar@example.com', '{{"full_name": "Omar O"}}');
          UPDATE profile_private SET verification_status = 'rejected' WHERE id = '{omar}';
          INSERT INTO verification_log (member_id, decision, actor_id, created_at)
            VALUES ('{omar}', 'submitted', '{omar}', '2026-09-05 12:00'), ('{omar}', 'submitted', '{omar}', '2026-09-01 12:00');
          {migration_section("EXISTING DATA")}
          SELECT submitted_at::date FROM profile_private WHERE id = '{omar}';
          ROLLBACK;""", expect="2026-09-01")



def review_fixes_3():
    """Fixes from the second round of review (Q1-Q12; Q1 and Q3 are checked
    above, next to the checks they changed)."""

    # --- links with accented or non-Latin names keep a match key (Q2) -------
    jose = "linkedin.com/in/jos%C3%A9-garc%C3%ADa-1a2b3c"
    for uid, email in [(JOSE1, "jose1@example.com"), (JOSE2, "jose2@example.com"), (JOSE3, "jose3@example.com")]:
        sign_up(uid, email, {"full_name": "Jose G"}, accept_terms=True)
    check("a link whose name has an escaped separator is refused at submit (Q2)",
          "SELECT public.submit_verification('Madrid', 'ES', '', 'linkedin.com/in/jose-g%2Fdetails', '', '', NULL)",
          as_user=JOSE1, error_has="look like a LinkedIn profile link")
    check("... and on a profile edit",
          "UPDATE profiles SET linkedin_url = 'linkedin.com/in/jose-g%20' WHERE id = auth.uid()",
          as_user=JOSE1, error_has="look like a LinkedIn profile link")
    check("two accounts send the same link with an accented name",
          f"SELECT public.submit_verification('Madrid', 'ES', '', '{jose}', '', '', NULL)", as_user=JOSE1, expect="pending")
    check("... (written a little differently)",
          "SELECT public.submit_verification('Madrid', 'ES', '', 'https://es.linkedin.com/in/JOS%c3%a9-Garc%C3%ADa-1a2b3c/', "
          "'', '', NULL)", as_user=JOSE2, expect="pending")
    check("... and the admin queue counts each as used by one other account",
          "SELECT string_agg(same_linkedin_count::text, ',') FROM public.admin_verification_queue() "
          f"WHERE id IN ('{JOSE1}', '{JOSE2}')", as_user=ADMIN, expect="1,1")
    check("admin rejects the first",
          f"SELECT public.review_member('{JOSE1}', 'rejected', 'We could not verify you.', 'fake profile (jose)')",
          as_user=ADMIN, expect="rejected")
    check("... whose record keeps the link's key",
          f"SELECT linkedin_slug FROM private.moderation_record WHERE member_id = '{JOSE1}'",
          expect="jos%c3%a9-garc%c3%ada-1a2b3c")
    check("a third account sending the identical link is held",
          f"SELECT public.submit_verification('Madrid', 'ES', '', '{jose}', '', '', NULL); "
          "SELECT review_flag FROM profile_private", as_user=JOSE3, expect="pending\nheld")
    check("... and the admin sees why, and that two other accounts use the link",
          "SELECT concat_ws('|', flag_decision, flag_matched_on, flag_note, same_linkedin_count) "
          f"FROM public.admin_verification_queue() WHERE id = '{JOSE3}'", as_user=ADMIN,
          expect="rejected|linkedin|fake profile (jose)|2")

    # --- the duplicate count doesn't compute every member's key (Q12) -------
    check("profiles are indexed on their LinkedIn match key (Q12)",
          "SELECT pg_get_indexdef(i.indexrelid) || '|' || i.indisvalid FROM pg_index i "
          "WHERE i.indexrelid = 'public.idx_profiles_linkedin_slug'::regclass",
          expect="CREATE INDEX idx_profiles_linkedin_slug ON public.profiles USING btree "
                 "(private.linkedin_slug(linkedin_url))|true")

    # --- an unconfirmed signup doesn't record the address's owner (Q5) ------
    sign_up(SPAMMER, "anita.rao+deals@example.net", {"full_name": "CHEAP FOLLOWERS dm me"}, confirmed=False)
    check("someone else's address, never confirmed, with a link set before any review",
          f"UPDATE profiles SET linkedin_url = 'https://www.linkedin.com/in/cheap-followers' WHERE id = '{SPAMMER}'; "
          f"SELECT email_verified::text FROM profiles WHERE id = '{SPAMMER}'", expect="false")
    check("admin rejects the unfinished signup",
          f"SELECT public.review_member('{SPAMMER}', 'rejected', 'Spam', 'spam signup', NULL, NULL, 'incomplete')",
          as_user=ADMIN, expect="rejected")
    check("admin blocks it too", block(SPAMMER), as_user=ADMIN, expect="blocked")
    check("the records keep the link and the note, but not the unconfirmed address (Q5)",
          "SELECT string_agg(concat_ws('|', decision, linkedin_slug, admin_note, (email_hash IS NULL)::text), ',' "
          f"ORDER BY decision) FROM private.moderation_record WHERE member_id = '{SPAMMER}'",
          expect="blocked|cheap-followers||true,rejected|cheap-followers|spam signup|true")
    sign_up(ANITA, "Anita.Rao@example.net", {"full_name": "Anita Rao"}, accept_terms=True)
    check("so the address's owner isn't held when she signs up",
          f"SELECT review_flag FROM profile_private WHERE id = '{ANITA}'", expect="")

    # --- a block from the Reports page records the reviewed link (Q6) -------
    sign_up(TROLL, "troll@example.com", {"full_name": "Troll T"}, accept_terms=True)
    check("troll submits their own link", "SELECT public.submit_verification('Pune', 'IN', '', "
          "'linkedin.com/in/troll-own', '', '', NULL)", as_user=TROLL, expect="pending")
    check("admin approves them", f"SELECT public.review_member('{TROLL}', 'approved', '', '')", as_user=ADMIN,
          expect="approved")
    check("they put someone else's link on their profile, which sends them back to review, where they wait (C3)",
          "UPDATE profiles SET linkedin_url = 'linkedin.com/in/priya-sharma-q6' WHERE id = auth.uid(); "
          "SELECT (SELECT verification_status FROM profile_private) || '|' || "
          "(SELECT count(*) > 1 FROM profiles)", as_user=TROLL, expect="pending|false")
    check("members can't read or write the reviewed links",
          f"INSERT INTO private.reviewed_link (member_id, linkedin_url) VALUES ('{TROLL}', 'x')",
          as_user=TROLL, expect="error")
    check("... (or read them)", "SELECT count(*) FROM private.reviewed_link", as_user=TROLL, expect="error")
    check("admin blocks them from the Reports page", block(TROLL), as_user=ADMIN, expect="blocked")
    check("the record has the link the admin approved, not the one put there since (Q6)",
          f"SELECT decision || '|' || linkedin_slug FROM private.moderation_record WHERE member_id = '{TROLL}'",
          expect="blocked|troll-own")
    check("troll deletes the account", "SELECT public.delete_my_account()", as_user=TROLL)
    check("... and its reviewed link goes with it",
          f"SELECT count(*) FROM private.reviewed_link WHERE member_id = '{TROLL}'", expect="0")
    sign_up(VICTIM, "priya.sharma.q6@example.com", {"full_name": "Priya Sharma"}, accept_terms=True)
    check("the link's owner submits it and isn't held",
          "SELECT public.submit_verification('Berlin', 'DE', '', 'https://de.linkedin.com/in/priya-sharma-q6/', '', '', NULL); "
          "SELECT review_flag FROM profile_private", as_user=VICTIM, expect="pending")
    check("... and takes part once approved, as everyone does",
          f"SELECT public.review_member('{VICTIM}', 'approved', '', '')", as_user=ADMIN, expect="approved")
    check("... (checked)", f"INSERT INTO posts (user_id, content) VALUES ('{VICTIM}', 'hello') RETURNING 1",
          as_user=VICTIM, expect="1")
    sign_up(ROGUE, "rogue@example.com", {"full_name": "Rogue R"}, accept_terms=True)
    check("a member blocked before any admin looked at their details",
          "SELECT public.submit_verification('Pune', 'IN', '', 'linkedin.com/in/someone-famous', '', '', NULL)",
          as_user=ROGUE, expect="pending")
    check("... (from the Reports page)", block(ROGUE), as_user=ADMIN, expect="blocked")
    check("... records the link they had when blocked (the Reports page shows it)",
          f"SELECT decision || '|' || COALESCE(linkedin_slug, 'none') FROM private.moderation_record "
          f"WHERE member_id = '{ROGUE}'", expect="blocked|someone-famous")
    check("rogue deletes the account", "SELECT public.delete_my_account()", as_user=ROGUE)
    sign_up(ROGUE2, "rogue.again@example.com", {"full_name": "Rogue Again"}, accept_terms=True)
    check("... and comes back with a new address and the same link: held",
          "SELECT public.submit_verification('Pune', 'IN', '', 'linkedin.com/in/someone-famous', '', '', NULL); "
          "SELECT review_flag FROM profile_private", as_user=ROGUE2, expect="pending\nheld")

    # --- the hold's decision after it was reversed and made again (Q7) ------
    sign_up(BAD, "bad@example.com", {"full_name": "Bad Actor"}, accept_terms=True)
    sign_up(HAL, "hal@example.com", {"full_name": "Hal H"}, accept_terms=True)
    check("bad submits", "SELECT public.submit_verification('Pune', 'IN', '', 'linkedin.com/in/bad-q7', '', '', NULL)",
          as_user=BAD, expect="pending")
    check("admin rejects bad", f"SELECT public.review_member('{BAD}', 'rejected', 'Not verified.', 'note1')",
          as_user=ADMIN, expect="rejected")
    check("hal sends the same link and is held",
          "SELECT public.submit_verification('Pune', 'IN', '', 'linkedin.com/in/bad-q7', '', '', NULL); "
          "SELECT review_flag FROM profile_private", as_user=HAL, expect="pending\nheld")
    hold = ("SELECT concat_ws('|', review_flag, COALESCE(flag_decision, '-'), flag_matched_on, COALESCE(flag_note, '-'), "
            f"(flag_date IS NOT NULL)::text) FROM public.admin_verification_queue() WHERE id = '{HAL}'")
    check("... and the queue says what hal matched", hold, as_user=ADMIN, expect="held|rejected|linkedin|note1|true")
    check("admin moves bad back to pending", f"SELECT public.review_member('{BAD}', 'pending', '', '')",
          as_user=ADMIN, expect="pending")
    check("... so hal's match was reversed (hal stays held)", hold, as_user=ADMIN, expect="held|-|linkedin|-|false")
    check("admin rejects bad again with another note",
          f"SELECT public.review_member('{BAD}', 'rejected', 'Still not verified.', 'note2')", as_user=ADMIN,
          expect="rejected")
    check("... and the queue shows hal matching that decision (Q7)", hold, as_user=ADMIN,
          expect="held|rejected|linkedin|note2|true")
    check("... while hal still waits for an admin",
          f"INSERT INTO posts (user_id, content) VALUES ('{HAL}', 'hi')", as_user=HAL, expect="error")

    # --- the migration's changes to existing rows (Q2, Q5) ------------------
    zoe, yan = "00000000-0000-0000-0000-000000000106", "00000000-0000-0000-0000-000000000107"
    check("existing rows: records of rejected and blocked members keep any link's key, and only a confirmed email", f"""
          BEGIN;
          INSERT INTO auth.users (id, email, raw_user_meta_data, email_confirmed_at) VALUES
            ('{zoe}', 'zoe@example.com', '{{"full_name": "Zoe Z"}}', now()),
            ('{yan}', 'yan@example.com', '{{"full_name": "Yan Y"}}', NULL);
          UPDATE profiles SET linkedin_url = 'https://www.linkedin.com/in/z%c3%b6e-z' WHERE id = '{zoe}';
          UPDATE profiles SET linkedin_url = 'https://www.linkedin.com/in/yan-y' WHERE id = '{yan}';
          ALTER TABLE public.profile_private DISABLE TRIGGER moderation_record;
          UPDATE profile_private SET verification_status = 'rejected' WHERE id = '{zoe}';
          UPDATE profile_private SET status = 'blocked' WHERE id = '{yan}';
          ALTER TABLE public.profile_private ENABLE TRIGGER moderation_record;
          {migration_section("EXISTING DATA")}
          SELECT string_agg(decision || '=' || linkedin_slug || '/' || (email_hash IS NOT NULL), ',' ORDER BY decision)
          FROM private.moderation_record WHERE member_id IN ('{zoe}', '{yan}');
          ROLLBACK;""", expect="blocked=yan-y/false,rejected=z%c3%b6e-z/true")



def access_consent():
    """Who takes part, the Art. 9 consent and the Terms history (migration
    20261019000000_access_consent; C3, C8 and C22 are checked above, next to
    the checks they changed), blocked accounts (C14) and ambassadors (C26)."""

    # --- ambassadors are active, verified members (C26) ---------------------
    sign_up(AMBA, "amba@example.com", {"full_name": "Amba A"}, accept_terms=True)
    check("amba sends her details", "SELECT public.submit_verification('Berlin', 'DE', '', 'linkedin.com/in/amba-a', "
          "'', '', NULL)", as_user=AMBA, expect="pending")
    make_ambassador = f"SELECT public.admin_set_ambassador('{AMBA}', 'Berlin')"
    is_ambassador = f"SELECT ambassador_city FROM profiles WHERE id = '{AMBA}'"
    check("a member waiting for review can't be made an ambassador", make_ambassador, as_user=ADMIN,
          error_has="Only active, verified members can be ambassadors.")
    check("admin approves amba", f"SELECT public.review_member('{AMBA}', 'approved', '', '')", as_user=ADMIN,
          expect="approved")
    check("... and makes her Berlin's ambassador", make_ambassador, as_user=ADMIN, expect="Berlin")
    check("members can't make themselves ambassadors",
          "UPDATE profiles SET ambassador_city = 'Munich' WHERE id = auth.uid() RETURNING ambassador_city",
          as_user=AMBA, expect="Berlin")
    check("blocking an ambassador ends the role", f"{block(AMBA)}; {is_ambassador}", as_user=ADMIN, expect="blocked")
    check("... and a blocked member can't be made one", make_ambassador, as_user=ADMIN,
          error_has="Only active, verified members")
    check("admins can't set it by hand (C23)",
          f"UPDATE profiles SET ambassador_city = 'Berlin', bio = '' WHERE id = '{AMBA}' RETURNING 1", as_user=ADMIN, expect="")
    check("unblocked, she can be made one again", f"{unblock(AMBA)}; {make_ambassador}", as_user=ADMIN,
          expect="active\nBerlin")
    check("moving an ambassador back to review ends the role",
          f"SELECT public.review_member('{AMBA}', 'pending', '', ''); {is_ambassador}", as_user=ADMIN,
          expect="pending")
    check("... as does changing her name after approval",
          f"SELECT public.review_member('{AMBA}', 'approved', '', ''); {make_ambassador}", as_user=ADMIN,
          expect="approved\nBerlin")
    check("... (renamed)", f"UPDATE profiles SET name = 'Amba B' WHERE id = auth.uid(); {is_ambassador}",
          as_user=AMBA, expect="")
    check("... and rejecting her",
          f"SELECT public.review_member('{AMBA}', 'approved', '', ''); {make_ambassador}; "
          f"SELECT public.review_member('{AMBA}', 'rejected', 'Sorry.', ''); {is_ambassador}", as_user=ADMIN,
          expect="approved\nBerlin\nrejected")
    check("members only see active, verified ambassadors",
          "SELECT count(*) FROM profiles WHERE ambassador_city <> ''", as_user=ALICE, expect="0")

    # --- the migration's changes to existing rows (C22, C26) -----------------
    kiran, lata = "00000000-0000-0000-0000-000000000304", "00000000-0000-0000-0000-000000000305"
    check("existing rows: each member's current acceptance starts their history, "
          "and ambassadors who can't take part lose the role", f"""
          BEGIN;
          INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
            ('{kiran}', 'kiran@example.com', '{{"full_name": "Kiran K"}}'),
            ('{lata}', 'lata@example.com', '{{"full_name": "Lata L"}}');
          UPDATE profile_private SET verification_status = 'approved', age_confirmed_at = '2026-10-01',
            terms_accepted_at = '2026-10-02', terms_version = '2026-10' WHERE id IN ('{kiran}', '{lata}');
          UPDATE profiles SET ambassador_city = 'Pune' WHERE id IN ('{kiran}', '{lata}');
          ALTER TABLE public.profile_private DISABLE TRIGGER end_ambassador_when_inactive;
          UPDATE profile_private SET status = 'blocked' WHERE id = '{lata}';
          ALTER TABLE public.profile_private ENABLE TRIGGER end_ambassador_when_inactive;
          {migration_section("EXISTING DATA", ACCESS_CONSENT)}
          SELECT string_agg(p.name || '=' || p.ambassador_city || '/' ||
                            (SELECT string_agg(a.kind || ':' || a.version || ':' || a.accepted_at::date, ';')
                             FROM terms_acceptances a WHERE a.member_id = p.id), ',' ORDER BY p.name)
          FROM profiles p WHERE p.id IN ('{kiran}', '{lata}');
          ROLLBACK;""", expect="Kiran K=Pune/terms:2026-10:2026-10-02,Lata L=/terms:2026-10:2026-10-02")


def approved_member(uid, email, name, city="Berlin"):
    """A member an admin has approved: signed up, 18+, Terms and Art. 9
    consent given, details sent (city), approved."""
    sign_up(uid, email, {"full_name": name}, accept_terms=True)
    ok, _, err = psql(f"UPDATE profiles SET city = '{city}' WHERE id = '{uid}'; "
                      f"UPDATE profile_private SET verification_status = 'approved' WHERE id = '{uid}'")
    if not ok:
        sys.exit(f"approving {email} failed: {err}")


def notifications_limits_privacy():
    """Notifications the database writes and reserved names (C5), limits
    (C13), public city pages (C17), what members see of each other (C18),
    clean-up and signup data (C20), "Download my data" (C21) and the contact
    address in member content (C10): migration
    20261020000000_notifications_limits_privacy."""
    nia, om, pia, raj, sam = (f"00000000-0000-0000-0000-0000000004{n}" for n in ("01", "02", "03", "04", "05"))
    approved_member(nia, "nia@example.com", "Nia N")
    approved_member(om, "om@example.com", "Om O")
    approved_member(pia, "pia@example.com", "Pia P")
    nia_post = "10000000-0000-0000-0000-000000000401"
    notes = (f"SELECT count(*) || '|' || COALESCE(string_agg(type || ':' || read || ':' || text, ';' ORDER BY created_at), '') "
             f"FROM notifications WHERE user_id = '{nia}' AND actor_id = '{om}'")

    # --- notifications the database writes (C5) ------------------------------
    check("nia posts", f"INSERT INTO posts (id, user_id, content) VALUES ('{nia_post}', auth.uid(), "
          "'Diwali   party at my place\nthis Saturday, everyone welcome!') RETURNING 1", as_user=nia, expect="1")
    check("om likes nia's post", f"INSERT INTO likes (post_id, user_id) VALUES ('{nia_post}', auth.uid()) RETURNING 1",
          as_user=om, expect="1")
    check("... nia hears about it in the database's words (her post, nothing om wrote)", notes,
          expect="1|like:false:liked your post: Diwali party at my place this Saturday, everyone welcome!")
    check("liking, unliking and liking again",
          f"DELETE FROM likes WHERE user_id = auth.uid(); INSERT INTO likes (post_id, user_id) VALUES ('{nia_post}', auth.uid()); "
          f"DELETE FROM likes WHERE user_id = auth.uid(); INSERT INTO likes (post_id, user_id) VALUES ('{nia_post}', auth.uid()) "
          "RETURNING 1", as_user=om, expect="1")
    check("... notifies once", f"SELECT count(*) FROM notifications WHERE user_id = '{nia}'", expect="1")
    check("liking your own post notifies nobody",
          f"INSERT INTO likes (post_id, user_id) VALUES ('{nia_post}', auth.uid()); "
          "SELECT count(*) FROM notifications WHERE user_id = auth.uid()", as_user=nia, expect="1")
    check("om comments", f"INSERT INTO comments (post_id, user_id, content) VALUES ('{nia_post}', auth.uid(), "
          "'Count me in!') RETURNING 1", as_user=om, expect="1")
    check("... nia hears about it with the start of the comment",
          f"SELECT text FROM notifications WHERE user_id = '{nia}' AND type = 'comment'",
          expect="commented on your post: Count me in!")
    check("a second comment", f"INSERT INTO comments (post_id, user_id, content) VALUES ('{nia_post}', auth.uid(), "
          "'Bringing sweets') RETURNING 1", as_user=om, expect="1")
    check("... while nia hasn't read the first updates it instead of adding another",
          f"SELECT count(*) || '|' || string_agg(text, ';') FROM notifications WHERE user_id = '{nia}' AND type = 'comment'",
          expect="1|commented on your post: Bringing sweets")
    check("nia reads it", "UPDATE notifications SET read = true WHERE user_id = auth.uid() AND type = 'comment' RETURNING 1",
          as_user=nia, expect="1")
    check("om comments again", f"INSERT INTO comments (post_id, user_id, content) VALUES ('{nia_post}', auth.uid(), "
          "'See you there') RETURNING 1", as_user=om, expect="1")
    check("... once she has read the first, the next comment notifies again (one notification, unread)",
          f"SELECT count(*) || '|' || string_agg(read || ':' || text, ';') FROM notifications "
          f"WHERE user_id = '{nia}' AND type = 'comment'", expect="1|false:commented on your post: See you there")
    check("a member back in review hears nothing of a further comment (not even in the waiting notification)", f"""
          BEGIN;
          UPDATE profile_private SET verification_status = 'pending' WHERE id = '{nia}';
          SET ROLE authenticated; SET request.jwt.claims = '{{"sub": "{om}", "role": "authenticated"}}';
          INSERT INTO comments (post_id, user_id, content) VALUES ('{nia_post}', auth.uid(), 'Secret plans');
          RESET ROLE;
          SELECT string_agg(text, ';') FROM notifications WHERE user_id = '{nia}' AND type = 'comment';
          ROLLBACK;""", expect="commented on your post: See you there")
    check("om asks nia for a Namaste",
          f"INSERT INTO connections (id, requester_id, recipient_id) VALUES ('20000000-0000-0000-0000-000000000401', auth.uid(), '{nia}') "
          "RETURNING 1", as_user=om, expect="1")
    check("... one notification, pointing at the request",
          f"SELECT text || '|' || reference_id FROM notifications WHERE user_id = '{nia}' AND type = 'request'",
          expect="sent you a Namaste request|20000000-0000-0000-0000-000000000401")
    check("nia ignores it; om withdraws and asks again: still one notification, now for the new request",
          f"UPDATE notifications SET read = true WHERE user_id = '{nia}' AND type = 'request'; "
          f"UPDATE connections SET status = 'blocked' WHERE id = '20000000-0000-0000-0000-000000000401'; "
          f"DELETE FROM connections WHERE id = '20000000-0000-0000-0000-000000000401'; "
          f"INSERT INTO connections (id, requester_id, recipient_id) VALUES ('20000000-0000-0000-0000-000000000402', '{om}', '{nia}'); "
          f"SELECT count(*) || '|' || string_agg(read || ':' || reference_id, ';') FROM notifications WHERE user_id = '{nia}' AND type = 'request'",
          expect="1|false:20000000-0000-0000-0000-000000000402")
    check("nobody hears from someone they blocked",
          f"INSERT INTO blocks (blocker_id, blocked_id) VALUES ('{pia}', '{om}'); "
          f"INSERT INTO posts (id, user_id, content) VALUES ('10000000-0000-0000-0000-000000000402', '{pia}', 'Pia here'); "
          f"INSERT INTO comments (post_id, user_id, content) VALUES ('10000000-0000-0000-0000-000000000402', '{om}', 'hi'); "
          f"SELECT count(*) FROM notifications WHERE user_id = '{pia}'", expect="0")
    check("a deleted post takes its like and comment notifications with it",
          f"BEGIN; DELETE FROM posts WHERE id = '{nia_post}'; "
          f"SELECT count(*) FROM notifications WHERE user_id = '{nia}' AND type IN ('like', 'comment'); ROLLBACK;",
          expect="0")
    for kind, ref in (("like", nia_post), ("comment", nia_post), ("request", "20000000-0000-0000-0000-000000000402")):
        check(f"om can't write a {kind} notification himself, not even a true one",
              f"INSERT INTO notifications (user_id, type, actor_id, text, reference_id) VALUES "
              f"('{nia}', '{kind}', auth.uid(), 'NRIClub Security Team: your account will be deleted', '{ref}')",
              as_user=om, expect="error")
    check("the site asks which notifications the database writes",
          "SELECT array_to_string(public.server_notification_types(), ',')", as_user=om, expect="like,comment,request")
    check("... (signed-in members only)", "SELECT public.server_notification_types()", role="anon", expect="error")

    # --- names (C5) -----------------------------------------------------------
    for name in ("NRIClub Support", "N.R.I. Club", "nri-club team", "Admin", "Om (Moderator)", "Official NRIClub",
                 "Priya from the Team", "Staff", "\uff2e\uff32\uff29\uff23\uff4c\uff55\uff42", "\u24b6dmin Arjun",
                 "Adm\u00edn", "Ad\u00admin"):
        check(f"a member can't call themselves {name!r}",
              f"UPDATE profiles SET name = '{name}' WHERE id = auth.uid()", as_user=pia,
              error_has="Names like NRIClub, Admin, Support or Team are kept for the NRIClub team.")
    check("names that only contain such letters are fine (and don't count as a change when unchanged)",
          "UPDATE profiles SET name = 'Henri Clubb Steamworth' WHERE id = auth.uid(); "
          "UPDATE profiles SET name = 'Henri Clubb Steamworth' WHERE id = auth.uid() RETURNING name",
          as_user=pia, expect="Henri Clubb Steamworth")
    check("invisible direction and zero-width characters are removed from names (blank-looking ones too)",
          "UPDATE profiles SET name = E'Pia\u202E\u200B  P\u2066\u00AD\u3164' WHERE id = auth.uid() RETURNING name",
          as_user=pia, expect="Pia P")
    check("a third change in 30 days works",
          "UPDATE profiles SET name = 'Pia Patel' WHERE id = auth.uid() RETURNING name", as_user=pia, expect="Pia Patel")
    check("... a fourth doesn't",
          "UPDATE profiles SET name = 'Pia Q' WHERE id = auth.uid()", as_user=pia,
          error_has="You can change your name 3 times in 30 days.")
    check("members can't see or reset the count", "DELETE FROM private.name_changes", as_user=pia, expect="error")
    check("an admin can't rename her (admins change members only through the audited functions, C23)",
          f"UPDATE profiles SET name = 'Pia Patel-Rao' WHERE id = '{pia}' RETURNING name", as_user=ADMIN,
          expect="")
    check("... and approve her again (a new name sends a member back to review)",
          f"SELECT public.review_member('{pia}', 'approved', '', '')", as_user=ADMIN, expect="approved")
    check("... and use a team name for an account",
          f"UPDATE profiles SET name = 'NRIClub Team' WHERE id = auth.uid() RETURNING name", as_user=ADMIN,
          expect="NRIClub Team")
    check("a signup with a team name gets an empty name (chosen again in Settings)",
          f"""INSERT INTO auth.users (id, email, raw_user_meta_data, email_confirmed_at) VALUES
            ('{raj}', 'raj@example.com', '{{"full_name": "NRIClub Support"}}', now());
          SELECT '[' || name || ']' FROM profiles WHERE id = '{raj}'""", expect="[]")
    check("... a normal name is kept, cleaned",
          f"""INSERT INTO auth.users (id, email, raw_user_meta_data, email_confirmed_at) VALUES
            ('{sam}', 'sam@example.com', '{{"full_name": "Sam\u202e S", "hometown": "Pune", "location": "Paris", "profession": "Spy"}}', now());
          SELECT name FROM profiles WHERE id = '{sam}'""", expect="Sam S")

    # --- signup data (C20) ------------------------------------------------------
    check("Supabase Auth keeps only the name from the signup data",
          f"SELECT string_agg(k, ',' ORDER BY k) FROM auth.users u, jsonb_object_keys(u.raw_user_meta_data) k "
          f"WHERE u.id = '{sam}'", expect="full_name")
    check("... also when it's changed later",
          f"UPDATE auth.users SET raw_user_meta_data = raw_user_meta_data || '{{\"hometown\": \"Pune\", \"email_verified\": true}}' "
          f"WHERE id = '{sam}'; SELECT string_agg(k, ',' ORDER BY k) FROM auth.users u, jsonb_object_keys(u.raw_user_meta_data) k "
          f"WHERE u.id = '{sam}'", expect="email_verified,full_name")

    # --- limits (C13) -----------------------------------------------------------
    too_often = "You're doing that too often. Please wait a little and try again."
    check("20 posts in a day are fine",
          "INSERT INTO posts (user_id, content) SELECT auth.uid(), 'post ' || g FROM generate_series(1, 19) g; "
          "SELECT count(*) FROM posts WHERE user_id = auth.uid()", as_user=nia, expect="20")
    check("... the 21st isn't", "INSERT INTO posts (user_id, content) VALUES (auth.uid(), 'one more')", as_user=nia,
          error_has=too_often)
    check("... not even after deleting some",
          "DELETE FROM posts WHERE user_id = auth.uid() AND content LIKE 'post %'; "
          "INSERT INTO posts (user_id, content) VALUES (auth.uid(), 'one more')", as_user=nia, error_has=too_often)
    check("a refused post isn't counted, nor what a policy refuses",
          "SELECT count(*) FROM private.rate_log WHERE action = 'post' AND member_id = "
          f"'{nia}'", expect="20")
    check("members can't read or clear the counts", "DELETE FROM private.rate_log", as_user=nia, expect="error")
    check("admins have no limit",
          "INSERT INTO posts (user_id, content) SELECT auth.uid(), 'starter ' || g FROM generate_series(1, 25) g RETURNING 1",
          as_user=ADMIN, expect="\n".join(["1"] * 25))
    check("nor does the database itself (e.g. the SQL editor)",
          f"INSERT INTO posts (user_id, content) SELECT '{nia}', 'imported ' || g FROM generate_series(1, 3) g RETURNING 1",
          expect="1\n1\n1")
    convo = "30000000-0000-0000-0000-000000000401"
    check("30 messages a minute are fine",
          f"INSERT INTO conversations (id, participant_1, participant_2) VALUES ('{convo}', auth.uid(), '{nia}'); "
          f"INSERT INTO messages (conversation_id, sender_id, content) SELECT '{convo}', auth.uid(), 'm' || g "
          "FROM generate_series(1, 30) g; SELECT count(*) FROM messages WHERE sender_id = auth.uid()", as_user=pia,
          expect="30")
    check("... the 31st isn't",
          f"INSERT INTO messages (conversation_id, sender_id, content) VALUES ('{convo}', auth.uid(), 'spam')",
          as_user=pia, error_has=too_often)
    check("... and the other member can still answer",
          f"INSERT INTO messages (conversation_id, sender_id, content) VALUES ('{convo}', auth.uid(), 'slow down') RETURNING 1",
          as_user=nia, expect="1")
    check("20 reports a day are fine (and feedback counts apart)",
          "INSERT INTO reports (reporter_id, reported_post_id, reason) SELECT auth.uid(), gen_random_uuid(), '[POST] spam' "
          "FROM generate_series(1, 20) g; INSERT INTO reports (reporter_id, reported_post_id, reason) "
          "VALUES (auth.uid(), auth.uid(), '[BUG] Home | The feed is empty'); "
          "SELECT count(*) FROM reports WHERE reporter_id = auth.uid()", as_user=om, expect="21")
    check("... the 21st isn't", "INSERT INTO reports (reporter_id, reported_user_id, reason) "
          f"VALUES (auth.uid(), '{nia}', 'rude')", as_user=om, error_has=too_often)
    check("feedback: 5 a day",
          "INSERT INTO reports (reporter_id, reported_post_id, reason) SELECT auth.uid(), auth.uid(), '[IDEA] idea ' || g "
          "FROM generate_series(1, 4) g; INSERT INTO reports (reporter_id, reported_post_id, reason) "
          "VALUES (auth.uid(), auth.uid(), '[IDEA] one more')", as_user=om, error_has=too_often)
    check("the same report twice is kept once, quietly",
          f"INSERT INTO reports (reporter_id, reported_post_id, reason) VALUES (auth.uid(), '{nia_post}', '[POST] spam'); "
          f"INSERT INTO reports (reporter_id, reported_post_id, reason) VALUES (auth.uid(), '{nia_post}', '[POST] spam again'); "
          f"SELECT count(*) FROM reports WHERE reporter_id = auth.uid() AND reported_post_id = '{nia_post}'",
          as_user=pia, expect="1")
    check("... and not counted", f"SELECT count(*) FROM private.rate_log WHERE member_id = '{pia}' AND action = 'report'",
          expect="1")
    check("a report in someone else's name is refused, even a copy of theirs (no hint what they reported)",
          f"INSERT INTO reports (reporter_id, reported_post_id, reason) VALUES ('{pia}', '{nia_post}', '[POST] spam')",
          as_user=om, expect="error")
    check("5 group requests a day",
          "INSERT INTO groups (name, created_by) SELECT 'Indians in Town ' || g, auth.uid() FROM generate_series(1, 5) g; "
          "INSERT INTO groups (name, created_by) VALUES ('Indians in Town 6', auth.uid())", as_user=pia, error_has=too_often)
    check("50 Namaste requests a day, withdrawn or not",
          f"""DO $$ BEGIN
                FOR i IN 1..50 LOOP
                  INSERT INTO public.connections (requester_id, recipient_id) VALUES (auth.uid(), '{nia}');
                  DELETE FROM public.connections WHERE requester_id = auth.uid() AND recipient_id = '{nia}';
                END LOOP;
              END $$""", as_user=pia)
    check("... the 51st isn't", f"INSERT INTO connections (requester_id, recipient_id) VALUES (auth.uid(), '{nia}')",
          as_user=pia, error_has=too_often)
    check("... and nia has one notification from pia, not 50",
          f"SELECT count(*) FROM notifications WHERE user_id = '{nia}' AND actor_id = '{pia}'", expect="1")

    # --- public city pages (C17) ---------------------------------------------------
    berlin = "70000000-0000-0000-0000-000000000401"
    check("setup: a Berlin group and events",
          f"INSERT INTO groups (id, name, category, is_approved, members_count) VALUES "
          f"('{berlin}', 'Indians in Berlin', 'City', true, 4), "
          f"('70000000-0000-0000-0000-000000000402', 'Indians in Forchheim', 'City', true, 1), "
          f"('70000000-0000-0000-0000-000000000403', 'Indians in Zürich', 'City', true, 7); "
          f"INSERT INTO events (title, date, location, city, organizer_id) "
          f"SELECT 'Meetup ' || g, to_char(CURRENT_DATE + g, 'YYYY-MM-DD'), 'Tempelhofer Feld, my flat 3', "
          f"CASE WHEN g <= 6 THEN 'Berlin' ELSE 'Munich' END, '{ADMIN}' FROM generate_series(1, 8) g")
    summary = "SELECT public.city_summary('{}')::text"
    for probe in ("Tempelhofer%", "T_mpelhofer", "%", "_", "Ber%", "Berlin;--", "a" * 61):
        check(f"city_summary answers nothing to {probe[:20]!r}", summary.format(probe.replace("'", "''")), role="anon",
              expect="")
    check("a small group shows no number of members, events counted by city only",
          summary.format("berlin"), role="anon",
          expect='{"city": "Berlin", "group": true, "events": 6, "places": 1, "members": null}')
    check("... the event count needs 5 too",
          "SELECT public.city_summary('Munich')->>'events'", role="anon", expect="")
    check("a group with 5 or more shows its members, accents and all",
          "SELECT public.city_summary('Zürich')->>'members'", role="anon", expect="7")
    check("public_cities hides numbers below 5 and lists those groups by name, after the others",
          "SELECT string_agg(city || '=' || COALESCE(members::text, '-'), ',') FROM public.public_cities() "
          "WHERE city IN ('Berlin', 'Forchheim', 'Zürich')", role="anon", expect="Zürich=7,Berlin=-,Forchheim=-")
    check("admin city numbers count the city's own events only",
          "SELECT events_upcoming FROM public.admin_city_stats() WHERE city = 'Berlin'", as_user=ADMIN, expect="6")

    # --- what members see of each other (C18) -------------------------------------
    check("members can't read LinkedIn links from profiles any more",
          "SELECT linkedin_url FROM profiles", as_user=om, error_has="permission denied")
    check("... nor everything at once (select=*)", "SELECT * FROM profiles", as_user=om, error_has="permission denied")
    check("... admins neither: they use profile_links", "SELECT linkedin_url FROM profiles", as_user=ADMIN,
          error_has="permission denied")
    # (Since 2026-10-25 new members show it to members unless they choose
    # "Only the NRIClub team"; nia chooses that.)
    check("setup: nia shows her link only to our team",
          "UPDATE profiles SET linkedin_public = false WHERE id = auth.uid()", as_user=nia)
    check("the other columns are readable",
          f"SELECT name || '|' || linkedin_public FROM profiles WHERE id = '{nia}'", as_user=om, expect="Nia N|false")
    check("setup: nia's LinkedIn link",
          f"UPDATE profiles SET linkedin_url = 'https://www.linkedin.com/in/nia-n' WHERE id = '{nia}'")
    check("nia sees her link", "SELECT linkedin_url || '|' || linkedin_public FROM public.profile_links(ARRAY[auth.uid()])",
          as_user=nia, expect="https://www.linkedin.com/in/nia-n|false")
    check("... other members don't", f"SELECT count(*) FROM public.profile_links(ARRAY['{nia}'::uuid])", as_user=om,
          expect="0")
    check("... admins do", f"SELECT linkedin_url FROM public.profile_links(ARRAY['{nia}'::uuid])", as_user=ADMIN,
          expect="https://www.linkedin.com/in/nia-n")
    check("once she shows it, members do",
          "UPDATE profiles SET linkedin_public = true WHERE id = auth.uid() RETURNING linkedin_public::text", as_user=nia,
          expect="true")
    check("... (checked)", f"SELECT linkedin_url FROM public.profile_links(ARRAY['{nia}'::uuid, '{pia}'::uuid])",
          as_user=om, expect="https://www.linkedin.com/in/nia-n")
    check("... but not members who can't see other members", f"SELECT count(*) FROM public.profile_links(ARRAY['{nia}'::uuid])",
          as_user=raj, expect="0")
    check("... nor signed-out visitors", f"SELECT * FROM public.profile_links(ARRAY['{nia}'::uuid])", role="anon",
          expect="error")
    check("profiles have no last_active any more",
          "SELECT count(*) FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'last_active'",
          expect="0")
    check("setup: nia's account last changed on 1 January",
          f"ALTER TABLE profile_private DISABLE TRIGGER set_updated_at; "
          f"UPDATE profile_private SET updated_at = '2026-01-01' WHERE id = '{nia}'; "
          f"ALTER TABLE profile_private ENABLE TRIGGER set_updated_at")
    check("a member's last activity is kept privately, by the server's clock",
          "UPDATE profile_private SET last_active = '2000-01-01' WHERE id = auth.uid() "
          "RETURNING (last_active > now() - interval '1 minute')::text", as_user=nia, expect="true")
    check("... and isn't a change to the account",
          f"SELECT updated_at::date FROM profile_private WHERE id = '{nia}'", expect="2026-01-01")
    check("... other members can't see it", f"SELECT count(*) FROM profile_private WHERE id = '{nia}'", as_user=om,
          expect="0")
    check("setup: places in Berlin recommended by nia and om",
          f"INSERT INTO places (id, city, name, kind, created_by) VALUES "
          f"('80000000-0000-0000-0000-000000000401', 'Berlin', 'Sri Ganesha Temple', 'Temple', '{nia}'), "
          f"('80000000-0000-0000-0000-000000000402', 'Berlin', 'Dr. Rao', 'Doctor', '{om}'); "
          f"INSERT INTO place_recommendations (place_id, user_id) VALUES "
          f"('80000000-0000-0000-0000-000000000401', '{nia}'), ('80000000-0000-0000-0000-000000000401', '{om}'), "
          f"('80000000-0000-0000-0000-000000000402', '{nia}')")
    check("members see only their own recommendations",
          "SELECT count(*) FROM place_recommendations", as_user=om, expect="1")
    check("... and how many members recommend each place",
          "SELECT string_agg(name || '=' || c.recommendations || '/' || c.mine, ',' ORDER BY name) "
          "FROM public.place_recommendation_counts('berlin') c JOIN places p ON p.id = c.place_id", as_user=om,
          expect="Dr. Rao=1/false,Spice Shop=0/false,Sri Ganesha Temple=2/true")
    check("... (not for members who can't see other members)",
          "SELECT count(*) FROM public.place_recommendation_counts('Berlin')", as_user=raj, expect="0")
    check("admins see who recommended what", "SELECT count(*) FROM place_recommendations", as_user=ADMIN, expect="3")
    check("other members' contact settings: only the two that matter",
          f"SELECT string_agg(column_name, ',' ORDER BY ordinal_position) FROM information_schema.columns "
          f"WHERE table_name = 'user_settings' AND column_name IN ('profile_visibility', 'online_status')", expect="")

    # --- Download my data (C21) -----------------------------------------------------
    check("the export has a readme pointing to the Privacy Policy",
          "SELECT position('https://nriclub.app/privacy' IN public.export_my_data()->'readme'->>'privacy_policy') = 1",
          as_user=nia, expect="t")
    check("... the account as Supabase Auth keeps it",
          "SELECT d->'account'->>'email' || '|' || (d->'account'->'signup_data')::text || '|' || (d->'account' ? 'last_sign_in_at') "
          "FROM (SELECT public.export_my_data() d) x", as_user=nia,
          expect='nia@example.com|{"full_name": "Nia N"}|true')
    check("... reports about her or her posts, without who sent them",
          f"SELECT jsonb_array_length(d->'reports_about_me') || '|' || (position('{pia}' IN (d->'reports_about_me')::text) = 0) "
          "FROM (SELECT public.export_my_data() d) x", as_user=nia, expect="1|true")
    check("setup: photo files and an urgent question",
          f"INSERT INTO storage.buckets (id, name) VALUES ('avatars', 'avatars') ON CONFLICT DO NOTHING; "
          f"INSERT INTO storage.objects (bucket_id, name) VALUES ('avatars', '{nia}/me.jpg'), ('avatars', '{om}/om.jpg'); "
          f"INSERT INTO private.urgent_log (user_id) VALUES ('{nia}')")
    check("... her photo files, urgent questions, name changes, limit counts and last activity",
          "SELECT concat_ws('|', d->'files'->0->>'name', jsonb_array_length(d->'files'), jsonb_array_length(d->'urgent_questions_sent'), "
          "jsonb_array_length(d->'name_changes'), d->'rate_limit_log'->0->>'action', d->'profile_private' ? 'last_active') "
          "FROM (SELECT public.export_my_data() d) x", as_user=nia,
          expect=f"{nia}/me.jpg|1|1|0|post|t")
    check("... reviews of her mentoring sessions (rating and comment, not who wrote them)",
          f"""BEGIN;
          INSERT INTO mentor_bookings (id, mentor_id, mentee_id, starts_at, duration_min)
            VALUES ('90000000-0000-0000-0000-000000000401', '{nia}', '{om}', now() - interval '2 days', 30);
          INSERT INTO mentor_reviews (booking_id, mentor_id, mentee_id, rating, comment)
            VALUES ('90000000-0000-0000-0000-000000000401', '{nia}', '{om}', 5, 'Very helpful');
          SET ROLE authenticated; SET request.jwt.claims = '{{"sub": "{nia}", "role": "authenticated"}}';
          SELECT string_agg(k, ',' ORDER BY k) FROM jsonb_object_keys(public.export_my_data()->'mentor_reviews_received'->0) k;
          ROLLBACK;""", expect="comment,created_at,rating")
    check("... and her sign-in sessions where Supabase Auth keeps them",
          f"""BEGIN;
          CREATE TABLE auth.sessions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, created_at timestamptz DEFAULT now(),
            updated_at timestamptz, refreshed_at timestamp, user_agent text, ip inet, refresh_token_hmac_key text);
          INSERT INTO auth.sessions (user_id, user_agent, ip, refresh_token_hmac_key)
            VALUES ('{nia}', 'Firefox', '10.1.2.3', 'secret'), ('{om}', 'Chrome', '10.9.9.9', 'secret');
          SET ROLE authenticated; SET request.jwt.claims = '{{"sub": "{nia}", "role": "authenticated"}}';
          SELECT jsonb_array_length(s) || '|' || (s->0->>'ip') || '|' || (s->0->>'user_agent') || '|' || (position('secret' IN s::text) = 0)
          FROM (SELECT public.export_my_data()->'sessions' AS s) x;
          ROLLBACK;""", expect="1|10.1.2.3|Firefox|true")

    # --- clean-up (C20) ----------------------------------------------------------------
    check("members can't run the clean-up", "SELECT private.daily_cleanup()", as_user=nia, expect="error")
    late = "00000000-0000-0000-0000-000000000510"
    check("an account our team sends back to unfinished today isn't deleted that night, though it signed up long ago", f"""
          BEGIN;
          INSERT INTO auth.users (id, email, raw_user_meta_data, email_confirmed_at, created_at) VALUES
            ('{late}', 'sent-back-today@example.com', '{{}}', now(), now() - interval '120 days');
          UPDATE profile_private SET created_at = now() - interval '120 days', verification_status = 'rejected',
            reviewed_at = now() - interval '5 days' WHERE id = '{late}';
          SET ROLE authenticated; SET request.jwt.claims = '{{"sub": "{ADMIN}", "role": "authenticated"}}';
          SELECT public.review_member('{late}', 'incomplete', '', '');
          RESET ROLE;
          SELECT (r->>'unfinished_accounts') || '|' || EXISTS (SELECT 1 FROM auth.users WHERE id = '{late}')
          FROM (SELECT private.daily_cleanup() r) x;
          ROLLBACK;""", expect="incomplete\n0|true")
    old = [f"00000000-0000-0000-0000-0000000005{n:02d}" for n in range(1, 8)]
    check("the clean-up deletes what the Privacy Policy says is deleted after a time, and nothing else", f"""
          BEGIN;
          INSERT INTO auth.users (id, email, raw_user_meta_data, email_confirmed_at, created_at) VALUES
            ('{old[0]}', 'unconfirmed-31d@example.com', '{{}}', NULL, now() - interval '31 days'),
            ('{old[1]}', 'unconfirmed-29d@example.com', '{{}}', NULL, now() - interval '29 days'),
            ('{old[2]}', 'unfinished-91d@example.com', '{{}}', now(), now() - interval '91 days'),
            ('{old[3]}', 'sent-back-10d@example.com', '{{}}', now(), now() - interval '200 days'),
            ('{old[4]}', 'declined-7m@example.com', '{{}}', now(), now() - interval '300 days'),
            ('{old[5]}', 'declined-5m@example.com', '{{}}', now(), now() - interval '300 days'),
            ('{old[6]}', 'admin-unconfirmed@example.com', '{{}}', NULL, now() - interval '400 days');
          INSERT INTO public.admins (user_id) VALUES ('{old[6]}');
          UPDATE profile_private SET created_at = now() - interval '91 days' WHERE id = '{old[2]}';
          UPDATE profile_private SET created_at = now() - interval '200 days', reviewed_at = NULL WHERE id = '{old[3]}';
          INSERT INTO public.verification_log (member_id, decision, created_at) VALUES
            ('{old[3]}', 'rejected', now() - interval '20 days'), ('{old[3]}', 'incomplete', now() - interval '10 days');
          UPDATE profile_private SET verification_status = 'rejected' WHERE id IN ('{old[4]}', '{old[5]}');
          UPDATE profile_private SET reviewed_at = now() - interval '7 months' WHERE id = '{old[4]}';
          UPDATE profile_private SET reviewed_at = now() - interval '5 months' WHERE id = '{old[5]}';
          INSERT INTO notifications (user_id, type, text, read, created_at) VALUES
            ('{nia}', 'group', 'read, 7 months', true, now() - interval '7 months'),
            ('{nia}', 'group', 'unread, 7 months', false, now() - interval '7 months'),
            ('{nia}', 'group', 'read, 5 months', true, now() - interval '5 months');
          INSERT INTO reports (id, reporter_id, reported_user_id, reason, status, created_at) VALUES
            ('a0000000-0000-0000-0000-000000000501', '{nia}', '{om}', 'closed, 13 months', 'reviewed', now() - interval '13 months'),
            ('a0000000-0000-0000-0000-000000000502', '{nia}', '{om}', 'closed, 13 months, held', 'resolved', now() - interval '13 months'),
            ('a0000000-0000-0000-0000-000000000503', '{nia}', '{om}', 'open, 13 months', 'pending', now() - interval '13 months'),
            ('a0000000-0000-0000-0000-000000000504', '{nia}', '{om}', 'closed, 11 months', 'reviewed', now() - interval '11 months');
          INSERT INTO private.report_hold (report_id, reason) VALUES ('a0000000-0000-0000-0000-000000000502', 'police matter');
          INSERT INTO private.moderation_record (decision, admin_note, created_at) VALUES
            ('rejected', 'note, 25 months', now() - interval '25 months'),
            ('rejected', 'note, 13 months', now() - interval '13 months'),
            ('blocked', 'note, 11 months', now() - interval '11 months');
          SELECT concat_ws(',', r->>'unconfirmed_signups', r->>'unfinished_accounts', r->>'declined_accounts',
                           r->>'read_notifications', r->>'closed_reports', r->>'moderation_records', r->>'moderation_notes_cleared')
          FROM (SELECT private.daily_cleanup() r) x;
          SELECT string_agg(email, ',' ORDER BY email) FROM auth.users WHERE id = ANY ('{{{",".join(old)}}}'::uuid[]);
          SELECT string_agg(text, ',' ORDER BY text) FROM notifications WHERE user_id = '{nia}' AND type = 'group';
          SELECT string_agg(reason, ',' ORDER BY reason) FROM reports WHERE id::text LIKE 'a0000000%';
          SELECT string_agg(decision || ':' || admin_note, ',' ORDER BY admin_note) FROM private.moderation_record
            WHERE member_id IS NULL AND admin_note LIKE 'note, %' OR created_at < now() - interval '10 months';
          ROLLBACK;""",
          expect="1,1,1,1,1,1,1\n"
                 "admin-unconfirmed@example.com,declined-5m@example.com,sent-back-10d@example.com,unconfirmed-29d@example.com\n"
                 "read, 5 months,unread, 7 months\n"
                 "closed, 11 months,closed, 13 months, held,open, 13 months\n"
                 "rejected:,blocked:note, 11 months")
    check("without pg_cron the clean-up isn't scheduled, and says what to do",
          "SELECT private.schedule_daily_cleanup()",
          expect="not scheduled: this database has no pg_cron. Run SELECT private.daily_cleanup(); by hand once a day.")
    check("with pg_cron it runs every night", """
          BEGIN;
          CREATE SCHEMA cron;
          CREATE TABLE cron.job (jobname TEXT PRIMARY KEY, schedule TEXT, command TEXT);
          CREATE FUNCTION cron.schedule(TEXT, TEXT, TEXT) RETURNS BIGINT LANGUAGE sql AS $f$
            INSERT INTO cron.job VALUES ($1, $2, $3) ON CONFLICT (jobname) DO UPDATE SET schedule = $2, command = $3 RETURNING 1::BIGINT $f$;
          SELECT private.schedule_daily_cleanup();
          SELECT private.schedule_daily_cleanup() IS NOT NULL;
          SELECT jobname || '|' || schedule || '|' || command FROM cron.job;
          ROLLBACK;""",
          expect="scheduled: private.daily_cleanup() runs every night at 03:17 UTC (pg_cron job nriclub-daily-cleanup)\n"
                 "t\nnriclub-daily-cleanup|17 3 * * *|SELECT private.daily_cleanup()")
    check("the limits, table by table",
          "SELECT string_agg(t.tgrelid::regclass || ':' || x.a[1] || '=' || (SELECT string_agg(x.a[2 * i]::INTEGER || '/' "
          "|| x.a[2 * i + 1]::INTERVAL, '+' ORDER BY i) FROM generate_series(1, (cardinality(x.a) - 1) / 2) i), ', ' "
          "ORDER BY t.tgrelid::regclass::text, x.a[1]) "
          "FROM pg_trigger t, LATERAL (SELECT string_to_array(regexp_replace(encode(t.tgargs, 'escape'), '\\\\000$', ''), "
          "'\\000') AS a) x WHERE t.tgname LIKE 'rate_limit%' AND NOT t.tgisinternal",
          expect="comments:comment=60/01:00:00, connections:namaste=50/1 day, conversations:conversation=20/1 day, "
                 "doc_comments:guide_comment=60/01:00:00, docs:guide=20/1 day, events:event=20/1 day, groups:group=5/1 day, "
                 "help_requests:question=20/1 day, help_responses:answer=60/01:00:00, marketplace:listing=20/1 day, "
                 "messages:message=30/00:01:00+500/1 day, places:place=20/1 day, posts:post=20/1 day, "
                 "reports:feedback=5/1 day, reports:report=20/1 day, travel_posts:travel_post=5/1 day+20/30 days")

    # --- the migration's changes to existing rows (C5, C10, C20) -------------------
    oldie, oldie_post = "00000000-0000-0000-0000-000000000510", "10000000-0000-0000-0000-000000000510"
    check("existing rows: names lose invisible characters, signup data keeps the name, "
          "member content gets the new contact address", f"""
          BEGIN;
          INSERT INTO auth.users (id, email, raw_user_meta_data, email_confirmed_at) VALUES
            ('{oldie}', 'oldie@example.com', '{{"full_name": "Old One"}}', now());
          ALTER TABLE auth.users DISABLE TRIGGER nriclub_trim_signup_data;
          UPDATE auth.users SET raw_user_meta_data = '{{"full_name": "Old One", "hometown": "Pune", "location": "Berlin",
            "profession": "Developer", "sub": "{oldie}"}}' WHERE id = '{oldie}';
          ALTER TABLE auth.users ENABLE TRIGGER nriclub_trim_signup_data;
          ALTER TABLE public.profiles DISABLE TRIGGER check_name;
          UPDATE profiles SET name = E'Old\\u202E  One\\u200B' WHERE id = '{oldie}';
          ALTER TABLE public.profiles ENABLE TRIGGER check_name;
          INSERT INTO posts (id, user_id, content) VALUES
            ('{oldie_post}', '{oldie}', 'Questions? Write to support@nriclub.app (or privacy@nriclub.app).');
          {migration_section("EXISTING DATA", NOTIFICATIONS_LIMITS)}
          SELECT concat_ws('|', (SELECT name FROM profiles WHERE id = '{oldie}'),
            (SELECT string_agg(k, ',' ORDER BY k) FROM auth.users u, jsonb_object_keys(u.raw_user_meta_data) k WHERE u.id = '{oldie}'),
            (SELECT content FROM posts WHERE id = '{oldie_post}'));
          ROLLBACK;""", expect="Old One|full_name,sub|Questions? Write to hello@nriclub.app (or hello@nriclub.app).")


def moderation_dsa():
    """Notices from the public report page (C6a), reports of every kind
    (C6b, C27), what our team does and the record of it (C7), admin writes
    only through those functions (C23), mentoring (C24), ambassadors (C26),
    clean-up and "Download my data": migration 20261021000000_moderation_dsa."""
    ravi, sita, usha, meera, neel, kira, vik, mohan = (
        f"00000000-0000-0000-0000-0000000006{n}" for n in ("01", "02", "03", "04", "05", "06", "07", "08"))
    for uid, name in ((ravi, "Ravi R"), (sita, "Sita S"), (usha, "Usha U"), (meera, "Meera M"), (neel, "Neel N"),
                      (kira, "Kira K"), (vik, "Vik V"), (mohan, "Mohan M")):
        approved_member(uid, f"{name.split()[0].lower()}@example.com", name)
    psql(f"INSERT INTO public.admins (user_id) VALUES ('{kira}')")
    post, comment = "10000000-0000-0000-0000-000000000601", "20000000-0000-0000-0000-000000000601"
    convo, hello, insult = ("30000000-0000-0000-0000-000000000601", "31000000-0000-0000-0000-000000000601",
                            "31000000-0000-0000-0000-000000000602")
    redress = ("Think we got it wrong? Write to hello@nriclub.app within 6 months, and a person on our team will look at "
               "it again. You can also go to court.")

    # --- notices from the public page (C6a) ----------------------------------
    def notice(email="reporter@example.org", name="Rita Reporter", category="defamation",
               explanation="It says I stole money, which is false.", good_faith="true"):
        return (f"public.submit_notice('https://nriclub.app/post/{post}', '{category}', '{explanation}', '{name}', "
                f"'{email}', {good_faith})")
    from_ip = """DO $$BEGIN PERFORM set_config('request.headers', '{"x-forwarded-for": "203.0.113.7, 10.0.0.1"}', false); END$$; """
    check("anyone can report illegal content on the public page, signed out (C6a)",
          f"SELECT {notice()} ~ '^R-[0-9A-F]{{8}}$'", role="anon", expect="t")
    check("... it waits for our team, and both admins are told in the app",
          "SELECT (SELECT count(*) FROM private.notices WHERE status = 'open') || '|' || "
          "(SELECT bool_and(text LIKE 'New report of illegal content R-% from the public report page.%') FROM notifications WHERE type = 'alert') || '|' || "
          "(SELECT count(DISTINCT user_id) FROM notifications WHERE type = 'alert')", expect="1|true|2")
    check("a notice needs the sender's name and email", f"SELECT {notice(name='', email='')}", role="anon",
          error_has="Please give your name and email address, so we can tell you what we decided.")
    check("... except about the sexual abuse of a child (Art. 16(2)(c) DSA)",
          f"SELECT {notice(name='', email='', category='child_abuse')} LIKE 'R-%'", role="anon", expect="t")
    check("... a known reason", f"SELECT {notice(category='nonsense')}", role="anon",
          error_has="Please choose what the problem is.")
    check("... an explanation", f"SELECT {notice(explanation='bad')}", role="anon",
          error_has="Please explain in a sentence or two")
    check("... a real email address", f"SELECT {notice(email='not-an-address')}", role="anon",
          error_has="Please check your name and email address.")
    check("... and the good-faith confirmation", f"SELECT {notice(good_faith='false')}", role="anon",
          error_has="Please confirm that your report is accurate and made in good faith.")
    check("5 notices a day from one email address",
          f"SELECT count({notice()}) FROM generate_series(1, 4) g", role="anon", expect="4")
    check("... the 6th isn't taken (the same address in another form neither)",
          f"SELECT {notice(email='Reporter+again@Example.org')}", role="anon",
          error_has="You've sent several reports today.")
    check("10 a day from one internet address (the first in X-Forwarded-For)",
          from_ip + f"SELECT count({notice(email='p' + chr(39) + ' || g || ' + chr(39) + '@example.org')}) "
          "FROM generate_series(1, 10) g",
          role="anon", expect="10")
    check("... the 11th isn't", from_ip + f"SELECT {notice(email='someone.else@example.org')}", role="anon",
          error_has="You've sent several reports today.")
    cf_ip = """DO $$BEGIN PERFORM set_config('request.headers', '{"cf-connecting-ip": "198.51.100.9", "x-forwarded-for": "203.0.113.7"}', false); END$$; """
    check("... behind Cloudflare its address counts, not the first in X-Forwarded-For",
          cf_ip + f"SELECT {notice(email='cf.sender@example.org')} LIKE 'R-%'", role="anon", expect="t")
    check("the limits keep only a keyed hash, never the address",
          "SELECT count(*) > 0 AND bool_and(key !~ '203\\.0\\.113|example\\.org') FROM private.notice_log", expect="t")
    check("nobody reads notices through the API", "SELECT count(*) FROM private.notices", role="anon", expect="error")
    check("... members neither", "SELECT count(*) FROM private.notices", as_user=usha, expect="error")
    check("... nor the admin list", "SELECT count(*) FROM public.admin_notices()", as_user=usha, error_has="Admins only")
    check("admins see them", "SELECT count(*) FROM public.admin_notices() WHERE status = 'open'", as_user=ADMIN,
          expect="17")
    first_notice = "(SELECT id FROM public.admin_notices() ORDER BY created_at, reference LIMIT 1)"
    check("the decision can't be marked as sent before there is one",
          f"SELECT public.admin_update_notice({first_notice}, 'decision_sent')", as_user=ADMIN,
          error_has="Decide on the notice first.")
    check("our team records the receipt, the decision (kept, and why) and that they emailed it",
          f"SELECT public.admin_update_notice({first_notice}, 'receipt_sent'); "
          f"SELECT public.admin_update_notice({first_notice}, 'decide', 'kept', 'it is a fair review of a business. '); "
          f"SELECT public.admin_update_notice({first_notice}, 'decision_sent')", as_user=ADMIN,
          expect="open\nclosed\nclosed")
    check("... (on the notice)",
          "SELECT concat_ws('|', decision, decision_reason, receipt_sent_at IS NOT NULL, decision_sent_at IS NOT NULL, "
          f"decided_by = '{ADMIN}') FROM private.notices ORDER BY created_at, reference LIMIT 1",
          expect="kept|it is a fair review of a business|t|t|t")
    check("removing, warning or blocking is recorded from the content itself",
          f"SELECT public.admin_update_notice((SELECT id FROM public.admin_notices() WHERE status = 'open' LIMIT 1), 'decide', "
          "'removed', 'it is defamatory')", as_user=ADMIN, error_has="Remove, warn or block from the content itself")
    check("members can't touch notices", f"SELECT public.admin_update_notice({first_notice}, 'reopen')", as_user=usha,
          error_has="Admins only")
    check("a notice about something already gone (e.g. removed after a member's report of it) is closed as such",
          "SELECT public.admin_update_notice((SELECT id FROM public.admin_notices() WHERE status = 'open' "
          "ORDER BY created_at, reference LIMIT 1), 'decide', 'gone', 'we removed it after a member reported it')",
          as_user=ADMIN, expect="closed")
    check("... (on the notice)", "SELECT count(*) FROM private.notices WHERE decision = 'gone' "
          "AND decision_reason = 'we removed it after a member reported it'", expect="1")
    check("an IPv6 address counts by its /64 (one connection has a whole /64 to choose from): 10 a day",
          "DO $$BEGIN FOR g IN 1..10 LOOP PERFORM set_config('request.headers', json_build_object('x-forwarded-for', "
          f"'2001:db8:7:9::' || to_hex(g))::text, false); PERFORM {notice(email='v6-' + chr(39) + ' || g || ' + chr(39) + '@example.org')}; "
          "END LOOP; END$$; SELECT 1", role="anon", expect="1")
    check("... the 11th from another address in that network isn't",
          """DO $$BEGIN PERFORM set_config('request.headers', '{"x-forwarded-for": "2001:db8:7:9:ffff::1"}', false); END$$; """
          + f"SELECT {notice(email='v6-last@example.org')}", role="anon", error_has="You've sent several reports today.")
    check("an email address can't carry mailto: fields of its own (cc, body) into our team's reply",
          f"SELECT {notice(email='eve@example.org?cc=third.party%40example.net&body=hi')}", role="anon",
          error_has="Please check your name and email address.")
    check("at most 100 notices a day in all; then the page points to email",
          "INSERT INTO private.notices (reference, location, category, explanation, good_faith) "
          "SELECT 'R-CAP' || lpad(g::text, 5, '0'), 'x', 'spam', 'a filler notice', true FROM generate_series(1, 100) g; "
          f"SET ROLE anon; SELECT {notice(email='late.sender@example.org')}",
          error_has="We've received a lot of reports today. Please write to hello@nriclub.app instead")

    # --- reports of every kind (C6b) -------------------------------------------
    check("ravi posts; sita comments on it, rudely", f"""
          INSERT INTO posts (id, user_id, content) VALUES ('{post}', '{ravi}', 'Diwali party at my place on Saturday');""",
          as_user=ravi)
    check("... (the comment)", f"INSERT INTO comments (id, post_id, user_id, content) VALUES ('{comment}', '{post}', "
          f"'{sita}', 'Nobody wants to come to your party, idiot') RETURNING 1", as_user=sita, expect="1")
    report = lambda kind, target, category="harassment", explanation="She insults Ravi under every post he writes.", \
        good_faith="true", user=None: (
        f"INSERT INTO reports (reporter_id, reported_post_id, reported_user_id, reason, content_type, category, explanation, "
        f"good_faith) VALUES (auth.uid(), {'NULL' if kind == 'profile' else repr(target)}, "
        f"{repr(user) if user else (repr(target) if kind == 'profile' else 'NULL')}, '[{kind.upper()}] Reported', '{kind}', "
        f"'{category}', '{explanation}', {good_faith})")
    check("usha reports the comment: its kind, her reason and words, and who wrote it (looked up, not taken from her)",
          report("comment", comment, user=ravi) + " RETURNING content_type || '|' || category || '|' || reported_user_id",
          as_user=usha, expect=f"comment|harassment|{sita}")
    check("a reason needs an explanation of 10 characters or more",
          report("post", post, explanation="bad"), as_user=vik, expect="error")
    check("... and the good-faith confirmation", report("post", post, good_faith="false"), as_user=vik, expect="error")
    check("... and must be one of the form's reasons", report("post", post, category="boring"), as_user=vik, expect="error")
    check("one open report per member and item: the second is dropped",
          report("comment", comment) + f"; SELECT count(*) FROM reports WHERE reporter_id = auth.uid() "
          f"AND reported_post_id = '{comment}'", as_user=usha, expect="1")
    check("a report the way the site sent it before (the kind in the prefix) still works",
          f"INSERT INTO reports (reporter_id, reported_post_id, reason) VALUES (auth.uid(), '{post}', "
          "'[POST] Diwali party — Spam') RETURNING content_type || '|' || reported_user_id", as_user=vik,
          expect=f"post|{ravi}")
    check("ravi writes to sita", f"""
          INSERT INTO conversations (id, participant_1, participant_2) VALUES ('{convo}', '{ravi}', '{sita}');
          INSERT INTO messages (id, conversation_id, sender_id, content) VALUES ('{hello}', '{convo}', '{ravi}', 'hello there');
          INSERT INTO messages (id, conversation_id, sender_id, content) VALUES ('{insult}', '{convo}', '{ravi}', 'You owe me, pay up or else');
          SELECT last_message_text FROM conversations WHERE id = '{convo}'""", as_user=ravi,
          expect="You owe me, pay up or else")
    check("only the member a message was sent to can report it",
          report("message", insult, category="harassment"), as_user=vik,
          error_has="You can only report messages sent to you.")
    check("... not the sender", report("message", insult), as_user=ravi, error_has="You can only report messages sent to you.")
    check("... sita can", report("message", insult, explanation="He threatens me over money he says I owe him.")
          + " RETURNING content_type || '|' || reported_user_id", as_user=sita, expect=f"message|{ravi}")
    check("a report of a threat to someone's life or safety tells every admin at once (C27)",
          report("profile", ravi, category="safety", explanation="He wrote that he knows where I live and will come.")
          + "; SELECT 1", as_user=sita, expect="1")
    check("... (both admins)", "SELECT count(DISTINCT user_id) FROM notifications WHERE type = 'alert' "
          "AND text LIKE 'Safety report: a member reported a threat%'", expect="2")
    check("feedback is kept apart", f"INSERT INTO reports (reporter_id, reported_post_id, reason) VALUES "
          f"(auth.uid(), auth.uid(), '[BUG] Feed: the heart is grey') RETURNING content_type", as_user=usha,
          expect="feedback")
    pia = "00000000-0000-0000-0000-000000000611"
    sign_up(pia, "pia@example.com", {"full_name": "Pia P"}, accept_terms=True)
    check("pia, new, sends her details and waits for review",
          "SELECT public.submit_verification('Berlin', 'DE', '', 'linkedin.com/in/pia-p-waiting', '', '', NULL)",
          as_user=pia, expect="pending")
    check("a member waiting for review can't pass a (safety) report about someone off as feedback: the prefix decides",
          f"INSERT INTO reports (reporter_id, reported_user_id, reason, content_type, category, explanation, good_faith) "
          f"VALUES (auth.uid(), '{ravi}', '[BUG] he threatens people', 'profile', 'safety', 'He threatens people here.', "
          "true) RETURNING content_type || '|' || (category IS NULL)", as_user=pia, expect="feedback|true")
    check("... and no admin is alerted", "SELECT count(*) FROM notifications WHERE type = 'alert' AND reference_id IN "
          f"(SELECT id FROM reports WHERE reporter_id = '{pia}')", expect="0")
    check("... nor can a report pass as feedback",
          f"INSERT INTO reports (reporter_id, reported_post_id, reason, content_type, category, explanation, good_faith) "
          f"VALUES (auth.uid(), '{post}', '[POST] Diwali party — Spam', 'feedback', 'spam', "
          "'It advertises his own business here.', true) RETURNING content_type", as_user=neel, expect="post")
    check("members can't read our team's notes on reports", "SELECT count(*) FROM private.report_note", as_user=usha,
          expect="error")
    safety = f"(SELECT id FROM reports WHERE category = 'safety' AND reported_user_id = '{ravi}')"
    check("admins note what they did about a safety report",
          f"SELECT public.admin_set_report_note({safety}, 'Told the police (BKA) on 21 Oct, reference 123.'); "
          f"SELECT note FROM public.admin_report_notes(ARRAY[{safety}])", as_user=ADMIN,
          expect="Told the police (BKA) on 21 Oct, reference 123.")
    check("... members can't", f"SELECT public.admin_set_report_note({safety}, 'x')", as_user=sita, error_has="Admins only")

    # --- what our team does, and the record of it (C7) ----------------------------
    usha_report = f"(SELECT id FROM reports WHERE reporter_id = '{usha}' AND reported_post_id = '{comment}')"
    check("members can't moderate", f"SELECT {moderate('comment', comment, 'remove')}", as_user=usha,
          error_has="Admins only")
    check("... nor can anyone signed out", f"SELECT {moderate('comment', comment, 'remove')}", role="anon", expect="error")
    check("reasons are needed: the ground, the rule and the facts",
          f"SELECT {moderate('comment', comment, 'remove', facts='rude')}", as_user=ADMIN,
          error_has="Say in a sentence (10 to 600 characters) what it said or did.")
    check("ravi was told about sita's comment", f"SELECT count(*) FROM notifications WHERE user_id = '{ravi}' "
          "AND type = 'comment'", expect="1")
    check("admin removes the reported comment, answering usha's report",
          f"SELECT jsonb_array_length({moderate('comment', comment, 'remove', rule='Insults, hate or discrimination (§ 6)', facts='it calls another member an idiot.', reports=['__R__'])} -> 'closed_reports')"
          .replace("'__R__'::uuid", usha_report), as_user=ADMIN, expect="1")
    check("... the comment is gone, the report closed, and the notification that quoted it too",
          f"SELECT concat_ws('|', (SELECT count(*) FROM comments WHERE id = '{comment}'), "
          f"(SELECT status FROM reports WHERE id = {usha_report}), "
          f"(SELECT count(*) FROM notifications WHERE user_id = '{ravi}' AND type = 'comment'))", expect="0|resolved|0")
    check("... sita gets the statement of reasons (Art. 17 DSA)",
          f"SELECT text FROM notifications WHERE user_id = '{sita}' AND type = 'moderation'",
          expect=f'We removed your comment "Nobody wants to come to your party, idiot" on {berlin_date()}. Reason: it '
                 'breaks our Terms of Use, Insults, hate or discrimination (§ 6), because it calls another member an idiot. '
                 'This followed a report from someone else. No automated tools were used: a person on our team decided. '
                 + redress)
    check("... usha gets the outcome (Art. 16(5) DSA)",
          f"SELECT text FROM notifications WHERE user_id = '{usha}' AND type = 'report'",
          expect='We looked at your report about the comment "Nobody wants to come to your party, idiot": we removed it '
                 'because it calls another member an idiot. ' + redress)
    check("... and it's on record: who, what, why, a copy of it",
          "SELECT concat_ws('|', actor_id, action, target_kind, target_user, ground, rule, explanation, source, "
          "cardinality(report_ids), snapshot -> 'row' ->> 'content') FROM private.moderation_action "
          f"WHERE target_id = '{comment}'",
          expect=f"{ADMIN}|remove|comment|{sita}|terms|Insults, hate or discrimination (§ 6)|it calls another member an idiot|"
                 "report|1|Nobody wants to come to your party, idiot")
    check("members can't read the record", "SELECT count(*) FROM private.moderation_action", as_user=sita, expect="error")
    check("removing it again: it's gone", f"SELECT {moderate('comment', comment, 'remove')}", as_user=ADMIN,
          error_has="Not found: it may already have been deleted.")
    check("reports someone else handled meanwhile stop a second decision",
          f"SELECT {moderate('post', post, 'remove', reports=['__R__'])}".replace("'__R__'::uuid", usha_report),
          as_user=ADMIN, error_has="These reports were already handled by someone else.")
    sita_report = f"(SELECT id FROM reports WHERE reporter_id = '{sita}' AND reported_post_id = '{insult}')"
    check("admins see only the reported message, never the conversation",
          f"SELECT string_agg(content, ',') FROM public.admin_get_reported_message({sita_report})", as_user=ADMIN,
          expect="You owe me, pay up or else")
    check("... members can't use that", f"SELECT count(*) FROM public.admin_get_reported_message({sita_report})",
          as_user=vik, error_has="Admins only")
    check("a message nobody reported can't be removed",
          f"SELECT {moderate('message', hello, 'remove')}", as_user=ADMIN,
          error_has="Only a message someone reported can be removed.")
    check("the reported one can",
          f"SELECT public.admin_delete_reported_message({sita_report}, 'terms', 'Threats, harassment or calls for violence "
          "(§ 6)', 'it pressures the member it was sent to with a threat') ->> 'statement' LIKE 'We removed your message %'",
          as_user=ADMIN, expect="t")
    check("... only that one, and the conversation's preview no longer shows it",
          f"SELECT string_agg(content, ',') || '|' || (SELECT last_message_text FROM conversations WHERE id = '{convo}') "
          f"FROM messages WHERE conversation_id = '{convo}'", expect="hello there|hello there")
    check("an admin can't act on their own account", f"SELECT {moderate('member', ADMIN, 'warn')}", as_user=ADMIN,
          error_has="You can't act on your own account or content.")
    check("... nor on another admin's (C4)", f"SELECT {moderate('member', kira, 'block', urgent='threat')}",
          as_user=ADMIN, error_has="This belongs to an admin.")

    # --- warnings and blocks (C7) ----------------------------------------------------
    check("a block comes after a warning", f"SELECT {moderate('member', sita, 'block')}", as_user=ADMIN,
          error_has="Warn the member first and give them 14 days to reply")
    check("admin warns sita",
          f"SELECT {moderate('member', sita, 'warn', rule='Insults, hate or discrimination (§ 6)', facts='you insulted other members in several comments')} ->> 'statement'",
          as_user=ADMIN,
          expect="We're writing about how you use NRIClub. Please read this warning. Reason: it breaks our Terms of Use, "
                 "Insults, hate or discrimination (§ 6), because you insulted other members in several comments. This "
                 "followed our own check. No automated tools were used: a person on our team decided. If this happens "
                 "again we may block your account. Please reply to hello@nriclub.app within 14 days if you want to tell "
                 "us your side. " + redress)
    check("... a block before the 14 days are up needs a serious reason",
          f"SELECT {moderate('member', sita, 'block')}", as_user=ADMIN, error_has="Warn the member first")
    psql(f"UPDATE private.moderation_action SET created_at = now() - interval '15 days' WHERE target_user = '{sita}' "
         "AND action = 'warn'")
    check("after 14 days the block goes ahead",
          f"DO $$BEGIN PERFORM {moderate('member', sita, 'block', rule='Insults, hate or discrimination (§ 6)', facts='you went on insulting members after our warning')}; END$$; "
          f"SELECT concat_ws('|', status, block_rule, block_reason, blocked_at IS NOT NULL) FROM profile_private WHERE id = '{sita}'",
          as_user=ADMIN, expect="blocked|Terms of Use: Insults, hate or discrimination (§ 6)|you went on insulting members "
                                "after our warning|t")
    check("... sita sees why, and can't change it",
          "UPDATE profile_private SET block_reason = '', block_rule = '', blocked_at = NULL WHERE id = auth.uid(); "
          "SELECT block_rule || '|' || block_reason FROM profile_private", as_user=sita,
          expect="Terms of Use: Insults, hate or discrimination (§ 6)|you went on insulting members after our warning")
    check("admin unblocks her; the reason goes",
          f"{unblock(sita)}; SELECT block_reason || block_rule || (blocked_at IS NULL)::text FROM profile_private "
          f"WHERE id = '{sita}'", as_user=ADMIN, expect="active\ntrue")
    check("... and she's told", f"SELECT text FROM notifications WHERE user_id = '{sita}' AND text LIKE 'We unblocked%'",
          expect=f"We unblocked your account on {berlin_date()}. You can use NRIClub again.")
    omar = "00000000-0000-0000-0000-000000000612"
    approved_member(omar, "omar@example.com", "Omar O")
    check("admin warns omar", f"SELECT {moderate('member', omar, 'warn')} ->> 'statement' LIKE 'We''re writing about%'",
          as_user=ADMIN, expect="t")
    psql(f"UPDATE private.moderation_action SET created_at = now() - interval '30 days' WHERE target_user = '{omar}'")
    check("... and again a month later, about something new",
          f"SELECT {moderate('member', omar, 'warn', facts='you posted the same advert in every group again')} ->> "
          "'statement' LIKE 'We''re writing about%'", as_user=ADMIN, expect="t")
    check("... a block must wait for the 14 days of the latest warning, not just of any earlier one",
          f"SELECT {moderate('member', omar, 'block')}", as_user=ADMIN, error_has="Warn the member first")
    long_law, long_facts = "' || repeat('§ 185 StGB ', 27) || '", "' || repeat('it insults ', 53) || 'members"
    check("a long statement of reasons reaches the member whole, with how to reply and how to challenge it",
          f"SELECT char_length({moderate('member', omar, 'warn', ground='illegal', rule=long_law, facts=long_facts)} "
          "->> 'statement') > 1000", as_user=ADMIN, expect="t")
    check("... (whole)", "SELECT text LIKE '%within 14 days%You can also go to court.' FROM notifications "
          f"WHERE user_id = '{omar}' AND type = 'moderation' ORDER BY created_at DESC LIMIT 1", expect="t")
    check("a serious case is blocked straight away, and the statement says why",
          f"SELECT {moderate('member', vik, 'block', urgent='threat', rule='Threats, harassment or calls for violence (§ 6)', facts='you threatened to hurt a member')} ->> 'statement' "
          "LIKE '%Because this is a serious case (threats), we blocked your account straight away, without a warning "
          "first.%You can still sign in to download your data and delete your account.'", as_user=ADMIN, expect="t")
    check("... (recorded)", f"SELECT urgent FROM private.moderation_action WHERE target_user = '{vik}' AND action = 'block'",
          expect="threat")
    psql(f"UPDATE profiles SET avatar_url = '{STORE}/avatars/{ravi}/a.jpg', bio = 'Call me for cheap visas' WHERE id = '{ravi}'")
    check("admin removes a profile photo (the file's path stays on record; Storage cleans up the file)",
          f"DO $$BEGIN PERFORM {moderate('profile_photo', ravi, 'remove', rule='Pretending to be someone else (§ 6)', facts='the photo shows another person')}; END$$; "
          f"SELECT '[' || avatar_url || ']' FROM profiles WHERE id = '{ravi}'", as_user=ADMIN, expect="[]")
    check("... (the record)", "SELECT snapshot -> 'files' ->> 0 FROM private.moderation_action "
          f"WHERE target_kind = 'profile_photo' AND target_user = '{ravi}'", expect=f"avatars/{ravi}/a.jpg")
    check("neel reports ravi's profile", report("profile", ravi, category="spam", explanation="His bio advertises a paid visa service.")
          + " RETURNING 1", as_user=neel, expect="1")
    neel_report = f"(SELECT id FROM reports WHERE reporter_id = '{neel}' AND content_type = 'profile')"
    check("... and a bio", f"SELECT {moderate('profile_bio', ravi, 'remove', facts='it advertises a paid visa service', reports=['__R__'])} "
          f"->> 'statement' LIKE 'We removed the bio on your profile on %'; SELECT bio FROM profiles WHERE id = '{ravi}'"
          .replace("'__R__'::uuid", neel_report), as_user=ADMIN, expect="t")
    check("... neel hears that the bio was removed (not \"the member\")",
          f"SELECT text FROM notifications WHERE user_id = '{neel}' AND type = 'report'",
          expect="We looked at your report about the bio of the member Ravi R: we removed it because it advertises a paid "
                 "visa service. " + redress)

    # --- closing reports without action, and Undo (C7, C36) ----------------------------
    check("usha reports ravi's post", report("post", post, category="spam", explanation="It advertises his own business.")
          + " RETURNING 1", as_user=usha, expect="1")
    usha_post_report = f"(SELECT id FROM reports WHERE reporter_id = '{usha}' AND reported_post_id = '{post}')"
    check("members can't close reports", f"SELECT count(*) FROM public.admin_close_reports(ARRAY[{usha_post_report}], "
          "'reviewed', 'it is fine')", as_user=usha, error_has="Admins only")
    check("closing without action needs a reason",
          f"SELECT count(*) FROM public.admin_close_reports(ARRAY[{usha_post_report}], 'reviewed', '')", as_user=ADMIN,
          error_has="Say in a few words why")
    check("admin keeps the post",
          f"SELECT count(*) FROM public.admin_close_reports(ARRAY[{usha_post_report}], 'reviewed', "
          "'it is an invitation, not an advert')", as_user=ADMIN, expect="1")
    check("... and usha is told why",
          f"SELECT text FROM notifications WHERE user_id = '{usha}' AND reference_id = {usha_post_report}",
          expect="We looked at your report about the post \"Diwali party at my place on Saturday\": we kept it because it "
                 "is an invitation, not an advert. " + redress)
    check("Undo opens it again",
          f"SELECT count(*) FROM public.admin_reopen_reports(ARRAY[{usha_post_report}], 'reviewed'); "
          f"SELECT status FROM reports WHERE id = {usha_post_report}", as_user=ADMIN, expect="1\npending")
    check("... and takes the message back",
          f"SELECT count(*) FROM notifications WHERE user_id = '{usha}' AND reference_id = {usha_post_report}", expect="0")
    check("admins still mark feedback done by hand",
          "UPDATE reports SET status = 'resolved' WHERE content_type = 'feedback' AND reason = '[BUG] Feed: the heart is grey' "
          "RETURNING 1",
          as_user=ADMIN, expect="1")

    # --- what the admin panel shows with a member; "Download my data" (C7, C21) ---------
    check("the admin panel shows what our team did about a member, newest first",
          f"SELECT string_agg(e ->> 'action', ',' ORDER BY o) FROM jsonb_array_elements("
          f"public.admin_member_overview('{sita}') -> 'history') WITH ORDINALITY x(e, o)", as_user=ADMIN,
          expect="unblock,block,remove,warn")
    check("... members can't see it", f"SELECT public.admin_member_overview('{sita}')", as_user=sita,
          error_has="Admins only")
    check("... with the open reports about her profile counted apart from those about what she posted",
          f"SELECT (o ->> 'open_profile_reports')::int <= (o ->> 'open_reports')::int "
          f"FROM public.admin_member_overview('{sita}') o", as_user=ADMIN, expect="t")
    check("sita's download has what our team did about her, with the statements, but not who on our team",
          "SELECT string_agg(e ->> 'action', ',' ORDER BY e ->> 'created_at') || '|' || bool_and(NOT (e ? 'actor_id') "
          "AND NOT (e ? 'by')) || '|' || count(e -> 'statement_sent_to_you') FROM "
          "jsonb_array_elements(public.export_my_data() -> 'moderation_actions_about_me') e", as_user=sita,
          expect="warn,remove,block,unblock|true|4")
    check("meera reports ravi the way the site sent reports before the update (her own words in the reason line)",
          f"INSERT INTO reports (reporter_id, reported_user_id, reason) VALUES (auth.uid(), '{ravi}', "
          "'[USER] Ravi R — Against our rules: Harassment or bullying: I am Meera from flat 3, he shouts at me') "
          "RETURNING content_type", as_user=meera, expect="profile")
    check("ravi's download has the reasons, but not the words of the members who reported him",
          "SELECT bool_and(e ->> 'reason' NOT LIKE '%flat 3%' AND NOT (e ? 'explanation')) || '|' || "
          "bool_or(e ->> 'reason' = '[USER] Ravi R — Against our rules: Harassment or bullying') FROM "
          "jsonb_array_elements(public.export_my_data() -> 'reports_about_me') e", as_user=ravi, expect="true|true")
    check("ravi's download lists the reports about him, without who sent them (none about his message: only sita "
          "could have sent that one)",
          "SELECT bool_and(NOT (e ? 'reporter_id')) || '|' || string_agg(DISTINCT e ->> 'about', ',' ORDER BY e ->> 'about') FROM "
          "jsonb_array_elements(public.export_my_data() -> 'reports_about_me') e", as_user=ravi,
          expect="true|post,profile")
    check("sita reports ravi's other message too", report("message", hello, category="spam",
          explanation="He sends me the same greeting again and again.") + " RETURNING 1", as_user=sita, expect="1")
    check("... our team keeps it", "SELECT count(*) FROM public.admin_close_reports(ARRAY(SELECT id FROM reports "
          f"WHERE reported_post_id = '{hello}'), 'reviewed', 'a greeting is not spam')", as_user=ADMIN, expect="1")
    check("... ravi's download doesn't show that a message of his was reported or kept (it would say who reported it, "
          "Art. 15(4) GDPR); the message we removed is there, as he was told then",
          "SELECT (SELECT count(*) FROM jsonb_array_elements(d -> 'reports_about_me') e WHERE e ->> 'about' = 'message') "
          "|| '|' || (SELECT string_agg(e ->> 'action', ',') FROM jsonb_array_elements(d -> 'moderation_actions_about_me') e "
          "WHERE e ->> 'about' = 'message') || '|' || (d -> 'readme' ->> 'left_out' LIKE '%reports about messages you sent%') "
          "FROM public.export_my_data() d", as_user=ravi, expect="0|remove|true")

    # --- a report stays when its sender deletes their account (C6b) ---------------------
    check("usha deletes her account", "SELECT public.delete_my_account()", as_user=usha)
    check("... her reports stay, no longer linked to her; her feedback goes",
          "SELECT string_agg(content_type || ':' || (reporter_id IS NULL)::text, ',' ORDER BY content_type) FROM reports "
          "WHERE explanation IN ('She insults Ravi under every post he writes.', 'It advertises his own business.') "
          "OR reason = '[BUG] Feed: the heart is grey'", expect="comment:true,post:true")

    # --- admins act only through the functions (C23) -----------------------------------
    check("an admin's own writes don't set server columns either",
          "INSERT INTO groups (name, created_by, is_approved) VALUES ('Indians in Adminville', auth.uid(), true) "
          "RETURNING is_approved::text", as_user=ADMIN, expect="false")
    check("communities: approve, Undo while nobody has joined, and the creator hears about each",
          "SELECT public.admin_set_group(id, 'approve') ->> 'is_approved' FROM groups WHERE name = 'Indians in Adminville'; "
          "SELECT public.admin_set_group(id, 'unapprove') ->> 'is_approved' FROM groups WHERE name = 'Indians in Adminville'; "
          "SELECT public.admin_set_group(id, 'approve') ->> 'is_approved' FROM groups WHERE name = 'Indians in Adminville'",
          as_user=ADMIN, expect="true\nfalse\ntrue")
    check("... once a member has joined, the approval stays",
          "INSERT INTO group_members (group_id, user_id) SELECT id, auth.uid() FROM groups WHERE name = 'Indians in Adminville' "
          "RETURNING 1", as_user=ravi, expect="1")
    check("... (Undo refused)", "SELECT public.admin_set_group(id, 'unapprove') FROM groups WHERE name = 'Indians in Adminville'",
          as_user=ADMIN, error_has="Members have already joined or posted")
    check("deleting a community needs a reason",
          "SELECT public.admin_set_group(id, 'delete') FROM groups WHERE name = 'Indians in Adminville'", as_user=ADMIN,
          error_has="Say in a few words why the community is deleted.")
    check("... and is recorded",
          "SELECT public.admin_set_group(id, 'delete', 'it duplicates Indians in Berlin') IS NULL FROM groups "
          "WHERE name = 'Indians in Adminville'", as_user=ADMIN, expect="t")
    check("... (the record)", "SELECT string_agg(action, ',' ORDER BY created_at) FROM private.moderation_action "
          "WHERE target_kind = 'group' AND snapshot -> 'row' ->> 'name' = 'Indians in Adminville'",
          expect="group_approve,group_unapprove,group_approve,group_delete")
    check("members can't use the community or ambassador functions",
          f"SELECT public.admin_set_ambassador('{ravi}', 'Berlin')", as_user=ravi, error_has="Admins only")

    # --- ambassadors only active and verified (C26) ------------------------------------
    check("ravi becomes Berlin's ambassador (recorded)",
          f"SELECT public.admin_set_ambassador('{ravi}', 'Berlin')", as_user=ADMIN, expect="Berlin")
    check("... (the record)", "SELECT explanation FROM private.moderation_action "
          f"WHERE action = 'ambassador' AND target_user = '{ravi}'", expect="Ambassador for Berlin")
    check("members see the city's active, verified ambassadors",
          "SELECT string_agg(name, ',') FROM public.city_ambassadors('berlin')", as_user=neel, expect="Ravi R")
    check("... members who can't take part see none", "SELECT count(*) FROM public.city_ambassadors('Berlin')",
          as_user=vik, expect="0")
    check("... nor anyone signed out", "SELECT count(*) FROM public.city_ambassadors('Berlin')", role="anon",
          expect="error")

    # --- mentoring (C24) -----------------------------------------------------------------
    for mentor in (meera, mohan):
        psql(f"""UPDATE profiles SET mentor_open = true WHERE id = '{mentor}';
          WITH s AS (INSERT INTO mentor_slots (mentor_id, starts_at, duration_min, booked)
                     VALUES ('{mentor}', now() + interval '2 days', 30, true) RETURNING id, starts_at)
          INSERT INTO mentor_bookings (slot_id, mentor_id, mentee_id, starts_at, duration_min, topic)
          SELECT id, '{mentor}', '{neel}', starts_at, 30, 'CV review' FROM s;
          INSERT INTO mentor_slots (mentor_id, starts_at) VALUES ('{mentor}', now() + interval '3 days')""")
    check("the admin panel counts a mentor's upcoming sessions and open times",
          f"SELECT (o ->> 'upcoming_sessions') || '|' || (o ->> 'free_slots') FROM public.admin_member_overview('{meera}') o",
          as_user=ADMIN, expect="1|1")
    check("rejecting a mentor cancels their booked sessions, and the member is told",
          f"SELECT public.review_member('{meera}', 'rejected', 'We couldn''t verify you.', '')", as_user=ADMIN,
          expect="rejected")
    check("... (cancelled, told)", f"SELECT status FROM mentor_bookings WHERE mentor_id = '{meera}'; "
          f"SELECT count(*) FROM notifications WHERE user_id = '{neel}' AND type = 'booking_cancelled'",
          expect="cancelled\n1")
    check("moving a mentor back to review keeps their booked sessions (their open times go)",
          f"SELECT public.review_member('{mohan}', 'pending', '', '')", as_user=ADMIN, expect="pending")
    check("... (kept)", f"SELECT string_agg(status, ',') FROM mentor_bookings WHERE mentor_id = '{mohan}'; "
          f"SELECT count(*) FROM mentor_slots WHERE mentor_id = '{mohan}' AND NOT booked", expect="booked\n0")

    # --- clean-up (C20) ---------------------------------------------------------------------
    check("the clean-up deletes closed notices after 12 months unless held, the copies in the record after 6 "
          "months and the record after 24 unless a report it answers is held, and the notice limits after a day", f"""
          BEGIN;
          INSERT INTO private.notices (reference, location, category, explanation, good_faith, status, created_at, hold_reason) VALUES
            ('R-OLD00001', 'x', 'spam', 'closed 13 months', true, 'closed', now() - interval '13 months', ''),
            ('R-OLD00002', 'x', 'spam', 'closed 13 months, held', true, 'closed', now() - interval '13 months', 'police'),
            ('R-OLD00003', 'x', 'spam', 'open 13 months', true, 'open', now() - interval '13 months', ''),
            ('R-NEW00004', 'x', 'spam', 'closed 11 months', true, 'closed', now() - interval '11 months', '');
          INSERT INTO reports (id, reporter_id, reported_post_id, reason, status) VALUES
            ('99000000-0000-0000-0000-000000000601', NULL, '{post}', '[POST] held', 'resolved');
          INSERT INTO private.report_hold (report_id, reason) VALUES ('99000000-0000-0000-0000-000000000601', 'police');
          INSERT INTO private.moderation_action (action, target_kind, source, snapshot, created_at, explanation, report_ids) VALUES
            ('remove', 'post', 'report', '{{"row": {{}}}}', now() - interval '7 months', 'a7', '{{}}'),
            ('remove', 'post', 'report', '{{"row": {{}}}}', now() - interval '7 months', 'a7 held', '{{99000000-0000-0000-0000-000000000601}}'),
            ('remove', 'post', 'report', '{{"row": {{}}}}', now() - interval '5 months', 'a5', '{{}}'),
            ('remove', 'post', 'report', NULL, now() - interval '25 months', 'a25', '{{}}'),
            ('remove', 'post', 'report', NULL, now() - interval '25 months', 'a25 held', '{{99000000-0000-0000-0000-000000000601}}');
          INSERT INTO private.notice_log (key, at) VALUES ('k-old', now() - interval '25 hours'), ('k-new', now() - interval '1 hour');
          SELECT concat_ws(',', c ->> 'closed_notices', c ->> 'moderation_copies_cleared', c ->> 'moderation_actions')
            FROM (SELECT private.daily_cleanup() AS c) x;
          SELECT string_agg(reference, ',' ORDER BY reference) FROM private.notices WHERE reference ~ '^R-(OLD|NEW)0';
          SELECT string_agg(explanation || ':' || (snapshot IS NOT NULL)::text, ',' ORDER BY explanation COLLATE "C")
            FROM private.moderation_action WHERE explanation ~ '^a[0-9]';
          SELECT string_agg(key, ',') FROM private.notice_log WHERE key LIKE 'k-%';
          ROLLBACK;""",
          expect="1,1,1\nR-NEW00004,R-OLD00002,R-OLD00003\na25 held:false,a5:true,a7:false,a7 held:true\nk-new")

    # --- the migration's changes to existing rows --------------------------------------------
    r1, r2, r3, r4 = (f"99000000-0000-0000-0000-00000000070{n}" for n in range(1, 5))
    check("existing rows: reports get their kind from the prefix, and a member's second open report about the same "
          "item is closed as a duplicate", f"""
          BEGIN;
          DROP INDEX public.reports_one_open_per_member;
          ALTER TABLE public.reports DISABLE TRIGGER fill_report_details;
          INSERT INTO reports (id, reporter_id, reported_post_id, reported_user_id, reason, status, created_at) VALUES
            ('{r1}', '{ravi}', '{post}', NULL, '[DOC] Visa guide — Spam', 'pending', now() - interval '3 hours'),
            ('{r2}', '{ravi}', '{post}', NULL, '[DOC] Visa guide — Spam again', 'pending', now() - interval '2 hours'),
            ('{r3}', '{ravi}', NULL, '{neel}', '[USER] Neel — Harassment', 'pending', now() - interval '1 hour'),
            ('{r4}', '{ravi}', '{ravi}', NULL, '[BUG] Feed: broken', 'pending', now());
          ALTER TABLE public.reports ENABLE TRIGGER fill_report_details;
          {migration_section("EXISTING DATA", MODERATION)}
          SELECT string_agg(content_type || ':' || status, ',' ORDER BY created_at) FROM reports
            WHERE id IN ('{r1}', '{r2}', '{r3}', '{r4}');
          SELECT note FROM private.report_note WHERE report_id = '{r2}';
          ROLLBACK;""",
          expect="doc:pending,doc:reviewed,profile:pending,feedback:pending\n"
                 "Closed as a duplicate: the same member had already reported this, and that report is still open.")


def berlin_date():
    """Today in Germany, as the database writes dates in its messages."""
    from datetime import datetime
    from zoneinfo import ZoneInfo
    d = datetime.now(ZoneInfo("Europe/Berlin"))
    return f"{d.day} {d.strftime('%B')} {d.year}"


def migration_part(start, end, path):
    """The part of a migration from its line '-- <start>' up to (not
    including) its line '-- <end>'."""
    with open(path, encoding="utf-8") as f:
        text = f.read()
    return text[text.index(f"-- {start}"):text.index(f"-- {end}")]


def storage_images():
    """Photo files (C1, C2) and invite codes (C19): migration
    20261022000000_storage_images."""
    tara, uma, vik, wen = (f"00000000-0000-0000-0000-0000000007{n}" for n in ("01", "02", "03", "04"))
    gone = "00000000-0000-0000-0000-000000000799"  # an account deleted long ago
    approved_member(tara, "tara@example.com", "Tara T")
    approved_member(uma, "uma@example.com", "Uma U")
    approved_member(wen, "wen@example.com", "Wen W")
    sign_up(vik, "viktor@example.com", {"full_name": "Viktor V"}, accept_terms=True)
    new_name = "0b9d0c4e-5d6f-4a8b-9c1d-2e3f4a5b6c7d.jpg"  # as the site names uploads now
    old = "now() - interval '2 days'"

    # --- buckets and file names (C2) --------------------------------------------
    check("the photo buckets take JPEG, PNG and WebP (no GIF), profile photos up to 2 MB, other photos up to 4 MB",
          "SELECT string_agg(id || ':' || file_size_limit || ':' || array_to_string(allowed_mime_types, ','), ' ' ORDER BY id) "
          "FROM storage.buckets WHERE id IN ('avatars', 'post-images', 'marketplace-images')",
          expect="avatars:2097152:image/jpeg,image/png,image/webp "
                 "marketplace-images:4194304:image/jpeg,image/png,image/webp "
                 "post-images:4194304:image/jpeg,image/png,image/webp")
    check("a member uploads a photo with a random name into their own folder",
          f"INSERT INTO storage.objects (bucket_id, name) VALUES ('avatars', '{tara}/{new_name}') RETURNING 1",
          as_user=tara, expect="1")
    check("... and uses it as their profile photo (random names pass the photo-link check)",
          f"UPDATE profiles SET avatar_url = '{STORE}/avatars/{tara}/{new_name}' WHERE id = auth.uid() RETURNING 1",
          as_user=tara, expect="1")
    check("... and for a post",
          f"INSERT INTO posts (user_id, content, image_url) VALUES (auth.uid(), 'new name', '{STORE}/post-images/{tara}/{new_name}') "
          "RETURNING 1", as_user=tara, expect="1")
    check("setup: a post with an old-style photo link, from before random names",
          f"INSERT INTO posts (id, user_id, content, image_url) VALUES ('10000000-0000-0000-0000-000000000701', '{tara}', 'old', "
          f"'{STORE}/post-images/{tara}/1776988015790.jpeg')")
    check("... old links keep working when the post is edited",
          "UPDATE posts SET content = 'old, edited' WHERE id = '10000000-0000-0000-0000-000000000701' RETURNING 1",
          as_user=tara, expect="1")

    # --- the photo clean-up (C1) --------------------------------------------------
    escaped_store = STORE.replace("/", "\\/")  # a link written with JSON escapes
    check("setup: photo files, and the rows that use some of them", f"""
          INSERT INTO storage.buckets (id, name, public) VALUES ('photos', 'photos', true), ('documents', 'documents', false);
          INSERT INTO storage.objects (bucket_id, name, created_at) VALUES
            ('avatars', '{tara}/avatar_1700000000000.png', {old}),
            ('avatars', '{tara}/now-used.jpg', {old}),
            ('post-images', '{tara}/fresh.jpg', now()),
            ('post-images', '{tara}/post.jpg', {old}),
            ('post-images', '{tara}/event.jpg', {old}),
            ('post-images', '{tara}/group.jpg', {old}),
            ('marketplace-images', '{tara}/m1.jpg', {old}),
            ('marketplace-images', '{tara}/m 2.jpg', {old}),
            ('marketplace-images', '{tara}/m3.jpg', {old}),
            ('marketplace-images', '{uma}/single.jpg', {old}),
            ('post-images', '{gone}/a.jpg', now()),
            ('avatars', '{gone}/b.jpg', {old}),
            ('photos', '{gone}/c.jpg', {old}),
            ('post-images', 'starter/new.jpg', now()),
            ('post-images', 'starter/old.jpg', {old}),
            ('documents', '{gone}/d.pdf', {old});
          UPDATE profiles SET avatar_url = '{STORE}/avatars/{tara}/now-used.jpg?t=1700000000001' WHERE id = '{tara}';
          INSERT INTO posts (user_id, content, image_url) VALUES ('{tara}', 'with photo', '{STORE}/post-images/{tara}/post.jpg');
          INSERT INTO events (organizer_id, title, date, image_url) VALUES ('{tara}', 'Garba', '2030-10-01', '{STORE}/post-images/{tara}/event.jpg');
          INSERT INTO groups (name, image_url) VALUES ('Indians who take photos', '{STORE}/post-images/{tara}/group.jpg');
          INSERT INTO marketplace (user_id, title, price, image_url) VALUES
            ('{tara}', 'Lamp', '€5', '["{STORE}/marketplace-images/{tara}/m1.jpg", "{STORE}/marketplace-images/{tara}/m%202.jpg"]'),
            ('{uma}', 'Chair', '€5', '{STORE}/marketplace-images/{uma}/single.jpg'),
            ('{uma}', 'Odd', '€5', '{{"length": 5}}'),
            ('{tara}', 'Escaped', '€5', '["{escaped_store}\\/marketplace-images\\/{tara}\\/m\\u0033.jpg"]');""")
    mine = (f"WHERE name LIKE '{tara}/%' OR name LIKE '{uma}/%' OR name LIKE '{gone}/%' OR name LIKE 'starter/%'")
    check("members can't list the files to delete", "SELECT * FROM public.admin_storage_orphans()", as_user=tara,
          error_has="Admins only")
    check("... nor signed-out visitors", "SELECT * FROM public.admin_storage_orphans()", role="anon", expect="error")
    check("the clean-up lists files of deleted accounts (at once) and day-old files nothing uses, and nothing else",
          "SELECT string_agg(bucket_id || '/' || name || ':' || reason, ' ' ORDER BY reason, bucket_id, name) "
          f"FROM public.admin_storage_orphans(1000) {mine}", as_user=ADMIN,
          expect=f"avatars/{gone}/b.jpg:account_deleted photos/{gone}/c.jpg:account_deleted "
                 f"post-images/{gone}/a.jpg:account_deleted avatars/{tara}/avatar_1700000000000.png:unused "
                 "post-images/starter/old.jpg:unused")
    check("... a few at a time", "SELECT count(*) FROM public.admin_storage_orphans(2)", as_user=ADMIN, expect="2")
    check("admins see every photo file (Storage needs it to delete one)",
          f"SELECT count(*) FROM storage.objects WHERE name LIKE '{uma}/%'", as_user=ADMIN, expect="1")
    check("... members only their own", f"SELECT count(*) FROM storage.objects WHERE name LIKE '{uma}/%'", as_user=tara,
          expect="0")
    for label, name in [("a profile photo (link with ?t=)", f"{tara}/now-used.jpg"), ("a post's photo", f"{tara}/post.jpg"),
                        ("an event's photo", f"{tara}/event.jpg"), ("a group's photo", f"{tara}/group.jpg"),
                        ("a listing's photo", f"{tara}/m1.jpg"), ("a listing's photo, linked with %20", f"{tara}/m 2.jpg"),
                        ("a listing's photo, linked with JSON escapes", f"{tara}/m3.jpg"),
                        ("a listing's only photo (not a list)", f"{uma}/single.jpg")]:
        check(f"an admin can't delete a photo file that is used: {label}",
              f"DELETE FROM storage.objects WHERE name = '{name}' RETURNING 1", as_user=ADMIN, expect="")
    check("an admin deletes files nothing uses",
          f"WITH d AS (DELETE FROM storage.objects WHERE bucket_id = 'avatars' "
          f"AND name IN ('{tara}/avatar_1700000000000.png', '{gone}/b.jpg') RETURNING name) "
          "SELECT string_agg(name, ',' ORDER BY name) FROM d", as_user=ADMIN,
          expect=f"{tara}/avatar_1700000000000.png,{gone}/b.jpg")
    check("... also in the old bucket 'photos'",
          f"DELETE FROM storage.objects WHERE bucket_id = 'photos' RETURNING name", as_user=ADMIN, expect=f"{gone}/c.jpg")
    check("... but not files in other buckets",
          f"DELETE FROM storage.objects WHERE bucket_id = 'documents' RETURNING name", as_user=ADMIN, expect="")
    # The policy's list of names in use is made once per request, not once
    # per file: with a few thousand rows (here listings full of %-escaped
    # links, which any member can store) a 100-file Storage request must
    # still finish within Supabase's 8-second limit for signed-in requests.
    ok, plan, err = psql(f"""
          BEGIN;
          SELECT set_config('request.jwt.claims', '{{"sub": "{ADMIN}", "role": "authenticated"}}', true) IS NULL;
          SET LOCAL ROLE authenticated;
          EXPLAIN (VERBOSE, COSTS OFF) DELETE FROM storage.objects WHERE bucket_id = 'avatars' AND name = ANY ('{{a/b.jpg,c/d.jpg}}');
          ROLLBACK;""")
    filters = [l for l in plan.splitlines() if "Filter:" in l]
    verdict("an admin's delete looks up the photos in use once per request (InitPlan), not for each file",
            ok and "InitPlan" in plan and "admin_image_refs" in plan and filters
            and not any("admin_image_refs" in l or "image_names" in l for l in filters), plan[:600] + err[:300])
    check("... and 100 files go within Supabase's 8 seconds, with 4,000 posts and 300 listings of %-escaped links", f"""
          BEGIN;
          SET LOCAL session_replication_role = replica;
          INSERT INTO posts (user_id, content, image_url)
            SELECT '{uma}', 'load ' || g, '{STORE}/post-images/{uma}/load%5F' || g || '.jpg' FROM generate_series(1, 4000) g;
          INSERT INTO marketplace (user_id, title, price, image_url)
            SELECT '{uma}', 'load ' || g, '1',
                   (SELECT json_agg('{STORE}/marketplace-images/{uma}/l%20' || g || '-' || k || '.jpg')::text FROM generate_series(1, 20) k)
            FROM generate_series(1, 300) g;
          INSERT INTO storage.objects (bucket_id, name, created_at)
            SELECT 'post-images', '{uma}/load_' || g || '.jpg', {old} FROM generate_series(1, 4000) g
            UNION ALL SELECT 'post-images', '{uma}/gone' || g || '.jpg', {old} FROM generate_series(1, 95) g;
          SET LOCAL session_replication_role = origin;
          SELECT set_config('request.jwt.claims', '{{"sub": "{ADMIN}", "role": "authenticated"}}', true) IS NULL;
          SET LOCAL ROLE authenticated;
          SET LOCAL statement_timeout = '8s';
          WITH d AS (
            DELETE FROM storage.objects WHERE bucket_id = 'post-images' AND name = ANY (
              ARRAY(SELECT '{uma}/gone' || g || '.jpg' FROM generate_series(1, 95) g)
              || ARRAY(SELECT '{uma}/load_' || g || '.jpg' FROM generate_series(1, 5) g))
            RETURNING name)
          SELECT count(*) || ' deleted, ' || count(*) FILTER (WHERE name LIKE '%/load_%') || ' in use' FROM d;
          ROLLBACK;""", expect="f\n95 deleted, 0 in use")
    check("%-escapes of printable ASCII are decoded (Storage names are ASCII); anything else stays as it is",
          "SELECT private.percent_decode('m%202.jpg') || '|' || private.percent_decode('a%2Fb%5f') || '|' "
          "|| private.percent_decode('%zz%e2%82%ac%00%') || '|' || private.percent_decode('plain')",
          expect="m 2.jpg|a/b_|%zz%e2%82%ac%00%|plain")
    check("the list of photos in use is for admins only", "SELECT private.admin_image_refs() IS NULL", as_user=tara,
          expect="t")
    check("... (an admin gets it)", f"SELECT '{tara}/post.jpg' = ANY (private.admin_image_refs())", as_user=ADMIN,
          expect="t")
    check("a member can't delete another member's file, used or not",
          f"DELETE FROM storage.objects WHERE name IN ('{gone}/a.jpg', '{uma}/single.jpg') RETURNING 1", as_user=tara, expect="")
    check("tara deletes the post with the photo",
          "DELETE FROM posts WHERE content = 'with photo' AND user_id = auth.uid() RETURNING 1", as_user=tara, expect="1")
    check("... now the clean-up lists its photo, and an admin can delete it",
          f"SELECT count(*) FROM public.admin_storage_orphans(1000) WHERE name = '{tara}/post.jpg'; "
          f"DELETE FROM storage.objects WHERE name = '{tara}/post.jpg' RETURNING 1", as_user=ADMIN, expect="1\n1")
    check("a member deletes their own files, used or not (the site deletes them with what used them)",
          f"DELETE FROM storage.objects WHERE name IN ('{tara}/fresh.jpg', '{tara}/m1.jpg') RETURNING 1", as_user=tara,
          expect="1\n1")
    check("setup: wen is blocked", f"UPDATE profile_private SET status = 'blocked' WHERE id = '{wen}'; "
          f"INSERT INTO storage.objects (bucket_id, name) VALUES ('avatars', '{wen}/me.jpg')")
    check("... a blocked member can still delete their own files (before deleting the account)",
          f"DELETE FROM storage.objects WHERE name = '{wen}/me.jpg' RETURNING 1", as_user=wen, expect="1")
    check("members can't start the daily clean-up", "SELECT public.admin_photo_cleanup_due()", as_user=tara,
          error_has="Admins only")
    check("the first admin to open the panel on a day runs the daily clean-up, nobody after them that day",
          "SELECT public.admin_photo_cleanup_due()::text || ',' || public.admin_photo_cleanup_due()::text", as_user=ADMIN,
          expect="true,false")
    check("... the next day it runs again",
          "UPDATE private.app_config SET value = '2020-01-01' WHERE key = 'photo_cleanup_on'; "
          "SET ROLE authenticated; "
          f"SELECT set_config('request.jwt.claims', '{{\"sub\": \"{ADMIN}\", \"role\": \"authenticated\"}}', true) IS NOT NULL; "
          "SELECT public.admin_photo_cleanup_due()", expect="t\nt")
    stub_delete = """
          CREATE FUNCTION storage.no_deletes() RETURNS trigger LANGUAGE plpgsql AS $f$
            BEGIN RAISE EXCEPTION 'Direct deletion from storage tables is not allowed. Use the Storage API instead.'; END $f$;
          CREATE TRIGGER protect_buckets_delete BEFORE DELETE ON storage.buckets FOR EACH STATEMENT EXECUTE FUNCTION storage.no_deletes();"""
    photos_bucket = migration_part('The bucket "photos"', "Admins see every photo file", STORAGE_IMAGES)
    check("the migration deletes the empty bucket 'photos'", f"""
          BEGIN;
          {photos_bucket}
          SELECT count(*) FROM storage.buckets WHERE id = 'photos';
          ROLLBACK;""", expect="0")
    check("... keeps it while it has files", f"""
          BEGIN;
          INSERT INTO storage.objects (bucket_id, name) VALUES ('photos', 'x/y.jpg');
          {photos_bucket}
          SELECT count(*) FROM storage.buckets WHERE id = 'photos';
          ROLLBACK;""", expect="1")
    check("... and goes on where the database refuses to delete it (as Supabase can)", f"""
          BEGIN;
          {stub_delete}
          {photos_bucket}
          SELECT count(*) FROM storage.buckets WHERE id = 'photos';
          ROLLBACK;""", expect="1")
    buckets_block = migration_part("What the buckets accept", 'The bucket "photos"', STORAGE_IMAGES)
    ok, _, err = psql(f"""
          BEGIN;
          {buckets_block}
          ROLLBACK;""")
    verdict("the migration changes all three photo buckets without a notice", ok and "NRIClub" not in err, err[:300])
    ok, _, err = psql(f"""
          BEGIN;
          CREATE FUNCTION storage.skip_avatars() RETURNS trigger LANGUAGE plpgsql AS $f$
            BEGIN IF NEW.id = 'avatars' THEN RETURN NULL; END IF; RETURN NEW; END $f$;
          CREATE TRIGGER skip_avatars BEFORE UPDATE ON storage.buckets FOR EACH ROW EXECUTE FUNCTION storage.skip_avatars();
          {buckets_block}
          ROLLBACK;""")
    verdict("... and says so where it can change only some of them (set the rest in the dashboard)",
            ok and "only 2 of the photo buckets" in err, err[:300])

    # --- invite codes (C19) ---------------------------------------------------------
    check("a member's invite code: 12 random letters and digits, the same every time",
          "SELECT (public.my_invite_code() ~ '^[a-z2-9]{12}$')::text || ',' || (public.my_invite_code() = public.my_invite_code())::text",
          as_user=tara, expect="true,true")
    check("... another member gets another", "SELECT public.my_invite_code() IS NOT NULL", as_user=uma, expect="t")
    check("... (two codes)", f"SELECT count(DISTINCT code) FROM invites WHERE member_id IN ('{tara}', '{uma}')", expect="2")
    check("signed-out visitors get no code", "SELECT public.my_invite_code()", role="anon", expect="error")
    check("a blocked member gets no code", "SELECT public.my_invite_code()", as_user=wen, error_has="blocked")
    check("members see only their own invite code", "SELECT count(*) FROM invites", as_user=uma, expect="1")
    check("... admins all of them", "SELECT (count(*) >= 2)::text FROM invites", as_user=ADMIN, expect="true")
    check("members can't make up a code", "INSERT INTO invites (code, member_id) VALUES ('abcdefghijkm', auth.uid())",
          as_user=vik, expect="error")
    check("... or change theirs", "UPDATE invites SET code = 'abcdefghijkm' WHERE member_id = auth.uid()", as_user=tara,
          expect="error")
    ok, tara_code, err = psql(f"SELECT code FROM invites WHERE member_id = '{tara}'")
    if not ok or not tara_code:
        sys.exit("reading tara's invite code failed: " + err)
    check("\"Download my data\" has the member's invite code (export_my_data of 20261021)",
          "SELECT public.export_my_data() ->> 'invite_code'", as_user=tara, expect=tara_code)
    check("... and null for a member who never asked for one",
          "SELECT (public.export_my_data() -> 'invite_code') = 'null'::jsonb", as_user=wen, expect="t")
    check("a new member's invite code tells who invited them",
          f"SELECT member_id || ',' || first_name FROM public.resolve_invite('{tara_code}')", as_user=vik,
          expect=f"{tara},Tara")
    check("... also in capitals", f"SELECT first_name FROM public.resolve_invite(' {tara_code.upper()} ')", as_user=vik,
          expect="Tara")
    check("an unknown code finds nobody", "SELECT count(*) FROM public.resolve_invite('zzzzzzzzzzzz')", as_user=vik, expect="0")
    check("... nor does the member's own", f"SELECT count(*) FROM public.resolve_invite('{tara_code}')", as_user=tara,
          expect="0")
    check("signed-out visitors can't look codes up", f"SELECT * FROM public.resolve_invite('{tara_code}')", role="anon",
          expect="error")
    check("codes can't be tried out: 30 lookups a day",
          "SELECT count(*) FROM generate_series(1, 40) g, LATERAL public.resolve_invite('zzzzzzzzzzzz' || g) r", as_user=vik,
          error_has="too often")
    check("uma deletes her account", "SELECT public.delete_my_account()", as_user=uma)
    check("... (no code left)", f"SELECT count(*) FROM invites WHERE member_id = '{uma}'", expect="0")
    check("... and the clean-up lists the account's files at once, although a listing used them until now",
          "SELECT string_agg(name || ':' || reason, ' ') FROM public.admin_storage_orphans(1000) "
          f"WHERE name LIKE '{uma}/%'", as_user=ADMIN, expect=f"{uma}/single.jpg:account_deleted")


def admin_access():
    """Admin rights need an active account and, once switched on, two-step
    login (C4); other members see only approved, active members; admin search
    and the review queue in pages (C25): migration 20261023000000_admin_access."""
    zara, lena, pema, bodhi, rudra, inka = (f"00000000-0000-0000-0000-0000000008{n}"
                                            for n in ("01", "02", "03", "04", "05", "06"))
    approved_member(zara, "zara@example.com", "Zara Z")
    psql(f"INSERT INTO public.admins (user_id) VALUES ('{zara}')")
    approved_member(lena, "lena@example.com", "Lena L", city="Hamburg")
    approved_member(bodhi, "bodhi@example.com", "Bodhi B")
    approved_member(rudra, "rudra@example.com", "Rudra R")
    sign_up(pema, "pema@example.com", {"full_name": "Pema P"}, accept_terms=True)
    sign_up(inka, "inka@example.com", {"full_name": "Inka I"}, accept_terms=True)
    bodhi_post, bodhi_event = "10000000-0000-0000-0000-000000000804", "20000000-0000-0000-0000-000000000804"
    aal1, aal2 = {"aal": "aal1"}, {"aal": "aal2"}
    five = f"('{lena}', '{pema}', '{bodhi}', '{rudra}', '{inka}')"
    seen = f"SELECT string_agg(name, ',' ORDER BY name) FROM profiles WHERE id IN {five}"

    # --- who sees whom ----------------------------------------------------------
    # (His LinkedIn link as it was when he was approved: a change would send
    # him back to review.)
    psql(f"UPDATE profiles SET linkedin_url = 'https://www.linkedin.com/in/bodhi-b' WHERE id = '{bodhi}'")
    check("bodhi posts, organises an event and shows his LinkedIn link while he's approved", f"""
          INSERT INTO posts (id, user_id, content) VALUES ('{bodhi_post}', '{bodhi}', 'Cricket on Sunday?');
          INSERT INTO events (id, title, date, location, organizer_id) VALUES ('{bodhi_event}', 'Cricket', '2099-01-01', 'Park', '{bodhi}');
          UPDATE profiles SET linkedin_public = TRUE WHERE id = auth.uid();
          SELECT organizer_name FROM events WHERE id = '{bodhi_event}'""", as_user=bodhi, expect="Bodhi B")
    check("pema waits for review", "SELECT public.submit_verification('Berlin', 'DE', '', 'linkedin.com/in/pema-p', '', '', NULL)",
          as_user=pema, expect="pending")
    check("rudra is declined, bodhi blocked; inka never sent her details", f"""
          UPDATE profile_private SET verification_status = 'rejected', reviewed_at = now() WHERE id = '{rudra}';
          UPDATE profile_private SET status = 'blocked' WHERE id = '{bodhi}'""")
    check("an approved member sees only approved, active members", seen, as_user=lena, expect="Lena L")
    check("... members waiting for review see only themselves", seen, as_user=pema, expect="Pema P")
    check("... a blocked member sees only themselves", seen, as_user=bodhi, expect="Bodhi B")
    check("... unfinished accounts see only themselves", seen, as_user=inka, expect="Inka I")
    check("... admins see everyone", seen, as_user=zara, expect="Bodhi B,Inka I,Lena L,Pema P,Rudra R")
    check("what bodhi posted stays, without his profile", f"""
          SELECT (p.id IS NOT NULL) || '|' || (pr.id IS NULL)
          FROM posts p LEFT JOIN profiles pr ON pr.id = p.user_id WHERE p.id = '{bodhi_post}'""",
          as_user=lena, expect="true|true")
    check("... his events lose his name",
          f"SELECT organizer_id || '|' || organizer_name FROM events WHERE id = '{bodhi_event}'",
          as_user=lena, expect=f"{bodhi}|")
    check("... members get no LinkedIn link of his (though he shows it)",
          f"SELECT count(*) FROM public.profile_links(ARRAY['{bodhi}', '{lena}']::uuid[]) WHERE id = '{bodhi}'",
          as_user=lena, expect="0")
    check("... but admins do", f"SELECT linkedin_url FROM public.profile_links(ARRAY['{bodhi}']::uuid[])",
          as_user=zara, expect="https://www.linkedin.com/in/bodhi-b")
    check("... and so does he", f"SELECT linkedin_url FROM public.profile_links(ARRAY['{bodhi}']::uuid[])",
          as_user=bodhi, expect="https://www.linkedin.com/in/bodhi-b")
    check("... members get no contact settings of accounts that aren't shown",
          f"SELECT count(*) FROM public.get_member_preferences('{bodhi}')", as_user=lena, expect="0")
    check("... but of members who are",
          f"INSERT INTO user_settings (user_id) VALUES ('{lena}') ON CONFLICT DO NOTHING; "
          f"SET ROLE authenticated; SELECT set_config('request.jwt.claims', '{{\"sub\": \"{zara}\", \"role\": \"authenticated\"}}', false) IS NULL; "
          f"SELECT receive_messages FROM public.get_member_preferences('{lena}')", expect="f\nEveryone")
    check("unblocked, bodhi's name is back on his event", f"""
          UPDATE profile_private SET status = 'active' WHERE id = '{bodhi}';
          SELECT organizer_name FROM events WHERE id = '{bodhi_event}'""", expect="Bodhi B")
    check("... and members see him again", seen, as_user=lena, expect="Bodhi B,Lena L")
    check("an approved member who changes their name is back in review", """
          UPDATE profiles SET name = 'Bodhi Bose' WHERE id = auth.uid();
          SELECT verification_status FROM profile_private WHERE id = auth.uid()""", as_user=bodhi, expect="pending")
    check("... and isn't shown until approved again", seen, as_user=lena, expect="Lena L")
    check("... then with the new name on his event", f"""
          UPDATE profile_private SET verification_status = 'approved' WHERE id = '{bodhi}';
          SELECT organizer_name FROM events WHERE id = '{bodhi_event}'""", expect="Bodhi Bose")

    # --- admin rights: an active account (C4) -------------------------------------
    rights = "SELECT ((SELECT count(*) FROM profile_private) > 1)::text"
    check("an admin has admin rights", rights, as_user=zara, expect="true")
    check("an admin can't block her own account", "UPDATE profile_private SET status = 'blocked' WHERE id = auth.uid()",
          as_user=zara, error_has="You can't block your own account.")
    check("... but can block a member (through admin_moderate, 20261021), and unblock them",
          block(inka) + "; " + unblock(inka), as_user=zara, expect="blocked\nactive")
    check("an admin's account is blocked (in the SQL editor)", f"UPDATE profile_private SET status = 'blocked' WHERE id = '{zara}'")
    check("... and has no admin rights", rights, as_user=zara, expect="false")
    check("... not even signed in with the code", rights, as_user=zara, claims=aal2, expect="false")
    check("... can't change the two-step setting", "SELECT public.admin_set_mfa_required(true)", as_user=zara,
          claims=aal2, error_has="Admins only")
    check("... and is told she isn't an admin now",
          "SELECT concat_ws('|', s->>'listed', s->>'active', s->>'is_admin') FROM public.admin_mfa_status() s",
          as_user=zara, expect="true|false|false")
    check("unblocked again (in the SQL editor)", f"UPDATE profile_private SET status = 'active' WHERE id = '{zara}'")

    # --- admin rights: two-step login (C4) ----------------------------------------
    status = ("SELECT concat_ws('|', s->>'listed', s->>'mfa_required', s->>'aal', s->>'is_admin') "
              "FROM public.admin_mfa_status() s")
    check("two-step login isn't required to start with", status, as_user=zara, claims=aal1, expect="true|false|aal1|true")
    check("a member learns only that she isn't an admin", "SELECT public.admin_mfa_status()::text", as_user=lena,
          expect='{"listed": false, "is_admin": false}')
    check("anon can't ask", "SELECT public.admin_mfa_status()", role="anon", expect="error")
    check("anon can't switch it on", "SELECT public.admin_set_mfa_required(true)", role="anon", expect="error")
    check("a member can't switch it on, even signed in with a code", "SELECT public.admin_set_mfa_required(true)",
          as_user=lena, claims=aal2, error_has="Admins only")
    check("an admin signed in with the password only can't switch it on", "SELECT public.admin_set_mfa_required(true)",
          as_user=zara, claims=aal1, error_has="Confirm with the 6-digit code")
    check("an admin signed in with the code can", "SELECT public.admin_set_mfa_required(true)::text", as_user=zara,
          claims=aal2, expect="true")
    check("... which is kept with who changed it and when",
          f"SELECT concat_ws('|', value, (updated_by = '{zara}')::text, (updated_at > now() - interval '1 minute')::text) "
          "FROM private.app_settings WHERE key = 'admin_mfa_required'", expect="true|true|true")
    check("members can't read the settings", "SELECT count(*) FROM private.app_settings", as_user=lena, expect="error")
    check("now a session signed in with the password only has no admin rights", rights, as_user=zara, claims=aal1,
          expect="false")
    check("... nor one that doesn't say", rights, as_user=ADMIN, expect="false")
    check("... and is told so", status, as_user=zara, claims=aal1, expect="true|true|aal1|false")
    check("... can't search members", "SELECT public.admin_search_members('')", as_user=zara, claims=aal1,
          error_has="Admins only")
    check("... nor read the review queue", "SELECT count(*) FROM public.admin_verification_queue()", as_user=zara,
          claims=aal1, error_has="Admins only")
    check("... sees members as any member does", seen, as_user=zara, claims=aal1, expect="Bodhi Bose,Lena L")
    check("... and can't switch two-step login off", "SELECT public.admin_set_mfa_required(false)", as_user=zara,
          claims=aal1, error_has="Confirm with the 6-digit code")
    check("a session signed in with the code has admin rights", rights, as_user=zara, claims=aal2, expect="true")
    check("... and is told so", status, as_user=zara, claims=aal2, expect="true|true|aal2|true")
    check("... and can switch two-step login off again", "SELECT public.admin_set_mfa_required(false)::text",
          as_user=zara, claims=aal2, expect="false")
    check("then the other admin has admin rights again", rights, as_user=ADMIN, expect="true")
    check("the setting is on or off, nothing else", "SELECT public.admin_set_mfa_required(NULL)", as_user=zara,
          claims=aal2, error_has="Say whether")

    # --- admin search (C25) ---------------------------------------------------------
    search = ("SELECT (r->>'total') || '|' || COALESCE((SELECT string_agg(m->>'name', ',' ORDER BY m->>'name') "
              "FROM jsonb_array_elements(r->'members') m), '') FROM public.admin_search_members({}) r")
    check("admins find members by part of the name, in any case", search.format("'aRA z'"), as_user=zara, expect="1|Zara Z")
    check("... by part of the email address", search.format("'pema@exam'"), as_user=zara, expect="1|Pema P")
    check("... by city", search.format("'hambu'"), as_user=zara, expect="1|Lena L")
    check("... declined members too", search.format("'rudra'"), as_user=zara, expect="1|Rudra R")
    check("... % and _ match only themselves", search.format("'%'") + "; " + search.format("'_'"), as_user=zara,
          expect="0|\n0|")
    check("... by status", "SELECT ((r->>'total')::int = (SELECT count(*) FROM profile_private WHERE verification_status = 'rejected'))::text "
          "FROM public.admin_search_members('', 'rejected') r", as_user=zara, expect="true")
    check("rudra is blocked too", f"UPDATE profile_private SET status = 'blocked' WHERE id = '{rudra}'")
    check("... blocked or not", "SELECT ((r->>'total')::int = (SELECT count(*) FROM profile_private WHERE status = 'blocked') "
          "AND (r->>'total')::int > 0)::text FROM public.admin_search_members('', NULL, TRUE) r", as_user=zara, expect="true")
    check("... with their private details and LinkedIn link", """
          SELECT concat_ws('|', m->'profile_private'->>'email', m->'profile_private'->>'status',
            m->'profile_private'->>'verification_status', m->>'linkedin_url')
          FROM public.admin_search_members('bodhi') r, jsonb_array_elements(r->'members') m""",
          as_user=zara, expect="bodhi@example.com|active|approved|https://www.linkedin.com/in/bodhi-b")
    check("... newest first, in pages, with the total", """
          SELECT ((a->>'total') = (b->>'total') AND (a->>'total')::int = (SELECT count(*) FROM profiles)
            AND jsonb_array_length(a->'members') = 2 AND jsonb_array_length(b->'members') = 2
            AND (a->'members'->0->>'id') NOT IN (b->'members'->0->>'id', b->'members'->1->>'id')
            AND (a->'members'->0->>'created_at')::timestamptz >= (a->'members'->1->>'created_at')::timestamptz)::text
          FROM public.admin_search_members('', NULL, NULL, 2, 0) a, public.admin_search_members('', NULL, NULL, 2, 2) b""",
          as_user=zara, expect="true")
    check("... at most 200 at a time, at least 1",
          "SELECT (jsonb_array_length(r->'members') = LEAST((r->>'total')::int, 200))::text || '|' || "
          "jsonb_array_length(s->'members') FROM public.admin_search_members('', NULL, NULL, 100000) r, "
          "public.admin_search_members('', NULL, NULL, 0) s", as_user=zara, expect="true|1")
    check("members can't search", "SELECT public.admin_search_members('a')", as_user=lena, error_has="Admins only")
    check("anon can't search", "SELECT public.admin_search_members('a')", role="anon", expect="error")
    check("the search has trigram indexes on names, places and email addresses",
          "SELECT string_agg(indexname, ',' ORDER BY indexname) FROM pg_indexes WHERE indexname LIKE '%trgm'",
          expect="idx_profile_private_email_trgm,idx_profiles_city_trgm,idx_profiles_location_trgm,idx_profiles_name_trgm")
    ok, out, err = psql("SET enable_seqscan = off; EXPLAIN SELECT id FROM public.profiles WHERE name ILIKE '%len%'")
    verdict("... which a search for part of a name uses", ok and "idx_profiles_name_trgm" in out, out or err)

    # --- the review queue in pages (C25) ---------------------------------------------
    check("approved members were decided on at different times", f"""
          UPDATE profile_private SET reviewed_at = now() - interval '1 day' * (CASE id WHEN '{lena}' THEN 1
            WHEN '{zara}' THEN 2 ELSE 3 END) WHERE verification_status = 'approved'""")
    queue = ("SELECT string_agg(q.id::text, ',' ORDER BY q.ordinality) "
             "FROM public.admin_verification_queue(ARRAY['approved']{}) WITH ORDINALITY q")
    ok, everyone, err = psql(queue.format(""), "authenticated", zara)
    ids = everyone.split(",") if ok and everyone else []
    verdict("approved members come newest decision first", ok and ids[:2] == [lena, zara], f"{ids[:3]} {err}")
    check("... in pages", queue.format(", 2, 0") + "; " + queue.format(", 2, 2"), as_user=zara,
          expect=",".join(ids[:2]) + "\n" + ",".join(ids[2:4]))
    check("... each saying how many there are in all",
          "SELECT DISTINCT (total_count = (SELECT count(*) FROM profile_private WHERE verification_status = 'approved'))::text "
          "FROM public.admin_verification_queue(ARRAY['approved'], 2, 0)", as_user=zara, expect="true")
    check("... and asked as before (statuses only), the whole list as before",
          "SELECT (count(*) = (SELECT count(*) FROM profile_private WHERE verification_status = 'pending'))::text "
          "FROM public.admin_verification_queue(ARRAY['pending'])", as_user=zara, expect="true")
    check("... one member by id, whatever their status", f"""
          SELECT string_agg(name || ':' || verification_status || ':' || total_count, ',')
          FROM public.admin_verification_queue(NULL, 1000, 0, ARRAY['{pema}']::uuid[])""", as_user=zara,
          expect="Pema P:pending:1")
    check("... and nobody without statuses or ids",
          "SELECT count(*) FROM public.admin_verification_queue(NULL)", as_user=zara, expect="0")
    check("... members can't read it", "SELECT count(*) FROM public.admin_verification_queue(ARRAY['approved'], 2, 0)",
          as_user=lena, error_has="Admins only")

    # --- the migration's changes to existing rows ---------------------------------------
    check("existing rows: events of organisers who aren't shown lose the name; shown ones without it get it", f"""
          BEGIN;
          ALTER TABLE public.profile_private DISABLE TRIGGER sync_organizer_name;
          UPDATE profile_private SET status = 'blocked' WHERE id = '{bodhi}';
          ALTER TABLE public.profile_private ENABLE TRIGGER sync_organizer_name;
          INSERT INTO events (title, date, location, organizer_id, organizer_name) VALUES ('Picnic', '2099-02-02', 'Park', '{lena}', 'Lena L');
          INSERT INTO events (title, date, location, organizer_id, organizer_name) VALUES ('Quiz', '2099-03-03', 'Pub', '{lena}', '');
          INSERT INTO events (title, date, location, organizer_id, organizer_name) VALUES ('Yoga', '2099-03-04', 'Park', '{pema}', '');
          SELECT organizer_name FROM events WHERE id = '{bodhi_event}';
          {migration_section("EXISTING DATA", ADMIN_ACCESS)}
          SELECT string_agg(organizer_name, ',' ORDER BY title) FROM events WHERE organizer_id IN ('{bodhi}', '{lena}', '{pema}');
          ROLLBACK;""", expect="Bodhi Bose\n,Lena L,Lena L,")
    # (acc-rev) An admin account members don't see (not approved) hides its
    # posts' author: the update says how many there are.
    ok, out, err = psql(f"""BEGIN;
          INSERT INTO public.admins (user_id) VALUES ('{pema}');
          {migration_section("EXISTING DATA", ADMIN_ACCESS)}
          SELECT count(*) FROM public.admins a LEFT JOIN public.profile_private pp ON pp.id = a.user_id
          WHERE pp.id IS NULL OR pp.status <> 'active' OR pp.verification_status <> 'approved';
          ROLLBACK;""")
    found = re.search(r"; (\d+) not shown to members", err) if ok else None
    shown = found.group(1) if found else None
    verdict("existing rows: the update says how many admin accounts members don't see",
            shown is not None and out.splitlines()[-1:] == [shown] and int(shown) >= 1, f"{out} | {err}")


def function_source(path, header):
    """A function's CREATE statement in a migration, from its header line to
    the closing $$; (the first one after the header)."""
    with open(path, encoding="utf-8") as f:
        text = f.read()
    start = text.index(header)
    return text[start:text.index("\n$$;", start) + 4]


def ambassador_applications():
    """Applications to be a city ambassador from the site, the admin panel's
    list and decisions, clean-up and "Download my data": migration
    20261024000000_ambassador_applications."""
    import difflib
    asha, bina, chet, dev, eli, fay = (f"00000000-0000-0000-0000-0000000009{n}"
                                       for n in ("01", "02", "03", "04", "05", "06"))
    approved_member(asha, "asha@example.com", "Asha A")
    approved_member(chet, "chet@example.com", "Chet C", city="Frankfurt am Main")
    approved_member(dev, "dev@example.com", "Dev D")
    approved_member(eli, "eli@example.com", "Eli E")
    approved_member(fay, "fay@example.com", "Fay F")
    sign_up(bina, "bina@example.com", {"full_name": "Bina B"}, accept_terms=True)
    psql(f"UPDATE profile_private SET verification_status = 'pending', submitted_at = now() WHERE id = '{bina}'")
    q = lambda v: "'" + v.replace("'", "''") + "'"
    motivation = "I know the city well and love bringing people together."

    def apply(name="Anita Applicant", email="anita.applicant@example.org", city="Hamburg", country="Germany",
              org="", linkedin="", why=motivation, hours="1_2", email_sql=None):
        return (f"public.submit_ambassador_application({q(name)}, {email_sql or q(email)}, {q(city)}, {q(country)}, "
                f"{q(org)}, {q(linkedin)}, {q(why)}, {q(hours)})")

    def app_id(email, status="new"):
        """An application's id, as an admin finds it in the list (the oldest
        one with that address and status)."""
        return (f"(SELECT (e->>'id')::uuid FROM jsonb_array_elements(public.admin_ambassador_applications("
                f"'{status}', 200)->'applications') e WHERE e->>'email' = {q(email)} "
                f"ORDER BY (e->>'created_at')::timestamptz LIMIT 1)")

    def decide(email, status, note=None, city=None, current="new"):
        args = [app_id(email, current), q(status), q(note) if note is not None else "NULL"]
        if city:
            args.append(q(city))
        return f"public.admin_update_ambassador_application({', '.join(args)})"

    admins = ("(SELECT count(*) FROM public.admins a JOIN public.profile_private pp ON pp.id = a.user_id "
              "WHERE pp.status = 'active')")

    # --- applying, signed out -------------------------------------------------
    check("anyone can apply to be a city ambassador on the site, signed out",
          f"SELECT {apply(org='Universität Hamburg', linkedin='https://de.linkedin.com/in/anita-a/')} ~ '^A-[0-9A-F]{{8}}$'",
          role="anon", expect="t")
    check("... kept with what they sent (the LinkedIn link in its standard form), new, linked to no account",
          "SELECT concat_ws('|', name, email, city, country, organisation, linkedin_url, hours_per_week, status, "
          "member_id IS NULL, decided_at IS NULL) FROM private.ambassador_applications WHERE email = 'anita.applicant@example.org'",
          expect="Anita Applicant|anita.applicant@example.org|Hamburg|Germany|Universität Hamburg|"
                 "https://www.linkedin.com/in/anita-a|1_2|new|t|t")
    check("... and every admin is told in the app, with a link to the application (the city and reference, "
          "not the applicant's name: the notice outlives the application)", f"""
          SELECT (count(DISTINCT n.user_id) = {admins})::text || '|' || bool_and(n.text LIKE 'New application to be the ambassador for Hamburg (A-%). %')
            || '|' || bool_and(n.text NOT LIKE '%Anita%' AND n.text NOT LIKE '%anita%')
          FROM notifications n JOIN private.ambassador_applications a ON a.id = n.reference_id
          WHERE n.type = 'alert' AND a.email = 'anita.applicant@example.org'""", expect="true|true|true")
    check("signed out, nobody can read the applications", "SELECT count(*) FROM private.ambassador_applications",
          role="anon", expect="error")
    check("... nor the counters behind the limits", "SELECT count(*) FROM private.ambassador_application_log",
          role="anon", expect="error")
    check("... nor the admin list", "SELECT public.admin_ambassador_applications()", role="anon", expect="error")
    check("... nor change one",
          "SELECT public.admin_update_ambassador_application(gen_random_uuid(), 'accepted')", role="anon", expect="error")
    check("the tables have row-level security on (and no policies: only the functions read and write them)",
          "SELECT bool_and(c.relrowsecurity) || '|' || (SELECT count(*) FROM pg_policies WHERE schemaname = 'private' "
          "AND tablename LIKE 'ambassador_application%') FROM pg_class c "
          "WHERE c.oid IN ('private.ambassador_applications'::regclass, 'private.ambassador_application_log'::regclass)",
          expect="true|0")
    check("anon and members may call the form, only members (admins) the admin functions",
          "SELECT concat_ws('|', has_function_privilege('anon', 'public.submit_ambassador_application(text,text,text,text,text,text,text,text)', 'EXECUTE'), "
          "has_function_privilege('anon', 'public.admin_ambassador_applications(text,integer,integer)', 'EXECUTE'), "
          "has_function_privilege('anon', 'public.admin_update_ambassador_application(uuid,text,text,text)', 'EXECUTE'), "
          "has_function_privilege('authenticated', 'public.admin_ambassador_applications(text,integer,integer)', 'EXECUTE'), "
          "has_function_privilege('anon', 'private.ambassador_application_json(private.ambassador_applications)', 'EXECUTE'))",
          expect="t|f|f|t|f")

    # --- what the form needs ----------------------------------------------------
    for name, kwargs, message in (
            ("a name", {"name": " \u200b "}, "Please give your name"),
            ("a real email address", {"email": "not-an-address"}, "Please check your email address"),
            ("... that can't carry mailto: fields of its own", {"email": "eve@example.org?cc=x%40example.net"},
             "Please check your email address"),
            ("a city name", {"city": "Berlin<script>"}, "Please give the name of your city"),
            ("... of at most 60 characters", {"city": "B" * 61}, "Please give the name of your city"),
            ("a country", {"country": ""}, "Please choose your country"),
            ("a university or employer of at most 200 characters", {"org": "U" * 201}, "Please keep your university"),
            ("a LinkedIn profile link, if any", {"linkedin": "https://example.com/me"}, "doesn't look like a LinkedIn profile link"),
            ("why, in 20 characters or more", {"why": "I like people."}, "at least 20 characters"),
            ("... and at most 1,000", {"why": "x" * 1001}, "Please keep it to 1,000 characters"),
            ("how much time they can give, from the form's choices", {"hours": "all day"}, "Please choose how much time")):
        check(f"an application needs {name}", f"SELECT {apply(**{'email': 'form.check@example.org', **kwargs})}",
              role="anon", error_has=message)
    check("... (none of those was kept)",
          "SELECT count(*) FROM private.ambassador_applications WHERE email LIKE 'form.check%' OR email LIKE 'eve@%'",
          expect="0")
    check("a name of 2 million characters is refused at once (it is cut before it is cleaned)",
          "SELECT public.submit_ambassador_application(repeat('x', 2000000), 'long.name@example.org', 'Berlin', "
          f"'Germany', '', '', {q(motivation)}, '1_2')", role="anon", error_has="Please give your name (up to 200 characters)")
    check("the country as the form's list names it, with a curly apostrophe (Côte d’Ivoire), is taken; "
          "a curly apostrophe in the city (as phones type it) counts as a straight one",
          f"SELECT {apply(email='kofi.k@example.org', city='Val-d’Or', country='Côte d’Ivoire')} LIKE 'A-%'; RESET ROLE; "
          "SELECT city || '|' || country FROM private.ambassador_applications WHERE email = 'kofi.k@example.org'",
          role="anon", expect="t\nVal-d'Or|Côte d’Ivoire")

    # --- one open application per email address and per member ----------------------
    check("one open application per email address: the same address in another form gets no reference "
          "(the form says it's already waiting) and nothing is saved",
          f"SELECT ({apply(email='Anita.Applicant+again@Example.org')}) IS NULL; RESET ROLE; "
          "SELECT count(*) FROM private.ambassador_applications WHERE email LIKE 'anita.applicant%'", role="anon",
          expect="t\n1")
    probe = "probe.target@example.org"
    check("a visitor applies (probe test)", f"SELECT {apply(email=probe)} LIKE 'A-%'", role="anon", expect="t")
    check("... that answer uses up one of the day's applications from the address, so it can't be used to test "
          "an address again and again: two more answers, then the limit",
          f"SELECT ({apply(email=probe)}) IS NULL; SELECT ({apply(email=probe.upper())}) IS NULL", role="anon",
          expect="t\nt")
    check("... (the 4th try from that address the same day)", f"SELECT {apply(email=probe)}", role="anon",
          error_has="You've sent several applications today.")
    check("... and from the internet address it came from", """
          DO $$BEGIN PERFORM set_config('request.headers', '{"cf-connecting-ip": "192.0.2.77"}', false); END$$;"""
          f"SELECT ({apply(email='Anita.Applicant@example.org')}) IS NULL; RESET ROLE; "
          "SELECT count(*) FROM private.ambassador_application_log WHERE key = private.limit_key('ambassador-ip', '192.0.2.77')",
          role="anon", expect="t\n1")
    check("... (still one application from each address)",
          "SELECT count(*) FROM private.ambassador_applications WHERE email IN ('probe.target@example.org', "
          "'anita.applicant@example.org') GROUP BY email ORDER BY email", expect="1\n1")
    check("asha applies signed in: her account's name and email address are used, and it is linked to her",
          f"SELECT {apply(name='Someone Else', email='someone.else@example.org', city='Berlin')} LIKE 'A-%'",
          as_user=asha, expect="t")
    check("... (as kept)", "SELECT concat_ws('|', name, email, city, member_id) FROM private.ambassador_applications "
          f"WHERE member_id = '{asha}'", expect=f"Asha A|asha@example.com|Berlin|{asha}")
    check("... a second one while the first is open is refused, with its reference",
          f"SELECT {apply(email='asha.other@example.org', city='Potsdam')}", as_user=asha,
          error_has="You've already applied (reference A-")
    check("... so is one signed out with her account's address (no reference)",
          f"SELECT ({apply(email='asha@example.com')}) IS NULL", role="anon", expect="t")
    check("a member waiting for review can apply too (linked)", f"SELECT {apply(city='Munich')} LIKE 'A-%'",
          as_user=bina, expect="t")
    check("chet applies for Frankfurt am Main", f"SELECT {apply(city='Frankfurt am Main', hours='3_5')} LIKE 'A-%'",
          as_user=chet, expect="t")
    check("eli applies too", f"SELECT {apply(city='Cologne', hours='under_1')} LIKE 'A-%'", as_user=eli, expect="t")
    check("dev is blocked", block(dev), as_user=ADMIN, expect="blocked")
    check("... and can't apply", f"SELECT {apply(city='Berlin')}", as_user=dev, error_has="Your account is blocked")

    # --- members can't read applications ------------------------------------------
    check("members can't read applications (not even their own) from the table",
          "SELECT count(*) FROM private.ambassador_applications", as_user=asha, expect="error")
    check("... nor list them", "SELECT public.admin_ambassador_applications()", as_user=asha, error_has="Admins only")
    check("... nor change one", f"SELECT public.admin_update_ambassador_application(gen_random_uuid(), 'accepted')",
          as_user=chet, error_has="Admins only")
    mfa_on = ("BEGIN; UPDATE private.app_settings SET value = 'true' WHERE key = 'admin_mfa_required'; SET ROLE authenticated; "
              "SELECT set_config('request.jwt.claims', '{\"sub\": \"" + ADMIN + "\", \"role\": \"authenticated\", \"aal\": \"%s\"}', false) IS NULL; ")
    check("with two-step login required, an admin signed in with the password only can't list applications",
          (mfa_on % "aal1") + "SELECT public.admin_ambassador_applications()", error_has="Admins only")
    check("... nor change one",
          "SELECT set_config('amb.id', (SELECT id::text FROM private.ambassador_applications "
          "WHERE email = 'anita.applicant@example.org'), false) IS NULL; " + (mfa_on % "aal1")
          + "SELECT public.admin_update_ambassador_application(current_setting('amb.id')::uuid, 'declined')",
          error_has="Admins only")
    check("... signed in with the code, they can",
          (mfa_on % "aal2") + "SELECT (public.admin_ambassador_applications()->>'total')::int > 0", expect="f\nt")
    check("\"Download my data\" has the member's own applications, without our team's note",
          "SELECT jsonb_array_length(d->'ambassador_applications') || '|' || (SELECT string_agg(k, ',' ORDER BY k) "
          "FROM jsonb_object_keys(d->'ambassador_applications'->0) k) || '|' || (d->'ambassador_applications'->0->>'city') "
          "FROM (SELECT public.export_my_data() d) x", as_user=asha,
          expect="1|city,country,created_at,decided_at,email,hours_per_week,linkedin_url,motivation,name,organisation,"
                 "reference,status|Berlin")
    check("... and nobody else's", "SELECT jsonb_array_length(public.export_my_data()->'ambassador_applications')",
          as_user=fay, expect="0")

    # --- the limits ---------------------------------------------------------------------
    cap = "cap.tester@example.org"
    for n in (1, 2, 3):
        check(f"application {n} of the day from one email address", f"SELECT {apply(email=cap)} LIKE 'A-%'",
              role="anon", expect="t")
        check(f"... our team declines it", f"SELECT {decide(cap, 'declined')} ->> 'status'", as_user=ADMIN,
              expect="declined")
    check("... the 4th from that address on the same day isn't taken (3 a day)", f"SELECT {apply(email=cap)}",
          role="anon", error_has="You've sent several applications today.")
    from_ip = """DO $$BEGIN PERFORM set_config('request.headers', '{"x-forwarded-for": "198.51.100.23, 10.0.0.1"}', false); END$$; """
    check("10 a day from one internet address (the first in X-Forwarded-For)",
          from_ip + f"SELECT count({apply(email_sql=chr(39) + 'ip' + chr(39) + ' || g || ' + chr(39) + '@example.org' + chr(39))}) "
          "FROM generate_series(1, 10) g", role="anon", expect="10")
    check("... the 11th isn't", from_ip + f"SELECT {apply(email='ip.eleven@example.org')}", role="anon",
          error_has="You've sent several applications today.")
    check("an IPv6 address counts by its /64",
          "DO $$BEGIN FOR g IN 1..10 LOOP PERFORM set_config('request.headers', json_build_object('x-forwarded-for', "
          f"'2001:db8:42:7::' || to_hex(g))::text, false); PERFORM "
          f"{apply(email_sql=chr(39) + 'v6-' + chr(39) + ' || g || ' + chr(39) + '@example.org' + chr(39))}; "
          "END LOOP; END$$; "
          """DO $$BEGIN PERFORM set_config('request.headers', '{"x-forwarded-for": "2001:db8:42:7:ffff::9"}', false); END$$; """
          f"SELECT {apply(email='v6-last@example.org')}", role="anon", error_has="You've sent several applications today.")
    check("the limits keep only a keyed hash, never the address",
          "SELECT count(*) > 0 AND bool_and(key !~ '198\\.51|2001:db8|example\\.org') FROM private.ambassador_application_log",
          expect="t")
    check("at most 50 applications a day in all; then the form points to email", f"""
          BEGIN;
          INSERT INTO private.ambassador_applications (reference, name, email, city, country, motivation, hours_per_week, status, decided_at)
          SELECT 'A-F' || lpad(g::text, 7, '0'), 'Filler', 'filler' || g || '@example.org', 'Berlin', 'Germany',
            repeat('x', 20), '1_2', 'declined', now() FROM generate_series(1, 50) g;
          SET ROLE anon; SELECT {apply(email='late.applicant@example.org')}""",
          error_has="We've received a lot of applications today. Please write to hello@nriclub.app instead")

    # --- the admin list -------------------------------------------------------------------
    check("admins list the applications newest first, a page at a time, with the total and the counts", """
          SELECT ((a->>'total')::int = (SELECT sum(v::int) FROM jsonb_each_text(a->'counts') x(k, v))
            AND (a->>'total') = (b->>'total')
            AND jsonb_array_length(a->'applications') = 2 AND jsonb_array_length(b->'applications') = 2
            AND (a->'applications'->0->>'id') NOT IN (b->'applications'->0->>'id', b->'applications'->1->>'id')
            AND (a->'applications'->0->>'created_at')::timestamptz >= (a->'applications'->1->>'created_at')::timestamptz
            AND (a->'applications'->1->>'created_at')::timestamptz >= (b->'applications'->0->>'created_at')::timestamptz)::text
          FROM public.admin_ambassador_applications(NULL, 2, 0) a, public.admin_ambassador_applications(NULL, 2, 2) b""",
          as_user=ADMIN, expect="true")
    check("... by status: new, declined, open (new and contacted)", """
          SELECT concat_ws('|', (n->>'total') = (n->'counts'->>'new'),
            (SELECT bool_and(e->>'status' = 'new') FROM jsonb_array_elements(n->'applications') e),
            d->>'total', (o->>'total')::int = (o->'counts'->>'new')::int + (o->'counts'->>'contacted')::int)
          FROM public.admin_ambassador_applications('new', 200) n, public.admin_ambassador_applications('declined') d,
            public.admin_ambassador_applications('open') o""", as_user=ADMIN, expect="t|t|3|t")
    check("... at most 200 at a time, at least 1",
          "SELECT jsonb_array_length(public.admin_ambassador_applications(NULL, 100000)->'applications') <= 200, "
          "jsonb_array_length(public.admin_ambassador_applications(NULL, 0)->'applications')", as_user=ADMIN, expect="t|1")
    check("... an unknown status is refused", "SELECT public.admin_ambassador_applications('maybe')", as_user=ADMIN,
          error_has="Unknown status")
    check("... with the account it came from (its status now)",
          f"SELECT e->'member'->>'name' || '|' || (e->'member'->>'verification_status') FROM jsonb_array_elements("
          f"public.admin_ambassador_applications('new', 200)->'applications') e WHERE e->>'email' = 'bina@example.com'",
          as_user=ADMIN, expect="Bina B|pending")
    check("fay (a member) applies signed out with her account's address", f"SELECT {apply(email='fay@example.com')} LIKE 'A-%'",
          role="anon", expect="t")
    check("... signed in, she is told her address has already applied (it's her own)",
          f"SELECT {apply(city='Bonn')}", as_user=fay, error_has="An application from this email address is already waiting")
    check("... the list says an account uses that address, without linking it",
          "SELECT (e->'member' = 'null'::jsonb)::text || '|' || (e->'email_member'->>'name') FROM jsonb_array_elements("
          "public.admin_ambassador_applications('new', 200)->'applications') e WHERE e->>'email' = 'fay@example.com'",
          as_user=ADMIN, expect="true|Fay F")

    # --- our team's steps ------------------------------------------------------------------
    check("our team marks one contacted, with a note", f"""
          SELECT concat_ws('|', r->>'status', r->>'admin_note', COALESCE(r->>'outcome', '-'), COALESCE(r->>'decided_at', '-'))
          FROM {decide('anita.applicant@example.org', 'contacted', ' Called her on 18 Oct ')} r""", as_user=ADMIN,
          expect="contacted|Called her on 18 Oct|-|-")
    check("... a note of more than 2,000 characters is refused",
          f"SELECT {decide('anita.applicant@example.org', 'contacted', 'x' * 2001, current='contacted')}", as_user=ADMIN,
          error_has="Please keep the note to 2,000 characters.")
    check("... and an unknown status",
          f"SELECT {decide('anita.applicant@example.org', 'maybe', current='contacted')}", as_user=ADMIN,
          error_has="Unknown status")
    check("accepting asha (an active, approved member) makes her Berlin's ambassador", f"""
          SELECT concat_ws('|', r->>'status', r->>'outcome', r->>'decided_by_name', r->'member'->>'ambassador_city')
          FROM {decide('asha@example.com', 'accepted')} r""", as_user=ADMIN,
          expect="accepted|ambassador_set|NRIClub Team|Berlin")
    check("... recorded as any change of ambassador (admin_set_ambassador)",
          "SELECT count(*) || '|' || max(explanation) || '|' || bool_and(actor_id = '" + ADMIN + "') "
          f"FROM private.moderation_action WHERE action = 'ambassador' AND target_user = '{asha}'",
          expect="1|Ambassador for Berlin|true")
    check("... and members see her as Berlin's ambassador",
          "SELECT bool_or(name = 'Asha A') FROM public.city_ambassadors('Berlin')", as_user=fay, expect="t")
    check("... accepting again changes nothing", f"""
          SELECT r->>'outcome' FROM {decide('asha@example.com', 'accepted', current='accepted')} r""",
          as_user=ADMIN, expect="already_ambassador")
    check("... (still one record)", "SELECT count(*) FROM private.moderation_action "
          f"WHERE action = 'ambassador' AND target_user = '{asha}'", expect="1")
    check("accepting bina (waiting for review) marks it accepted, but doesn't make her ambassador", f"""
          SELECT concat_ws('|', r->>'status', r->>'outcome', r->'member'->>'ambassador_city')
          FROM {decide('bina@example.com', 'accepted')} r""", as_user=ADMIN, expect="accepted|not_approved|")
    check("... once she's approved, accepting again makes her the ambassador", f"""
          UPDATE profile_private SET verification_status = 'approved' WHERE id = '{bina}';
          SET ROLE authenticated; SELECT set_config('request.jwt.claims', '{{"sub": "{ADMIN}", "role": "authenticated"}}', false) IS NULL;
          SELECT r->>'outcome' || '|' || (r->'member'->>'ambassador_city')
          FROM {decide('bina@example.com', 'accepted', current='accepted')} r""", expect="f\nambassador_set|Munich")
    check("accepting chet with the city group's name instead of the one he wrote", f"""
          SELECT concat_ws('|', r->>'city', r->>'outcome', r->'member'->>'ambassador_city')
          FROM {decide('chet@example.com', 'accepted', city='Frankfurt')} r""", as_user=ADMIN,
          expect="Frankfurt am Main|ambassador_set|Frankfurt")
    check("accepting an application without an account only marks it accepted (our team asks them to join)", f"""
          SELECT concat_ws('|', r->>'status', r->>'outcome') FROM {decide('anita.applicant@example.org', 'accepted', current='contacted')} r""",
          as_user=ADMIN, expect="accepted|no_account")
    check("eli's account is blocked after he applied",
          f"UPDATE profile_private SET status = 'blocked' WHERE id = '{eli}'")
    check("... accepting him doesn't make him ambassador", f"""
          SELECT concat_ws('|', r->>'outcome', r->'member'->>'ambassador_city')
          FROM {decide('eli@example.com', 'accepted')} r""", as_user=ADMIN, expect="not_approved|")
    check("a decided application can be reopened (the cap tester's first)",
          f"SELECT concat_ws('|', r->>'status', COALESCE(r->>'decided_at', '-')) FROM {decide(cap, 'contacted', current='declined')} r",
          as_user=ADMIN, expect="contacted|-")
    check("... a second one from the same person can't, while the first is open",
          f"SELECT {decide(cap, 'new', current='declined')}", as_user=ADMIN,
          error_has="This person has another open application.")
    check("... unknown applications are refused",
          "SELECT public.admin_update_ambassador_application(gen_random_uuid(), 'accepted')", as_user=ADMIN,
          error_has="Application not found.")

    # --- deleted accounts -------------------------------------------------------------------
    check("fay applies signed in after her signed-out one was declined",
          f"SELECT {decide('fay@example.com', 'declined')} ->> 'status'; SET ROLE authenticated; "
          f"SELECT set_config('request.jwt.claims', '{{\"sub\": \"{fay}\", \"role\": \"authenticated\"}}', false) IS NULL; "
          f"SELECT {apply(city='Bonn')} LIKE 'A-%'", as_user=ADMIN, expect="declined\nf\nt")
    check("... then deletes her account: her applications stay, no longer linked to it", f"""
          SELECT public.delete_my_account()""", as_user=fay)
    check("... (as kept)", "SELECT string_agg(city || ':' || (member_id IS NULL)::text, ',' ORDER BY city) "
          "FROM private.ambassador_applications WHERE email = 'fay@example.com'", expect="Bonn:true,Hamburg:true")

    # --- clean-up (C20) ------------------------------------------------------------------------
    check("the clean-up deletes applications 6 months after our decision, undecided ones after 12 months, "
          "and the limit counters after a day", """
          BEGIN;
          INSERT INTO private.ambassador_applications (reference, name, email, city, country, motivation, hours_per_week,
            status, created_at, decided_at) VALUES
            ('A-C0000001', 'Old decision', 'c1@example.org', 'Berlin', 'Germany', repeat('x', 20), '1_2', 'accepted', now() - interval '8 months', now() - interval '7 months'),
            ('A-C0000002', 'Recent decision', 'c2@example.org', 'Berlin', 'Germany', repeat('x', 20), '1_2', 'declined', now() - interval '13 months', now() - interval '5 months'),
            ('A-C0000003', 'Old, new', 'c3@example.org', 'Berlin', 'Germany', repeat('x', 20), '1_2', 'new', now() - interval '13 months', NULL),
            ('A-C0000004', 'Old, contacted', 'c4@example.org', 'Berlin', 'Germany', repeat('x', 20), '1_2', 'contacted', now() - interval '12 months 1 day', NULL),
            ('A-C0000005', 'Recent, new', 'c5@example.org', 'Berlin', 'Germany', repeat('x', 20), '1_2', 'new', now() - interval '11 months', NULL);
          INSERT INTO private.ambassador_application_log (key, at) VALUES ('amb-old', now() - interval '25 hours'), ('amb-new', now() - interval '1 hour');
          SELECT concat_ws(',', c ->> 'decided_ambassador_applications', c ->> 'undecided_ambassador_applications')
            FROM (SELECT private.daily_cleanup() AS c) x;
          SELECT string_agg(reference, ',' ORDER BY reference) FROM private.ambassador_applications WHERE reference LIKE 'A-C000000_';
          SELECT string_agg(key, ',') FROM private.ambassador_application_log WHERE key LIKE 'amb-%';
          ROLLBACK;""", expect="1,2\nA-C0000002,A-C0000005\namb-new")
    check("... and still says what it deleted of everything else (the 2026-10-21 keys, plus the two new ones, "
          "since 2026-10-25 the Inbox, since 2026-10-26 the travel board and since 2026-10-27 the ambassadors' log "
          "and welcomes)", """
          BEGIN;
          SELECT string_agg(k, ',' ORDER BY k) FROM jsonb_object_keys(private.daily_cleanup()) k;
          ROLLBACK;""",
          expect="ambassador_log,ambassador_welcomes,closed_notices,closed_reports,decided_ambassador_applications,declined_accounts,inbox_messages,moderation_actions,"
                 "moderation_copies_cleared,moderation_notes_cleared,moderation_records,read_notifications,"
                 "travel_posts,unconfirmed_signups,undecided_ambassador_applications,unfinished_accounts")
    check("members can't run the clean-up", "SELECT private.daily_cleanup()", as_user=asha, expect="error")

    # --- nothing else in the clean-up and "Download my data" changed ----------------------------
    for header, allowed in (
            ("CREATE OR REPLACE FUNCTION private.daily_cleanup()",
             ["    'moderation_copies_cleared', copies, 'moderation_actions', actions);"]),
            ("CREATE OR REPLACE FUNCTION public.export_my_data()", [])):
        old = function_source(MODERATION, header).splitlines()
        new = function_source(AMBASSADORS, header).splitlines()
        diff = [l for l in difflib.ndiff(old, new) if l[:2] in ("- ", "+ ")]
        removed = [l[2:] for l in diff if l.startswith("- ")]
        added = [l[2:] for l in diff if l.startswith("+ ")]
        verdict(f"{header.split()[-1]} is its 2026-10-21 version with lines added only "
                f"({len(added)} added, {len(removed)} changed)", removed == allowed and added,
                f"removed: {removed}")
    check("... and the database runs the migration's versions (the same keys in \"Download my data\" as before, plus one, "
          "since 2026-10-26 the travel board's two and since 2026-10-27 the ambassador panel's four)",
          "SELECT string_agg(k, ',' ORDER BY k) FROM jsonb_object_keys(public.export_my_data()) k", as_user=asha,
          expect="account,ambassador_agreement,ambassador_applications,ambassador_log,ambassador_welcomes_given,answer_thanks,blocks,comments,connections,conversations,"
                 "conversations_hidden,doc_comments,docs,event_rsvps,events_organised,exported_at,files,"
                 "group_memberships,groups_requested,help_requests,help_responses,invite_code,likes,"
                 "marketplace_listings,mentor_reviews_received,mentor_reviews_written,mentor_times,"
                 "mentoring_sessions,messages,moderation_actions_about_me,name_changes,notifications,"
                 "place_recommendations,places_added,posts,profile,profile_private,rate_limit_log,readme,"
                 "reports_about_me,reports_filed,sessions,terms_acceptances,travel_posts,travel_rules_accepted,"
                 "urgent_questions_sent,user_settings,"
                 "verification_log,welcomed_by_your_city_ambassador")


def member_fixes():
    """Posts only in groups the author has joined (C12), the member's city
    (update_my_city) and blocking (block_member) (C29), editing events, and
    who sees a member's LinkedIn link: migration 20261025000000_member_fixes."""
    kavi, leela, mohan, nora, ojas = (f"00000000-0000-0000-0000-000000000e{n}" for n in ("01", "02", "03", "04", "05"))
    approved_member(kavi, "kavi@example.com", "Kavi K")
    approved_member(leela, "leela@example.com", "Leela L")
    approved_member(mohan, "mohan@example.com", "Mohan M")
    joined, other = "70000000-0000-0000-0000-000000000e01", "70000000-0000-0000-0000-000000000e02"
    psql(f"INSERT INTO groups (id, name, category, is_approved, created_by) VALUES "
         f"('{joined}', 'Indians in Kavitown', 'City', true, '{kavi}'), "
         f"('{other}', 'Indians in Otherton', 'City', true, '{leela}'); "
         f"INSERT INTO group_members (group_id, user_id) VALUES ('{joined}', '{kavi}'), ('{other}', '{leela}')")

    # --- posts go only into groups the author is in (C12) -----------------------------
    check("kavi posts in a group he's in", f"INSERT INTO posts (user_id, content, group_id) VALUES "
          f"(auth.uid(), 'Hello Kavitown', '{joined}') RETURNING group_id::text", as_user=kavi, expect=joined)
    check("... and on the Home feed", "INSERT INTO posts (user_id, content) VALUES (auth.uid(), 'Hello all') "
          "RETURNING group_id IS NULL", as_user=kavi, expect="t")
    check("... but not in a group he never joined",
          f"INSERT INTO posts (user_id, content, group_id) VALUES (auth.uid(), 'Wrong group', '{other}')",
          as_user=kavi, error_has="row-level security")
    check("... nor by moving a post there",
          f"UPDATE posts SET group_id = '{other}' WHERE user_id = auth.uid() AND content = 'Hello all'",
          as_user=kavi, error_has="You can only post in groups you've joined.")
    check("... and nothing was posted there",
          f"SELECT count(*) FROM posts WHERE group_id = '{other}' AND user_id = '{kavi}'", expect="0")
    check("moving a post into a group he's in is fine",
          f"UPDATE posts SET group_id = '{joined}' WHERE user_id = auth.uid() AND content = 'Hello all' RETURNING 1",
          as_user=kavi, expect="1")
    check("after leaving the group, his posts there stay and he can still edit them", f"""
          DELETE FROM group_members WHERE group_id = '{joined}' AND user_id = auth.uid();
          UPDATE posts SET content = 'Hello Kavitown!' WHERE user_id = auth.uid() AND content = 'Hello Kavitown'
            RETURNING group_id::text""", as_user=kavi, expect=joined)
    check("... but he can't post there any more",
          f"INSERT INTO posts (user_id, content, group_id) VALUES (auth.uid(), 'Again', '{joined}')",
          as_user=kavi, error_has="row-level security")
    psql(f"INSERT INTO group_members (group_id, user_id) VALUES ('{joined}', '{kavi}')")

    # --- likes as the site sends them since 2026-10-25 (C11): "like" twice keeps one -----
    like = (f"INSERT INTO likes (post_id, user_id) SELECT id, auth.uid() FROM posts WHERE content = 'Hello Kavitown!' "
            "ON CONFLICT (post_id, user_id) DO NOTHING")
    check("leela likes kavi's post, twice (the heart showed it wrongly)",
          f"{like}; {like}; SELECT likes_count FROM posts WHERE content = 'Hello Kavitown!'", as_user=leela, expect="1")
    check("... and kavi heard about it once", f"SELECT count(*) FROM notifications WHERE user_id = '{kavi}' AND type = 'like'",
          expect="1")

    # --- the member's city (C29) ------------------------------------------------------
    check("kavi moves to Munich: city, country and the place shown change together",
          "SELECT public.update_my_city('  Munich ', 'de', 'Munich, Germany')::text", as_user=kavi,
          expect='{"city": "Munich", "location": "Munich, Germany", "country_code": "DE"}')
    check("... (saved)", f"SELECT concat_ws('|', city, country_code, location) FROM profiles WHERE id = '{kavi}'",
          expect="Munich|DE|Munich, Germany")
    check("a place that isn't the city's becomes the city",
          "SELECT public.update_my_city('Pune', 'IN', 'Somewhere else, India') ->> 'location'", as_user=kavi, expect="Pune")
    check("... also one that only looks like it (no patterns)",
          "SELECT public.update_my_city('P_ne', 'IN', 'Pune, India') ->> 'location'", as_user=kavi, expect="P_ne")
    check("a city is needed", "SELECT public.update_my_city('  ', 'DE')", as_user=kavi,
          error_has="Please enter the city you live in.")
    check("... and a country code", "SELECT public.update_my_city('Berlin', 'Germany')", as_user=kavi,
          error_has="Please choose your country.")
    check("... of two letters", "SELECT public.update_my_city('Berlin', '')", as_user=kavi,
          error_has="Please choose your country.")
    check("it changes only the member's own profile",
          f"SELECT public.update_my_city('Berlin', 'DE', 'Berlin, Germany')::text IS NOT NULL; "
          f"SELECT concat_ws('|', city, country_code) FROM profiles WHERE id IN ('{kavi}', '{leela}') ORDER BY name",
          as_user=kavi, expect="t\nBerlin|DE\nBerlin|")
    check("signed-out visitors can't call it", "SELECT public.update_my_city('Berlin', 'DE')", role="anon",
          error_has="permission denied")
    sign_up(nora, "nora@example.com", {"full_name": "Nora N"}, accept_terms=True)
    psql(f"UPDATE profile_private SET status = 'blocked' WHERE id = '{nora}'")
    check("a blocked member can't change it", "SELECT public.update_my_city('Berlin', 'DE')", as_user=nora,
          error_has="Your profile has been blocked")

    # --- blocking (C29) -----------------------------------------------------------------
    psql(f"INSERT INTO connections (requester_id, recipient_id, status) VALUES "
         f"('{kavi}', '{mohan}', 'accepted'), ('{mohan}', '{kavi}', 'pending'), ('{kavi}', '{leela}', 'accepted')")
    check("kavi blocks mohan: the block, and the connections between them go, in one step",
          f"SELECT public.block_member('{mohan}'); "
          f"SELECT (SELECT count(*) FROM blocks WHERE blocker_id = auth.uid() AND blocked_id = '{mohan}') || '|' || "
          f"(SELECT count(*) FROM connections WHERE '{mohan}' IN (requester_id, recipient_id) AND auth.uid() IN (requester_id, recipient_id))",
          as_user=kavi, expect="t\n1|0")
    check("... his other connections stay",
          f"SELECT count(*) FROM connections WHERE requester_id = '{kavi}' AND recipient_id = '{leela}'", expect="1")
    check("blocking again is fine", f"SELECT public.block_member('{mohan}')", as_user=kavi, expect="t")
    check("... and blocks once", f"SELECT count(*) FROM blocks WHERE blocker_id = '{kavi}' AND blocked_id = '{mohan}'",
          expect="1")
    check("nobody can block themselves", "SELECT public.block_member(auth.uid())", as_user=kavi,
          error_has="You can't block yourself.")
    check("... nor an account that doesn't exist", "SELECT public.block_member(gen_random_uuid())", as_user=kavi,
          error_has="This member can't be blocked.")
    check("signed-out visitors can't block", f"SELECT public.block_member('{mohan}')", role="anon",
          error_has="permission denied")
    check("leela blocks kavi", f"SELECT public.block_member('{kavi}')", as_user=leela, expect="t")
    check("... kavi's own block stays", "SELECT string_agg(blocker_id || '>' || blocked_id, ',' ORDER BY blocker_id) "
          f"FROM blocks WHERE blocked_id IN ('{kavi}', '{mohan}')", expect=f"{kavi}>{mohan},{leela}>{kavi}")

    # --- editing events -------------------------------------------------------------------
    today = "to_char(CURRENT_DATE, 'YYYY-MM-DD')"
    ev = "20000000-0000-0000-0000-000000000e01"
    check("a new event can be today", f"INSERT INTO events (id, title, date, organizer_id) "
          f"VALUES ('{ev}', 'Chai meetup', {today}, auth.uid()) RETURNING 1", as_user=kavi, expect="1")
    check("... not on a date that has passed",
          "INSERT INTO events (title, date, organizer_id) VALUES ('Too late', to_char(CURRENT_DATE - 2, 'YYYY-MM-DD'), auth.uid())",
          as_user=kavi, error_has="That date has passed.")
    check("... and the date is one from the date picker",
          "INSERT INTO events (title, date, organizer_id) VALUES ('When?', 'next Sunday', auth.uid())",
          as_user=kavi, error_has="Please choose the date of the event.")
    check("... a real one", "INSERT INTO events (title, date, organizer_id) VALUES ('When?', '2030-02-30', auth.uid())",
          as_user=kavi, error_has="Please choose the date of the event.")
    check("the author edits the event: title, description, time, place, city, link",
          f"UPDATE events SET title = 'Chai and samosa', description = 'Bring a friend', time = '18:30', "
          f"location = 'Café Kranz', city = 'Berlin', link = 'https://example.org/chai', date = '2030-05-01' "
          f"WHERE id = '{ev}' RETURNING concat_ws('|', title, date, time, location, city)",
          as_user=kavi, expect="Chai and samosa|2030-05-01|18:30|Café Kranz|Berlin")
    check("... not to a date that has passed",
          f"UPDATE events SET date = to_char(CURRENT_DATE - 2, 'YYYY-MM-DD') WHERE id = '{ev}'",
          as_user=kavi, error_has="That date has passed.")
    check("... and not its id, author, 'going' count or creation time", f"""
          UPDATE events SET id = gen_random_uuid(), organizer_id = '{leela}', attendees_count = 99,
            created_at = '2001-01-01', title = 'Chai!' WHERE id = '{ev}'
          RETURNING concat_ws('|', id, organizer_id, attendees_count, created_at > '2020-01-01', title)""",
          as_user=kavi, expect=f"{ev}|{kavi}|0|t|Chai!")
    check("another member can't edit it",
          f"UPDATE events SET title = 'Hijacked' WHERE id = '{ev}' RETURNING 1", as_user=leela, expect="")
    check("... nor can an admin, through the API",
          f"UPDATE events SET title = 'Hijacked' WHERE id = '{ev}' RETURNING 1", as_user=ADMIN, expect="")
    check("an event that has happened can still be edited if its date stays", f"""
          UPDATE events SET date = 'Mar 25, 2020 • 10:00 AM' WHERE id = '{ev}';
          SET ROLE authenticated;
          SELECT set_config('request.jwt.claims', '{{"sub": "{kavi}", "role": "authenticated"}}', false) IS NOT NULL;
          UPDATE events SET description = 'Thanks for coming!' WHERE id = '{ev}' RETURNING date""",
          expect="t\nMar 25, 2020 • 10:00 AM")
    check("a blocked member can't edit their event",
          f"UPDATE profile_private SET status = 'blocked' WHERE id = '{kavi}'; SET ROLE authenticated; "
          f"SELECT set_config('request.jwt.claims', '{{\"sub\": \"{kavi}\", \"role\": \"authenticated\"}}', false) IS NOT NULL; "
          f"UPDATE events SET title = 'Blocked' WHERE id = '{ev}' RETURNING 1; RESET ROLE; "
          f"UPDATE profile_private SET status = 'active' WHERE id = '{kavi}'", expect="t")

    # --- who sees a member's LinkedIn link ---------------------------------------------------
    sign_up(ojas, "ojas@example.com", {"full_name": "Ojas O"})
    check("a new member's LinkedIn link is for the NRIClub team only until they choose otherwise",
          f"SELECT linkedin_public FROM profiles WHERE id = '{ojas}'", expect="f")
    psql(f"UPDATE profiles SET linkedin_url = 'https://www.linkedin.com/in/leela-l' WHERE id = '{leela}'")
    check("leela chooses 'All members'",
          "UPDATE profiles SET linkedin_public = true WHERE id = auth.uid() RETURNING linkedin_public", as_user=leela, expect="t")
    check("leela's link: members see it", f"SELECT linkedin_url FROM public.profile_links(ARRAY['{leela}'::uuid])",
          as_user=mohan, expect="https://www.linkedin.com/in/leela-l")
    check("she chooses 'Only the NRIClub team'",
          "UPDATE profiles SET linkedin_public = false WHERE id = auth.uid() RETURNING linkedin_public", as_user=leela, expect="f")
    check("... members don't see it any more", f"SELECT count(*) FROM public.profile_links(ARRAY['{leela}'::uuid])",
          as_user=mohan, expect="0")
    check("... nor from profiles", f"SELECT linkedin_url FROM profiles WHERE id = '{leela}'", as_user=mohan,
          error_has="permission denied")
    check("... she does", "SELECT linkedin_url FROM public.profile_links(ARRAY[auth.uid()])", as_user=leela,
          expect="https://www.linkedin.com/in/leela-l")
    check("... and admins do", f"SELECT linkedin_url FROM public.profile_links(ARRAY['{leela}'::uuid])", as_user=ADMIN,
          expect="https://www.linkedin.com/in/leela-l")
    check("... nobody can choose for another member",
          f"UPDATE profiles SET linkedin_public = true WHERE id = '{leela}' RETURNING 1", as_user=mohan, expect="")

    # --- run twice ------------------------------------------------------------------------------
    ok, _, err = psql(open(MEMBER_FIXES, encoding="utf-8").read())
    verdict("the migration can be run again", ok, err[:300])
    check("... and still refuses posts in groups the author isn't in",
          f"INSERT INTO posts (user_id, content, group_id) VALUES (auth.uid(), 'Wrong group', '{other}')",
          as_user=kavi, error_has="row-level security")


def as_admin(sql):
    """sql run as the admin, after setup run as the table owner."""
    claims = json.dumps({"sub": ADMIN, "role": "authenticated"})
    return f"SET ROLE authenticated; SELECT set_config('request.jwt.claims', '{claims}', false) IS NULL; {sql}"


def admin_tools():
    """Decision emails, deleting unfinished sign-ups and What's on from the
    admin panel: migration 20261025100000_admin_tools."""
    from datetime import datetime, timedelta
    from zoneinfo import ZoneInfo
    kiran, lata, mohan, nina, omar, pia, ravi, sita, tara = (f"00000000-0000-0000-0000-000000000a{n}"
                                                            for n in ("01", "02", "03", "04", "05", "06", "07", "08", "09"))
    for uid, mail, name in ((kiran, "kiran@example.com", "Kiran Kumar"), (lata, "lata@example.com", "Lata L"),
                            (mohan, "mohan@example.com", "Mohan M"), (sita, "sita@example.com", "Sita S"),
                            (tara, "tara.t@example.com", "Tara T")):
        sign_up(uid, mail, {"full_name": name}, accept_terms=True)
        psql(f"UPDATE profile_private SET verification_status = 'pending', submitted_at = now() WHERE id = '{uid}'")
    approved_member(nina, "nina@example.com", "Nina N")
    # omar never confirmed his address; pia confirmed it but never sent her
    # details; ravi was declined before he sent any.
    sign_up(omar, "omar@example.com", {"full_name": "Omar O"}, confirmed=False)
    sign_up(pia, "pia@example.com", {"full_name": "Pia P"}, accept_terms=True)
    sign_up(ravi, "ravi@example.com", {"full_name": "Ravi R"}, accept_terms=True)
    psql(as_admin(f"SELECT public.review_member('{ravi}', 'rejected', 'We could not confirm you live abroad.', '')"))
    email = lambda uid, kind: f"SELECT public.admin_member_email('{uid}', '{kind}')"
    field = lambda uid, kind, key: f"SELECT r->>'{key}' FROM (SELECT public.admin_member_email('{uid}', '{kind}')) x(r)"
    review = lambda uid, decision, message="": f"SELECT public.review_member('{uid}', '{decision}', '{message}', '')"

    # --- decision emails --------------------------------------------------------
    check("anon can't ask for a decision email", email(kiran, "approved"), role="anon", expect="error")
    check("our team approves kiran, asks lata for more and declines mohan",
          f"{review(kiran, 'approved')}; {review(lata, 'needs_info', 'Please add your LinkedIn link.')}; "
          f"{review(mohan, 'rejected', 'We could not confirm you live abroad.')}", as_user=ADMIN,
          expect="approved\nneeds_info\nrejected")
    check("a member can't have a decision email sent", email(kiran, "approved"), as_user=nina, error_has="Admins only")
    check("the email about kiran's approval: his first name, no message",
          "SELECT concat_ws('|', r->>'kind', r->>'first_name', r->>'message', r->>'rule', r->>'decided_at' IS NOT NULL) "
          f"FROM (SELECT public.admin_member_email('{kiran}', 'approved')) x(r)", as_user=ADMIN,
          expect="approved|Kiran|||t")
    check("... only once", email(kiran, "approved"), as_user=ADMIN, error_has="already gone out")
    check("... and not about a decision that isn't his", email(kiran, "rejected"), as_user=ADMIN,
          error_has="has changed since")
    check("lata's email has the message she sees in the app", field(lata, "needs_info", "message"), as_user=ADMIN,
          expect="Please add your LinkedIn link.")
    check("mohan's too", field(mohan, "rejected", "message"), as_user=ADMIN, expect="We could not confirm you live abroad.")
    check("lata back in review: no email about the earlier request",
          f"{review(lata, 'pending')}; {email(lata, 'needs_info')}", as_user=ADMIN, error_has="has changed since")
    check("... approved now: a new decision, a new email",
          f"{review(lata, 'approved')}; {field(lata, 'approved', 'kind')}", as_user=ADMIN, expect="approved\napproved")
    check("an undone decision isn't emailed (sita approved, then back to pending)",
          f"{review(sita, 'approved')}; SELECT public.review_member('{sita}', 'pending', '', 'Undo', NULL, NULL, 'approved'); "
          f"{email(sita, 'approved')}", as_user=ADMIN, error_has="has changed since")
    check("a decision more than an hour old isn't emailed",
          f"UPDATE profile_private SET verification_status = 'approved', reviewed_at = now() - interval '61 minutes' "
          f"WHERE id = '{sita}'; " + as_admin(email(sita, "approved")), error_has="too old to email")
    check("nina is blocked; her email has the reason she sees on the block screen",
          f"{block(nina)}; SELECT concat_ws('|', r->>'kind', r->>'first_name', r->>'rule', r->>'reason', r->>'message') "
          f"FROM (SELECT public.admin_member_email('{nina}', 'blocked')) x(r)", as_user=ADMIN,
          expect="blocked\nblocked|Nina|Terms of Use: Spam, scams or advertising (§ 6)|it sent the same advert to many members|")
    check("... unblocked: no block email any more", f"{unblock(nina)}; {email(nina, 'blocked')}", as_user=ADMIN,
          error_has="has changed since")
    check("unknown kinds are refused", email(kiran, "warned"), as_user=ADMIN, error_has="Unknown kind of email")
    check("the log has one row per email sent, with the admin",
          f"SELECT count(*) || '|' || bool_and(actor_id = '{ADMIN}') FROM private.member_email_log", expect="5|true")
    check("... members can't read it", "SELECT count(*) FROM private.member_email_log", as_user=nina, expect="error")
    check("... rows older than 30 days go with the next email",
          f"UPDATE private.member_email_log SET created_at = now() - interval '31 days' WHERE member_id = '{kiran}'; "
          + as_admin(f"{review(tara, 'approved')}; {field(tara, 'approved', 'kind')}; RESET ROLE; "
                     f"SELECT count(*) FROM private.member_email_log WHERE member_id = '{kiran}'"),
          expect="f\napproved\napproved\n0")
    psql("DELETE FROM private.rate_log WHERE action = 'member_email'")
    check("an admin can have at most 30 emails a minute sent", f"""
          DO $$BEGIN FOR i IN 1..30 LOOP PERFORM private.take_rate('member_email', ARRAY['30', '1 minute', '300', '1 day']); END LOOP; END$$;
          {review(sita, 'approved')}; {email(sita, 'approved')}""", as_user=ADMIN,
          error_has="doing that too often")
    check("... (the refused one isn't logged)",
          f"SELECT count(*) FROM private.member_email_log WHERE member_id = '{sita}'", expect="0")

    # --- deleting unfinished sign-ups -------------------------------------------
    deletable = lambda uid: f"SELECT r->>'email_confirmed' FROM (SELECT public.admin_check_signup_delete('{uid}')) x(r)"
    check("anon can't check a sign-up for deletion", f"SELECT public.admin_check_signup_delete('{omar}')", role="anon",
          expect="error")
    check("a member can't", f"SELECT public.admin_check_signup_delete('{omar}')", as_user=nina, error_has="Admins only")
    check("omar (never confirmed his address) can be deleted", deletable(omar), as_user=ADMIN, expect="false")
    check("pia (confirmed, never sent her details) too", deletable(pia), as_user=ADMIN, expect="true")
    for who, uid in (("kiran (approved)", kiran), ("sita (waiting for review)", sita), ("ravi (declined)", ravi),
                     ("the admin's own account", ADMIN)):
        check(f"... not {who}", deletable(uid), as_user=ADMIN, error_has="never finished signing up")
    check("... not a blocked unfinished account",
          f"BEGIN; UPDATE profile_private SET status = 'blocked' WHERE id = '{pia}'; " + as_admin(deletable(pia)) + "; ROLLBACK",
          error_has="never finished signing up")
    check("... not someone who sent their details once",
          f"BEGIN; INSERT INTO verification_log (member_id, decision) VALUES ('{pia}', 'submitted'); "
          + as_admin(deletable(pia)) + "; ROLLBACK", error_has="never finished signing up")
    check("... nor an unknown account", "SELECT public.admin_check_signup_delete(gen_random_uuid())", as_user=ADMIN,
          error_has="Member not found")
    record = lambda actor, uid: f"SELECT public.admin_record_signup_delete('{actor}', '{uid}', false) IS NOT NULL"
    check("only the service role records a deletion", record(ADMIN, omar), as_user=ADMIN, expect="error")
    check("... once the account is gone", record(ADMIN, omar), role="service_role", error_has="hasn't been deleted")
    check("... done by an admin", f"DELETE FROM auth.users WHERE id = '{omar}'; SET ROLE service_role; {record(nina, omar)}",
          error_has="Admins only")
    check("omar's deletion is recorded like our team's other decisions, without his details",
          f"DELETE FROM auth.users WHERE id = '{omar}'; SET ROLE service_role; {record(ADMIN, omar)}; RESET ROLE; "
          f"SELECT concat_ws('|', action, target_kind, target_id, target_user IS NULL, source, explanation, actor_id = '{ADMIN}') "
          f"FROM private.moderation_action WHERE action = 'delete_signup'",
          expect=f"t\ndelete_signup|member|{omar}|t|own_initiative|Unfinished sign-up deleted (email address never confirmed)|t")

    # --- What's on ----------------------------------------------------------------
    today = datetime.now(ZoneInfo("Europe/Berlin")).date()
    day = lambda n: (today + timedelta(days=n)).isoformat()
    q = lambda v: "'" + v.replace("'", "''") + "'"

    def event(**change):
        e = {"id": "diwali-test-berlin", "title": "Diwali Test", "category": "festival", "start": day(20),
             "city": "Berlin", "organiser": "Test e.V.", "summary": "Lights and food.", "url": "https://example.org/diwali"}
        e.update(change)
        return q(json.dumps({k: v for k, v in e.items() if v is not None}))

    save = lambda e, new="true": f"SELECT public.admin_save_whats_on_event({e}::jsonb, {new})"
    cols = "id, title, category, start_date, end_date, event_time, city, venue, area, organiser, price, language, summary, url"
    public_ids = "SELECT COALESCE(string_agg(id, ',' ORDER BY id), '') FROM public.whats_on_events"
    insert = ("INSERT INTO public.whats_on_events (id, title, category, start_date, city, organiser, summary, url) "
              "VALUES ('x', 'X', 'festival', '2099-01-01', 'Berlin', 'O', 'S', 'https://x.org')")
    check("anon can't write events", insert, role="anon", expect="error")
    check("... nor members", insert, as_user=nina, expect="error")
    check("... nor use the admin functions", save(event()), as_user=nina, error_has="Admins only")
    check("an admin adds one (text trimmed, empty fields left out)",
          "SELECT concat_ws('|', r->>'id', r->>'hidden', r ? 'end', r ? 'venue', r->>'time') "
          f"FROM ({save(event(time='  18:00 ', venue=''))}) x(r)", as_user=ADMIN,
          expect="diwali-test-berlin|false|f|f|18:00")
    check("... anon reads it", f"SELECT {cols} FROM public.whats_on_events", role="anon",
          expect=f"diwali-test-berlin|Diwali Test|festival|{day(20)}||18:00|Berlin|||Test e.V.|||Lights and food.|https://example.org/diwali")
    check("... but not who added it", "SELECT created_by FROM public.whats_on_events", role="anon", expect="error")
    check("... nor whether it's hidden", "SELECT hidden FROM public.whats_on_events", role="anon", expect="error")
    check("anon doesn't see ended events (added straight to the table); one on its last day is still on",
          f"INSERT INTO public.whats_on_events (id, title, category, start_date, end_date, city, organiser, summary, url) "
          f"VALUES ('old-one', 'Old', 'music', '{day(-10)}', '{day(-1)}', 'Munich', 'O', 'S', 'https://example.org'), "
          f"('on-now', 'Now', 'culture', '{day(-10)}', '{day(0)}', 'Munich', 'O', 'S', 'https://example.org'); "
          f"SET ROLE anon; {public_ids}", expect="diwali-test-berlin,on-now")
    check("an admin hides one", f"SELECT (public.admin_hide_whats_on_event('on-now', true))->>'hidden'; SET ROLE anon; {public_ids}",
          as_user=ADMIN, expect="true\ndiwali-test-berlin")
    check("... and shows it again", "SELECT (public.admin_hide_whats_on_event('on-now', false))->>'hidden'", as_user=ADMIN,
          expect="false")
    check("... members see what anon sees", public_ids, as_user=nina, expect="diwali-test-berlin,on-now")
    check("the admin list has every event, upcoming and past",
          "SELECT concat_ws('|', (SELECT string_agg(e->>'id', ',') FROM jsonb_array_elements(r->'upcoming') e), "
          "(SELECT string_agg(e->>'id', ',') FROM jsonb_array_elements(r->'past') e)) FROM public.admin_whats_on_events() r",
          as_user=ADMIN, expect="on-now,diwali-test-berlin|old-one")
    check("... members can't list them", "SELECT public.admin_whats_on_events()", as_user=nina, error_has="Admins only")
    check("an admin changes one (its id stays)",
          "SELECT concat_ws('|', r->>'title', r->>'end', r ? 'time') "
          f"FROM ({save(event(title='Diwali Mela', end=day(21)), 'false')}) x(r)", as_user=ADMIN,
          expect=f"Diwali Mela|{day(21)}|f")
    check("... a new event with an id in use is refused", save(event()), as_user=ADMIN, error_has="already exists")
    check("... changing an unknown one too", save(event(id="nope"), "false"), as_user=ADMIN, error_has="Event not found")
    for name, e, err in (
            ("an id with capitals or spaces", event(id="Diwali Berlin"), "only a-z, 0-9 and single dashes"),
            ("a missing title", event(title=None), "Fill in the title"),
            ("an empty summary", event(summary="   "), "Fill in the title"),
            ("an unknown type", event(category="bhangra"), "Unknown type of event"),
            ("a day that doesn't exist", event(start="2027-02-30"), "real days"),
            ("a date in another format", event(start="07.11.2027"), "real days"),
            ("a last day before the first", event(end=day(19)), "The last day is before the first"),
            ("an event that has ended", event(start=day(-3), end=day(-1)), "already ended"),
            ("a summary over 160 characters", event(summary="x" * 161), "Keep the summary to 160 characters"),
            ("an http:// link", event(url="http://example.org"), "full https:// address"),
            ("a link with a space", event(url="https:// example.org"), "full https:// address"),
            ("a javascript: link", event(url="javascript:alert(1)"), "full https:// address"),
            ("a long time", event(time="x" * 41), "Give the time as"),
            ("a city without letters", event(city="123"), "Give the city by its name"),
            ("an unknown field", event(organizer="X"), "Unknown field"),
            ("a field that isn't text", q('{"id": "a", "title": 5}'), "must be text")):
        check(f"... refused: {name}", save(e), as_user=ADMIN, error_has=err)
    check("... a summary of 160 characters is fine",
          f"SELECT ({save(event(id='long-summary', summary='y' * 160))}) IS NOT NULL", as_user=ADMIN, expect="t")
    check("an admin deletes one", "SELECT public.admin_delete_whats_on_event('long-summary')", as_user=ADMIN,
          expect="long-summary")
    check("... and again: not found", "SELECT public.admin_delete_whats_on_event('long-summary')", as_user=ADMIN,
          error_has="Event not found")
    check("members can't hide or delete", "SELECT public.admin_delete_whats_on_event('on-now')", as_user=nina,
          error_has="Admins only")
    check("... (still there)", "SELECT count(*) FROM public.whats_on_events WHERE id = 'on-now'", expect="1")

    # --- Inbox (mail to hello@nriclub.app) -------------------------------------------
    hours_ago = lambda h: (datetime.now(ZoneInfo("UTC")) - timedelta(hours=h)).isoformat()
    def stored(rid, subject="Question", text="Hello, how do I join?", sender="Asha <asha@example.org>", **more):
        e = {"resend_email_id": rid, "message_id": f"<{rid}@mail.example.org>", "from": sender, "to": ["hello@nriclub.app"],
             "subject": subject, "text": text, "html": "<p>x</p>",
             "attachments": [{"filename": "cv.pdf", "content_type": "application/pdf", "size": 1200, "download_url": "https://x"}]}
        e.update(more)
        return f"SELECT public.inbox_store({q(json.dumps(e))}::jsonb) IS NOT NULL"
    inbox_list = lambda f="inbox", query="": f"SELECT public.admin_inbox_list('{f}', 50, 0, {q(query)})"
    # A message's id, as the admin panel has it from the list.
    msg_id = lambda rid: "'" + psql(f"SELECT id FROM private.inbox_messages WHERE resend_email_id = '{rid}'")[1] + "'::uuid"
    check("anon can't store an email", stored("re_1"), role="anon", expect="error")
    check("... nor a member, nor an admin", stored("re_1"), as_user=ADMIN, expect="error")
    check("forward-email (service role) stores one, with the attachments' names only", f"""
          SET ROLE service_role; {stored('re_1', received_at=hours_ago(3))}; RESET ROLE;
          SELECT attachments::text FROM private.inbox_messages WHERE resend_email_id = 're_1'""",
          expect='t\n[{"size": 1200, "filename": "cv.pdf", "content_type": "application/pdf"}]')
    check("... the same email again is stored once (Resend retries)",
          f"SET ROLE service_role; {stored('re_1', subject='Changed')}; RESET ROLE; "
          "SELECT count(*) || '|' || max(subject) FROM private.inbox_messages WHERE resend_email_id = 're_1'",
          expect="t\n1|Question")
    psql(f"SET ROLE service_role; {stored('re_2', subject='Room in Berlin', text='Any rooms?', sender='bo@example.org', received_at=hours_ago(2))}; "
         f"{stored('re_3', subject='Sponsor 50% off_now', text='Buy', sender='spam@example.net', received_at=hours_ago(1))}")
    check("members can't read the Inbox", inbox_list(), as_user=nina, error_has="Admins only")
    check("... nor the tables", "SELECT count(*) FROM private.inbox_messages", as_user=nina, expect="error")
    check("the admin lists it: newest first, 3 unread",
          f"SELECT concat_ws('|', r->>'total', r->>'unread', (SELECT string_agg(m->>'subject', ',') FROM jsonb_array_elements(r->'messages') m)) "
          f"FROM ({inbox_list()}) x(r)", as_user=ADMIN, expect="3|3|Sponsor 50% off_now,Room in Berlin,Question")
    check("... searches sender, subject and text (% and _ are plain characters)",
          f"SELECT concat_ws('|', ({inbox_list(query='rooms')})->>'total', ({inbox_list(query='50%')})->>'total', "
          f"({inbox_list(query='%')})->>'total', ({inbox_list(query='asha@')})->>'total')", as_user=ADMIN, expect="1|1|1|1")
    check("opening one marks it read and shows the text, not the HTML",
          f"SELECT concat_ws('|', r->>'read', r->>'text', r->>'html', r->'attachment_list'->0->>'filename', jsonb_array_length(r->'replies')) "
          f"FROM (SELECT public.admin_inbox_get({msg_id('re_1')})) x(r)", as_user=ADMIN,
          expect="true|Hello, how do I join?||cv.pdf|0")
    check("... unread ones come first",
          f"SELECT concat_ws('|', r->>'unread', (SELECT string_agg(m->>'subject', ',') FROM jsonb_array_elements(r->'messages') m)) "
          f"FROM ({inbox_list()}) x(r)", as_user=ADMIN, expect="2|Sponsor 50% off_now,Room in Berlin,Question")
    check("archiving one takes it out of the Inbox",
          f"SELECT (public.admin_inbox_set({msg_id('re_3')}, true))->>'archived'; "
          f"SELECT concat_ws('|', ({inbox_list()})->>'total', ({inbox_list('archived')})->>'total', ({inbox_list('all')})->>'total')",
          as_user=ADMIN, expect="true\n2|1|3")
    check("... marking one unread", f"SELECT (public.admin_inbox_set({msg_id('re_1')}, NULL, false))->>'read'; "
          f"SELECT ({inbox_list('unread')})->>'total'", as_user=ADMIN, expect="false\n2")
    check("... an unknown filter is refused", inbox_list("spam"), as_user=ADMIN, error_has="Unknown filter")
    prepare = lambda rid, body="Thanks, here is how.": f"SELECT public.admin_inbox_reply_prepare({msg_id(rid)}, {q(body)})"
    check("a member can't prepare a reply", prepare("re_1"), as_user=nina, error_has="Admins only")
    check("the admin prepares one: to the sender, Re: subject, the Message-ID for threading",
          f"SELECT concat_ws('|', r->>'to', r->>'subject', r->>'message_id', r->>'admin' = '{ADMIN}') FROM ({prepare('re_1')}) x(r)",
          as_user=ADMIN, expect="Asha <asha@example.org>|Re: Question|<re_1@mail.example.org>|t")
    check("... an empty reply is refused", prepare("re_1", "   "), as_user=ADMIN, error_has="Write a reply")
    record = f"SELECT (public.inbox_record_reply({msg_id('re_1')}, '{ADMIN}', 'Thanks, here is how.', 'resend-out-1'))->>'by'"
    check("only the service role records the reply", record, as_user=ADMIN, expect="error")
    check("... for an admin", record.replace(ADMIN, nina), role="service_role", error_has="Admins only")
    check("... recorded: the message shows it, replied and read",
          f"SET ROLE service_role; {record}; RESET ROLE; " + as_admin(
              f"SELECT concat_ws('|', r->>'read', r->>'replied_at' IS NOT NULL, r->'replies'->0->>'body', r->'replies'->0->>'by') "
              f"FROM (SELECT public.admin_inbox_get({msg_id('re_1')})) x(r)"),
          expect="NRIClub Team\nf\ntrue|t|Thanks, here is how.|NRIClub Team")
    check("the clean-up deletes messages 12 months after they arrived, with their replies", f"""
          BEGIN;
          UPDATE private.inbox_messages SET received_at = now() - interval '13 months' WHERE resend_email_id IN ('re_1', 're_2');
          SELECT (private.daily_cleanup())->>'inbox_messages';
          SELECT string_agg(resend_email_id, ',') || '|' || (SELECT count(*) FROM private.inbox_replies) FROM private.inbox_messages;
          ROLLBACK;""", expect="2\nre_3|0")
    # --- emails left this month -------------------------------------------------------
    check("before Resend's counter was seen, the panel gets null", "SELECT public.admin_resend_quota() IS NULL",
          as_user=ADMIN, expect="t")
    check("members can't read it", "SELECT public.admin_resend_quota()", as_user=nina, error_has="Admins only")
    check("only the service role stores it", "SELECT public.resend_quota_store(10, 2)", as_user=ADMIN, expect="error")
    check("... (anon neither)", "SELECT public.resend_quota_store(10, 2)", role="anon", expect="error")
    check("the service role stores it; the admin reads it",
          "SET ROLE service_role; SELECT public.resend_quota_store(1234, 37) IS NOT NULL; "
          "SELECT public.resend_quota_store(NULL, NULL) IS NULL; RESET ROLE; "
          + as_admin("SELECT concat_ws('|', q->>'monthly_used', q->>'daily_used', q ? 'observed_at') FROM public.admin_resend_quota() q"),
          expect="t\nt\nf\n1234|37|t")
    check("... a count from a paid plan without the daily one", "SET ROLE service_role; "
          "SELECT (public.resend_quota_store(1300, NULL))->>'daily_used' IS NULL", expect="t")
    check("... negative counts are refused", "SELECT public.resend_quota_store(-1, 0)", role="service_role",
          error_has="can't be negative")

    import difflib
    old = function_source(AMBASSADORS, "CREATE OR REPLACE FUNCTION private.daily_cleanup()").splitlines()
    new = function_source(ADMIN_TOOLS, "CREATE OR REPLACE FUNCTION private.daily_cleanup()").splitlines()
    diff = [l for l in difflib.ndiff(old, new) if l[:2] in ("- ", "+ ")]
    removed = [l[2:] for l in diff if l.startswith("- ")]
    verdict("private.daily_cleanup() is its 2026-10-24 version with lines added only",
            removed == ["    'undecided_ambassador_applications', undecided_applications);"], f"removed: {removed}")


def trip(kind, frm, to, start, end=None, help=("documents",), flight="", note="", user="auth.uid()"):
    """SQL that posts a trip on the travel board and prints its id. start,
    end: days from today in Germany (end: a request's latest date)."""
    end = start if end is None else end
    helps = "ARRAY[" + ", ".join(f"'{h}'" for h in help) + "]::text[]"
    return (f"INSERT INTO travel_posts (user_id, kind, from_city, to_city, date_from, date_to, flight, help, note) "
            f"VALUES ({user}, '{kind}', '{frm}', '{to}', private.today_in_germany() + {start}, "
            f"private.today_in_germany() + {end}, '{flight}', {helps}, '{note}') RETURNING id")


def travel_board():
    """The travel board ("Flying to or from India"): who reads and posts,
    the rules ticked once, dates and other checks, matching notifications,
    limits, reports and our team's removals, clean-up and "Download my
    data": migration 20261026000000_travel_board."""
    import difflib
    tara, uma, vik, wen, xia, yash, zoe, rhea = (f"00000000-0000-0000-0000-000000000c{n}"
                                               for n in ("01", "02", "03", "04", "05", "06", "07", "08"))
    for uid, mail, name in ((tara, "tara.c@example.com", "Tara C"), (uma, "uma@example.com", "Uma U"),
                            (vik, "vik@example.com", "Vik V"), (wen, "wen.c@example.com", "Wen W"),
                            (xia, "xia@example.com", "Xia X"), (zoe, "zoe@example.com", "Zoe Z"),
                            (rhea, "rhea@example.com", "Rhea R")):
        approved_member(uid, mail, name)
    # yash sent his details but our team hasn't approved him yet.
    sign_up(yash, "yash@example.com", {"full_name": "Yash Y"}, accept_terms=True)
    psql(f"UPDATE profile_private SET verification_status = 'pending', submitted_at = now() WHERE id = '{yash}'")
    accept = "SELECT public.accept_travel_rules('2026-10-26') ->> 'accepted'"
    status = "SELECT concat_ws('|', s->>'version', s->>'accepted') FROM public.travel_rules_status() s"

    def post(uid, sql):
        ok, out, err = psql(sql, "authenticated", uid)
        if not ok:
            sys.exit(f"posting a trip failed: {err}")
        return out.splitlines()[-1]

    # --- the Terms of Use 2026-10-23 ---------------------------------------------------
    with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "src", "content", "legal", "terms.js"),
              encoding="utf-8") as f:
        terms_js = f.read()
    site_terms = re.search(r'export const TERMS_VERSION = "([^"]+)"', terms_js).group(1)
    check("the database asks for the Terms version the site shows (TERMS_VERSION, 2026-10-23)",
          "SELECT public.current_terms_version()", role="anon", expect=site_terms)
    check("... and the version before it is the site's PREVIOUS_TERMS_VERSION",
          "SELECT public.previous_terms_version()", role="anon",
          expect=re.search(r'export const PREVIOUS_TERMS_VERSION = "([^"]+)"', terms_js).group(1))

    # --- who can read and post -----------------------------------------------------
    check("signed-out visitors can't read the board", "SELECT count(*) FROM travel_posts", role="anon",
          error_has="permission denied")
    check("... nor ask for or tick the rules", "SELECT public.travel_rules_status()", role="anon", expect="error")
    check("... (tick)", "SELECT public.accept_travel_rules('2026-10-26')", role="anon", expect="error")
    check("a new member hasn't ticked the rules: the current version, not accepted", status, as_user=tara,
          expect="2026-10-26|false")
    check("... and can't post before ticking them", trip("offer", "Frankfurt", "Delhi", 30), as_user=tara,
          error_has="row-level security")
    check("ticking an older version of the rules is refused", "SELECT public.accept_travel_rules('2026-01-01')",
          as_user=tara, error_has="rules have changed")
    check("tara ticks the rules", accept, as_user=tara, expect="true")
    claims = json.dumps({"sub": tara, "role": "authenticated"})
    check("... ticking again keeps when she first did", f"""
          CREATE TEMP TABLE first_tick AS SELECT accepted_at FROM private.travel_rules_ack WHERE user_id = '{tara}';
          SET ROLE authenticated; SELECT set_config('request.jwt.claims', '{claims}', false) IS NOT NULL;
          {accept}; RESET ROLE;
          SELECT (SELECT accepted_at FROM private.travel_rules_ack WHERE user_id = '{tara}') = (SELECT accepted_at FROM first_tick)""",
          expect="t\ntrue\nt")
    check("members can't read or write the record of who ticked the rules",
          "SELECT count(*) FROM private.travel_rules_ack", as_user=tara, error_has="permission denied")
    check("... (write)", f"INSERT INTO private.travel_rules_ack (user_id, rules_version) VALUES (auth.uid(), '2026-10-26')",
          as_user=uma, error_has="permission denied")
    check("a member waiting for our check can't tick the rules", accept, as_user=yash,
          error_has="Only members our team has approved")
    psql(f"INSERT INTO private.travel_rules_ack (user_id, rules_version) VALUES ('{yash}', '2026-10-26')")
    check("... nor post, even with the rules ticked", trip("offer", "Berlin", "Mumbai", 10), as_user=yash,
          error_has="row-level security")
    for uid in (uma, vik, wen, xia, zoe, rhea):
        psql(accept, "authenticated", uid)
    with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "src", "content", "travel.js"),
              encoding="utf-8") as f:
        travel_js = f.read()
    js_version = re.search(r'export const TRAVEL_RULES_VERSION = "([^"]+)"', travel_js).group(1)
    check("the site shows the version of the rules the database asks for (TRAVEL_RULES_VERSION)",
          "SELECT private.travel_rules_version()", expect=js_version)
    check("tara has ticked the current rules", status, as_user=tara, expect="2026-10-26|true")
    psql(f"UPDATE private.travel_rules_ack SET rules_version = '2026-01-01' WHERE user_id = '{uma}'")
    check("a member who ticked an earlier version of the rules is asked again", status, as_user=uma,
          expect="2026-10-26|false")
    check("... and can't post until they tick them", trip("offer", "Berlin", "Mumbai", 10), as_user=uma,
          error_has="row-level security")
    check("... ticking them again", accept, as_user=uma, expect="true")

    # --- a post, and what it must say --------------------------------------------------
    check("tara is flying FRANKFURT → delhi in 30 days: the route kept as written, matched in lower case, the flight in capitals",
          "INSERT INTO travel_posts (user_id, kind, from_city, to_city, date_from, date_to, flight, help, note) VALUES "
          "(auth.uid(), 'offer', '  FRANKFURT ', 'delhi', private.today_in_germany() + 30, private.today_in_germany() + 35, "
          "'lh   760', ARRAY['items', 'documents', 'items'], ' Happy to help. ') "
          "RETURNING concat_ws('|', kind, from_city, to_city, from_key, to_key, date_to = date_from, flight, help::text, note)",
          as_user=tara, expect="offer|FRANKFURT|delhi|frankfurt|delhi|t|LH 760|{documents,items}|Happy to help.")
    tara_trip = psql(f"SELECT id FROM travel_posts WHERE user_id = '{tara}'")[1]
    for name, sql, error in (
            ("a date that has passed is refused", trip("offer", "Berlin", "Delhi", -1), "That date has passed."),
            ("... and one more than a year ahead", trip("offer", "Berlin", "Delhi", 400), "within the next 12 months"),
            ("a window of more than 120 days is refused", trip("request", "Berlin", "Delhi", 1, 125), "at most 120 days apart"),
            ("... and one that ends before it starts", trip("request", "Berlin", "Delhi", 10, 5), "latest date is before the earliest"),
            ("Delhi to New Delhi is no trip", trip("offer", "Delhi", "New Delhi, India", 10), "The two cities are the same."),
            ("a city needs letters", trip("offer", "Berlin 2", "Delhi", 10), "each city's name in letters"),
            ("... not a web address", trip("offer", "Berlin", "http://example.com", 10), "each city's name in letters"),
            ("... nor anything like one", trip("offer", "Berlin", "pay-courier.com", 10), "each city's name in letters"),
            ("... and isn't empty", trip("offer", "  ", "Delhi", 10), "which city you fly from"),
            ("the kind of help is needed", trip("offer", "Berlin", "Delhi", 10, help=()), "what you can help with"),
            ("... (for a request too)", trip("request", "Berlin", "Delhi", 10, 20, help=()), "what you need"),
            ("... one of the three", trip("offer", "Berlin", "Delhi", 10, help=("cash",)), "a travel companion, documents or small open items"),
            ("a flight number like LH 760", trip("offer", "Berlin", "Delhi", 10, flight="Lufthansa"), "flight number like LH 760"),
            ("a note of at most 500 characters", trip("offer", "Berlin", "Delhi", 10, note="x" * 501), "500 characters"),
            ("a post is either kind", trip("parcel", "Berlin", "Delhi", 10), "I'm travelling"),
    ):
        check(name, sql, as_user=tara, error_has=error)
    check("a request keeps no flight number, and can start today",
          trip("request", "Berlin", "Mumbai", 0, 20, flight="AI 120").replace("RETURNING id", "RETURNING flight = '' AND date_from = private.today_in_germany()"),
          as_user=uma, expect="t")
    check("nobody posts as another member", trip("offer", "Berlin", "Mumbai", 10, user=f"'{uma}'"), as_user=tara,
          error_has="row-level security")

    # --- who sees which post ----------------------------------------------------------------
    check("an approved member sees tara's trip, with its route keys",
          f"SELECT concat_ws('|', from_key, to_key, flight) FROM travel_posts WHERE id = '{tara_trip}'", as_user=uma,
          expect="frankfurt|delhi|LH 760")
    check("a member waiting for our check sees no trips", "SELECT count(*) FROM travel_posts", as_user=yash, expect="0")
    old_trip = psql(trip("offer", "Hamburg", "Pune", -1, user=f"'{tara}'"))[1]
    check("a trip whose last date has passed leaves the board", f"SELECT count(*) FROM travel_posts WHERE id = '{old_trip}'",
          as_user=uma, expect="0")
    check("... its author still sees it", f"SELECT count(*) FROM travel_posts WHERE id = '{old_trip}'", as_user=tara, expect="1")
    check("... and so does our team", f"SELECT count(*) FROM travel_posts WHERE id = '{old_trip}'", as_user=ADMIN, expect="1")
    xia_trip = post(xia, trip("request", "Frankfurt", "Delhi", 20, 40, help=("documents",)))
    check("xia blocks tara", f"SELECT public.block_member('{tara}')", as_user=xia, expect="t")
    check("... and no longer sees tara's trips", f"SELECT count(*) FROM travel_posts WHERE user_id = '{tara}'",
          as_user=xia, expect="0")
    check("... nor tara xia's", f"SELECT count(*) FROM travel_posts WHERE id = '{xia_trip}'", as_user=tara, expect="0")
    check("... other members see both", f"SELECT count(*) FROM travel_posts WHERE user_id IN ('{tara}', '{xia}') "
          "AND date_to >= private.today_in_germany()", as_user=uma, expect="2")
    rhea_trip = post(rhea, trip("offer", "Munich", "Kochi", 15))
    psql(f"UPDATE profile_private SET status = 'blocked' WHERE id = '{rhea}'")
    check("a member our team blocked: other members don't see their trips",
          f"SELECT count(*) FROM travel_posts WHERE id = '{rhea_trip}'", as_user=uma, expect="0")
    check("... they can't post", trip("offer", "Munich", "Kochi", 16), as_user=rhea, error_has="row-level security")
    check("... nor edit, but can still delete their own",
          f"UPDATE travel_posts SET note = 'x' WHERE id = '{rhea_trip}' RETURNING 1; "
          f"DELETE FROM travel_posts WHERE id = '{rhea_trip}' RETURNING 1", as_user=rhea, expect="1")

    # --- editing and deleting -----------------------------------------------------------------
    check("tara edits her trip: route, date, note and help", f"""
          UPDATE travel_posts SET from_city = 'Frankfurt am Main', date_from = private.today_in_germany() + 31,
            note = 'Window seat', help = ARRAY['documents'] WHERE id = '{tara_trip}'
          RETURNING concat_ws('|', from_key, date_from - private.today_in_germany(), date_to = date_from, note, help::text,
            updated_at > created_at)""", as_user=tara, expect="frankfurt|31|t|Window seat|{documents}|t")
    check("... not its type", f"UPDATE travel_posts SET kind = 'request' WHERE id = '{tara_trip}'", as_user=tara,
          error_has="type can't be changed")
    check("... and not its id, author or creation time",
          f"UPDATE travel_posts SET id = gen_random_uuid(), user_id = '{uma}', created_at = '2001-01-01' WHERE id = '{tara_trip}' "
          "RETURNING concat_ws('|', id, user_id, created_at > '2020-01-01')", as_user=tara, expect=f"{tara_trip}|{tara}|t")
    check("... nor to a date that has passed", f"UPDATE travel_posts SET date_from = private.today_in_germany() - 2 "
          f"WHERE id = '{tara_trip}'", as_user=tara, error_has="That date has passed.")
    check("another member can't edit it", f"UPDATE travel_posts SET note = 'Hijacked' WHERE id = '{tara_trip}' RETURNING 1",
          as_user=uma, expect="")
    check("... nor delete it", f"DELETE FROM travel_posts WHERE id = '{tara_trip}' RETURNING 1", as_user=uma, expect="")
    check("... nor can an admin through the API (our team uses admin_moderate)",
          f"DELETE FROM travel_posts WHERE id = '{tara_trip}' RETURNING 1", as_user=ADMIN, expect="")
    begun = psql(trip("request", "Pune", "Berlin", -5, 5, user=f"'{uma}'"))[1]
    check("a request whose window has begun: its note and latest date can still change", f"""
          UPDATE travel_posts SET note = 'Still looking', date_to = private.today_in_germany() + 10 WHERE id = '{begun}'
          RETURNING date_to - private.today_in_germany()""", as_user=uma, expect="10")
    check("... but its earliest date can't move into the past",
          f"UPDATE travel_posts SET date_from = private.today_in_germany() - 3 WHERE id = '{begun}'", as_user=uma,
          error_has="That date has passed.")
    check("the author deletes their post", f"DELETE FROM travel_posts WHERE id = '{begun}' RETURNING 1", as_user=uma, expect="1")

    # --- matches --------------------------------------------------------------------------------
    psql(f"DELETE FROM travel_posts WHERE user_id IN ('{tara}', '{uma}', '{vik}', '{wen}', '{xia}', '{zoe}'); "
         "DELETE FROM notifications WHERE type = 'travel_match'; DELETE FROM private.rate_log WHERE action = 'travel_post'")
    notes = lambda uid: (f"SELECT count(*) || '|' || COALESCE(string_agg(n.actor_id || ':' || n.text, ';'), '') "
                         f"FROM notifications n WHERE n.user_id = '{uid}' AND n.type = 'travel_match'")
    uma_req = post(uma, trip("request", "Frankfurt", "Delhi", 25, 40, help=("documents",)))
    post(wen, trip("request", "Frankfurt (Main)", "New Delhi", 28, 35, help=("companion",)))
    post(vik, trip("request", "Frankfurt", "Delhi", 60, 70, help=("documents",)))
    post(zoe, trip("request", "Delhi", "Frankfurt", 25, 40, help=("documents",)))
    post(xia, trip("request", "Frankfurt", "Delhi", 25, 40, help=("documents",)))
    tara_trip = post(tara, trip("offer", "FRANKFURT", "Delhi", 30, help=("documents", "items"), flight="LH 760"))
    date30 = psql("SELECT to_char(private.today_in_germany() + 30, 'FMDD Mon YYYY')")[1]
    check("tara posts a trip: uma, who needs documents carried on that route then, hears about it",
          notes(uma), expect=f"1|{tara}:is flying FRANKFURT → Delhi on {date30} and can carry documents. "
                             "This matches your request on the travel board.")
    check("... it points at tara's trip",
          f"SELECT reference_id FROM notifications WHERE user_id = '{uma}' AND type = 'travel_match'", expect=tara_trip)
    check("... not wen, who needs a companion (Frankfurt (Main) to New Delhi is the same route)", notes(wen), expect="0|")
    check("... not vik, whose dates don't overlap", notes(vik), expect="0|")
    check("... not zoe, who flies the other way", notes(zoe), expect="0|")
    check("... not xia, who blocked tara", notes(xia), expect="0|")
    check("... nor tara herself", notes(tara), expect="0|")
    check("the dates and the help in these notifications",
          "SELECT concat_ws('|', private.travel_dates_text('2026-12-12', '2026-12-12'), "
          "private.travel_dates_text('2026-12-10', '2026-12-20'), private.travel_dates_text('2026-11-28', '2026-12-05'), "
          "private.travel_dates_text('2026-12-28', '2027-01-05'), "
          "private.travel_help_text(ARRAY['companion', 'documents', 'items'], 'offer'), "
          "private.travel_help_text(ARRAY['companion', 'documents'], 'request'), private.travel_help_text(ARRAY['items'], 'request'))",
          expect="12 Dec 2026|10–20 Dec 2026|28 Nov–5 Dec 2026|28 Dec 2026–5 Jan 2027|"
                 "be a travel companion, carry documents and small open items|a travel companion and someone to carry documents|"
                 "someone to carry a small open item")
    psql(f"SELECT public.block_member('{zoe}')", "authenticated", tara)
    post(wen, trip("request", "frankfurt", "delhi", 29, 31, help=("companion", "documents", "items")))
    window = psql("SELECT private.travel_dates_text(private.today_in_germany() + 29, private.today_in_germany() + 31)")[1]
    check("a new request that matches: tara hears what it needs that she can do",
          notes(tara), expect=f"1|{wen}:is looking for someone to carry documents and a small open item on frankfurt → delhi, "
                              f"{window}. This matches your trip on the travel board.")
    post(zoe, trip("request", "Frankfurt", "Delhi", 30, 30, help=("items",)))
    check("... not about a member she blocked", notes(tara), expect=f"1|{wen}:is looking for someone to carry documents "
          f"and a small open item on frankfurt → delhi, {window}. This matches your trip on the travel board.")
    check("editing a post notifies nobody", f"UPDATE travel_posts SET note = 'Any day', date_to = date_to + 1 "
          f"WHERE id = '{uma_req}' RETURNING 1", as_user=uma, expect="1")
    check("... (still the two notifications)", "SELECT count(*) FROM notifications WHERE type = 'travel_match'", expect="2")
    crowd = [f"00000000-0000-0000-0000-000000000d{n:02d}" for n in range(1, 23)]
    for i, uid in enumerate(crowd):
        approved_member(uid, f"crowd{i}@example.com", f"Crowd Member{i}")
        psql(trip("request", "Munich", "Chennai", 10, 20, user=f"'{uid}'"))
    psql(trip("request", "München", "Madras", 12, 14, user=f"'{crowd[0]}'"))
    vik_trip = post(vik, trip("offer", "Munich", "Chennai", 12))
    check("22 members match a new trip (one of them twice): 20 hear about it, each once",
          f"SELECT count(*) || '|' || count(DISTINCT user_id) FROM notifications WHERE type = 'travel_match' "
          f"AND reference_id = '{vik_trip}'", expect="20|20")
    check("... the trip's author deletes it: those notifications go too",
          f"DELETE FROM travel_posts WHERE id = '{vik_trip}'; "
          f"SELECT count(*) FROM notifications WHERE type = 'travel_match' AND reference_id = '{vik_trip}'",
          as_user=vik, expect="0")
    check("members can't write travel_match notifications themselves",
          f"INSERT INTO notifications (user_id, type, text) VALUES ('{uma}', 'travel_match', 'fake')", as_user=tara,
          expect="error")

    # --- limits -----------------------------------------------------------------------------------
    psql(f"DELETE FROM travel_posts WHERE user_id = '{zoe}'; DELETE FROM private.rate_log WHERE member_id = '{zoe}'")
    check("zoe posts 5 trips in a day", "; ".join(trip("offer", "Berlin", city, 5) for city in
                                                ("Delhi", "Mumbai", "Pune", "Goa", "Jaipur")), as_user=zoe, expect="ok")
    check("... a sixth is refused", trip("offer", "Berlin", "Agra", 5), as_user=zoe, error_has="doing that too often")
    check("... deleting one doesn't give another try",
          f"DELETE FROM travel_posts WHERE user_id = auth.uid() AND to_city = 'Goa'; {trip('offer', 'Berlin', 'Agra', 5)}",
          as_user=zoe, error_has="doing that too often")
    psql(f"UPDATE private.rate_log SET at = now() - interval '2 days' WHERE member_id = '{zoe}' AND action = 'travel_post'; "
         f"INSERT INTO private.rate_log (member_id, action, at) SELECT '{zoe}', 'travel_post', now() - interval '3 days' "
         "FROM generate_series(1, 15)")
    check("20 in 30 days: the next one is refused, days later", trip("offer", "Berlin", "Agra", 5), as_user=zoe,
          error_has="doing that too often")
    psql(f"DELETE FROM private.rate_log WHERE ctid IN (SELECT ctid FROM private.rate_log WHERE member_id = '{zoe}' "
         "AND action = 'travel_post' LIMIT 1)")
    check("... 19: it goes up", trip("offer", "Berlin", "Agra", 5).replace("RETURNING id", "RETURNING 1"), as_user=zoe,
          expect="1")

    # --- a first message from the board ----------------------------------------------------------------
    ola = "00000000-0000-0000-0000-000000000c09"
    approved_member(ola, "ola@example.com", "Ola O")
    convo = psql(f"INSERT INTO conversations (participant_1, participant_2) VALUES (auth.uid(), '{uma}') RETURNING id",
                 "authenticated", ola)[1]
    tagged = (f"INSERT INTO messages (conversation_id, sender_id, content) VALUES ('{convo}', auth.uid(), "
              "'[TRAVEL: Frankfurt → Delhi, 12 Dec] Could my mother sit with you?') RETURNING 1")
    check("a message about a trip needs the board's rules ticked", tagged, as_user=ola,
          error_has="Please read and tick the travel board's rules first.")
    check("... other messages don't", f"INSERT INTO messages (conversation_id, sender_id, content) VALUES ('{convo}', "
          "auth.uid(), 'Hello Uma') RETURNING 1", as_user=ola, expect="1")
    check("... once ticked, it goes", f"{accept}; {tagged}", as_user=ola, expect="true\n1")

    # --- members still on the Terms 2026-10-19 -------------------------------------------------------
    # Section 14: new Terms apply once accepted; until then the previous ones
    # do. Only the travel board (its rules are in the new section 7) needs
    # the new version.
    pita, quin, ravi = (f"00000000-0000-0000-0000-000000000c{n}" for n in ("0a", "0b", "0c"))
    for uid, mail, name in ((pita, "pita@example.com", "Pita P"), (quin, "quin@example.com", "Quin Q"),
                            (ravi, "ravi@example.com", "Ravi R")):
        approved_member(uid, mail, name)
    # As if they had accepted these versions before this update.
    for uid, version in ((pita, "2026-10-19"), (quin, "2026-10"), (ravi, "2026-10-19")):
        psql(f"UPDATE profile_private SET terms_version = '{version}' WHERE id = '{uid}'; "
             f"UPDATE terms_acceptances SET version = '{version}' WHERE member_id = '{uid}' AND kind = 'terms'")
    psql(f"UPDATE profile_private SET art9_consent_at = NULL, art9_consent_version = NULL WHERE id = '{ravi}'; "
         f"INSERT INTO private.travel_rules_ack (user_id, rules_version) VALUES ('{pita}', '2026-10-26')")
    takes_part = "SELECT private.is_active_member()::text || '|' || private.can_browse()::text"
    check("the version before the current one is 2026-10-19 (anyone may ask, as the site does)",
          "SELECT public.previous_terms_version()", role="anon", expect="2026-10-19")
    check("a member who accepted 2026-10-19 still takes part", takes_part, as_user=pita, expect="true|true")
    check("... sees other members", f"SELECT count(*) FROM profiles WHERE id = '{uma}'", as_user=pita, expect="1")
    check("... and the trips on the board", "SELECT count(*) > 0 FROM travel_posts WHERE user_id <> auth.uid()",
          as_user=pita, expect="t")
    check("... posts in the feed", "INSERT INTO posts (user_id, content) VALUES (auth.uid(), 'Hello from Pita') RETURNING 1",
          as_user=pita, expect="1")
    pita_convo = psql(f"INSERT INTO conversations (participant_1, participant_2) VALUES (auth.uid(), '{uma}') RETURNING id",
                      "authenticated", pita)[1]
    check("... starts a conversation and sends a message", f"INSERT INTO messages (conversation_id, sender_id, content) "
          f"VALUES ('{pita_convo}', auth.uid(), 'Hello Uma') RETURNING 1", as_user=pita, expect="1")
    check("... but can't post a trip, even with the board's rules ticked", trip("offer", "Berlin", "Delhi", 12),
          as_user=pita, error_has="Please accept the updated Terms of Use to use the travel board.")
    claims = json.dumps({"sub": pita, "role": "authenticated"})
    check("... (the INSERT policy says no too, without the trigger)", f"""
          BEGIN; ALTER TABLE public.travel_posts DISABLE TRIGGER check_travel_post;
          SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims', '{claims}', true) IS NOT NULL;
          {trip("offer", "Berlin", "Delhi", 12)}; ROLLBACK""", error_has="row-level security")
    check("... trigger back on", "SELECT tgenabled FROM pg_trigger WHERE tgname = 'check_travel_post'", expect="O")
    pita_tagged = (f"INSERT INTO messages (conversation_id, sender_id, content) VALUES ('{pita_convo}', auth.uid(), "
                   "'[TRAVEL: Frankfurt → Delhi, 12 Dec] Could my mother sit with you?') RETURNING 1")
    check("... nor send a message about a trip", pita_tagged, as_user=pita,
          error_has="Please accept the updated Terms of Use to use the travel board.")
    check("a member still on an earlier version (2026-10) can't take part until she accepts the current one",
          takes_part, as_user=quin, expect="false|false")
    check("... (nor post in the feed)", "INSERT INTO posts (user_id, content) VALUES (auth.uid(), 'Hello') RETURNING 1",
          as_user=quin, error_has="row-level security")
    check("the Art. 9 consent is still required: on 2026-10-19 without it, no taking part", takes_part, as_user=ravi,
          expect="false|false")
    psql(f"UPDATE profile_private SET art9_consent_at = NULL, art9_consent_version = NULL WHERE id = '{ola}'")
    check("... nor on the current version", takes_part, as_user=ola, expect="false|false")
    psql(f"UPDATE profile_private SET art9_consent_at = now(), art9_consent_version = '2026-10-19' WHERE id = '{ola}'")
    check("accepting 2026-10-19 again is refused", "SELECT public.accept_terms('2026-10-19')", as_user=pita,
          error_has="The Terms of Use have been updated")
    check("pita accepts 2026-10-23: recorded, with both acceptances kept",
          "SELECT public.accept_terms('2026-10-23'); SELECT terms_version FROM profile_private WHERE id = auth.uid(); "
          "SELECT string_agg(version, ',' ORDER BY version) FROM terms_acceptances WHERE member_id = auth.uid() AND kind = 'terms'",
          as_user=pita, expect="2026-10-23\n2026-10-23\n2026-10-19,2026-10-23")
    check("... now she posts a trip", trip("offer", "Berlin", "Delhi", 12).replace("RETURNING id", "RETURNING 1"),
          as_user=pita, expect="1")
    check("... and sends a message about one", pita_tagged, as_user=pita, expect="1")
    check("ravi gives the Art. 9 consent (with the current Terms): he takes part again",
          f"SELECT public.accept_terms('2026-10-23', true); {takes_part}", as_user=ravi, expect="2026-10-23\ntrue|true")
    check("quin accepts the current Terms: she takes part again",
          f"SELECT public.accept_terms('2026-10-23'); {takes_part}", as_user=quin, expect="2026-10-23\ntrue|true")

    # --- reports and our team ------------------------------------------------------------------------
    report = (f"INSERT INTO reports (reporter_id, reported_post_id, reason, content_type, category, explanation, good_faith) "
              f"VALUES (auth.uid(), '{tara_trip}', '[TRAVEL] FRANKFURT → Delhi — Illegal: Fraud or a scam', 'travel', 'fraud', "
              "'Asked me for a courier fee of 50 euros.', true) RETURNING reported_user_id")
    check("uma reports tara's trip: the report knows its author", report, as_user=uma, expect=tara)
    check("... a report sent the old way (the \"[TRAVEL]\" prefix) is about a travel post too",
          f"INSERT INTO reports (reporter_id, reported_post_id, reason) VALUES (auth.uid(), '{tara_trip}', "
          "'[TRAVEL] FRANKFURT → Delhi — Something else') RETURNING content_type", as_user=wen, expect="travel")
    check("\"Download my data\": tara's trips, when she ticked the rules, and the reports about her trip", """
          SELECT concat_ws('|', jsonb_array_length(d->'travel_posts'), d->'travel_posts'->0->>'user_id' = auth.uid()::text,
            d->'travel_rules_accepted'->>'version', d->'travel_rules_accepted' ? 'accepted_at',
            (SELECT count(*) FROM jsonb_array_elements(d->'reports_about_me') r WHERE r->>'about' = 'travel'))
          FROM (SELECT public.export_my_data() d) x""", as_user=tara, expect="1|t|2026-10-26|t|2")
    check("members can't remove other members' posts with admin_moderate",
          f"SELECT {moderate('travel', tara_trip, 'remove')}", as_user=uma, error_has="Admins only")
    check("our team removes the trip: it's gone, recorded, and both reports are closed", f"""
          SELECT r->>'closed_reports' IS NOT NULL FROM (SELECT {moderate('travel', tara_trip, 'remove',
            rule='Travel board rules (§ 7)', facts='it asked for a courier fee of 50 euros')} r) x;
          SET ROLE postgres;
          SELECT concat_ws('|', (SELECT count(*) FROM travel_posts WHERE id = '{tara_trip}'),
            (SELECT target_kind || ':' || target_user || ':' || (snapshot->'row'->>'to_city') FROM private.moderation_action
             WHERE target_id = '{tara_trip}' AND action = 'remove'),
            (SELECT count(*) FROM reports WHERE reported_post_id = '{tara_trip}' AND status = 'resolved'))""",
          as_user=ADMIN, expect=f"t\n0|travel:{tara}:Delhi|2")
    check("... tara is told why: her travel post, the rule and the facts",
          f"SELECT position('your travel post \"FRANKFURT → Delhi\"' IN text) > 0 AND position('Travel board rules' IN text) > 0 "
          f"FROM notifications WHERE user_id = '{tara}' AND type = 'moderation' ORDER BY created_at DESC LIMIT 1", expect="t")
    check("... and uma hears the outcome of her report",
          f"SELECT position('the travel post \"FRANKFURT → Delhi\"' IN text) > 0 FROM notifications "
          f"WHERE user_id = '{uma}' AND type = 'report' ORDER BY created_at DESC LIMIT 1", expect="t")
    check("... the notifications pointing at the trip went with it",
          f"SELECT count(*) FROM notifications WHERE type = 'travel_match' AND reference_id = '{tara_trip}'", expect="0")

    # --- clean-up ---------------------------------------------------------------------------------------
    check("the clean-up deletes trips 30 days after their last date, and keeps the board's limit counts 30 days", f"""
          BEGIN;
          DELETE FROM travel_posts;
          {trip('offer', 'Bonn', 'Delhi', -31, user=f"'{uma}'").replace(' RETURNING id', '')};
          {trip('request', 'Bonn', 'Goa', -40, -30, user=f"'{uma}'").replace(' RETURNING id', '')};
          {trip('offer', 'Bonn', 'Pune', -1, user=f"'{uma}'").replace(' RETURNING id', '')};
          DELETE FROM private.rate_log;
          INSERT INTO private.rate_log (member_id, action, at) VALUES ('{uma}', 'travel_post', now() - interval '10 days'),
            ('{uma}', 'travel_post', now() - interval '31 days'), ('{uma}', 'post', now() - interval '2 days');
          SELECT (private.daily_cleanup())->>'travel_posts';
          SELECT string_agg(to_city, ',' ORDER BY to_city) FROM travel_posts;
          SELECT string_agg(action || ':' || extract(day FROM now() - at), ',') FROM private.rate_log;
          ROLLBACK;""", expect="1\nGoa,Pune\ntravel_post:10")
    old = function_source(ADMIN_TOOLS, "CREATE OR REPLACE FUNCTION private.daily_cleanup()").splitlines()
    new = function_source(TRAVEL_BOARD, "CREATE OR REPLACE FUNCTION private.daily_cleanup()").splitlines()
    diff = [l for l in difflib.ndiff(old, new) if l[:2] in ("- ", "+ ")]
    removed = [l[2:] for l in diff if l.startswith("- ")]
    verdict("private.daily_cleanup() is its 2026-10-25 version with lines added, and the limit counters' line kept "
            "for every other action", removed == [
                "  -- The counters behind the limits and the name changes.",
                "  DELETE FROM private.rate_log r WHERE r.at < NOW() - INTERVAL '1 day';",
                "    || jsonb_build_object('inbox_messages', inbox);"], f"removed: {removed}")
    for header in ("CREATE OR REPLACE FUNCTION public.export_my_data()",):
        old = function_source(AMBASSADORS, header).splitlines()
        new = function_source(TRAVEL_BOARD, header).splitlines()
        removed = [l[2:] for l in difflib.ndiff(old, new) if l.startswith("- ")]
        verdict(f"{header.split()[-1]} is its 2026-10-24 version with lines added only", not removed, f"removed: {removed}")
    for name in ("private.content_noun(", "private.report_kind_from_reason(", "private.content_author(",
                 "private.report_item(", "public.admin_moderate("):
        old = function_source(MODERATION, f"CREATE FUNCTION {name}").replace("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION", 1)
        new = function_source(TRAVEL_BOARD, f"CREATE OR REPLACE FUNCTION {name}")
        removed = [l[2:] for l in difflib.ndiff(old.splitlines(), new.splitlines()) if l.startswith("- ")]
        # admin_moderate: the list of kinds and the words for the content change.
        allowed = ([l for l in old.splitlines() if "row_json ->> 'title', row_json ->> 'name'" in l or "row_json ->> 'comment', ''" in l
                    or "'review', 'place', 'message'," in l] if name == "public.admin_moderate(" else [])
        verdict(f"{name.rstrip('(')} is its 2026-10-21 version plus travel posts", set(removed) <= set(allowed),
                f"removed: {removed}")

    # --- the same cities in the site and the database ------------------------------------------------------
    aliases = dict(re.findall(r'^\s+"?([^":\n]+?)"?: "([^"]+)",$', travel_js[travel_js.index("CITY_ALIASES"):], re.M))
    cities = re.findall(r'"([^"]+)"', travel_js[travel_js.index("CITIES_ABROAD"):travel_js.index("CITY_ALIASES")])
    samples = list(aliases) + list(aliases.values()) + cities + [
        "  New   Delhi , India", "MÜNCHEN", "Frankfurt (Main)", "Köln", "Düsseldorf", "Zürich", "Straße", "Bengaluru  ",
        "Frankfurt a.M.", "St. John's", "Thiruvananthapuram (Trivandrum)"]
    proc = subprocess.run(["node", "--input-type=module", "-e",
                           "import { cityKey } from './src/content/travel.js';"
                           f"console.log(JSON.stringify({json.dumps(samples)}.map(cityKey)))"],
                          cwd=os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."),
                          capture_output=True, text=True)
    js_keys = json.loads(proc.stdout) if proc.returncode == 0 else []
    ok, out, err = psql("SELECT string_agg(private.travel_city_key(c), '|' ORDER BY i) FROM unnest(ARRAY["
                        + ", ".join("'" + c.replace("'", "''") + "'" for c in samples) + "]) WITH ORDINALITY AS t(c, i)")
    verdict(f"the site and the database match the same names to the same city ({len(aliases)} other names, "
            f"{len(samples)} names in all)", ok and len(aliases) >= 20 and out.split("|") == js_keys,
            f"node: {proc.stderr[:200]} db: {err[:200]} differ: "
            f"{[(s, j, d) for s, j, d in zip(samples, js_keys, out.split('|')) if j != d]}")
    names = cities + ["Frankfurt a.M.", "St. John's", "L'Aquila", "Frankfurt/Main", "São Paulo", "दिल्ली", "Köln",
                      "pay-courier.com", "wa.me/x", "Berlin 2", "x", "Delhi!", "@home", "Rio de Janeiro (RJ)"]
    proc = subprocess.run(["node", "--input-type=module", "-e",
                           "import { cityProblem } from './src/content/travel.js';"
                           f"console.log(JSON.stringify({json.dumps(names)}.map((n) => !cityProblem(n))))"],
                          cwd=os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."),
                          capture_output=True, text=True)
    js_ok = json.loads(proc.stdout) if proc.returncode == 0 else []
    ok, out, err = psql("SELECT string_agg(private.travel_city_ok(c)::text, '|' ORDER BY i) FROM unnest(ARRAY["
                        + ", ".join("'" + c.replace("'", "''") + "'" for c in names) + "]) WITH ORDINALITY AS t(c, i)")
    db_ok = [v == "true" for v in out.split("|")] if ok else []
    verdict("... and take the same city names (and refuse the same ones)", db_ok == js_ok and db_ok.count(False) == 6,
            f"node: {proc.stderr[:200]} db: {err[:200]} differ: {[(n, j, d) for n, j, d in zip(names, js_ok, db_ok) if j != d]}")

    # --- deleting an account; running the migration again ------------------------------------------------
    gone = post(wen, trip("offer", "Bonn", "Delhi", 9))
    check("deleting an account deletes its trips and its record of the rules", f"""
          DELETE FROM auth.users WHERE id = '{wen}';
          SELECT (SELECT count(*) FROM travel_posts WHERE id = '{gone}') + (SELECT count(*) FROM private.travel_rules_ack
            WHERE user_id = '{wen}')""", expect="0")
    ok, _, err = psql(open(TRAVEL_BOARD, encoding="utf-8").read())
    verdict("the migration can be run again", ok, err[:300])
    check("... and still asks for the rules before a post", trip("offer", "Berlin", "Mumbai", 10), as_user=yash,
          error_has="row-level security")


def ambassador_panel():
    """The ambassador panel: the agreement accepted once per version, who may
    use each function (only the city's ambassador, able to take part, with
    the current agreement), newcomers and welcomes, open questions, the city
    group's description and starter post, meetups hosted by the city
    ambassador, flags to the team, stepping down, our team's view, clean-up
    and "Download my data": migration 20261027000000_ambassador_panel."""
    import difflib
    root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
    # The sections before ran some older migrations again (the travel board's,
    # the member fixes'), which replace functions and triggers this one
    # changes (the clean-up, "Download my data", the events' protected
    # columns): run it again so the database is as after every migration.
    with open(AMBASSADOR_PANEL, encoding="utf-8") as f:
        ok, _, err = psql(f.read())
    if not ok:
        sys.exit("the ambassador panel migration failed: " + err)
    amy, kai, ned, obi, pia, quy, rex, sam, tia, kim =(f"00000000-0000-0000-0000-0000000010{n:02d}" for n in range(1, 11))
    dus, kiel = "50000000-0000-0000-0000-0000000000d1", "50000000-0000-0000-0000-0000000000d2"
    for uid, mail, name, city in ((amy, "amy.d@example.com", "Amy D", "Düsseldorf"), (kai, "kai.k@example.com", "Kai K", "Kiel"),
                                  (ned, "ned.d@example.com", "Ned N", "Düsseldorf"), (obi, "obi.d@example.com", "Obi O", "Düsseldorf"),
                                  (pia, "pia.d@example.com", "Pia P", "Düsseldorf"), (rex, "rex.d@example.com", "Rex R", "Düsseldorf"),
                                  (sam, "sam.d@example.com", "Sam S", "Düsseldorf"), (tia, "tia.d@example.com", "Tia T", "Düsseldorf"),
                                  (kim, "kim.k@example.com", "Kim K", "Kiel")):
        approved_member(uid, mail, name, city=city)
    # quy sent his details but our team hasn't approved him yet.
    sign_up(quy, "quy.d@example.com", {"full_name": "Quy Q"}, accept_terms=True)
    ok, _, err = psql(f"""
      UPDATE profile_private SET verification_status = 'pending', submitted_at = now() WHERE id = '{quy}';
      INSERT INTO groups (id, name, description, category, is_approved) VALUES
        ('{dus}', 'Indians in Düsseldorf', 'Community for Indians living in Düsseldorf.', 'City', true),
        ('{kiel}', 'Indians in Kiel', 'Community for Indians living in Kiel.', 'City', true);
      -- Who joined which group when: rex 40 days ago, tia 10, pia 4, obi 3,
      -- ned 2 and quy 1; sam and amy long ago.
      INSERT INTO group_members (group_id, user_id, joined_at) VALUES
        ('{dus}', '{amy}', now() - interval '200 days'), ('{dus}', '{sam}', now() - interval '60 days'),
        ('{dus}', '{rex}', now() - interval '40 days'), ('{dus}', '{tia}', now() - interval '10 days'),
        ('{dus}', '{pia}', now() - interval '4 days'), ('{dus}', '{obi}', now() - interval '3 days'),
        ('{dus}', '{ned}', now() - interval '2 days'), ('{dus}', '{quy}', now() - interval '1 day'),
        ('{kiel}', '{kai}', now() - interval '100 days'), ('{kiel}', '{kim}', now() - interval '5 days')""")
    if not ok:
        sys.exit("ambassador panel setup failed: " + err)

    def made(uid, sql):
        ok, out, err = psql(sql, "authenticated", uid)
        if not ok:
            sys.exit(f"ambassador panel setup failed: {err}")
        return out.splitlines()[-1]

    made(ADMIN, f"SELECT public.admin_set_ambassador('{amy}', 'Düsseldorf')")
    made(ADMIN, f"SELECT public.admin_set_ambassador('{kai}', 'Kiel')")
    # obi blocked amy; amy blocked pia.
    made(obi, f"SELECT public.block_member('{amy}')")
    made(amy, f"SELECT public.block_member('{pia}')")
    ned_post = made(ned, f"INSERT INTO posts (user_id, content, group_id) VALUES (auth.uid(), 'Hello from Ned, new in Düsseldorf!', '{dus}') RETURNING id")
    tia_post = made(tia, f"INSERT INTO posts (user_id, content, group_id) VALUES (auth.uid(), 'Cheap SIM cards, DM me.', '{dus}') RETURNING id")
    amy_post = made(amy, f"INSERT INTO posts (user_id, content, group_id) VALUES (auth.uid(), 'Start here: welcome to Indians in Düsseldorf.', '{dus}') RETURNING id")
    kim_post = made(kim, f"INSERT INTO posts (user_id, content, group_id) VALUES (auth.uid(), 'Moin from Kiel.', '{kiel}') RETURNING id")
    feed_post = made(ned, "INSERT INTO posts (user_id, content) VALUES (auth.uid(), 'A post in the main feed.') RETURNING id")
    soon = "to_char(private.today_in_germany() + 14, 'YYYY-MM-DD')"
    event = lambda title, city: (f"INSERT INTO events (title, date, city, location, organizer_id) VALUES ('{title}', {soon}, "
                                 f"'{city}', 'Rheinpark, {city}', auth.uid()) RETURNING id")
    amy_event = made(amy, event("Chai meetup", "Düsseldorf"))
    claims = lambda uid: json.dumps({"sub": uid, "role": "authenticated"})
    accept = "SELECT public.accept_ambassador_agreement('2026-10-27') ->> 'accepted'"
    status = ("SELECT concat_ws('|', s->>'city', s->>'version', s->>'accepted', s->>'can_take_part', s->>'group_id' IS NOT NULL) "
              "FROM public.ambassador_status() s")
    newcomers = "SELECT string_agg(name || ':' || welcomed, ',' ORDER BY joined_at DESC) FROM public.ambassador_new_members()"
    mark = lambda uid, on="true": f"SELECT public.ambassador_mark_welcomed('{uid}', {on})"
    describe = lambda text: f"SELECT public.ambassador_update_group('{text}') ->> 'description'"
    hosted = f"SELECT ambassador_hosted FROM events WHERE id = '{amy_event}'"
    why = "Selling fake visa appointments in the group."
    flag = lambda kind, target, category="spam", words=why: (
        f"SELECT public.ambassador_flag('{kind}', '{target}', '{category}', '{words}')")
    logged = lambda uid, action: (f"SELECT count(*) FROM private.ambassador_log WHERE ambassador_id = '{uid}' "
                                  f"AND action = '{action}'")
    panel_calls = {
        "the overview": "SELECT public.ambassador_overview() IS NOT NULL",
        "the newcomers": "SELECT count(*) FROM public.ambassador_new_members()",
        "welcomes": mark(ned),
        "the open questions": "SELECT count(*) FROM public.ambassador_open_questions()",
        "the group's description": describe("A friendly group for Indians in the city."),
        "meetups": f"SELECT public.set_event_ambassador_hosted('{amy_event}', true)",
        "flags": flag("post", ned_post) + " IS NOT NULL",
    }

    # --- the agreement ------------------------------------------------------------
    with open(os.path.join(root, "src", "content", "ambassador.js"), encoding="utf-8") as f:
        ambassador_js = f.read()
    check("the site shows the version of the agreement the database asks for (AMBASSADOR_AGREEMENT_VERSION)",
          "SELECT private.ambassador_agreement_version()",
          expect=re.search(r'export const AMBASSADOR_AGREEMENT_VERSION = "([^"]+)"', ambassador_js).group(1))
    for call in ("ambassador_status()", "accept_ambassador_agreement('2026-10-27')", "ambassador_overview()",
                 "ambassador_new_members()", "ambassador_open_questions()", "ambassador_step_down()",
                 "admin_ambassador_activity()"):
        check(f"signed-out visitors can't call {call.split('(')[0]}", f"SELECT public.{call}", role="anon",
              error_has="permission denied")
    check("a member who isn't an ambassador: no city, the agreement not accepted", status, as_user=sam,
          expect="2026-10-27|false|true|f")
    check("amy, Düsseldorf's ambassador: her city and its group, the agreement not accepted yet", status, as_user=amy,
          expect="Düsseldorf|2026-10-27|false|true|t")
    for what, sql in panel_calls.items():
        check(f"before she accepts the agreement, the panel refuses: {what}", sql, as_user=amy,
              error_has="Please read and accept the ambassador agreement first")
        check(f"... and refuses a member who isn't an ambassador: {what}", sql, as_user=sam,
              error_has="Only a city ambassador can do this.")
    check("... pinning the starter post needs the agreement too", f"SELECT public.pin_group_post('{dus}', '{amy_post}')",
          as_user=amy, error_has="Please read and accept the ambassador agreement first")
    check("... and a member who isn't an ambassador can't accept it", accept, as_user=sam,
          error_has="Only a city ambassador can accept")
    check("accepting another version of the agreement is refused", "SELECT public.accept_ambassador_agreement('2026-01-01')",
          as_user=amy, error_has="agreement has changed")
    check("amy accepts the agreement", accept, as_user=amy, expect="true")
    check("... accepting again keeps when she first did; it's logged once", f"""
          CREATE TEMP TABLE first_ack AS SELECT accepted_at FROM private.ambassador_agreement_ack WHERE user_id = '{amy}';
          SET ROLE authenticated; SELECT set_config('request.jwt.claims', '{claims(amy)}', false) IS NOT NULL;
          {accept}; RESET ROLE;
          SELECT (SELECT accepted_at FROM private.ambassador_agreement_ack WHERE user_id = '{amy}') = (SELECT accepted_at FROM first_ack),
            ({logged(amy, 'agreement')})""", expect="t\ntrue\nt|1")
    check("... her status says so", status, as_user=amy, expect="Düsseldorf|2026-10-27|true|true|t")
    for table in ("ambassador_agreement_ack", "ambassador_log", "ambassador_welcomes"):
        check(f"members can't read private.{table}", f"SELECT count(*) FROM private.{table}", as_user=amy,
              error_has="permission denied")
    check("... nor record an agreement themselves", "INSERT INTO private.ambassador_agreement_ack (user_id, version) "
          "VALUES (auth.uid(), '2026-10-27')", as_user=kai, error_has="permission denied")
    check("kai, Kiel's ambassador, accepts it too", accept, as_user=kai, expect="true")

    # --- the city at a glance, newcomers and welcomes -------------------------------------
    overview = ("SELECT concat_ws('|', o->>'city', o->'group'->>'name', o->'group'->>'members', o->>'new_7d', o->>'new_30d', "
                "o->>'events_upcoming', o->'events'->0->>'title', o->>'open_questions', o->>'unanswered', o->>'welcomed_30d') "
                "FROM public.ambassador_overview() o")
    check("the overview: her city, its group and members, newcomers in 7 and 30 days, upcoming events, open questions",
          overview, as_user=amy, expect="Düsseldorf|Indians in Düsseldorf|8|1|2|1|Chai meetup|0|0|0")
    check("... kai's is Kiel's", overview, as_user=kai, expect="Kiel|Indians in Kiel|2|1|1|0|0|0|0")
    check("newcomers: who joined in the last 30 days, newest first; not the ambassador herself, members either of the "
          "two blocked, accounts members don't see, or another city's members", newcomers, as_user=amy,
          expect="Ned N:false,Tia T:false")
    check("... the last 7 days", "SELECT string_agg(name, ',') FROM public.ambassador_new_members(7)", as_user=amy,
          expect="Ned N")
    check("... never more than 30 days back", "SELECT count(*) FROM public.ambassador_new_members(365)", as_user=amy,
          expect="2")
    check("... with only what members already see (name, photo, when they joined) and her welcome",
          "SELECT bool_and(to_jsonb(n) - 'id' - 'name' - 'avatar_url' - 'joined_at' - 'welcomed' = '{}'::jsonb) "
          "FROM public.ambassador_new_members() n", as_user=amy, expect="t")
    check("kai sees Kiel's newcomers only", newcomers, as_user=kai, expect="Kim K:false")
    check("amy marks ned as welcomed", f"{mark(ned)}; {newcomers}", as_user=amy, expect="t\nNed N:true,Tia T:false")
    check("... again changes nothing", f"{mark(ned)}", as_user=amy, expect="t")
    check("... (one welcome kept)", f"SELECT count(*) FROM private.ambassador_welcomes WHERE member_id = '{ned}'", expect="1")
    for who, uid in (("a member who joined more than 30 days ago", rex), ("a member of another city's group", kim),
                     ("a member who blocked her", obi), ("a member she blocked", pia),
                     ("an account members don't see", quy)):
        check(f"she can't mark {who}", mark(uid), as_user=amy, error_has="isn't one of the newcomers")
    check("kai can't mark Düsseldorf's newcomers", mark(ned), as_user=kai, error_has="isn't one of the newcomers")
    check("taking a welcome back", f"{mark(tia)}; {mark(tia, 'false')}; {newcomers}", as_user=amy,
          expect="t\nf\nNed N:true,Tia T:false")
    check("the overview counts her welcomes", "SELECT o->>'welcomed_30d' FROM public.ambassador_overview() o", as_user=amy,
          expect="1")

    # --- open questions from the city ------------------------------------------------------
    ask = lambda title: f"INSERT INTO help_requests (user_id, title, description) VALUES (auth.uid(), '{title}', 'Any tips?') RETURNING id"
    q_tia = made(tia, ask("Anmeldung appointment in Düsseldorf?"))
    made(obi, ask("Obi asks: tax adviser?"))
    made(kim, ask("Fish market tips?"))
    made(amy, ask("Amy asks: venue for Diwali?"))
    q_ned = made(ned, ask("Good Indian grocery near Bilk?"))
    answer = made(sam, f"INSERT INTO help_responses (request_id, user_id, content) VALUES ('{q_tia}', auth.uid(), "
                       "'Book online at 7am, new slots appear then.') RETURNING id")
    questions = ("SELECT string_agg(title || ':' || answers || ':' || COALESCE(asker, '-'), ',' ORDER BY created_at DESC) "
                 "FROM public.ambassador_open_questions()")
    check("open questions from the city, newest first, with how many answers and who asked; not her own, nor from "
          "members either of the two blocked, nor another city's", questions, as_user=amy,
          expect="Good Indian grocery near Bilk?:0:Ned N,Anmeldung appointment in Düsseldorf?:1:Tia T")
    check("... the overview counts them, and those with no answer at all",
          "SELECT o->>'open_questions' || '|' || (o->>'unanswered') FROM public.ambassador_overview() o", as_user=amy,
          expect="2|1")
    check("once the asker chooses the best answer the question counts as answered",
          f"UPDATE help_requests SET best_response_id = '{answer}' WHERE id = '{q_tia}' RETURNING status", as_user=tia,
          expect="Resolved")
    check("... and leaves the list", "SELECT string_agg(title, ',') FROM public.ambassador_open_questions()", as_user=amy,
          expect="Good Indian grocery near Bilk?")
    check("kai sees Kiel's questions only", "SELECT string_agg(title, ',') FROM public.ambassador_open_questions()",
          as_user=kai, expect="Fish market tips?")

    # --- the city group: description and starter post --------------------------------------
    check("a description that's too short is refused", describe("Hi there"), as_user=amy, error_has="at least 10 characters")
    check("... and one that's too long", describe("x" * 1001), as_user=amy, error_has="keep the description to 1,000")
    new_text = "Indians in Düsseldorf: chai, cricket and help with the Anmeldung."
    check("amy rewrites her group's description, spaces tidied", describe("  Indians in   Düsseldorf: chai, cricket and help "
          "with the Anmeldung.  "), as_user=amy, expect=new_text)
    check("... logged with the text before and after", "SELECT concat_ws('|', city, detail->>'before', detail->>'after') "
          f"FROM private.ambassador_log WHERE ambassador_id = '{amy}' AND action = 'group_description'",
          expect=f"Düsseldorf|Community for Indians living in Düsseldorf.|{new_text}")
    check("... the same text again changes and logs nothing", f"{describe(new_text)}; RESET ROLE; {logged(amy, 'group_description')}",
          as_user=amy, expect=f"{new_text}\n1")
    check("... line breaks kept, at most one empty line in a row",
          "SELECT replace(public.ambassador_update_group(E'First line\\r\\n\\r\\n\\r\\n\\r\\nSecond line') ->> 'description', E'\\n', '/')",
          as_user=amy, expect="First line//Second line")
    check("kai's change goes to Kiel's group, not Düsseldorf's", f"""
          {describe('Moin! Indians in Kiel meet at the Förde.')}; RESET ROLE;
          SELECT string_agg(replace(description, E'\\n', '/'), '|' ORDER BY name) FROM groups WHERE id IN ('{dus}', '{kiel}')""",
          as_user=kai, expect="Moin! Indians in Kiel meet at the Förde.\nFirst line//Second line|Moin! Indians in Kiel meet at the Förde.")
    check("members still can't change a group directly", f"UPDATE groups SET description = 'hacked' WHERE id = '{dus}' RETURNING 1",
          as_user=amy, expect="")
    check("20 changes a day", f"""
          BEGIN;
          INSERT INTO private.rate_log (member_id, action) SELECT '{amy}', 'ambassador_group' FROM generate_series(1, 20);
          SET ROLE authenticated; SELECT set_config('request.jwt.claims', '{claims(amy)}', true) IS NOT NULL;
          {describe(new_text)};
          ROLLBACK;""", error_has="doing that too often")
    check("amy pins her starter post", f"SELECT public.pin_group_post('{dus}', '{amy_post}'); "
          f"SELECT pinned_post_id FROM groups WHERE id = '{dus}'", as_user=amy, expect=amy_post)
    check("... the overview shows it", "SELECT o->'group'->'pinned_post'->>'content' || '|' || (o->'group'->'pinned_post'->>'author') "
          "FROM public.ambassador_overview() o", as_user=amy, expect="Start here: welcome to Indians in Düsseldorf.|Amy D")
    check("kai can't pin in Düsseldorf's group", f"SELECT public.pin_group_post('{dus}', '{ned_post}')", as_user=kai,
          error_has="Only the city's ambassador can pin")
    check("... nor a member", f"SELECT public.pin_group_post('{dus}', '{ned_post}')", as_user=sam,
          error_has="Only the city's ambassador can pin")
    check("... nor can amy pin a post from another group", f"SELECT public.pin_group_post('{dus}', '{kim_post}')", as_user=amy,
          error_has="isn't in this group")
    check("amy unpins it", f"SELECT public.pin_group_post('{dus}', NULL); SELECT pinned_post_id IS NULL FROM groups WHERE id = '{dus}'",
          as_user=amy, expect="t")
    check("... both logged", "SELECT string_agg(action || ':' || (detail->>'post_id'), ',' ORDER BY at) FROM private.ambassador_log "
          f"WHERE ambassador_id = '{amy}' AND action IN ('pin', 'unpin')", expect=f"pin:{amy_post},unpin:{amy_post}")
    check("admins pin in any group, as before", f"SELECT public.pin_group_post('{kiel}', '{kim_post}'); "
          f"SELECT pinned_post_id FROM groups WHERE id = '{kiel}'", as_user=ADMIN, expect=kim_post)

    # --- meetups hosted by the city ambassador ----------------------------------------------
    check("a member can't create an event marked as hosted by the city ambassador",
          f"INSERT INTO events (title, date, city, organizer_id, ambassador_hosted) VALUES ('Diwali party', {soon}, "
          "'Düsseldorf', auth.uid(), true) RETURNING ambassador_hosted", as_user=amy, expect="f")
    check("... nor mark one by editing it", f"UPDATE events SET ambassador_hosted = true WHERE id = '{amy_event}' "
          "RETURNING ambassador_hosted", as_user=amy, expect="f")
    check("amy marks her meetup in Düsseldorf", f"SELECT public.set_event_ambassador_hosted('{amy_event}', true); {hosted}",
          as_user=amy, expect="t\nt")
    check("... members see the mark", hosted, as_user=sam, expect="t")
    check("... and so does her overview", "SELECT e->>'ambassador_hosted' FROM public.ambassador_overview() o, "
          f"jsonb_array_elements(o->'events') e WHERE e->>'id' = '{amy_event}'", as_user=amy, expect="true")
    sam_event = made(sam, event("Cricket in the park", "Düsseldorf"))
    check("she can't mark another member's event", f"SELECT public.set_event_ambassador_hosted('{sam_event}', true)",
          as_user=amy, error_has="only mark events you organise")
    amy_kiel = made(amy, event("Kiel Week trip", "Kiel"))
    check("... nor her own event in another city", f"SELECT public.set_event_ambassador_hosted('{amy_kiel}', true)",
          as_user=amy, error_has="Only an event in Düsseldorf")
    kai_dus = made(kai, event("Kai visits Düsseldorf", "Düsseldorf"))
    check("kai can't mark his event in Düsseldorf", f"SELECT public.set_event_ambassador_hosted('{kai_dus}', true)",
          as_user=kai, error_has="Only an event in Kiel")
    check("moving the meetup to another city takes the mark off", f"UPDATE events SET city = 'Köln' WHERE id = '{amy_event}' "
          "RETURNING ambassador_hosted", as_user=amy, expect="f")
    check("... back in Düsseldorf she marks it again", f"UPDATE events SET city = 'Dusseldorf' WHERE id = '{amy_event}'; "
          f"SELECT public.set_event_ambassador_hosted('{amy_event}', true)", as_user=amy, expect="t")
    check("... and can take it off", f"SELECT public.set_event_ambassador_hosted('{amy_event}', false); "
          f"SELECT public.set_event_ambassador_hosted('{amy_event}', true)", as_user=amy, expect="f\nt")
    check("... each logged", f"SELECT ({logged(amy, 'meetup')}) || '|' || ({logged(amy, 'meetup_off')})", expect="3|1")

    # --- flag to the team -----------------------------------------------------------------------
    flagged = lambda kind, target, show: (f"CREATE TEMP TABLE flagged AS {flag(kind, target)} AS id; "
                                          f"SELECT {show} FROM reports r JOIN flagged f ON f.id = r.id")
    check("amy flags ned's post in the city group: a report marked with her city, about ned, waiting for our team",
          flagged("post", ned_post, f"concat_ws('|', r.content_type, r.ambassador_city, r.reported_user_id = '{ned}', "
                  f"r.category, r.status, r.good_faith, r.explanation = '{why}')"), as_user=amy,
          expect="post|Düsseldorf|t|spam|pending|t|t")
    check("... every admin is told in the app", f"SELECT count(*) > 0 FROM notifications WHERE user_id = '{ADMIN}' AND type = 'alert' "
          "AND text LIKE 'The ambassador of Düsseldorf flagged a post to our team.%'", expect="t")
    check("... our team sees the mark", f"SELECT ambassador_city FROM reports WHERE reported_post_id = '{ned_post}' "
          f"AND reporter_id = '{amy}'", as_user=ADMIN, expect="Düsseldorf")
    check("... and it's logged", logged(amy, "flag"), expect="1")
    check("she can't flag a post outside the city group", flag("post", feed_post), as_user=amy, error_has="only what is in your city")
    check("... nor one in another city's group", flag("post", kim_post), as_user=amy, error_has="only what is in your city")
    check("... nor a member of another city's group", flag("profile", kim), as_user=amy, error_has="only what is in your city")
    check("... nor her own post", flag("post", amy_post), as_user=amy, error_has="your own content")
    check("... nor without one of the report form's reasons", flag("post", tia_post, category="nonsense"), as_user=amy,
          error_has="choose what the problem is")
    check("... nor without saying why", flag("post", tia_post, words="Bad"), as_user=amy, error_has="10 to 1,000 characters")
    check("kai can't flag what is in Düsseldorf", flag("post", tia_post), as_user=kai, error_has="only what is in your city")
    for kind, target, what in (("profile", rex, "a member of the city group"), ("help", q_ned, "a question from the city"),
                               ("event", sam_event, "an event in the city"), ("answer", answer, "an answer to a question from the city")):
        check(f"amy can flag {what}", flagged(kind, target, "r.content_type || '|' || r.ambassador_city"), as_user=amy,
              expect=f"{kind}|Düsseldorf")
    check("an open report of hers about the same item becomes the flag (one open report per member and item)", f"""
          INSERT INTO reports (reporter_id, reported_post_id, reason, content_type, category, explanation, good_faith)
            VALUES (auth.uid(), '{tia_post}', '[POST] Cheap SIM — Spam', 'post', 'spam', 'The same advert again and again.', true);
          SELECT count(*) FROM reports WHERE reporter_id = auth.uid() AND reported_post_id = '{tia_post}' AND ambassador_city = '';
          SELECT {flag('post', tia_post, 'harassment', 'Insulting members who asked about it.')[7:]} IS NOT NULL;
          SELECT string_agg(ambassador_city || ':' || category, ',') FROM reports WHERE reporter_id = auth.uid()
            AND reported_post_id = '{tia_post}'""", as_user=amy, expect="1\nt\nDüsseldorf:harassment")
    check("members can't mark their own reports as flags",
          f"INSERT INTO reports (reporter_id, reported_post_id, reason, content_type, category, explanation, good_faith, "
          f"ambassador_city) VALUES (auth.uid(), '{ned_post}', '[POST] Hello — Spam', 'post', 'spam', 'Spam spam spam spam.', "
          "true, 'Düsseldorf') RETURNING ambassador_city = ''", as_user=sam, expect="t")
    check("flags count towards the limit of 20 reports a day", f"""
          BEGIN;
          INSERT INTO private.rate_log (member_id, action) SELECT '{amy}', 'report' FROM generate_series(1, 20);
          SET ROLE authenticated; SELECT set_config('request.jwt.claims', '{claims(amy)}', true) IS NOT NULL;
          {flag('profile', tia)};
          ROLLBACK;""", error_has="doing that too often")
    check("ambassadors can't remove anything: admin_moderate stays our team's", f"SELECT {moderate('post', tia_post, 'remove')}",
          as_user=amy, error_has="Admins only")

    # --- our team's view ------------------------------------------------------------------------
    check("members can't see the ambassadors' activity", "SELECT public.admin_ambassador_activity()", as_user=sam,
          error_has="Admins only")
    check("admins see each ambassador with the agreement they accepted, and what they did", f"""
          SELECT concat_ws('|',
            (SELECT string_agg(a->>'name' || '=' || (a->>'city') || '/' || (a->>'agreement_version') || '/' || (a->>'current')
               || '/' || (a->>'agreement_accepted_at' IS NOT NULL) || '/' || (a->>'welcomed_30d')
               || '/' || ((a->>'since')::timestamptz > now() - interval '1 hour'), ',' ORDER BY a->>'city')
             FROM jsonb_array_elements(r->'ambassadors') a WHERE a->>'id' IN ('{amy}', '{kai}')),
            (SELECT string_agg(DISTINCT l->>'action', ',' ORDER BY l->>'action') FROM jsonb_array_elements(r->'log') l
             WHERE l->>'ambassador_id' = '{amy}'),
            r->>'version')
          FROM (SELECT public.admin_ambassador_activity(500) r) x""", as_user=ADMIN,
          expect="Amy D=Düsseldorf/2026-10-27/true/true/1/true,Kai K=Kiel/2026-10-27/true/true/0/true|"
                 "agreement,flag,group_description,meetup,meetup_off,pin,unpin|2026-10-27")

    # --- who may use the panel ------------------------------------------------------------------
    check("an ambassador who accepted an earlier version of the agreement is asked again", f"""
          BEGIN;
          UPDATE private.ambassador_agreement_ack SET version = '2026-01-01' WHERE user_id = '{kai}';
          SET ROLE authenticated; SELECT set_config('request.jwt.claims', '{claims(kai)}', true) IS NOT NULL;
          {status};
          SELECT public.ambassador_overview();
          ROLLBACK;""", error_has="Please read and accept the ambassador agreement first")
    check("... (her status)", f"""
          BEGIN;
          UPDATE private.ambassador_agreement_ack SET version = '2026-01-01' WHERE user_id = '{kai}';
          SET ROLE authenticated; SELECT set_config('request.jwt.claims', '{claims(kai)}', true) IS NOT NULL;
          {status};
          ROLLBACK;""", expect="t\nKiel|2026-10-27|false|true|t")
    check("an ambassador who can't take part (still on Terms from before the Art. 9 consent) is refused", f"""
          BEGIN;
          UPDATE profile_private SET terms_version = '2026-10' WHERE id = '{kai}';
          SET ROLE authenticated; SELECT set_config('request.jwt.claims', '{claims(kai)}', true) IS NOT NULL;
          SELECT public.ambassador_overview();
          ROLLBACK;""", error_has="can't take part on NRIClub right now")
    check("... as is a blocked one, even if the role were still set", f"""
          BEGIN;
          ALTER TABLE public.profile_private DISABLE TRIGGER end_ambassador_when_inactive;
          UPDATE profile_private SET status = 'blocked' WHERE id = '{kai}';
          SET ROLE authenticated; SELECT set_config('request.jwt.claims', '{claims(kai)}', true) IS NOT NULL;
          {flag('profile', kim)};
          ROLLBACK;""", error_has="can't take part on NRIClub right now")
    check("... and can't accept the agreement either", f"""
          BEGIN;
          ALTER TABLE public.profile_private DISABLE TRIGGER end_ambassador_when_inactive;
          UPDATE profile_private SET status = 'blocked' WHERE id = '{kai}';
          SET ROLE authenticated; SELECT set_config('request.jwt.claims', '{claims(kai)}', true) IS NOT NULL;
          {accept};
          ROLLBACK;""", error_has="can't take part on NRIClub right now")
    check("a newcomer our team blocks leaves the list", f"{block(tia)}", as_user=ADMIN, expect="blocked")
    check("... (amy's newcomers)", newcomers, as_user=amy, expect="Ned N:true")

    # --- stepping down ------------------------------------------------------------------------------
    check("amy steps down", "SELECT public.ambassador_step_down(); SELECT ambassador_city = '' FROM profiles WHERE id = auth.uid()",
          as_user=amy, expect="Düsseldorf\nt")
    check("... her meetup isn't hosted by the city ambassador any more", hosted, as_user=sam, expect="f")
    check("... it's logged, and every admin is told", f"SELECT ({logged(amy, 'step_down')}) || '|' || (SELECT count(*) > 0 "
          f"FROM notifications WHERE user_id = '{ADMIN}' AND type = 'alert' "
          "AND text = 'Amy D stepped down as the ambassador for Düsseldorf. See Ambassadors in the admin panel.')", expect="1|true")
    check("... the panel is closed to her", "SELECT public.ambassador_overview()", as_user=amy,
          error_has="Only a city ambassador can do this.")
    check("... and pinning too", f"SELECT public.pin_group_post('{dus}', '{amy_post}')", as_user=amy,
          error_has="Only the city's ambassador can pin")
    check("... her status has no city", status, as_user=amy, expect="2026-10-27|true|true|f")
    check("... stepping down again says she isn't one", "SELECT public.ambassador_step_down()", as_user=amy,
          error_has="You aren't a city ambassador.")
    check("... as for any member", "SELECT public.ambassador_step_down()", as_user=sam, error_has="You aren't a city ambassador.")
    check("... and our team no longer lists her", "SELECT count(*) FROM jsonb_array_elements(public.admin_ambassador_activity() "
          f"-> 'ambassadors') a WHERE a->>'id' = '{amy}'", as_user=ADMIN, expect="0")
    check("blocking an ambassador ends the role, and the panel with it",
          f"{block(kai)}; SELECT ambassador_city FROM profiles WHERE id = '{kai}'", as_user=ADMIN, expect="blocked")
    check("... (kai)", "SELECT public.ambassador_overview()", as_user=kai, error_has="Only a city ambassador can do this.")

    # --- clean-up ------------------------------------------------------------------------------------
    check("the clean-up deletes the ambassadors' log and their welcomes 12 months after each entry", f"""
          BEGIN;
          INSERT INTO private.ambassador_log (ambassador_id, city, action, at) VALUES
            ('{kai}', 'Kiel', 'pin', now() - interval '13 months'), ('{kai}', 'Kiel', 'unpin', now() - interval '11 months');
          INSERT INTO private.ambassador_welcomes (ambassador_id, member_id, at) VALUES
            ('{kai}', '{rex}', now() - interval '13 months'), ('{kai}', '{sam}', now() - interval '11 months');
          SELECT concat_ws('|', r->>'ambassador_log', r->>'ambassador_welcomes', r ? 'travel_posts') FROM (SELECT private.daily_cleanup() r) x;
          SELECT concat_ws('|', (SELECT string_agg(action, ',') FROM private.ambassador_log WHERE ambassador_id = '{kai}' AND city = 'Kiel'
              AND action IN ('pin', 'unpin')),
            (SELECT string_agg(member_id::text, ',') FROM private.ambassador_welcomes WHERE ambassador_id = '{kai}'));
          ROLLBACK;""", expect=f"1|1|t\nunpin|{sam}")
    old = function_source(TRAVEL_BOARD, "CREATE OR REPLACE FUNCTION private.daily_cleanup()").splitlines()
    new = function_source(AMBASSADOR_PANEL, "CREATE OR REPLACE FUNCTION private.daily_cleanup()").splitlines()
    removed = [l[2:] for l in difflib.ndiff(old, new) if l.startswith("- ")]
    verdict("private.daily_cleanup() is its 2026-10-26 version with lines added only",
            removed == ["    || jsonb_build_object('travel_posts', travel);"], f"removed: {removed}")
    old = function_source(TRAVEL_BOARD, "CREATE OR REPLACE FUNCTION public.export_my_data()").splitlines()
    new = function_source(AMBASSADOR_PANEL, "CREATE OR REPLACE FUNCTION public.export_my_data()").splitlines()
    removed = [l[2:] for l in difflib.ndiff(old, new) if l.startswith("- ")]
    verdict("export_my_data() is its 2026-10-26 version with lines added only", set(removed) <= {"  );"}, f"removed: {removed}")

    # --- "Download my data" ----------------------------------------------------------------------------
    check("\"Download my data\": the agreement she accepted, the newcomers she welcomed and what she did as ambassador", """
          SELECT concat_ws('|', jsonb_array_length(d->'ambassador_agreement'), d->'ambassador_agreement'->0->>'version',
            jsonb_array_length(d->'ambassador_welcomes_given'),
            (SELECT string_agg(DISTINCT l->>'action', ',' ORDER BY l->>'action') FROM jsonb_array_elements(d->'ambassador_log') l),
            (SELECT count(*) FROM jsonb_array_elements(d->'reports_filed') r WHERE r->>'ambassador_city' = 'Düsseldorf') >= 6)
          FROM (SELECT public.export_my_data() d) x""", as_user=amy,
          expect="1|2026-10-27|1|agreement,flag,group_description,meetup,meetup_off,pin,step_down,unpin|t")
    check("... and ned's says when an ambassador welcomed him",
          "SELECT jsonb_array_length(d->'welcomed_by_your_city_ambassador') FROM (SELECT public.export_my_data() d) x",
          as_user=ned, expect="1")

    # --- deleting accounts; the one-off file; running the migration again -------------------------------
    check("deleting an account deletes the welcomes either way, the log and the record of the agreement", f"""
          DELETE FROM auth.users WHERE id = '{ned}';
          SELECT count(*) FROM private.ambassador_welcomes WHERE member_id = '{ned}';
          DELETE FROM auth.users WHERE id = '{amy}';
          SELECT (SELECT count(*) FROM private.ambassador_log WHERE ambassador_id = '{amy}')
            + (SELECT count(*) FROM private.ambassador_agreement_ack WHERE user_id = '{amy}')
            + (SELECT count(*) FROM private.ambassador_welcomes WHERE ambassador_id = '{amy}')""", expect="0\n0")
    check("... her flags stay with our team, still marked (no longer linked to her)",
          "SELECT count(*) >= 6 FROM reports WHERE reporter_id IS NULL AND ambassador_city = 'Düsseldorf'", expect="t")
    with open(os.path.join(root, "supabase", "oneoff", "2026-10-27-ambassador-panel", "run_in_sql_editor.sql"),
              encoding="utf-8") as f:
        oneoff = f.read()
    marker = "-- ==== 20261027000000_ambassador_panel.sql ====\n"
    with open(AMBASSADOR_PANEL, encoding="utf-8") as f:
        migration = f.read()
    guard = oneoff[:oneoff.index(marker)] if marker in oneoff else ""
    verdict("the one-off file is its guard (after the travel board, once) and then the migration as it is",
            marker in oneoff and oneoff[oneoff.index(marker) + len(marker):] == migration
            and "to_regclass('public.travel_posts') IS NULL" in guard
            and "to_regclass('private.ambassador_agreement_ack') IS NOT NULL" in guard, "the file differs")
    ok, _, err = psql(migration)
    verdict("the migration can be run again", ok, err[:300])
    check("... and members still can't mark events themselves",
          f"INSERT INTO events (title, date, city, organizer_id, ambassador_hosted) VALUES ('Holi', {soon}, 'Kiel', "
          "auth.uid(), true) RETURNING ambassador_hosted", as_user=kim, expect="f")


if __name__ == "__main__":
    main()
