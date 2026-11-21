import {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore} from 'react'
import {createRoot} from 'react-dom/client'
import {ActionList, ActionMenu, BaseStyles, Button, IconButton} from '@primer/react'
import {ThemeProvider} from '@primer/react/next'
import {
  BookIcon, CommentDiscussionIcon, CreditCardIcon, DeviceDesktopIcon, GlobeIcon, GraphIcon, HomeIcon, MoonIcon,
  PackageIcon, PeopleIcon, PersonIcon, ServerIcon, SunIcon, ThreeBarsIcon, XIcon,
} from '@primer/octicons-react'
import {languages, PortalContext, translate, usePortal, useResource} from './core'
import {appearanceKey, internalPath, localeKey, readValue, routeFromHash, sessionLifetime, tokenKey, writeValue} from './session.mjs'
import {Confirm, Dialog, Empty, PageHeader, ResourceState} from './ui'
import {Dashboard} from './Dashboard'
import {Auth} from './Auth'
import {Orders, OrderDetail, Plans, PlanDetail} from './Commerce'
import {Invite, Profile} from './Account'
import {Knowledge, Tickets, TicketDetail} from './Support'
import {Nodes, Traffic} from './Nodes'
import './tokens.css'
import './portal.css'

const site = window.settings || {}
const groups = [
  [null, [['dashboard', '总览', HomeIcon]]],
  ['订阅', [['plan', '购买订阅', PackageIcon], ['node', '节点状态', ServerIcon], ['traffic', '流量明细', GraphIcon]]],
  ['账户', [['order', '我的订单', CreditCardIcon], ['invite', '我的邀请', PeopleIcon], ['profile', '个人中心', PersonIcon]]],
  ['支持', [['knowledge', '使用文档', BookIcon], ['ticket', '我的工单', CommentDiscussionIcon]]],
]
const pages = {dashboard: Dashboard, plan: Plans, order: Orders, invite: Invite, profile: Profile, knowledge: Knowledge, ticket: Tickets, node: Nodes, traffic: Traffic}
const details = {plan: PlanDetail, order: OrderDetail, ticket: TicketDetail}
const titles = Object.fromEntries(groups.flatMap(([, entries]) => entries.map(([key, label]) => [key, label])))
const detailTitles = {plan: '配置订阅', order: '订单详情', ticket: '工单详情'}
const authTitles = {login: '登入', register: '注册', forgetpassword: '重置密码'}
const modes = {auto: ['跟随系统', DeviceDesktopIcon], light: ['浅色', SunIcon], dark: ['深色', MoonIcon]}
const configuredLocales = Array.isArray(site.i18n) ? site.i18n.filter(locale => Object.hasOwn(languages, locale)) : []
const supportedLocales = configuredLocales.length ? configuredLocales : Object.keys(languages)

function move(path, replace = false) {
  const next = `#${internalPath(path)}`
  if (window.location.hash === next) return
  if (replace) {
    history.replaceState(null, '', next)
    window.dispatchEvent(new Event('hashchange'))
  } else {
    window.location.hash = next
  }
}

function listenHash(callback) {
  window.addEventListener('hashchange', callback)
  return () => window.removeEventListener('hashchange', callback)
}

function listenStorage(callback) {
  window.addEventListener('storage', callback)
  window.addEventListener('xboard-session', callback)
  return () => {
    window.removeEventListener('storage', callback)
    window.removeEventListener('xboard-session', callback)
  }
}

const getHash = () => window.location.hash
const getSession = () => readValue(localStorage, tokenKey) || ''
const compact = matchMedia('(max-width: 767px)')
const listenCompact = callback => {
  compact.addEventListener('change', callback)
  return () => compact.removeEventListener('change', callback)
}
const isCompact = () => compact.matches
const getMode = () => {
  const value = localStorage.getItem(appearanceKey)
  return Object.hasOwn(modes, value) ? value : 'auto'
}
const getLocale = () => {
  const value = readValue(localStorage, localeKey)
  return supportedLocales.includes(value) ? value : supportedLocales[0] || 'zh-CN'
}
const syncStorage = () => window.dispatchEvent(new Event('xboard-session'))

function Navigation({active, close}) {
  const {t} = usePortal()
  return <nav className="site-nav" aria-label={t('主导航')}>
    {groups.map(([label, entries]) => <div className="nav-section" key={label || 'overview'}>
      {label && <h2>{t(label)}</h2>}
      <ul>{entries.map(([page, title, Icon]) => <li key={page}>
        <a href={`#/${page}`} aria-current={page === active ? 'page' : undefined} onClick={close}>
          {Icon && <Icon size={16} />}<span>{t(title)}</span>
        </a>
      </li>)}</ul>
    </div>)}
  </nav>
}

function Header({authenticated, toggleNav, navOpen, signOut}) {
  const {t, locale, mode, user, navigate, notify} = usePortal()
  const [logoutOpen, setLogoutOpen] = useState(false)
  const [fullscreen, setFullscreen] = useState(Boolean(document.fullscreenElement))
  useEffect(() => {
    const update = () => setFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', update)
    return () => document.removeEventListener('fullscreenchange', update)
  }, [])
  const ModeIcon = modes[mode][1]
  const title = site.title || 'Xboard'
  return <header className="site-header">
    <div className="header-inner">
      {authenticated && <IconButton icon={ThreeBarsIcon} aria-label={t('切换导航')} aria-expanded={navOpen} onClick={toggleNav} />}
      <a className="brand" href={authenticated ? '#/dashboard' : '#/login'}>
        {site.logo ? <img src={site.logo} alt="" /> : <span className="brand-mark" data-brand={site.theme?.color} aria-hidden="true" />}
        <span>{title}</span>
      </a>
      <div className="header-actions">
        <ActionMenu>
          <ActionMenu.Anchor><IconButton icon={GlobeIcon} aria-label={t('语言')} variant="invisible" /></ActionMenu.Anchor>
          <ActionMenu.Overlay align="end"><ActionList selectionVariant="single" aria-label={t('语言')}>
            {supportedLocales.map(code => <ActionList.Item key={code} selected={locale === code} lang={code}
              onSelect={() => { writeValue(localStorage, localeKey, code); syncStorage() }}>{languages[code]}</ActionList.Item>)}
          </ActionList></ActionMenu.Overlay>
        </ActionMenu>
        <ActionMenu>
          <ActionMenu.Anchor><IconButton icon={ModeIcon} aria-label={t('外观')} variant="invisible" /></ActionMenu.Anchor>
          <ActionMenu.Overlay align="end"><ActionList selectionVariant="single" aria-label={t('外观')}>
            {Object.entries(modes).map(([value, [label, Icon]]) => <ActionList.Item key={value} selected={mode === value}
              onSelect={() => { localStorage.setItem(appearanceKey, value); syncStorage() }}>
              <ActionList.LeadingVisual><Icon /></ActionList.LeadingVisual>{t(label)}
            </ActionList.Item>)}
          </ActionList></ActionMenu.Overlay>
        </ActionMenu>
        {authenticated && <div className="account-menu"><ActionMenu>
          <ActionMenu.Anchor><Button variant="invisible" aria-label={t('账户菜单')}><span className="avatar">{user?.email?.slice(0, 1).toUpperCase() || <PersonIcon size={16} />}</span></Button></ActionMenu.Anchor>
          <ActionMenu.Overlay align="end"><ActionList>
            {user?.email && <ActionList.GroupHeading>{user.email}</ActionList.GroupHeading>}
            <ActionList.Item onSelect={() => navigate('/profile')}>{t('个人中心')}</ActionList.Item>
            {document.fullscreenEnabled && <ActionList.Item onSelect={async () => {
              try { await (fullscreen ? document.exitFullscreen() : document.documentElement.requestFullscreen()) }
              catch { notify(t('请求失败')) }
            }}>{t(fullscreen ? '退出全屏' : '全屏')}</ActionList.Item>}
            <ActionList.Divider />
            <ActionList.Item onSelect={() => setLogoutOpen(true)}>{t('登出')}</ActionList.Item>
          </ActionList></ActionMenu.Overlay>
        </ActionMenu></div>}
      </div>
    </div>
    {logoutOpen && <Confirm title={t('确定退出？')} confirmLabel={t('登出')} onConfirm={signOut} onClose={() => setLogoutOpen(false)} />}
  </header>
}

function Workspace({session, locale, mode, route}) {
  const t = useCallback((key, params) => translate(locale, key, params), [locale])
  const userResource = useResource(session ? '/user/info' : null)
  const configResource = useResource(session ? '/user/comm/config' : null)
  const guestResource = useResource(!session || Object.hasOwn(authTitles, route.page) ? '/guest/comm/config' : null)
  const [toast, setToast] = useState(null)
  const [navHidden, setNavHidden] = useState(false)
  const [drawer, setDrawer] = useState(false)
  const mobile = useSyncExternalStore(listenCompact, isCompact)
  const main = useRef(null)
  const lastPath = useRef(route.path)
  const isAuth = Object.hasOwn(authTitles, route.page) && !route.id
  const authenticated = Boolean(session && !isAuth)
  useEffect(() => {
    if (!session && !isAuth) {
      move(route.path === '/dashboard' ? '/login' : `/login?redirect=${encodeURIComponent(route.fullPath)}`, true)
    } else if (session && isAuth && !(route.page === 'login' && (route.query.has('verify') || route.query.has('token')))) {
      move(internalPath(route.query.get('redirect')), true)
    }
  }, [session, isAuth, route])
  useEffect(() => { if (!mobile) setDrawer(false) }, [mobile])
  useEffect(() => {
    if (!toast) return
    const timeout = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(timeout)
  }, [toast])
  useEffect(() => {
    setDrawer(false)
    if (lastPath.current !== route.path) {
      lastPath.current = route.path
      main.current?.focus({preventScroll: true})
      window.scrollTo(0, 0)
    }
  }, [route.path])
  const notify = useCallback(message => setToast({message}), [])
  function signIn(data, redirect) {
    const token = typeof data === 'string' ? data : data?.auth_data
    if (!token) throw new Error(t('请求失败'))
    writeValue(localStorage, tokenKey, token, sessionLifetime)
    syncStorage()
    move(internalPath(redirect), true)
  }
  function signOut() {
    localStorage.removeItem(tokenKey)
    syncStorage()
    move('/login', true)
    notify(t('已退出登录'))
  }
  const table = route.id ? details : pages
  const Component = Object.hasOwn(table, route.page) ? table[route.page] : null
  const title = isAuth ? authTitles[route.page] : Component && (route.id ? detailTitles : titles)[route.page]
  useEffect(() => {
    document.title = `${title ? t(title) : '404'} · ${site.title || 'Xboard'}`
  }, [title, t])
  const user = userResource.data || {}
  const context = {
    session, locale, mode, t, site, guest: guestResource.data || {}, guestResource,
    user, config: configResource.data || {}, refreshUser: userResource.reload,
    navigate: move, notify, signIn, signOut,
  }
  return <PortalContext.Provider value={context}><BaseStyles>
    <a href="#content" className="skip-link" onClick={event => { event.preventDefault(); main.current?.focus() }}>{t('跳至内容')}</a>
    <Header authenticated={authenticated} signOut={signOut} navOpen={mobile ? drawer : !navHidden}
      toggleNav={() => mobile ? setDrawer(true) : setNavHidden(!navHidden)} />
    <div className={authenticated ? `app-layout ${navHidden ? 'without-nav' : ''}` : 'public-layout'}>
      {authenticated && !navHidden && <aside className="sidebar"><Navigation active={route.page} /></aside>}
      <main ref={main} id="content" tabIndex={-1}>
        {isAuth ? <Auth key={route.page} page={route.page} query={route.query} /> : authenticated &&
          <ResourceState resource={userResource}><ResourceState resource={configResource}>
            {Component ? <Component key={route.path} id={route.id} query={route.query} /> :
              <><PageHeader title="404" /><Empty title={t('页面不存在')} action={<Button as="a" href="#/dashboard">{t('总览')}</Button>} /></>}
          </ResourceState></ResourceState>}
      </main>
    </div>
    {drawer && authenticated && <Dialog title={t('主导航')} width="small" position="left" onClose={() => setDrawer(false)}>
      <Navigation active={route.page} close={() => setDrawer(false)} />
    </Dialog>}
    <div className="announcer" role="status" aria-live="polite">{toast && <div className="toast">
      {toast.message}<IconButton size="small" variant="invisible" icon={XIcon} aria-label={t('关闭提示')} onClick={() => setToast(null)} />
    </div>}</div>
  </BaseStyles></PortalContext.Provider>
}

function App() {
  const session = useSyncExternalStore(listenStorage, getSession)
  const mode = useSyncExternalStore(listenStorage, getMode)
  const locale = useSyncExternalStore(listenStorage, getLocale)
  const hash = useSyncExternalStore(listenHash, getHash)
  const route = useMemo(() => routeFromHash(hash), [hash])
  useLayoutEffect(() => {
    document.documentElement.dataset.colorMode = mode
    document.documentElement.lang = locale
    document.documentElement.dir = locale === 'fa-IR' ? 'rtl' : 'ltr'
  }, [mode, locale])
  useEffect(() => {
    if (!session) return
    const record = JSON.parse(localStorage.getItem(tokenKey))
    if (!record?.expire) return
    const timeout = setTimeout(syncStorage, Math.max(0, record.expire - Date.now() + 1))
    return () => clearTimeout(timeout)
  }, [session])
  return <ThemeProvider colorMode={mode} contextOnly>
    <PortalContext.Provider value={{session, locale}}>
      <Workspace session={session} mode={mode} locale={locale} route={route} />
    </PortalContext.Provider>
  </ThemeProvider>
}

createRoot(document.getElementById('app')).render(<App />)
