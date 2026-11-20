import { useEffect, useMemo } from 'react'
import L from 'leaflet'
import { useMap } from 'react-leaflet'
import { createCountScale, type AreaFeature, type Areas } from '../lib/geography'
import { number } from '../lib/data'

export function ChoroplethLayer({ areas, level, selectedCounty, onSelect }: {
  areas: Areas; level: 'state' | 'county'; selectedCounty?: string; onSelect: (area: AreaFeature) => void
}) {
  const map = useMap()
  const scale = useMemo(() => createCountScale(areas.features), [areas])
  useEffect(() => {
    const layer = L.geoJSON(areas, {
      style: feature => ({ color: feature?.properties.fips === selectedCounty ? '#e7b70d' : '#586867',
        weight: feature?.properties.fips === selectedCounty ? 2.5 : level === 'state' ? 1 : 0.6,
        fillColor: scale.color(feature!.properties.count), fillOpacity: selectedCounty ? 0.30 : 0.78 }),
      onEachFeature: (feature, areaLayer) => {
        const p = feature.properties
        const label = `${p.name}${level === 'county' ? `, ${p.state_abb}` : ''} · ${p.count === null ? 'No reported data' : `${number(p.count)} reported victims`}`
        const tooltip = document.createElement('span')
        tooltip.textContent = label
        areaLayer.bindTooltip(tooltip, { sticky: true })
        areaLayer.on({ click: () => onSelect(feature as AreaFeature),
          mouseover: () => (areaLayer as L.Path).setStyle({ color: '#e7b70d', weight: 2.5, fillOpacity: selectedCounty ? 0.45 : 0.92 }),
          mouseout: () => layer.resetStyle(areaLayer as L.Path) })
        areaLayer.on('add', () => {
          const el = (areaLayer as L.Path).getElement()
          el?.setAttribute('data-area-fips', p.fips)
          el?.setAttribute('data-count', p.count === null ? 'missing' : String(p.count))
          el?.setAttribute('data-level', level)
          el?.setAttribute('aria-label', label)
          el?.setAttribute('role', 'button')
          el?.setAttribute('tabindex', '0')
          const activate = (event: Event) => {
            if (['Enter', ' '].includes((event as KeyboardEvent).key)) { event.preventDefault(); onSelect(feature as AreaFeature) }
          }
          el?.addEventListener('keydown', activate)
          areaLayer.once('remove', () => el?.removeEventListener('keydown', activate))
        })
      },
    }).addTo(map)
    return () => { layer.remove() }
  }, [map, areas, level, selectedCounty, onSelect, scale])
  return null
}
export function ChoroplethLegend({ areas, level, years, profiles }: { areas: Areas; level: 'state' | 'county'; years: string; profiles?: boolean }) {
  const scale = createCountScale(areas.features)
  const stops = Array.from({ length: 9 }, (_, i) => scale.color((Math.sqrt(scale.min) + i / 8 * (Math.sqrt(scale.max) - Math.sqrt(scale.min))) ** 2))
  return <div className="choropleth-legend" aria-label={`${level} count legend`}>
    <strong>{level === 'state' ? 'State' : 'County'} counts · {years}</strong>
    <span>Female homicide victims, recorded male offender (SHR)</span>
    {scale.max > 0 && <><div className="color-ramp" style={{ background: `linear-gradient(to right, ${stops.join(', ')})` }} />
      <div className="legend-values"><span>{number(scale.min)}</span><span>{number(scale.max)}</span></div></>}
    <div className="legend-keys"><span><i className="zero-key" />0 reported</span><span><i className="missing-key" />No data</span></div>
    <span>Counts, not population-adjusted rates.</span>
    {profiles && <span className="profile-marker-key"><i /> City markers: Women Count USA profiles</span>}
  </div>
}
