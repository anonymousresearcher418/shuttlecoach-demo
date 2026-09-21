import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, ChevronDown, Eye, EyeOff, FlaskConical, Link2, LogOut, Minus, PlayCircle, Plus, Shuffle, Trash2 } from 'lucide-react'
import type { MethodOutput, ReviewBundle, ReviewCase } from './types'
import { FindingAssessment, FindingAssessmentContext, type FindingJudgment } from './FindingAssessment'
import { LanguageControl, ReviewLanguageContext, localizedField, localizedFinding, useReviewLanguage, type ReviewLanguage } from './Language'

const BUNDLE_URL = '/data/review_bundle.json'
const RATINGS_KEY = 'shuttlecoach-qualitative-local-ratings-v1'
const DIMENSIONS = [
  ['accuracy', 'Accuracy', 'Is the coaching interpretation correct?'],
  ['comprehensiveness', 'Comprehensiveness', 'Does it cover the important issues in sufficient depth?'],
  ['professionalism', 'Professionalism', 'Is it specific and appropriate for expert badminton coaching?'],
  ['actionability', 'Actionability', 'Are the corrections concrete and practical for the player?'],
] as const
type RatingDimension = typeof DIMENSIONS[number][0]
export type MissedFinding = { missed_id: string; name: string; severity: 'low' | 'medium' | 'high' }
type RatingRecord = { case_id: string; method_id: string; schema_version?: string; scores: Record<RatingDimension, number>; harmful_misleading: boolean; comment: string; finding_judgments?: FindingJudgment[]; missed_findings?: MissedFinding[]; missed_findings_complete?: boolean; saved_at: string }
type RatingMap = Record<string, RatingRecord>
const presentationKey = (caseId: string, methodId: string) => `${caseId}::${methodId}`
const ORDER_SEED_KEY = 'shuttlecoach-internal-order-seed-v1'
const stableWeight = (value: string) => { let hash = 2166136261; for (const character of value) { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 16777619) } return hash >>> 0 }
const newSeed = () => Math.random().toString(36).slice(2)
const readSeed = () => { try { const stored = sessionStorage.getItem(ORDER_SEED_KEY); if (stored) return stored; const fresh = newSeed(); sessionStorage.setItem(ORDER_SEED_KEY, fresh); return fresh } catch { return 'default' } }
const loadRatings = (): RatingMap => { try { return JSON.parse(localStorage.getItem(RATINGS_KEY) || '{}') } catch { return {} } }
const readable = (value?: string) => (value || 'unspecified').replaceAll('_', ' ')
const relationLabel = (value?: string) => ({ causes: 'cause', correlates_with: 'occurs with', compensates_for: 'may compensate for' }[value || ''] || readable(value))
const SOURCE_VIDEO_FPS = 10
const ORIGINAL_STROKE_SECONDS = 2.5
const FULL_STROKE_FRAMES = 150
const ORIGINAL_PLAYBACK_RATE = FULL_STROKE_FRAMES / SOURCE_VIDEO_FPS / ORIGINAL_STROKE_SECONDS
const playbackRates = [
  { label: '0.25×', value: ORIGINAL_PLAYBACK_RATE * .25 },
  { label: '0.5×', value: ORIGINAL_PLAYBACK_RATE * .5 },
  { label: 'Original · 1×', value: ORIGINAL_PLAYBACK_RATE },
]
const stripThinking = (text?: string) => {
  let value = String(text || '').replaceAll('&lt;', '<').replaceAll('&gt;', '>')
  value = value.replace(/<think\b[^>]*>[\s\S]*?<\/think\s*>/gi, '')
  value = value.replace(/<think\b[^>]*>[\s\S]*$/gi, '')
  value = value.replace(/^[\s\S]*?<\/think\s*>/i, '')
  return value.trim()
}
const splitChainCoaching = (text?: string) => {
  const clean = stripThinking(text)
  const paragraphs = clean.split(/\n\s*\n+/).map(value => value.trim()).filter(Boolean)
  if (paragraphs.length < 2) return { summary: clean, nextSteps: '' }
  return { summary: paragraphs.slice(0, -1).join('\n\n'), nextSteps: paragraphs.at(-1) || '' }
}

export const findingInventory = (output: MethodOutput): Array<{ finding_id: string; finding_label: string }> => {
  const content = output.structured_evidence || {}
  if (output.content_format === 'plain_llm_coaching/v1') return (content.confirmed_findings || []).map((item: any, index: number) => ({ finding_id: String(item.finding_id || `coaching_finding_${index + 1}`), finding_label: String(item.name || item.finding_id || `Coaching finding ${index + 1}`) }))
  if (output.method.method_family === 'shuttlecoach') return [...(content.confirmed_findings || []).map((item: any, index: number) => ({ finding_id: String(item.finding_id || `measured_finding_${index + 1}`), finding_label: String(item.name || item.finding_id || `Measured finding ${index + 1}`) })), ...(content.additional_visual_hypotheses || []).map((item: any, index: number) => ({ finding_id: String(item.finding_id || item.hypothesis_id || `visual_hypothesis_${index + 1}`), finding_label: String(item.name || item.finding_id || `Coaching finding ${index + 1}`) }))]
  const model = output.internal_evidence?.model_specific || {}
  return [{ key: 'chain', rows: model.chain_reports || [] }, { key: 'component', rows: model.component_alerts || [] }].flatMap(group => group.rows.map((item: any, index: number) => ({ finding_id: `${group.key}_${index + 1}`, finding_label: String(item.description || item.chain || item.component || item.node || `${group.key} finding ${index + 1}`) })))
}

export function Badge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: string }) { return <span className={`badge badge-${tone}`}>{children}</span> }
function Empty({ children }: { children: React.ReactNode }) { return <div className="empty"><CheckCircle2 size={18} />{children}</div> }

function VideoPlayer({ src, label, actual = false }: { src: string; label: string; actual?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null), [speedFactor, setSpeedFactor] = useState(1)
  const speed = (actual ? 1 : ORIGINAL_PLAYBACK_RATE) * speedFactor
  const applySpeed = () => { if (ref.current) ref.current.playbackRate = speed }
  useEffect(applySpeed, [src, speed])
  const change = async (factor: number) => {
    setSpeedFactor(factor)
    if (!ref.current) return
    ref.current.pause()
    ref.current.currentTime = 0
    ref.current.playbackRate = (actual ? 1 : ORIGINAL_PLAYBACK_RATE) * factor
    try { await ref.current.play() } catch { /* Browser retains the selected rate if playback is unavailable. */ }
  }
  const options = [{ label: '0.25×', factor: .25 }, { label: '0.5×', factor: .5 }, { label: 'Original · 1×', factor: 1 }]
  return <div className="video-player"><video ref={ref} controls preload="metadata" src={src} aria-label={label} onLoadedMetadata={applySpeed} /><div className="speed-control"><span>Actual stroke speed</span>{options.map(item => <button key={item.label} className={speedFactor === item.factor ? 'active' : ''} onClick={() => change(item.factor)}>{item.label}</button>)}<small>{actual ? 'Original = the real player-video playback rate.' : 'Original = 2.5 s; generated source file = 15 s at 10 FPS.'} Changing speed restarts from frame 1.</small></div></div>
}

function ComparisonVideos({ player, expert }: { player: string; expert: string }) {
  const playerRef = useRef<HTMLVideoElement>(null), expertRef = useRef<HTMLVideoElement>(null)
  const [speed, setSpeed] = useState(ORIGINAL_PLAYBACK_RATE), [playing, setPlaying] = useState(false)
  const applySpeed = () => { for (const video of [playerRef.current, expertRef.current]) if (video) video.playbackRate = speed }
  useEffect(applySpeed, [player, expert, speed])
  const changeSpeed = async (value: number) => {
    setSpeed(value)
    const videos = [playerRef.current, expertRef.current].filter(Boolean) as HTMLVideoElement[]
    videos.forEach(video => { video.pause(); video.currentTime = 0; video.playbackRate = value })
    try { await Promise.all(videos.map(video => video.play())); setPlaying(true) } catch { setPlaying(false) }
  }
  const toggle = async () => {
    const videos = [playerRef.current, expertRef.current].filter(Boolean) as HTMLVideoElement[]
    if (playing) { videos.forEach(video => video.pause()); setPlaying(false); return }
    videos.forEach(video => { video.pause(); video.currentTime = 0; video.playbackRate = speed })
    await Promise.all(videos.map(video => video.play())); setPlaying(true)
  }
  return <div><div className="comparison-toolbar"><span>Start both phrase videos together.</span><button onClick={toggle}>{playing ? 'Pause both' : 'Play together'}</button></div><div className="comparison-grid"><div><strong>Player</strong><video ref={playerRef} controls preload="metadata" src={player} onLoadedMetadata={applySpeed} onEnded={() => setPlaying(false)} /></div><div><strong>Matched expert</strong><video ref={expertRef} controls preload="metadata" src={expert} onLoadedMetadata={applySpeed} onEnded={() => setPlaying(false)} /></div></div><div className="speed-control"><span>Actual stroke speed</span>{playbackRates.map(item => <button key={item.label} className={speed === item.value ? 'active' : ''} onClick={() => changeSpeed(item.value)}>{item.label}</button>)}<small>Original = 6× source-file playback. Changing speed restarts both videos from frame 1.</small></div></div>
}

function EvidenceAsset({ sensor }: { sensor: Record<string, any> }) {
  const language = useReviewLanguage()
  const [plotIndex, setPlotIndex] = useState(0)
  if (sensor.kind === 'video_comparison') return <ComparisonVideos player={sensor.learner_video} expert={sensor.expert_video} />
  if (sensor.kind === 'image_comparison') return <div className="comparison-grid evidence-comparison-grid"><div><strong>{sensor.learner_label || 'Player'}</strong><div className="evidence-image"><img src={sensor.learner_image} alt={sensor.learner_label || 'Player evidence'} /></div></div><div><strong>{sensor.comparison_label || 'Player and expert comparison'}</strong><div className="evidence-image"><img src={sensor.comparison_image} alt={sensor.comparison_label || 'Player and expert comparison'} /></div></div></div>
  const plots = sensor.plots || [], plot = plots[Math.min(plotIndex, plots.length - 1)]
  if (!plot) return <Empty>No comparison visual is available for this signal.</Empty>
  return <div><div className="asset-tabs">{plots.map((item: any, index: number) => <button className={index === plotIndex ? 'active' : ''} onClick={() => setPlotIndex(index)} key={item.id || index}>{item.label}</button>)}</div><div className="evidence-image"><img src={plot.path} alt={`${sensor.label}: ${plot.label}`} /></div>{sensor.note && <p className="section-help">{language === 'zh-Hant' ? sensor.note_zh_hant || sensor.note : sensor.note}</p>}</div>
}

function FindingEvidence({ output, finding }: { output: MethodOutput; finding: Record<string, any> }) {
  const phase = output.review_evidence?.prepared_phases?.phases?.[finding.phase]
  const requested = new Set([finding.primary_modality, ...(finding.evidence_modalities || [])].filter(Boolean))
  const allowed = new Set(output.review_evidence?.measurement_evidence_modalities || [])
  const visible = (sensor: string, category?: string) => {
    const allowedMatch = !allowed.size || allowed.has(sensor) || (category === 'insole' && (allowed.has('insole_l') || allowed.has('insole_r')))
    const requestedMatch = !requested.size || requested.has(sensor) || (category === 'insole' && requested.has('insole'))
    return allowedMatch && requestedMatch
  }
  const phasePrepared = (phase?.sensors || [])
    .filter((item: any) => visible(item.sensor, item.category))
    .map((item: any) => item.category === 'insole'
      ? { ...item, sensor: 'insole', label: 'Insole dashboard', plots: (item.plots || []).filter((plot: any) => plot.id === 'pressure'), view_id: 'comparison-insole' }
      : { ...item, view_id: `comparison-${item.sensor}` })
    .filter((item: any, index: number, items: any[]) => items.findIndex(candidate => candidate.view_id === item.view_id) === index)
  const insoleDashboard = output.review_evidence?.insole_dashboard
  const prepared = requested.has('insole') && insoleDashboard
    ? [{ ...insoleDashboard, view_id: 'comparison-insole' }]
    : phasePrepared
  const coachVisualOnly = new Set(['eye_gaze', 'insole_l', 'insole_r'])
  const anomaly = (output.review_evidence?.sensor_evidence || []).filter((item: any) => !coachVisualOnly.has(item.sensor) && visible(item.sensor, item.category) && (item.plots || []).length).map((item: any) => ({ ...item, kind: 'plots', label: `${item.label} anomaly evidence`, view_id: `anomaly-${item.sensor}` }))
  const sensors = [...prepared, ...anomaly]
  const [selectedIndex, setSelectedIndex] = useState(0), selected = sensors[Math.min(selectedIndex, sensors.length - 1)]
  if (!selected) return null
  return <details className="finding-visuals"><summary><PlayCircle size={17} /><span><strong>Player and expert evidence</strong><small>Phrase comparison, anomaly timeline, and body-part or sensor contributions</small></span><ChevronDown size={16} /></summary><div className="finding-visual-body"><div className="asset-tabs">{sensors.map((item: any, index: number) => <button className={index === selectedIndex ? 'active' : ''} onClick={() => setSelectedIndex(index)} key={item.view_id}>{item.label}</button>)}</div><EvidenceAsset sensor={selected} /></div></details>
}

function FindingCard({ finding, output, relationships, names }: { finding: Record<string, any>; output: MethodOutput; relationships: Record<string, any>[]; names: Map<string, string> }) {
  const language = useReviewLanguage()
  const evidence = finding.deterministic_evidence || {}, reviews = finding.visual_reviews || []
  const findingModalities = new Set([finding.primary_modality, ...(finding.evidence_modalities || [])].filter(Boolean))
  const configuredModalities = new Set(output.review_evidence?.measurement_evidence_modalities || [])
  const showMeasurementEvidence = !configuredModalities.size || [...findingModalities].some(modality =>
    configuredModalities.has(modality) ||
    (modality === 'insole' && (configuredModalities.has('insole_l') || configuredModalities.has('insole_r')))
  )
  const links = relationships.filter(item => item.source_finding_id === finding.finding_id || item.target_finding_id === finding.finding_id)
  const jump = (id: string) => document.getElementById(`finding-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  const originalLabel = String(finding.name || finding.finding_id), localized = localizedFinding(finding, language)
  const label = localized.name, findingId = String(finding.finding_id)
  return <article className="finding-card" id={`finding-${finding.finding_id}`}><div className="finding-heading"><div><p className="eyebrow">Measured coaching finding</p><h3>{label}</h3></div><div className="badges"><Badge tone="blue">{readable(finding.phase)}</Badge>{finding.severity && <Badge tone="amber">{finding.severity}</Badge>}</div></div>
    {links.length > 0 && <div className="linked-tags">{links.map((item, index) => { const other = item.source_finding_id === finding.finding_id ? item.target_finding_id : item.source_finding_id; return <button key={index} onClick={() => jump(other)}><Link2 size={12} />{relationLabel(item.relationship)}: {names.get(other) || other}</button> })}</div>}
    {localized.details && <p className="lead">{localized.details}</p>}{(finding.affected_regions || []).length > 0 && <p className="meta"><strong>Body area:</strong> {finding.affected_regions.join(', ').replaceAll('_', ' ')}</p>}
    {finding.body_region && <p className="meta"><strong>Body area:</strong> {finding.body_region}</p>}
    {(finding.observed_evidence || finding.why_it_matters || finding.actionable_cue || finding.suggested_drill) && <details className="details"><summary>Coaching evidence and action <ChevronDown size={16} /></summary><div className="detail-grid">{finding.observed_evidence && <div><strong>What was observed</strong><p>{localizedField(finding, 'observed_evidence', language)}</p></div>}{finding.why_it_matters && <div><strong>Why it may matter</strong><p>{localizedField(finding, 'why_it_matters', language)}</p></div>}{finding.actionable_cue && <div><strong>Coaching cue</strong><p>{localizedField(finding, 'actionable_cue', language)}</p></div>}{finding.suggested_drill && <div><strong>Practice</strong><p>{localizedField(finding, 'suggested_drill', language)}</p></div>}</div></details>}
    {showMeasurementEvidence && (evidence.raw_evidence_results || []).length > 0 && <details className="details"><summary>Measurement details <ChevronDown size={16} /></summary><div className="raw-results">{evidence.raw_evidence_results.map((item: any, i: number) => { const key = item.evaluation ? 'evaluation' : item.details ? 'details' : item.criterion ? 'criterion' : ''; return <p key={i}>{key ? localizedField(item, key, language) : `Recorded deviation: ${item.deviation ?? 'available'}`}</p> })}</div></details>}
    {showMeasurementEvidence && <FindingEvidence output={output} finding={finding} />}
    {reviews.map((review: any, index: number) => <details className="details comparison-notes" key={index}><summary><Eye size={16} /> Findings from data <ChevronDown size={16} /></summary><div className="detail-grid">{review.observed_evidence && <div><strong>Player observation</strong><p>{localizedField(review, 'observed_evidence', language)}</p></div>}{review.rationale && <div><strong>Explanation</strong><p>{localizedField(review, 'rationale', language)}</p></div>}</div></details>)}
    <FindingAssessment findingId={findingId} label={originalLabel} />
  </article>
}

function RelationshipGraph({ relationships, names }: { relationships: any[]; names: Map<string, string> }) {
  const language = useReviewLanguage()
  const jump = (id: string) => document.getElementById(`finding-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  return <section><div className="section-title"><h2>Connections between findings (better explanation to players)</h2><span>{relationships.length}</span></div><p className="section-help">These links organize confirmed findings into possible biomechanical relationships; they do not create new findings.</p><div className="relationship-graph">{relationships.map((item, index) => <div className="graph-edge" key={index}><button onClick={() => jump(item.source_finding_id)}>{names.get(item.source_finding_id) || item.source_finding_id}</button><div><Badge tone="violet">{relationLabel(item.relationship)}</Badge><span>{item.relationship === 'correlates_with' ? '↔' : '→'}</span></div><button onClick={() => jump(item.target_finding_id)}>{names.get(item.target_finding_id) || item.target_finding_id}</button>{item.explanation && <details><summary>Why?</summary><p>{localizedField(item, 'explanation', language)}</p></details>}</div>)}</div></section>
}

export function StructuredView({ output }: { output: MethodOutput }) {
  const language = useReviewLanguage()
  const content = output.structured_evidence || {}, findings = content.confirmed_findings || [], hypotheses = content.additional_visual_hypotheses || [], relationships = content.relationships || []
  const names = new Map<string, string>(findings.map((item: any) => [item.finding_id, localizedFinding(item, language).name]))
  const summary = content.overview?.summary ? localizedField(content.overview, 'summary', language) : localizedField(output.coaching_output, 'summary', language)
  const summaryPrefix = language === 'zh-Hant' ? '錯誤摘要：' : 'Summary of Errors:'
  const originalSummaryParagraphs = stripThinking(summary).split(/\n\s*\n+/).map(value => value.trim()).filter(Boolean)
  const remainingFindingNames = [...findings, ...hypotheses].map((item: any) => localizedFinding(item, language).name).filter(Boolean)
  const currentErrorSummary = remainingFindingNames.length
    ? `${remainingFindingNames.join('; ')}.`
    : language === 'zh-Hant' ? '目前沒有列出任何教練指正。' : 'No coaching findings are currently listed.'
  const explanatorySummary = originalSummaryParagraphs.slice(1).join('\n\n')
  return <div className="content-stack"><section className="summary-card"><p className="eyebrow">Stroke feedback summary</p><p><strong>{summaryPrefix}</strong>{' '}{currentErrorSummary}{explanatorySummary && `\n\n${explanatorySummary}`}</p></section>
    <section><div className="section-title"><h2>Measured coaching findings</h2><span>{findings.length + hypotheses.length}</span></div><p className="section-help">Review the identified movement issues and their supporting coaching evidence.</p>{findings.length || hypotheses.length ? <>{findings.map((item: any, index: number) => <FindingCard key={item.finding_id || index} finding={item} output={output} relationships={relationships} names={names} />)}{hypotheses.map((item: any, index: number) => { const id = String(item.finding_id || item.hypothesis_id || `visual_hypothesis_${index + 1}`), localized = localizedFinding(item, language), label = localized.name, originalLabel = item.name || id; return <article className="finding-card" key={id}><div className="finding-heading"><div><p className="eyebrow">Coaching finding</p><h3>{label}</h3></div><div className="badges"><Badge tone="blue">{readable(item.phase)}</Badge><span className="internal-only"><Badge tone="violet">LLM</Badge></span></div></div>{localized.details && <p className="lead">{localized.details}</p>}{item.evidence && <details className="details"><summary>Coaching evidence <ChevronDown size={16} /></summary><div className="detail-grid"><div><strong>What was observed</strong><p>{localizedField(item, 'evidence', language)}</p></div>{item.rationale && <div><strong>Explanation</strong><p>{localizedField(item, 'rationale', language)}</p></div>}</div></details>}<FindingAssessment findingId={id} label={originalLabel} /></article>})}</> : <Empty>No coaching issue was identified.</Empty>}</section>
    {relationships.length ? <RelationshipGraph relationships={relationships} names={names} /> : <section><div className="section-title"><h2>Connections between findings (better explanation to players)</h2><span>0</span></div><Empty>No connection between findings was reported.</Empty></section>}
    <section><div className="section-title"><h2>What to work on next</h2><span>{(content.coaching_actions || []).length}</span></div>{(content.coaching_actions || []).length ? <div className="action-list">{content.coaching_actions.map((item: any, index: number) => <article key={index}><span>{index + 1}</span><div><h3>{localizedField(item, 'cue', language)}</h3>{item.why_it_matters && <p>{localizedField(item, 'why_it_matters', language)}</p>}{item.suggested_drill && <p><strong>Practice:</strong> {localizedField(item, 'suggested_drill', language)}</p>}</div></article>)}</div> : <Empty>No separate practice action was reported.</Empty>}</section>
  </div>
}

export function PlainLlmView({ output }: { output: MethodOutput }) {
  const language = useReviewLanguage()
  const content = output.structured_evidence || {}, findings = content.confirmed_findings || [], actions = content.coaching_actions || []
  const summary = content.overview?.summary ? localizedField(content.overview, 'summary', language) : localizedField(output.coaching_output, 'summary', language)
  return <div className="content-stack"><section className="summary-card"><p className="eyebrow">Stroke feedback summary</p><p>{stripThinking(summary)}</p></section>
    <section><div className="section-title"><h2>Measured coaching findings</h2><span>{findings.length}</span></div><p className="section-help">These interpretations were generated directly from the supplied player evidence; they were not verified by anomaly thresholds or deterministic rules.</p>{findings.length ? findings.map((finding: any, index: number) => { const id = String(finding.finding_id || `coaching_finding_${index + 1}`), localized = localizedFinding(finding, language), originalLabel = finding.name || id; return <article className="finding-card" id={`plain-finding-${id}`} key={id}><div className="finding-heading"><div><p className="eyebrow">Coaching finding</p><h3>{localized.name}</h3></div><Badge tone="blue">{readable(finding.phase)}</Badge></div>{localized.details && <p className="lead">{localized.details}</p>}{finding.body_region && <p className="meta"><strong>Body area:</strong> {finding.body_region}</p>}<details className="details"><summary>Coaching evidence and action <ChevronDown size={16} /></summary><div className="detail-grid">{finding.observed_evidence && <div><strong>What was observed</strong><p>{localizedField(finding, 'observed_evidence', language)}</p></div>}{finding.why_it_matters && <div><strong>Why it may matter</strong><p>{localizedField(finding, 'why_it_matters', language)}</p></div>}{finding.actionable_cue && <div><strong>Coaching cue</strong><p>{localizedField(finding, 'actionable_cue', language)}</p></div>}{finding.suggested_drill && <div><strong>Practice</strong><p>{localizedField(finding, 'suggested_drill', language)}</p></div>}</div></details><FindingAssessment findingId={id} label={originalLabel} /></article> }) : <Empty>No coaching finding was reported.</Empty>}</section>
    <section><div className="section-title"><h2>What to work on next</h2><span>{actions.length}</span></div>{actions.length ? <div className="action-list">{actions.map((item: any, index: number) => <article key={index}><span>{index + 1}</span><div><h3>{localizedField(item, 'cue', language)}</h3>{item.why_it_matters && <p>{localizedField(item, 'why_it_matters', language)}</p>}{item.suggested_drill && <p><strong>Practice:</strong> {localizedField(item, 'suggested_drill', language)}</p>}</div></article>)}</div> : <Empty>No separate practice action was reported.</Empty>}</section>
  </div>
}

function ScoringPanel({ item, output, saved, strict, judgments, setJudgments, onSave, onSaveNext, onNext, onExport }: { item: ReviewCase; output: MethodOutput; saved?: RatingRecord; strict: boolean; judgments: Record<string, FindingJudgment>; setJudgments: (value: Record<string, FindingJudgment>) => void; onSave: (record: RatingRecord) => void; onSaveNext: (record: RatingRecord) => void; onNext: () => void; onExport: () => void }) {
  const [scores, setScores] = useState<Partial<Record<RatingDimension, number>>>({}), [harmful, setHarmful] = useState<boolean | null>(null), [comment, setComment] = useState(''), [missed, setMissed] = useState<MissedFinding[]>([]), [missedComplete, setMissedComplete] = useState(false), [attempted, setAttempted] = useState(false)
  const expectedFindings = findingInventory(output)
  useEffect(() => { setScores(saved?.scores || {}); setHarmful(saved ? saved.harmful_misleading : null); setComment(saved?.comment || ''); setMissed(saved?.missed_findings || []); setMissedComplete(saved?.missed_findings_complete || false); setJudgments(Object.fromEntries((saved?.finding_judgments || []).map(item => [item.finding_id, item]))); setAttempted(false) }, [item.case_id, output.method.method_id, saved])
  const findingComplete = expectedFindings.every(item => judgments[item.finding_id])
  const missedValid = missed.every(item => item.name.trim().length > 0)
  const complete = DIMENSIONS.every(([key]) => Boolean(scores[key])) && harmful !== null && findingComplete && missedComplete && missedValid
  const record = (): RatingRecord => ({ schema_version: 'coaching-expert-rating/v2', case_id: item.case_id, method_id: output.method.method_id, scores: scores as Record<RatingDimension, number>, harmful_misleading: harmful as boolean, comment: comment.trim(), finding_judgments: expectedFindings.map(item => judgments[item.finding_id]), missed_findings: missed.map(item => ({ ...item, name: item.name.trim() })), missed_findings_complete: missedComplete, saved_at: new Date().toISOString() })
  const submit = (next: boolean) => { setAttempted(strict); if (!complete) { if (!strict && next) onNext(); return } if (next) onSaveNext(record()); else onSave(record()) }
  return <section className="scoring-panel" aria-labelledby="expert-scoring-title"><div className="scoring-heading"><div><p className="eyebrow">Expert evaluation</p><h2 id="expert-scoring-title">Score this coaching assessment</h2><p>{strict ? 'Rate the coaching response you just reviewed. All ratings and the safety question are required.' : 'Internal testing mode: ratings are optional and you may continue without saving.'}</p></div><button className="export-ratings" onClick={onExport}>Export saved ratings</button></div>
    <div className="likert-table">{DIMENSIONS.map(([key, label, description]) => <fieldset className={attempted && !scores[key] ? 'invalid' : ''} key={key}><legend><strong>{label}</strong><span>{description}</span></legend><div className="likert-options" role="radiogroup" aria-label={label}>{[1, 2, 3, 4, 5].map(value => <label className={scores[key] === value ? 'selected' : ''} key={value}><input type="radio" name={`${presentationKey(item.case_id, output.method.method_id)}-${key}`} value={value} checked={scores[key] === value} onChange={() => setScores(previous => ({ ...previous, [key]: value }))} /><span>{value}</span></label>)}</div></fieldset>)}</div>
    <fieldset className={`safety-question ${attempted && harmful === null ? 'invalid' : ''}`}><legend><strong>Harmful or misleading?</strong><span>Could this advice plausibly confuse the player, reinforce unsafe technique, or cause harm?</span></legend><div className="binary-options"><label className={harmful === false ? 'selected' : ''}><input type="radio" name={`${presentationKey(item.case_id, output.method.method_id)}-harmful`} checked={harmful === false} onChange={() => setHarmful(false)} />No</label><label className={harmful === true ? 'selected danger' : ''}><input type="radio" name={`${presentationKey(item.case_id, output.method.method_id)}-harmful`} checked={harmful === true} onChange={() => setHarmful(true)} />Yes</label></div></fieldset>
    <section className={`missed-findings ${attempted && (!missedComplete || !missedValid) ? 'invalid' : ''}`}><div className="missed-heading"><div><strong>Missed coaching findings</strong><span>Add important player errors that this response failed to report.</span></div><button type="button" onClick={() => setMissed(rows => [...rows, { missed_id: crypto.randomUUID(), name: '', severity: 'medium' }])}>+ Add missed finding</button></div>{missed.map((item, index) => <div className="missed-row" key={item.missed_id}><input value={item.name} maxLength={300} placeholder="Name the missed error" onChange={event => setMissed(rows => rows.map(row => row.missed_id === item.missed_id ? { ...row, name: event.target.value } : row))}/><select value={item.severity} onChange={event => setMissed(rows => rows.map(row => row.missed_id === item.missed_id ? { ...row, severity: event.target.value as MissedFinding['severity'] } : row))}><option value="low">Low severity</option><option value="medium">Medium severity</option><option value="high">High severity</option></select><button className="remove" type="button" aria-label={`Remove missed finding ${index + 1}`} onClick={() => setMissed(rows => rows.filter(row => row.missed_id !== item.missed_id))}><Trash2 size={16}/></button></div>)}<label className="completion-check"><input type="checkbox" checked={missedComplete} onChange={event => setMissedComplete(event.target.checked)}/><span>I reviewed the complete stroke and recorded all important omitted findings.</span></label></section>
    <label className="comment-field"><strong>Optional comment</strong><textarea value={comment} onChange={event => setComment(event.target.value)} rows={4} placeholder="Add a concise justification or note an important omission." /></label>
    {attempted && !complete && <p className="validation-message" role="alert">Complete all four ratings, judge every displayed finding, answer the safety question, and confirm the omitted-finding review.</p>}
    <div className="scoring-actions"><span>{saved ? `Saved ${new Date(saved.saved_at).toLocaleString()}` : 'Not yet saved'}</span><div><button onClick={() => submit(false)}>Save</button><button className="primary" onClick={() => submit(true)}>Save &amp; Next</button></div></div>
  </section>
}

function ChainFinding({ item, kind, index }: { item: Record<string, any>; kind: string; index: number }) {
  const language = useReviewLanguage()
  const originalTitle = item.description || item.chain || item.component || item.node || `${kind} ${index + 1}`
  const title = item.description ? localizedField(item, 'description', language) : originalTitle
  const groupKey = kind.startsWith('Kinetic') ? 'chain' : kind.startsWith('Component') ? 'component' : 'timing'
  return <details className="chain-finding" open><summary><div><p className="eyebrow">{kind}</p><strong>{title}</strong></div><ChevronDown size={17} /></summary><div className="chain-body">{item.suggestion && <p className="lead">{localizedField(item, 'suggestion', language)}</p>}{item.chain && item.chain !== originalTitle && <p><strong>Kinetic chain:</strong> {readable(item.chain)}</p>}{item.component && <p><strong>Component:</strong> {readable(item.component)}</p>}{item.issue && <p><strong>Timing issue:</strong> {localizedField(item, 'issue', language)}</p>}{typeof item.avg_z_score === 'number' && <p><strong>Average standardized deviation:</strong> {item.avg_z_score.toFixed(2)}</p>}{typeof item.z_score === 'number' && <p><strong>Standardized deviation:</strong> {item.z_score.toFixed(2)}</p>}<FindingAssessment findingId={`${groupKey}_${index + 1}`} label={originalTitle}/></div></details>
}

export function NarrativeView({ output, debug }: { output: MethodOutput; debug: boolean }) {
  const language = useReviewLanguage()
  const model = output.internal_evidence?.model_specific || {}, groups = [{ key: 'chain', label: 'Kinetic-chain finding', rows: model.chain_reports || [] }, { key: 'component', label: 'Component finding', rows: model.component_alerts || [] }], count = groups.reduce((sum, group) => sum + group.rows.length, 0)
  const coaching = splitChainCoaching(localizedField(output.coaching_output, 'summary', language))
  return <div className="content-stack"><section className="summary-card"><p className="eyebrow">Stroke feedback summary</p><div className="narrative-text">{coaching.summary}</div></section><section><div className="section-title"><h2>Measured coaching findings</h2><span>{count}</span></div>{count ? groups.flatMap(group => group.rows.map((item: any, index: number) => <ChainFinding item={item} kind={group.label} index={index} key={`${group.label}-${index}`} />)) : <Empty>No measured coaching finding was reported.</Empty>}</section><section><div className="section-title"><h2>Connections between findings (better explanation to players)</h2><span>0</span></div><Empty>No connection between findings was reported.</Empty></section><section><div className="section-title"><h2>Movement issues noticed from video</h2><span>0</span></div><Empty>No video-only movement issue was reported.</Empty></section><section><div className="section-title"><h2>What to work on next</h2></div>{coaching.nextSteps ? <div className="chain-next-steps">{coaching.nextSteps}</div> : <Empty>No separate practice action was reported.</Empty>}</section>{debug && <details className="details debug-evidence"><summary><FlaskConical size={16} />Complete normalized evidence (internal only)<ChevronDown size={16} /></summary><pre>{JSON.stringify(model, null, 2)}</pre></details>}</div>
}

export function StrokeMedia({ item, debug }: { item: ReviewCase; debug: boolean }) {
  type VideoMode = 'actual' | 'mesh' | 'skeleton'
  const videos = { actual: item.media?.actual_video, mesh: item.media?.skeleton_mesh_video, skeleton: item.media?.skeleton_video }
  const expected = { actual: item.media?.expected_actual_video, mesh: item.media?.expected_skeleton_mesh_video, skeleton: item.media?.expected_skeleton_video }
  const preferredMode = (): VideoMode => videos.actual ? 'actual' : videos.mesh ? 'mesh' : 'skeleton'
  const [mode, setMode] = useState<VideoMode>(preferredMode)
  const showSourcePaths = debug && import.meta.env.DEV
  useEffect(() => { setMode(preferredMode()) }, [item.case_id])
  useEffect(() => { if (!videos[mode]) setMode(preferredMode()) }, [mode, videos.actual, videos.mesh, videos.skeleton])
  const video = videos[mode]
  return <aside className="media-panel"><div className="view-switch three-options" role="tablist" aria-label="Stroke visualization type"><button className={mode === 'actual' ? 'active' : ''} onClick={() => setMode('actual')} disabled={!videos.actual}>Actual video</button><button className={mode === 'mesh' ? 'active' : ''} onClick={() => setMode('mesh')} disabled={!videos.mesh}>Mesh</button><button className={mode === 'skeleton' ? 'active' : ''} onClick={() => setMode('skeleton')} disabled={!videos.skeleton}>Skeleton</button></div><div className="media-frame">{video ? <VideoPlayer src={video} label={`Complete player stroke, ${mode} view`} actual={mode === 'actual'} /> : <div className="media-placeholder"><PlayCircle size={40} /><strong>{readable(mode)} visualization unavailable</strong><span>The expected overview video was not found.</span>{showSourcePaths && expected[mode] && <code>{expected[mode]}</code>}</div>}</div><div className="media-note"><strong>Review the complete stroke</strong><span>Replay the motion before comparing the coaching interpretation.</span>{showSourcePaths && <div className="debug-video-paths"><div><strong>Actual-video source</strong><code>{expected.actual || 'No actual-video path recorded in bundle'}</code><small>{videos.actual ? 'Copied into the UI bundle' : 'File not found when bundle was built'}</small></div><div><strong>Mesh source</strong><code>{expected.mesh || 'No mesh path recorded in bundle'}</code><small>{videos.mesh ? 'Copied into the UI bundle' : 'File not found when bundle was built'}</small></div><div><strong>Skeleton source</strong><code>{expected.skeleton || 'No skeleton path recorded in bundle'}</code><small>{videos.skeleton ? 'Copied into the UI bundle' : 'File not found when bundle was built'}</small></div></div>}</div></aside>
}

export default function App({ onSignOut }: { onSignOut?: () => void } = {}) {
  const [bundle, setBundle] = useState<ReviewBundle | null>(null), [error, setError] = useState(''), [debug, setDebug] = useState(true), [position, setPosition] = useState(0), [fontScale, setFontScale] = useState(1)
  const [judgments, setJudgments] = useState<Record<string, FindingJudgment>>({})
  const [language, setLanguage] = useState<ReviewLanguage>('en')
  const [seed, setSeed] = useState<string>(() => readSeed())
  const [ratings, setRatings] = useState<RatingMap>(() => loadRatings())
  useEffect(() => { fetch(BUNDLE_URL, { cache: 'no-store' }).then(async response => { if (!response.ok) throw new Error(`Could not load ${BUNDLE_URL} (${response.status})`); const value = await response.json(); if (value.schema_version !== 'coaching-local-review-bundle/v1' || !Array.isArray(value.cases)) throw new Error('Unsupported local review bundle.'); setBundle(value) }).catch(reason => setError(String(reason.message || reason))) }, [])
  // Randomized stroke order, and randomized method order within each stroke.
  const presentations = useMemo(() => {
    if (!bundle) return []
    return [...bundle.cases]
      .sort((left, right) => stableWeight(`${seed}:case:${left.case_id}`) - stableWeight(`${seed}:case:${right.case_id}`))
      .flatMap((item, caseOrdinal) => [...item.outputs]
        .sort((left, right) => stableWeight(`${seed}:${item.case_id}:${left.method.method_id}`) - stableWeight(`${seed}:${item.case_id}:${right.method.method_id}`))
        .map((output, methodOrdinal) => ({ item, output, caseOrdinal, methodOrdinal })))
  }, [bundle, seed])
  const reshuffle = () => { const fresh = newSeed(); try { sessionStorage.setItem(ORDER_SEED_KEY, fresh) } catch { /* ignore */ } setSeed(fresh); setPosition(0); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  const current = presentations[position], total = presentations.length
  const move = (delta: number) => { setPosition(Math.max(0, Math.min(total - 1, position + delta))); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  if (error) return <main className="state-page"><AlertTriangle /><h1>Review data could not be loaded</h1><p>{error}</p></main>
  if (!bundle || !current) return <main className="state-page"><div className="spinner" /><h1>Preparing coaching review…</h1></main>
  const { item, output, caseOrdinal, methodOrdinal } = current, methodCode = String.fromCharCode(65 + methodOrdinal)
  const caseBase = position - methodOrdinal, caseOutputs = presentations.slice(caseBase, caseBase + item.outputs.length)
  const plainLlm = output.content_format === 'plain_llm_coaching/v1', structured = output.content_format === 'structured_evidence/v1' || output.structured_evidence
  const currentKey = presentationKey(item.case_id, output.method.method_id), saveRating = (record: RatingRecord) => setRatings(previous => { const next = { ...previous, [currentKey]: record }; localStorage.setItem(RATINGS_KEY, JSON.stringify(next)); return next })
  const saveAndNext = (record: RatingRecord) => { saveRating(record); move(1) }
  const exportRatings = () => { const payload = { schema_version: 'coaching-expert-ratings-local/v1', exported_at: new Date().toISOString(), bundle_source: BUNDLE_URL, order_seed: seed, expected_presentations: total, saved_presentations: Object.keys(ratings).length, ratings: Object.values(ratings) }; const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `coaching-expert-ratings-${new Date().toISOString().slice(0, 10)}.json`; anchor.click(); URL.revokeObjectURL(url) }
  const setJudgment = (judgment: FindingJudgment) => setJudgments(previous => ({ ...previous, [judgment.finding_id]: judgment }))
  return <ReviewLanguageContext.Provider value={language}><FindingAssessmentContext.Provider value={{ judgments, setJudgment }}><div className="app-shell" style={{ '--font-scale': fontScale } as React.CSSProperties}>
    <header className="topbar"><div><p className="brand">Badminton coaching review</p><p className="subtitle">Internal qualitative comparison</p></div><div className="header-tools"><LanguageControl language={language} onChange={setLanguage}/><div className="font-control"><button onClick={() => setFontScale(Math.max(.85, fontScale - .1))} disabled={fontScale <= .85}><Minus size={14} />A</button><span>{Math.round(fontScale * 100)}%</span><button onClick={() => setFontScale(Math.min(1.35, fontScale + .1))} disabled={fontScale >= 1.35}><Plus size={14} />A</button></div><button className="mode-toggle" onClick={reshuffle} title={`Order seed ${seed}`}><Shuffle size={17} /><span><strong>Reshuffle</strong><small>Randomized order</small></span></button><button className={`mode-toggle ${debug ? 'debug' : ''}`} onClick={() => setDebug(!debug)}>{debug ? <Eye size={17} /> : <EyeOff size={17} />}<span><strong>{debug ? 'Internal testing' : 'Blinded preview'}</strong><small>{debug ? 'Method identity visible' : 'Method identity hidden'}</small></span></button>{onSignOut && <button onClick={onSignOut}><LogOut size={16} />Sign out</button>}</div></header>
    <div className="progress-row"><div><span>Progress: {position + 1} / {total}</span><span>{Object.keys(ratings).length} saved</span></div><div className="progress-track"><i style={{ width: `${(position + 1) / total * 100}%` }} /></div></div>
    <main className="review-layout">
      <StrokeMedia item={item} debug={debug} />
      <section className="review-panel"><div className="case-header"><div><p className="eyebrow">{debug ? `${item.subject_id} · Stroke ${item.stroke_id}` : `Stroke ${caseOrdinal + 1}`}</p><h1>Coaching assessment</h1><p>{debug ? `${output.method.display_name} · ${output.method.method_id}` : `Response ${methodCode}`}</p></div>{debug && <Badge tone="violet">{output.method.supervision?.replaceAll('_', ' ')}</Badge>}</div>{debug && <div className="method-tabs">{caseOutputs.map((candidate, index) => <button className={index === methodOrdinal ? 'active' : ''} onClick={() => setPosition(caseBase + index)} key={candidate.output.method.method_id}>{candidate.output.method.display_name}</button>)}</div>}{plainLlm ? <PlainLlmView output={output} /> : structured ? <StructuredView output={output} /> : <NarrativeView output={output} debug={debug} />}</section>
    </main>
    <div className="scoring-wrap"><ScoringPanel item={item} output={output} saved={ratings[currentKey]} strict={!debug} judgments={judgments} setJudgments={setJudgments} onSave={saveRating} onSaveNext={saveAndNext} onNext={() => move(1)} onExport={exportRatings} /></div>
    <footer className="footer-nav"><button onClick={() => move(-1)} disabled={position === 0}><ArrowLeft size={18} />Previous</button><span>{debug ? item.case_id : `Stroke ${caseOrdinal + 1}`} · {debug ? output.method.display_name : `Response ${methodCode}`}</span><button className="primary" onClick={() => move(1)} disabled={position === total - 1 || (!debug && !ratings[currentKey])}>Next<ArrowRight size={18} /></button></footer>
  </div></FindingAssessmentContext.Provider></ReviewLanguageContext.Provider>
}
