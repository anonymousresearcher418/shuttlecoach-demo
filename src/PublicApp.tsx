import { useEffect, useState } from 'react'
import { AlertTriangle, ArrowLeft, ArrowRight, Minus, PlayCircle, Plus } from 'lucide-react'
import { LanguageControl, ReviewLanguageContext, type ReviewLanguage } from './Language'
import { NarrativeView, PlainLlmView, StructuredView } from './App'
import type { MethodOutput, ReviewBundle, ReviewCase } from './types'

const BUNDLE_URL = import.meta.env.VITE_PUBLIC_BUNDLE_URL || `${import.meta.env.BASE_URL}data/public_review_bundle.json`
const SOURCE_VIDEO_FPS = 10
const ORIGINAL_STROKE_SECONDS = 2.5
const FULL_STROKE_FRAMES = 150
const ORIGINAL_PLAYBACK_RATE = FULL_STROKE_FRAMES / SOURCE_VIDEO_FPS / ORIGINAL_STROKE_SECONDS

function PublicVideo({ src, actual }: { src: string; actual: boolean }) {
  const [factor, setFactor] = useState(1)
  const rate = (actual ? 1 : ORIGINAL_PLAYBACK_RATE) * factor
  return <div className="video-player">
    <video key={src} controls preload="metadata" src={src} onLoadedMetadata={event => { event.currentTarget.playbackRate = rate }} />
    <div className="speed-control"><span>Playback speed</span>{[.25, .5, 1].map(value => <button key={value} className={factor === value ? 'active' : ''} onClick={event => { setFactor(value); const video = event.currentTarget.closest('.video-player')?.querySelector('video'); if (video) { video.pause(); video.currentTime = 0; video.playbackRate = (actual ? 1 : ORIGINAL_PLAYBACK_RATE) * value } }}>{value === 1 ? 'Original · 1×' : `${value}×`}</button>)}</div>
  </div>
}

function PublicStrokeMedia({ item }: { item: ReviewCase }) {
  type Mode = 'actual' | 'skeleton'
  const videos = { actual: item.media?.actual_video, skeleton: item.media?.skeleton_video }
  const preferred = (): Mode => videos.actual ? 'actual' : 'skeleton'
  const [mode, setMode] = useState<Mode>(preferred)
  useEffect(() => setMode(preferred()), [item.case_id])
  const video = videos[mode]
  return <aside className="media-panel public-media-panel">
    <div className="view-switch" role="tablist" aria-label="Stroke visualization type">
      <button className={mode === 'actual' ? 'active' : ''} onClick={() => setMode('actual')} disabled={!videos.actual}>Player video</button>
      <button className={mode === 'skeleton' ? 'active' : ''} onClick={() => setMode('skeleton')} disabled={!videos.skeleton}>Skeleton</button>
    </div>
    <div className="media-frame">{video ? <PublicVideo src={video} actual={mode === 'actual'} /> : <div className="media-placeholder"><PlayCircle size={40}/><strong>Visualization unavailable</strong></div>}</div>
    <div className="media-note"><strong>Complete stroke</strong><span>Use the player or skeleton view while reading each coaching response.</span></div>
  </aside>
}

function OutputView({ output }: { output: MethodOutput }) {
  if (output.content_format === 'plain_llm_coaching/v1') return <PlainLlmView output={output}/>
  if (output.content_format === 'structured_evidence/v1' || output.structured_evidence) return <StructuredView output={output}/>
  return <NarrativeView output={output} debug={false}/>
}

export default function PublicApp() {
  const [bundle, setBundle] = useState<ReviewBundle | null>(null)
  const [error, setError] = useState('')
  const [caseIndex, setCaseIndex] = useState(0)
  const [methodIndex, setMethodIndex] = useState(0)
  const [fontScale, setFontScale] = useState(1)
  const [language, setLanguage] = useState<ReviewLanguage>('en')
  useEffect(() => {
    fetch(BUNDLE_URL, { cache: 'no-store' }).then(async response => {
      if (!response.ok) throw new Error(`Could not load public examples (${response.status}).`)
      const contentType = response.headers.get('content-type') || ''
      if (!contentType.includes('application/json')) {
        throw new Error(`Public bundle not found at ${BUNDLE_URL}. Build public/data/public_review_bundle.json before enabling public showcase mode.`)
      }
      const value = await response.json()
      if (value.schema_version !== 'coaching-public-showcase/v1' || !Array.isArray(value.cases)) throw new Error('Unsupported public showcase bundle.')
      setBundle(value)
    }).catch(reason => setError(String(reason.message || reason)))
  }, [])
  if (error) return <main className="state-page"><AlertTriangle/><h1>Examples unavailable</h1><p>{error}</p></main>
  if (!bundle?.cases.length) return <main className="state-page"><div className="spinner"/><h1>Loading coaching examples…</h1></main>
  const item = bundle.cases[caseIndex]
  const output = item.outputs[methodIndex] || item.outputs[0]
  const chooseCase = (index: number) => { setCaseIndex(index); setMethodIndex(0); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  return <ReviewLanguageContext.Provider value={language}><div className="app-shell public-showcase" style={{ '--font-scale': fontScale } as React.CSSProperties}>
    <header className="topbar"><div><p className="brand">ShuttleCoach</p><p className="subtitle">Multimodal badminton coaching examples</p></div><div className="header-tools"><LanguageControl language={language} onChange={setLanguage} alwaysVisible/><div className="font-control"><button onClick={() => setFontScale(Math.max(.85, fontScale-.1))}><Minus size={14}/>A</button><span>{Math.round(fontScale*100)}%</span><button onClick={() => setFontScale(Math.min(1.35, fontScale+.1))}><Plus size={14}/>A</button></div></div></header>
    <main className="review-layout"><PublicStrokeMedia item={item}/><section className="review-panel"><div className="case-header"><div><p className="eyebrow">Stroke {caseIndex + 1} of {bundle.cases.length}</p><h1>Coaching output</h1><p>{output.method.display_name}</p></div></div><div className="method-tabs public-method-tabs">{item.outputs.map((candidate, index) => <button className={methodIndex === index ? 'active' : ''} onClick={() => setMethodIndex(index)} key={candidate.method.method_id}>{candidate.method.display_name}</button>)}</div><OutputView output={output}/></section></main>
    <footer className="footer-nav"><button onClick={() => chooseCase(Math.max(0, caseIndex-1))} disabled={caseIndex === 0}><ArrowLeft size={18}/>Previous stroke</button><span>Stroke {caseIndex + 1} · {output.method.display_name}</span><button className="primary" onClick={() => chooseCase(Math.min(bundle.cases.length-1, caseIndex+1))} disabled={caseIndex === bundle.cases.length-1}>Next stroke<ArrowRight size={18}/></button></footer>
  </div></ReviewLanguageContext.Provider>
}
