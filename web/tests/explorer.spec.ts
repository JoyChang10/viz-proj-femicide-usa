import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { chooseCity } from './helpers'
import { createCountScale, MISSING_COLOR, ZERO_COLOR, type GeographyData, type Areas } from '../src/lib/geography'
import type { DataIndex, VictimCase } from '../src/types'
const geo = JSON.parse(readFileSync('public/data/shr/index.json', 'utf8')) as GeographyData
const data = JSON.parse(readFileSync('public/data/index.json', 'utf8')) as DataIndex
const houston = data.cities.find(c => c.label === 'Houston, TX')!
const houstonCases = JSON.parse(readFileSync(`public/data/cities/${houston.id}.json`, 'utf8')).cases as VictimCase[]
const texas = JSON.parse(readFileSync('public/data/shr/counties/48.geojson', 'utf8')) as Areas

test('state and county choropleths use SHR totals, dynamic legends and distinct missing/zero colors', async ({ page }) => {
  const scale = createCountScale(texas.features)
  expect(scale.color(null)).toBe(MISSING_COLOR)
  expect(scale.color(0)).toBe(ZERO_COLOR)
  expect(scale.color(scale.min)).not.toBe(scale.color(scale.max))
  await page.goto('/')
  await expect(page.locator('path[data-level=state]')).toHaveCount(geo.states.features.filter(f => Number(f.properties.fips) <= 56).length)
  await expect(page.locator('.single-city-marker,.case-cluster-marker')).toHaveCount(0)
  const tx = geo.states.features.find(f => f.properties.fips === '48')!
  await expect(page.locator('[data-area-fips="48"]')).toHaveAttribute('data-count', String(tx.properties.count))
  await expect(page.getByLabel('state count legend')).toContainText('1976–2024')
  const sidebar = page.getByRole('complementary', { name: 'Geographic statistics and individual profiles' })
  const map = page.locator('.map-frame')
  const trends = sidebar.getByRole('button', { name: 'Socioeconomic Trends' })
  const demographics = sidebar.getByRole('button', { name: 'Victim Demographics' })
  await expect(sidebar.getByTestId('shr-count')).toHaveText(geo.metadata.count.toLocaleString('en-US'))
  await expect(sidebar.getByText('Select a state to explore its counties.')).toBeVisible()
  expect((await map.boundingBox())!.width / (await sidebar.boundingBox())!.width).toBeCloseTo(7 / 3, 1)
  await expect(trends).toHaveCount(0)
  await page.locator('[data-area-fips="48"]').focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('#area-title')).toHaveText('Texas')
  await expect(sidebar.getByTestId('shr-count')).toHaveText(tx.properties.count!.toLocaleString('en-US'))
  await expect(sidebar.getByText(/Select a county, then a city with Women Count USA profiles/)).toBeVisible()
  expect((await map.boundingBox())!.width / (await sidebar.boundingBox())!.width).toBeCloseTo(1, 1)
  await expect(trends).toBeDisabled()
  await expect(demographics).toBeDisabled()
  const firstTopic = (await trends.boundingBox())!
  const secondTopic = (await demographics.boundingBox())!
  expect(firstTopic.width).toBeCloseTo(secondTopic.width)
  expect(firstTopic.y).toBe(secondTopic.y)
  await expect(page.locator('path[data-level=county]')).toHaveCount(texas.features.length)
  await expect(page.getByLabel('county count legend')).toContainText(createCountScale(texas.features).max.toLocaleString('en-US'))
  await page.getByLabel('Choose a county', {exact:true}).selectOption('48201')
  await expect(trends).toHaveCount(0)
  const harris = texas.features.find(f => f.properties.fips === '48201')!
  await expect(page.getByTestId('shr-count')).toHaveText(harris.properties.count!.toLocaleString('en-US'))
  const linked = data.cities.filter(c=>geo.cityCounty[c.id]==='48201')
  await expect(page.getByTestId('profile-count')).toContainText(linked.reduce((s,c)=>s+c.caseCount,0).toLocaleString('en-US'))
  await expect(page.locator('.county-profiles')).toContainText('not matched to SHR')
  await expect(page.locator('[data-area-fips="48201"]')).toHaveAttribute('fill-opacity','0.3')
  await page.getByLabel('Choose a city').selectOption(houston.id)
  await expect(page.locator('.victim-dot')).toHaveCount(houston.caseCount)
  await page.getByRole('button',{name:'Close city cases'}).click()
  await page.locator(`.single-city-marker:has([data-city-id="${houston.id}"])`).click()
  await expect(page.locator('.victim-dot')).toHaveCount(houston.caseCount)
  await page.getByRole('button',{name:'Texas counties',exact:true}).click()
  await expect(sidebar.getByRole('heading', { name: 'Texas', exact: true })).toBeVisible()
  await expect(trends).toBeVisible()
  await expect(page.locator('.single-city-marker,.case-cluster-marker')).toHaveCount(0)
  await page.getByRole('button',{name:'All states',exact:true}).click()
  await expect(trends).toHaveCount(0)
  await expect(page.locator('path[data-level=state]')).toHaveCount(geo.states.features.filter(f => Number(f.properties.fips) <= 56).length)
})

test('missing and zero counties remain distinguishable and FIPS stay exact', async ({ page }) => {
  let missing: {state:string;fips:string}|undefined, zero: {state:string;fips:string}|undefined
  for (const state of geo.states.features) {
    const counties = JSON.parse(readFileSync(`public/data/shr/counties/${state.id}.geojson`, 'utf8')) as Areas
    const a=counties.features.find(f=>f.properties.count===null), b=counties.features.find(f=>f.properties.count===0)
    if(a&&!missing) missing={state:String(state.id),fips:String(a.id)}
    if(b&&!zero) zero={state:String(state.id),fips:String(b.id)}
  }
  expect(missing).toBeDefined();expect(zero).toBeDefined()
  for(const [area,color] of [[missing!,MISSING_COLOR],[zero!,ZERO_COLOR]] as const){
    await page.goto('/')
    await page.getByLabel('Choose a state or territory').selectOption(area.state)
    await page.getByLabel('Choose a county',{exact:true}).selectOption(area.fips)
    await expect(page.locator(`[data-area-fips="${area.fips}"]`)).toHaveAttribute('fill',color)
  }
})

test('county loading errors retry and late responses cannot replace another state', async ({ page }) => {
  let fail=true
  await page.route('**/shr/counties/48.geojson',r=>fail?r.fulfill({status:503}):r.continue())
  await page.goto('/')
  await page.getByLabel('Choose a state or territory').selectOption('48')
  await expect(page.getByRole('alert')).toContainText('503')
  fail=false
  await page.getByRole('button',{name:'Retry counties'}).click()
  await expect(page.getByLabel('Choose a county',{exact:true})).toBeVisible()
  await page.getByRole('button',{name:'Reset Map'}).click()
  await page.route('**/shr/counties/06.geojson',async r=>{await new Promise(resolve=>setTimeout(resolve,700));await r.continue().catch(()=>{})})
  await page.getByLabel('Choose a state or territory').selectOption('06')
  await page.getByRole('button',{name:'All states',exact:true}).click()
  await page.getByLabel('Choose a state or territory').selectOption('53')
  await expect(page.locator('#area-title')).toHaveText('Washington')
  await expect(page.locator('path[data-level=county]').first()).toHaveAttribute('data-area-fips',/^53/)
})

test('data loading failures and case retries preserve the journey', async ({ page }) => {
  let fail=true
  await page.route('**/shr/index.json',r=>fail?r.fulfill({status:503}):r.continue())
  await page.goto('/')
  await expect(page.getByRole('alert')).toContainText('Data could not be loaded')
  fail=false
  await page.getByRole('button',{name:'Retry loading'}).click()
  await page.route(`**/cities/${houston.id}.json`,r=>fail?r.continue():r.fulfill({status:503}))
  await chooseCity(page,houston)
  await expect(page.getByRole('alert')).toContainText('503')
  fail=true
  await page.getByRole('button',{name:'Retry cases'}).click()
  await expect(page.locator('.victim-dot')).toHaveCount(houston.caseCount)
})

test('missing age and year-only dates retain their source meaning', async ({ page }) => {
  await page.goto('/')
  await chooseCity(page,houston)
  const record=houstonCases.find(r=>r.age===null&&r.dateDetail==='YEAR OF DEATH')!
  await page.locator(`[data-case-id="${record.id}"]`).click()
  const profile=page.getByTestId('victim-profile')
  await expect(profile.locator('dt',{hasText:/^Age$/}).locator('..').locator('dd')).toHaveText('Not documented')
  await expect(profile.locator('dt',{hasText:/^year of death$/}).locator('..').locator('dd')).toHaveText(record.date!.slice(0,4))
})

test('Alaska, Hawaii, historical Connecticut and Guam geography remain reachable', async ({ page }) => {
  for (const [fips,name] of [['02','Alaska'],['15','Hawaii'],['09','Connecticut'],['66','Guam']]) {
    await page.goto('/')
    await page.getByLabel('Choose a state or territory').selectOption(fips)
    await expect(page.locator('#area-title')).toHaveText(name)
    await expect(page.locator('path[data-level=county]').first()).toBeVisible()
    if(fips==='09') await expect(page.locator('[data-area-fips="09001"]')).toBeVisible()
  }
})

test('unassigned city profiles remain accessible without an asserted county', async ({ page }) => {
  const city=data.cities.find(c=>!geo.cityCounty[c.id]&&c.caseCount>1)!
  await page.goto('/')
  await page.getByLabel('City with individual profiles', { exact: true }).fill(city.label)
  await expect(page.locator('#city-title')).toHaveText(city.label)
  await expect(page.locator('.victim-dot')).toHaveCount(city.caseCount)
  await expect(page.locator('path[data-level=county]')).toHaveCount(0)
  await page.locator('.victim-dot').first().click()
  await expect(page.getByTestId('victim-profile')).toBeVisible()
  await page.getByRole('button',{name:'Back to city cases'}).click()
  await expect(page.locator('.victim-dot')).toHaveCount(city.caseCount)
})

test('county city clusters sum only available profiles and the layout remains readable', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('path[data-level=state]').first()).toBeVisible()
  await page.screenshot({path:'test-results/shr-national.png'})
  await page.getByLabel('Choose a state or territory').selectOption('48')
  await page.getByLabel('Choose a county',{exact:true}).selectOption('48201')
  const expected=data.cities.filter(c=>geo.cityCounty[c.id]==='48201')
  await expect(page.locator('.single-city-marker,.case-cluster-marker').first()).toBeVisible()
  const sum=await page.locator('.single-city-marker .marker-count,.case-cluster-marker .marker-count').evaluateAll(nodes=>nodes.reduce((s,n)=>s+Number((n as HTMLElement).dataset.caseCount),0))
  expect(sum).toBe(expected.reduce((s,c)=>s+c.caseCount,0))
  const cluster=page.locator('.case-cluster-marker').first()
  if(await cluster.count()) {
    const before=await page.locator('.leaflet-tile').first().getAttribute('src')
    await cluster.click()
    await expect.poll(()=>page.locator('.leaflet-tile').first().getAttribute('src')).not.toBe(before)
  }
  await page.screenshot({path:'test-results/shr-county.png'})
  await page.getByLabel('Choose a city').selectOption(houston.id)
  await page.locator('.victim-dot').first().click()
  await expect(page.getByTestId('victim-profile')).toBeVisible()
  await page.screenshot({path:'test-results/shr-profile.png'})
  await page.setViewportSize({width:390,height:844})
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  await page.screenshot({path:'test-results/shr-mobile.png',fullPage:true})
})
