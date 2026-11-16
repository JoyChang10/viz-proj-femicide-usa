import { useEffect, useRef } from 'react'
import type { VictimCase } from '../types'
import { formatDate } from '../lib/data'

export function VictimProfile({ record, onClose }: { record: VictimCase; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null)
  const activeRecord = useRef(record.id)
  activeRecord.current = record.id
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    close.current?.focus()
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose() }
    }
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('keydown', handleKey)
      // Switching directly between map dots should retain the new dot as the
      // return target; only restore focus when this profile actually closes.
      if (activeRecord.current === record.id) previous?.focus()
    }
  }, [record.id, onClose])
  return <section className="profile-panel" aria-labelledby="profile-name" data-testid="victim-profile" data-case-id={record.id}>
    <button className="back-button" onClick={onClose} ref={close}>← Back to city cases</button>
    <div className="panel-heading">
      <h2 id="profile-name">{record.name}</h2>
      <button className="icon-button" aria-label="Close victim profile" onClick={onClose}>×</button>
    </div>
    <dl className="profile-facts">
      <div><dt>Age</dt><dd>{record.age ?? 'Not documented'}</dd></div>
      <div><dt>{record.dateDetail?.toLowerCase() ?? 'Recorded date (type not documented)'}</dt><dd>{formatDate(record.date, record.dateDetail)}</dd></div>
      <div><dt>Recorded location</dt><dd>{[record.city, record.state].filter(Boolean).join(', ') || 'Not documented'}</dd></div>
      <div><dt>Case status</dt><dd>{record.caseStatus ?? 'Not documented'}</dd></div>
      <div><dt>Relationship</dt><dd>{record.relationship ?? 'Not documented'}</dd></div>
      <div><dt>Cause of death</dt><dd>{record.causeOfDeath ?? 'Not documented'}</dd></div>
    </dl>
    <p className="location-note">Map marker: city-level location.</p>
    <h3>About her</h3><p className="preserve-lines">{record.about ?? 'No biographical details documented.'}</p>
    <details><summary>Case details</summary>
      <p className="muted">May contain descriptions of violence.</p>
      <p className="preserve-lines">{record.narrative ?? 'No additional case details documented.'}</p>
      {record.disclaimer && <p className="source-disclaimer preserve-lines">{record.disclaimer}</p>}
    </details>
    <h3>Sources</h3>
    {record.sources.length ? <ul className="sources">{record.sources.map((source, i) => <li key={source}>
      <a href={source} target="_blank" rel="noopener noreferrer">{new URL(source).hostname} <span className="sr-only">source {i + 1}</span> ↗</a>
    </li>)}</ul> : <p className="muted">No public source links documented.</p>}
  </section>
}
