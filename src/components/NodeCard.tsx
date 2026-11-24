import React, { memo } from 'react';
import type {
  ComputedBilling,
  CurrencyCode,
  KomariClient,
  LiveNodeTelemetry,
  NodeCarrierTrio,
} from '../types/komari';
import { CURRENCY_META, formatCurrencyValue } from '../utils/billing';
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
  billing: ComputedBilling;
  currency: CurrencyCode;
  onSelect: (uuid: string) => void;
}

export const NodeCard: React.FC<NodeCardProps> = memo(
  ({ client, live, carriers, billing, currency, onSelect }) => {
    const isOnline = Boolean(live?.online);
    const cpuPct = isOnline ? Math.min(100, Math.max(0, live?.cpuUsage ?? 0)) : 0;

    const memTotal = live?.ramTotal || client.mem_total || 0;
    const memUsed = isOnline ? live?.ramUsed ?? 0 : 0;
    const memPct = memTotal > 0 ? Math.min(100, (memUsed / memTotal) * 100) : 0;

    const diskTotal = live?.diskTotal || client.disk_total || 0;
    const diskUsed = isOnline ? live?.diskUsed ?? 0 : 0;
    const diskPct = diskTotal > 0 ? Math.min(100, (diskUsed / diskTotal) * 100) : 0;

    const traffic = computeTrafficUsage(client, live);
    const regionCode = normalizeRegionCode(client.region);

    const osShort = (client.os || 'Linux').split(' ')[0];

    const carrierList = [
      { id: 'ct', title: '电信', color: 'var(--ct-color)', metric: carriers?.ct },
      { id: 'cu', title: '联通', color: 'var(--cu-color)', metric: carriers?.cu },
      { id: 'cm', title: '移动', color: 'var(--cm-color)', metric: carriers?.cm },
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
        {/* 1. Minimalist Header */}
        <div>
          <div className="node-card-header">
            <div className="node-id-group">
              <span className={`status-dot ${isOnline ? 'online' : 'offline'}`} />
              <h2 className="node-title" title={client.name}>
                {client.name}
              </h2>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              {billing.remainDays !== null && billing.remainDays <= 7 && !billing.isExpired && (
                <span
                  className="mono"
                  style={{
                    fontSize: 10.5,
                    padding: '1px 6px',
                    borderRadius: 5,
                    backgroundColor: 'rgba(244, 63, 94, 0.15)',
                    color: 'var(--accent-coral)',
                    fontWeight: 600,
                  }}
                >
                  剩 {billing.remainDays} 天
                </span>
              )}
              <span className="region-tag mono">{regionCode}</span>
            </div>
          </div>

          <div className="node-sub-tags mono">
            <span className="sub-pill">
              {isOnline ? `在线 ${formatUptime(live?.uptime ?? 0)}` : '离线'}
            </span>
            <span className="sub-pill">{osShort}</span>
            {billing.hasBilling && !billing.isFree && (
              <span className="sub-pill" style={{ color: 'var(--accent-amber)' }}>
                月费 {formatCurrencyValue(billing.monthlyInTarget, currency)}
              </span>
            )}
          </div>
        </div>

        {/* 2. Clean Borderless 2x2 Progress Grid */}
        <div className="metric-quad mono">
          <div className="metric-item">
            <div className="metric-item-head">
              <span className="metric-item-label">CPU</span>
              <span className="metric-item-pct">{cpuPct.toFixed(1)}%</span>
            </div>
            <div className="liquid-track">
              <div
                className={`liquid-fill ${getFillClass(cpuPct)}`}
                style={{ width: `${cpuPct}%` }}
              />
            </div>
            <div className="metric-item-sub">
              {client.cpu_cores || 1}C · Load {live?.load1?.toFixed(2) ?? '0.00'}
            </div>
          </div>

          <div className="metric-item">
            <div className="metric-item-head">
              <span className="metric-item-label">内存</span>
              <span className="metric-item-pct">{memPct.toFixed(1)}%</span>
            </div>
            <div className="liquid-track">
              <div
                className={`liquid-fill ${getFillClass(memPct)}`}
                style={{ width: `${memPct}%` }}
              />
            </div>
            <div className="metric-item-sub">
              {formatBytesCompactGB(memUsed)} / {formatBytesCompactGB(memTotal)}
            </div>
          </div>

          <div className="metric-item">
            <div className="metric-item-head">
              <span className="metric-item-label">硬盘</span>
              <span className="metric-item-pct">{diskPct.toFixed(1)}%</span>
            </div>
            <div className="liquid-track">
              <div
                className={`liquid-fill ${getFillClass(diskPct)}`}
                style={{ width: `${diskPct}%` }}
              />
            </div>
            <div className="metric-item-sub">
              {formatBytesCompactGB(diskUsed)} / {formatBytesCompactGB(diskTotal)}
            </div>
          </div>

          <div className="metric-item">
            <div className="metric-item-head">
              <span className="metric-item-label">流量</span>
              <span className="metric-item-pct">
                {traffic.limitBytes > 0 ? `${traffic.pct.toFixed(1)}%` : '∞'}
              </span>
            </div>
            <div className="liquid-track">
              <div
                className={`liquid-fill ${getFillClass(
                  traffic.limitBytes > 0 ? traffic.pct : 18
                )}`}
                style={{
                  width: `${traffic.limitBytes > 0 ? traffic.pct : 18}%`,
                }}
              />
            </div>
            <div className="metric-item-sub">
              {traffic.limitBytes > 0
                ? `${formatBytesCompactGB(traffic.usedBytes)} / ${formatBytesCompactGB(
                    traffic.limitBytes
                  )}`
                : `${formatBytesCompactGB(traffic.usedBytes)} / ∞`}
            </div>
          </div>
        </div>

        {/* 3. Speed, Cumulative Traffic & Residual Value Strip */}
        <div className="net-bill-row mono">
          <div className="net-bill-col">
            <span style={{ color: 'var(--accent-emerald)' }}>
              ↑ {formatSpeed(isOnline ? live?.netUp ?? 0 : 0)}
            </span>
            <span style={{ color: 'var(--accent-cyan)' }}>
              ↓ {formatSpeed(isOnline ? live?.netDown ?? 0 : 0)}
            </span>
          </div>

          <div className="net-bill-col" style={{ color: 'var(--text-muted)' }}>
            <span>↑ {formatBytesCompactGB(live?.netTotalUp ?? 0)}</span>
            <span>↓ {formatBytesCompactGB(live?.netTotalDown ?? 0)}</span>
          </div>

          <div className="net-bill-col" style={{ textAlign: 'right' }}>
            {billing.hasBilling ? (
              billing.isFree ? (
                <>
                  <span style={{ color: 'var(--text-muted)' }}>免费</span>
                  <span style={{ color: 'var(--accent-emerald)', fontWeight: 600 }}>长期</span>
                </>
              ) : (
                <>
                  <span style={{ color: 'var(--text-muted)' }}>
                    {billing.remainDays !== null
                      ? `剩 ${billing.remainDays} 天`
                      : `${CURRENCY_META[billing.rawCurrency].symbol}${billing.rawPrice}/${
                          billing.cycleLabel
                        }`}
                  </span>
                  <span style={{ color: 'var(--accent-emerald)', fontWeight: 600 }}>
                    {billing.isExpired
                      ? '已到期'
                      : `余 ${formatCurrencyValue(billing.residualInTarget, currency)}`}
                  </span>
                </>
              )
            ) : (
              <>
                <span style={{ color: 'var(--text-muted)' }}>账单</span>
                <span style={{ color: 'var(--text-muted)' }}>--</span>
              </>
            )}
          </div>
        </div>

        {/* 4. Three-Carrier Latency & Packet Loss Trio */}
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
                  <span>{item.title}</span>
                  <span
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: '50%',
                      backgroundColor: statusColor,
                    }}
                  />
                </div>
                <div className="carrier-ms" style={{ color: statusColor }}>
                  {ms !== null ? (
                    <>
                      {ms}
                      <span style={{ fontSize: 10.5, fontWeight: 400, opacity: 0.75 }}>ms</span>
                    </>
                  ) : (
                    <span style={{ fontSize: 12, opacity: 0.5 }}>--</span>
                  )}
                </div>
                <div className="carrier-loss">
                  丢包 {loss !== null ? `${loss.toFixed(1)}%` : '--'}
                </div>
              </div>
            );
          })}
        </div>
      </article>
    );
  }
);
NodeCard.displayName = 'NodeCard';
