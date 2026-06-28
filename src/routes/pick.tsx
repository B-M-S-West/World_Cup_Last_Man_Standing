import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { useMyPicks, useSubmitPick, useFixtures, useCurrentUser, useCurrentGame } from '../lib/queries'
import { ROUND_LABELS, STAGE_TO_ROUND, type Fixture, type Pick } from '../types'

export const Route = createFileRoute('/pick')({
  component: PickPage,
})

const GROUP_STAGE_ROUNDS = 3

function groupByDate(fixtures: Fixture[]): Record<string, Fixture[]> {
  const result: Record<string, Fixture[]> = {}
  for (const f of fixtures) {
    const date = f.kickoff_time.slice(0, 10)
    if (!result[date]) result[date] = []
    result[date].push(f)
  }
  return result
}

function getRoundLabel(round: number): string {
  return ROUND_LABELS[round] ?? `Round ${round}`
}

function getFixturesForRound(fixtures: Fixture[], round: number): Fixture[] {
  if (round <= GROUP_STAGE_ROUNDS) {
    return fixtures
      .filter(f =>
        (f.status === 'SCHEDULED' || f.status === 'TIMED') &&
        f.stage === 'GROUP_STAGE' &&
        f.matchday === round
      )
      .sort((a, b) => new Date(a.kickoff_time).getTime() - new Date(b.kickoff_time).getTime())
  }

  // Knockout stage: find the stage whose STAGE_TO_ROUND value equals round
  const stage = Object.entries(STAGE_TO_ROUND).find(([, r]) => r === round)?.[0]
  if (!stage) return []

  return fixtures
    .filter(f =>
      (f.status === 'SCHEDULED' || f.status === 'TIMED') &&
      f.stage === stage
    )
    .sort((a, b) => new Date(a.kickoff_time).getTime() - new Date(b.kickoff_time).getTime())
}

function PickPage() {
  const { data: currentGame } = useCurrentGame()
  const { data: myPicks = [],  isLoading: picksLoading   } = useMyPicks(currentGame?.id)
  const { data: fixtures = [], isLoading: fixturesLoading } = useFixtures()
  const { data: currentUser } = useCurrentUser()
  const submitPick = useSubmitPick()

  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)
  const [changingPick, setChangingPick] = useState(false)

  const highestPickedRound  = myPicks.length > 0 ? Math.max(...myPicks.map(p => p.round)) : 0
  const lastPick            = myPicks.find(p => p.round === highestPickedRound) ?? null
  const gameStartingRound   = currentGame?.starting_round ?? 1

  // Unlock the next round as soon as the last pick is revealed.
  // Never go below the game's starting round (for games that start from R32 etc.)
  const activeRound = myPicks.length === 0
    ? gameStartingRound
    : (lastPick && !lastPick.revealed)
      ? highestPickedRound
      : Math.max(highestPickedRound + 1, gameStartingRound)
  const previewRound = activeRound + 1

  const activeFixtures = getFixturesForRound(fixtures, activeRound)
  const previewFixtures = getFixturesForRound(fixtures, previewRound)

  const kickoffTime = activeFixtures[0]?.kickoff_time ?? null
  const existingPick = myPicks.find(p => p.round === activeRound) ?? null
  const isEliminated = currentUser?.player?.is_active === false

  useEffect(() => {
    if (existingPick && changingPick) {
      setSelectedTeamId(existingPick.team_id)
    }
  }, [existingPick, changingPick])

  // Teams used in previous rounds (not the active one)
  const usedInPreviousRounds = new Set(
    myPicks
      .filter(p => p.round !== activeRound)
      .map(p => p.team_id)
  )

  const getFixtureForTeam = (teamId: string): Fixture | null =>
    activeFixtures.find(f =>
      f.home_team_id === teamId || f.away_team_id === teamId
    ) ?? null

  const handleSubmit = async () => {
    if (!selectedTeamId || !currentGame) return
    const fixture = getFixtureForTeam(selectedTeamId)
    if (!fixture) return
    await submitPick.mutateAsync({
      fixtureId: fixture.id,
      teamId:    selectedTeamId,
      round:     activeRound,
      gameId:    currentGame.id,
    })
    setChangingPick(false)
    setSelectedTeamId(null)
  }

  if (picksLoading || fixturesLoading) {
    return <div className="loading">Loading...</div>
  }

  // Hard block for eliminated players
  if (isEliminated) {
    return (
      <div className="page-container pick-page">
        <h1>My Pick</h1>
        <div className="card" style={{
          padding: '32px',
          textAlign: 'center',
          borderColor: 'var(--color-danger)',
        }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>❌</div>
          <h2 style={{ color: 'var(--color-danger)', marginBottom: '8px' }}>Eliminated</h2>
          <p style={{ color: 'var(--color-muted)' }}>
            You've been knocked out of the Last Man Standing competition.
          </p>
        </div>
        {myPicks.length > 0 && (
          <div className="used-teams" style={{ marginTop: '32px' }}>
            <h3>Your picks</h3>
            <div className="used-list">
              {myPicks.map(pick => (
                <span key={pick.id} className={`used-tag used-tag--${pick.result ?? 'pending'}`}>
                  {pick.team?.crest_url && (
                    <img src={pick.team.crest_url} alt="" width={14} style={{ marginRight: 4, objectFit: 'contain' }} />
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
    )
  }

  // No fixtures at all — no current round and no upcoming
  if (activeFixtures.length === 0 && myPicks.length === 0) {
    return (
      <div className="page-container">
        <h1>My Pick</h1>
        <p style={{ color: 'var(--color-muted)' }}>
          No upcoming fixtures to pick for. Check back soon!
        </p>
      </div>
    )
  }

  const byDate = groupByDate(activeFixtures)
  const byDatePreview = groupByDate(previewFixtures)
  const activeStageLabel = getRoundLabel(activeRound)
  const previewStageLabel = getRoundLabel(previewRound)

  // If no active fixtures but we have a previous pick, show it with next round TBA
  if (activeFixtures.length === 0) {
    return (
      <div className="page-container pick-page">
        <h1>My Pick</h1>
        {lastPick && (
          <PickSummaryCard pick={lastPick} onChangeClick={() => {}} showChange={false} />
        )}
        <div style={{ marginTop: '24px', padding: '20px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-muted)', textAlign: 'center' }}>
          <p style={{ fontSize: '1.1rem', marginBottom: '8px' }}>Next round fixtures coming soon</p>
          <p style={{ fontSize: '0.875rem' }}>Check back once results are in and the next round is confirmed.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="page-container pick-page">
      <h1>Round {activeRound} — {activeStageLabel}</h1>

      {activeFixtures.length > 0 && (
        <p className="fixture-info">
          Pick any team from{activeRound <= GROUP_STAGE_ROUNDS ? ` matchday ${activeRound}` : ` the ${activeStageLabel}`}.
          First game kicks off{' '}
          <strong>
            {kickoffTime
              ? format(new Date(kickoffTime), 'EEEE d MMMM, HH:mm')
              : '—'}
          </strong>
        </p>
      )}

      {/* Already picked and not changing */}
      {existingPick && !changingPick && (
        <div>
          <PickSummaryCard
            pick={existingPick}
            onChangeClick={() => setChangingPick(true)}
            showChange={!existingPick.revealed && !existingPick.result}
          />
        </div>
      )}

      {/* Fixture selector */}
      {(!existingPick || changingPick) && (
        <div>
          <div className="msg-info" style={{ marginBottom: '20px' }}>
            🔒 Your pick will be hidden from other players until 1 hour before kickoff.
            Click a team to select them.
          </div>

          <FixtureGrid
            byDate={byDate}
            usedInPreviousRounds={usedInPreviousRounds}
            selectedTeamId={selectedTeamId}
            onSelect={setSelectedTeamId}
          />

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
          {myPicks.filter(p => p.round !== activeRound).length > 0 && (
            <div className="used-teams" style={{ marginTop: '32px' }}>
              <h3>Teams you've already used</h3>
              <div className="used-list">
                {myPicks
                  .filter(p => p.round !== activeRound)
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

      {/* Next round preview — shown when current pick is not yet revealed */}
      {existingPick && !existingPick.revealed && !changingPick && previewFixtures.length > 0 && (
        <div style={{ marginTop: '40px' }}>
          <h2 style={{ fontSize: '1.1rem', color: 'var(--color-muted)', marginBottom: '4px' }}>
            Round {previewRound} — {previewStageLabel}
          </h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-muted)', marginBottom: '16px' }}>
            Your round {activeRound} pick must be revealed before you can select here.
          </p>
          <FixtureGrid
            byDate={byDatePreview}
            usedInPreviousRounds={usedInPreviousRounds}
            selectedTeamId={null}
            onSelect={() => {}}
            locked
          />
        </div>
      )}
    </div>
  )
}

function PickSummaryCard({
  pick,
  onChangeClick,
  showChange,
}: {
  pick: Pick
  onChangeClick: () => void
  showChange: boolean
}) {
  return (
    <div>
      <div className="pick-sealed card">
        {pick.revealed ? (
          <>
            <p style={{ marginBottom: '12px', color: 'var(--color-muted)' }}>
              Your Round {pick.round} pick:
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {pick.team?.crest_url && (
                <img
                  src={pick.team.crest_url}
                  alt=""
                  width={48}
                  height={48}
                  style={{ objectFit: 'contain' }}
                />
              )}
              <span style={{ fontSize: '1.2rem', fontWeight: 700 }}>
                {pick.team?.name}
              </span>
            </div>
            {pick.result && (
              <p style={{ marginTop: '12px' }}>
                Result:{' '}
                {pick.result === 'win' &&
                  <strong style={{ color: 'var(--color-accent)' }}>WIN ✅</strong>}
                {pick.result === 'draw' &&
                  <strong style={{ color: 'var(--color-warning)' }}>DRAW ❌</strong>}
                {pick.result === 'loss' &&
                  <strong style={{ color: 'var(--color-danger)' }}>LOSS ❌</strong>}
              </p>
            )}
            {!pick.result && (
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

      {showChange && (
        <button
          className="btn btn-ghost"
          style={{ marginTop: '16px' }}
          onClick={onChangeClick}
        >
          Change pick
        </button>
      )}
    </div>
  )
}

function FixtureGrid({
  byDate,
  usedInPreviousRounds,
  selectedTeamId,
  onSelect,
  locked = false,
}: {
  byDate: Record<string, Fixture[]>
  usedInPreviousRounds: Set<string>
  selectedTeamId: string | null
  onSelect: (teamId: string) => void
  locked?: boolean
}) {
  return (
    <>
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
            const homeUsed = !locked && usedInPreviousRounds.has(fixture.home_team_id)
            const awayUsed = !locked && usedInPreviousRounds.has(fixture.away_team_id)
            const homeSelected = !locked && selectedTeamId === fixture.home_team_id
            const awaySelected = !locked && selectedTeamId === fixture.away_team_id

            return (
              <div key={fixture.id} style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                marginBottom: '8px',
                overflow: 'hidden',
                opacity: locked ? 0.5 : 1,
              }}>
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

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto 1fr',
                  alignItems: 'stretch',
                }}>
                  {/* Home team */}
                  <button
                    onClick={() => !locked && !homeUsed && onSelect(fixture.home_team_id)}
                    style={{
                      background: homeSelected
                        ? 'rgba(35, 134, 54, 0.25)'
                        : homeUsed
                        ? 'rgba(255,255,255,0.02)'
                        : 'transparent',
                      border: 'none',
                      borderRight: '1px solid var(--color-border)',
                      padding: '16px',
                      cursor: locked || homeUsed ? 'not-allowed' : 'pointer',
                      opacity: homeUsed ? 0.35 : 1,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      transition: 'background 0.15s',
                      outline: homeSelected ? '2px solid var(--color-accent)' : 'none',
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
                    onClick={() => !locked && !awayUsed && onSelect(fixture.away_team_id)}
                    style={{
                      background: awaySelected
                        ? 'rgba(35, 134, 54, 0.25)'
                        : awayUsed
                        ? 'rgba(255,255,255,0.02)'
                        : 'transparent',
                      border: 'none',
                      borderLeft: '1px solid var(--color-border)',
                      padding: '16px',
                      cursor: locked || awayUsed ? 'not-allowed' : 'pointer',
                      opacity: awayUsed ? 0.35 : 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'flex-end',
                      gap: '12px',
                      transition: 'background 0.15s',
                      outline: awaySelected ? '2px solid var(--color-accent)' : 'none',
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
    </>
  )
}