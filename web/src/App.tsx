import { useCallback, useEffect, useRef, useState } from 'react'
import { CityMap } from './components/CityMap'
import { VictimProfile } from './components/VictimProfile'
import { VictimDotGrid } from './components/VictimDotGrid'
import { loadCases, loadIndex, number } from './lib/data'
import type { City, DataIndex, VictimCase } from './types'

const reasonLabels: Record<string, string> = {
  missing_city: 'City not documented', missing_state: 'State not documented',
  outside_us_scope: 'Outside the 50 states and D.C.', ambiguous: 'Ambiguous city name', not_found: 'No reliable city match',
}

export default function App() {
  const [data, setData] = useState<DataIndex>()
  const [error, setError] = useState<string | null>(null)
  const [indexAttempt, setIndexAttempt] = useState(0)
  const [city, setCity] = useState<City>()
  const [cases, setCases] = useState<VictimCase[]>([])
  const [loadingCases, setLoadingCases] = useState(false)
  const [caseError, setCaseError] = useState<string | null>(null)
  const [caseAttempt, setCaseAttempt] = useState(0)
  const [record, setRecord] = useState<VictimCase>()
  const [selectedCaseId, setSelectedCaseId] = useState<string>()
  const [resetVersion, setResetVersion] = useState(0)
  const cityScroll = useRef<HTMLDivElement>(null)
  const savedScroll = useRef(0)
  const returnFocus = useRef<HTMLElement | null>(null)
  const getCityScroll = useCallback(() => cityScroll.current?.querySelector<HTMLElement>('.victim-dot-grid') ?? cityScroll.current, [])
  useEffect(() => {
    const controller = new AbortController()
    setError(null)
    loadIndex(controller.signal).then(setData).catch((err: Error) => {
      if (err.name !== 'AbortError') setError(err.message)
    })
    return () => controller.abort()
  }, [indexAttempt])
  useEffect(() => {
    if (!city) { setCases([]); return }
    const controller = new AbortController()
    setCases([]); setCaseError(null); setLoadingCases(true)
    loadCases(city.id, controller.signal).then(nextCases => {
      if (controller.signal.aborted) return
      setCases(nextCases)
      if (nextCases.length === 1) {
        setSelectedCaseId(nextCases[0].id)
        setRecord(nextCases[0])
      }
    }).catch((err: Error) => {
      if (!controller.signal.aborted && err.name !== 'AbortError') setCaseError(err.message)
    }).finally(() => { if (!controller.signal.aborted) setLoadingCases(false) })
    return () => controller.abort()
  }, [city, caseAttempt])
  const selectRecord = useCallback((next: VictimCase) => {
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    savedScroll.current = getCityScroll()?.scrollTop ?? 0
    setSelectedCaseId(next.id)
    setRecord(next)
  }, [getCityScroll])
  const closeCity = useCallback(() => {
    setRecord(undefined); setCity(undefined); setCases([])
    setSelectedCaseId(undefined)
    setCaseError(null); setLoadingCases(false)
    savedScroll.current = 0
    returnFocus.current = null
  }, [])
  const selectCity = useCallback((next: City) => {
    returnFocus.current = null
    const sameCity = next.id === city?.id
    setRecord(undefined); setSelectedCaseId(undefined)
    if (!sameCity) { setCases([]); setCaseError(null); setLoadingCases(true) }
    setCity(next)
    savedScroll.current = 0
    const scroll = getCityScroll()
    if (scroll) scroll.scrollTop = 0
    if (sameCity && cases.length === 1) selectRecord(cases[0])
  }, [city?.id, cases, selectRecord, getCityScroll])
  const closeProfile = useCallback(() => {
    if (city?.caseCount === 1) closeCity()
    else setRecord(undefined)
  }, [city?.caseCount, closeCity])
  useEffect(() => {
    if (!record) {
      const scroll = getCityScroll()
      if (scroll) scroll.scrollTop = savedScroll.current
      if (returnFocus.current?.isConnected) returnFocus.current.focus({ preventScroll: true })
    }
  }, [record, getCityScroll])
  const reset = () => {
    closeCity(); setResetVersion(v => v + 1)
  }
  const metadata = data?.metadata
  return <div className="app">
    <header className="site-header">
      <h1>Women Count</h1>
      <button className="reset-button" onClick={reset} disabled={!data}>Reset Map</button>
    </header>
    <main>
      {!data ? <div className="loading-state" role={error ? 'alert' : 'status'}>
        {error ? <><h2>Data could not be loaded</h2><p>{error} Check that the prepared dataset is available.</p><button onClick={() => setIndexAttempt(v => v + 1)}>Retry loading</button></> : 'Loading documented cases…'}
      </div> : <>
        <div className="coverage-bar">
          <p><strong>{number(metadata!.mappedCases)}</strong> documented femicide cases in <strong>{number(metadata!.cityCount)}</strong> U.S. cities</p>
          {metadata!.synthetic && <strong>Synthetic sample data for testing</strong>}
        </div>
        <div className="explorer">
          <CityMap cities={data.cities} selectedCity={city} onSelect={selectCity} resetVersion={resetVersion} />
          <aside className="explorer-sidebar" aria-label="Cities and victim profiles">
            <div className="sidebar-scroll" ref={cityScroll} hidden={!!record}>
              {city ? <VictimDotGrid key={city.id} city={city} cases={cases} loading={loadingCases} error={caseError}
                selectedId={selectedCaseId} onClose={closeCity} onRetry={() => setCaseAttempt(v => v + 1)} onSelect={selectRecord} /> : <>
                <h2>Cases by city</h2>
                <p className="muted">Click a numbered cluster to zoom in, then select a city.</p>
                <label className="city-label" htmlFor="city-select">Choose a city</label>
                <select id="city-select" value="" onChange={event => {
                  const next = data.cities.find(c => c.id === event.target.value)
                  if (next) selectCity(next)
                }}><option value="" disabled>Choose a city…</option>
                  {data.cities.map(c => <option key={c.id} value={c.id}>{c.label} ({number(c.caseCount)} cases)</option>)}
                </select>
              </>}
            </div>
            {record && <div className="sidebar-scroll profile-scroll"><VictimProfile record={record} onClose={closeProfile} /></div>}
          </aside>
        </div>
        <div className="method-note">
          <p>City-level locations, not exact incident locations. Counts reflect documented cases, not rates.</p>
          <details><summary>{number(metadata!.unmappedCases)} records are not mapped</summary>
            <p>{number(metadata!.mappedCases)} of {number(metadata!.totalCases)} source records have a resolved city location. Missing, ambiguous, or unsupported locations are excluded.</p>
            <ul>{Object.entries(metadata!.unmappedReasons).map(([reason, count]) => <li key={reason}>{reasonLabels[reason] ?? reason}: {number(count)}</li>)}</ul>
            <p>Nearby city markers may overlap at maximum zoom; use the city list to reach them. Dates retain their source meaning, such as death, discovery, or disappearance.</p>
          </details>
        </div>
      </>}
    </main>
    <footer>Data: Women Count USA · Coordinates: <a href="https://www.geonames.org/" target="_blank" rel="noreferrer">GeoNames</a> (<a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>)</footer>
  </div>
}
