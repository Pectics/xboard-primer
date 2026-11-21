import assert from 'node:assert/strict'
import {mkdir, readFile, readdir} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {apiFixture, epoch, origin, siteTitle, token} from './fixtures/portal.mjs'

const root = fileURLToPath(new URL('../dist/Primer/', import.meta.url))
const assetPrefix = '/theme/Primer/assets/'
const axePath = createRequire(import.meta.url).resolve('axe-core/axe.min.js')

export async function loadTheme() {
  const [blade, configText, assets] = await Promise.all([
    readFile(resolve(root, 'dashboard.blade.php'), 'utf8'),
    readFile(resolve(root, 'config.json'), 'utf8'),
    readdir(resolve(root, 'assets')),
  ])
  const config = JSON.parse(configText)
  assert.equal(config.name, 'Primer')
  const defaults = Object.fromEntries(config.configs.map(field => [field.field_name, field.default_value ?? '']))
  const settings = {
    title: siteTitle,
    assets_path: '/theme/Primer/assets',
    theme: {color: defaults.theme_color},
    version: 'fixture',
    background_url: defaults.background_url,
    description: 'Portal fixture',
    i18n: ['zh-CN', 'en-US', 'fa-IR'],
    logo: '',
  }
  const html = blade
    .replace(/\{\{\s*\$title\s*\}\}/g, siteTitle)
    .replace(/\{\{\s*\$theme\s*\}\}/g, 'Primer')
    .replace(/\{\{\s*\\?Illuminate\\Support\\Js::from\(\[[\s\S]*?\]\)\s*\}\}/g, JSON.stringify(settings))
    .replace(/\{!!\s*\$theme_config\['custom_html'\]\s*\?\?\s*''\s*!!\}/g, '')
  assert.doesNotMatch(html, /\{\{|\{!!/, 'Packaged dashboard has an unresolved Blade expression')
  return {html, assets: new Set(assets)}
}

export async function openPortal(testContext, browser, theme, options = {}) {
  const {path = '/dashboard', width = 1280, signedIn = true, mode = 'light', data = {}} = options
  const context = await browser.newContext({
    viewport: {width, height: 900}, colorScheme: mode, locale: 'zh-CN', timezoneId: 'Asia/Shanghai',
    serviceWorkers: 'block',
  })
  const errors = []
  testContext.after(async () => {
    await context.close()
    assert.deepEqual(errors, [], 'Unexpected requests or uncaught browser errors')
  })
  const page = await context.newPage()
  await page.clock.setFixedTime(new Date(epoch * 1000))
  page.setDefaultTimeout(5000)
  const calls = []
  const assetRequests = new Set()
  page.on('pageerror', error => errors.push(error.message))
  if (signedIn) {
    await page.addInitScript(token => {
      if (sessionStorage.getItem('seeded')) return
      localStorage.setItem('VUE_NAIVE_ACCESS_TOKEN', JSON.stringify({value: token, time: Date.now(), expire: Date.now() + 600000}))
      sessionStorage.setItem('seeded', '1')
    }, token)
  }
  await context.route('**/*', async route => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.origin === origin) {
      if (url.pathname === '/') return route.fulfill({contentType: 'text/html; charset=utf-8', body: theme.html})
      const file = url.pathname.slice(assetPrefix.length)
      if (url.pathname.startsWith(assetPrefix) && theme.assets.has(file)) {
        assetRequests.add(url.pathname)
        return route.fulfill({path: resolve(root, 'assets', file)})
      }
      if (url.pathname.startsWith('/api/v1/')) {
        const path = url.pathname.slice('/api/v1'.length)
        calls.push({path, method: request.method(), headers: request.headers()})
        try {
          return route.fulfill({json: apiFixture(path, url.searchParams, data)})
        } catch (error) {
          errors.push(error.message)
          return route.fulfill({status: 404, json: {message: error.message}})
        }
      }
    }
    errors.push(`Unexpected ${request.method()} ${url.href}`)
    return route.fulfill({status: 404, body: ''})
  })
  await page.goto(`${origin}/#${path}`)
  return {page, calls, assetRequests}
}

export async function accessible(page) {
  await page.addScriptTag({path: axePath})
  const failures = await page.evaluate(async () => {
    const result = await window.axe.run(document, {runOnly: {type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa']}})
    return result.violations.map(issue => [issue.id, issue.nodes.map(node => node.target)])
  })
  assert.deepEqual(failures, [], `WCAG A/AA violations on ${page.url()}`)
}

export async function screenshot(page, file) {
  if (!process.env.PORTAL_SCREENSHOT_DIR) return
  await mkdir(process.env.PORTAL_SCREENSHOT_DIR, {recursive: true})
  await page.screenshot({path: resolve(process.env.PORTAL_SCREENSHOT_DIR, file), fullPage: true})
}
