import {createContext, useCallback, useContext, useEffect, useRef, useState} from 'react'
import {localeKey, readValue, tokenKey} from './session.mjs'
import english from './locales/en-US.json'
import persian from './locales/fa-IR.json'
import japanese from './locales/ja-JP.json'
import korean from './locales/ko-KR.json'
import russian from './locales/ru-RU.json'
import vietnamese from './locales/vi-VN.json'
import chinese from './locales/zh-CN.json'
import traditionalChinese from './locales/zh-TW.json'

export const dictionaries = {
  'zh-CN': chinese, 'en-US': english, 'zh-TW': traditionalChinese, 'ja-JP': japanese,
  'ko-KR': korean, 'vi-VN': vietnamese, 'fa-IR': persian, 'ru-RU': russian,
}
export const languages = {
  'zh-CN': '简体中文', 'en-US': 'English', 'zh-TW': '繁體中文', 'ja-JP': '日本語',
  'ko-KR': '한국어', 'vi-VN': 'Tiếng Việt', 'fa-IR': 'فارسی', 'ru-RU': 'Русский',
}

export function translate(locale, key, params = {}) {
  const text = dictionaries[locale]?.[key] ?? (locale === 'zh-CN' ? key : english[key]) ?? key
  return text.replace(/\{(\w+)\}/g, (placeholder, name) => params[name] ?? placeholder)
}

export const PortalContext = createContext(null)
export const usePortal = () => useContext(PortalContext)

function currentLocale() {
  return document.documentElement.lang || readValue(localStorage, localeKey) || 'zh-CN'
}

async function request(method, path, params, signal) {
  const base = new URL((window.routerBase || '/').replace(/\/?$/, '/'), window.location.origin)
  const url = new URL(`api/v1${path}`, base)
  const locale = currentLocale()
  const headers = {'Accept': 'application/json', 'Content-Language': locale}
  const auth = path.startsWith('/user/') && readValue(localStorage, tokenKey)
  if (auth) headers.Authorization = auth

  const init = {method, headers, cache: 'no-store'}
  if (method === 'GET') {
    for (const [key, value] of Object.entries(params || {})) {
      if (value != null) url.searchParams.set(key, value)
    }
  } else {
    headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(params || {})
  }
  const controller = new AbortController()
  const abort = () => controller.abort()
  if (signal?.aborted) abort()
  else signal?.addEventListener('abort', abort, {once: true})
  const timeout = setTimeout(abort, 12_000)
  let response, result
  try {
    response = await fetch(url, {...init, signal: controller.signal})
    result = await response.json().catch(() => null)
  } catch (error) {
    if (signal?.aborted) throw error
    throw new Error(translate(locale, '请求失败'))
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', abort)
  }
  if (!response.ok || !result || result.status === 'fail') {
    if (auth && (response.status === 401 || (response.status === 403 && (path === '/user/info' || /未登|过期|unauthenticated/i.test(result?.message))))) {
      if (readValue(localStorage, tokenKey) === auth) {
        localStorage.removeItem(tokenKey)
        window.dispatchEvent(new Event('xboard-session'))
      }
    }
    const validation = Object.values(result?.errors || {}).flat()[0]
    throw new Error(validation || result?.message || translate(locale, '请求失败'))
  }
  return result
}

export const get = async (path, params, signal) => (await request('GET', path, params, signal)).data
export const postEnvelope = (path, data) => request('POST', path, data)
export const post = async (path, data) => (await postEnvelope(path, data)).data

export function useResource(path, params) {
  const context = usePortal()
  const identity = context?.session ?? ''
  const locale = context?.locale ?? currentLocale()
  const serialized = JSON.stringify(params || {})
  const key = JSON.stringify([path, serialized, identity, locale])
  const active = useRef(null)
  const [result, setResult] = useState(null)
  const reload = useCallback(async () => {
    if (!path) return null
    active.current?.abort()
    const controller = new AbortController()
    active.current = controller
    setResult(previous => previous?.key === key ? {...previous, refreshing: true} : null)
    try {
      const response = await request('GET', path, JSON.parse(serialized), controller.signal)
      if (!controller.signal.aborted) setResult({key, data: response.data, total: response.total ?? null})
      return response.data
    } catch (error) {
      if (!controller.signal.aborted) setResult({key, error})
      return null
    }
  }, [key, path, serialized])
  useEffect(() => {
    reload()
    return () => active.current?.abort()
  }, [reload])
  const current = path && result?.key === key ? result : null
  return {
    data: current?.data ?? null, total: current?.total ?? null, error: current?.error ?? null,
    loading: Boolean(path && !current), refreshing: Boolean(current?.refreshing), reload,
  }
}

export function money(cents, config = {}) {
  const amount = Number(cents || 0) / 100
  const formatted = amount.toLocaleString(currentLocale(), {minimumFractionDigits: 2, maximumFractionDigits: 2})
  return `${config.currency_symbol ?? config.currency ?? '¥'}${formatted}`
}

export function bytes(number) {
  const amount = Math.max(0, Number(number) || 0)
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  const unit = Math.min(units.length - 1, amount < 1 ? 0 : Math.floor(Math.log(amount) / Math.log(1024)))
  return `${(amount / 1024 ** unit).toLocaleString(currentLocale(), {maximumFractionDigits: 2})} ${units[unit]}`
}

export function dateTime(unix, locale = currentLocale()) {
  if (!unix) return '—'
  const date = new Date(Number(unix) * 1000)
  return Number.isNaN(date.valueOf()) ? '—' : date.toLocaleString(locale, {dateStyle: 'medium', timeStyle: 'short'})
}

export async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value)
      return
    } catch {}
  }
  const focused = document.activeElement
  const input = document.createElement('textarea')
  input.className = 'clipboard-fallback'
  input.value = value
  const parent = focused?.closest('dialog,[role="dialog"]') || document.body
  parent.append(input)
  input.select()
  try {
    if (!document.execCommand('copy')) throw new Error(translate(currentLocale(), '复制失败'))
  } finally {
    input.remove()
    focused?.focus()
  }
}
