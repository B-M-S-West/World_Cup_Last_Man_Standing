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

function getCurrentRoundInfo(fixtures: Fixture[], myPicks: Pick[]): {
  fixture: Fixture | null
  round: number
} {
  // Find the highest round already picked
  const highestPickedRound = myPicks.length > 0
    ? Math.max(...myPicks.map(p => p.round))
    : 0

  const nextRound = highestPickedRound + 1

  // Find the earliest upcoming fixture for the next round
  // For group stage, round maps to matchday
  const roundToMatchday: Record<number, number> = { 1: 1, 2: 2, 3: 3 }
  const matchday = roundToMatchday[nextRound] ?? nextRound

  const upcoming = fixtures
    .filter(f =>
      (f.status === 'SCHEDULED' || f.status === 'TIMED') &&
      f.stage === 'GROUP_STAGE' &&
      f.matchday === matchday
    )
    .sort((a, b) =>
      new Date(a.kickoff_time).getTime() - new Date(b.kickoff_time).getTime()
    )

  return {
    fixture: upcoming[0] ?? null,
    round: nextRound,
  }
}

function PickPage() {
  const { data: myPicks = [],  isLoading: picksLoading   } = useMyPicks()
  const { data: fixtures = [], isLoading: fixturesLoading } = useFixtures()
  const submitPick = useSubmitPick()

  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)
  const [changingPick, setChangingPick] = useState(false)

  const { fixture: nextFixture, round: currentRound } = getCurrentRoundInfo(fixtures, myPicks)
  const { data: currentUser } = useCurrentUser()
  const isEliminated = currentUser?.player?.is_active === false

  const existingPick = myPicks.find(p => p.round === currentRound) ?? null

  useEffect(() => {
    if (existingPick && changingPick) {
      setSelectedTeamId(existingPick.team_id)
    }
  }, [existingPick, changingPick])

  // All team IDs already used in previous rounds
  const usedTeamIds = new Set(myPicks.map(p => p.team_id))

  // Teams available to pick — not used before, unless it's the current pick
  const availableTeams = [nextFixture?.home_team, nextFixture?.away_team]
    .filter((team): team is NonNullable<typeof team> => {
      if (!team) return false
      if (!usedTeamIds.has(team.id)) return true
      if (existingPick?.team_id === team.id) return true
      return false
    })

  const handleSubmit = async () => {
    if (!selectedTeamId || !nextFixture || currentRound === null) return
    await submitPick.mutateAsync({
      fixtureId: nextFixture.id,
      teamId:    selectedTeamId,
      round:     currentRound,
    })
    setChangingPick(false)
    setSelectedTeamId(null)
  }

  if (picksLoading || fixturesLoading) {
    return <div className="loading">Loading...</div>
  }

  if (!nextFixture) {
    return (
      <div className="page-container">
        <h1>My Pick</h1>
        <p style={{ color: 'var(--color-muted)' }}>
          No upcoming fixtures to pick for. Check back soon!
        </p>
      </div>
    )
  }

  return (
    <div className="page-container pick-page">
      <h1>Round {currentRound} — {STAGE_LABELS[nextFixture.stage] ?? nextFixture.stage}</h1>

      <p className="fixture-info">
        Next match:{' '}
        <strong>{nextFixture.home_team?.name ?? nextFixture.home_team_id}</strong>
        {' vs '}
        <strong>{nextFixture.away_team?.name ?? nextFixture.away_team_id}</strong>
        {' — '}
        {format(new Date(nextFixture.kickoff_time), 'EEEE d MMMM, HH:mm')}
      </p>

      {/* Already picked and not changing */}
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

      {/* Team selector */}
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
              You've already used both teams in this fixture in a previous round.
            </div>
          ) : (
            <>
              <div className="team-options">
                {availableTeams.map(team => (
                  <button
                    key={team.id}
                    className={`team-btn ${selectedTeamId === team.id ? 'selected' : ''}`}
                    onClick={() => setSelectedTeamId(team.id)}
                  >
                    {team.crest_url && (
                      <img src={team.crest_url} alt={team.name} width={56} height={56} />
                    )}
                    <span>{team.name}</span>
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <button
                  className="btn btn-primary"
                  onClick={handleSubmit}
                  disabled={!selectedTeamId || submitPick.isPending}
                >
                  {submitPick.isPending ? 'Saving...' : existingPick ? 'Update Pick' : 'Confirm Pick'}
                </button>
                {changingPick && (
                  <button
                    className="btn btn-ghost"
                    onClick={() => { setChangingPick(false); setSelectedTeamId(null) }}
                  >
                    Cancel
                  </button>
                )}
              </div>

              {submitPick.isSuccess && (
                <p className="msg-success" style={{ marginTop: '12px' }}>Pick saved! 🎉</p>
              )}
              {submitPick.isError && (
                <p className="msg-error" style={{ marginTop: '12px' }}>
                  Something went wrong. Please try again.
                </p>
              )}
            </>
          )}

          {/* Teams already used */}
          {myPicks.length > 0 && (
            <div className="used-teams" style={{ marginTop: '32px' }}>
              <h3>Teams you've used</h3>
              <div className="used-list">
                {myPicks.map(pick => (
                  <span
                    key={pick.id}
                    className={`used-tag used-tag--${pick.result ?? 'pending'}`}
                  >
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