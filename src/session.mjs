export const tokenKey = 'VUE_NAIVE_ACCESS_TOKEN'
export const localeKey = 'VUE_NAIVE_LOCALE'
export const appearanceKey = 'vueuse-color-scheme'
export const sessionLifetime = 6 * 60 * 60 * 1000

export function readValue(storage, key, now = Date.now()) {
  try {
    const record = JSON.parse(storage.getItem(key))
    if (record && (record.expire == null || record.expire > now)) return record.value
    if (record) storage.removeItem(key)
  } catch {
    return null
  }
  return null
}

export function writeValue(storage, key, value, lifetime) {
  const time = Date.now()
  storage.setItem(key, JSON.stringify({value, time, expire: lifetime ? time + lifetime : null}))
}

export function internalPath(value, fallback = '/dashboard') {
  if (typeof value !== 'string') return fallback
  const path = value.trim().replace(/^#/, '')
  if (!path || /^[/\\]{2}|^[a-z][a-z\d+.-]*:|[\\\s#]/i.test(path)) return fallback
  return path.startsWith('/') ? path : `/${path}`
}

export function routeFromHash(hash) {
  const fullPath = internalPath(hash)
  const offset = fullPath.indexOf('?')
  const path = (offset < 0 ? fullPath : fullPath.slice(0, offset)).replace(/\/+$/, '') || '/dashboard'
  const [, page, segment, ...rest] = path.split('/')
  let id
  try {
    if (segment) id = decodeURIComponent(segment)
  } catch {
    return {page: '404', path, fullPath, query: new URLSearchParams()}
  }
  return {
    page: rest.length ? '404' : page,
    id,
    path,
    fullPath,
    query: new URLSearchParams(offset < 0 ? '' : fullPath.slice(offset + 1)),
  }
}
