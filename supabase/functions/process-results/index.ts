import postgres from 'npm:postgres'

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false })

Deno.serve(async (_req) => {
  console.log('process-results: running at', new Date().toISOString())

  try {
    // Find picks with no result attached to finished fixtures
    const pendingPicks = await sql`
      SELECT p.id, p.player_id, p.team_id,
             f.home_team_id, f.away_team_id, f.home_score, f.away_score
      FROM picks p
      JOIN fixtures f ON f.id = p.fixture_id
      WHERE p.result IS NULL
        AND f.status = 'FINISHED'
        AND f.home_score IS NOT NULL
        AND f.away_score IS NOT NULL
    `

    if (pendingPicks.length === 0) {
      console.log('No pending picks to process')
      await sql.end()
      return new Response('No pending picks', { status: 200 })
    }

    const toEliminate: string[] = []

    for (const pick of pendingPicks) {
      const isHome = pick.team_id === pick.home_team_id
      let result: 'win' | 'draw' | 'loss'

      if (pick.home_score === pick.away_score) {
        result = 'draw'
      } else if (isHome) {
        result = pick.home_score > pick.away_score ? 'win' : 'loss'
      } else {
        result = pick.away_score > pick.home_score ? 'win' : 'loss'
      }

      await sql`UPDATE picks SET result = ${result} WHERE id = ${pick.id}`

      if (result !== 'win') toEliminate.push(pick.player_id)
    }

    if (toEliminate.length > 0) {
      const unique = [...new Set(toEliminate)]
      await sql`UPDATE players SET is_active = false WHERE id = ANY(${unique})`
      console.log(`Eliminated ${unique.length} players`)

      // Remove any pre-emptive future picks submitted by eliminated players
      // (picks for rounds whose fixtures haven't finished yet)
      const deleted = await sql`
        DELETE FROM picks p
        USING fixtures f
        WHERE p.fixture_id = f.id
          AND p.player_id = ANY(${unique})
          AND p.result IS NULL
          AND f.status NOT IN ('FINISHED', 'IN_PLAY', 'PAUSED')
        RETURNING p.id
      `
      if (deleted.length > 0) {
        console.log(`Removed ${deleted.length} future picks from eliminated players`)
      }
    }

    await sql.end()
    return new Response(`Processed ${pendingPicks.length} picks`, { status: 200 })

  } catch (err) {
    await sql.end()
    const message = err instanceof Error ? err.message : String(err)
    console.error('process-results failed:', message)
    return new Response(`Error: ${message}`, { status: 500 })
  }
})