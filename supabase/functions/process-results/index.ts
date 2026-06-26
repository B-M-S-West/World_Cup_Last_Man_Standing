import postgres from 'npm:postgres'

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false })

Deno.serve(async (_req) => {
  console.log('process-results: running at', new Date().toISOString())

  try {
    // Only process picks for the current active game
    const activeGame = await sql`
      SELECT id FROM games WHERE status = 'active' ORDER BY created_at DESC LIMIT 1
    `

    if (activeGame.length === 0) {
      console.log('No active game — nothing to process')
      await sql.end()
      return new Response('No active game', { status: 200 })
    }

    const gameId = activeGame[0].id

    // Find picks with no result attached to finished fixtures
    const pendingPicks = await sql`
      SELECT p.id, p.player_id, p.team_id,
             f.home_team_id, f.away_team_id, f.home_score, f.away_score
      FROM picks p
      JOIN fixtures f ON f.id = p.fixture_id
      WHERE p.result IS NULL
        AND p.game_id = ${gameId}
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
      const deleted = await sql`
        DELETE FROM picks p
        USING fixtures f
        WHERE p.fixture_id = f.id
          AND p.player_id = ANY(${unique})
          AND p.game_id = ${gameId}
          AND p.result IS NULL
          AND f.status NOT IN ('FINISHED', 'IN_PLAY', 'PAUSED')
        RETURNING p.id
      `
      if (deleted.length > 0) {
        console.log(`Removed ${deleted.length} future picks from eliminated players`)
      }
    }

    // ── Auto-detect game end ──────────────────────────────────
    // Only declare end if there are no more pending picks in this game
    // (some fixtures in this round may still be in progress)
    const stillPending = await sql`
      SELECT p.id FROM picks p
      JOIN fixtures f ON f.id = p.fixture_id
      WHERE p.game_id = ${gameId}
        AND p.result IS NULL
        AND f.status NOT IN ('FINISHED', 'CANCELLED', 'AWARDED')
    `

    if (stillPending.length === 0) {
      const activeInGame = await sql`
        SELECT p.id FROM players p
        JOIN game_players gp ON gp.player_id = p.id AND gp.game_id = ${gameId}
        WHERE p.is_active = true
      `

      if (activeInGame.length === 1) {
        const winnerId = activeInGame[0].id
        await sql`
          UPDATE games SET status = 'won', winner_id = ${winnerId}, ended_at = now()
          WHERE id = ${gameId}
        `
        console.log(`Game ${gameId} won by player ${winnerId}`)
      } else if (activeInGame.length === 0) {
        await sql`
          UPDATE games SET status = 'all_out', ended_at = now()
          WHERE id = ${gameId}
        `
        console.log(`Game ${gameId} ended — all players out`)
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
