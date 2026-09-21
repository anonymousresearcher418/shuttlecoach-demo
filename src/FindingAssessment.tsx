import { createContext, useContext } from 'react'
import { Check, HelpCircle, X } from 'lucide-react'

export type FindingVerdict = 'agree' | 'not_sure' | 'disagree'
export type FindingJudgment = { finding_id: string; finding_label: string; verdict: FindingVerdict }

type ContextValue = {
  judgments: Record<string, FindingJudgment>
  setJudgment: (judgment: FindingJudgment) => void
}

export const FindingAssessmentContext = createContext<ContextValue | null>(null)

export function FindingAssessment({ findingId, label }: { findingId: string; label: string }) {
  const context = useContext(FindingAssessmentContext)
  if (!context) return null
  const selected = context.judgments[findingId]?.verdict
  const choices: Array<{ value: FindingVerdict; label: string; icon: React.ReactNode }> = [
    { value: 'agree', label: 'Agree', icon: <Check size={17} /> },
    { value: 'not_sure', label: 'Not sure', icon: <HelpCircle size={17} /> },
    { value: 'disagree', label: 'Disagree', icon: <X size={17} /> },
  ]
  return <div className="finding-assessment" role="radiogroup" aria-label={`Judge finding: ${label}`}>
    <strong>Is this finding correct?</strong>
    <div>{choices.map(choice => <button type="button" key={choice.value} className={`${choice.value} ${selected === choice.value ? 'selected' : ''}`} aria-pressed={selected === choice.value} onClick={() => context.setJudgment({ finding_id: findingId, finding_label: label, verdict: choice.value })}>{choice.icon}<span>{choice.label}</span></button>)}</div>
  </div>
}
