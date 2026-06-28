// Describes a team in the tournament
export type Team = {
  id: string           // 3-letter FIFA code: 'ENG', 'BRA', 'ARG'
  api_id: number | null
  name: string         // 'England', 'Brazil'
  group_id: string | null  // 'A' through 'L', null for knockout-only teams
  crest_url: string | null // Badge image URL from football-data.org
}

// Describes a single match
export type Fixture = {
  id: string
  api_id: number
  home_team_id: string
  away_team_id: string
  kickoff_time: string  // ISO date string e.g. "2026-06-11T19:00:00Z"
  stage: FixtureStage
  group_id: string | null
  matchday: number | null
  home_score: number | null  // null until the match is played
  away_score: number | null
  status: FixtureStatus
  home_placeholder: string | null
  away_placeholder: string | null
  // These are "joined" fields — fetched from the teams table in the same query
  home_team?: Team
  away_team?: Team
}

// Every possible stage value that football-data.org can return
export type FixtureStage =
  | 'GROUP_STAGE'
  | 'LAST_32'
  | 'LAST_16'
  | 'QUARTER_FINALS'
  | 'SEMI_FINALS'
  | 'THIRD_PLACE'
  | 'FINAL'

// Every possible match status from football-data.org
export type FixtureStatus =
  | 'SCHEDULED'
  | 'TIMED'
  | 'IN_PLAY'
  | 'PAUSED'
  | 'FINISHED'
  | 'SUSPENDED'
  | 'POSTPONED'
  | 'CANCELLED'
  | 'AWARDED'

// A row in the group standings table
export type StandingRow = {
  id: string
  group_id: string
  team_id: string
  position: number
  played: number
  won: number
  drawn: number
  lost: number
  goals_for: number
  goals_against: number
  goal_diff: number
  points: number
  updated_at: string
  team?: Team  // joined
}

// A single LMS game (one run of Last Man Standing)
export type Game = {
  id: string
  status: 'active' | 'won' | 'all_out'
  buy_in: number
  carried_over: number
  prize_pot: number
  starting_round: number
  winner_id: string | null
  created_at: string
  ended_at: string | null
  // Joined field — present when queried with winner:players(username)
  winner?: { username: string } | null
}

// A player's entry in a specific game
export type GamePlayer = {
  id: string
  game_id: string
  player_id: string
  paid: boolean
  joined_at: string
  player?: Player
}

// One of your friends playing the game
export type Player = {
  id: string        // matches their Supabase auth user ID
  username: string
  is_active: boolean  // false = eliminated from LMS
  is_admin: boolean   // true = you
}

// A single LMS pick
export type Pick = {
  id: string
  player_id: string
  fixture_id: string
  team_id: string
  round: number      // 1=Group, 2=R32, 3=R16, 4=QF, 5=SF, 6=Final
  revealed: boolean  // true = visible to all players
  result: PickResult | null  // null until match finishes
  created_at: string
  // Joined fields
  team?: Team
  player?: Player
  fixture?: Fixture
}

export type PickResult = 'win' | 'draw' | 'loss'

// Maps football-data.org stage names to LMS round numbers
// Used to know which round number to assign a pick to
export const STAGE_TO_ROUND: Record<string, number> = {
  GROUP_STAGE:     1,
  LAST_32:    2,
  LAST_16:    3,
  QUARTER_FINALS:  4,
  SEMI_FINALS:    5,
  THIRD_PLACE:    5,
  FINAL:          6,
}

// Human-readable labels for display in the UI
export const STAGE_LABELS: Record<string, string> = {
  GROUP_STAGE:    'Group Stage',
  LAST_32:        'Last 32',
  LAST_16:        'Last 16',
  QUARTER_FINALS: 'Quarter-Finals',
  SEMI_FINALS:    'Semi-Finals',
  THIRD_PLACE:    'Third Place Play-off',
  FINAL:          'Final',
}

// Maps LMS round numbers to display labels.
// Defined explicitly to avoid collision (SEMI_FINALS and THIRD_PLACE both map to round 5).
export const ROUND_LABELS: Record<number, string> = {
  1: 'Group Stage',
  2: 'Last 32',
  3: 'Last 16',
  4: 'Quarter-Finals',
  5: 'Semi-Finals',
  6: 'Final',
}

// Ordered list used for filter buttons on the fixtures page
export const STAGES_IN_ORDER: FixtureStage[] = [
  'GROUP_STAGE',
  'LAST_32',
  'LAST_16',
  'QUARTER_FINALS',
  'SEMI_FINALS',
  'THIRD_PLACE',
  'FINAL',
]