import { expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import type { City } from '../src/types'
import type { GeographyData } from '../src/lib/geography'

const geo = JSON.parse(readFileSync('public/data/shr/index.json', 'utf8')) as GeographyData
export async function revealCityCounty(page: Page, city: City) {
  const fips = geo.cityCounty[city.id]
  if (!fips) throw new Error(`No validated county association for ${city.label}`)
  await page.getByRole('button', { name: 'Reset Map', exact: true }).click()
  await page.getByLabel('Choose a state or territory').selectOption(fips.slice(0, 2))
  await page.getByLabel('Choose a county', { exact: true }).selectOption(fips)
  await expect(page.getByLabel('Choose a city', { exact: true })).toBeVisible()
}
export async function chooseCity(page: Page, city: City) {
  await revealCityCounty(page, city)
  await page.getByLabel('Choose a city', { exact: true }).selectOption(city.id)
}
