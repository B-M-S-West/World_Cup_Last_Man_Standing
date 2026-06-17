import postgres from 'npm:postgres'

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false })

Deno.serve(async (_req) => {
  console.log('reveal-picks: running at', new Date().toISOString())

  try {
    const now            = new Date()
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000)

    const result = await sql`
      UPDATE picks
      SET revealed = true
      WHERE revealed = false
        AND fixture_id IN (
          SELECT id FROM fixtures
          WHERE kickoff_time >= ${now.toISOString()}
            AND kickoff_time <= ${oneHourFromNow.toISOString()}
            AND status = 'SCHEDULED'
        )
      RETURNING id
    `

    const message = `Revealed ${result.length} picks`
    console.log(message)
    await sql.end()
    return new Response(message, { status: 200 })

  } catch (err) {
    await sql.end()
    const message = err instanceof Error ? err.message : String(err)
    console.error('reveal-picks failed:', message)
    return new Response(`Error: ${message}`, { status: 500 })
  }
})