import type { VictimCase } from '../types'
import { formatDate } from './data'

export function caseSummary(record: VictimCase): string {
  const detail = record.dateDetail ? ` (${record.dateDetail.toLowerCase()})` : ''
  return `Age ${record.age ?? 'not documented'} · ${formatDate(record.date, record.dateDetail)}${detail}`
}

