import {useEffect, useLayoutEffect, useRef, useState} from 'react'
import {Button, Checkbox, FormControl, Link, Select, Spinner, TextInput} from '@primer/react'
import {AlertIcon, EyeClosedIcon, EyeIcon, MailIcon} from '@primer/octicons-react'
import {get, post, usePortal} from './core'
import {internalPath} from './session.mjs'
import './auth.css'

const REMEMBERED_EMAIL = 'xboard.portal.rememberedEmail'
const TERMS_KEY = '我已阅读并同意 <a target="_blank" href="{url}">服务条款</a>'
const TELEGRAM_FIELDS = ['id', 'first_name', 'last_name', 'username', 'photo_url', 'auth_date', 'hash']
const CAPTCHA = {
  recaptcha: {
    key: 'recaptcha_site_key', field: 'recaptcha_data', script: 'https://www.recaptcha.net/recaptcha/api.js',
  },
  'recaptcha-v3': {
    key: 'recaptcha_v3_site_key', field: 'recaptcha_v3_token', script: 'https://www.google.com/recaptcha/api.js',
  },
  turnstile: {
    key: 'turnstile_site_key', field: 'turnstile_token', script: 'https://challenges.cloudflare.com/turnstile/v0/api.js',
  },
}
const scripts = new Map()
let captchaScriptId = 0

function rememberedEmail(value) {
  try {
    if (value === undefined) return window.localStorage.getItem(REMEMBERED_EMAIL) || ''
    if (value) window.localStorage.setItem(REMEMBERED_EMAIL, value)
    else window.localStorage.removeItem(REMEMBERED_EMAIL)
  } catch {
    return ''
  }
}

function enabled(value) {
  return value === true || value === 1 || value === '1'
}

function webUrl(value) {
  if (!value) return undefined
  try {
    const url = new URL(value, document.baseURI)
    if (['https:', 'http:'].includes(url.protocol)) return url.href
  } catch {
    return undefined
  }
}

function domainName(value) {
  if (/^[^:/?#@\\%\s]+$/.test(value)) {
    try { return new URL(`https://${value}`).hostname } catch {}
  }
  return value.toLowerCase()
}

function telegramEntry(params) {
  if (!['id', 'auth_date', 'hash'].every(key => params.get(key))) return null
  const data = Object.fromEntries(TELEGRAM_FIELDS.filter(key => params.has(key)).map(key => [key, params.get(key)]))
  data.id = Number(data.id)
  data.auth_date = Number(data.auth_date)
  return Number.isSafeInteger(data.id) && Number.isSafeInteger(data.auth_date) ? data : null
}

function removeTelegramQuery() {
  const url = new URL(window.location.href)
  if (!telegramEntry(url.searchParams)) return
  TELEGRAM_FIELDS.forEach(key => url.searchParams.delete(key))
  window.history.replaceState(window.history.state, '', url)
}

function loadCaptcha(type, siteKey, locale) {
  const turnstile = type === 'turnstile'
  const url = new URL(CAPTCHA[type].script)
  url.searchParams.set('render', type === 'recaptcha-v3' ? siteKey : 'explicit')
  if (!turnstile && locale) url.searchParams.set('hl', locale.startsWith('zh-') ? locale : locale.split('-')[0])
  const source = url.href
  if (scripts.has(source)) return scripts.get(source)
  const existing = turnstile ? window.turnstile : window.grecaptcha
  if (type !== 'recaptcha-v3' && typeof existing?.render === 'function') return Promise.resolve(existing)
  const promise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    const callbackName = `xboardAuthCaptchaReady${++captchaScriptId}`
    const cleanUp = () => {
      clearTimeout(timeout)
      delete window[callbackName]
      script.onerror = null
    }
    const fail = () => {
      cleanUp()
      script.remove()
      reject(new Error('captcha'))
    }
    const timeout = window.setTimeout(fail, 30000)
    window[callbackName] = () => {
      const api = turnstile ? window.turnstile : window.grecaptcha
      if (!api) return fail()
      const ready = () => {
        cleanUp()
        resolve(api)
      }
      if (type === 'recaptcha-v3') api.ready(ready)
      else ready()
    }
    url.searchParams.set('onload', callbackName)
    script.async = true
    script.src = url.href
    script.onerror = fail
    document.head.appendChild(script)
  }).catch(error => {
    scripts.delete(source)
    throw error
  })
  scripts.set(source, promise)
  return promise
}

function CaptchaChallenge({challenge, t}) {
  const host = useRef(null)
  const [loading, setLoading] = useState(true)
  useLayoutEffect(() => {
    const {type, siteKey, action, locale, complete, fail} = challenge
    const container = host.current
    let active = true
    let widget
    let api
    const finish = token => {
      if (!active) return
      active = false
      if (typeof token === 'string' && token) complete(token)
      else fail()
    }
    async function render() {
      api = await loadCaptcha(type, siteKey, locale)
      if (!active) return
      if (type === 'recaptcha-v3') {
        finish(await api.execute(siteKey, {action}))
        return
      }
      const options = {
        sitekey: siteKey,
        size: container.clientWidth < 304 ? 'compact' : 'normal',
        callback: finish,
        'expired-callback': () => finish(),
        'error-callback': () => finish(),
      }
      if (type === 'turnstile') {
        options.theme = 'auto'
        options.language = locale?.toLowerCase() || 'auto'
        options['timeout-callback'] = () => finish()
      } else {
        const scheme = getComputedStyle(container).colorScheme
        const dark = scheme === 'dark' || (scheme !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches)
        options.theme = dark ? 'dark' : 'light'
      }
      widget = api.render(container, options)
      setLoading(false)
    }
    render().catch(() => finish())
    return () => {
      active = false
      if (widget != null) {
        if (type === 'turnstile') api.remove(widget)
        else api.reset(widget)
      }
    }
  }, [challenge])
  return (
    <div className="portal-auth-challenge" role="group" aria-label={t('验证')}>
      <div className="portal-auth-challenge-heading">
        <strong>{t('验证')}</strong>
        <Button size="small" variant="invisible" type="button" onClick={challenge.cancel}>{t('取消')}</Button>
      </div>
      {loading && <Spinner size="small" srText={t('验证')} />}
      <div ref={host} />
    </div>
  )
}

function TelegramLogin({bot, locale, onAuth, t}) {
  const host = useRef(null)
  const handler = useRef(onAuth)
  const [status, setStatus] = useState('loading')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => { handler.current = onAuth }, [onAuth])
  useEffect(() => {
    const previousAuth = window.onTelegramAuth
    const previousHandler = window.handleTelegramAuth
    const authenticate = user => handler.current(user)
    window.onTelegramAuth = authenticate
    window.handleTelegramAuth = authenticate
    return () => {
      if (window.onTelegramAuth === authenticate) window.onTelegramAuth = previousAuth
      if (window.handleTelegramAuth === authenticate) window.handleTelegramAuth = previousHandler
    }
  }, [])
  useEffect(() => {
    if (!bot) return
    const container = host.current
    const widget = document.createElement('div')
    let active = true
    setStatus('loading')
    const script = document.createElement('script')
    script.async = true
    script.src = 'https://telegram.org/js/telegram-widget.js?22'
    script.dataset.telegramLogin = bot
    script.dataset.size = 'large'
    script.dataset.onauth = 'onTelegramAuth(user)'
    script.dataset.requestAccess = 'write'
    if (locale) script.dataset.lang = locale.split('-')[0]
    script.onload = () => setStatus('ready')
    script.onerror = () => setStatus('error')
    queueMicrotask(() => {
      if (active) {
        container.appendChild(widget)
        widget.appendChild(script)
      }
    })
    return () => {
      active = false
      script.onload = script.onerror = null
      widget.remove()
    }
  }, [bot, locale, attempt])
  if (!bot) return null
  return (
    <div className="portal-auth-telegram">
      <div className="portal-auth-divider">{t('或使用第三方登录')}</div>
      <div ref={host} />
      {status === 'loading' && <span role="status">{t('正在加载 Telegram 登录...')}</span>}
      {status === 'error' && (
        <div className="portal-auth-status" role="alert">
          {t('Telegram 登录失败')}
          <Button size="small" type="button" onClick={() => setAttempt(count => count + 1)}>{t('重试')}</Button>
        </div>
      )}
    </div>
  )
}

function PasswordField({title, t, ...props}) {
  const [visible, setVisible] = useState(false)
  return (
    <FormControl required>
      <FormControl.Label>{title}</FormControl.Label>
      <TextInput {...props} block size="large" type={visible ? 'text' : 'password'} minLength={8}
        trailingAction={<TextInput.Action type="button" icon={visible ? EyeClosedIcon : EyeIcon}
          aria-label={`${t('查看')} ${title}`} aria-pressed={visible} onClick={() => setVisible(value => !value)} />} />
    </FormControl>
  )
}

function Terms({t, url}) {
  const text = t(TERMS_KEY, {url: '#'})
  const parts = text.match(/^(.*?)<a\b[^>]*>(.*?)<\/a>(.*)$/s)
  if (!parts) return <Link href={webUrl(url)} target="_blank" rel="noopener noreferrer">{text}</Link>
  return <>{parts[1]}<Link href={webUrl(url)} target="_blank" rel="noopener noreferrer">{parts[2]}</Link>{parts[3]}</>
}

function AuthForm({page, query}) {
  const {t, locale, site, guest, guestResource, notify, navigate, signIn} = usePortal()
  const login = page === 'login'
  const register = page === 'register'
  const forget = page === 'forgetpassword'
  const invite = query.get('code') || ''
  const redirect = internalPath(query.get('redirect')?.replace(/^\/#(?=\/)/, ''))
  const [entry] = useState(() => {
    if (!login) return null
    const verify = query.get('verify') || query.get('token')
    if (verify) return {verify}
    const telegram = telegramEntry(new URLSearchParams(window.location.search)) || telegramEntry(query)
    return telegram ? {telegram} : null
  })
  const [email, setEmail] = useState(() => login ? rememberedEmail() : '')
  const [emailCode, setEmailCode] = useState('')
  const [remember, setRemember] = useState(Boolean(email))
  const [suffix, setSuffix] = useState(null)
  const [acceptedTerms, setAcceptedTerms] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(entry ? 'exchange' : '')
  const [challenge, setChallenge] = useState(null)
  const [retryAt, setRetryAt] = useState(0)
  const [seconds, setSeconds] = useState(0)
  const alive = useRef(false)
  const locked = useRef(Boolean(entry))
  const entered = useRef(false)
  const form = useRef(null)
  const emailInput = useRef(null)
  const title = t(login ? '登入' : register ? '注册' : '忘记密码')
  const suffixes = !login && Array.isArray(guest?.email_whitelist_suffix)
    ? guest.email_whitelist_suffix.map(domain => domain.trim()).filter(Boolean) : []
  const domain = suffixes.includes(suffix) || (forget && suffix === '') ? suffix : suffixes[0] || ''
  const emailAddress = domain ? `${email.trim()}@${domain}` : email.trim()
  const showCode = forget || (register && enabled(guest?.is_email_verify))
  const needsConfig = !login && (!guest || guestResource?.loading || guestResource?.error)
  const hasTerms = register && Boolean(guest?.tos_url)
  const agreed = hasTerms && acceptedTerms === guest.tos_url
  const background = webUrl(site?.background_url)

  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])

  useEffect(() => {
    if (entered.current) return
    entered.current = true
    if (register && invite) post('/passport/comm/pv', {invite_code: invite}).catch(() => {})
    if (!entry) return
    if (entry.telegram) removeTelegramQuery()
    const request = entry.verify
      ? get('/passport/auth/token2Login', {verify: entry.verify, redirect})
      : post('/passport/auth/telegramLogin', entry.telegram)
    request.then(data => acceptLogin(data, '登录成功', redirect)).catch(showError).finally(unlock)
  }, [entry, invite, redirect, register])

  useEffect(() => {
    if (!retryAt) return
    const clock = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil((retryAt - Date.now()) / 1000))
      setSeconds(remaining)
      if (!remaining) setRetryAt(0)
    }, 1000)
    return () => window.clearInterval(clock)
  }, [retryAt])

  function authPath(target) {
    const params = new URLSearchParams()
    if (query.get('redirect')) params.set('redirect', redirect)
    if (invite) params.set('code', invite)
    return `/${target}${params.size ? `?${params}` : ''}`
  }

  function updateEmail(value) {
    const at = value.lastIndexOf('@')
    if (domain && at !== -1) {
      const inputDomain = domainName(value.slice(at + 1))
      const match = suffixes.find(option => domainName(option) === inputDomain)
      if (match) {
        setSuffix(match)
        setEmail(value.slice(0, at))
        return
      }
      if (forget) setSuffix('')
    }
    setEmail(value)
  }

  function showError(reason) {
    if (alive.current) setError(reason?.message || (typeof reason === 'string' && reason) || t('请求失败'))
  }

  function unlock() {
    if (!alive.current) return
    locked.current = false
    setBusy('')
    setChallenge(null)
  }

  async function acceptLogin(data, message, destination, emailToRemember) {
    if (!alive.current) return
    const credential = typeof data === 'string' ? data : data?.auth_data
    if (typeof credential !== 'string' || !credential.trim()) throw new Error(t('请求失败'))
    await signIn(data, destination)
    if (emailToRemember) rememberedEmail(emailToRemember)
    notify(t(message))
  }

  function start(action, operation, protect = false) {
    if (locked.current) return
    locked.current = true
    setBusy(action)
    setError('')
    async function run(fields = {}) {
      if (!alive.current) return
      setChallenge(null)
      try {
        await operation(fields)
      } catch (reason) {
        showError(reason)
      } finally {
        unlock()
      }
    }
    if (protect && enabled(guest?.is_captcha ?? guest?.is_recaptcha)) {
      const type = guest.captcha_type || 'recaptcha'
      const provider = CAPTCHA[type]
      const siteKey = provider && guest[provider.key]
      const fail = () => {
        showError(t('人机验证未完成，请重试'))
        unlock()
      }
      if (!siteKey) return fail()
      setChallenge({type, siteKey, action, locale, cancel: unlock, fail,
        complete: token => run({[provider.field]: token})})
    } else {
      run()
    }
  }

  function sendEmail(mailLink) {
    if (seconds || locked.current || !emailInput.current?.reportValidity()) return
    const action = mailLink ? 'loginWithMailLink' : 'sendEmailVerify'
    start(action, async fields => {
      const result = mailLink
        ? await post('/passport/auth/loginWithMailLink', {email: emailAddress, redirect: encodeURIComponent(redirect)})
        : await post('/passport/comm/sendEmailVerify', {email: emailAddress, ...fields})
      if (!result) throw new Error(t('请求失败'))
      if (!alive.current) return
      setSeconds(60)
      setRetryAt(Date.now() + 60000)
      notify(t('发送成功'))
    }, !mailLink)
  }

  function submit(event) {
    event.preventDefault()
    if (locked.current || needsConfig) return
    const fields = new FormData(event.currentTarget)
    const password = fields.get('password')
    if (!login && password !== fields.get('confirm_password')) {
      setError(t('请确保两次密码输入一致'))
      form.current.elements.confirm_password.focus()
      return
    }
    if (hasTerms && !agreed) return
    const payload = {email: emailAddress, password}
    if (showCode) payload.email_code = fields.get('email_code')
    if (register) payload.invite_code = invite || fields.get('invite_code') || ''
    start(page, async proof => {
      if (forget) {
        const result = await post('/passport/auth/forget', payload)
        if (!result) throw new Error(t('请求失败'))
        if (alive.current) {
          notify(t('重置密码成功,正在返回登录'))
          navigate(authPath('login'))
        }
        return
      }
      const data = await post(register ? '/passport/auth/register' : '/passport/auth/login', {...payload, ...proof})
      return acceptLogin(data, register ? '注册成功' : '登录成功',
        register && !query.get('redirect') ? '/' : redirect, login && remember ? emailAddress : undefined)
    }, register)
  }

  const retryLabel = t('{second}秒后可重新发送', {second: seconds})
  return (
    <section className="portal-auth" aria-labelledby="portal-auth-title"
      style={background ? {backgroundImage: `url(${JSON.stringify(background)})`} : undefined}>
      <div className="portal-auth-card">
        <header className="portal-auth-heading">
          <h1 id="portal-auth-title">{title}</h1>
          {login && site?.description && site.description !== site.title && <p>{site.description}</p>}
        </header>
        <form ref={form} method="post" onSubmit={submit} className="portal-auth-form">
          {error && <div className="portal-auth-error" role="alert"><AlertIcon /><span>{error}</span></div>}
          {guestResource?.error
            ? <div className="portal-auth-error" role="alert">
                <span>{guestResource.error.message || t('请求失败')}</span>
                <Button size="small" type="button" loading={guestResource.refreshing} onClick={guestResource.reload}>{t('重试')}</Button>
              </div>
            : needsConfig && <Spinner size="small" srText={t('正在加载')} />}
          {busy === 'exchange' ? <div className="portal-auth-status" role="status"><Spinner size="small" srText={null} />{t('验证')}</div> : (
            <div className="portal-auth-controls" hidden={Boolean(needsConfig)}>
              <fieldset className="portal-auth-fields" disabled={Boolean(busy)} aria-labelledby="portal-auth-title">
                <div className={suffixes.length ? 'portal-auth-email' : undefined}>
                  <FormControl required>
                    <FormControl.Label>{t('邮箱')}</FormControl.Label>
                    <TextInput ref={emailInput} name="email" value={email} onChange={event => updateEmail(event.target.value)}
                      block size="large" type="text" inputMode="email" autoCapitalize="none" spellCheck={false}
                      autoComplete={login ? 'username' : 'email'} pattern={domain ? '[^@]+' : '.+@[^@\\s]+'} dir="ltr" />
                  </FormControl>
                  {suffixes.length > 0 && (
                    <FormControl>
                      <FormControl.Label visuallyHidden>{t('邮箱后缀')}</FormControl.Label>
                      <Select block size="large" dir="ltr" value={domain} onChange={event => {
                        setSuffix(event.target.value)
                        if (event.target.value) setEmail(email.split('@')[0])
                      }}>
                        {suffixes.map(option => <Select.Option key={option} value={option}>@{option}</Select.Option>)}
                        {forget && <Select.Option value="">{t('其他邮箱')}</Select.Option>}
                      </Select>
                    </FormControl>
                  )}
                </div>
                {showCode && (
                  <div className="portal-auth-code">
                    <FormControl required>
                      <FormControl.Label>{t('邮箱验证码')}</FormControl.Label>
                      <TextInput block size="large" name="email_code" inputMode="numeric" autoComplete="one-time-code"
                        value={emailCode} onChange={event => setEmailCode(event.target.value)} pattern="[0-9]{6}" maxLength={6} dir="ltr" />
                    </FormControl>
                    <Button size="large" type="button" onClick={() => sendEmail(false)} aria-label={seconds ? retryLabel : t('发送')}
                      disabled={Boolean(busy || seconds || needsConfig)} loading={busy === 'sendEmailVerify' && !challenge}>
                      {seconds ? `${seconds}s` : t('发送')}
                    </Button>
                  </div>
                )}
                <PasswordField title={t(forget ? '新密码' : '密码')} t={t} name="password" autoComplete={login ? 'current-password' : 'new-password'} />
                {!login && <PasswordField title={t('再次输入密码')} t={t} name="confirm_password" autoComplete="new-password" />}
                {register && (
                  <FormControl required={enabled(guest?.is_invite_force)}>
                    <FormControl.Label>{t(enabled(guest?.is_invite_force) ? '邀请码' : '邀请码(选填)')}</FormControl.Label>
                    <TextInput block size="large" name="invite_code" defaultValue={invite} readOnly={Boolean(invite)} maxLength={20} />
                  </FormControl>
                )}
                {login && (
                  <div className="portal-auth-options">
                    <FormControl>
                      <Checkbox checked={remember} onChange={event => {
                        setRemember(event.target.checked)
                        if (!event.target.checked) rememberedEmail('')
                      }} />
                      <FormControl.Label>{t('记住账号')}</FormControl.Label>
                    </FormControl>
                    <Link href={`#${authPath('forgetpassword')}`}>{t('忘记密码')}</Link>
                  </div>
                )}
                {hasTerms && (
                  <FormControl required>
                    <Checkbox name="terms" checked={agreed} onChange={event => setAcceptedTerms(event.target.checked ? guest.tos_url : null)} />
                    <FormControl.Label><Terms t={t} url={guest.tos_url} /></FormControl.Label>
                  </FormControl>
                )}
              </fieldset>
              {challenge && <CaptchaChallenge challenge={challenge} t={t} />}
            </div>
          )}
          <div className="portal-auth-actions">
            {busy !== 'exchange' && !needsConfig && (
              <Button className="portal-auth-submit" type="submit" size="large" variant="primary"
                disabled={Boolean(busy || (hasTerms && !agreed))} loading={busy === page && !challenge}>
                {forget ? t('重置密码') : title}
              </Button>
            )}
            <Link href={`#${authPath(login ? 'register' : 'login')}`}>{t(login ? '注册' : '返回登入')}</Link>
          </div>
          {login && busy !== 'exchange' && enabled(guest?.login_with_mail_link_enable) && (
            <Button className="portal-auth-mail" type="button" leadingVisual={MailIcon} labelWrap disabled={Boolean(busy || seconds)}
              onClick={() => sendEmail(true)}>{seconds ? retryLabel : t('发送登录链接')}</Button>
          )}
        </form>
        {login && (
          <TelegramLogin bot={busy !== 'exchange' && enabled(guest?.telegram_login_enable) ? guest.telegram_bot_username : null} t={t} locale={locale}
            onAuth={user => start('telegram', async () => acceptLogin(await post('/passport/auth/telegramLogin', user), '登录成功', redirect))} />
        )}
      </div>
    </section>
  )
}

export function Auth({page, query}) {
  const identity = [page, query.get('verify'), query.get('token'), query.get('redirect'), query.get('code'), query.get('hash')]
  return <AuthForm key={JSON.stringify(identity)} page={page} query={query} />
}

export default Auth
