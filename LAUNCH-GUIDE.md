# IndIn Launch Guide — Step by Step

## What You Have

| File | What it is |
|------|-----------|
| `supabase-migration.sql` | Creates all 13 database tables, security policies, triggers, storage buckets, and seed data |
| `src/supabaseApi.js` | Backend API layer — 50+ functions for auth, posts, messages, groups, events, marketplace, etc. |
| `src/App.jsx` | Complete frontend — integrated with real Supabase DB calls |
| `src/main.jsx` | React entry point |
| `index.html` | HTML shell |
| `package.json` | Project dependencies |
| `vite.config.js` | Build config |

---

## STEP 1: Set Up Supabase Database (5 minutes)

1. Open your Supabase project dashboard:
   https://supabase.com/dashboard/project/uzzkdmybsbwknpsucuvv

2. Click **SQL Editor** in the left sidebar

3. Click **New Query**

4. Open the `supabase-migration.sql` file, select all (Ctrl+A), copy (Ctrl+C)

5. Paste into the SQL Editor

6. Click **Run** (or press Ctrl+Enter)

7. You will see a warning: "Query has destructive operations" — this is normal and safe. Click **"Run this query"**

8. You should see "Success. No rows returned" — all tables are now created

---

## STEP 2: Configure Supabase Authentication (3 minutes)

1. In Supabase dashboard, go to **Authentication** → **Providers**

2. Click on **Email**

3. Make sure these are set:
   - ✅ Enable Email provider = ON
   - ✅ Confirm email = ON
   - ✅ Secure email change = ON
   - Minimum password length = **8**

4. Go to **Authentication** → **URL Configuration**

5. For now, set Site URL to: `http://localhost:3000`
   (You'll update this after Vercel deployment)

---

## STEP 3: Verify Realtime is Enabled (1 minute)

1. Go to **Database** → **Replication** in Supabase dashboard

2. Check that the `supabase_realtime` publication includes:
   - `messages`
   - `notifications`  
   - `posts`

   (The migration SQL should have done this automatically)

---

## STEP 4: Install Git and Node.js (if not already installed)

- **Node.js**: Download from https://nodejs.org (LTS version)
- **Git**: Download from https://git-scm.com

Verify installation:
```
node --version    (should show v18+ or v20+)
npm --version     (should show 9+ or 10+)
git --version     (should show 2.x)
```

---

## STEP 5: Create the Project on Your Computer (5 minutes)

1. Create a new folder on your computer called `indin`

2. Place all the project files in this structure:
```
indin/
├── index.html
├── package.json
├── vite.config.js
└── src/
    ├── main.jsx
    ├── App.jsx
    └── supabaseApi.js
```

3. Open a terminal/command prompt in the `indin` folder

4. Run:
```
npm install
```
This installs React, Vite, and other dependencies.

5. Test locally:
```
npm run dev
```
Open http://localhost:3000 in your browser. You should see the IndIn landing page.

6. Try signing up with a real email — you should receive an OTP email from Supabase.

---

## STEP 6: Push to GitHub (3 minutes)

1. Create a new repository on GitHub:
   - Go to https://github.com/new
   - Name: `indin`
   - Keep it Public or Private (your choice)
   - Do NOT add README, .gitignore, or license (we'll push our own files)
   - Click **Create repository**

2. In your terminal (inside the `indin` folder):
```
git init
git add .
git commit -m "IndIn social network - launch ready"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/indin.git
git push -u origin main
```

Replace `YOUR_USERNAME` with your actual GitHub username.

---

## STEP 7: Deploy to Vercel (3 minutes)

1. Go to https://vercel.com and sign in with GitHub

2. Click **"Add New..."** → **"Project"**

3. Find and select your `indin` repository

4. Vercel will auto-detect it as a Vite project. Settings should show:
   - Framework Preset: **Vite**
   - Build Command: `npm run build`
   - Output Directory: `dist`

5. Click **Deploy**

6. Wait 1-2 minutes. Vercel will build and deploy your site.

7. You'll get a URL like: `https://indin-abc123.vercel.app`
   This is your live website!

---

## STEP 8: Update Supabase with Your Live URL (2 minutes)

1. Copy your Vercel URL (e.g., `https://indin-abc123.vercel.app`)

2. Go back to Supabase dashboard → **Authentication** → **URL Configuration**

3. Update:
   - **Site URL**: `https://indin-abc123.vercel.app`
   - **Redirect URLs**: Add `https://indin-abc123.vercel.app/**`

4. Click **Save**

---

## STEP 9: Add a Custom Domain (Optional)

If you own a domain like `indin.com`:

1. In Vercel dashboard → your project → **Settings** → **Domains**

2. Add your domain (e.g., `indin.com` or `app.indin.com`)

3. Vercel will give you DNS records to add at your domain registrar

4. After DNS propagates (5-30 minutes), update Supabase URLs to match your custom domain

---

## STEP 10: Final Testing Checklist

Test each feature with a real email:

- [ ] Sign up → receive OTP email → verify → land on dashboard
- [ ] Log out → log back in with same email/password
- [ ] Create a post → appears in feed
- [ ] Like a post → count updates
- [ ] Join a community → member count updates
- [ ] RSVP to an event → attendee count updates
- [ ] Open Messages → send a message (need 2 accounts to test)
- [ ] Post a marketplace listing
- [ ] Create a doc
- [ ] Click notification bell → see notifications
- [ ] Click settings gear → open each settings modal
- [ ] Test on mobile browser → responsive layout works

---

## Architecture Summary

```
User's Browser
     │
     ▼
┌─────────────────┐
│  Vercel (Free)   │  ← Static hosting, auto-deploys from GitHub
│  React Frontend  │
└────────┬────────┘
         │ HTTPS API calls
         ▼
┌─────────────────────────────┐
│  Supabase (Free Tier)        │
│                              │
│  ✦ Auth (email + password)   │  ← User signup/login/OTP
│  ✦ PostgreSQL Database       │  ← All data: posts, users, groups...
│  ✦ Row Level Security        │  ← Users can only edit own data
│  ✦ Realtime WebSockets       │  ← Live messages & notifications
│  ✦ Storage Buckets           │  ← Profile photos, post images
│  ✦ Auto Triggers             │  ← Like/comment/member counts
└─────────────────────────────┘
```

## Free Tier Limits

**Vercel Free:**
- 100 GB bandwidth/month
- Unlimited deployments
- Custom domains included

**Supabase Free:**
- 500 MB database
- 1 GB file storage
- 50,000 monthly active users
- 2 GB bandwidth
- Unlimited API requests

These limits are more than enough for thousands of active users to start.

---

## Troubleshooting

**"No account found" on login:**
→ Make sure you ran the SQL migration. The `profiles` table auto-creates a profile when a user signs up.

**OTP email not arriving:**
→ Check spam folder. Supabase free tier uses their default email sender. For production, set up a custom SMTP in Supabase → Settings → Auth → SMTP.

**"Permission denied" errors:**
→ RLS policies might not have been created. Re-run the migration SQL.

**Site shows blank page after deploy:**
→ Check Vercel build logs. Most likely a missing dependency — run `npm install` locally and verify `npm run build` works before pushing.

**Data not persisting:**
→ Check browser console for error messages. Usually means the Supabase URL or anon key is wrong, or the tables don't exist yet.
