# 🏆 WC2026 — Last Man Standing

A full-stack **Last Man Standing** prediction game built for the FIFA World Cup 2026. Players pick one team to win each round — if your team draws or loses, you're eliminated. Last player standing wins the prize pot.

---

## What is Last Man Standing?

Each round, every active player picks one team they think will win their match. Rules:
- Your team **wins** → you survive and move to the next round
- Your team **draws or loses** → you're eliminated
- You can only pick each team **once** across the whole tournament
- Picks are **sealed** (hidden from other players) until 1 hour before kickoff
- Last player remaining wins the **prize pot**

---

## Features

- **Live fixture data** synced from the [football-data.org](https://www.football-data.org/) API
- **Sealed picks** — hidden until 1 hour before kickoff, revealed automatically
- **Group standings** for all 12 groups (A–L)
- **Knockout bracket** visualisation (Last 32 through to the Final)
- **LMS standings** — see every player's pick history and current status
- **Prize pot tracking** — buy-in amounts, carried-over pots from all-out games
- **Admin portal** — manage games, players, payments, and game lifecycle
- **Automatic elimination** — results processed by scheduled Supabase functions

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite |
| Routing | TanStack Router (file-based) |
| Data fetching | TanStack Query (React Query) |
| Backend / DB | Supabase (PostgreSQL + RLS) |
| Edge functions | Deno (Supabase Edge Functions) |
| Hosting | Cloudflare Pages |
| External API | football-data.org v4 |

---

## Project Structure

```
src/
├── lib/
│   ├── supabase.ts        # Supabase client
│   └── queries.ts         # All React Query hooks and mutations
├── routes/
│   ├── __root.tsx         # Root layout, nav, auth guard
│   ├── index.tsx          # Dashboard
│   ├── fixtures.tsx       # Fixtures & results
│   ├── groups.tsx         # Group standings
│   ├── bracket.tsx        # Knockout bracket
│   ├── lms.tsx            # Last Man Standing player view
│   ├── pick.tsx           # Make / update your pick
│   ├── admin.tsx          # Admin portal
│   └── login.tsx          # Login
├── types/
│   └── index.ts           # All TypeScript types and constants
supabase/
└── functions/
    ├── sync-fixtures/     # Pulls live data from football-data.org
    ├── reveal-picks/      # Reveals sealed picks 1 hour before kickoff
    ├── process-results/   # Evaluates picks, eliminates players
    └── admin-create-player/ # Creates new player accounts
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project
- A [football-data.org](https://www.football-data.org/) API key (free tier works)

### Local setup

```bash
git clone https://github.com/your-username/world-cup-last-man-standing.git
cd world-cup-last-man-standing
npm install
```

Create a `.env.local` file:

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

```bash
npm run dev
```

### Supabase Edge Function secrets

Set these in your Supabase project dashboard under Edge Functions → Secrets:

```
FOOTBALL_DATA_API_KEY   # from football-data.org
SUPABASE_DB_URL         # your Supabase direct DB connection string
SUPABASE_SERVICE_ROLE_KEY
```

### Deploy edge functions

```bash
npx supabase functions deploy sync-fixtures --project-ref <your-ref>
npx supabase functions deploy reveal-picks --project-ref <your-ref>
npx supabase functions deploy process-results --project-ref <your-ref>
npx supabase functions deploy admin-create-player --project-ref <your-ref>
```

### Database

You'll need the following tables in Supabase: `teams`, `fixtures`, `standings`, `players`, `games`, `game_players`, `picks`.

Make sure to:
- Enable RLS on all tables
- Grant `SELECT` (and write permissions where needed) to the `authenticated` role
- Grant `SELECT` to the `anon` role for public-read tables

---

## Scheduled Functions

These run automatically via Supabase cron or can be triggered manually:

| Function | Purpose | Suggested schedule |
|---|---|---|
| `sync-fixtures` | Pulls latest fixtures, results, standings from football-data.org | Every 30 min during tournament |
| `reveal-picks` | Reveals sealed picks 1 hour before kickoff | Every hour |
| `process-results` | Evaluates picks against results, eliminates players | Every hour |

Invoke manually:
```bash
npx supabase functions invoke sync-fixtures --project-ref <your-ref>
```

---

## Game Lifecycle

```
Admin creates game
    → Players added with buy-in recorded
    → Each round: players submit sealed picks
    → 1hr before kickoff: picks revealed automatically
    → After match: results processed, losers eliminated
    → Last player standing wins (or "all out" if everyone eliminated)
    → Prize pot carries over to next game if all out
```

---

## License

MIT
