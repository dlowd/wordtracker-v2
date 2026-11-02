# Word Tracker

A NaNoWriMo word-count tracker, live at https://tracker.marylowd.com.

Writers sign in with an emailed magic link. Words, projects, and preferences are stored in Supabase. Each project gets a graph with a pace line. When an earlier project exists, the graph also shows last year's progress. Milestones unlock kitten photos.

## Develop

```sh
npm ci
npm run dev
```

`.env.local` must set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. It is not committed.

## Deploy

```sh
scripts/deploy.sh
```

This builds `dist/` and rsyncs it to the VPS. Hosting, DNS, and the Supabase dashboard settings are documented in `~/Projects/web/docs/tracker.md`.

## Projects across years

The app shows the user's latest project. From two weeks before the next November, a finished project is kept and a fresh one is created beside it. The previous project becomes the "last year" line.

## Reward photos

`public/rewards/kitten/` holds 61 photos from Wikimedia Commons. Their licenses are public domain, CC0, CC BY, or CC BY-SA. `js/rewards-manifest.js` lists each photo's credit and source page. The photo viewer shows that credit, and it must stay visible there.
