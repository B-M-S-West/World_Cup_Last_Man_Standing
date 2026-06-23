import { createFileRoute, redirect } from '@tanstack/react-router'
import { format } from 'date-fns'
import { supabase } from '../lib/supabase'
import { useFixtures } from '../lib/queries'
import { STAGE_LABELS, type Fixture } from '../types'

export const Route = createFileRoute('/bracket')({
  beforeLoad: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw redirect({ to: '/login' })
  },
  component: BracketPage,
})

// ── Bracket wiring ────────────────────────────────────────────
// [topChildApiId, bottomChildApiId, parentApiId]
// Top child → home slot, bottom child → away slot of parent.
// ⚠️ Best-effort based on FIFA bracket numbering — verify once Last 32 begins.
const BRACKET_CONNECTIONS: [number, number, number][] = [
  // Last 32 pairs → Last 16
  [537417, 537415, 537376],
  [537418, 537423, 537375],
  [537416, 537424, 537377],
  [537425, 537426, 537378],
  [537422, 537421, 537379],
  [537420, 537419, 537380],
  [537429, 537428, 537381],
  [537427, 537430, 537382],
  // Last 16 pairs → QF
  [537376, 537375, 537383],
  [537377, 537378, 537384],
  [537379, 537380, 537385],
  [537381, 537382, 537386],
  // QF pairs → SF
  [537383, 537384, 537387],
  [537385, 537386, 537388],
  // SF → Final
  [537387, 537388, 537390],
]

// SF api_ids whose losers go to the third-place play-off
const THIRD_PLACE_API_ID = 537389
const FINAL_API_ID = 537390

// ── Tree types ────────────────────────────────────────────────
type BracketNode = {
  fixture: Fixture | undefined
  top: BracketNode | null
  bottom: BracketNode | null
}

function buildTree(
  apiId: number,
  byApiId: Record<number, Fixture>,
): BracketNode {
  const connection = BRACKET_CONNECTIONS.find(([, , parent]) => parent === apiId)
  return {
    fixture: byApiId[apiId],
    top:    connection ? buildTree(connection[0], byApiId) : null,
    bottom: connection ? buildTree(connection[1], byApiId) : null,
  }
}

// Flatten tree into columns (rounds), left = deepest children
function collectRounds(node: BracketNode): BracketNode[][] {
  const rounds: BracketNode[][] = []
  function walk(n: BracketNode, depth: number) {
    if (!rounds[depth]) rounds[depth] = []
    rounds[depth].push(n)
    if (n.top)    walk(n.top,    depth + 1)
    if (n.bottom) walk(n.bottom, depth + 1)
  }
  walk(node, 0)
  rounds.reverse() // leftmost = Last 32
  return rounds
}

// ── Dimensions ────────────────────────────────────────────────
const CARD_HEIGHT   = 76   // px — two team rows + header
const CARD_WIDTH    = 176  // px
const CONNECTOR_W   = 28   // px — horizontal connector arm width
const ROUND_GAP     = CONNECTOR_W * 2

// Vertical gap between match pairs within a round (doubles each round)
function pairGap(roundIndex: number): number {
  // roundIndex 0 = Last 32 (no gap), 1 = Last 16, ...
  if (roundIndex === 0) return 0
  return CARD_HEIGHT * (Math.pow(2, roundIndex) - 1)
}

// ── Main page ─────────────────────────────────────────────────
function BracketPage() {
  const { data: fixtures = [], isLoading } = useFixtures()

  if (isLoading) return <div className="loading">Loading bracket...</div>

  const byApiId: Record<number, Fixture> = {}
  for (const f of fixtures) byApiId[f.api_id] = f

  const root       = buildTree(FINAL_API_ID, byApiId)
  const rounds     = collectRounds(root)
  const thirdPlace = byApiId[THIRD_PLACE_API_ID]

  const roundLabels: Record<number, string> = {
    0: 'Round of 32',
    1: 'Round of 16',
    2: 'Quarter-Finals',
    3: 'Semi-Finals',
    4: 'Final',
  }

  return (
    <div className="page-container" style={{ maxWidth: '100%', paddingLeft: 16, paddingRight: 16 }}>
      <h1 style={{ marginBottom: 4 }}>Tournament Bracket</h1>
      <p style={{ color: 'var(--color-muted)', marginBottom: 24, fontSize: '0.875rem' }}>
        WC2026 · Knockout Stage · Teams and results populate automatically
      </p>

      {/* Horizontal scroll wrapper */}
      <div style={{ overflowX: 'auto', overflowY: 'visible', paddingBottom: 32 }}>
        <div style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 0,
          minWidth: rounds.length * (CARD_WIDTH + ROUND_GAP),
        }}>
          {rounds.map((roundNodes, roundIdx) => (
            <div key={roundIdx} style={{ display: 'flex', flexDirection: 'column' }}>
              {/* Round label */}
              <div style={{
                width: CARD_WIDTH + ROUND_GAP,
                textAlign: 'center',
                fontSize: '0.7rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '1px',
                color: 'var(--color-muted)',
                paddingBottom: 10,
                paddingLeft: roundIdx === 0 ? 0 : CONNECTOR_W,
              }}>
                {roundLabels[roundIdx] ?? ''}
              </div>

              {/* Match cards for this round */}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {roundNodes.map((node, nodeIdx) => {
                  const isLast   = roundIdx === rounds.length - 1
                  const isFirst  = roundIdx === 0
                  const gap      = pairGap(roundIdx)
                  // Add top margin for every even-indexed card (start of a pair) except first
                  const marginTop = nodeIdx > 0 && nodeIdx % 2 === 0 ? gap : 0

                  return (
                    <div
                      key={nodeIdx}
                      style={{
                        marginTop,
                        display: 'flex',
                        alignItems: 'center',
                      }}
                    >
                      {/* Left connector arm (not on first round) */}
                      {!isFirst && (
                        <ConnectorArm
                          cardHeight={CARD_HEIGHT}
                          width={CONNECTOR_W}
                          isTop={nodeIdx % 2 === 0}
                          isBottom={nodeIdx % 2 === 1}
                          siblingGap={pairGap(roundIdx - 1)}
                        />
                      )}

                      {/* Match card */}
                      <BracketMatch
                        fixture={node.fixture}
                        width={CARD_WIDTH}
                      />

                      {/* Right connector arm (not on final) */}
                      {!isLast && (
                        <div style={{
                          width: CONNECTOR_W,
                          height: 2,
                          background: 'var(--color-border)',
                          flexShrink: 0,
                        }} />
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Third place play-off */}
        {thirdPlace && (
          <div style={{ marginTop: 40, paddingLeft: 0 }}>
            <div style={{
              fontSize: '0.7rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '1px',
              color: 'var(--color-muted)',
              marginBottom: 10,
            }}>
              Third Place Play-off
            </div>
            <BracketMatch fixture={thirdPlace} width={CARD_WIDTH} />
          </div>
        )}
      </div>
    </div>
  )
}

// ── Connector arm ─────────────────────────────────────────────
// Draws the ├─ / └─ shaped connector on the left of a card
function ConnectorArm({
  cardHeight,
  width,
  isTop,
  isBottom,
  siblingGap,
}: {
  cardHeight: number
  width: number
  isTop: boolean
  isBottom: boolean
  siblingGap: number
}) {
  // Vertical extent: half of (cardHeight + siblingGap)
  const verticalReach = (cardHeight + siblingGap) / 2

  return (
    <div style={{ position: 'relative', width, flexShrink: 0, height: cardHeight }}>
      {/* Horizontal line from vertical rail to card */}
      <div style={{
        position: 'absolute',
        top: '50%',
        left: width / 2,
        right: 0,
        height: 2,
        background: 'var(--color-border)',
        transform: 'translateY(-1px)',
      }} />

      {/* Vertical rail — extends up (for top card) or down (for bottom card) */}
      <div style={{
        position: 'absolute',
        left: width / 2 - 1,
        width: 2,
        background: 'var(--color-border)',
        ...(isTop ? {
          top: '50%',
          height: verticalReach,
        } : {
          bottom: '50%',
          height: verticalReach,
        }),
      }} />
    </div>
  )
}

// ── Match card ────────────────────────────────────────────────
function BracketMatch({
  fixture,
  width,
}: {
  fixture: Fixture | undefined
  width: number
}) {
  if (!fixture) {
    return (
      <div style={cardStyle(width)}>
        <TeamRow name="TBD" dimmed />
        <div style={dividerStyle} />
        <TeamRow name="TBD" dimmed />
      </div>
    )
  }

  const isFinished = fixture.status === 'FINISHED'
  const homeName   = fixture.home_team?.name ?? fixture.home_placeholder ?? 'TBD'
  const awayName   = fixture.away_team?.name ?? fixture.away_placeholder ?? 'TBD'

  // Determine winner for highlighting
  let homeWon: boolean | null = null
  let awayWon: boolean | null = null
  if (isFinished && fixture.home_score !== null && fixture.away_score !== null) {
    homeWon = fixture.home_score > fixture.away_score
    awayWon = fixture.away_score > fixture.home_score
  }

  return (
    <div style={cardStyle(width)}>
      {/* Kickoff date strip */}
      <div style={{
        fontSize: '0.65rem',
        color: 'var(--color-muted)',
        padding: '4px 8px 3px',
        borderBottom: '1px solid var(--color-border)',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}>
        {format(new Date(fixture.kickoff_time), 'd MMM · HH:mm')}
      </div>

      {/* Home team */}
      <TeamRow
        name={homeName}
        crest={fixture.home_team?.crest_url}
        score={isFinished ? fixture.home_score ?? undefined : undefined}
        won={homeWon === true}
        dimmed={homeWon === false}
        isPlaceholder={!fixture.home_team}
      />

      <div style={dividerStyle} />

      {/* Away team */}
      <TeamRow
        name={awayName}
        crest={fixture.away_team?.crest_url}
        score={isFinished ? fixture.away_score ?? undefined : undefined}
        won={awayWon === true}
        dimmed={awayWon === false}
        isPlaceholder={!fixture.away_team}
      />
    </div>
  )
}

function TeamRow({
  name,
  crest,
  score,
  won,
  dimmed,
  isPlaceholder,
}: {
  name: string
  crest?: string | null
  score?: number
  won?: boolean
  dimmed?: boolean
  isPlaceholder?: boolean
}) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: '5px 8px',
      background: won ? 'rgba(35,134,54,0.15)' : 'transparent',
      borderLeft: won ? '3px solid var(--color-accent)' : '3px solid transparent',
      opacity: dimmed ? 0.45 : 1,
      minHeight: 28,
    }}>
      {crest ? (
        <img
          src={crest}
          alt=""
          width={16}
          height={16}
          style={{ objectFit: 'contain', flexShrink: 0 }}
        />
      ) : (
        <div style={{ width: 16, height: 16, flexShrink: 0 }} />
      )}
      <span style={{
        fontSize: '0.72rem',
        fontWeight: won ? 700 : 500,
        color: isPlaceholder ? 'var(--color-muted)' : 'var(--color-text)',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        flex: 1,
        fontStyle: isPlaceholder ? 'italic' : 'normal',
      }}>
        {name}
      </span>
      {score !== undefined && (
        <span style={{
          fontSize: '0.75rem',
          fontWeight: 700,
          color: won ? 'var(--color-accent)' : 'var(--color-text)',
          marginLeft: 4,
          flexShrink: 0,
        }}>
          {score}
        </span>
      )}
    </div>
  )
}

// ── Shared styles ─────────────────────────────────────────────
const dividerStyle: React.CSSProperties = {
  height: 1,
  background: 'var(--color-border)',
  margin: '0',
}

function cardStyle(width: number): React.CSSProperties {
  return {
    width,
    flexShrink: 0,
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    overflow: 'hidden',
    boxShadow: 'var(--shadow-card)',
  }
}
