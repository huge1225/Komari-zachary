import React from 'react';
import type {
  CurrencyCode,
  ExchangeRateState,
  KomariClient,
  LiveNodeTelemetry,
  NodeCarrierTrio,
} from '../types/komari';
import {
  computeNodeBilling,
  CURRENCY_META,
  formatCurrencyValue,
} from '../utils/billing';
import {
  computeTrafficUsage,
  formatBytesCompactGB,
  formatSpeed,
  formatUptime,
  getFillClass,
  getLatencyColor,
  normalizeRegionCode,
} from '../utils/format';

interface NodeCardProps {
  client: KomariClient;
  live?: LiveNodeTelemetry;
  carriers?: NodeCarrierTrio;
  currency: CurrencyCode;
  fxState: ExchangeRateState;
  onSelect: (uuid: string) => void;
}

export const NodeCard: React.FC<NodeCardProps> = ({
  client,
  live,
  carriers,
  currency,
  fxState,
  onSelect,
}) => {
  const isOnline = Boolean(live?.online);
  const cpuPct = isOnline ? Math.min(100, Math.max(0, live?.cpuUsage ?? 0)) : 0;

  const memTotal = live?.ramTotal || client.mem_total || 0;
  const memUsed = isOnline ? live?.ramUsed ?? 0 : 0;
  const memPct = memTotal > 0 ? Math.min(100, (memUsed / memTotal) * 100) : 0;

  const diskTotal = live?.diskTotal || client.disk_total || 0;
  const diskUsed = isOnline ? live?.diskUsed ?? 0 : 0;
  const diskPct = diskTotal > 0 ? Math.min(100, (diskUsed / diskTotal) * 100) : 0;

  const traffic = computeTrafficUsage(client, live);
  const billing = computeNodeBilling(client, currency, fxState);
  const regionCode = normalizeRegionCode(client.region);

  const osShort = (client.os || 'Linux').split(' ')[0];
  const virtShort = client.virtualization ? client.virtualization.toUpperCase() : 'VM';

  const carrierList = [
    {
      id: 'ct',
      title: '电信',
      color: 'var(--ct-color)',
      metric: carriers?.ct,
    },
    {
      id: 'cu',
      title: '联通',
      color: 'var(--cu-color)',
      metric: carriers?.cu,
    },
    {
      id: 'cm',
      title: '移动',
      color: 'var(--cm-color)',
      metric: carriers?.cm,
    },
  ];

  return (
    <article
      className="glass-panel glass-interactive km-node-card"
      onClick={() => onSelect(client.uuid)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(client.uuid);
        }
      }}
    >
      {/* 1. Card Header: Region + Name + OS/Uptime + Status Pulse */}
      <div className="node-card-header">
        <div className="node-id-group">
          <span className="region-badge mono">{regionCode}</span>
          <div style={{ minWidth: 0 }}>
            <h2 className="node-title" title={client.name}>
              {client.name}
            </h2>
            <div className="node-meta mono">
              {virtShort} · {osShort} ·{' '}
              {isOnline ? `在线 ${formatUptime(live?.uptime ?? 0)}` : '节点离线'}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {billing.remainDays !== null && billing.remainDays <= 7 && !billing.isExpired && (
            <span
              className="mono"
              style={{
                fontSize: 10.5,
                padding: '2px 6px',
                borderRadius: 6,
                background: 'rgba(251, 113, 133, 0.18)',
                color: 'var(--accent-coral)',
                fontWeight: 600,
              }}
            >
              剩 {billing.remainDays} 天
            </span>
          )}
          <span className={`status-dot ${isOnline ? 'online' : 'offline'}`} />
        </div>
      </div>

      {/* 2. Style 1's 2x2 Resource Grid: CPU / Memory / Disk / Traffic */}
      <div className="metric-quad">
        {/* CPU */}
        <div className="metric-well">
          <div className="metric-well-head mono">
            <span className="metric-well-label">CPU · {client.cpu_cores || 1}C</span>
            <span className="metric-well-val">{cpuPct.toFixed(1)}%</span>
          </div>
          <div className="liquid-track">
            <div
              className={`liquid-fill ${getFillClass(cpuPct)}`}
              style={{ width: `${cpuPct}%` }}
            />
          </div>
        </div>

        {/* Memory */}
        <div className="metric-well">
          <div className="metric-well-head mono">
            <span className="metric-well-label">
              内存 · {formatBytesCompactGB(memTotal)}
            </span>
            <span className="metric-well-val">{formatBytesCompactGB(memUsed)}</span>
          </div>
          <div className="liquid-track">
            <div
              className={`liquid-fill ${getFillClass(memPct)}`}
              style={{ width: `${memPct}%` }}
            />
          </div>
        </div>

        {/* Disk */}
        <div className="metric-well">
          <div className="metric-well-head mono">
            <span className="metric-well-label">
              硬盘 · {formatBytesCompactGB(diskTotal)}
            </span>
            <span className="metric-well-val">{formatBytesCompactGB(diskUsed)}</span>
          </div>
          <div className="liquid-track">
            <div
              className={`liquid-fill ${getFillClass(diskPct)}`}
              style={{ width: `${diskPct}%` }}
            />
          </div>
        </div>

        {/* Traffic */}
        <div className="metric-well">
          <div className="metric-well-head mono">
            <span className="metric-well-label">
              流量{' '}
              {traffic.limitBytes > 0 ? `· ${traffic.pct.toFixed(0)}%` : '· 累计'}
            </span>
            <span className="metric-well-val">
              {formatBytesCompactGB(traffic.usedBytes)}
            </span>
          </div>
          <div className="liquid-track">
            <div
              className={`liquid-fill ${getFillClass(
                traffic.limitBytes > 0 ? traffic.pct : 28
              )}`}
              style={{
                width: `${traffic.limitBytes > 0 ? traffic.pct : Math.min(100, 24)}%`,
              }}
            />
          </div>
        </div>
      </div>

      {/* 3. Live Network Throughput Capsule */}
      <div className="throughput-strip mono">
        <span style={{ color: 'var(--text-muted)', fontSize: 11.5 }}>速率</span>
        <span>
          <span style={{ color: 'var(--accent-cyan)', fontWeight: 600 }}>
            ↓ {formatSpeed(isOnline ? live?.netDown ?? 0 : 0)}
          </span>
          <span style={{ opacity: 0.35, margin: '0 8px' }}>|</span>
          <span style={{ color: 'var(--accent-emerald)', fontWeight: 600 }}>
            ↑ {formatSpeed(isOnline ? live?.netUp ?? 0 : 0)}
          </span>
        </span>
      </div>

      {/* 4. Three-Carrier (Telecom / Unicom / Mobile) Latency & Packet Loss Matrix */}
      <div className="carrier-trio mono">
        {carrierList.map((item) => {
          const ms = item.metric?.latestMs ?? null;
          const loss = item.metric?.lossPct ?? null;
          const statusColor = getLatencyColor(ms, loss);
          return (
            <div
              key={item.id}
              className="carrier-cell"
              title={item.metric?.taskName || item.title}
            >
              <div className="carrier-head">
                <span style={{ color: item.color }}>{item.title}</span>
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: statusColor,
                  }}
                />
              </div>
              <div className="carrier-ms" style={{ color: statusColor }}>
                {ms !== null ? (
                  <>
                    {ms}
                    <span style={{ fontSize: 11, fontWeight: 400, opacity: 0.78 }}>
                      ms
                    </span>
                  </>
                ) : (
                  <span style={{ fontSize: 12, opacity: 0.6 }}>--</span>
                )}
              </div>
              <div className="carrier-loss">
                丢包 {loss !== null ? `${loss.toFixed(1)}%` : '--'}
              </div>
            </div>
          );
        })}
      </div>

      {/* 5. Monthly Cost & Remaining Value Footer */}
      <div className="billing-footer mono">
        {billing.hasBilling ? (
          billing.isFree ? (
            <div className="billing-row">
              <span className="cost-pill">免费</span>
              <span className="residual-val">长期</span>
            </div>
          ) : (
            <>
              <div className="billing-row">
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <span className="cost-pill">
                    月费 {formatCurrencyValue(billing.monthlyInTarget, currency)}
                  </span>
                  <span
                    style={{
                      color: 'var(--text-muted)',
                      fontSize: 11,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    ({CURRENCY_META[billing.rawCurrency].symbol}
                    {billing.rawPrice}/{billing.cycleLabel})
                  </span>
                </div>
                <div className="residual-val" style={{ whiteSpace: 'nowrap' }}>
                  {billing.isExpired
                    ? '已到期'
                    : `余值 ${formatCurrencyValue(billing.residualInTarget, currency)}`}
                </div>
              </div>
              <div
                className="liquid-track"
                style={{ height: 3.5, marginTop: 8 }}
                title={
                  billing.remainDays !== null
                    ? `剩余 ${billing.remainDays} 天 · 到期 ${billing.expiredAtText}`
                    : '长期'
                }
              >
                <div
                  style={{
                    width: `${Math.round(billing.remainRatio * 100)}%`,
                    height: '100%',
                    borderRadius: 999,
                    background:
                      billing.remainRatio < 0.15
                        ? 'var(--accent-coral)'
                        : 'var(--accent-emerald)',
                  }}
                />
              </div>
            </>
          )
        ) : (
          <div className="billing-row" style={{ color: 'var(--text-muted)' }}>
            <span>--</span>
            <span>详情 →</span>
          </div>
        )}
      </div>
    </article>
  );
};
