import { createFileRoute, redirect } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { supabase } from '../lib/supabase'
import { useMyPicks, useSubmitPick, useFixtures, useCurrentUser } from '../lib/queries'
import { STAGE_LABELS, type Fixture, type Pick } from '../types'

export const Route = createFileRoute('/pick')({
  beforeLoad: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw redirect({ to: '/login' })
  },
  component: PickPage,
})

// Returns all fixtures for the current round and the round number
function getCurrentRoundInfo(fixtures: Fixture[], myPicks: Pick[]): {
  fixtures: Fixture[]
  round: number
  kickoffTime: string | null
} {
  const highestPickedRound = myPicks.length > 0
    ? Math.max(...myPicks.map(p => p.round))
    : 0

  const nextRound = highestPickedRound + 1
  const roundToMatchday: Record<number, number> = { 1: 1, 2: 2, 3: 3 }
  const matchday = roundToMatchday[nextRound] ?? nextRound

  const matchdayFixtures = fixtures
    .filter(f =>
      (f.status === 'SCHEDULED' || f.status === 'TIMED') &&
      f.stage === 'GROUP_STAGE' &&
      f.matchday === matchday
    )
    .sort((a, b) =>
      new Date(a.kickoff_time).getTime() - new Date(b.kickoff_time).getTime()
    )

  return {
    fixtures: matchdayFixtures,
    round: nextRound,
    kickoffTime: matchdayFixtures[0]?.kickoff_time ?? null,
  }
}

function PickPage() {
  const { data: myPicks = [],  isLoading: picksLoading   } = useMyPicks()
  const { data: fixtures = [], isLoading: fixturesLoading } = useFixtures()
  const { data: currentUser } = useCurrentUser()
  const submitPick = useSubmitPick()

  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)
  const [changingPick, setChangingPick] = useState(false)

  const { fixtures: roundFixtures, round: currentRound, kickoffTime } =
    getCurrentRoundInfo(fixtures, myPicks)

  const isEliminated = currentUser?.player?.is_active === false
  const existingPick = myPicks.find(p => p.round === currentRound) ?? null

  useEffect(() => {
    if (existingPick && changingPick) {
      setSelectedTeamId(existingPick.team_id)
    }
  }, [existingPick, changingPick])

  // Teams used in previous rounds only (not the current round pick)
  const usedInPreviousRounds = new Set(
    myPicks
      .filter(p => p.round !== currentRound)
      .map(p => p.team_id)
  )

  // All unique teams playing in this matchday, excluding previously used teams
  const availableTeams = roundFixtures
    .flatMap(f => [f.home_team, f.away_team])
    .filter((team): team is NonNullable<typeof team> => !!team)
    .filter((team, index, self) => self.findIndex(t => t.id === team.id) === index)
    .filter(team => !usedInPreviousRounds.has(team.id))
    .sort((a, b) => a.name.localeCompare(b.name))

  // Find which fixture a team is playing in — needed when submitting
  const getFixtureForTeam = (teamId: string): Fixture | null =>
    roundFixtures.find(f =>
      f.home_team_id === teamId || f.away_team_id === teamId
    ) ?? null

  const handleSubmit = async () => {
    if (!selectedTeamId || currentRound === null) return
    const fixture = getFixtureForTeam(selectedTeamId)
    if (!fixture) return

    await submitPick.mutateAsync({
      fixtureId: fixture.id,
      teamId:    selectedTeamId,
      round:     currentRound,
    })
    setChangingPick(false)
    setSelectedTeamId(null)
  }

  // ── Loading ───────────────────────────────────────────────
  if (picksLoading || fixturesLoading) {
    return <div className="loading">Loading...</div>
  }

  // ── No upcoming fixtures ──────────────────────────────────
  if (roundFixtures.length === 0) {
    return (
      <div className="page-container">
        <h1>My Pick</h1>
        <p style={{ color: 'var(--color-muted)' }}>
          No upcoming fixtures to pick for. Check back soon!
        </p>
      </div>
    )
  }

  // ── Main render ───────────────────────────────────────────
  return (
    <div className="page-container pick-page">
      <h1>Round {currentRound} — {STAGE_LABELS['GROUP_STAGE']}</h1>

      <p className="fixture-info">
        Pick any team playing in matchday {currentRound}.
        First game kicks off{' '}
        <strong>
          {kickoffTime
            ? format(new Date(kickoffTime), 'EEEE d MMMM, HH:mm')
            : '—'}
        </strong>
      </p>

      {/* Already picked this round and not changing */}
      {existingPick && !changingPick && (
        <div>
          <div className="pick-sealed card">
            {existingPick.revealed ? (
              <>
                <p style={{ marginBottom: '12px', color: 'var(--color-muted)' }}>
                  Your Round {currentRound} pick:
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {existingPick.team?.crest_url && (
                    <img
                      src={existingPick.team.crest_url}
                      alt=""
                      width={48}
                      height={48}
                      style={{ objectFit: 'contain' }}
                    />
                  )}
                  <span style={{ fontSize: '1.2rem', fontWeight: 700 }}>
                    {existingPick.team?.name}
                  </span>
                </div>
                {existingPick.result && (
                  <p style={{ marginTop: '12px' }}>
                    Result:{' '}
                    {existingPick.result === 'win' &&
                      <strong style={{ color: 'var(--color-accent)' }}>WIN ✅</strong>}
                    {existingPick.result === 'draw' &&
                      <strong style={{ color: 'var(--color-warning)' }}>DRAW ❌</strong>}
                    {existingPick.result === 'loss' &&
                      <strong style={{ color: 'var(--color-danger)' }}>LOSS ❌</strong>}
                  </p>
                )}
                {!existingPick.result && (
                  <p style={{ marginTop: '8px', color: 'var(--color-muted)', fontSize: '0.875rem' }}>
                    Awaiting result...
                  </p>
                )}
              </>
            ) : (
              <>
                <span className="lock-icon">🔒</span>
                <strong>Pick submitted and sealed</strong>
                <p style={{ color: 'var(--color-muted)', marginTop: '8px' }}>
                  Your pick will be revealed to other players 1 hour before kickoff.
                </p>
              </>
            )}
          </div>

          {!existingPick.revealed && !existingPick.result && (
            <button
              className="btn btn-ghost"
              style={{ marginTop: '16px' }}
              onClick={() => setChangingPick(true)}
            >
              Change pick
            </button>
          )}
        </div>
      )}

      {/* Team selector — for new picks or changing existing pick */}
      {(!existingPick || changingPick) && (
        <div>
          {isEliminated ? (
            <div className="msg-info" style={{ marginBottom: '16px' }}>
              ⚽ You've been eliminated but you can still pick for fun —
              your pick won't affect the competition.
            </div>
          ) : (
            <div className="msg-info" style={{ marginBottom: '16px' }}>
              🔒 Your pick will be hidden from other players until 1 hour before kickoff.
            </div>
          )}

          {availableTeams.length === 0 ? (
            <div className="msg-error">
              <strong>No teams available.</strong><br />
              You've already used all the teams playing in this round.
            </div>
          ) : (
            <>
              <div className="team-options" style={{
                gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))'
              }}>
                {availableTeams.map(team => (
                  <button
                    key={team.id}
                    className={`team-btn ${selectedTeamId === team.id ? 'selected' : ''}`}
                    onClick={() => setSelectedTeamId(team.id)}
                  >
                    {team.crest_url && (
                      <img src={team.crest_url} alt={team.name} width={40} height={40} />
                    )}
                    <span>{team.name}</span>
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                <button
                  className="btn btn-primary"
                  onClick={handleSubmit}
                  disabled={!selectedTeamId || submitPick.isPending}
                >
                  {submitPick.isPending
                    ? 'Saving...'
                    : existingPick ? 'Update Pick' : 'Confirm Pick'}
                </button>
                {changingPick && (
                  <button
                    className="btn btn-ghost"
                    onClick={() => {
                      setChangingPick(false)
                      setSelectedTeamId(null)
                    }}
                  >
                    Cancel
                  </button>
                )}
              </div>

              {submitPick.isSuccess && (
                <p className="msg-success" style={{ marginTop: '12px' }}>
                  Pick saved! 🎉
                </p>
              )}
              {submitPick.isError && (
                <p className="msg-error" style={{ marginTop: '12px' }}>
                  Something went wrong. Please try again.
                </p>
              )}
            </>
          )}

          {/* Teams already used in previous rounds */}
          {myPicks.length > 0 && (
            <div className="used-teams" style={{ marginTop: '32px' }}>
              <h3>Teams you've already used</h3>
              <div className="used-list">
                {myPicks
                  .filter(p => p.round !== currentRound)
                  .map(pick => (
                    <span
                      key={pick.id}
                      className={`used-tag used-tag--${pick.result ?? 'pending'}`}
                    >
                      {pick.team?.crest_url && (
                        <img
                          src={pick.team.crest_url}
                          alt=""
                          width={14}
                          style={{ marginRight: 4, objectFit: 'contain' }}
                        />
                      )}
                      {pick.team?.name ?? pick.team_id} (R{pick.round})
                      {pick.result === 'win'  && ' ✅'}
                      {pick.result === 'draw' && ' ❌'}
                      {pick.result === 'loss' && ' ❌'}
                    </span>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}