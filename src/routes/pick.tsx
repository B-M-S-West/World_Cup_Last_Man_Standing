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

  // Teams used in previous rounds
  const usedInPreviousRounds = new Set(
    myPicks
      .filter(p => p.round !== currentRound)
      .map(p => p.team_id)
  )

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

  if (picksLoading || fixturesLoading) {
    return <div className="loading">Loading...</div>
  }

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

  // Group fixtures by date for display
  const byDate: Record<string, Fixture[]> = {}
  for (const f of roundFixtures) {
    const date = f.kickoff_time.slice(0, 10)
    if (!byDate[date]) byDate[date] = []
    byDate[date].push(f)
  }

  return (
    <div className="page-container pick-page">
      <h1>Round {currentRound} — {STAGE_LABELS['GROUP_STAGE']}</h1>

      <p className="fixture-info">
        Pick any team from matchday {currentRound}.
        First game kicks off{' '}
        <strong>
          {kickoffTime
            ? format(new Date(kickoffTime), 'EEEE d MMMM, HH:mm')
            : '—'}
        </strong>
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
                  Your pick will be revealed 1 hour before kickoff.
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

      {/* Fixture selector */}
      {(!existingPick || changingPick) && (
        <div>
          {isEliminated ? (
            <div className="msg-info" style={{ marginBottom: '20px' }}>
              ⚽ You've been eliminated but you can still pick for fun —
              your pick won't affect the competition.
            </div>
          ) : (
            <div className="msg-info" style={{ marginBottom: '20px' }}>
              🔒 Your pick will be hidden from other players until 1 hour before kickoff.
              Click a team to select them.
            </div>
          )}

          {/* Fixtures grouped by date */}
          {Object.entries(byDate).map(([date, dayFixtures]) => (
            <div key={date} style={{ marginBottom: '24px' }}>
              <h3 style={{
                color: 'var(--color-muted)',
                fontSize: '0.8rem',
                textTransform: 'uppercase',
                letterSpacing: '1px',
                marginBottom: '10px',
                paddingBottom: '6px',
                borderBottom: '1px solid var(--color-border)',
              }}>
                {format(new Date(date + 'T12:00:00'), 'EEEE d MMMM yyyy')}
              </h3>

              {dayFixtures.map(fixture => {
                const homeUsed = usedInPreviousRounds.has(fixture.home_team_id)
                const awayUsed = usedInPreviousRounds.has(fixture.away_team_id)
                const homeSelected = selectedTeamId === fixture.home_team_id
                const awaySelected = selectedTeamId === fixture.away_team_id

                return (
                  <div key={fixture.id} style={{
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                    marginBottom: '8px',
                    overflow: 'hidden',
                  }}>
                    {/* Kickoff time */}
                    <div style={{
                      padding: '6px 16px',
                      borderBottom: '1px solid var(--color-border)',
                      fontSize: '0.75rem',
                      color: 'var(--color-muted)',
                      display: 'flex',
                      gap: '12px',
                    }}>
                      <span>⏰ {format(new Date(fixture.kickoff_time), 'HH:mm')}</span>
                      {fixture.group_id && <span>Group {fixture.group_id}</span>}
                    </div>

                    {/* Team buttons */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr auto 1fr',
                      alignItems: 'stretch',
                    }}>
                      {/* Home team */}
                      <button
                        onClick={() => !homeUsed && setSelectedTeamId(fixture.home_team_id)}
                        style={{
                          background: homeSelected
                            ? 'rgba(35, 134, 54, 0.25)'
                            : homeUsed
                            ? 'rgba(255,255,255,0.02)'
                            : 'transparent',
                          border: 'none',
                          borderRight: '1px solid var(--color-border)',
                          padding: '16px',
                          cursor: homeUsed ? 'not-allowed' : 'pointer',
                          opacity: homeUsed ? 0.35 : 1,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          transition: 'background 0.15s',
                          outline: homeSelected
                            ? '2px solid var(--color-accent)'
                            : 'none',
                          outlineOffset: '-2px',
                        }}
                      >
                        {fixture.home_team?.crest_url && (
                          <img
                            src={fixture.home_team.crest_url}
                            alt=""
                            width={32}
                            height={32}
                            style={{ objectFit: 'contain', flexShrink: 0 }}
                          />
                        )}
                        <div style={{ textAlign: 'left' }}>
                          <div style={{
                            fontWeight: 700,
                            fontSize: '0.95rem',
                            color: homeUsed ? 'var(--color-muted)' : 'var(--color-text)',
                          }}>
                            {fixture.home_team?.name ?? fixture.home_team_id}
                          </div>
                          {homeUsed && (
                            <div style={{ fontSize: '0.7rem', color: 'var(--color-muted)', marginTop: '2px' }}>
                              Already used
                            </div>
                          )}
                          {homeSelected && (
                            <div style={{ fontSize: '0.7rem', color: 'var(--color-accent)', marginTop: '2px' }}>
                              ✓ Selected
                            </div>
                          )}
                        </div>
                      </button>

                      {/* VS divider */}
                      <div style={{
                        padding: '0 16px',
                        display: 'flex',
                        alignItems: 'center',
                        color: 'var(--color-muted)',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        letterSpacing: '1px',
                      }}>
                        VS
                      </div>

                      {/* Away team */}
                      <button
                        onClick={() => !awayUsed && setSelectedTeamId(fixture.away_team_id)}
                        style={{
                          background: awaySelected
                            ? 'rgba(35, 134, 54, 0.25)'
                            : awayUsed
                            ? 'rgba(255,255,255,0.02)'
                            : 'transparent',
                          border: 'none',
                          borderLeft: '1px solid var(--color-border)',
                          padding: '16px',
                          cursor: awayUsed ? 'not-allowed' : 'pointer',
                          opacity: awayUsed ? 0.35 : 1,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'flex-end',
                          gap: '12px',
                          transition: 'background 0.15s',
                          outline: awaySelected
                            ? '2px solid var(--color-accent)'
                            : 'none',
                          outlineOffset: '-2px',
                        }}
                      >
                        <div style={{ textAlign: 'right' }}>
                          <div style={{
                            fontWeight: 700,
                            fontSize: '0.95rem',
                            color: awayUsed ? 'var(--color-muted)' : 'var(--color-text)',
                          }}>
                            {fixture.away_team?.name ?? fixture.away_team_id}
                          </div>
                          {awayUsed && (
                            <div style={{ fontSize: '0.7rem', color: 'var(--color-muted)', marginTop: '2px' }}>
                              Already used
                            </div>
                          )}
                          {awaySelected && (
                            <div style={{ fontSize: '0.7rem', color: 'var(--color-accent)', marginTop: '2px' }}>
                              ✓ Selected
                            </div>
                          )}
                        </div>
                        {fixture.away_team?.crest_url && (
                          <img
                            src={fixture.away_team.crest_url}
                            alt=""
                            width={32}
                            height={32}
                            style={{ objectFit: 'contain', flexShrink: 0 }}
                          />
                        )}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          ))}

          {/* Confirm button */}
          <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
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
            <p className="msg-success" style={{ marginTop: '12px' }}>Pick saved! 🎉</p>
          )}
          {submitPick.isError && (
            <p className="msg-error" style={{ marginTop: '12px' }}>
              Something went wrong. Please try again.
            </p>
          )}

          {/* Teams already used */}
          {myPicks.filter(p => p.round !== currentRound).length > 0 && (
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