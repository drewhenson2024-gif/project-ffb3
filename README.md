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

3. Run the database migrations in the Supabase SQL Editor (in order):

- `supabase/migrations/002_player_fantasy_schema.sql`
- `supabase/migrations/003_drop_prototype_teams.sql`
- `supabase/migrations/004_player_identity_metadata.sql`
- `supabase/migrations/005_fix_refresh_career_stats.sql`
- `supabase/migrations/006_expand_draft_history.sql`

4. Import nflverse draft + fantasy data (drafts 1980+, stats 2000–2025):

```bash
npm run import:data
```

Then refresh career totals in the SQL Editor:

```sql
select refresh_player_career_stats();
```

Data source: [nflverse](https://github.com/nflverse/nflverse-data). Draft picks cover 1980+ so veterans drafted before 2000 link correctly to their 2000+ fantasy stats.

5. Start the dev server:

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
