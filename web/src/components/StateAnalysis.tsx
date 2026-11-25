import { useEffect } from 'react'
import { Tooltip } from './Tooltip'

const topics = [
  { id: 'socioeconomic-trends', label: 'Socioeconomic Trends', description: 'Explore homicide rates alongside changes in socioeconomic conditions.' },
  { id: 'victim-demographics', label: 'Victim Demographics', description: "Explore patterns in victims' age, race, and other demographic characteristics." },
]

export function analysisTitle(id: string | null) {
  return topics.find(topic => topic.id === id)?.label
}

export function StateAnalysisLinks({ state }: { state: string }) {
  return <div className="state-topics" role="group" aria-label="State analysis pages">
    {topics.map(({ id, label, description }) => <Tooltip key={id} text={description} className="analysis-tooltip">
      {descriptionId => <a className="analysis-link" href={`?${new URLSearchParams({ state, analysis: id })}`}
        aria-describedby={descriptionId}>
        {label}
      </a>}
    </Tooltip>)}
  </div>
}

export function AnalysisPlaceholder({ title, state }: { title: string; state: string | null }) {
  useEffect(() => { document.title = `${title} | Femicide in the U.S.` }, [title])
  return <main className="app analysis-placeholder">
    <h1>{title}</h1>
    <a href={state ? `?${new URLSearchParams({ state })}` : './'}>Return to the map</a>
  </main>
}
