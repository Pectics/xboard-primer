import React from 'react'
import {Button, Label} from '@primer/react'
import {PackageIcon, SyncIcon} from '@primer/octicons-react'
import {bytes, dateTime, usePortal, useResource} from './core'
import {Empty, PageHeader, Panel, ResourceState} from './ui'
import './nodes.css'

function Refresh({resource}) {
  const {t} = usePortal()
  return (
    <Button size="small" leadingVisual={SyncIcon} disabled={resource.loading || resource.refreshing} onClick={() => resource.reload()}>
      {t('刷新')}
    </Button>
  )
}

export function Nodes() {
  const {t, navigate} = usePortal()
  const servers = useResource('/user/server/fetch')

  return (
    <div className="portal-nodes">
      <PageHeader title={t('节点状态')} description={t('节点五分钟内节点在线情况')} actions={<Refresh resource={servers} />} />
      <Panel>
        <ResourceState resource={servers}>
          {servers.data?.length ? (
            <div className="nodes-scroll" tabIndex={0} role="region" aria-label={t('节点状态')}>
              <table className="nodes-table" aria-label={t('节点状态')} aria-describedby="nodes-rate-note">
                <caption id="nodes-rate-note">{t('使用的流量将乘以倍率进行扣除')}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t('节点名称')}</th>
                    <th scope="col">{t('状态')}</th>
                    <th scope="col">{t('倍率')}</th>
                    <th scope="col">{t('标签')}</th>
                  </tr>
                </thead>
                <tbody>
                  {servers.data.map(node => {
                    const online = Number(node.is_online) === 1
                    const tags = Array.isArray(node.tags) ? node.tags : node.tags ? [node.tags] : []
                    return (
                      <tr key={`${node.type}-${node.id}`}>
                        <th scope="row">
                          {node.name}
                          {node.type && <small className="nodes-protocol">{node.type.toUpperCase()}</small>}
                        </th>
                        <td><Label variant={online ? 'success' : 'danger'}>{online ? t('在线') : t('离线')}</Label></td>
                        <td className="nodes-number">{node.rate} ×</td>
                        <td>
                          <div className="nodes-tags">
                            {tags.length ? tags.map((tag, index) => <Label key={`${index}-${tag}`}>{tag}</Label>) : '—'}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title={t('暂无可用节点')} action={
              <Button leadingVisual={PackageIcon} onClick={() => navigate('/plan')}>{t('购买订阅')}</Button>
            } />
          )}
        </ResourceState>
      </Panel>
    </div>
  )
}

export function Traffic() {
  const {t, locale} = usePortal()
  const traffic = useResource('/user/stat/getTrafficLog')

  return (
    <div className="portal-nodes">
      <PageHeader title={t('流量明细')} description={t('流量明细仅保留近月数据以供查询。')} actions={<Refresh resource={traffic} />} />
      <Panel>
        <ResourceState resource={traffic}>
          {traffic.data?.length ? (
            <div className="nodes-scroll" tabIndex={0} role="region" aria-label={t('流量明细')}>
              <table className="nodes-table nodes-traffic" aria-label={t('流量明细')} aria-describedby="traffic-rate-note">
                <caption id="traffic-rate-note">{t('公式：(实际上行 + 实际下行) x 扣费倍率 = 扣除流量')}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t('记录时间')}</th>
                    <th scope="col">{t('实际上行')}</th>
                    <th scope="col">{t('实际下行')}</th>
                    <th scope="col">{t('扣费倍率')}</th>
                    <th scope="col">{t('总计')}</th>
                  </tr>
                </thead>
                <tbody>
                  {traffic.data.map((record, index) => {
                    const rate = Number(record.server_rate)
                    const upload = Number(record.u)
                    const download = Number(record.d)
                    return (
                      <tr key={`${record.record_at}-${record.server_rate}-${index}`}>
                        <th scope="row">{dateTime(record.record_at, locale)}</th>
                        <td>{rate > 0 ? bytes(upload / rate) : '—'}</td>
                        <td>{rate > 0 ? bytes(download / rate) : '—'}</td>
                        <td>{record.server_rate} ×</td>
                        <td>{bytes(upload + download)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : <Empty title={t('暂无流量记录')} />}
        </ResourceState>
      </Panel>
    </div>
  )
}
