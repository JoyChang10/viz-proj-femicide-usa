export interface City {
  id: string
  label: string
  latitude: number
  longitude: number
  caseCount: number
  geonameId: number
  sourceName: string
}

export interface VictimCase {
  id: string
  name: string
  age: string | null
  date: string | null
  dateDetail: string | null
  city: string | null
  state: string | null
  about: string | null
  relationship: string | null
  causeOfDeath: string | null
  caseStatus: string | null
  narrative: string | null
  disclaimer: string | null
  sources: string[]
}

export interface DataIndex {
  metadata: {
    totalCases: number
    mappedCases: number
    unmappedCases: number
    cityCount: number
    unmappedReasons: Record<string, number>
    sourceFile: string
    sourceSha256: string
    generatedAt: string
    synthetic: boolean
  }
  cities: City[]
}
