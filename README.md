# NRIClub

A social network for the Indian diaspora: a members' feed, Namaste
connections, city communities, events, a marketplace, docs, help requests and
messaging, plus an admin panel for approving members and moderating content.

Built with React + Vite on Supabase (Auth, Postgres with row-level security,
Realtime, Storage), deployed on Vercel.

```
cp .env.example .env   # Supabase URL + anon key
npm install
npm run dev            # http://localhost:3000
```

Set-up, deployment, admin accounts, testing and the tasks to finish before
inviting the public: see [LAUNCH-GUIDE.md](LAUNCH-GUIDE.md).
Database changes for the live project are applied by hand from
[supabase/oneoff/](supabase/oneoff/); each folder's README says how and in
which order.
Known issues planned for later phases: [docs/BACKLOG.md](docs/BACKLOG.md).
