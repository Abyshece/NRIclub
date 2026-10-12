-- Starter data for a fresh NRIclub project (run after the migrations).
-- Supabase CLI runs this automatically on `supabase db reset`.

-- Default city communities
INSERT INTO public.groups (name, description, category, members_count, is_approved) VALUES
  ('Indians in Aachen', 'Community for Indians living in Aachen.', 'City', 850, true),
  ('Indians in Augsburg', 'Community for Indians living in Augsburg.', 'City', 620, true),
  ('Indians in Berlin', 'The largest community of Indians living in Berlin. Join for housing leads and meetups.', 'City', 12500, true),
  ('Indians in Bielefeld', 'Community for Indians living in Bielefeld.', 'City', 480, true),
  ('Indians in Bochum', 'Community for Indians living in Bochum.', 'City', 560, true),
  ('Indians in Bonn', 'Community for Indians living in Bonn.', 'City', 920, true),
  ('Indians in Braunschweig', 'Community for Indians living in Braunschweig.', 'City', 710, true),
  ('Indians in Bremen', 'Community for Indians living in Bremen.', 'City', 980, true),
  ('Indians in Chemnitz', 'Community for Indians living in Chemnitz.', 'City', 340, true),
  ('Indians in Cologne', 'Community for Indians living in Cologne.', 'City', 3200, true),
  ('Indians in Darmstadt', 'Community for Indians living in Darmstadt.', 'City', 1800, true),
  ('Indians in Dortmund', 'Community for Indians living in Dortmund.', 'City', 1400, true),
  ('Indians in Dresden', 'Community for Indians living in Dresden.', 'City', 1600, true),
  ('Indians in Duisburg', 'Community for Indians living in Duisburg.', 'City', 780, true),
  ('Indians in Düsseldorf', 'Community for Indians living in Düsseldorf.', 'City', 2800, true),
  ('Indians in Erlangen', 'Community for Indians living in Erlangen.', 'City', 1200, true),
  ('Indians in Essen', 'Community for Indians living in Essen.', 'City', 1100, true),
  ('Indians in Frankfurt', 'Community for Indians living in Frankfurt.', 'City', 8500, true),
  ('Indians in Freiburg', 'Community for Indians living in Freiburg.', 'City', 920, true),
  ('Indians in Göttingen', 'Community for Indians living in Göttingen.', 'City', 680, true),
  ('Indians in Hamburg', 'Community for Indians living in Hamburg.', 'City', 6200, true),
  ('Indians in Hannover', 'Community for Indians living in Hannover.', 'City', 2400, true),
  ('Indians in Heidelberg', 'Community for Indians living in Heidelberg.', 'City', 1500, true),
  ('Indians in Ingolstadt', 'Community for Indians living in Ingolstadt.', 'City', 950, true),
  ('Indians in Jena', 'Community for Indians living in Jena.', 'City', 520, true),
  ('Indians in Karlsruhe', 'Community for Indians living in Karlsruhe.', 'City', 1800, true),
  ('Indians in Kassel', 'Community for Indians living in Kassel.', 'City', 640, true),
  ('Indians in Kiel', 'Community for Indians living in Kiel.', 'City', 480, true),
  ('Indians in Leipzig', 'Community for Indians living in Leipzig.', 'City', 1300, true),
  ('Indians in Leverkusen', 'Community for Indians living in Leverkusen.', 'City', 420, true),
  ('Indians in Lübeck', 'Community for Indians living in Lübeck.', 'City', 350, true),
  ('Indians in Magdeburg', 'Community for Indians living in Magdeburg.', 'City', 460, true),
  ('Indians in Mainz', 'Community for Indians living in Mainz.', 'City', 880, true),
  ('Indians in Mannheim', 'Community for Indians living in Mannheim.', 'City', 1600, true),
  ('Indians in Mönchengladbach', 'Community for Indians living in Mönchengladbach.', 'City', 380, true),
  ('Indians in Munich', 'Community for Indians living in Munich.', 'City', 9800, true),
  ('Indians in Münster', 'Community for Indians living in Münster.', 'City', 1100, true),
  ('Indians in Nuremberg', 'Community for Indians living in Nuremberg.', 'City', 2100, true),
  ('Indians in Offenbach', 'Community for Indians living in Offenbach.', 'City', 580, true),
  ('Indians in Oldenburg', 'Community for Indians living in Oldenburg.', 'City', 420, true),
  ('Indians in Osnabrück', 'Community for Indians living in Osnabrück.', 'City', 380, true),
  ('Indians in Paderborn', 'Community for Indians living in Paderborn.', 'City', 520, true),
  ('Indians in Potsdam', 'Community for Indians living in Potsdam.', 'City', 640, true),
  ('Indians in Regensburg', 'Community for Indians living in Regensburg.', 'City', 720, true),
  ('Indians in Rostock', 'Community for Indians living in Rostock.', 'City', 340, true),
  ('Indians in Saarbrücken', 'Community for Indians living in Saarbrücken.', 'City', 480, true),
  ('Indians in Stuttgart', 'Community for Indians living in Stuttgart.', 'City', 5600, true),
  ('Indians in Ulm', 'Community for Indians living in Ulm.', 'City', 680, true),
  ('Indians in Wiesbaden', 'Community for Indians living in Wiesbaden.', 'City', 780, true),
  ('Indians in Wolfsburg', 'Community for Indians living in Wolfsburg.', 'City', 920, true)
ON CONFLICT (name) DO NOTHING;

-- Example events
INSERT INTO public.events (title, description, date, location, attendees_count, organizer_name) VALUES
  ('Holi Festival 2026', 'Celebrate the festival of colors with fellow Indians in NYC!', 'Mar 25, 2026 • 10:00 AM', 'Central Park, New York', 450, 'NYC Desi Club'),
  ('Networking Night: Tech', 'Connect with Indian tech professionals working in Germany.', 'Apr 10, 2026 • 6:00 PM', 'WeWork, Berlin', 120, 'Indian Professionals DE'),
  ('Bollywood Movie Night', 'Watch the latest Bollywood blockbuster together!', 'Apr 15, 2026 • 7:00 PM', 'Hoyts Cinema, Melbourne', 85, 'Melbourne Desi Club')
ON CONFLICT DO NOTHING;
