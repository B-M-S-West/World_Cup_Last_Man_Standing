import postgres from 'npm:postgres'

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false })

const FOOTBALL_API_KEY = Deno.env.get('FOOTBALL_DATA_API_KEY')!
const COMPETITION_ID   = '2000'
const API_BASE         = 'https://api.football-data.org/v4'

async function footballFetch(path: string) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'X-Auth-Token': FOOTBALL_API_KEY },
  })
  if (res.status === 429) throw new Error('Rate limited')
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json()
}

Deno.serve(async (_req) => {
  console.log('sync-fixtures: starting at', new Date().toISOString())

  try {
    // ── Step 1: Sync Teams from /teams endpoint ───────────────
    const teamsResponse = await footballFetch(`/competitions/${COMPETITION_ID}/teams`)

    for (const t of teamsResponse.teams) {
      await sql`
        INSERT INTO teams (id, api_id, name, crest_url)
        VALUES (${t.tla}, ${t.id}, ${t.name}, ${t.crest})
        ON CONFLICT (id) DO UPDATE SET
          api_id    = EXCLUDED.api_id,
          name      = EXCLUDED.name,
          crest_url = EXCLUDED.crest_url
      `
    }
    console.log(`Synced ${teamsResponse.teams.length} teams`)

    // ── Step 2: Fetch matches (used for fixtures + ensuring all teams exist) ──
    const matchesResponse = await footballFetch(`/competitions/${COMPETITION_ID}/matches`)

    // Ensure every team referenced in a match exists before inserting fixtures
    const matchTeams = new Map<string, { tla: string; name: string }>()
    for (const m of matchesResponse.matches) {
      if (m.homeTeam?.tla) matchTeams.set(m.homeTeam.tla, m.homeTeam)
      if (m.awayTeam?.tla) matchTeams.set(m.awayTeam.tla, m.awayTeam)
    }

    for (const [tla, team] of matchTeams) {
      await sql`
        INSERT INTO teams (id, name)
        VALUES (${tla}, ${team.name ?? tla})
        ON CONFLICT (id) DO NOTHING
      `
    }
    console.log(`Ensured all match teams exist`)

    // ── Step 3: Sync Fixtures ─────────────────────────────────
    for (const m of matchesResponse.matches) {
      const groupId = m.group
        ? m.group.replace('Group ', '').replace('GROUP_', '')
        : null

      await sql`
        INSERT INTO fixtures (
          api_id, home_team_id, away_team_id, kickoff_time,
          stage, group_id, matchday, home_score, away_score, status,
          home_placeholder, away_placeholder
        )
        VALUES (
          ${m.id}, ${m.homeTeam.tla}, ${m.awayTeam.tla}, ${m.utcDate},
          ${m.stage}, ${groupId}, ${m.matchday ?? null},
          ${m.score?.fullTime?.home ?? null},
          ${m.score?.fullTime?.away ?? null},
          ${m.status},
          ${m.homeTeam.tla ? null : (m.homeTeam.name ?? null)},
          ${m.awayTeam.tla ? null : (m.awayTeam.name ?? null)}
        )
        ON CONFLICT (api_id) DO UPDATE SET
          home_team_id = EXCLUDED.home_team_id,
          away_team_id = EXCLUDED.away_team_id,
          home_score   = EXCLUDED.home_score,
          away_score   = EXCLUDED.away_score,
          status       = EXCLUDED.status,
          kickoff_time = EXCLUDED.kickoff_time,
          home_placeholder = CASE
            WHEN EXCLUDED.home_placeholder IS NOT NULL THEN EXCLUDED.home_placeholder
            ELSE fixtures.home_placeholder
          END,
          away_placeholder = CASE
            WHEN EXCLUDED.away_placeholder IS NOT NULL THEN EXCLUDED.away_placeholder
            ELSE fixtures.away_placeholder
          END
      `
    }
    console.log(`Synced ${matchesResponse.matches.length} fixtures`)

    // ── Step 4: Patch team group_id from match data ───────────
    for (const m of matchesResponse.matches) {
      if (!m.group) continue
      const groupLetter = m.group.replace('Group ', '').replace('GROUP_', '')
      await sql`UPDATE teams SET group_id = ${groupLetter} WHERE id = ${m.homeTeam.tla} AND group_id IS NULL`
      await sql`UPDATE teams SET group_id = ${groupLetter} WHERE id = ${m.awayTeam.tla} AND group_id IS NULL`
    }
    console.log('Patched group_id for teams')

    // ── Step 5: Sync Standings ────────────────────────────────
    try {
      const standingsResponse = await footballFetch(`/competitions/${COMPETITION_ID}/standings`)

      for (const groupData of standingsResponse.standings) {
        const groupLetter = groupData.group
          ? groupData.group.replace('Group ', '').replace('GROUP_', '')
          : 'A'

        for (const entry of groupData.table) {
          await sql`
            INSERT INTO standings (
              group_id, team_id, position, played, won, drawn,
              lost, goals_for, goals_against, goal_diff, points, updated_at
            )
            VALUES (
              ${groupLetter}, ${entry.team.tla}, ${entry.position},
              ${entry.playedGames}, ${entry.won}, ${entry.draw},
              ${entry.lost}, ${entry.goalsFor}, ${entry.goalsAgainst},
              ${entry.goalDifference}, ${entry.points}, NOW()
            )
            ON CONFLICT (group_id, team_id) DO UPDATE SET
              position      = EXCLUDED.position,
              played        = EXCLUDED.played,
              won           = EXCLUDED.won,
              drawn         = EXCLUDED.drawn,
              lost          = EXCLUDED.lost,
              goals_for     = EXCLUDED.goals_for,
              goals_against = EXCLUDED.goals_against,
              goal_diff     = EXCLUDED.goal_diff,
              points        = EXCLUDED.points,
              updated_at    = NOW()
          `
        }
      }
      console.log('Synced standings')
    } catch (e) {
      console.log('Standings not yet available:', e)
    }

    await sql.end()
    return new Response('Sync complete', { status: 200 })

  } catch (err) {
    await sql.end()
    const message = err instanceof Error ? err.message : String(err)
    console.error('sync-fixtures failed:', message)
    return new Response(`Error: ${message}`, { status: 500 })
  }
})