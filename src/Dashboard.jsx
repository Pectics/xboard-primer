import {useEffect, useState} from 'react'
import {ActionList, ActionMenu, Button, Checkbox, FormControl, Label, ProgressBar, TextInput} from '@primer/react'
import {ArrowUpRightIcon, ChevronRightIcon, CopyIcon} from '@primer/octicons-react'
import {marked} from 'marked'
import {bytes, copyText, dateTime, money, usePortal, useResource} from './core'
import {clientPlatform, importTargets, subscriptionUrl} from './subscription.mjs'
import {Dialog, Empty, PageHeader, Panel, QrCode, ResourceState, RichText} from './ui'

const protocolNames = {
  anytls: 'AnyTLS', vless: 'VLESS', hysteria: 'Hysteria', shadowsocks: 'Shadowsocks', vmess: 'VMess',
  trojan: 'Trojan', tuic: 'TUIC', socks: 'SOCKS', naive: 'NaïveProxy', http: 'HTTP', mieru: 'Mieru',
}

function SubscriptionAccess({subscription, onClose}) {
  const {t, site, notify} = usePortal()
  const nodes = useResource('/user/server/fetch')
  const [types, setTypes] = useState([])
  const [showQr, setShowQr] = useState(false)
  const link = subscriptionUrl(subscription.subscribe_url, types, location.origin)
  const servers = nodes.data || []
  const available = new Set(servers.map(node => node.type))
  const hysteria = servers.filter(node => node.type === 'hysteria')
  const names = {...protocolNames}
  if (hysteria.length && hysteria.every(node => Number(node.version) === 2)) names.hysteria = 'Hysteria 2'
  const targets = importTargets(link, site.title || 'Xboard', clientPlatform(navigator.userAgent))
  function selectType(type, checked) {
    if (type === 'auto') return setTypes([])
    if (type === 'all') return setTypes(checked ? ['all'] : [])
    setTypes(current => checked ? [...current.filter(value => value !== 'all'), type] : current.filter(value => value !== type))
  }
  return <Dialog title={t('一键订阅')} onClose={onClose} width="large">
    <div className="dialog-stack">
      <FormControl>
        <FormControl.Label>{t('订阅地址')}</FormControl.Label>
        <TextInput block readOnly dir="ltr" value={link} onFocus={event => event.target.select()} />
      </FormControl>
      <div className="actions">
        <Button leadingVisual={CopyIcon} onClick={async () => {
          try { await copyText(link); notify(t('复制成功')) } catch { notify(t('复制失败')) }
        }}>{t('复制链接')}</Button>
        <ActionMenu><ActionMenu.Button>{t('导入到')}</ActionMenu.Button>
          <ActionMenu.Overlay><ActionList aria-label={t('导入到')}>
            {targets.map(([name, , href]) => <ActionList.Item key={name} onSelect={() => { window.location.href = href }}>{name}</ActionList.Item>)}
          </ActionList></ActionMenu.Overlay>
        </ActionMenu>
      </div>
      <details className="disclosure"><summary>{t('选择协议')}</summary>
        <ResourceState resource={nodes}><fieldset className="protocols" aria-label={t('选择协议')}>
          {['auto', 'all', ...Object.keys(protocolNames).filter(type => available.has(type))].map(type =>
            <label key={type}><Checkbox checked={type === 'auto' ? !types.length : types.includes(type)} onChange={event => selectType(type, event.target.checked)} />
              {names[type] || t(type === 'all' ? '全部' : '自动')}</label>)}
        </fieldset></ResourceState>
      </details>
      <div><Button variant="link" aria-expanded={showQr} onClick={() => setShowQr(!showQr)}>{t('扫描二维码订阅')}</Button></div>
      {showQr && link && <QrCode key={link} title={t('扫描二维码订阅')} value={link} size={164} failure={t('请求失败')} />}
    </div>
  </Dialog>
}

function SubscriptionPanel() {
  const {t, locale} = usePortal()
  const subscription = useResource('/user/getSubscribe')
  const [access, setAccess] = useState(false)
  const data = subscription.data || {}
  const used = Number(data.u || 0) + Number(data.d || 0)
  const total = Number(data.transfer_enable || 0)
  const rate = total > 0 ? Math.floor(used / total * 100) : 0
  const expired = data.expired_at != null && Number(data.expired_at) * 1000 <= Date.now()
  const resetPrice = data.plan?.prices?.reset_traffic ?? data.plan?.reset_price
  const canRenew = data.plan_id && data.plan?.renew !== false && data.plan?.renew !== 0
  const progressColor = rate >= 100 ? 'danger' : rate >= 70 ? 'attention' : 'accent'
  const accessButton = subscriptionUrl(data.subscribe_url, [], location.origin) &&
    <Button variant={!expired && total ? 'primary' : 'default'} onClick={() => setAccess(true)}>{t('一键订阅')}</Button>
  return <Panel title={t('我的订阅')} className="subscription-panel">
    <ResourceState resource={subscription}>
      {data.plan_id || total > 0 ? <>
        <div className="plan-identity">{data.plan?.name && <h3>{data.plan.name}</h3>}
          <Label variant={expired ? 'danger' : 'success'}>{t(expired ? '已过期' : '有效')}</Label></div>
        <div className="usage-label"><span>{t('流量使用')}</span><strong>{rate}%</strong></div>
        <ProgressBar progress={Math.min(rate, 100)} bg={progressColor} aria-label={t('流量使用')} />
        <p className="usage-caption">{t('已用 {used} / 总计 {total}', {used: bytes(used), total: bytes(total)})}</p>
        <dl className="plan-dates">
          <div><dt>{t('到期时间')}</dt><dd>{data.expired_at == null ? t('长期有效') : dateTime(data.expired_at, locale)}</dd></div>
          {data.next_reset_at > 0 && <div><dt>{t('下次流量重置')}</dt><dd>{dateTime(data.next_reset_at, locale)}</dd></div>}
        </dl>
        <div className="actions plan-actions">
          {accessButton}
          <Button as="a" href={canRenew ? `#/plan/${data.plan_id}` : '#/plan'} variant={expired ? 'primary' : 'default'}>{t(canRenew ? '续费订阅' : '购买订阅')}</Button>
          {rate >= 70 && resetPrice != null && !expired && <Button as="a" variant="link" href={`#/plan/${data.plan_id}?period=reset_price`}>{t('重置已用流量')}</Button>}
        </div>
      </> : <Empty title={t('暂无订阅')} description={t('选择订阅后，可在这里查看用量和导入客户端。')}
        action={<><Button as="a" href="#/plan" variant="primary">{t('购买订阅')}</Button>{accessButton}</>} />}
      {access && <SubscriptionAccess subscription={data} onClose={() => setAccess(false)} />}
    </ResourceState>
  </Panel>
}

function Notices() {
  const {t, locale} = usePortal()
  const [page, setPage] = useState(1)
  const notices = useResource('/user/notice/fetch', {current: page})
  const [opened, setOpened] = useState(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    if (seen || !notices.data || page !== 1) return
    setSeen(true)
    const popup = notices.data.find(notice => notice.tags?.includes('弹窗'))
    if (popup) setOpened(popup)
  }, [notices.data, seen, page])
  return <Panel title={t('公告')} className="notices">
    <ResourceState resource={notices}>
      {notices.data?.length ? <ul className="notice-list">{notices.data.map(notice => <li key={notice.id}>
        <button onClick={() => setOpened(notice)}><span>{notice.title}</span><small>{dateTime(notice.created_at || notice.updated_at, locale)}</small></button>
      </li>)}</ul> : <Empty title={t('暂无公告')} />}
      {(page > 1 || page * 5 < (notices.total || 0)) && <div className="actions pager">
        <Button size="small" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t('上一页')}</Button>
        <Button size="small" disabled={page * 5 >= notices.total} onClick={() => setPage(page + 1)}>{t('下一页')}</Button>
      </div>}
      {opened && <Dialog title={opened.title} width="xlarge" onClose={() => setOpened(null)}>
        <div className="dialog-stack">{opened.img_url && <img className="notice-image" src={opened.img_url} alt="" />}
          <RichText html={marked.parse(opened.content || '')} /></div>
      </Dialog>}
    </ResourceState>
  </Panel>
}

function DashboardAccount() {
  const {t, user, config} = usePortal()
  const stats = useResource('/user/getStat')
  return <Panel title={t('账户概况')} className="account-summary">
    <a className="summary-row balance" href="#/profile"><span>{t('账户余额')}</span><strong>{money(user.balance, config)}</strong></a>
    <ResourceState resource={stats}>
      <a className="summary-row" href="#/order"><span>{t('待支付订单')}</span><strong>{stats.data?.[0] ?? 0}</strong></a>
      <a className="summary-row" href="#/ticket"><span>{t('处理中的工单')}</span><strong>{stats.data?.[1] ?? 0}</strong></a>
    </ResourceState>
  </Panel>
}

export function Dashboard() {
  const {t, config, user} = usePortal()
  return <><PageHeader title={t('总览')} />
    <div className="dashboard-grid">
      <div className="section-stack"><SubscriptionPanel /><Notices /></div>
      <div className="section-stack"><DashboardAccount />
        <Panel title={t('使用帮助')} className="help-links">
          <a href="#/knowledge">{t('使用文档')}<ChevronRightIcon /></a>
          <a href="#/node">{t('查看节点状态')}<ChevronRightIcon /></a>
          <a href="#/ticket">{t('技术支持')}<ChevronRightIcon /></a>
          {!!config.is_telegram && !user.telegram_id && <a href="#/profile">{t('绑定Telegram')}<ChevronRightIcon /></a>}
          {/^https?:\/\//i.test(config.telegram_discuss_link || '') && <a href={config.telegram_discuss_link} target="_blank" rel="noreferrer">{t('Telegram 讨论组')}<ArrowUpRightIcon /></a>}
        </Panel>
      </div>
    </div>
  </>
}
