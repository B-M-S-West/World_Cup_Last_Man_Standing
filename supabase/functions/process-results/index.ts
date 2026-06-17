import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

// Runs every 10 minutes via cron schedule.
// Finds picks attached to finished fixtures that don't have
// a result yet, scores them as win/draw/loss, then eliminates
// any players who drew or lost.
Deno.serve(async (_req) => {
  console.log('process-results: running at', new Date().toISOString())

  try {
    // Find picks where:
    //   - result is NULL (not yet processed)
    //   - the attached fixture is FINISHED with scores
    const { data: pendingPicks, error: fetchError } = await supabase
      .from('picks')
      .select(`
        id,
        player_id,
        team_id,
        fixture:fixtures!inner (
          id,
          status,
          home_team_id,
          away_team_id,
          home_score,
          away_score
        )
      `)
      .is('result', null)

    if (fetchError) {
      console.error('Error fetching pending picks:', fetchError.message)
      return new Response(`Error: ${fetchError.message}`, { status: 500 })
    }

    if (!pendingPicks || pendingPicks.length === 0) {
      console.log('No pending picks to process')
      return new Response('No pending picks', { status: 200 })
    }

    // Filter down to only picks where the fixture is finished with scores
    const processable = pendingPicks.filter((pick: any) => {
      const f = pick.fixture
      return (
        f.status === 'FINISHED' &&
        f.home_score !== null &&
        f.away_score !== null
      )
    })

    if (processable.length === 0) {
      console.log(`Found ${pendingPicks.length} pending picks but no finished fixtures yet`)
      return new Response('No finished fixtures to process', { status: 200 })
    }

    console.log(`Processing ${processable.length} picks`)

    const playerIdsToEliminate: string[] = []
    let processedCount = 0

    for (const pick of processable) {
      const fixture    = pick.fixture as any
      const homeScore  = fixture.home_score as number
      const awayScore  = fixture.away_score as number
      const isHomePick = pick.team_id === fixture.home_team_id

      // Work out the result from the picked team's perspective
      let result: 'win' | 'draw' | 'loss'

      if (homeScore === awayScore) {
        // A draw eliminates in LMS regardless of which team was picked
        result = 'draw'
      } else if (isHomePick) {
        result = homeScore > awayScore ? 'win' : 'loss'
      } else {
        result = awayScore > homeScore ? 'win' : 'loss'
      }

      // Save the result on this pick
      const { error: pickUpdateError } = await supabase
        .from('picks')
        .update({ result })
        .eq('id', pick.id)

      if (pickUpdateError) {
        console.error(`Error updating pick ${pick.id}:`, pickUpdateError.message)
        continue
      }

      processedCount++
      console.log(`Pick ${pick.id}: ${pick.team_id} → ${result} (${homeScore}–${awayScore})`)

      // Queue elimination for draws and losses
      if (result !== 'win') {
        playerIdsToEliminate.push(pick.player_id)
      }
    }

    // Eliminate all players who lost or drew in one query
    if (playerIdsToEliminate.length > 0) {
      const uniqueIds = [...new Set(playerIdsToEliminate)]

      const { error: eliminateError } = await supabase
        .from('players')
        .update({ is_active: false })
        .in('id', uniqueIds)

      if (eliminateError) {
        console.error('Error eliminating players:', eliminateError.message)
      } else {
        console.log(`Eliminated ${uniqueIds.length} player(s)`)
      }
    }

    const summary = `Processed ${processedCount} picks, eliminated ${playerIdsToEliminate.length} player(s)`
    console.log(summary)
    return new Response(summary, { status: 200 })

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('process-results failed:', message)
    return new Response(`Error: ${message}`, { status: 500 })
  }
})