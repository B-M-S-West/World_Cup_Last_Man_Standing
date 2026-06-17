import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Supabase now provides secret keys as a JSON dictionary
const secretKeys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}')
const serviceRoleKey = Object.values(secretKeys)[0] as string

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  serviceRoleKey
)
// Runs every 15 minutes via cron schedule.
// Finds picks where kickoff is within the next hour
// and sets revealed = true so all players can see them.
Deno.serve(async (_req) => {
  console.log('reveal-picks: running at', new Date().toISOString())

  try {
    const now            = new Date()
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000)

    console.log(`Looking for picks kicking off between now and ${oneHourFromNow.toISOString()}`)

    // Find all unrevealed picks whose fixture kicks off within the next hour.
    // The !inner join means "only return picks that have a matching fixture".
    const { data: picksToReveal, error: fetchError } = await supabase
      .from('picks')
      .select(`
        id,
        fixture:fixtures!inner (
          kickoff_time,
          status
        )
      `)
      .eq('revealed', false)
      .gte('fixture.kickoff_time', now.toISOString())
      .lte('fixture.kickoff_time', oneHourFromNow.toISOString())

    if (fetchError) {
      console.error('Error fetching picks:', fetchError.message)
      return new Response(`Error: ${fetchError.message}`, { status: 500 })
    }

    if (!picksToReveal || picksToReveal.length === 0) {
      console.log('No picks to reveal right now')
      return new Response('No picks to reveal', { status: 200 })
    }

    console.log(`Found ${picksToReveal.length} picks to reveal`)

    // Update all matching picks in one query
    const pickIds = picksToReveal.map((p: any) => p.id)

    const { error: updateError } = await supabase
      .from('picks')
      .update({ revealed: true })
      .in('id', pickIds)

    if (updateError) {
      console.error('Error revealing picks:', updateError.message)
      return new Response(`Error: ${updateError.message}`, { status: 500 })
    }

    const message = `Revealed ${pickIds.length} picks`
    console.log(message)
    return new Response(message, { status: 200 })

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('reveal-picks failed:', message)
    return new Response(`Error: ${message}`, { status: 500 })
  }
})