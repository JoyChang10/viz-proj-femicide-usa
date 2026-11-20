import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { geoAlbersUsa, geoPath } from 'd3-geo'
import { createCountScale, type AreaFeature, type Areas } from '../lib/geography'
import { number } from '../lib/data'

/** Display projection only: original coordinates and FIPS stay unchanged. */
export function NationalOverview({ areas, onSelect }: { areas: Areas; onSelect: (area: AreaFeature) => void }) {
  const container = useRef<HTMLDivElement>(null)
  const pressedAt = useRef<{ x: number; y: number } | undefined>(undefined)
  const [size, setSize] = useState({ width: 800, height: 480 })
  const [hover, setHover] = useState<{ area: AreaFeature; x: number; y: number }>()
  const states = useMemo(() => areas.features.filter(f => Number(f.properties.fips) <= 56), [areas])
  const scale = useMemo(() => createCountScale(areas.features), [areas])
  useLayoutEffect(() => {
    const element = container.current!
    const resize = () => {
      const { width, height } = element.getBoundingClientRect()
      if (width && height) setSize({ width, height })
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const path = useMemo(() => geoPath(geoAlbersUsa().fitExtent(
    [[12, 12], [Math.max(30, size.width - 12), Math.max(40, size.height - 26)]],
    { type: 'FeatureCollection', features: states },
  )), [states, size])
  const preview = (area: AreaFeature, x: number, y: number) => setHover({
    area, x: Math.max(8, Math.min(size.width - 230, x)), y: Math.max(8, Math.min(size.height - 38, y)),
  })
  return <div ref={container} className="city-map national-overview" role="region" aria-label="Fixed United States overview with Alaska and Hawaii insets">
    <svg viewBox={`0 0 ${size.width} ${size.height}`} aria-label="Select a U.S. state" onMouseLeave={() => setHover(undefined)}
      onPointerDown={event => { pressedAt.current = { x: event.clientX, y: event.clientY } }}>
      {states.map(area => <path key={area.properties.fips} d={path(area) ?? ''}
        data-area-fips={area.properties.fips} data-level="state" data-count={area.properties.count ?? 'missing'}
        data-inset={['02', '15'].includes(area.properties.fips) ? area.properties.state_abb : undefined}
        fill={scale.color(area.properties.count)} stroke="#586867" strokeWidth={0.8}
        vectorEffect="non-scaling-stroke" role="button" tabIndex={0}
        aria-label={`${area.properties.name} · ${area.properties.count === null ? 'No reported data' : `${number(area.properties.count)} reported victims`}`}
        onClick={event => {
          const start = pressedAt.current
          if (event.detail === 0 || !start || Math.hypot(event.clientX - start.x, event.clientY - start.y) < 6) onSelect(area)
        }}
        onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(area) }
        }}
        onMouseMove={event => {
          const rect = container.current!.getBoundingClientRect()
          preview(area, event.clientX - rect.left + 12, event.clientY - rect.top - 38)
        }}
        onMouseLeave={() => setHover(undefined)}
        onFocus={event => {
          const rect = event.currentTarget.getBoundingClientRect(), parent = container.current!.getBoundingClientRect()
          preview(area, rect.x - parent.x, rect.y - parent.y - 38)
        }} onBlur={() => setHover(undefined)} />)}
      {states.filter(f => ['02', '15'].includes(f.properties.fips)).map(area => {
        const bounds = path.bounds(area)
        return <text key={area.properties.fips} x={(bounds[0][0] + bounds[1][0]) / 2} y={bounds[1][1] + 15}
          className="inset-label" textAnchor="middle">{area.properties.name}</text>
      })}
    </svg>
    {hover && <div className="national-tooltip" role="tooltip" style={{ left: hover.x, top: hover.y }}>
      {hover.area.properties.name} · {hover.area.properties.count === null ? 'No reported data' : `${number(hover.area.properties.count)} reported victims`}
    </div>}
  </div>
}
