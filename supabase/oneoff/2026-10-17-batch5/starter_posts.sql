-- A pinned "Start here" post from the NRIClub team in every city group that
-- has members (written in the name of the first admin). It shows at the top
-- of its group, not in everyone's Home feed. Run it after the Batch 5 file.
-- Safe to run again later, when more cities have members: groups that
-- already have a pinned post, or already got this welcome post, are left
-- alone, and an ambassador can pin their own post instead at any time.
WITH admin AS (
  SELECT a.user_id FROM public.admins a JOIN public.profiles p ON p.id = a.user_id
  ORDER BY a.created_at LIMIT 1
),
target AS (
  SELECT g.id, substr(g.name, 12) AS city FROM public.groups g, admin
  WHERE g.is_approved AND g.category = 'City' AND g.name LIKE 'Indians in %'
    AND g.pinned_post_id IS NULL AND g.members_count > 0
    AND NOT EXISTS (SELECT 1 FROM public.posts x
                    WHERE x.group_id = g.id AND x.user_id = admin.user_id AND x.content LIKE 'Welcome to Indians in %')
),
ins AS (
  INSERT INTO public.posts (user_id, content, group_id)
  SELECT admin.user_id, format($p$Welcome to Indians in %1$s 🙏

This is the place to meet Indians who live in %1$s and help each other.

Start here:
• Say hello below: where you're from in India, how long you've been in %1$s, and one tip for newcomers.
• Ask anything in Ask & Guides: housing, visas, doctors, where to buy atta. Members in %1$s see open questions on their home page.
• Add the Indian groceries, restaurants, temples and doctors you trust in the Places tab.
• See what's on in Events, or host the first meetup.
• New in town? Read "Your first weeks abroad: a checklist" in Guides.

Would you like to bring Indians in %1$s together? Become our %1$s ambassador: write to hello@nriclub.app.

The NRIClub team$p$, t.city), t.id
  FROM admin, target t
  RETURNING id, group_id
)
UPDATE public.groups g SET pinned_post_id = ins.id FROM ins WHERE g.id = ins.group_id;
