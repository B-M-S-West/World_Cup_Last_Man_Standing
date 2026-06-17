import { createFileRoute, redirect } from '@tanstack/react-router'
import { supabase } from '../lib/supabase'
import { useGroups } from '../lib/queries'
import type { StandingRow } from '../types'

export const Route = createFileRoute('/groups')({
  beforeLoad: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw redirect({ to: '/login' })
  },
  component: GroupsPage,
})

function GroupsPage() {
  const { data: groups, isLoading, isError } = useGroups()

  if (isLoading) return <div className="loading">Loading group standings...</div>
  if (isError)   return <div className="loading">Failed to load standings. Try refreshing.</div>

  const groupLetters = Object.keys(groups ?? {}).sort()

  if (groupLetters.length === 0) {
    return (
      <div className="page-container">
        <h1>Group Standings</h1>
        <p style={{ color: 'var(--color-muted)' }}>
          Standings will appear once the tournament begins.
        </p>
      </div>
    )
  }

  return (
    <div className="page-container">
      <h1>Group Standings</h1>
      <div className="groups-grid">
        {groupLetters.map(letter => (
          <GroupTable
            key={letter}
            letter={letter}
            rows={(groups ?? {})[letter]}
          />
        ))}
      </div>
    </div>
  )
}

function GroupTable({ letter, rows }: { letter: string; rows: StandingRow[] }) {
  return (
    <div className="card group-table">
      <h2>Group {letter}</h2>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Team</th>
            <th title="Played">P</th>
            <th title="Won">W</th>
            <th title="Drawn">D</th>
            <th title="Lost">L</th>
            <th title="Goal Difference">GD</th>
            <th title="Points">Pts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.team_id} className={row.position <= 2 ? 'qualified' : ''}>
              <td>{row.position}</td>
              <td>
                <div className="team-cell">
                  {row.team?.crest_url && (
                    <img src={row.team.crest_url} alt={row.team.name} />
                  )}
                  <span>{row.team?.name ?? row.team_id}</span>
                </div>
              </td>
              <td>{row.played}</td>
              <td>{row.won}</td>
              <td>{row.drawn}</td>
              <td>{row.lost}</td>
              <td style={{
                color: row.goal_diff > 0
                  ? 'var(--color-accent)'
                  : row.goal_diff < 0
                  ? 'var(--color-danger)'
                  : 'inherit'
              }}>
                {row.goal_diff > 0 ? `+${row.goal_diff}` : row.goal_diff}
              </td>
              <td><strong>{row.points}</strong></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}