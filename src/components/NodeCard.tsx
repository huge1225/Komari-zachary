import React, { memo, useMemo } from 'react';
import type {
  CarrierMetric,
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
import { RegionFlag } from './RegionFlag';

function buildSparklinePath(metric?: CarrierMetric): string {
  const pts = metric?.points;
  if (!pts || pts.length < 2) {
    return 'M 0 8 L 100 8';
  }
  // Downsample up to 24 recent points for a crisp, lightweight smooth curve
  const step = Math.max(1, Math.floor(pts.length / 24));
  const sampled: number[] = [];
  for (let i = 0; i < pts.length; i += step) {
    if (pts[i].ms !== null) sampled.push(pts[i].ms as number);
  }
  if (pts[pts.length - 1].ms !== null) {
    sampled.push(pts[pts.length - 1].ms as number);
  }
  if (sampled.length < 2) return 'M 0 8 L 100 8';

  const min = Math.min(...sampled);
  const max = Math.max(...sampled);
  const span = Math.max(4, max - min);

  const coords = sampled.map((v, idx) => {
    const x = (idx / (sampled.length - 1)) * 100;
    const y = 13.5 - ((v - min) / span) * 11;
    return [x, y] as const;
  });

  // Smooth quadratic midpoint spline
  let d = `M ${coords[0][0].toFixed(1)} ${coords[0][1].toFixed(1)}`;
  for (let i = 1; i < coords.length - 1; i++) {
    const xc = (coords[i][0] + coords[i + 1][0]) / 2;
    const yc = (coords[i][1] + coords[i + 1][1]) / 2;
    d += ` Q ${coords[i][0].toFixed(1)} ${coords[i][1].toFixed(1)}, ${xc.toFixed(1)} ${yc.toFixed(1)}`;
  }
  const last = coords[coords.length - 1];
  d += ` L ${last[0].toFixed(1)} ${last[1].toFixed(1)}`;
  return d;
}

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

    const parsedTags = useMemo(() => {
      if (!client.tags) return [];
      return client.tags
        .split(/[;,，]+/)
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 4);
    }, [client.tags]);

    const carrierRows = useMemo(
      () => [
        {
          id: 'ct',
          title: '电信',
          brandColor: 'var(--ct-color)',
          metric: carriers?.ct,
          path: buildSparklinePath(carriers?.ct),
        },
        {
          id: 'cu',
          title: '联通',
          brandColor: 'var(--cu-color)',
          metric: carriers?.cu,
          path: buildSparklinePath(carriers?.cu),
        },
        {
          id: 'cm',
          title: '移动',
          brandColor: 'var(--cm-color)',
          metric: carriers?.cm,
          path: buildSparklinePath(carriers?.cm),
        },
      ],
      [carriers]
    );

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
        {/* 1. Header & Contract Pills */}
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
              <span className="region-tag mono">
                <RegionFlag region={client.region} variant="inline" />
                <span>{regionCode}</span>
              </span>
            </div>
          </div>

          <div className="node-sub-tags mono">
            <span className="sub-pill">
              {isOnline ? `在线 ${formatUptime(live?.uptime ?? 0)}` : '离线'}
            </span>
            <span className="sub-pill">{osShort}</span>
            {billing.hasBilling && !billing.isFree && (
              <span className="sub-pill" style={{ color: 'var(--accent-amber)' }}>
                {formatCurrencyValue(billing.monthlyInTarget, currency)}/月
              </span>
            )}
          </div>
        </div>

        {/* 2. Clean 2x2 Resource Progress Grid */}
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

        {/* 3. Recessed Well: Speed + Cumulative + Residual Value */}
        <div className="net-well-box mono">
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
                      : formatCurrencyValue(billing.residualInTarget, currency)}
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

        {/* 4. 3-Row Stacked Three-Carrier List with Smooth Sparklines */}
        <div className="carrier-rows mono">
          {carrierRows.map((row) => {
            const ms = row.metric?.latestMs ?? null;
            const loss = row.metric?.lossPct ?? null;
            const msTone = getLatencyColor(ms, loss);
            const sparkTone =
              ms === null
                ? 'var(--text-muted)'
                : loss !== null && loss >= 8
                ? 'var(--accent-coral)'
                : row.brandColor;
            const lossTone =
              loss === null
                ? 'var(--text-muted)'
                : loss >= 5
                ? 'var(--accent-coral)'
                : loss > 0
                ? 'var(--accent-amber)'
                : 'var(--accent-emerald)';

            return (
              <div
                key={row.id}
                className="carrier-row"
                title={row.metric?.taskName || row.title}
              >
                <span className="carrier-row-name">
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      backgroundColor: sparkTone,
                      flexShrink: 0,
                    }}
                  />
                  <span>{row.title}</span>
                </span>

                <span className="carrier-row-ms" style={{ color: msTone }}>
                  {ms !== null ? `${ms} ms` : '--'}
                </span>

                <span className="carrier-spark-wrap">
                  <svg
                    viewBox="0 0 100 16"
                    preserveAspectRatio="none"
                    style={{ width: '100%', height: 15, display: 'block', overflow: 'visible' }}
                  >
                    <path
                      d={row.path}
                      fill="none"
                      stroke={sparkTone}
                      strokeWidth={1.25}
                      vectorEffect="non-scaling-stroke"
                      strokeLinecap="round"
                      opacity={ms !== null ? 0.88 : 0.25}
                    />
                  </svg>
                </span>

                <span className="carrier-row-loss">
                  <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>丢包</span>
                  <span style={{ color: lossTone, fontWeight: 600 }}>
                    {loss !== null ? `${loss.toFixed(1)}%` : '--'}
                  </span>
                </span>
              </div>
            );
          })}
        </div>

        {/* 5. Optional Node Tags */}
        {parsedTags.length > 0 && (
          <div className="node-tags-row mono">
            {parsedTags.map((tag) => (
              <span key={tag} className="node-tag-badge">
                {tag}
              </span>
            ))}
          </div>
        )}
      </article>
    );
  }
);
NodeCard.displayName = 'NodeCard';
