# project-ffb3

Fantasy Football league standings app built with Next.js and Supabase.

## Stack

- **Frontend:** Next.js, React, Tailwind CSS
- **Database:** Supabase (PostgreSQL)
- **Hosting:** Vercel (coming soon)

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Copy environment variables:

```bash
cp .env.example .env.local
```

Fill in your Supabase URL and API keys from the [Supabase dashboard](https://supabase.com/dashboard).

3. Run the database migration in the Supabase SQL Editor:

- Open `supabase/migrations/001_initial_schema.sql`
- Paste and run it in your project's SQL Editor

4. Start the dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Git workflow

Each feature step is committed separately to keep history easy to follow.

```bash
git add .
git commit -m "Describe your change"
git push
```
