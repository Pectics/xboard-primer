import React, {useEffect, useMemo, useRef, useState} from 'react'
import {Button, Checkbox, FormControl, Label, Link, LinkButton, Select, TextInput} from '@primer/react'
import {ArrowRightIcon, ChevronLeftIcon, ChevronRightIcon, CopyIcon, LinkExternalIcon, PlusIcon} from '@primer/octicons-react'
import {copyText, dateTime, get, money, post, usePortal, useResource} from './core'
import {Confirm, Dialog, Empty, PageHeader, Panel, ResourceState} from './ui'
import './account.css'

function useAccountAction(reportError) {
  const {notify, t} = usePortal()
  const active = useRef(false)
  const [pending, setPending] = useState(false)

  async function run(action) {
    if (active.current) return
    active.current = true
    setPending(true)
    try {
      await action()
    } catch (error) {
      const message = error?.message || t('请求失败')
      if (reportError) reportError(message)
      else notify(message)
    } finally {
      active.current = false
      setPending(false)
    }
  }

  return [pending, run]
}

function CopyButton({value, label}) {
  const {t, notify} = usePortal()
  async function copy() {
    try {
      const copied = await copyText(value)
      notify(copied === false ? t('复制失败') : t('复制成功'))
    } catch {
      notify(t('复制失败'))
    }
  }
  return <Button size="small" leadingVisual={CopyIcon} disabled={!value} onClick={copy}>{label}</Button>
}

function WalletActions({balance, afterTransfer}) {
  const {t, config, site, notify, navigate} = usePortal()
  const [dialog, setDialog] = useState(null)
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('')
  const [account, setAccount] = useState('')
  const [error, setError] = useState('')
  const [pending, run] = useAccountAction(setError)
  const methods = config?.withdraw_methods || []
  const transfer = dialog === 'transfer'

  function open(kind) {
    setAmount('')
    setMethod('')
    setAccount('')
    setError('')
    setDialog(kind)
  }

  function submit(event) {
    event.preventDefault()
    setError('')
    run(async () => {
      if (transfer) {
        const cents = Math.round(Number(amount) * 100)
        if (!/^(?:\d+|\d*\.\d{1,2})$/.test(amount) || !Number.isSafeInteger(cents) || cents < 1 || cents > balance) {
          setError(t('请输入正确的划转金额'))
          return
        }
        await post('/user/transfer', {transfer_amount: cents})
        setDialog(null)
        notify(t('划转成功'))
        await afterTransfer()
      } else {
        if (!methods.includes(method)) return setError(t('提现方式不能为空'))
        if (!account.trim()) return setError(t('提现账号不能为空'))
        await post('/user/ticket/withdraw', {withdraw_method: method, withdraw_account: account.trim()})
        setDialog(null)
        notify(t('创建成功'))
        navigate('/ticket')
      }
    })
  }

  return (
    <div className="account-actions">
      <Button size="small" leadingVisual={ArrowRightIcon} disabled={!(balance > 0)} onClick={() => open('transfer')}>{t('划转')}</Button>
      {config && !Number(config.withdraw_close) && (
        <Button size="small" disabled={!(balance > 0) || !methods.length} onClick={() => open('withdraw')}>{t('推广佣金提现')}</Button>
      )}
      {dialog && (
        <Dialog title={transfer ? t('推广佣金划转至余额') : t('申请提现')} onClose={() => !pending && setDialog(null)}>
          <form className="account-form" onSubmit={submit}>
            <div className="account-amount">
              <span>{t('当前推广佣金余额')}</span>
              <strong>{money(balance, config)}</strong>
            </div>
            {transfer ? (
              <FormControl required disabled={pending}>
                <FormControl.Label>{t('划转金额')}</FormControl.Label>
                <TextInput block type="number" inputMode="decimal" min="0.01" max={(balance / 100).toFixed(2)} step="0.01"
                  placeholder={t('请输入需要划转到余额的金额')} value={amount} onChange={event => setAmount(event.target.value)} />
                <FormControl.Caption>{t('划转后的余额仅用于{title}消费使用', {title: site?.title || site?.app_name || ''})}</FormControl.Caption>
              </FormControl>
            ) : (
              <>
                <FormControl required disabled={pending}>
                  <FormControl.Label>{t('提现方式')}</FormControl.Label>
                  <Select block value={method} onChange={event => setMethod(event.target.value)}>
                    <Select.Option value="" disabled>{t('请选择提现方式')}</Select.Option>
                    {methods.map(name => <Select.Option value={name} key={name}>{name}</Select.Option>)}
                  </Select>
                </FormControl>
                <FormControl required disabled={pending}>
                  <FormControl.Label>{t('提现账号')}</FormControl.Label>
                  <TextInput block value={account} placeholder={t('请输入提现账号')} onChange={event => setAccount(event.target.value)} />
                </FormControl>
              </>
            )}
            {error && <p role="alert" className="account-error">{error}</p>}
            <div className="account-actions account-end">
              <Button type="button" disabled={pending} onClick={() => setDialog(null)}>{t('取消')}</Button>
              <Button type="submit" variant="primary" disabled={pending}>{transfer ? t('划转') : t('申请提现')}</Button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  )
}

function PasswordForm() {
  const {t, notify} = usePortal()
  const [oldPassword, setOldPassword] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [pending, run] = useAccountAction()

  function save(event) {
    event.preventDefault()
    if (password !== confirmation) return notify(t('两次新密码输入不同'))
    run(async () => {
      await post('/user/changePassword', {old_password: oldPassword, new_password: password})
      setOldPassword('')
      setPassword('')
      setConfirmation('')
      notify(t('密码修改成功'))
    })
  }

  return (
    <Panel title={t('修改密码')}>
      <form className="account-form" onSubmit={save}>
        <FormControl required disabled={pending}>
          <FormControl.Label>{t('旧密码')}</FormControl.Label>
          <TextInput block type="password" autoComplete="current-password" value={oldPassword}
            placeholder={t('请输入旧密码')} onChange={event => setOldPassword(event.target.value)} />
        </FormControl>
        <FormControl required disabled={pending}>
          <FormControl.Label>{t('新密码')}</FormControl.Label>
          <TextInput block type="password" minLength={8} autoComplete="new-password" value={password}
            placeholder={t('请输入新密码')} onChange={event => setPassword(event.target.value)} />
        </FormControl>
        <FormControl required disabled={pending}>
          <FormControl.Label>{t('再次输入密码')}</FormControl.Label>
          <TextInput block type="password" minLength={8} autoComplete="new-password" value={confirmation}
            onChange={event => setConfirmation(event.target.value)} />
        </FormControl>
        <div><Button type="submit" variant="primary" disabled={pending}>{t('保存')}</Button></div>
      </form>
    </Panel>
  )
}

function Reminders({account, refresh}) {
  const {t, notify} = usePortal()
  const [pending, run] = useAccountAction()
  const [values, setValues] = useState({remind_expire: account.remind_expire, remind_traffic: account.remind_traffic})
  useEffect(() => {
    setValues({remind_expire: account.remind_expire, remind_traffic: account.remind_traffic})
  }, [account.remind_expire, account.remind_traffic])

  function change(field, checked) {
    run(async () => {
      const previousValue = values[field]
      setValues(previous => ({...previous, [field]: Number(checked)}))
      try {
        await post('/user/update', {[field]: Number(checked)})
      } catch (failure) {
        setValues(previous => ({...previous, [field]: previousValue}))
        throw failure
      }
      notify(t('更新成功'))
      await refresh()
    })
  }

  return (
    <Panel title={t('通知')}>
      <div className="account-form">
        {[['remind_expire', '到期邮件提醒'], ['remind_traffic', '流量邮件提醒']].map(([field, label]) => (
          <FormControl key={field} disabled={pending}>
            <Checkbox checked={Number(values[field]) === 1}
              onChange={event => change(field, event.target.checked)} />
            <FormControl.Label>{t(label)}</FormControl.Label>
          </FormControl>
        ))}
      </div>
    </Panel>
  )
}

function TelegramBinding({onClose}) {
  const {t} = usePortal()
  const bot = useResource('/user/telegram/getBotInfo')
  const subscription = useResource('/user/getSubscribe')
  const command = subscription.data?.subscribe_url ? `/bind ${subscription.data.subscribe_url}` : ''
  const username = bot.data?.username

  return (
    <Dialog title={t('绑定Telegram')} onClose={onClose} footerButtons={[{content: t('我知道了'), onClick: onClose}]}>
      <ResourceState resource={bot}>
        <ResourceState resource={subscription}>
          <ol className="account-steps">
            <li>{t('打开Telegram搜索')}{' '}
              {username && <Link href={`https://t.me/${encodeURIComponent(username)}`} target="_blank" rel="noopener noreferrer">@{username}</Link>}
            </li>
            <li>{t('向机器人发送你的')}<code className="account-command" dir="ltr">{command}</code>
              <CopyButton value={command} label={t('复制命令')} />
            </li>
          </ol>
        </ResourceState>
      </ResourceState>
    </Dialog>
  )
}

function ProfileContent({account, refresh}) {
  const {t, config, notify} = usePortal()
  const [binding, setBinding] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [pending, run] = useAccountAction()

  async function reset() {
    await get('/user/resetSecurity')
    notify(t('重置成功'))
    run(refresh)
  }

  return (
    <>
      <div className="account-columns">
        <div className="account-stack">
          <Panel title={t('我的钱包')}>
            <dl className="account-balances">
              <div><dt>{t('账户余额(仅消费)')}</dt><dd>{money(account.balance, config)}</dd></div>
              <div><dt>{t('当前剩余佣金')}</dt><dd>{money(account.commission_balance, config)}</dd></div>
            </dl>
            <WalletActions balance={account.commission_balance} afterTransfer={refresh} />
          </Panel>
          <Reminders account={account} refresh={refresh} />
          {(Number(config?.is_telegram) === 1 || config?.telegram_discuss_link) && (
            <Panel title="Telegram">
              <div className="account-form">
                {Number(config?.is_telegram) === 1 && (
                  <div className="account-row">
                    <span>{t('绑定Telegram')}</span>
                    {account.telegram_id ? <Label variant="success">{t('已绑定')}</Label> :
                      <Button size="small" onClick={() => setBinding(true)}>{t('立即开始')}</Button>}
                  </div>
                )}
                {config.telegram_discuss_link && (
                  <div className="account-row">
                    <span>{t('Telegram 讨论组')}</span>
                    <LinkButton size="small" trailingVisual={LinkExternalIcon} href={config.telegram_discuss_link}
                      target="_blank" rel="noopener noreferrer">{t('立即加入')}</LinkButton>
                  </div>
                )}
              </div>
            </Panel>
          )}
        </div>
        <div className="account-stack">
          <PasswordForm />
        </div>
      </div>
      <Panel title={t('重置订阅信息')}>
        <p className="account-note">{t('当你的订阅地址或账户发生泄漏被他人滥用时，可以在此重置订阅信息。避免带来不必要的损失。')}</p>
        <Button size="small" variant="danger" disabled={pending} onClick={() => setResetting(true)}>{t('重置')}</Button>
      </Panel>
      {binding && <TelegramBinding onClose={() => { setBinding(false); run(refresh) }} />}
      {resetting && <Confirm title={t('确定要重置订阅信息？')}
        description={t('如果你的订阅地址或信息泄露可以进行此操作。重置后你的UUID及订阅将会变更，需要重新进行订阅。')}
        confirmLabel={t('确认')} danger onConfirm={reset} onClose={() => setResetting(false)} />}
    </>
  )
}

export function Profile() {
  const {t, user, refreshUser} = usePortal()
  const info = useResource(user?.email ? null : '/user/info')
  const account = user?.email ? user : info.data

  async function refresh() {
    await refreshUser()
    if (!user?.email) await info.reload()
  }

  return (
    <div className="portal-account">
      <PageHeader title={t('个人中心')} description={account?.email} />
      {account ? <ProfileContent account={account} refresh={refresh} /> : <ResourceState resource={info} />}
    </div>
  )
}

function CommissionHistory() {
  const {t, locale, config} = usePortal()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const params = useMemo(() => ({current: page, page_size: pageSize}), [page, pageSize])
  const history = useResource('/user/invite/details', params)
  const rows = history.data || []
  const pages = history.total == null ? null : Math.max(1, Math.ceil(history.total / pageSize))

  useEffect(() => {
    if (!history.loading && !history.error && pages !== null && page > pages) setPage(pages)
  }, [history.loading, history.error, page, pages])

  return (
    <Panel title={t('佣金发放记录')}>
      <ResourceState resource={history}>
        {rows.length ? (
          <div className="account-scroll">
            <table className="account-table" aria-label={t('佣金发放记录')}>
              <thead><tr><th scope="col">{t('发放时间')}</th><th scope="col">{t('订单号')}</th><th scope="col">{t('订单金额')}</th><th scope="col">{t('佣金')}</th></tr></thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.id}>
                    <td>{dateTime(row.created_at, locale)}</td><th scope="row"><code>{row.trade_no}</code></th>
                    <td>{money(row.order_amount, config)}</td><td>{money(row.get_amount, config)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty title={t('暂无记录')} />}
        <div className="account-pagination">
          <label><span>{t('每页条数')}</span>
            <Select size="small" value={String(pageSize)} onChange={event => { setPage(1); setPageSize(Number(event.target.value)) }}>
              {[10, 50, 100, 150].map(size => <Select.Option key={size} value={String(size)}>{size}</Select.Option>)}
            </Select>
          </label>
          <div className="account-actions">
            <Button size="small" leadingVisual={ChevronLeftIcon} disabled={page <= 1} onClick={() => setPage(page - 1)}>{t('上一页')}</Button>
            <span aria-live="polite">{page}{pages !== null && ` / ${pages}`}</span>
            <Button size="small" trailingVisual={ChevronRightIcon} disabled={pages === null ? rows.length < pageSize : page >= pages}
              onClick={() => setPage(page + 1)}>{t('下一页')}</Button>
          </div>
        </div>
      </ResourceState>
    </Panel>
  )
}

export function Invite() {
  const {t, locale, config, refreshUser, notify} = usePortal()
  const invite = useResource('/user/invite/fetch')
  const [pending, run] = useAccountAction()
  const {stat = [], codes = []} = invite.data || {}
  const distributed = Number(config?.commission_distribution_enable) === 1

  function generate() {
    run(async () => {
      if (await get('/user/invite/save') === false) throw new Error(t('请求失败'))
      notify(t('已生成'))
      await invite.reload()
    })
  }

  return (
    <div className="portal-account">
      <PageHeader title={t('我的邀请')} />
      <ResourceState resource={invite}>
        <Panel title={t('当前剩余佣金')} actions={
          <WalletActions balance={stat[4]} afterTransfer={() => Promise.all([invite.reload(), refreshUser()])} />
        }>
          <strong className="account-commission">{money(stat[4], config)}</strong>
          <dl className="account-stats">
            <div><dt>{t('已注册用户数')}</dt><dd>{t('{number} 人', {number: stat[0]})}</dd></div>
            <div><dt>{t('佣金比例')}</dt><dd>{stat[3]}%</dd></div>
            {distributed && <div>
              <dt>{t('三级分销比例')}</dt><dd>{[config.commission_distribution_l1, config.commission_distribution_l2, config.commission_distribution_l3]
                .map(rate => `${Math.floor(Number(rate || 0) * stat[3] / 100)}%`).join(' / ')}</dd>
            </div>}
            <div><dt>{t('确认中的佣金')}</dt><dd>{money(stat[2], config)}</dd></div>
            <div><dt>{t('累计获得佣金')}</dt><dd>{money(stat[1], config)}</dd></div>
          </dl>
          <div className="account-rules">
            <p>{t('佣金将会在确认后会到达你的佣金账户。')}</p>
            {distributed && <p>{t('您邀请的用户再次邀请用户将按照订单金额乘以分销等级的比例进行分成。')}</p>}
          </div>
        </Panel>
        <Panel title={t('邀请码管理')} actions={
          <Button size="small" variant="primary" leadingVisual={PlusIcon} disabled={pending} onClick={generate}>{t('生成邀请码')}</Button>
        }>
          {codes.length ? (
            <div className="account-scroll">
              <table className="account-table" aria-label={t('邀请码管理')}>
                <thead><tr><th scope="col">{t('邀请码')}</th><th scope="col">{t('创建时间')}</th><th scope="col">{t('操作')}</th></tr></thead>
                <tbody>
                  {codes.map(code => (
                    <tr key={code.code}>
                      <th scope="row"><code>{code.code}</code></th><td>{dateTime(code.created_at, locale)}</td>
                      <td><CopyButton label={t('复制链接')} value={`${window.location.origin}/#/register?code=${encodeURIComponent(code.code)}`} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <Empty title={t('暂无记录')} />}
        </Panel>
      </ResourceState>
      <CommissionHistory />
    </div>
  )
}
