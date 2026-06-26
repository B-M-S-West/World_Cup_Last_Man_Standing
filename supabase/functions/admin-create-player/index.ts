import { createClient } from 'npm:@supabase/supabase-js'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  try {
    const supabaseUrl    = Deno.env.get('SUPABASE_URL')!
    const anonKey        = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Verify the caller is an authenticated admin
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response('Unauthorized', { status: 401, headers: CORS })
    }

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: { user: callerUser }, error: authError } = await callerClient.auth.getUser()
    if (authError || !callerUser) {
      return new Response('Unauthorized', { status: 401, headers: CORS })
    }

    const { data: callerPlayer } = await callerClient
      .from('players')
      .select('is_admin')
      .eq('id', callerUser.id)
      .single()

    if (!callerPlayer?.is_admin) {
      return new Response('Forbidden', { status: 403, headers: CORS })
    }

    // Parse request
    const { username, email, gameId } = await req.json() as {
      username: string
      email: string
      gameId?: string
    }

    if (!username?.trim() || !email?.trim()) {
      return new Response('username and email are required', { status: 400, headers: CORS })
    }

    // Use service role for admin operations
    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    // Generate a temporary password
    const tempPassword = Math.random().toString(36).slice(-6).toUpperCase() +
                         Math.random().toString(36).slice(-6) + '1!'

    // Create auth user (email auto-confirmed so they can log in immediately)
    const { data: newUserData, error: createError } = await adminClient.auth.admin.createUser({
      email: email.trim(),
      password: tempPassword,
      email_confirm: true,
      user_metadata: { username: username.trim() },
    })

    if (createError || !newUserData.user) {
      return new Response(
        JSON.stringify({ error: createError?.message ?? 'Failed to create user' }),
        { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    const newUserId = newUserData.user.id

    // Insert player record
    const { error: playerError } = await adminClient
      .from('players')
      .insert({ id: newUserId, username: username.trim(), is_active: false, is_admin: false })

    if (playerError) {
      await adminClient.auth.admin.deleteUser(newUserId)
      return new Response(
        JSON.stringify({ error: playerError.message }),
        { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    // Add to current game if provided
    if (gameId) {
      await adminClient
        .from('game_players')
        .insert({ game_id: gameId, player_id: newUserId, paid: false })
    }

    return new Response(
      JSON.stringify({ userId: newUserId, username, email, tempPassword }),
      { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }
})
