import {useEffect, useRef, useState, useSyncExternalStore} from 'react'
import {
  ActionList, ActionMenu, Button, Label, Link, Radio, SegmentedControl, TextInput,
} from '@primer/react'
import {
  AlertIcon, ArrowLeftIcon, BookIcon, CheckIcon, CreditCardIcon, FilterIcon, TagIcon, XIcon,
} from '@primer/octicons-react'
import {marked} from 'marked'
import {bytes, dateTime, get, money, post, postEnvelope, usePortal, useResource} from './core'
import {Confirm, Dialog, Empty, PageHeader, Panel, QrCode, ResourceState, RichText} from './ui'
import './commerce.css'

const periods = {
  month_price: '月付', quarter_price: '季付', half_year_price: '半年付', year_price: '年付',
  two_year_price: '两年付', three_year_price: '三年付', onetime_price: '一次性', reset_price: '流量重置包',
}
const statuses = ['待支付', '开通中', '已取消', '已完成', '已折抵']
const statusColors = ['attention', 'accent', 'default', 'success', 'done']
const planFilters = ['全部', '按周期', '按流量']
const cancelWarning = '如果你已经付款，取消订单可能会导致支付失败，确定取消订单吗？'
const resetWarning = '点击「确定」将会跳转到收银台，支付订单后系统将会清空您当月已使用流量。'
const planPath = id => `/plan/${encodeURIComponent(id)}`
const orderPath = tradeNo => `/order/${encodeURIComponent(tradeNo)}`
const rows = data => Object.values(data ?? {})
const amount = value => Number(value) || 0
const samePlan = (plan, user) => user?.plan_id != null && String(plan.id) === String(user.plan_id)
const unexpired = user => user?.expired_at === null || Number(user?.expired_at) > Date.now() / 1000
const active = user => unexpired(user) && !Number(user?.banned) && Number(user?.transfer_enable) > 0
const enabled = value => value === true || Number(value) === 1
const hasPrice = (plan, period) => plan[period] != null && Number.isFinite(Number(plan[period])) && Number(plan[period]) >= 0

function salePeriods(plan, user, resetOnly = false) {
  const current = samePlan(plan, user)
  const ordinary = current
    ? enabled(plan.renew) && (enabled(plan.show) || active(user))
    : enabled(plan.show) && enabled(plan.sell) && (plan.capacity_limit == null || Number(plan.capacity_limit) > 0)
  return Object.keys(periods).filter(period => hasPrice(plan, period) && (
    period === 'reset_price' ? current && active(user) : ordinary && !resetOnly
  ))
}

function unavailableReason(plan, user) {
  if (samePlan(plan, user) && !enabled(plan.renew)) return '该订阅无法续费'
  if (!samePlan(plan, user) && plan.capacity_limit != null && !(Number(plan.capacity_limit) > 0)) return '已售罄'
  return '暂无可购买的周期'
}

function subscribeHash(listener) {
  window.addEventListener('hashchange', listener)
  return () => window.removeEventListener('hashchange', listener)
}

function useHashQuery() {
  const hash = useSyncExternalStore(subscribeHash, () => window.location.hash, () => '')
  const offset = hash.indexOf('?')
  return new URLSearchParams(offset < 0 ? '' : hash.slice(offset + 1))
}

function useAction() {
  const alive = useRef(true)
  const locked = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])

  async function run(callback, inConfirm = false) {
    if (locked.current || !alive.current) return
    locked.current = true
    setBusy(true)
    setError(null)
    try {
      await callback()
    } catch (failure) {
      if (inConfirm) throw failure
      if (alive.current) setError(failure)
    } finally {
      locked.current = false
      if (alive.current) setBusy(false)
    }
  }
  return {alive, busy, error, run, clear: () => setError(null)}
}

async function refreshAccount({refreshUser, notify, t}) {
  try {
    await refreshUser()
  } catch (error) {
    notify(error.message || t('请求失败'))
  }
}

function Feedback({error}) {
  const {t} = usePortal()
  return error && <p role="alert" className="commerce-error"><AlertIcon />{error.message || t('请求失败')}</p>
}

function Status({value}) {
  const {t} = usePortal()
  return <Label variant={statusColors[value] || 'default'}>{t(statuses[value] || '未知状态')}</Label>
}

function Back({to, label}) {
  const {t} = usePortal()
  return <Button as="a" href={`#${to}`} size="small" leadingVisual={ArrowLeftIcon}>{t(label)}</Button>
}

function PlanContent({content}) {
  const {t} = usePortal()
  if (!content) return null
  let features = content
  if (typeof content === 'string') {
    try { features = JSON.parse(content) } catch { features = null }
  }
  if (Array.isArray(features)) {
    return <ul className="commerce-features">{features.map((item, index) => {
      if (typeof item?.feature !== 'string' && typeof item?.feature !== 'number') return null
      const supported = enabled(item.support)
      const Icon = supported ? CheckIcon : XIcon
      return <li key={index} data-supported={supported}>
        <Icon aria-label={t(supported ? '已支持' : '不支持')} /><span>{item.feature}</span>
      </li>
    })}</ul>
  }
  return <RichText html={marked.parse(String(content), {async: false})} />
}

function PlanQuota({plan}) {
  const {t} = usePortal()
  return plan.transfer_enable != null && <span className="commerce-quota">
    {t('产品流量')} <strong>{bytes(Number(plan.transfer_enable) * 1024 ** 3)}</strong>
  </span>
}

function PlanCard({plan}) {
  const {t, config, user, navigate} = usePortal()
  const options = salePeriods(plan, user)
  const resetOnly = options[0] === 'reset_price'
  const ordinary = hasPrice(plan, 'onetime_price') ? 'onetime_price'
    : Object.keys(periods).find(period => period !== 'reset_price' && hasPrice(plan, period))
  const displayed = resetOnly ? 'reset_price' : ordinary
  const label = resetOnly ? '重置已用流量' : samePlan(plan, user) ? '续费订阅' : '立即订阅'
  const unavailable = unavailableReason(plan, user)
  return <Panel title={plan.name} className="commerce-plan">
    {displayed && <div className="commerce-price">
      <strong>{money(plan[displayed], config)}</strong> <span>/ {t(periods[displayed])}</span>
    </div>}
    <PlanQuota plan={plan} />
    <PlanContent content={plan.content} />
    <div className="commerce-plan-action">
      <Button variant="primary" disabled={!options.length} onClick={() =>
        navigate(planPath(plan.id) + (resetOnly ? '?period=reset_price' : ''))}>
        {t(options.length ? label : unavailable)}
      </Button>
    </div>
  </Panel>
}

export function Plans() {
  const {t} = usePortal()
  const plans = useResource('/user/plan/fetch')
  const [filter, setFilter] = useState(0)
  const visible = rows(plans.data).filter(plan => !filter || (filter === 2) === hasPrice(plan, 'onetime_price'))
  return <div className="commerce-page">
    <PageHeader title={t('购买订阅')} description={t('选择最适合你的计划')} actions={
      <SegmentedControl size="small" aria-label={t('选择订阅')} onChange={setFilter}>
        {planFilters.map((label, index) => <SegmentedControl.Button key={label} selected={filter === index}>
          {t(label)}
        </SegmentedControl.Button>)}
      </SegmentedControl>
    } />
    <ResourceState resource={plans}>
      {visible.length ? <div className="commerce-plans">
        {visible.map(plan => <PlanCard key={plan.id} plan={plan} />)}
      </div> : <Empty title={t('暂无可购买的订阅')} />}
    </ResourceState>
  </div>
}

function BillingRow({label, children, total}) {
  return <div className={total ? 'commerce-row commerce-total' : 'commerce-row'}>
    <dt>{label}</dt><dd>{children}</dd>
  </div>
}

function verifiedDiscount(coupon, price) {
  if (!coupon) return 0
  const value = Number(coupon.type) === 1 ? amount(coupon.value) : Math.floor(price * amount(coupon.value) / 100)
  return Math.max(0, Math.min(price, value))
}

async function cancelOrder(tradeNo, portal) {
  const result = await post('/user/order/cancel', {trade_no: tradeNo})
  if (result !== true) throw new Error(portal.t('请求失败'))
  await refreshAccount(portal)
}

function Purchase({plan, requested, resetOnly}) {
  const portal = usePortal()
  const {t, config, user, navigate, notify} = portal
  const action = useAction()
  const options = salePeriods(plan, user, resetOnly)
  const [choice, setChoice] = useState(requested || '')
  const [code, setCode] = useState('')
  const [coupon, setCoupon] = useState(null)
  const [prompt, setPrompt] = useState(null)
  const period = choice ? options.find(option => option === choice) : options[0]
  const price = period ? amount(plan[period]) : 0
  const discount = verifiedDiscount(coupon, price)
  const locked = action.busy || Boolean(prompt)
  const needsCheck = Boolean(code.trim()) && !coupon

  function choose(next) {
    setChoice(next)
    setCoupon(null)
    action.clear()
  }

  async function verify(event) {
    event.preventDefault()
    if (!period || !code.trim() || locked) return
    await action.run(async () => {
      setCoupon(null)
      const result = await post('/user/coupon/check', {code: code.trim(), plan_id: plan.id, period})
      if (!result || ![1, 2].includes(Number(result.type))) throw new Error(t('请求失败'))
      if (!action.alive.current) return
      setCoupon(result)
      notify(t('优惠券验证成功'))
    })
  }

  async function save() {
    const data = {plan_id: plan.id, period}
    if (coupon) data.coupon_code = coupon.code || code.trim()
    const tradeNo = await post('/user/order/save', data)
    if (!tradeNo) throw new Error(t('请求失败'))
    void refreshAccount(portal)
    if (!action.alive.current) return
    notify(t('订单提交成功，正在跳转支付'))
    navigate(orderPath(tradeNo))
  }

  async function reviewPurchase() {
    if (period === 'reset_price') setPrompt({kind: 'reset'})
    else if (user?.plan_id && !samePlan(plan, user) && unexpired(user)) setPrompt({kind: 'replace'})
    else await save()
  }

  function beginPurchase() {
    if (!user || !period || needsCheck || locked) return
    return action.run(async () => {
      const orders = rows(await get('/user/order/fetch'))
      if (!action.alive.current) return
      const processing = orders.find(order => Number(order.status) === 1)
      if (processing) {
        notify(t('订单系统正在进行处理，请稍等1-3分钟。'))
        navigate(orderPath(processing.trade_no))
        return
      }
      const pending = orders.find(order => Number(order.status) === 0)
      if (pending) setPrompt({kind: 'pending', tradeNo: pending.trade_no})
      else await reviewPurchase()
    })
  }

  function replacePending() {
    return action.run(async () => {
      await cancelOrder(prompt.tradeNo, portal)
      if (!action.alive.current) return
      setPrompt(null)
      await reviewPurchase()
    })
  }

  return <div className="commerce-columns">
    <div className="commerce-stack">
      <Panel title={plan.name}><PlanQuota plan={plan} /><PlanContent content={plan.content} /></Panel>
      <Panel title={t('付款周期')}>
        <div className="commerce-choices" role="radiogroup" aria-label={t('付款周期')}>
          {options.map(option => <label key={option} className="commerce-choice" data-checked={period === option}>
            <Radio name="commerce-period" value={option} checked={period === option} disabled={locked}
              onChange={() => choose(option)} />
            <span>{t(periods[option])}</span><strong>{money(plan[option], config)}</strong>
          </label>)}
        </div>
        {!options.length && <Empty title={t(unavailableReason(plan, user))} action={<Back to="/plan" label="选择其他订阅" />} />}
        {!period && options.length > 0 && <p role="status" className="commerce-hint">{t('所选周期不可购买，请选择其他周期')}</p>}
      </Panel>
    </div>
    <div className="commerce-stack">
      <Panel title={t('有优惠券？')}>
        <form className="commerce-coupon" onSubmit={verify}>
          <TextInput block leadingVisual={TagIcon} aria-label={t('有优惠券？')} value={code}
            disabled={!period || locked} autoComplete="off" onChange={event => {
              setCode(event.target.value)
              setCoupon(null)
              action.clear()
            }} />
          <Button type="submit" disabled={!period || !code.trim() || locked}>{t('验证')}</Button>
        </form>
        {needsCheck && <p className="commerce-hint">{t('请先验证优惠券')}</p>}
      </Panel>
      <Panel title={t('订单总额')}>
        <dl className="commerce-ledger">
          <BillingRow label={plan.name}>{period ? money(price, config) : '—'}</BillingRow>
          {coupon && <BillingRow label={coupon.name || t('折扣')}>−{money(discount, config)}</BillingRow>}
          <BillingRow total label={t('总计')}>{period ? money(price - discount, config) : '—'} <small>{config?.currency}</small></BillingRow>
        </dl>
        {prompt?.kind !== 'pending' && <Feedback error={action.error} />}
        <Button className="commerce-submit" variant="primary" leadingVisual={CreditCardIcon}
          disabled={!user || !period || needsCheck || locked} onClick={beginPurchase}>{t('下单')}</Button>
      </Panel>
    </div>
    {prompt?.kind === 'pending' && <Dialog title={t('注意')} role="alertdialog" width="large"
      onClose={() => { if (!action.busy) setPrompt(null) }} footerButtons={[
        {content: t('返回我的订单'), disabled: action.busy, onClick: () => { setPrompt(null); navigate('/order') }},
        {content: t('确认取消'), buttonType: 'danger', disabled: action.busy, onClick: replacePending},
      ]}>
      <p>{t('你还有未完成的订单，购买前需要先进行取消，确定取消先前的订单吗？')}</p>
      <Link href={`#${orderPath(prompt.tradeNo)}`}>{prompt.tradeNo}</Link>
      <Feedback error={action.error} />
    </Dialog>}
    {(prompt?.kind === 'replace' || prompt?.kind === 'reset') && <Confirm
      title={t(prompt.kind === 'reset' ? '确定重置当前已用流量？' : '注意')}
      description={t(prompt.kind === 'reset' ? resetWarning : '请注意，变更订阅会导致当前订阅被覆盖。')}
      confirmLabel={t('下单')} onConfirm={() => action.run(save, true)} onClose={() => setPrompt(null)} />}
  </div>
}

export function PlanDetail({id}) {
  const {t, user} = usePortal()
  const requested = useHashQuery().get('period')
  const detail = useResource('/user/plan/fetch', {id})
  const resetFallback = requested === 'reset_price' && String(id) === String(user?.plan_id) &&
    active(user) && Boolean(detail.error)
  const subscription = useResource(resetFallback ? '/user/getSubscribe' : null)
  let plan = detail.data
  if (resetFallback) {
    const own = subscription.data?.plan
    const resetPrice = own?.prices?.reset_traffic
    plan = own && String(own.id) === String(id) ? {
      ...own, reset_price: own.reset_price ?? (resetPrice == null ? null : Math.round(Number(resetPrice) * 100)),
    } : null
  }
  return <div className="commerce-page">
    <PageHeader title={t('配置订阅')} actions={<Back to="/plan" label="选择订阅" />} />
    <ResourceState resource={resetFallback ? subscription : detail}>
      {plan ? <Purchase key={`${id}:${requested || ''}`} plan={plan} requested={requested} resetOnly={resetFallback} />
        : <Empty title={t('暂无可购买的订阅')} action={<Back to="/plan" label="选择其他订阅" />} />}
    </ResourceState>
  </div>
}

function CancelConfirm({order, onClose, onSuccess}) {
  const portal = usePortal()
  const {t} = portal
  return <Confirm title={t('关闭订单')} description={t(cancelWarning)} confirmLabel={t('确认取消')}
    danger onClose={onClose} onConfirm={async () => {
      await cancelOrder(order.trade_no, portal)
      portal.notify(t('已取消'))
      onSuccess()
    }} />
}

function OrderFilter({selected, onChange}) {
  const {t} = usePortal()
  const [open, setOpen] = useState(false)
  return <ActionMenu open={open} onOpenChange={setOpen}>
    <ActionMenu.Button size="small" leadingVisual={FilterIcon}>{t('订单状态')} · {t(statuses[selected] || '全部')}</ActionMenu.Button>
    <ActionMenu.Overlay align="end">
      <ActionList selectionVariant="single">
        {['全部', ...statuses].map((label, index) => <ActionList.Item key={label} selected={selected === index - 1}
          onSelect={() => { onChange(index - 1); setOpen(false) }}>{t(label)}</ActionList.Item>)}
      </ActionList>
    </ActionMenu.Overlay>
  </ActionMenu>
}

export function Orders() {
  const {t, config, locale, navigate} = usePortal()
  const orders = useResource('/user/order/fetch')
  const query = useHashQuery()
  const requested = query.get('status')
  const selected = /^[0-4]$/.test(requested ?? '') ? Number(requested) : -1
  const [cancel, setCancel] = useState(null)
  const visible = rows(orders.data).filter(order => selected < 0 || Number(order.status) === selected)
  function filter(status) {
    const next = new URLSearchParams(query)
    if (status < 0) next.delete('status')
    else next.set('status', String(status))
    const search = next.toString()
    navigate(`/order${search ? `?${search}` : ''}`)
  }
  return <div className="commerce-page">
    <PageHeader title={t('我的订单')} actions={<OrderFilter selected={selected} onChange={filter} />} />
    <ResourceState resource={orders}>
      {visible.length ? <div className="commerce-table-wrap"><table className="commerce-table">
        <thead><tr>{['# 订单号', '周期', '订单金额', '订单状态', '创建时间', '操作'].map(key =>
          <th key={key} scope="col">{t(key)}</th>)}</tr></thead>
        <tbody>{visible.map(order => <tr key={order.trade_no}>
          <th scope="row"><Link href={`#${orderPath(order.trade_no)}`}>{order.trade_no}</Link>
            {order.plan?.name && <small>{order.plan.name}</small>}</th>
          <td data-label={t('周期')}>{t(periods[order.period] || order.period || '—')}</td>
          <td data-label={t('订单金额')}>{money(order.total_amount, config)}</td>
          <td data-label={t('订单状态')}><Status value={Number(order.status)} /></td>
          <td data-label={t('创建时间')}>{dateTime(order.created_at, locale)}</td>
          <td><div className="commerce-actions">
            <Button as="a" href={`#${orderPath(order.trade_no)}`} size="small">{t('查看详情')}</Button>
            {Number(order.status) === 0 && <Button size="small" onClick={() => setCancel(order)}>{t('取消')}</Button>}
          </div></td>
        </tr>)}</tbody>
      </table></div> : <Empty title={t('暂无订单')} action={<Button as="a" href="#/plan">{t('购买订阅')}</Button>} />}
    </ResourceState>
    {cancel && <CancelConfirm order={cancel} onClose={() => setCancel(null)} onSuccess={orders.reload} />}
  </div>
}

function useOrderPoll(tradeNo, status, onChange) {
  const latest = useRef(onChange)
  const [error, setError] = useState(null)
  useEffect(() => { latest.current = onChange }, [onChange])
  useEffect(() => {
    if (status !== 0 && status !== 1) return
    const controller = new AbortController()
    let delay = 1500
    let timer
    async function check() {
      try {
        const result = await get('/user/order/check', {trade_no: tradeNo}, controller.signal)
        if (controller.signal.aborted) return
        if (result == null || !Number.isInteger(Number(result))) throw new Error()
        setError(null)
        if (Number(result) !== status) {
          latest.current(Number(result))
          return
        }
        delay = 1500
      } catch (failure) {
        if (controller.signal.aborted) return
        setError(failure)
        delay = Math.min(delay * 2, 15000)
      }
      timer = window.setTimeout(check, delay)
    }
    timer = window.setTimeout(check, delay)
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [tradeNo, status])
  return error
}

function feeFor(total, method) {
  return total > 0 && method
    ? Math.round(total * amount(method.handling_fee_percent) / 100 + amount(method.handling_fee_fixed)) : 0
}

function PaymentIcon({icon}) {
  if (!icon) return null
  return /^(?:https?:|data:image\/|\/|\.)/i.test(icon)
    ? <img className="commerce-method-icon" src={icon} alt="" />
    : <span aria-hidden="true">{icon}</span>
}

function OrderView({order, status, synchronize}) {
  const portal = usePortal()
  const {t, locale, config, notify} = portal
  const action = useAction()
  const [methodId, setMethodId] = useState(null)
  const [qr, setQr] = useState('')
  const [cashier, setCashier] = useState('')
  const [cancel, setCancel] = useState(false)
  const pending = status === 0
  const total = order.total_amount == null ? NaN : Number(order.total_amount)
  const validTotal = Number.isFinite(total) && total >= 0
  const needsMethod = pending && validTotal && total > 0
  const methods = useResource(needsMethod ? '/user/order/getPaymentMethod' : null)
  const choices = rows(methods.data)
  const method = choices.find(item => String(item.id) === String(methodId ?? order.payment_id)) || choices[0]
  const fee = pending ? feeFor(total, method) : amount(order.handling_amount)
  const balance = amount(order.balance_amount)
  const credit = amount(order.surplus_credit ?? order.refund_amount)
  const surplus = amount(order.surplus_amount)
  const discount = amount(order.discount_amount)
  const subtotal = total + balance + discount + surplus - credit
  const pollError = useOrderPoll(order.trade_no, status, synchronize)

  function checkout() {
    if (!pending || !validTotal || (needsMethod && !method) || qr || cancel) return
    return action.run(async () => {
      const data = {trade_no: order.trade_no}
      if (needsMethod) data.method = method.id
      const response = await postEnvelope('/user/order/checkout', data)
      if (!action.alive.current) return
      if (response.type === -1 && response.data === true) {
        notify(t('支付成功'))
        synchronize(1)
        return
      }
      const target = response.data
      if (typeof target !== 'string' || !target.trim()) throw new Error(t('支付响应无效'))
      if (response.type === 0) {
        setQr(target)
        return
      }
      if (response.type === 1) {
        let url
        try { url = new URL(target, window.location.href) } catch { throw new Error(t('支付响应无效')) }
        if (['https:', 'http:', 'alipays:', 'weixin:'].includes(url.protocol)) {
          setCashier(url.href)
          notify(t('正在前往收银台'))
          window.location.assign(url.href)
          return
        }
      }
      throw new Error(t('支付响应无效'))
    })
  }

  return <div className="commerce-columns">
    <div className="commerce-stack">
      <Panel title={t('商品信息')}>
        <dl className="commerce-ledger">
          <BillingRow label={t('产品名称')}>{order.plan?.name || '—'}</BillingRow>
          <BillingRow label={t('类型/周期')}>{t(periods[order.period] || order.period || '—')}</BillingRow>
          {order.plan?.transfer_enable != null && <BillingRow label={t('产品流量')}>{bytes(Number(order.plan.transfer_enable) * 1024 ** 3)}</BillingRow>}
        </dl>
      </Panel>
      <Panel title={t('订单信息')} actions={<Status value={status} />}>
        <dl className="commerce-ledger">
          <BillingRow label={t('订单号')}>{order.trade_no}</BillingRow>
          <BillingRow label={t('创建时间')}>{dateTime(order.created_at, locale)}</BillingRow>
          {order.paid_at > 0 && <BillingRow label={t('支付时间')}>{dateTime(order.paid_at, locale)}</BillingRow>}
          {order.payment?.name && <BillingRow label={t('支付方式')}>{order.payment.name}</BillingRow>}
          {order.surplus_orders?.length > 0 && <BillingRow label={t('折抵订单')}>
            {order.surplus_orders.map(previous => <Link key={previous.trade_no} className="commerce-related"
              href={`#${orderPath(previous.trade_no)}`}>{previous.trade_no}</Link>)}
          </BillingRow>}
        </dl>
        {status === 1 && <p role="status" className="commerce-hint">{t('订单系统正在进行处理，请稍等1-3分钟。')}</p>}
        {status === 3 && <div className="commerce-status-note">
          <span>{t('订单已支付并开通。')}</span>
          <Button as="a" size="small" href="#/knowledge" leadingVisual={BookIcon}>{t('查看教程')}</Button>
        </div>}
        {pending && <Button size="small" disabled={action.busy || Boolean(qr)} onClick={() => setCancel(true)}>{t('关闭订单')}</Button>}
        <Feedback error={pollError} />
      </Panel>
    </div>
    <div className="commerce-stack">
      {needsMethod && <Panel title={t('支付方式')}><ResourceState resource={methods}>
        {choices.length ? <div className="commerce-choices" role="radiogroup" aria-label={t('支付方式')}>
          {choices.map(item => <label key={item.id} className="commerce-choice" data-checked={method?.id === item.id}>
            <Radio name="commerce-method" value={String(item.id)} checked={method?.id === item.id}
              disabled={action.busy || Boolean(qr) || cancel} onChange={() => {
                setMethodId(item.id)
                setCashier('')
                action.clear()
              }} />
            <span>{item.name}</span><PaymentIcon icon={item.icon} />
          </label>)}
        </div> : <Empty title={t('暂无可用的支付方式')} action={<Button size="small" onClick={methods.reload}>{t('重试')}</Button>} />}
      </ResourceState></Panel>}
      <Panel title={t('订单总额')}>
        <dl className="commerce-ledger">
          <BillingRow label={order.plan?.name || t('订单金额')}>{Number.isFinite(subtotal) ? money(subtotal, config) : '—'}</BillingRow>
          {discount > 0 && <BillingRow label={t('优惠金额')}>−{money(discount, config)}</BillingRow>}
          {surplus > 0 && <BillingRow label={t('旧订阅折抵金额')}>−{money(surplus, config)}</BillingRow>}
          {credit > 0 && <BillingRow label={t('退款金额')}>+{money(credit, config)}</BillingRow>}
          {balance > 0 && <BillingRow label={t('余额支付')}>−{money(balance, config)}</BillingRow>}
          {fee > 0 && <BillingRow label={t('支付手续费')}>{money(fee, config)}</BillingRow>}
          <BillingRow total label={t('总计')}>{Number.isFinite(total) ? money(total + fee, config) : '—'} <small>{config?.currency}</small></BillingRow>
        </dl>
        <Feedback error={action.error} />
        {pending && !validTotal && <p role="alert" className="commerce-error">{t('订单金额异常')}</p>}
        {pending && (cashier
          ? <Button as="a" className="commerce-submit" variant="primary" href={cashier} leadingVisual={CreditCardIcon}>{t('立即支付')}</Button>
          : <Button className="commerce-submit" variant="primary" leadingVisual={CreditCardIcon} onClick={checkout}
            disabled={action.busy || Boolean(qr) || cancel || !validTotal || (needsMethod && !method)}>{t('结账')}</Button>)}
      </Panel>
    </div>
    {qr && <Dialog title={t('等待支付中')} width="medium" onClose={() => setQr('')}>
      <QrCode key={qr} value={qr} size={256} className="commerce-qr" title={t('等待支付中')} failure={t('支付响应无效')} />
      <Feedback error={pollError} />
    </Dialog>}
    {cancel && <CancelConfirm order={order} onClose={() => setCancel(false)} onSuccess={() => synchronize(2, false)} />}
  </div>
}

export function OrderDetail({id}) {
  const portal = usePortal()
  const {t} = portal
  const detail = useResource('/user/order/detail', {trade_no: String(id)})
  const order = detail.data
  const [transition, setTransition] = useState(null)
  const status = transition && transition.from === order ? transition.to : Number(order?.status)
  function synchronize(next, refresh = true) {
    setTransition({from: order, to: next})
    detail.reload()
    if (refresh) void refreshAccount(portal)
  }
  return <div className="commerce-page">
    <PageHeader title={t('订单详情')} actions={<Back to="/order" label="返回我的订单" />} />
    <ResourceState resource={detail}>
      {order ? <OrderView key={`${id}:${status}`} order={order} status={status} synchronize={synchronize} />
        : <Empty title={t('暂无订单')} />}
    </ResourceState>
  </div>
}
