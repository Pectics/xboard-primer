import assert from 'node:assert/strict'
import {after, before, test} from 'node:test'
import {chromium} from 'playwright'
import {origin, siteTitle, subscription, token} from './fixtures/portal.mjs'
import {accessible, loadTheme, openPortal, screenshot} from './portal-harness.mjs'

let browser, theme
before(async () => {
  theme = await loadTheme()
  browser = await chromium.launch()
})
after(async () => { await browser?.close() })

test('packaged dashboard loads its theme assets, honors the stored session and switches palettes', async context => {
  const {page, calls, assetRequests} = await openPortal(context, browser, theme)
  await page.getByRole('heading', {name: 'Standard'}).waitFor()
  await page.getByRole('button', {name: /服务维护时间安排/}).waitFor()
  await page.getByRole('banner').getByRole('link', {name: siteTitle}).waitFor()
  await page.getByRole('navigation').getByRole('link', {name: '总览'}).waitFor()
  const script = await page.locator('script[type=module][src]').getAttribute('src')
  const style = await page.locator('link[rel=stylesheet][href]').getAttribute('href')
  assert.match(script, /^\/theme\/Primer\/assets\/portal-[\w-]+\.js$/)
  assert.match(style, /^\/theme\/Primer\/assets\/portal-[\w-]+\.css$/)
  assert(assetRequests.has(script), `Browser did not request ${script}`)
  assert(assetRequests.has(style), `Browser did not request ${style}`)
  const userCalls = calls.filter(call => call.path.startsWith('/user/'))
  assert(userCalls.some(call => call.path === '/user/info'))
  assert(userCalls.every(call => call.headers.authorization === token))
  const background = () => page.locator('html').evaluate(root => getComputedStyle(root).backgroundColor)
  const light = await background()
  await accessible(page)
  await screenshot(page, 'dashboard-light.png')

  const appearance = page.getByRole('button', {name: '外观', exact: true})
  await appearance.focus()
  await page.keyboard.press('Enter')
  await page.getByRole('menu').waitFor()
  await page.keyboard.press('Escape')
  assert(await appearance.evaluate(button => button === document.activeElement))
  await appearance.click()
  await page.getByText('深色', {exact: true}).click()
  await page.reload()
  await page.getByRole('heading', {name: 'Standard'}).waitFor()
  assert.equal(await page.locator('html').getAttribute('data-color-mode'), 'dark')
  assert.notEqual(await background(), light, 'The dashboard background should change with the palette')
  await accessible(page)
  await screenshot(page, 'dashboard-dark.png')

  await page.getByRole('button', {name: '一键订阅'}).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', {name: '关闭', exact: true}).waitFor()
  await dialog.getByText('扫描二维码订阅', {exact: true}).click()
  await dialog.locator('.qr-code svg').waitFor()
  await dialog.getByText('选择协议', {exact: true}).first().click()
  await dialog.getByLabel('VLESS', {exact: true}).check()
  assert.match(await dialog.getByRole('textbox').inputValue(), /types=vless/)
  await accessible(page)
  await page.keyboard.press('Escape')
  await page.getByRole('button', {name: /服务维护时间安排/}).click()
  await page.getByRole('dialog').getByText('02:00–02:15').waitFor()
})

test('mobile navigation and bookmarked routes render fixture data without horizontal overflow', async context => {
  const {page} = await openPortal(context, browser, theme, {width: 375, mode: 'dark'})
  const main = page.getByRole('main')
  await main.getByRole('heading', {name: 'Standard'}).waitFor()
  await screenshot(page, 'dashboard-mobile.png')
  await page.getByRole('button', {name: '切换导航'}).click()
  await page.getByRole('dialog').getByRole('link', {name: '购买订阅'}).click()
  await main.getByText('Standard', {exact: true}).first().waitFor()
  assert.equal(new URL(page.url()).hash, '#/plan')
  for (const [path, heading, text] of [
    ['/order', '我的订单', '00092001'],
    ['/order/00092001', '订单详情', '00092001'],
    ['/plan/7', '配置订阅', 'Standard'],
    ['/node', '节点状态', 'Tokyo 01'],
    ['/traffic', '流量明细', '3 GB'],
    ['/ticket', '我的工单', 'Connection settings'],
    ['/ticket/2', '工单详情', 'Connection settings'],
    ['/knowledge', '使用文档', 'Getting started'],
    ['/invite', '我的邀请', '生成邀请码'],
    ['/profile', '个人中心', '到期邮件提醒'],
    ['/unknown', '404', '页面不存在'],
  ]) {
    await page.goto(`${origin}/#${path}`)
    await main.getByRole('heading', {name: heading, exact: true, level: 1}).waitFor()
    await main.getByText(text, {exact: false}).first().waitFor()
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Horizontal overflow on ${path}`)
    await accessible(page)
  }
})

test('a protected mobile bookmark returns to the same order after login', async context => {
  const {page, calls} = await openPortal(context, browser, theme, {signedIn: false, path: '/order/00092001', width: 320})
  await page.getByRole('textbox', {name: /邮箱/}).fill('demo@example.test')
  await page.locator('form input[type=password]').fill('demo-account-only')
  await accessible(page)
  await screenshot(page, 'login-mobile.png')
  await page.locator('form button[type=submit]').click()
  await page.getByText('00092001', {exact: true}).first().waitFor()
  assert.equal(new URL(page.url()).hash, '#/order/00092001')
  const login = calls.find(call => call.path === '/passport/auth/login')
  assert.equal(login.method, 'POST')
  assert.equal(login.headers.authorization, undefined)
  assert.equal(calls.find(call => call.path === '/user/order/detail').headers.authorization, token)
})

test('a guest can open an invitation bookmark and navigate to password recovery', async context => {
  const {page, calls} = await openPortal(context, browser, theme, {signedIn: false, path: '/register?code=A%2BB'})
  const main = page.getByRole('main')
  await main.getByRole('heading', {name: '注册', exact: true}).waitFor()
  assert.equal(await main.getByRole('textbox', {name: /邀请码/}).inputValue(), 'A+B')
  await main.getByRole('link', {name: '返回登录'}).click()
  await main.getByRole('heading', {name: '登录', exact: true}).waitFor()
  assert.equal(await main.getByRole('button', {name: '发送登录链接'}).count(), 0)
  await main.getByRole('link', {name: '忘记密码'}).click()
  await main.getByRole('heading', {name: '忘记密码', exact: true}).waitFor()
  assert.equal(new URL(page.url()).hash, '#/forgetpassword?code=A%2BB')
  assert(calls.some(call => call.path === '/guest/comm/config'))
  assert(calls.every(call => !call.path.startsWith('/user/')))
})

test('mail-link sign-in is offered when the host advertises it', async context => {
  const {page} = await openPortal(context, browser, theme, {
    signedIn: false,
    path: '/login',
    data: {'/guest/comm/config': {login_with_mail_link_enable: 1}},
  })
  await page.getByRole('button', {name: '发送登录链接', exact: true}).waitFor()
  assert(await page.locator('form input[type=password]').isVisible())
})

test('a manually allocated subscription keeps client access and the RTL locale survives reload', async context => {
  const manual = {...subscription, plan: null, plan_id: null}
  const {page, calls} = await openPortal(context, browser, theme, {data: {'/user/getSubscribe': manual}})
  await page.getByRole('button', {name: '一键订阅'}).waitFor()
  await page.getByRole('button', {name: '语言'}).click()
  await page.getByText('فارسی', {exact: true}).click()
  await page.waitForFunction(() => document.documentElement.dir === 'rtl')
  await page.reload()
  await page.getByRole('progressbar').waitFor()
  assert.equal(await page.locator('html').getAttribute('lang'), 'fa-IR')
  assert.equal(await page.locator('html').getAttribute('dir'), 'rtl')
  assert(calls.some(call => call.path === '/user/getSubscribe' && call.headers['content-language'] === 'fa-IR'))
})
