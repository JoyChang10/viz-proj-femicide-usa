import { useId, useState } from 'react'
import type { City, VictimCase } from '../types'
import { caseSummary } from '../lib/victimDots'
import { CityCaseHeader } from './CityCaseHeader'

interface Props {
  city: City
  cases: VictimCase[]
  loading: boolean
  error: string | null
  selectedId?: string
  onSelect: (record: VictimCase) => void
  onClose: () => void
  onRetry: () => void
}

export function VictimDotGrid({ city, cases, loading, error, selectedId, onSelect, onClose, onRetry }: Props) {
  const tooltipId = useId()
  const [hovered, setHovered] = useState<VictimCase>()
  const preview = hovered ?? cases.find(record => record.id === selectedId)
  return <section className="city-dot-view" aria-labelledby="city-title" aria-busy={loading}>
    <CityCaseHeader city={city} onClose={onClose} />
    {city.caseCount > 1 && <div className="victim-dot-preview-slot">
      {preview ? <div id={tooltipId} className="victim-dot-preview" role="tooltip">
        <strong>{preview.name}</strong><span>{caseSummary(preview)}</span>
      </div> : <p className="city-view-note">One dot per victim. Arranged for selection, not by location.</p>}
    </div>}
    {loading && <p role="status">Loading cases…</p>}
    {error && <div role="alert"><p>{error}</p><button onClick={onRetry}>Retry cases</button></div>}
    {city.caseCount > 1 && <div className="victim-dot-grid" role="group" aria-label={`Victims in ${city.label}`} onScroll={() => setHovered(undefined)}>
      {cases.map(record => <button key={record.id} type="button" className="victim-dot"
        data-case-id={record.id} aria-label={`${record.name}. ${caseSummary(record)}. Open victim profile.`}
        aria-pressed={selectedId === record.id} aria-describedby={preview?.id === record.id ? tooltipId : undefined}
        onMouseEnter={() => setHovered(record)} onMouseLeave={() => setHovered(undefined)}
        onFocus={() => setHovered(record)} onBlur={() => setHovered(undefined)}
        onClick={() => { setHovered(undefined); onSelect(record) }} />)}
    </div>}
  </section>
}
