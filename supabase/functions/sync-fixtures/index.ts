import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ── Configuration ─────────────────────────────────────────────
// These environment variables are injected automatically by Supabase.
// FOOTBALL_DATA_API_KEY is one we set manually via the CLI.
const FOOTBALL_API_KEY = Deno.env.get('FOOTBALL_DATA_API_KEY')!
const COMPETITION_ID   = '2000'  // FIFA World Cup on football-data.org
const API_BASE         = 'https://api.football-data.org/v4'

// Supabase now provides secret keys as a JSON dictionary
const secretKeys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}')
const serviceRoleKey = Object.values(secretKeys)[0] as string

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  serviceRoleKey
)

// ── Helper: fetch from football-data.org ──────────────────────
async function footballFetch(path: string) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'X-Auth-Token': FOOTBALL_API_KEY },
  })

  if (res.status === 429) {
    throw new Error('Rate limited by football-data.org')
  }

  if (!res.ok) {
    throw new Error(`football-data.org returned ${res.status} for ${path}`)
  }

  return res.json()
}

// ── Main handler ──────────────────────────────────────────────
// Deno.serve is how Edge Functions receive HTTP requests.
// Supabase calls this function on the cron schedule you set.
Deno.serve(async (_req) => {
  console.log('sync-fixtures: starting at', new Date().toISOString())

  try {
    // ── Step 1: Sync Teams ────────────────────────────────────
    // football-data.org returns: { teams: [{ id, name, tla, crest }] }
    const teamsResponse = await footballFetch(
      `/competitions/${COMPETITION_ID}/teams`
    )

    const teamRows = teamsResponse.teams.map((t: any) => ({
      id:        t.tla,    // 3-letter code: 'ENG', 'BRA'
      api_id:    t.id,     // numeric ID from football-data.org
      name:      t.name,
      crest_url: t.crest,
      group_id:  null,     // patched from match data below
    }))

    const { error: teamsError } = await supabase
      .from('teams')
      .upsert(teamRows, { onConflict: 'id' })

    if (teamsError) {
      console.error('Teams sync error:', teamsError.message)
    } else {
      console.log(`Synced ${teamRows.length} teams`)
    }

    // ── Step 2: Sync Fixtures & Results ───────────────────────
    // football-data.org returns: { matches: [{ id, utcDate,
    //   status, stage, group, matchday, homeTeam, awayTeam, score }] }
    const matchesResponse = await footballFetch(
      `/competitions/${COMPETITION_ID}/matches`
    )

    const fixtureRows = matchesResponse.matches.map((m: any) => ({
      api_id:       m.id,
      home_team_id: m.homeTeam.tla,
      away_team_id: m.awayTeam.tla,
      kickoff_time: m.utcDate,
      stage:        m.stage,
      // "Group A" → "A", null for knockout rounds
      group_id:     m.group
        ? m.group.replace('Group ', '').replace('GROUP_', '')
        : null,
      matchday:     m.matchday ?? null,
      home_score:   m.score?.fullTime?.home ?? null,
      away_score:   m.score?.fullTime?.away ?? null,
      status:       m.status,
    }))

    const { error: fixturesError } = await supabase
      .from('fixtures')
      .upsert(fixtureRows, { onConflict: 'api_id' })

    if (fixturesError) {
      console.error('Fixtures sync error:', fixturesError.message)
    } else {
      console.log(`Synced ${fixtureRows.length} fixtures`)
    }

    // ── Step 3: Patch team group_id from match data ───────────
    // The teams endpoint doesn't include group info — matches do.
    // Build a map of team → group from group stage matches.
    const teamGroupMap: Record<string, string> = {}
    for (const match of matchesResponse.matches) {
      if (!match.group) continue
      const groupLetter = match.group
        .replace('Group ', '')
        .replace('GROUP_', '')
      teamGroupMap[match.homeTeam.tla] = groupLetter
      teamGroupMap[match.awayTeam.tla] = groupLetter
    }

    for (const [teamId, groupLetter] of Object.entries(teamGroupMap)) {
      await supabase
        .from('teams')
        .update({ group_id: groupLetter })
        .eq('id', teamId)
    }
    console.log(`Patched group_id for ${Object.keys(teamGroupMap).length} teams`)

    // ── Step 4: Sync Group Standings ──────────────────────────
    // Standings aren't available before the tournament starts —
    // wrap in try/catch so the rest of the sync still works.
    try {
      const standingsResponse = await footballFetch(
        `/competitions/${COMPETITION_ID}/standings`
      )

      const standingRows: any[] = []
      for (const groupData of standingsResponse.standings) {
        const groupLetter = groupData.group
          ? groupData.group.replace('Group ', '').replace('GROUP_', '')
          : 'A'

        for (const entry of groupData.table) {
          standingRows.push({
            group_id:      groupLetter,
            team_id:       entry.team.tla,
            position:      entry.position,
            played:        entry.playedGames,
            won:           entry.won,
            drawn:         entry.draw,  // note: API uses "draw" not "drawn"
            lost:          entry.lost,
            goals_for:     entry.goalsFor,
            goals_against: entry.goalsAgainst,
            goal_diff:     entry.goalDifference,
            points:        entry.points,
            updated_at:    new Date().toISOString(),
          })
        }
      }

      if (standingRows.length > 0) {
        const { error: standingsError } = await supabase
          .from('standings')
          .upsert(standingRows, { onConflict: 'group_id,team_id' })

        if (standingsError) {
          console.error('Standings sync error:', standingsError.message)
        } else {
          console.log(`Synced ${standingRows.length} standing rows`)
        }
      }
    } catch (standingsErr) {
      // Normal before the tournament starts
      console.log('Standings not yet available:', standingsErr)
    }

    return new Response('Sync complete', { status: 200 })

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('sync-fixtures failed:', message)
    return new Response(`Error: ${message}`, { status: 500 })
  }
})