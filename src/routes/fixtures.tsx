import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { format } from 'date-fns'
import { useFixtures } from '../lib/queries'
import { STAGE_LABELS, STAGES_IN_ORDER, type Fixture, type FixtureStage } from '../types'

export const Route = createFileRoute('/fixtures')({
  component: FixturesPage,
})

function FixturesPage() {
  const [selectedStage, setSelectedStage] = useState<FixtureStage | undefined>(undefined)
  const { data: fixtures = [], isLoading } = useFixtures(selectedStage)
  const { data: allFixtures = [] } = useFixtures()

  // Group fixtures by date for display
  const byDate: Record<string, Fixture[]> = {}
  for (const f of fixtures) {
    const date = f.kickoff_time.slice(0, 10)
    if (!byDate[date]) byDate[date] = []
    byDate[date].push(f)
  }

  // Only show filter buttons for stages that have fixtures
  const stagesWithData = new Set(allFixtures.map(f => f.stage))

  return (
    <div className="page-container">
      <h1>Fixtures &amp; Results</h1>

      <div className="stage-filter">
        <button
          className={`btn btn-ghost ${!selectedStage ? 'active' : ''}`}
          onClick={() => setSelectedStage(undefined)}
        >
          All
        </button>
        {STAGES_IN_ORDER.filter(s => stagesWithData.has(s)).map(stage => (
          <button
            key={stage}
            className={`btn btn-ghost ${selectedStage === stage ? 'active' : ''}`}
            onClick={() => setSelectedStage(stage)}
          >
            {STAGE_LABELS[stage]}
          </button>
        ))}
      </div>

      {isLoading && <div className="loading">Loading fixtures...</div>}

      {!isLoading && Object.keys(byDate).length === 0 && (
        <p style={{ color: 'var(--color-muted)' }}>
          No fixtures found. Data will appear once the sync function has run.
        </p>
      )}

      {Object.entries(byDate).map(([date, dayFixtures]) => (
        <div key={date} className="fixture-day">
          <h3>{format(new Date(date + 'T12:00:00'), 'EEEE d MMMM yyyy')}</h3>
          {dayFixtures.map(fixture => (
            <FixtureCard key={fixture.id} fixture={fixture} />
          ))}
        </div>
      ))}
    </div>
  )
}

function FixtureCard({ fixture }: { fixture: Fixture }) {
  const isLive     = fixture.status === 'IN_PLAY' || fixture.status === 'PAUSED'
  const isFinished = fixture.status === 'FINISHED'

  return (
    <div className={`fixture-card fixture-card--${fixture.status.toLowerCase()}`}>
      <div className="fixture-teams">
        <span className="fixture-team">
          {fixture.home_team?.crest_url && (
            <img src={fixture.home_team.crest_url} alt={fixture.home_team.name} />
          )}
          {fixture.home_team?.name ?? fixture.home_placeholder ?? '—'}
        </span>

        <div className="fixture-score">
          {isFinished && (
            <strong>{fixture.home_score} – {fixture.away_score}</strong>
          )}
          {isLive && <span className="live-badge">LIVE</span>}
          {!isFinished && !isLive && (
            <span className="kickoff-time">
              {format(new Date(fixture.kickoff_time), 'HH:mm')}
            </span>
          )}
        </div>

        <span className="fixture-team fixture-team--away">
          {fixture.away_team?.name ?? fixture.away_placeholder ?? '—'}
          {fixture.away_team?.crest_url && (
            <img src={fixture.away_team.crest_url} alt={fixture.away_team.name} />
          )}
        </span>
      </div>

      <div className="fixture-meta">
        {fixture.group_id && <span>Group {fixture.group_id}</span>}
        {!fixture.group_id && STAGE_LABELS[fixture.stage] && (
          <span>{STAGE_LABELS[fixture.stage]}</span>
        )}
        {fixture.matchday && <span>Matchday {fixture.matchday}</span>}
        {isFinished && <span>FT</span>}
      </div>
    </div>
  )
}