import { useEffect, useId, useState } from 'react'
import type { City } from '../types'

export function CityProfileSearch({ cities, selectedCity, onSelect }: {
  cities: City[]; selectedCity?: City; onSelect: (city: City) => void
}) {
  const listId = useId()
  const [query, setQuery] = useState('')
  useEffect(() => { setQuery(selectedCity?.label ?? '') }, [selectedCity])
  return <div className="map-control">
    <label htmlFor="profile-city-search">Find individual profiles by city</label>
    <input id="profile-city-search" type="search" list={listId} value={query}
      placeholder="Search cities with profiles..." autoComplete="off" aria-describedby="profile-city-caption"
      onChange={event => {
        const value = event.target.value
        setQuery(value)
        const city = cities.find(c => c.label.toLocaleLowerCase('en-US') === value.toLocaleLowerCase('en-US'))
        if (city) onSelect(city)
      }} />
    <datalist id={listId}>{cities.map(c => <option key={c.id} value={c.label} />)}</datalist>
    <p id="profile-city-caption">Women Count USA · Selected documented cases only</p>
  </div>
}
