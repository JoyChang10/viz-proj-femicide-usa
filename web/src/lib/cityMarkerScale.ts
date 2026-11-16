import type { City } from '../types'

export const MIN_CITY_DIAMETER = 8
export const MAX_CITY_DIAMETER = 28

/** Scale colored circle area continuously over the full dataset's count domain.
 * The minimum visible area keeps small cities legible; no count bins are used.
 */
export function createCityDiameterScale(cities: Pick<City, 'caseCount'>[]): (count: number) => number {
  if (!cities.length) return () => MIN_CITY_DIAMETER
  const counts = cities.map(city => city.caseCount)
  const minimum = Math.min(...counts)
  const maximum = Math.max(...counts)
  if (minimum === maximum) return () => MIN_CITY_DIAMETER
  return count => {
    const fraction = (Math.min(maximum, Math.max(minimum, count)) - minimum) / (maximum - minimum)
    return Math.sqrt(MIN_CITY_DIAMETER ** 2 + fraction * (MAX_CITY_DIAMETER ** 2 - MIN_CITY_DIAMETER ** 2))
  }
}
