import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import type { DataIndex } from '../src/types'

const data = JSON.parse(readFileSync('public/data/index.json', 'utf8')) as DataIndex

test('main controls search existing profile cities and navigate states without changing the headline', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Female Homicide in the U.S.')
  await expect(page.locator('.coverage-bar')).toHaveText('131,668 reported female homicide victims with a recorded male offender · SHR, 1976–2024')
  const state = page.getByLabel('Choose a state or territory')
  const city = page.getByLabel('City with individual profiles', { exact: true })
  await expect(city).toHaveAttribute('placeholder', 'Search available cities...')
  await expect(page.locator('#profile-city-caption')).toHaveText('Women Count USA · Selected documented cases only')
  expect(await page.locator('datalist option').evaluateAll(options => options.map(o => (o as HTMLOptionElement).value))).toEqual(data.cities.map(c => c.label))
  const a = (await state.boundingBox())!, b = (await city.boundingBox())!, map = (await page.locator('.city-map').boundingBox())!
  expect(a.y).toBe(b.y)
  expect(b.x).toBeGreaterThan(a.x + a.width)
  expect(a.y + a.height).toBeLessThan(map.y)
  await state.selectOption('48')
  await expect(page.getByLabel('Choose a county', { exact: true })).toBeVisible()
  await city.fill('Houston, TX')
  await expect(page.locator('#city-title')).toHaveText('Houston, TX')
  await expect(page.locator('.victim-dot')).toHaveCount(243)
  await page.locator('.victim-dot').first().click()
  await expect(page.getByTestId('victim-profile')).toBeVisible()
  await page.getByRole('button', { name: 'Back to city cases' }).click()
  await expect(page.locator('.victim-dot')).toHaveCount(243)
  await state.selectOption('53')
  await expect(page.locator('#area-title')).toHaveText('Washington')
  await expect(city).toHaveValue('')
  await expect(page.locator('.method-note input,.method-note select')).toHaveCount(0)
  await expect(page.locator('.coverage-bar')).toContainText('131,668')
})

test('controls stack on mobile and the search keeps the existing single-profile behavior', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  const state = page.getByLabel('Choose a state or territory')
  const city = page.getByLabel('City with individual profiles', { exact: true })
  await expect(city).toBeVisible()
  const a = (await state.boundingBox())!, b = (await city.boundingBox())!
  expect(a.x).toBe(b.x)
  expect(b.y).toBeGreaterThan(a.y + a.height)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await state.selectOption('16')
  await expect(page.locator('#area-title')).toHaveText('Idaho')
  await city.fill('Aberdeen, ID')
  await expect(page.getByTestId('victim-profile')).toBeVisible()
  await page.getByRole('button', { name: 'Close victim profile' }).click()
  await page.getByRole('button', { name: 'Reset Map' }).click()
  await expect(city).toHaveValue('')
  await expect(state).toHaveValue('')
  await page.screenshot({ path: 'test-results/main-controls-mobile.png', fullPage: true })
})
