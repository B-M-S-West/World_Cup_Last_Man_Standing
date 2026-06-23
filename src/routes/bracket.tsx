import { createFileRoute, redirect } from '@tanstack/react-router'
import { format } from 'date-fns'
import { supabase } from '../lib/supabase'
import { useFixtures } from '../lib/queries'
import { type Fixture } from '../types'

export const Route = createFileRoute('/bracket')({
  beforeLoad: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw redirect({ to: '/login' })
  },
  component: BracketPage,
})

// ── Bracket wiring ────────────────────────────────────────────
// [topChildApiId, bottomChildApiId, parentApiId]
const BRACKET_CONNECTIONS: [number, number, number][] = [
  // Last 32 → Last 16
  [537417, 537415, 537376],
  [537418, 537423, 537375],
  [537416, 537424, 537377],
  [537425, 537426, 537378],
  [537422, 537421, 537379],
  [537420, 537419, 537380],
  [537429, 537428, 537381],
  [537427, 537430, 537382],
  // Last 16 → QF
  [537376, 537375, 537383],
  [537377, 537378, 537384],
  [537379, 537380, 537385],
  [537381, 537382, 537386],
  // QF → SF
  [537383, 537384, 537387],
  [537385, 537386, 537388],
  // SF → Final
  [537387, 537388, 537390],
]

const FINAL_API_ID       = 537390
const THIRD_PLACE_API_ID = 537389

// ── Tree ──────────────────────────────────────────────────────
type BracketNode = {
  fixture: Fixture | undefined
  top:    BracketNode | null
  bottom: BracketNode | null
}

function buildTree(apiId: number, byApiId: Record<number, Fixture>): BracketNode {
  const conn = BRACKET_CONNECTIONS.find(([, , p]) => p === apiId)
  return {
    fixture: byApiId[apiId],
    top:    conn ? buildTree(conn[0], byApiId) : null,
    bottom: conn ? buildTree(conn[1], byApiId) : null,
  }
}

// Returns rounds[0] = Last 32 ... rounds[n] = Final
function collectRounds(node: BracketNode): BracketNode[][] {
  const rounds: BracketNode[][] = []
  function walk(n: BracketNode, depth: number) {
    if (!rounds[depth]) rounds[depth] = []
    rounds[depth].push(n)
    if (n.top)    walk(n.top,    depth + 1)
    if (n.bottom) walk(n.bottom, depth + 1)
  }
  walk(node, 0)
  rounds.reverse()
  return rounds
}

// ── Layout math ───────────────────────────────────────────────
// All positions are in px. Cards are absolutely positioned.
// SVG lines are drawn between computed centres.

const CARD_H    = 76    // height of a match card
const CARD_W    = 184   // width of a match card
const INTER_COL = 52    // horizontal gap between right edge of col N and left edge of col N+1
const COL_STEP  = CARD_W + INTER_COL

// Vertical gap between consecutive cards within a round (doubles each round)
const gapBetween = (r: number) => CARD_H * (Math.pow(2, r) - 1)

// Top offset of first card in round r, so it centres against its children pair
const topOffset = (r: number) => (CARD_H / 2) * (Math.pow(2, r) - 1)

const cardLeft   = (r: number)           => r * COL_STEP
const cardTop    = (r: number, i: number) => topOffset(r) + i * (CARD_H + gapBetween(r))
const centrY     = (r: number, i: number) => cardTop(r, i) + CARD_H / 2

// Vertical rail X sits halfway across the inter-column gap
const railX = (childR: number) => cardLeft(childR) + CARD_W + INTER_COL / 2

const ROUND_LABELS = ['Round of 32', 'Round of 16', 'Quarter-Finals', 'Semi-Finals', 'Final']
const LABEL_H      = 28   // px above the bracket for round labels
const NUM_ROUNDS   = 5
const TOTAL_W      = (NUM_ROUNDS - 1) * COL_STEP + CARD_W
const BRACKET_H    = 16 * CARD_H   // Last 32: 16 cards × 76px, no gaps
const BORDER_COL   = '#30363d'     // var(--color-border)

// ── Page ──────────────────────────────────────────────────────
function BracketPage() {
  const { data: fixtures = [], isLoading } = useFixtures()

  if (isLoading) return <div className="loading">Loading bracket...</div>

  const byApiId: Record<number, Fixture> = {}
  for (const f of fixtures) byApiId[f.api_id] = f

  const root   = buildTree(FINAL_API_ID, byApiId)
  const rounds = collectRounds(root)

  // api_id → {r, i} for SVG line lookup
  const posMap = new Map<number, { r: number; i: number }>()
  rounds.forEach((nodes, r) =>
    nodes.forEach((node, i) => {
      if (node.fixture) posMap.set(node.fixture.api_id, { r, i })
    })
  )

  const thirdPlace = byApiId[THIRD_PLACE_API_ID]

  // Third place sits below the Final with a gap
  const finalR = NUM_ROUNDS - 1
  const thirdTop  = cardTop(finalR, 0) + CARD_H + 56
  const TOTAL_H   = LABEL_H + Math.max(BRACKET_H, thirdTop + CARD_H + 24)

  return (
    <div className="page-container" style={{ maxWidth: '100%', padding: '0 16px' }}>
      <h1 style={{ marginBottom: 4 }}>Tournament Bracket</h1>
      <p style={{ color: 'var(--color-muted)', marginBottom: 24, fontSize: '0.875rem' }}>
        WC2026 · Knockout Stage · Teams and results populate automatically
      </p>

      {/* Outer scroll wrapper */}
      <div style={{ overflowX: 'auto', overflowY: 'visible', paddingBottom: 32 }}>

        {/* Fixed-size canvas — cards + SVG positioned inside */}
        <div style={{ position: 'relative', width: TOTAL_W, height: TOTAL_H }}>

          {/* ── Round labels ── */}
          {ROUND_LABELS.map((label, r) => (
            <div key={r} style={{
              position: 'absolute',
              left: cardLeft(r),
              top: 0,
              width: CARD_W,
              textAlign: 'center',
              fontSize: '0.68rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '1px',
              color: 'var(--color-muted)',
            }}>
              {label}
            </div>
          ))}

          {/* ── SVG connector lines ── */}
          <svg
            style={{
              position: 'absolute',
              top: LABEL_H,
              left: 0,
              width: TOTAL_W,
              height: TOTAL_H - LABEL_H,
              pointerEvents: 'none',
              overflow: 'visible',
            }}
          >
            {BRACKET_CONNECTIONS.map(([topId, botId, parId], idx) => {
              const tp = posMap.get(topId)
              const bp = posMap.get(botId)
              const pp = posMap.get(parId)
              if (!tp || !bp || !pp) return null

              const topCY  = centrY(tp.r, tp.i)
              const botCY  = centrY(bp.r, bp.i)
              const parCY  = centrY(pp.r, pp.i)
              const rx     = railX(tp.r)
              const cRight = cardLeft(tp.r) + CARD_W
              const pLeft  = cardLeft(pp.r)

              return (
                <g key={idx} stroke={BORDER_COL} strokeWidth="2" fill="none" strokeLinecap="round">
                  {/* Top child → rail */}
                  <line x1={cRight} y1={topCY} x2={rx} y2={topCY} />
                  {/* Bottom child → rail */}
                  <line x1={cRight} y1={botCY} x2={rx} y2={botCY} />
                  {/* Vertical rail spanning both children */}
                  <line x1={rx} y1={topCY} x2={rx} y2={botCY} />
                  {/* Rail → parent */}
                  <line x1={rx} y1={parCY} x2={pLeft} y2={parCY} />
                </g>
              )
            })}
          </svg>

          {/* ── Match cards ── */}
          {rounds.map((nodes, r) =>
            nodes.map((node, i) => (
              <div
                key={`${r}-${i}`}
                style={{
                  position: 'absolute',
                  left: cardLeft(r),
                  top:  cardTop(r, i) + LABEL_H,
                  width: CARD_W,
                }}
              >
                <BracketMatch fixture={node.fixture} width={CARD_W} />
              </div>
            ))
          )}

          {/* ── Third place play-off ── */}
          {thirdPlace && (
            <div style={{
              position: 'absolute',
              left: cardLeft(finalR),
              top:  thirdTop + LABEL_H,
              width: CARD_W,
            }}>
              <div style={{
                fontSize: '0.65rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '1px',
                color: 'var(--color-muted)',
                textAlign: 'center',
                marginBottom: 8,
              }}>
                Third Place Play-off
              </div>
              <BracketMatch fixture={thirdPlace} width={CARD_W} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Match card ────────────────────────────────────────────────
function BracketMatch({ fixture, width }: { fixture: Fixture | undefined; width: number }) {
  if (!fixture) {
    return (
      <div style={cardShell(width)}>
        <TeamRow name="TBD" dimmed />
        <div style={divider} />
        <TeamRow name="TBD" dimmed />
      </div>
    )
  }

  const isFinished = fixture.status === 'FINISHED'
  const homeName   = fixture.home_team?.name ?? fixture.home_placeholder ?? 'TBD'
  const awayName   = fixture.away_team?.name ?? fixture.away_placeholder ?? 'TBD'

  let homeWon: boolean | null = null
  let awayWon: boolean | null = null
  if (isFinished && fixture.home_score !== null && fixture.away_score !== null) {
    homeWon = fixture.home_score > fixture.away_score
    awayWon = fixture.away_score > fixture.home_score
  }

  return (
    <div style={cardShell(width)}>
      {/* Date strip */}
      <div style={{
        fontSize: '0.63rem',
        color: 'var(--color-muted)',
        padding: '3px 8px',
        borderBottom: '1px solid var(--color-border)',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}>
        {format(new Date(fixture.kickoff_time), 'd MMM · HH:mm')}
      </div>

      <TeamRow
        name={homeName}
        crest={fixture.home_team?.crest_url}
        score={isFinished ? fixture.home_score ?? undefined : undefined}
        won={homeWon === true}
        dimmed={homeWon === false}
        isPlaceholder={!fixture.home_team}
      />
      <div style={divider} />
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
  name, crest, score, won, dimmed, isPlaceholder,
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
      minHeight: 28,
      background: won ? 'rgba(35,134,54,0.15)' : 'transparent',
      borderLeft: won ? '3px solid var(--color-accent)' : '3px solid transparent',
      opacity: dimmed ? 0.4 : 1,
    }}>
      {crest
        ? <img src={crest} alt="" width={16} height={16} style={{ objectFit: 'contain', flexShrink: 0 }} />
        : <div style={{ width: 16, height: 16, flexShrink: 0 }} />
      }
      <span style={{
        fontSize: '0.72rem',
        fontWeight: won ? 700 : 500,
        color: isPlaceholder ? 'var(--color-muted)' : 'var(--color-text)',
        fontStyle: isPlaceholder ? 'italic' : 'normal',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        flex: 1,
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

const divider: React.CSSProperties = {
  height: 1,
  background: 'var(--color-border)',
}

function cardShell(width: number): React.CSSProperties {
  return {
    width,
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    overflow: 'hidden',
    boxShadow: 'var(--shadow-card)',
  }
}
