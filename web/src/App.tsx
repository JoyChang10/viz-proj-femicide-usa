import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CityMap } from './components/CityMap'
import { VictimProfile } from './components/VictimProfile'
import { VictimDotGrid } from './components/VictimDotGrid'
import { CityProfileSearch } from './components/CityProfileSearch'
import { AnalysisPlaceholder, StateAnalysisLinks, analysisTitle } from './components/StateAnalysis'
import { Tooltip } from './components/Tooltip'
import { loadCases, loadIndex, number } from './lib/data'
import { FBI_COUNT_SOURCE, loadGeography, loadCounties, type GeographyData, type AreaFeature, type Areas } from './lib/geography'
import type { City, DataIndex, VictimCase } from './types'

const EMPTY_AREAS: Areas = { type: 'FeatureCollection', features: [] }
const countText = (count: number | null) => count === null ? 'No reported data' : number(count)
const countDefinition = `${FBI_COUNT_SOURCE}: reported female homicide victims with a recorded male offender. This measure does not establish gender motivation. Counts do not account for population size.`

function setMapState(fips?: string) {
  const url = new URL(window.location.href)
  if (fips) url.searchParams.set('state', fips)
  else url.searchParams.delete('state')
  window.history.replaceState(window.history.state, '', url)
}

export default function App() {
  const params = new URLSearchParams(window.location.search)
  const title = analysisTitle(params.get('analysis'))
  const state = params.get('state')
  return title ? <AnalysisPlaceholder title={title} state={state} /> : <MapExplorer initialState={state} />
}

function MapExplorer({ initialState }: { initialState: string | null }) {
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
      if (controller.signal.aborted) return
      setData(next)
      setGeo(geography)
      setState(geography.states.features.find(area => area.properties.fips === initialState))
    }).catch((err: Error) => { if (err.name !== 'AbortError') setError(err.message) })
    return () => controller.abort()
  }, [indexAttempt, initialState])
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
    setMapState(next.properties.fips)
  }, [closeCity])
  const selectCounty = useCallback((next: AreaFeature) => { closeCity(); setCounty(next) }, [closeCity])
  const onSelectArea = useCallback((next: AreaFeature) => {
    if (state) selectCounty(next)
    else selectState(next)
  }, [state, selectCounty, selectState])
  const reset = () => {
    closeCity(); setCounty(undefined); setState(undefined); setCounties(undefined); setResetVersion(v => v + 1)
    setMapState()
  }
  const backToState = () => {
    closeCity(); setCounty(undefined); setState(previous => previous ? { ...previous } : undefined)
  }
  const visibleCities = useMemo(() => !county || !geo || !data ? city ? [city] : [] : data.cities.filter(c => geo.cityCounty[c.id] === county.properties.fips), [county, geo, data, city])
  const profileCount = visibleCities.reduce((sum, c) => sum + c.caseCount, 0)
  const years = geo ? `${geo.metadata.yearMin}–${geo.metadata.yearMax}` : ''
  const areas = state ? counties ?? EMPTY_AREAS : geo?.states ?? EMPTY_AREAS
  return <div className="app">
    <header className="site-header">
      <div>
        <h1>Femicide in the U.S.</h1>
        <p className="site-intro">Exploring femicide in the United States through national homicide records and individually documented cases spanning the 1950s to 2026.</p>
      </div>
      <button className="reset-button" onClick={reset} disabled={!geo}>Reset Map</button>
    </header>
    <main>{!data || !geo ? <div className="loading-state" role={error ? 'alert' : 'status'}>
      {error ? <><h2>Data could not be loaded</h2><p>{error}</p><button onClick={() => setIndexAttempt(v => v + 1)}>Retry loading</button></> : 'Loading geographic data…'}
    </div> : <>
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
          setMapState()
        }} />
      </div>
      <div className={`explorer${state ? ' explorer-state' : ''}`}>
        <CityMap cities={data.cities} visibleCities={visibleCities} selectedCity={city} onSelect={selectCity} resetVersion={resetVersion}
          areas={areas} nationalStates={geo.states} state={state} county={county} onSelectArea={onSelectArea} onNational={reset} years={years} />
        <aside className="explorer-sidebar" aria-label="Geographic statistics and individual profiles">
          {state && <nav className="geo-navigation" aria-label="Map navigation">
            <button type="button" onClick={reset}><span aria-hidden="true">←</span> All States</button>
            {county && <button type="button" onClick={backToState}><span aria-hidden="true">←</span> {state.properties.name} Counties</button>}
            {city && <button type="button" onClick={closeCity}><span aria-hidden="true">←</span> {county?.properties.name}</button>}
          </nav>}
          <div className="sidebar-scroll" ref={cityScroll} hidden={!!record}>
            {city ? <VictimDotGrid key={city.id} city={city} cases={cases} loading={loadingCases} error={caseError}
              selectedId={selectedCaseId} onClose={closeCity} onRetry={() => setCaseAttempt(v => v + 1)} onSelect={selectRecord} /> : <>
              <h2 id="area-title">{county?.properties.name ?? state?.properties.name ?? 'Reported femicide counts'}</h2>
              <div className="count-line">
                <span className="area-count" data-testid="shr-count">{countText(county ? county.properties.count : state ? state.properties.count : geo.metadata.count)}</span>
                <span className="count-label">Reported victims</span>
                <Tooltip text={countDefinition} className="count-tooltip">
                  {descriptionId => <button className="count-info" type="button" aria-label="About reported victims"
                    aria-describedby={descriptionId} onClick={event => event.currentTarget.focus()}>i</button>}
                </Tooltip>
              </div>
              <p className="count-years">{years}</p>
              <p className="count-source">{FBI_COUNT_SOURCE}</p>
              <p className="count-context">Female homicide victims with a recorded male offender. These records do not establish gender motivation.</p>
              {!state ? <>
                <p className="muted exploration-note">Select a state to explore its counties.</p>
              </> : !county ? <>
                <div className="state-profile-guide">
                  <p><strong>Behind every number is a person.</strong></p>
                  <p>Select a county and click the dots on the map to explore individual victims' stories.</p>
                </div>
                {countyError ? <div role="alert"><p>{countyError}</p><button onClick={() => setCountyAttempt(v => v + 1)}>Retry counties</button></div> : !counties ? <p role="status">Loading counties…</p> : <>
                  <label className="city-label" htmlFor="county-select">Choose a county</label>
                  <select id="county-select" value="" onChange={e => { const next = counties.features.find(f => f.properties.fips === e.target.value); if (next) selectCounty(next) }}>
                    <option value="" disabled>Choose a county…</option>
                    {[...counties.features].sort((a, b) => a.properties.name.localeCompare(b.properties.name)).map(f => <option key={f.properties.fips} value={f.properties.fips}>{f.properties.name}</option>)}
                  </select>
                  {!counties.features.length && <p className="muted">County boundaries are unavailable for this territory.</p>}
                </>}
                <StateAnalysisLinks state={state.properties.fips} />
              </> : <div className="county-profiles">
                <h3>Individual Victim Profiles</h3>
                <p className="profile-availability" data-testid="profile-count"><strong>{number(profileCount)}</strong> documented {profileCount === 1 ? 'case' : 'cases'} · <strong>{number(visibleCities.length)}</strong> {visibleCities.length === 1 ? 'city' : 'cities'}</p>
                <p className="muted">These documented cases come from a separate collection.</p>
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
          <p><strong>{FBI_COUNT_SOURCE} ({years})</strong> provide aggregate counts of reported female homicide victims with a recorded male offender. The counts use a cleaned county-year table. Geographic reporting coverage varies, and missing county-years remain unfilled.</p>
          <p><strong>Women Count USA (1950s–2026)</strong> provides individually documented cases. The datasets have not been matched or deduplicated across sources, and some cases may appear in both. Each dataset has its own coverage and definitions.</p>
          <p>County boundaries: 2010 Census geography, with a 2024 Guam supplement. Historical FIPS codes are retained; these are not year-specific boundaries. No historical counts were reassigned to current counties.</p>
          <p>Individual profiles are assigned to counties using representative city locations. Cities can span county borders, and these assignments do not verify the county of an incident. {number(data.metadata.unmappedCases)} original records have no resolved city location, and {number(geo.metadata.unassignedCities)} mapped cities could not be reliably associated with this county geography.</p>
          <p>Some nearby city markers form clusters. Select a cluster to zoom, or use the county’s city list.</p>
          <p>These profiles remain accessible by city without implying an incident county.</p>
        </details>
      </div>
    </>}</main>
    <footer>Counts: {FBI_COUNT_SOURCE} · Individual cases: <a href="https://womencountusa.org/" target="_blank" rel="noreferrer">Women Count USA</a> · Boundaries: <a href="https://www.census.gov/geographies/mapping-files/time-series/geo/cartographic-boundary.html" target="_blank" rel="noreferrer">U.S. Census Bureau</a> · City locations: <a href="https://www.geonames.org/" target="_blank" rel="noreferrer">GeoNames</a> (<a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>)</footer>
  </div>
}
