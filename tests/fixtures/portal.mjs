export const origin = 'http://portal.test'
export const epoch = 1794960000
export const token = 'Bearer fixture'
export const siteTitle = 'Primer Fixture'

const gigabyte = 1024 ** 3
const plan = {id: 7, name: 'Standard', month_price: 1200, reset_price: 500, transfer_enable: 100, show: true, sell: true, renew: true}
const user = {email: 'reader@example.test', plan_id: 7, balance: 2400, commission_balance: 0, transfer_enable: 100 * gigabyte, expired_at: epoch + 30 * 86400}
export const subscription = {...user, u: 4 * gigabyte, d: 31.5 * gigabyte, next_reset_at: epoch + 15 * 86400, plan, subscribe_url: `${origin}/s/example`}
const order = {trade_no: '00092001', plan_id: 7, plan, period: 'month_price', status: 3, total_amount: 1200, created_at: epoch}
const ticket = {id: 2, subject: 'Connection settings', status: 0, level: 1, created_at: epoch, updated_at: epoch, message: []}
const notices = [
  {id: 2, title: '服务维护时间安排', content: '维护窗口为 **02:00–02:15**。', created_at: epoch, tags: []},
  {id: 1, title: '客户端配置指南已更新', content: '查看使用文档。', created_at: epoch - 86400, tags: []},
]

const data = {
  '/guest/comm/config': {is_invite_force: 0, is_email_verify: 0},
  '/passport/auth/login': {auth_data: token},
  '/passport/comm/pv': true,
  '/user/info': user,
  '/user/comm/config': {currency: 'CNY', currency_symbol: '¥'},
  '/user/getSubscribe': subscription,
  '/user/getStat': [1, 2, 0],
  '/user/notice/fetch': notices,
  '/user/server/fetch': [{id: 1, name: 'Tokyo 01', type: 'vless', rate: 1, tags: ['JP'], is_online: 1}],
  '/user/plan/fetch': [plan],
  '/user/order/fetch': [order],
  '/user/order/detail': order,
  '/user/order/check': 3,
  '/user/ticket/fetch': [ticket],
  '/user/invite/fetch': {codes: [], stat: [0, 0, 0, 10, 0]},
  '/user/invite/details': [],
  '/user/knowledge/fetch': {Guides: [{id: 1, title: 'Getting started', updated_at: epoch, body: 'Guide'}]},
  '/user/stat/getTrafficLog': [{record_at: epoch, server_rate: 1, u: gigabyte, d: 2 * gigabyte}],
}

export function apiFixture(path, params, overrides) {
  if (!Object.hasOwn(data, path)) throw new Error(`Missing API fixture for ${path}`)
  let value = data[path]
  if (path === '/user/plan/fetch' && params.has('id')) {
    value = params.get('id') === String(plan.id) ? plan : null
  }
  if (path === '/user/ticket/fetch' && params.has('id')) {
    value = params.get('id') === String(ticket.id) ? ticket : null
  }
  if (path === '/user/order/detail' && params.get('trade_no') !== order.trade_no) value = null
  if (Object.hasOwn(overrides, path)) value = overrides[path]
  return Array.isArray(value) ? {data: value, total: value.length} : {data: value}
}
