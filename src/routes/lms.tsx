import { createFileRoute } from '@tanstack/react-router'
import { usePlayers, usePicks } from '../lib/queries'
import type { Player, Pick } from '../types'

export const Route = createFileRoute('/lms')({
  component: LMSPage,
})

function LMSPage() {
  const { data: players = [], isLoading: playersLoading } = usePlayers()
  const { data: picks = [],   isLoading: picksLoading   } = usePicks()

  if (playersLoading || picksLoading) {
    return <div className="loading">Loading standings...</div>
  }

  const active     = players.filter(p => p.is_active)
  const eliminated = players.filter(p => !p.is_active)

  const picksFor = (playerId: string) =>
    picks
      .filter(p => p.player_id === playerId)
      .sort((a, b) => a.round - b.round)

  return (
    <div className="page-container">
      <h1>Last Man Standing</h1>

      <div className="lms-summary">
        <div className="lms-stat lms-stat--active">
          <div className="number">{active.length}</div>
          <div className="label">Still In</div>
        </div>
        <div className="lms-stat lms-stat--out">
          <div className="number">{eliminated.length}</div>
          <div className="label">Eliminated</div>
        </div>
        <div className="lms-stat">
          <div className="number">{players.length}</div>
          <div className="label">Total Players</div>
        </div>
      </div>

      <section>
        <h2>🟢 Still In</h2>
        {active.length === 0 && (
          <p style={{ color: 'var(--color-muted)' }}>No players yet.</p>
        )}
        <div className="player-grid">
          {active.map(player => (
            <PlayerCard key={player.id} player={player} picks={picksFor(player.id)} />
          ))}
        </div>
      </section>

      {eliminated.length > 0 && (
        <section>
          <h2>❌ Eliminated</h2>
          <div className="player-grid">
            {eliminated.map(player => (
              <PlayerCard key={player.id} player={player} picks={picksFor(player.id)} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function PlayerCard({ player, picks }: { player: Player; picks: Pick[] }) {
  const isEliminated = !player.is_active
  return (
    <div className={`player-card ${isEliminated ? 'player-card--out' : ''}`}>
      <h3>{isEliminated ? '❌ ' : '🟢 '}{player.username}</h3>
      <div className="pick-history">
        {picks.length === 0 && (
          <span style={{ color: 'var(--color-muted)', fontSize: '0.8rem' }}>
            No picks yet
          </span>
        )}
        {picks.map(pick => (
          <PickBadge key={pick.id} pick={pick} />
        ))}
      </div>
    </div>
  )
}

function PickBadge({ pick }: { pick: Pick }) {
  const isSealed = !pick.revealed && pick.result === null

  return (
    <div className={`pick-badge pick-badge--${pick.result ?? 'pending'}`}>
      {pick.revealed && pick.team?.crest_url && (
        <img src={pick.team.crest_url} alt="" />
      )}
      <span>
        {isSealed ? '🔒 Sealed' : pick.team?.name ?? pick.team_id}
      </span>
      <span className="pick-round">R{pick.round}</span>
      {pick.result === 'win'  && <span style={{ marginLeft: 'auto' }}>✅</span>}
      {pick.result === 'draw' && <span style={{ marginLeft: 'auto' }}>❌ Draw</span>}
      {pick.result === 'loss' && <span style={{ marginLeft: 'auto' }}>❌ Lost</span>}
      {pick.revealed && !pick.result && (
        <span style={{ marginLeft: 'auto', color: 'var(--color-muted)' }}>⏳</span>
      )}
    </div>
  )
}