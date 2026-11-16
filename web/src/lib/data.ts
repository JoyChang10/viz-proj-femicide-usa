import type { DataIndex, VictimCase } from '../types'

async function fetchJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${import.meta.env.BASE_URL}data/${path}`, { signal })
  if (!response.ok) throw new Error(`Could not load data (${response.status}).`)
  return response.json() as Promise<T>
}

export function loadIndex(signal?: AbortSignal) {
  return fetchJson<DataIndex>('index.json', signal)
}

const caseCache = new Map<string, VictimCase[]>()
export async function loadCases(cityId: string, signal?: AbortSignal) {
  const cached = caseCache.get(cityId)
  if (cached) return cached
  const result = await fetchJson<{ cityId: string; cases: VictimCase[] }>(`cities/${cityId}.json`, signal)
  if (result.cityId !== cityId) throw new Error('The city data does not match the selected location.')
  const cases = result.cases.sort((a, b) => a.name.localeCompare(b.name, 'en-US') || a.id.localeCompare(b.id, 'en-US'))
  caseCache.set(cityId, cases)
  return cases
}

export const number = (n: number) => n.toLocaleString('en-US')

export function formatDate(value: string | null, detail: string | null): string {
  if (!value) return 'Not documented'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const options: Intl.DateTimeFormatOptions = { timeZone: 'UTC', year: 'numeric' }
  if (!detail?.includes('YEAR')) options.month = 'long'
  if (!detail?.includes('YEAR') && !detail?.includes('MONTH')) options.day = 'numeric'
  return new Intl.DateTimeFormat('en-US', options).format(date)
}
