import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CityMap } from './components/CityMap'
import { VictimProfile } from './components/VictimProfile'
import { VictimDotGrid } from './components/VictimDotGrid'
import { CityProfileSearch } from './components/CityProfileSearch'
import { loadCases, loadIndex, number } from './lib/data'
import { loadGeography, loadCounties, type GeographyData, type AreaFeature, type Areas } from './lib/geography'
import type { City, DataIndex, VictimCase } from './types'

const EMPTY_AREAS: Areas = { type: 'FeatureCollection', features: [] }
const countText = (count: number | null) => count === null ? 'No reported data' : number(count)
export default function App() {
  const [data, setData] = useState<DataIndex>()
  const [geo, setGeo] = useState<GeographyData>()
  const [state, setState] = useState<AreaFeature>()
  const [county, setCounty] = useState<AreaFeature>()
  const [counties, setCounties] = useState<Areas>()
  const [countyError, setCountyError] = useState<string | null>(null)
  const [countyAttempt, setCountyAttempt] = useState(0)
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
    Promise.all([loadIndex(controller.signal), loadGeography(controller.signal)]).then(([next, geography]) => {
      setData(next); setGeo(geography)
    }).catch((err: Error) => { if (err.name !== 'AbortError') setError(err.message) })
    return () => controller.abort()
  }, [indexAttempt])
  useEffect(() => {
    setCounties(undefined); setCountyError(null)
    if (!state) return
    const controller = new AbortController()
    loadCounties(state.properties.fips, controller.signal).then(next => {
      if (!controller.signal.aborted) setCounties(next)
    }).catch((err: Error) => { if (!controller.signal.aborted) setCountyError(err.message) })
    return () => controller.abort()
  }, [state?.properties.fips, countyAttempt])
  useEffect(() => {
    if (!city) { setCases([]); return }
    const controller = new AbortController()
    setCases([]); setCaseError(null); setLoadingCases(true)
    loadCases(city.id, controller.signal).then(nextCases => {
      if (controller.signal.aborted) return
      setCases(nextCases)
      if (nextCases.length === 1) { setSelectedCaseId(nextCases[0].id); setRecord(nextCases[0]) }
    }).catch((err: Error) => {
      if (!controller.signal.aborted && err.name !== 'AbortError') setCaseError(err.message)
    }).finally(() => { if (!controller.signal.aborted) setLoadingCases(false) })
    return () => controller.abort()
  }, [city, caseAttempt])
  const selectRecord = useCallback((next: VictimCase) => {
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    savedScroll.current = getCityScroll()?.scrollTop ?? 0
    setSelectedCaseId(next.id); setRecord(next)
  }, [getCityScroll])
  const closeCity = useCallback(() => {
    setRecord(undefined); setCity(undefined); setCases([]); setSelectedCaseId(undefined)
    setCaseError(null); setLoadingCases(false); savedScroll.current = 0; returnFocus.current = null
  }, [])
  const selectCity = useCallback((next: City) => {
    returnFocus.current = null
    const same = next.id === city?.id
    setRecord(undefined); setSelectedCaseId(undefined)
    if (!same) { setCases([]); setCaseError(null); setLoadingCases(true) }
    setCity(next); savedScroll.current = 0
    const scroll = getCityScroll()
    if (scroll) scroll.scrollTop = 0
    if (same && cases.length === 1) selectRecord(cases[0])
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
  const selectState = useCallback((next: AreaFeature) => {
    closeCity(); setCounty(undefined); setCounties(undefined); setState(next)
  }, [closeCity])
  const selectCounty = useCallback((next: AreaFeature) => { closeCity(); setCounty(next) }, [closeCity])
  const onSelectArea = useCallback((next: AreaFeature) => {
    if (state) selectCounty(next)
    else selectState(next)
  }, [state, selectCounty, selectState])
  const reset = () => {
    closeCity(); setCounty(undefined); setState(undefined); setCounties(undefined); setResetVersion(v => v + 1)
  }
  const backToState = () => {
    closeCity(); setCounty(undefined); setState(previous => previous ? { ...previous } : undefined)
  }
  const visibleCities = useMemo(() => !county || !geo || !data ? city ? [city] : [] : data.cities.filter(c => geo.cityCounty[c.id] === county.properties.fips), [county, geo, data, city])
  const profileCount = visibleCities.reduce((sum, c) => sum + c.caseCount, 0)
  const years = geo ? `${geo.metadata.yearMin}–${geo.metadata.yearMax}` : ''
  const areas = state ? counties ?? EMPTY_AREAS : geo?.states ?? EMPTY_AREAS
  return <div className="app">
    <header className="site-header"><h1>Female Homicide in the U.S.</h1><button className="reset-button" onClick={reset} disabled={!geo}>Reset Map</button></header>
    <main>{!data || !geo ? <div className="loading-state" role={error ? 'alert' : 'status'}>
      {error ? <><h2>Data could not be loaded</h2><p>{error}</p><button onClick={() => setIndexAttempt(v => v + 1)}>Retry loading</button></> : 'Loading geographic data…'}
    </div> : <>
      <div className="coverage-bar"><p><strong>{number(geo.metadata.count)}</strong> reported female homicide victims with a recorded male offender · SHR, {years}</p></div>
      <div className="map-controls" aria-label="Map exploration controls">
        <div className="map-control">
          <label htmlFor="state-select">Choose a state or territory</label>
          <select id="state-select" value={state?.properties.fips ?? ''} onChange={event => {
            const next = geo.states.features.find(f => f.properties.fips === event.target.value)
            if (next) selectState(next)
          }}>
            <option value="" disabled>Choose a state…</option>
            {[...geo.states.features].sort((a, b) => a.properties.name.localeCompare(b.properties.name)).map(f => <option key={f.properties.fips} value={f.properties.fips}>{f.properties.name}</option>)}
          </select>
        </div>
        <CityProfileSearch cities={data.cities} selectedCity={city} onSelect={next => {
          setState(undefined); setCounty(undefined); selectCity(next)
        }} />
      </div>
      <div className="explorer">
        <CityMap cities={data.cities} visibleCities={visibleCities} selectedCity={city} onSelect={selectCity} resetVersion={resetVersion}
          areas={areas} nationalStates={geo.states} state={state} county={county} onSelectArea={onSelectArea} onNational={reset} years={years} />
        <aside className="explorer-sidebar" aria-label="Geographic statistics and individual profiles">
          {state && <nav className="geo-navigation" aria-label="Map navigation">
            <button onClick={reset}>All states</button>
            {county && <button onClick={backToState}>{state.properties.name} counties</button>}
            {city && <button onClick={closeCity}>{county?.properties.name}</button>}
          </nav>}
          <div className="sidebar-scroll" ref={cityScroll} hidden={!!record}>
            {city ? <VictimDotGrid key={city.id} city={city} cases={cases} loading={loadingCases} error={caseError}
              selectedId={selectedCaseId} onClose={closeCity} onRetry={() => setCaseAttempt(v => v + 1)} onSelect={selectRecord} /> : <>
              <h2 id="area-title">{county?.properties.name ?? state?.properties.name ?? 'Reported homicide counts'}</h2>
              <p className="area-source">SHR · {years}</p>
              <p className="area-count" data-testid="shr-count">{countText(county ? county.properties.count : state ? state.properties.count : geo.metadata.count)}</p>
              <p className="muted">Reported female homicide victims with a recorded male offender. This measure does not establish gender motivation.</p>
              {!state ? <>
                <p className="muted exploration-note">Select a state to explore its counties.</p>
              </> : !county ? <>
                {countyError ? <div role="alert"><p>{countyError}</p><button onClick={() => setCountyAttempt(v => v + 1)}>Retry counties</button></div> : !counties ? <p role="status">Loading counties…</p> : <>
                  <label className="city-label" htmlFor="county-select">Choose a county</label>
                  <select id="county-select" value="" onChange={e => { const next = counties.features.find(f => f.properties.fips === e.target.value); if (next) selectCounty(next) }}>
                    <option value="" disabled>Choose a county…</option>
                    {[...counties.features].sort((a, b) => a.properties.name.localeCompare(b.properties.name)).map(f => <option key={f.properties.fips} value={f.properties.fips}>{f.properties.name}</option>)}
                  </select>
                  {!counties.features.length && <p className="muted">County boundaries are unavailable for this territory.</p>}
                </>}
              </> : <div className="county-profiles">
                <h3>Women Count USA profiles</h3>
                <p className="profile-availability" data-testid="profile-count">{number(profileCount)} available profiles · {number(visibleCities.length)} cities</p>
                <p className="muted">A separate collection of documented cases, not matched to SHR records. These totals are not expected to agree.</p>
                <p className="muted exploration-note">Cities are associated by their representative location, not verified incident counties. Cities can span county borders.</p>
                {visibleCities.length > 0 ? <><label className="city-label" htmlFor="city-select">Choose a city</label>
                  <select id="city-select" value="" onChange={e => { const next = visibleCities.find(c => c.id === e.target.value); if (next) selectCity(next) }}>
                    <option value="" disabled>Choose a city…</option>
                    {visibleCities.map(c => <option key={c.id} value={c.id}>{c.label} ({number(c.caseCount)} profiles)</option>)}
                  </select></> : <p className="muted exploration-note">No detailed city profiles are linked to this county.</p>}
              </div>}
            </>}
          </div>
          {record && <div className="sidebar-scroll profile-scroll"><VictimProfile record={record} onClose={closeProfile} /></div>}
        </aside>
      </div>
      <div className="method-note">
        <p>Shading shows reported counts, not population-adjusted risk. Missing data is not zero.</p>
        <details><summary>Sources, geography, and limitations</summary>
          <p>SHR counts use the supplied cleaned county-year table, summed once across {years}. Missing county-years are not imputed. Geographic reporting coverage varies.</p>
          <p>County boundaries: 2010 Census geography, with a 2024 Guam supplement. Historical FIPS codes are retained; these are not year-specific boundaries. No historical counts were reassigned to current counties.</p>
          <p>Women Count USA profiles have different definitions and time coverage. City locations are representative points, not exact incidents. {number(data.metadata.unmappedCases)} original records have no resolved city location; another {number(geo.metadata.unassignedCities)} mapped cities could not be reliably associated with this county geography.</p>
          <p>Some nearby city markers form clusters. Select a cluster to zoom, or use the county’s city list.</p>
          <p>These profiles remain accessible by city without implying an incident county.</p>
        </details>
      </div>
    </>}</main>
    <footer>Counts: cleaned SHR dataset · Profiles: Women Count USA · Boundaries: <a href="https://www.census.gov/geographies/mapping-files/time-series/geo/cartographic-boundary.html" target="_blank" rel="noreferrer">U.S. Census Bureau</a> · City locations: <a href="https://www.geonames.org/" target="_blank" rel="noreferrer">GeoNames</a> (<a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>)</footer>
  </div>
}
