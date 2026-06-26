import { createFileRoute, redirect, Link } from '@tanstack/react-router'
import { format } from 'date-fns'
import { supabase } from '../lib/supabase'
import { useFixtures, usePlayers, useMyPicks, useCurrentGame, useGamePlayers } from '../lib/queries'
import { STAGE_LABELS } from '../types'

export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw redirect({ to: '/login' })
  },
  component: HomePage,
})

function HomePage() {
  const { data: fixtures = [] }   = useFixtures()
  const { data: players = [] }    = usePlayers()
  const { data: currentGame }     = useCurrentGame()
  const { data: gamePlayers = [] } = useGamePlayers(currentGame?.id)
  const { data: myPicks = [] }    = useMyPicks(currentGame?.id)

  const paidCount = gamePlayers.filter(gp => gp.paid).length
  const prizePot  = currentGame
    ? currentGame.carried_over + paidCount * currentGame.buy_in
    : 0

  // Next 3 upcoming matches
  const upcomingFixtures = fixtures
    .filter(f => f.status === 'SCHEDULED' || f.status === 'TIMED')
    .slice(0, 3)

  // 3 most recently finished matches
  const recentFixtures = fixtures
    .filter(f => f.status === 'FINISHED')
    .slice(-3)
    .reverse()

  const activePlayers = players.filter(p => p.is_active)
  const eliminatedPlayers = players.filter(p => !p.is_active)

  // Current round's pick if submitted
  const pendingPick = myPicks.find(p => p.result === null)

  return (
    <div className="page-container">
      <h1>Dashboard</h1>

      {/* Prize pot banner */}
      {prizePot > 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '16px 24px',
          marginBottom: 28,
          background: 'rgba(35,134,54,0.12)',
          border: '1px solid var(--color-accent)',
          borderRadius: 'var(--radius-md)',
        }}>
          <span style={{ fontSize: '1.6rem' }}>🏆</span>
          <div>
            <div style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--color-accent)' }}>
              £{prizePot.toFixed(2)}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--color-muted)' }}>Current Prize Pot</div>
          </div>
        </div>
      )}

      {/* Summary stats */}
      <div className="dashboard-grid">
        <div className="dashboard-stat">
          <div className="number">
            {fixtures.filter(f => f.status === 'FINISHED').length}
          </div>
          <div className="label">Matches Played</div>
        </div>
        <div className="dashboard-stat">
          <div className="number">
            {fixtures.filter(f => f.status === 'SCHEDULED' || f.status === 'TIMED').length}
          </div>
          <div className="label">Matches Remaining</div>
        </div>
        <div className="dashboard-stat">
          <div className="number" style={{ color: 'var(--color-accent)' }}>
            {activePlayers.length}
          </div>
          <div className="label">Players Still In</div>
        </div>
        <div className="dashboard-stat">
          <div className="number" style={{ color: 'var(--color-danger)' }}>
            {eliminatedPlayers.length}
          </div>
          <div className="label">Eliminated</div>
        </div>
      </div>

      {/* Current pick status */}
      {pendingPick && (
        <section style={{ marginBottom: '32px' }}>
          <h2>Your Active Pick</h2>
          <div className="card">
            {pendingPick.revealed ? (
              <p>
                Round {pendingPick.round} — You picked{' '}
                <strong>{pendingPick.team?.name}</strong>. Awaiting result.
              </p>
            ) : (
              <p>
                Round {pendingPick.round} — Your pick is sealed 🔒.
                It will be revealed 1 hour before kickoff.
              </p>
            )}
          </div>
        </section>
      )}

      {/* Prompt to pick if nothing active */}
      {!pendingPick && activePlayers.length > 0 && (
        <div className="msg-info" style={{ marginBottom: '24px' }}>
          ⚡ No active pick — <Link to="/pick">make your pick</Link> for the next round.
        </div>
      )}

      {/* Upcoming fixtures */}
      {upcomingFixtures.length > 0 && (
        <section style={{ marginBottom: '32px' }}>
          <h2>Next Up</h2>
          {upcomingFixtures.map(fixture => (
            <div key={fixture.id} className="fixture-card">
              <div className="fixture-teams">
                <span className="fixture-team">
                  {fixture.home_team?.crest_url && (
                    <img src={fixture.home_team.crest_url} alt="" />
                  )}
                  {fixture.home_team?.name ?? fixture.home_team_id}
                </span>
                <div className="fixture-score">
                  <span className="kickoff-time">
                    {format(new Date(fixture.kickoff_time), 'HH:mm')}
                  </span>
                </div>
                <span className="fixture-team fixture-team--away">
                  {fixture.away_team?.name ?? fixture.away_team_id}
                  {fixture.away_team?.crest_url && (
                    <img src={fixture.away_team.crest_url} alt="" />
                  )}
                </span>
              </div>
              <div className="fixture-meta">
                <span>{format(new Date(fixture.kickoff_time), 'EEE d MMM')}</span>
                {fixture.group_id && <span>Group {fixture.group_id}</span>}
                {!fixture.group_id && STAGE_LABELS[fixture.stage] && (
                  <span>{STAGE_LABELS[fixture.stage]}</span>
                )}
              </div>
            </div>
          ))}
          <Link to="/fixtures" style={{ fontSize: '0.85rem', color: 'var(--color-muted)' }}>
            View all fixtures →
          </Link>
        </section>
      )}

      {/* Recent results */}
      {recentFixtures.length > 0 && (
        <section>
          <h2>Recent Results</h2>
          {recentFixtures.map(fixture => (
            <div key={fixture.id} className="fixture-card fixture-card--finished">
              <div className="fixture-teams">
                <span className="fixture-team">
                  {fixture.home_team?.crest_url && (
                    <img src={fixture.home_team.crest_url} alt="" />
                  )}
                  {fixture.home_team?.name ?? fixture.home_team_id}
                </span>
                <div className="fixture-score">
                  <strong>{fixture.home_score} – {fixture.away_score}</strong>
                </div>
                <span className="fixture-team fixture-team--away">
                  {fixture.away_team?.name ?? fixture.away_team_id}
                  {fixture.away_team?.crest_url && (
                    <img src={fixture.away_team.crest_url} alt="" />
                  )}
                </span>
              </div>
              <div className="fixture-meta">
                {fixture.group_id && <span>Group {fixture.group_id}</span>}
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}