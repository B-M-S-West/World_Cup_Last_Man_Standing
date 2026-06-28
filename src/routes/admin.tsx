import { createFileRoute, redirect } from '@tanstack/react-router'
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  useCurrentGame,
  useGames,
  useGamePlayers,
  usePlayers,
  KEYS,
} from '../lib/queries'
import { useQueryClient, useMutation } from '@tanstack/react-query'
import type { Game, GamePlayer, Player } from '../types'
import { STAGE_LABELS, STAGE_TO_ROUND } from '../types'

export const Route = createFileRoute('/admin')({
  beforeLoad: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw redirect({ to: '/login' })

    const { data: player } = await supabase
      .from('players')
      .select('is_admin')
      .eq('id', session.user.id)
      .single()

    if (!player?.is_admin) throw redirect({ to: '/' })
  },
  component: AdminPage,
})

// ── Round label helper ────────────────────────────────────────
const ROUND_LABELS: Record<number, string> = Object.fromEntries(
  Object.entries(STAGE_TO_ROUND).map(([stage, round]) => [round, STAGE_LABELS[stage] ?? stage])
)

function AdminPage() {
  const queryClient   = useQueryClient()
  const { data: currentGame, isLoading: gameLoading } = useCurrentGame()
  const { data: allGames = [] } = useGames()
  const { data: gamePlayers = [] } = useGamePlayers(currentGame?.id)
  const { data: allPlayers = [] } = usePlayers()

  const [showNewGame, setShowNewGame] = useState(false)

  // Computed values
  const paidCount = gamePlayers.filter(gp => gp.paid).length
  const prizePot  = (currentGame?.carried_over ?? 0) + paidCount * (currentGame?.buy_in ?? 0)
  const gameEnded = currentGame?.status === 'won' || currentGame?.status === 'all_out'

  // ── Mutations ─────────────────────────────────────────────────

  const togglePaid = useMutation({
    mutationFn: async ({ id, paid }: { id: string; paid: boolean }) => {
      const { error } = await supabase.from('game_players').update({ paid }).eq('id', id)
      if (error) throw new Error(error.message)

      // Recompute and store prize_pot on the game
      if (currentGame) {
        const newPaidCount = gamePlayers.filter(gp => (gp.id === id ? paid : gp.paid)).length
        const newPot = currentGame.carried_over + newPaidCount * currentGame.buy_in
        await supabase.from('games').update({ prize_pot: newPot }).eq('id', currentGame.id)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEYS.gamePlayers(currentGame?.id) })
      queryClient.invalidateQueries({ queryKey: KEYS.currentGame })
    },
  })

  const removeFromGame = useMutation({
    mutationFn: async ({ gpId, playerId }: { gpId: string; playerId: string }) => {
      const { error: gpErr } = await supabase.from('game_players').delete().eq('id', gpId)
      if (gpErr) throw new Error(gpErr.message)
      const { error: pErr } = await supabase.from('players').update({ is_active: false }).eq('id', playerId)
      if (pErr) throw new Error(pErr.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEYS.gamePlayers(currentGame?.id) })
      queryClient.invalidateQueries({ queryKey: KEYS.players })
    },
  })

  const endGame = useMutation({
    mutationFn: async (status: 'won' | 'all_out') => {
      const update: Record<string, unknown> = { status, ended_at: new Date().toISOString() }
      if (status === 'won') {
        // Find the last remaining active player in this game
        const active = gamePlayers.find(gp => gp.player?.is_active)
        if (active) update.winner_id = active.player_id
      }
      const { error } = await supabase.from('games').update(update).eq('id', currentGame!.id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEYS.currentGame }),
  })

  if (gameLoading) return <div className="loading">Loading admin panel...</div>

  return (
    <div className="page-container" style={{ maxWidth: 800 }}>
      <h1>Admin Portal</h1>

      {/* ── Current game status ── */}
      <section style={sectionStyle}>
        <h2 style={sectionTitle}>Current Game</h2>
        {currentGame ? (
          <>
            <div style={statRow}>
              <StatusBadge status={currentGame.status} />
              <span style={{ color: 'var(--color-muted)', fontSize: '0.85rem' }}>
                Started from {ROUND_LABELS[currentGame.starting_round] ?? `Round ${currentGame.starting_round}`}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 16 }}>
              <StatCard label="Buy-in" value={`£${currentGame.buy_in.toFixed(2)}`} />
              <StatCard label="Carried Over" value={`£${currentGame.carried_over.toFixed(2)}`} />
              <StatCard label="Prize Pot" value={`£${prizePot.toFixed(2)}`} accent />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginTop: 12 }}>
              <StatCard
                label="Active Players"
                value={String(gamePlayers.filter(gp => gp.player?.is_active).length)}
              />
              <StatCard
                label="Eliminated"
                value={String(gamePlayers.filter(gp => !gp.player?.is_active).length)}
              />
            </div>

            {currentGame.status === 'won' && currentGame.winner && (
              <div style={{ marginTop: 16, padding: '12px 16px', background: 'rgba(35,134,54,0.15)', borderRadius: 8, border: '1px solid var(--color-accent)' }}>
                🏆 Winner: <strong>{currentGame.winner.username}</strong>
              </div>
            )}

            {/* Manual override buttons — in case auto-detect doesn't fire */}
            {currentGame.status === 'active' && (
              <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: '0.8rem', color: 'var(--color-danger)', borderColor: 'var(--color-danger)' }}
                  onClick={() => { if (confirm('Mark game as all out? This cannot be undone.')) endGame.mutate('all_out') }}
                >
                  Mark All Out
                </button>
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: '0.8rem', color: 'var(--color-accent)', borderColor: 'var(--color-accent)' }}
                  onClick={() => { if (confirm('Mark game as won?')) endGame.mutate('won') }}
                >
                  Mark Won
                </button>
              </div>
            )}

            {gameEnded && !showNewGame && (
              <button
                className="btn btn-primary"
                style={{ marginTop: 16 }}
                onClick={() => setShowNewGame(true)}
              >
                Start New Game
              </button>
            )}
          </>
        ) : (
          <div>
            <p style={{ color: 'var(--color-muted)' }}>No active game.</p>
            <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => setShowNewGame(true)}>
              Start First Game
            </button>
          </div>
        )}
      </section>

      {/* ── New game panel ── */}
      {showNewGame && (
        <NewGamePanel
          previousGame={currentGame ?? null}
          previousPaidCount={paidCount}
          allPlayers={allPlayers}
          onClose={() => setShowNewGame(false)}
          onSuccess={() => {
            setShowNewGame(false)
            queryClient.invalidateQueries({ queryKey: KEYS.currentGame })
            queryClient.invalidateQueries({ queryKey: KEYS.players })
            queryClient.invalidateQueries({ queryKey: ['games'] })
          }}
        />
      )}

      {/* ── Players in current game ── */}
      {currentGame && (
        <section style={sectionStyle}>
          <h2 style={sectionTitle}>Players in Current Game</h2>
          {gamePlayers.length === 0 ? (
            <p style={{ color: 'var(--color-muted)' }}>No players in this game yet.</p>
          ) : (
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Player</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Paid</th>
                  <th style={thStyle}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {gamePlayers.map(gp => (
                  <tr key={gp.id}>
                    <td style={tdStyle}><strong>{gp.player?.username ?? gp.player_id}</strong></td>
                    <td style={tdStyle}>
                      {gp.player?.is_active
                        ? <span style={{ color: 'var(--color-accent)' }}>Active ✅</span>
                        : <span style={{ color: 'var(--color-danger)' }}>Out ❌</span>
                      }
                    </td>
                    <td style={tdStyle}>
                      <button
                        className="btn btn-ghost"
                        style={{ fontSize: '0.78rem', padding: '2px 10px' }}
                        onClick={() => togglePaid.mutate({ id: gp.id, paid: !gp.paid })}
                      >
                        {gp.paid ? '✅ Paid' : '⬜ Unpaid'}
                      </button>
                    </td>
                    <td style={tdStyle}>
                      <button
                        className="btn btn-ghost"
                        style={{ fontSize: '0.78rem', padding: '2px 10px', color: 'var(--color-danger)' }}
                        onClick={() => {
                          if (confirm(`Remove ${gp.player?.username} from this game?`)) {
                            removeFromGame.mutate({ gpId: gp.id, playerId: gp.player_id })
                          }
                        }}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {/* ── Add player ── */}
      <section style={sectionStyle}>
        <h2 style={sectionTitle}>Add Player</h2>
        <AddPlayerForm gameId={currentGame?.id} />
      </section>

      {/* ── Game history ── */}
      {allGames.length > 1 && (
        <section style={sectionStyle}>
          <h2 style={sectionTitle}>Game History</h2>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Started</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Buy-in</th>
                <th style={thStyle}>Winner</th>
              </tr>
            </thead>
            <tbody>
              {allGames.map(g => (
                <tr key={g.id}>
                  <td style={tdStyle}>{new Date(g.created_at).toLocaleDateString('en-GB')}</td>
                  <td style={tdStyle}><StatusBadge status={g.status} /></td>
                  <td style={tdStyle}>£{g.buy_in.toFixed(2)}</td>
                  <td style={tdStyle}>{g.winner?.username ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  )
}

// ── New Game Panel ────────────────────────────────────────────
function NewGamePanel({
  previousGame,
  previousPaidCount,
  allPlayers,
  onClose,
  onSuccess,
}: {
  previousGame: Game | null
  previousPaidCount: number
  allPlayers: Player[]
  onClose: () => void
  onSuccess: () => void
}) {
  const queryClient = useQueryClient()

  const previousPot = previousGame
    ? previousGame.carried_over + previousPaidCount * previousGame.buy_in
    : 0
  const carriedOver = previousGame?.status === 'all_out' ? previousPot : 0

  const [buyIn, setBuyIn]               = useState(previousGame?.buy_in ?? 10)
  const [startingRound, setStartingRound] = useState(1)
  const [selected, setSelected]         = useState<Record<string, boolean>>(
    Object.fromEntries(allPlayers.map(p => [p.id, true]))
  )
  const [paid, setPaid] = useState<Record<string, boolean>>(
    Object.fromEntries(allPlayers.map(p => [p.id, false]))
  )
  const [error, setError] = useState<string | null>(null)

  const confirmedPlayers = allPlayers.filter(p => selected[p.id])
  const paidCount        = confirmedPlayers.filter(p => paid[p.id]).length
  const newPot           = carriedOver + paidCount * buyIn

  const startGame = useMutation({
    mutationFn: async () => {
      // 1. Create the game
      const { data: game, error: gameErr } = await supabase
        .from('games')
        .insert({ buy_in: buyIn, carried_over: carriedOver, prize_pot: newPot, starting_round: startingRound, status: 'active' })
        .select()
        .single()
      if (gameErr) throw new Error(gameErr.message)

      // 2. Insert game_players for confirmed players
      const gpRows = confirmedPlayers.map(p => ({
        game_id:   game.id,
        player_id: p.id,
        paid:      paid[p.id] ?? false,
      }))
      if (gpRows.length > 0) {
        const { error: gpErr } = await supabase.from('game_players').insert(gpRows)
        if (gpErr) throw new Error(gpErr.message)
      }

      // 3. Reset all players to inactive, then activate confirmed players
      const allIds       = allPlayers.map(p => p.id)
      const confirmedIds = confirmedPlayers.map(p => p.id)

      if (allIds.length > 0) {
        const { error: resetErr } = await supabase
          .from('players').update({ is_active: false }).in('id', allIds)
        if (resetErr) throw new Error(resetErr.message)
      }
      if (confirmedIds.length > 0) {
        const { error: activeErr } = await supabase
          .from('players').update({ is_active: true }).in('id', confirmedIds)
        if (activeErr) throw new Error(activeErr.message)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEYS.players })
      onSuccess()
    },
    onError: (err: Error) => setError(err.message),
  })

  const roundOptions = Object.entries(STAGE_TO_ROUND)
    .filter(([stage]) => stage !== 'THIRD_PLACE')
    .map(([stage, round]) => ({ round, label: STAGE_LABELS[stage] ?? stage }))
    .sort((a, b) => a.round - b.round)

  return (
    <section style={{ ...sectionStyle, borderColor: 'var(--color-accent)' }}>
      <h2 style={sectionTitle}>Start New Game</h2>

      {carriedOver > 0 && (
        <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(35,134,54,0.1)', borderRadius: 8 }}>
          £{carriedOver.toFixed(2)} carried over from the previous game (everyone was eliminated).
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        <label style={labelStyle}>
          Buy-in (£)
          <input
            type="number"
            min={0}
            step={0.5}
            value={buyIn}
            onChange={e => setBuyIn(parseFloat(e.target.value) || 0)}
            style={inputStyle}
          />
        </label>
        <label style={labelStyle}>
          Starting Round
          <select
            value={startingRound}
            onChange={e => setStartingRound(parseInt(e.target.value))}
            style={inputStyle}
          >
            {roundOptions.map(({ round, label }) => (
              <option key={round} value={round}>{label}</option>
            ))}
          </select>
        </label>
      </div>

      <h3 style={{ marginBottom: 10, fontSize: '0.95rem' }}>Players</h3>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>In</th>
            <th style={thStyle}>Player</th>
            <th style={thStyle}>Paid</th>
          </tr>
        </thead>
        <tbody>
          {allPlayers.map(p => (
            <tr key={p.id}>
              <td style={tdStyle}>
                <input
                  type="checkbox"
                  checked={selected[p.id] ?? false}
                  onChange={e => setSelected(s => ({ ...s, [p.id]: e.target.checked }))}
                />
              </td>
              <td style={tdStyle}>{p.username}</td>
              <td style={tdStyle}>
                <input
                  type="checkbox"
                  disabled={!selected[p.id]}
                  checked={(selected[p.id] && paid[p.id]) ?? false}
                  onChange={e => setPaid(s => ({ ...s, [p.id]: e.target.checked }))}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: 16, padding: '12px 16px', background: 'var(--color-surface)', borderRadius: 8, border: '1px solid var(--color-border)' }}>
        <strong>Prize Pot: £{newPot.toFixed(2)}</strong>
        <span style={{ color: 'var(--color-muted)', fontSize: '0.85rem', marginLeft: 12 }}>
          ({paidCount} paid × £{buyIn.toFixed(2)} + £{carriedOver.toFixed(2)} carried over)
        </span>
      </div>

      {error && <p style={{ color: 'var(--color-danger)', marginTop: 12 }}>{error}</p>}

      <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
        <button
          className="btn btn-primary"
          onClick={() => startGame.mutate()}
          disabled={startGame.isPending || confirmedPlayers.length === 0}
        >
          {startGame.isPending ? 'Starting...' : 'Confirm & Start Game'}
        </button>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
      </div>
    </section>
  )
}

// ── Add Player Form ───────────────────────────────────────────
function AddPlayerForm({ gameId }: { gameId?: string }) {
  const [username, setUsername] = useState('')
  const [email, setEmail]       = useState('')
  const [result, setResult]     = useState<{ tempPassword: string; username: string } | null>(null)
  const [error, setError]       = useState<string | null>(null)
  const [loading, setLoading]   = useState(false)
  const queryClient             = useQueryClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setResult(null)
    setLoading(true)

    const { data: { session } } = await supabase.auth.getSession()

    const res = await supabase.functions.invoke('admin-create-player', {
      body: { username: username.trim(), email: email.trim(), gameId },
      headers: { Authorization: `Bearer ${session?.access_token}` },
    })

    setLoading(false)

    if (res.error || res.data?.error) {
      setError(res.data?.error ?? res.error?.message ?? 'Failed to create player')
      return
    }

    setResult({ tempPassword: res.data.tempPassword, username: res.data.username })
    setUsername('')
    setEmail('')
    queryClient.invalidateQueries({ queryKey: KEYS.players })
    queryClient.invalidateQueries({ queryKey: KEYS.gamePlayers(gameId) })
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 440 }}>
      <label style={labelStyle}>
        Username
        <input
          type="text"
          value={username}
          onChange={e => setUsername(e.target.value)}
          required
          style={inputStyle}
          placeholder="e.g. Charlie"
        />
      </label>
      <label style={labelStyle}>
        Email
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          style={inputStyle}
          placeholder="charlie@example.com"
        />
      </label>
      <button className="btn btn-primary" type="submit" disabled={loading} style={{ alignSelf: 'flex-start' }}>
        {loading ? 'Creating...' : 'Add Player'}
      </button>

      {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.875rem' }}>{error}</p>}

      {result && (
        <div style={{ padding: '12px 16px', background: 'rgba(35,134,54,0.1)', borderRadius: 8, border: '1px solid var(--color-accent)' }}>
          <strong>{result.username}</strong> created. Share these login details:
          <div style={{ marginTop: 8, fontFamily: 'monospace', fontSize: '0.85rem', background: 'var(--color-surface)', padding: '8px 12px', borderRadius: 6 }}>
            Temp password: <strong>{result.tempPassword}</strong>
          </div>
          <p style={{ fontSize: '0.78rem', color: 'var(--color-muted)', marginTop: 6 }}>
            They can change this after logging in.
          </p>
        </div>
      )}
    </form>
  )
}

// ── Small components ──────────────────────────────────────────
function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ padding: '12px 16px', background: 'var(--color-surface)', borderRadius: 8, border: `1px solid ${accent ? 'var(--color-accent)' : 'var(--color-border)'}` }}>
      <div style={{ fontSize: '1.4rem', fontWeight: 700, color: accent ? 'var(--color-accent)' : 'var(--color-text)' }}>{value}</div>
      <div style={{ fontSize: '0.75rem', color: 'var(--color-muted)', marginTop: 2 }}>{label}</div>
    </div>
  )
}

function StatusBadge({ status }: { status: Game['status'] }) {
  const map = {
    active:  { label: 'Active',      color: 'var(--color-accent)' },
    won:     { label: 'Won',         color: '#d4a017' },
    all_out: { label: 'All Out',     color: 'var(--color-danger)' },
  }
  const { label, color } = map[status]
  return (
    <span style={{ fontSize: '0.78rem', fontWeight: 700, color, border: `1px solid ${color}`, borderRadius: 4, padding: '2px 8px' }}>
      {label}
    </span>
  )
}

// ── Style constants ───────────────────────────────────────────
const sectionStyle: React.CSSProperties = {
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-md)',
  padding: '24px',
  marginBottom: '24px',
}
const sectionTitle: React.CSSProperties = {
  marginBottom: '16px',
  fontSize: '1.1rem',
}
const statRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
}
const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '0.875rem',
}
const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px 12px',
  borderBottom: '1px solid var(--color-border)',
  color: 'var(--color-muted)',
  fontSize: '0.78rem',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
}
const tdStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderBottom: '1px solid var(--color-border)',
}
const labelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  fontSize: '0.875rem',
  color: 'var(--color-muted)',
}
const inputStyle: React.CSSProperties = {
  padding: '8px 12px',
  background: 'var(--color-bg)',
  border: '1px solid var(--color-border)',
  borderRadius: 6,
  color: 'var(--color-text)',
  fontSize: '0.95rem',
}
