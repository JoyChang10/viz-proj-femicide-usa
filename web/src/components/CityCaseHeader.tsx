import { useEffect, useRef } from 'react'
import type { City } from '../types'
import { number } from '../lib/data'

export function CityCaseHeader({ city, onClose }: { city: City; onClose: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { heading.current?.focus() }, [city.id])
  return <>
    <div className="panel-heading">
      <h2 id="city-title" ref={heading} tabIndex={-1}>{city.label}</h2>
      <button className="icon-button" aria-label="Close city cases" onClick={onClose}>×</button>
    </div>
    <h3 className="city-profile-title">Individual Victim Profiles</h3>
    <p className="city-case-count"><strong>{number(city.caseCount)}</strong> documented {city.caseCount === 1 ? 'case' : 'cases'}</p>
  </>
}
