import {
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { supabase } from './supabase'
import type {
  Fixture,
  FixtureStage,
  Player,
  Pick,
  StandingRow,
} from '../types'

// ── Query Keys ────────────────────────────────────────────────
// These strings identify each piece of cached data.
// Invalidating a key tells Query to refetch that data.
// Using a central object means no typos causing cache misses.
export const KEYS = {
  fixtures:    (stage?: FixtureStage) => stage ? ['fixtures', stage] : ['fixtures'],
  groups:      ['groups'] as const,
  players:     ['players'] as const,
  picks:       (round?: number) => round !== undefined ? ['picks', round] : ['picks'],
  myPicks:     ['myPicks'] as const,
  currentUser: ['currentUser'] as const,
}

// ── Current user ──────────────────────────────────────────────
// Returns the logged-in user plus their player record from the DB
export function useCurrentUser() {
  return useQuery({
    queryKey: KEYS.currentUser,
    queryFn: async () => {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) return null

      const { data: player, error: playerError } = await supabase
        .from('players')
        .select('*')
        .eq('id', user.id)
        .single()

      if (playerError) return null
      return { user, player: player as Player }
    },
    staleTime: 1000 * 60 * 5,  // consider fresh for 5 minutes
  })
}

// ── Fixtures ──────────────────────────────────────────────────
// Fetches all fixtures. Pass a stage to filter e.g. 'GROUP_STAGE'.
// The select string with * and the team joins fetches the fixture
// AND the home/away team data in a single database query.
export function useFixtures(stage?: FixtureStage) {
  return useQuery({
    queryKey: KEYS.fixtures(stage),
    queryFn: async () => {
      let query = supabase
        .from('fixtures')
        .select(`
          *,
          home_team:teams!fixtures_home_team_id_fkey(*),
          away_team:teams!fixtures_away_team_id_fkey(*)
        `)
        .order('kickoff_time', { ascending: true })

      if (stage) {
        query = query.eq('stage', stage)
      }

      const { data, error } = await query
      if (error) throw new Error(`Failed to fetch fixtures: ${error.message}`)
      return data as Fixture[]
    },
    staleTime: 1000 * 60,           // 1 minute
    refetchInterval: 1000 * 60 * 2, // silently refetch every 2 minutes
  })
}

// ── Group standings ───────────────────────────────────────────
// Returns standings grouped by letter: { A: [...], B: [...] }
export function useGroups() {
  return useQuery({
    queryKey: KEYS.groups,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('standings')
        .select('*, team:teams(*)')
        .order('group_id', { ascending: true })
        .order('position', { ascending: true })

      if (error) throw new Error(`Failed to fetch standings: ${error.message}`)

      // Transform the flat array into { A: [...], B: [...], ... }
      const grouped: Record<string, StandingRow[]> = {}
      for (const row of (data as StandingRow[])) {
        if (!grouped[row.group_id]) grouped[row.group_id] = []
        grouped[row.group_id].push(row)
      }
      return grouped
    },
    staleTime: 1000 * 60 * 5,
    refetchInterval: 1000 * 60 * 5,
  })
}

// ── All players ───────────────────────────────────────────────
export function usePlayers() {
  return useQuery({
    queryKey: KEYS.players,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('players')
        .select('*')
        .order('username', { ascending: true })

      if (error) throw new Error(`Failed to fetch players: ${error.message}`)
      return data as Player[]
    },
    staleTime: 1000 * 60 * 2,
  })
}

// ── Picks for a round ─────────────────────────────────────────
// RLS means each user automatically only receives:
//   (a) their own picks, AND
//   (b) other players' picks where revealed = true
// The database enforces this — it's not just hidden in the UI.
export function usePicks(round?: number) {
  return useQuery({
    queryKey: KEYS.picks(round),
    queryFn: async () => {
      let query = supabase
        .from('picks')
        .select(`
          *,
          team:teams(*),
          player:players(*),
          fixture:fixtures(*)
        `)
        .order('round', { ascending: true })

      if (round !== undefined) {
        query = query.eq('round', round)
      }

      const { data, error } = await query
      if (error) throw new Error(`Failed to fetch picks: ${error.message}`)
      return data as Pick[]
    },
    // Poll every 30 seconds — catches reveals without needing a page refresh
    refetchInterval: 1000 * 30,
  })
}

// ── Current user's own picks ──────────────────────────────────
// Used on the pick page to show which teams have already been used
export function useMyPicks() {
  return useQuery({
    queryKey: KEYS.myPicks,
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return []

      const { data, error } = await supabase
        .from('picks')
        .select('*, team:teams(*), fixture:fixtures(*)')
        .eq('player_id', user.id)
        .order('round', { ascending: true })

      if (error) throw new Error(`Failed to fetch my picks: ${error.message}`)
      return data as Pick[]
    },
    staleTime: 1000 * 30,
  })
}

// ── Submit or update a pick ───────────────────────────────────
// useMutation handles write operations.
// upsert = insert if new, update if this round already has a pick.
// The UNIQUE(player_id, round) constraint in the DB makes this safe.
export function useSubmitPick() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      fixtureId,
      teamId,
      round,
    }: {
      fixtureId: string
      teamId: string
      round: number
    }) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('You must be logged in to make a pick')

      const { data, error } = await supabase
        .from('picks')
        .upsert(
          {
            player_id:  user.id,
            fixture_id: fixtureId,
            team_id:    teamId,
            round,
            revealed:   false,
          },
          { onConflict: 'player_id,round' }
        )
        .select()

      if (error) throw new Error(`Failed to save pick: ${error.message}`)
      return data
    },
    // After a successful pick, refresh the picks cache so the UI updates
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: KEYS.myPicks })
      queryClient.invalidateQueries({ queryKey: KEYS.picks(variables.round) })
    },
  })
}