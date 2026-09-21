import { createContext, useContext } from 'react'

export type ReviewLanguage = 'en' | 'zh-Hant'
export const ReviewLanguageContext = createContext<ReviewLanguage>('en')
export const useReviewLanguage = () => useContext(ReviewLanguageContext)

export function localizedField(value: Record<string, any>, key: string, language: ReviewLanguage) {
  const fallback = String(value?.[key] || '')
  if (language !== 'zh-Hant') return fallback
  return String(value?._translations?.zh_Hant?.[key] || fallback)
}

export function localizedFinding(finding: Record<string, any>, language: ReviewLanguage) {
  const fallback = {
    name: String(finding.name || finding.finding_id || 'Coaching finding'),
    details: String(finding.details || ''),
  }
  if (language !== 'zh-Hant') return fallback
  const translated = finding.presentation_translations?.zh_Hant || finding._translations?.zh_Hant
  return {
    name: String(translated?.name || fallback.name),
    details: String(translated?.details || fallback.details),
  }
}

export function localizedList(value: Record<string, any>, key: string, language: ReviewLanguage): string[] {
  const fallback = Array.isArray(value?.[key]) ? value[key].map(String) : []
  if (language !== 'zh-Hant') return fallback
  const translated = value?._translations?.zh_Hant?.[key]
  if (!translated || typeof translated !== 'object') return fallback
  return fallback.map((text, index) => String(translated[index] || text))
}

export function LanguageControl({ language, onChange, alwaysVisible = false }: { language: ReviewLanguage; onChange: (language: ReviewLanguage) => void; alwaysVisible?: boolean }) {
  // Keep the final blinded study monolingual by default: translating only one
  // method would reveal method identity. Enable this explicitly only after all
  // compared methods have equivalent bilingual presentation text.
  if (!alwaysVisible && import.meta.env.PROD && import.meta.env.VITE_ENABLE_BILINGUAL_REVIEW !== 'true') return null
  return <div className="language-control" aria-label="Sensor finding language">
    <button className={language === 'en' ? 'active' : ''} onClick={() => onChange('en')}>English</button>
    <button className={language === 'zh-Hant' ? 'active' : ''} onClick={() => onChange('zh-Hant')}>繁體中文</button>
  </div>
}
