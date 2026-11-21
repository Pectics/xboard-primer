export function clientPlatform(agent) {
  if (/iphone|ipad|ipod/i.test(agent)) return 'ios'
  if (/android/i.test(agent)) return 'android'
  if (/windows/i.test(agent)) return 'windows'
  if (/macintosh/i.test(agent)) return 'mac'
  return 'other'
}

export function subscriptionUrl(raw, types, origin) {
  if (!raw) return ''
  try {
    const url = new URL(raw, origin)
    if (!['http:', 'https:'].includes(url.protocol)) return ''
    if (types.length) url.searchParams.set('types', types.join(','))
    return url.href
  } catch {
    return ''
  }
}

export function importTargets(url, title, platform) {
  const encoded = encodeURIComponent(url)
  const name = encodeURIComponent(title)
  const safeBase64 = btoa(Array.from(new TextEncoder().encode(url), byte => String.fromCharCode(byte)).join(''))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  const clash = `clash://install-config?url=${encoded}&name=${name}`
  const quantumult = {server_remote: [`${url}, tag=${title}`]}
  const targets = [
    ['Clash', ['windows'], clash],
    ['Clash Meta', ['mac', 'android'], clash],
    ['Hiddify', ['windows', 'mac', 'android', 'ios'], `hiddify://import/${url}#${name}`],
    ['Sing-box', ['mac', 'android', 'ios'], `sing-box://import-remote-profile?url=${encoded}#${name}`],
    ['Shadowrocket', ['mac', 'ios'], `shadowrocket://add/sub://${safeBase64}?remark=${name}`],
    ['Quantumult X', ['mac', 'ios'], `quantumult-x:///update-configuration?remote-resource=${encodeURIComponent(JSON.stringify(quantumult))}`],
    ['Surge', ['mac', 'ios'], `surge:///install-config?url=${encoded}&name=${name}`],
    ['Stash', ['mac', 'ios'], `stash://install-config?url=${encoded}&name=${name}`],
    ['NekoBox', ['android'], clash],
    ['Surfboard', ['android'], `surfboard:///install-config?url=${encoded}&name=${name}`],
  ]
  return targets.filter(([, platforms]) => platform === 'other' || platforms.includes(platform))
}
