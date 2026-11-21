import assert from 'node:assert/strict'
import {test} from 'node:test'
import {internalPath, readValue, routeFromHash, tokenKey, writeValue} from '../src/session.mjs'
import {clientPlatform, importTargets, subscriptionUrl} from '../src/subscription.mjs'

function memoryStorage() {
  const store = new Map()
  return {
    getItem: key => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, value),
    removeItem: key => store.delete(key),
  }
}

test('existing sessions use the original key, value envelope and expiration time', () => {
  const storage = memoryStorage()
  storage.setItem('VUE_NAIVE_ACCESS_TOKEN', '{"value":"fixture","time":1,"expire":2000}')
  assert.equal(readValue(storage, tokenKey, 1999), 'fixture')
  assert.equal(readValue(storage, tokenKey, 2000), null)
  assert.equal(storage.getItem(tokenKey), null)
  writeValue(storage, tokenKey, 'fixture', 60_000)
  assert.equal(readValue(storage, tokenKey), 'fixture')
})

test('bookmarks retain detail IDs, invite codes and checkout selections', () => {
  assert.equal(routeFromHash('').page, 'dashboard')
  assert.equal(routeFromHash('#/order/000100020003').id, '000100020003')
  assert.equal(routeFromHash('#/register?code=A%2BB').query.get('code'), 'A+B')
  assert.equal(routeFromHash('#/plan/2?period=reset_price').query.get('period'), 'reset_price')
  assert.equal(routeFromHash('#/ticket/%').page, '404')
  assert.equal(routeFromHash('#/order/1/unexpected').page, '404')
  assert.equal(internalPath('dashboard'), '/dashboard')
  assert.equal(internalPath('//example.test'), '/dashboard')
})

test('protocol selection keeps existing URL parameters and client import formats', () => {
  const url = subscriptionUrl('/s/example?flag=client', ['vmess', 'vless'], 'https://example.test')
  assert.equal(new URL(url).searchParams.get('flag'), 'client')
  assert.equal(new URL(url).searchParams.get('types'), 'vmess,vless')
  assert.equal(subscriptionUrl('javascript:void(0)', [], 'https://example.test'), '')
  const targets = new Map(importTargets(url, '测试', 'other').map(([name, , link]) => [name, link]))
  assert.equal(targets.size, 10)
  assert.equal(new URL(targets.get('Clash')).searchParams.get('url'), url)
  assert.equal(new URL(targets.get('Surge')).searchParams.get('name'), '测试')
  assert.deepEqual(JSON.parse(new URL(targets.get('Quantumult X')).searchParams.get('remote-resource')).server_remote, [`${url}, tag=测试`])
  assert.equal(clientPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS like Mac OS X)'), 'ios')
})
