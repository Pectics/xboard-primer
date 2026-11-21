import React, {useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react'
import {Button, FormControl, Label, Select, Textarea, TextInput} from '@primer/react'
import {ArrowLeftIcon, BookIcon, ChevronRightIcon, CommentDiscussionIcon, PlusIcon, SearchIcon} from '@primer/octicons-react'
import {marked} from 'marked'
import {copyText, dateTime, post, usePortal, useResource} from './core'
import {Confirm, Dialog, Empty, PageHeader, Panel, ResourceState, RichText} from './ui'
import './support.css'

const levels = ['低', '中', '高']

function TicketLevel({ticket}) {
  const {t} = usePortal()
  const level = Number(ticket.level)
  return <Label variant={['secondary', 'accent', 'attention'][level]}>{levels[level] ? t(levels[level]) : '—'}</Label>
}

function TicketStatus({ticket}) {
  const {t} = usePortal()
  if (Number(ticket.status) === 1) return <Label>{t('已关闭')}</Label>
  return Number(ticket.reply_status) === 1
    ? <Label variant="success">{t('已回复')}</Label>
    : <Label variant="attention">{t('待回复')}</Label>
}

function CloseTicket({ticket, onClose, onClosed}) {
  const {t, notify} = usePortal()
  async function close() {
    await post('/user/ticket/close', {id: ticket.id})
    notify(t('关闭成功'))
    onClosed()
  }
  return <Confirm danger title={t('关闭工单')} description={t('关闭后将无法继续回复「{subject}」。', {subject: ticket.subject})}
    confirmLabel={t('关闭工单')} onConfirm={close} onClose={onClose} />
}

function NewTicket({onClose, onCreated}) {
  const {t, notify} = usePortal()
  const [subject, setSubject] = useState('')
  const [level, setLevel] = useState('')
  const [message, setMessage] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const inFlight = useRef(false)

  async function save(event) {
    event.preventDefault()
    if (inFlight.current) return
    if (!subject.trim()) return setError(t('请输入工单主题'))
    if (!level) return setError(t('请选择工单等级'))
    if (!message.trim()) return setError(t('请描述你遇到的问题'))
    inFlight.current = true
    setPending(true)
    setError('')
    try {
      await post('/user/ticket/save', {subject: subject.trim(), level: Number(level), message: message.trim()})
      notify(t('创建成功'))
      onCreated()
      onClose()
    } catch (failure) {
      setError(failure.message || t('请求失败'))
    } finally {
      inFlight.current = false
      setPending(false)
    }
  }

  return (
    <Dialog title={t('新的工单')} width="large" onClose={() => !pending && onClose()}>
      <form className="support-form" onSubmit={save}>
        <FormControl required disabled={pending}>
          <FormControl.Label>{t('主题')}</FormControl.Label>
          <TextInput block value={subject} placeholder={t('请输入工单主题')} onChange={event => setSubject(event.target.value)} />
        </FormControl>
        <FormControl required disabled={pending}>
          <FormControl.Label>{t('工单级别')}</FormControl.Label>
          <Select block value={level} onChange={event => setLevel(event.target.value)}>
            <Select.Option value="" disabled>{t('请选择工单等级')}</Select.Option>
            {levels.map((name, index) => <Select.Option value={String(index)} key={name}>{t(name)}</Select.Option>)}
          </Select>
        </FormControl>
        <FormControl required disabled={pending}>
          <FormControl.Label>{t('消息')}</FormControl.Label>
          <Textarea block resize="vertical" rows={5} value={message} placeholder={t('请描述你遇到的问题')}
            onChange={event => setMessage(event.target.value)} />
        </FormControl>
        {error && <p role="alert" className="support-error">{error}</p>}
        <div className="support-actions support-end">
          <Button type="button" disabled={pending} onClick={onClose}>{t('取消')}</Button>
          <Button type="submit" variant="primary" disabled={pending}>{t('确认')}</Button>
        </div>
      </form>
    </Dialog>
  )
}

export function Tickets() {
  const {t, locale, navigate} = usePortal()
  const tickets = useResource('/user/ticket/fetch')
  const [creating, setCreating] = useState(false)
  const [closing, setClosing] = useState(null)

  return (
    <div className="portal-support">
      <PageHeader title={t('我的工单')} actions={
        <Button variant="primary" leadingVisual={PlusIcon} onClick={() => setCreating(true)}>{t('新的工单')}</Button>
      } />
      <Panel title={t('工单历史')}>
        <ResourceState resource={tickets}>
          {tickets.data?.length ? (
            <div className="support-scroll">
              <table className="support-table" aria-label={t('工单历史')}>
                <thead><tr>
                  <th scope="col">{t('主题')}</th><th scope="col">{t('工单级别')}</th><th scope="col">{t('工单状态')}</th>
                  <th scope="col">{t('创建时间')}</th><th scope="col">{t('最后回复时间')}</th><th scope="col">{t('操作')}</th>
                </tr></thead>
                <tbody>
                  {tickets.data.map(ticket => (
                    <tr key={ticket.id}>
                      <th scope="row">{ticket.subject}</th>
                      <td><TicketLevel ticket={ticket} /></td><td><TicketStatus ticket={ticket} /></td>
                      <td>{dateTime(ticket.created_at, locale)}</td><td>{dateTime(ticket.updated_at, locale)}</td>
                      <td><div className="support-actions">
                        <Button size="small" onClick={() => navigate(`/ticket/${ticket.id}`)}>{t('查看')}</Button>
                        <Button size="small" variant="invisible" disabled={Number(ticket.status) === 1} onClick={() => setClosing(ticket)}>{t('关闭工单')}</Button>
                      </div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <Empty title={t('暂无工单')} />}
        </ResourceState>
      </Panel>
      {creating && <NewTicket onClose={() => setCreating(false)} onCreated={tickets.reload} />}
      {closing && <CloseTicket ticket={closing} onClose={() => setClosing(null)} onClosed={tickets.reload} />}
    </div>
  )
}

function TicketThread({id}) {
  const {t, locale, navigate, notify} = usePortal()
  const valid = /^[1-9]\d*$/.test(String(id))
  const thread = useResource(valid ? '/user/ticket/fetch' : null, {id})
  const ticket = thread.data
  const isOpen = ticket && Number(ticket.status) === 0
  const [draft, setDraft] = useState('')
  const [closing, setClosing] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const inFlight = useRef(false)
  const conversation = useRef(null)
  const followReplies = useRef(true)
  const messages = ticket?.message || []
  const lastMessageId = messages[messages.length - 1]?.id

  useEffect(() => {
    if (!isOpen || thread.refreshing || thread.error || closing || sending) return
    const timer = window.setInterval(() => { if (!document.hidden) thread.reload() }, 2000)
    return () => window.clearInterval(timer)
  }, [isOpen, thread.refreshing, thread.error, thread.reload, closing, sending])

  useLayoutEffect(() => {
    if (followReplies.current && conversation.current) conversation.current.scrollTop = conversation.current.scrollHeight
  }, [lastMessageId, messages.length])

  async function reply(event) {
    event.preventDefault()
    if (inFlight.current || !isOpen || !draft.trim()) return
    inFlight.current = true
    setSending(true)
    setError('')
    try {
      await post('/user/ticket/reply', {id: ticket.id, message: draft.trim()})
      setDraft('')
      followReplies.current = true
      notify(t('回复成功'))
      thread.reload()
    } catch (failure) {
      setError(failure.message || t('请求失败'))
      thread.reload()
    } finally {
      inFlight.current = false
      setSending(false)
    }
  }

  return (
    <div className="portal-support">
      <PageHeader title={t('工单详情')} actions={
        <Button size="small" leadingVisual={ArrowLeftIcon} onClick={() => navigate('/ticket')}>{t('我的工单')}</Button>
      } />
      {!valid ? <Empty title={t('暂无工单')} /> : (
        <ResourceState resource={thread}>
          {ticket && (
            <Panel title={ticket.subject} actions={<div className="support-actions">
              <TicketLevel ticket={ticket} /><TicketStatus ticket={ticket} />
              {isOpen && <Button size="small" disabled={sending} onClick={() => setClosing(true)}>{t('关闭工单')}</Button>}
            </div>}>
              <ol className="support-thread" ref={conversation} aria-label={t('消息')} onScroll={event => {
                const list = event.currentTarget
                followReplies.current = list.scrollHeight - list.clientHeight - list.scrollTop < 40
              }}>
                {messages.map(message => {
                  const own = Number(message.is_me) === 1
                  return (
                    <li key={message.id} className={own ? 'support-own' : undefined}>
                      <div className="support-byline"><strong>{own ? t('用户') : t('技术支持')}</strong><span>{dateTime(message.created_at, locale)}</span></div>
                      <p>{message.message}</p>
                    </li>
                  )
                })}
              </ol>
              {isOpen && (
                <form className="support-form support-reply" onSubmit={reply}>
                  <FormControl disabled={sending} required>
                    <FormControl.Label>{t('回复')}</FormControl.Label>
                    <Textarea block rows={3} resize="vertical" value={draft} placeholder={t('输入内容回复工单...')}
                      onChange={event => setDraft(event.target.value)} onKeyDown={event => {
                        if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) {
                          event.preventDefault()
                          event.currentTarget.form.requestSubmit()
                        }
                      }} />
                  </FormControl>
                  {error && <p role="alert" className="support-error">{error}</p>}
                  <div className="support-actions support-end">
                    <Button type="submit" variant="primary" leadingVisual={CommentDiscussionIcon} disabled={sending || !draft.trim()}>{t('回复')}</Button>
                  </div>
                </form>
              )}
            </Panel>
          )}
        </ResourceState>
      )}
      {closing && isOpen && <CloseTicket ticket={ticket} onClose={() => setClosing(false)} onClosed={thread.reload} />}
    </div>
  )
}

export function TicketDetail({id}) {
  return <TicketThread key={id} id={id} />
}

function articleMarkup(body) {
  const template = document.createElement('template')
  template.innerHTML = marked.parse(body || '', {async: false, gfm: true})
  const actions = new Map()
  for (const element of template.content.querySelectorAll('[onclick], a[href]')) {
    const href = element.getAttribute('href') || ''
    const handler = element.getAttribute('onclick') || /^javascript:\s*(.*)$/is.exec(href)?.[1] || ''
    const call = handler.trim().replace(/^return\s+/, '').replace(/;\s*$/, '').trim()
    const jump = /^(?:window\.)?jump\(\s*(['"]?)([1-9]\d*)\1\s*\)$/.exec(call)
    const copy = /^(?:window\.)?copy\(\s*(?:'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)")\s*\)$/.exec(call)
    if (!jump && !copy) continue
    const key = String(actions.size)
    actions.set(key, jump ? {id: jump[2]} : {text: (copy[1] ?? copy[2]).replace(/\\(['"\\])/g, '$1')})
    const link = document.createElement('a')
    link.href = `#knowledge-action-${key}`
    link.dataset.knowledgeAction = key
    if (copy) link.setAttribute('role', 'button')
    link.append(...element.childNodes)
    element.replaceWith(link)
  }
  return {html: template.innerHTML, actions}
}

function ArticleDialog({selection, onOpen, onClose}) {
  const {t, locale, notify} = usePortal()
  const article = useResource('/user/knowledge/fetch', {id: selection.id, language: locale})
  const {html, actions} = useMemo(() => articleMarkup(article.data?.body), [article.data?.body])

  async function activate(event) {
    const link = event.target.closest('a[data-knowledge-action]')
    const action = link && actions.get(link.dataset.knowledgeAction)
    if (!action) return
    event.preventDefault()
    if (action.id) {
      onOpen({id: action.id})
    } else {
      try {
        const copied = await copyText(action.text)
        notify(copied === false ? t('复制失败') : t('复制成功'))
      } catch {
        notify(t('复制失败'))
      }
    }
  }

  return (
    <Dialog title={article.data?.title || selection.title || t('使用文档')} width="xlarge" onClose={onClose}
      footerButtons={[{content: t('关闭'), onClick: onClose}]}>
      <ResourceState resource={article}>
        <div className="support-article" onClick={activate} onKeyDown={event => {
          if (event.key === ' ' && event.target.matches('a[role="button"][data-knowledge-action]')) {
            event.preventDefault()
            event.target.click()
          }
        }}>
          <RichText html={html} />
        </div>
      </ResourceState>
    </Dialog>
  )
}

function KnowledgeList({locale}) {
  const {t} = usePortal()
  const [draft, setDraft] = useState('')
  const [keyword, setKeyword] = useState('')
  const [article, setArticle] = useState(null)
  const results = useResource('/user/knowledge/fetch', {language: locale, keyword})
  const groups = Object.entries(results.data || {}).filter(([, articles]) => articles.length)

  function search(event) {
    event.preventDefault()
    if (keyword === draft.trim()) results.reload()
    else setKeyword(draft.trim())
  }

  return (
    <div className="portal-support">
      <PageHeader title={t('使用文档')} />
      <form role="search" className="support-search" onSubmit={search}>
        <TextInput block type="search" leadingVisual={SearchIcon} aria-label={t('搜索文档')} maxLength={255}
          value={draft} placeholder={t('搜索文档')} onChange={event => setDraft(event.target.value)} />
        <Button type="submit">{t('搜索')}</Button>
      </form>
      <ResourceState resource={results}>
        {groups.length ? groups.map(([category, articles]) => (
          <Panel title={category} key={category}>
            <ul className="support-articles">
              {articles.map(item => (
                <li key={item.id}>
                  <Button block variant="invisible" leadingVisual={BookIcon} trailingVisual={ChevronRightIcon}
                    onClick={() => setArticle({id: item.id, title: item.title})}>
                    <span className="support-article-title">{item.title}</span>
                    <span className="support-updated">{t('最后更新: {date}', {date: dateTime(item.updated_at, locale)})}</span>
                  </Button>
                </li>
              ))}
            </ul>
          </Panel>
        )) : <Panel><Empty title={t('未找到文档')} /></Panel>}
      </ResourceState>
      {article && <ArticleDialog key={article.id} selection={article} onOpen={setArticle} onClose={() => setArticle(null)} />}
    </div>
  )
}

export function Knowledge() {
  const {locale} = usePortal()
  return <KnowledgeList key={locale} locale={locale} />
}
