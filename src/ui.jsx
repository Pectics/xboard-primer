import {Component, useState} from 'react'
import {Button, Dialog as PrimerDialog, IconButton, Spinner} from '@primer/react'
import {XIcon} from '@primer/octicons-react'
import DOMPurify from 'dompurify'
import {QRCodeSVG} from 'qrcode.react'
import {usePortal} from './core'

DOMPurify.addHook('uponSanitizeAttribute', (node, attribute) => {
  if (node.localName === 'a' && attribute.attrName === 'href' &&
      /^(?:clash|hiddify|sing-box|shadowrocket|quantumult-x|surge|stash|surfboard):\/\//i.test(attribute.attrValue)) {
    attribute.forceKeepAttr = true
  }
})

export function PageHeader({title, description, actions}) {
  return <header className="page-heading">
    <div><h1>{title}</h1>{description && <p>{description}</p>}</div>
    {actions && <div className="actions">{actions}</div>}
  </header>
}

export function Panel({title, actions, children, className = ''}) {
  return <section className={`panel ${className}`}>
    {(title || actions) && <header className="panel-heading">{title && <h2>{title}</h2>}{actions && <div className="actions">{actions}</div>}</header>}
    <div className="panel-body">{children}</div>
  </section>
}

export function Empty({title, description, action}) {
  return <div className="empty-state"><p className="empty-title">{title}</p>
    {description && <p className="muted">{description}</p>}{action && <div className="actions">{action}</div>}
  </div>
}

export function ResourceState({resource, children}) {
  const {t} = usePortal()
  if (resource.loading) return <div className="resource-feedback" role="status"><Spinner size="small" srText={null} />{t('正在加载')}</div>
  if (resource.error) return <div className="resource-feedback" role="alert"><span>{resource.error.message || t('请求失败')}</span>
    <Button size="small" onClick={resource.reload}>{t('重试')}</Button></div>
  return children
}

function DialogHeading({dialogLabelId, dialogDescriptionId, title, subtitle, onClose}) {
  const {t} = usePortal()
  return <PrimerDialog.Header className="dialog-heading">
    <div><PrimerDialog.Title id={dialogLabelId}>{title}</PrimerDialog.Title>
      {subtitle && <PrimerDialog.Subtitle id={dialogDescriptionId}>{subtitle}</PrimerDialog.Subtitle>}
    </div>
    <IconButton icon={XIcon} aria-label={t('关闭')} variant="invisible" onClick={() => onClose('close-button')}
      onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onClose('escape') } }} />
  </PrimerDialog.Header>
}

export function Dialog(props) {
  return <PrimerDialog {...props} renderHeader={DialogHeading} />
}

export class QrCode extends Component {
  state = {failed: false}

  static getDerivedStateFromError() {
    return {failed: true}
  }

  render() {
    const {value, title, failure, size, className = 'qr-code'} = this.props
    if (this.state.failed) return <p role="alert" className="error-text">{failure}</p>
    return <div className={className}><QRCodeSVG value={value} title={title} size={size} marginSize={4} /></div>
  }
}

export function Confirm({title, description, confirmLabel, onConfirm, onClose, danger}) {
  const {t} = usePortal()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  async function confirm() {
    if (pending) return
    setPending(true)
    setError('')
    try {
      await onConfirm()
      onClose()
    } catch (failure) {
      setError(failure.message || t('请求失败'))
    } finally {
      setPending(false)
    }
  }
  return <Dialog title={title} role="alertdialog" width="large" onClose={() => !pending && onClose()}
    footerButtons={[
      {content: t('取消'), buttonType: 'default', onClick: onClose, disabled: pending},
      {content: confirmLabel || t('确定'), buttonType: danger ? 'danger' : 'primary', onClick: confirm, disabled: pending},
    ]}>
    {description && <p>{description}</p>}{error && <p role="alert" className="error-text">{error}</p>}
  </Dialog>
}

export function RichText({html = ''}) {
  const clean = DOMPurify.sanitize(String(html ?? ''), {USE_PROFILES: {html: true}, FORBID_TAGS: ['style', 'form', 'input', 'button'], FORBID_ATTR: ['style']})
  return <div className="rich-text" dangerouslySetInnerHTML={{__html: clean}} />
}
