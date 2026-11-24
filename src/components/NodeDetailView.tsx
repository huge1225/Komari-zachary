import React, { useEffect, useMemo, useState } from 'react';
import { fetchNodeLoadHistory, fetchNodePingHistory } from '../services/komariApi';
import type {
  CurrencyCode,
  ExchangeRateState,
  KomariClient,
  KomariLoadRecord,
  KomariPingBasicInfo,
  KomariPingRecord,
  KomariPingTask,
  LiveNodeTelemetry,
  ThemeSettings,
} from '../types/komari';
import {
  computeNodeBilling,
  CURRENCY_META,
  formatCurrencyValue,
} from '../utils/billing';
import { buildAllNodePingSeries } from '../utils/carrierMatch';
import {
  computeTrafficUsage,
  formatBytes,
  formatSpeed,
  formatUptime,
  getFillClass,
  getRegionDisplayName,
  normalizeRegionCode,
} from '../utils/format';
import { MultiTargetPingChart, NetworkLoadChart } from './TelemetryCharts';

interface NodeDetailViewProps {
  client: KomariClient;
  allClients: KomariClient[];
  live?: LiveNodeTelemetry;
  globalPingTasks: KomariPingTask[];
  themeSettings: ThemeSettings;
  currency: CurrencyCode;
  fxState: ExchangeRateState;
  isDemo: boolean;
  defaultHours: number;
  onBack: () => void;
  onSwitchNode: (uuid: string) => void;
}

const TIME_RANGES = [
  { hours: 3, label: '3小时' },
  { hours: 6, label: '6小时' },
  { hours: 12, label: '12小时' },
  { hours: 24, label: '1天' },
  { hours: 72, label: '3天' },
];

export const NodeDetailView: React.FC<NodeDetailViewProps> = ({
  client,
  allClients,
  live,
  globalPingTasks,
  themeSettings,
  currency,
  fxState,
  isDemo,
  defaultHours,
  onBack,
  onSwitchNode,
}) => {
  const [hours, setHours] = useState<number>(defaultHours || 3);
  const [pingRecords, setPingRecords] = useState<KomariPingRecord[]>([]);
  const [pingBasicInfos, setPingBasicInfos] = useState<KomariPingBasicInfo[]>([]);
  const [localPingTasks, setLocalPingTasks] = useState<KomariPingTask[]>([]);
  const [loadRecords, setLoadRecords] = useState<KomariLoadRecord[]>([]);
  const [loadedKey, setLoadedKey] = useState<string>('');

  const requestKey = `${client.uuid}:${hours}`;
  const loading = loadedKey !== requestKey;

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      fetchNodePingHistory(client.uuid, hours, isDemo),
      fetchNodeLoadHistory(client.uuid, hours, isDemo),
    ]).then(([pingRes, loadRes]) => {
      if (cancelled) return;
      setPingRecords(pingRes.records);
      setPingBasicInfos(pingRes.basicInfos);
      setLocalPingTasks(pingRes.tasks);
      setLoadRecords(loadRes);
      setLoadedKey(requestKey);
    });

    return () => {
      cancelled = true;
    };
  }, [client.uuid, hours, isDemo, requestKey]);

  const mergedTasks = useMemo(() => {
    const map = new Map<number, KomariPingTask>();
    for (const t of globalPingTasks) map.set(t.id, t);
    for (const t of localPingTasks) map.set(t.id, t);
    return Array.from(map.values());
  }, [globalPingTasks, localPingTasks]);

  const allPingSeries = useMemo(
    () =>
      buildAllNodePingSeries(
        client.uuid,
        mergedTasks,
        pingRecords,
        pingBasicInfos
      ),
    [client.uuid, mergedTasks, pingRecords, pingBasicInfos]
  );

  const bestProbe = useMemo(() => {
    const valid = allPingSeries.filter((s) => s.latestMs !== null);
    if (valid.length === 0) return null;
    return [...valid].sort((a, b) => (a.latestMs ?? 9999) - (b.latestMs ?? 9999))[0];
  }, [allPingSeries]);

  const avgLossAcrossProbes = useMemo(() => {
    if (allPingSeries.length === 0) return 0;
    return +(
      allPingSeries.reduce((s, item) => s + item.lossPct, 0) / allPingSeries.length
    ).toFixed(1);
  }, [allPingSeries]);

  const isOnline = Boolean(live?.online);
  const memTotal = live?.ramTotal || client.mem_total || 0;
  const memUsed = live?.ramUsed ?? 0;
  const memPct = memTotal > 0 ? Math.min(100, (memUsed / memTotal) * 100) : 0;

  const swapTotal = live?.swapTotal || client.swap_total || 0;
  const swapUsed = live?.swapUsed ?? 0;

  const diskTotal = live?.diskTotal || client.disk_total || 0;
  const diskUsed = live?.diskUsed ?? 0;
  const diskPct = diskTotal > 0 ? Math.min(100, (diskUsed / diskTotal) * 100) : 0;

  const traffic = computeTrafficUsage(client, live);
  const billing = computeNodeBilling(client, currency, fxState);
  const regionCode = normalizeRegionCode(client.region);

  return (
    <section className="km-page-instance" aria-label="节点详情">
      <div className="detail-topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            id="btn-back-dashboard"
            className="glass-icon-btn mono"
            onClick={onBack}
          >
            ← 返回
          </button>

          <select
            id="select-instance-node"
            className="glass-select mono"
            style={{ flex: 1 }}
            value={client.uuid}
            onChange={(e) => onSwitchNode(e.target.value)}
            aria-label="切换节点"
          >
            {allClients.map((c) => (
              <option key={c.uuid} value={c.uuid}>
                [{normalizeRegionCode(c.region)}] {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="glass-segmented mono" role="tablist" aria-label="时间维度">
          {TIME_RANGES.map((r) => (
            <button
              key={r.hours}
              type="button"
              id={`range-tab-${r.hours}h`}
              role="tab"
              aria-selected={hours === r.hours}
              className={`seg-btn ${hours === r.hours ? 'active' : ''}`}
              onClick={() => setHours(r.hours)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Hero Node Banner */}
      <div className="glass-panel detail-hero">
        <div style={{ display: 'flex', alignItems: 'center', gap: 13, minWidth: 0 }}>
          <div
            className="region-badge mono"
            style={{ width: 46, height: 46, fontSize: 14, borderRadius: 13 }}
          >
            {regionCode}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <h1 style={{ margin: 0, fontSize: 19, fontWeight: 700 }}>{client.name}</h1>
              <span
                className="mono"
                style={{
                  fontSize: 11,
                  padding: '2px 8px',
                  borderRadius: 999,
                  background: isOnline
                    ? 'rgba(52, 211, 153, 0.16)'
                    : 'rgba(251, 113, 133, 0.18)',
                  color: isOnline ? 'var(--accent-emerald)' : 'var(--accent-coral)',
                  fontWeight: 600,
                }}
              >
                {isOnline ? `在线 · ${formatUptime(live?.uptime ?? 0)}` : '离线'}
              </span>
            </div>
            <div
              className="mono"
              style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}
            >
              {client.cpu_name || 'CPU'} ({client.cpu_cores || 1}C) ·{' '}
              {formatBytes(memTotal, 0)} · {formatBytes(diskTotal, 0)} ·{' '}
              {client.os || 'Linux'}
            </div>
          </div>
        </div>

        {billing.hasBilling && (
          <div className="hero-billing-boxes mono">
            <div className="hero-stat-box">
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>每月费用</div>
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: 'var(--accent-amber)',
                  marginTop: 3,
                }}
              >
                {billing.isFree
                  ? '免费'
                  : `${formatCurrencyValue(billing.monthlyInTarget, currency)} / 月`}
              </div>
            </div>
            <div className="hero-stat-box">
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>剩余价值</div>
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: 'var(--accent-emerald)',
                  marginTop: 3,
                }}
              >
                {billing.isFree
                  ? '长期'
                  : billing.isExpired
                  ? '已到期'
                  : formatCurrencyValue(billing.residualInTarget, currency)}
                {billing.remainDays !== null && !billing.isExpired && (
                  <span style={{ fontSize: 11, fontWeight: 500, opacity: 0.8, marginLeft: 4 }}>
                    ({billing.remainDays}天)
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Multi-Target Latency & Packet Loss Chart */}
      <MultiTargetPingChart
        seriesList={allPingSeries}
        hours={hours}
        loading={loading}
        defaultCutPeak={themeSettings.default_cut_peak !== false}
      />

      {/* Network Throughput & Hardware Load Chart */}
      <NetworkLoadChart records={loadRecords} hours={hours} loading={loading} />

      {/* Bottom 3-Column Details */}
      <div className="detail-specs-grid">
        <div className="glass-panel spec-card">
          <div className="spec-title">
            <span>系统配置</span>
          </div>

          <div className="mono">
            <div className="kv-row">
              <span className="kv-key">地区</span>
              <span className="kv-val">{getRegionDisplayName(client.region)}</span>
            </div>
            <div className="kv-row">
              <span className="kv-key">CPU</span>
              <span className="kv-val">
                {client.cpu_name || '--'} ({client.cpu_cores || 1}C)
              </span>
            </div>
            <div className="kv-row">
              <span className="kv-key">内存</span>
              <span className="kv-val">
                {formatBytes(memUsed)} / {formatBytes(memTotal)} ({memPct.toFixed(1)}%)
              </span>
            </div>
            <div className="kv-row">
              <span className="kv-key">Swap</span>
              <span className="kv-val">
                {swapTotal > 0
                  ? `${formatBytes(swapUsed)} / ${formatBytes(swapTotal)}`
                  : '无'}
              </span>
            </div>
            <div className="kv-row">
              <span className="kv-key">硬盘</span>
              <span className="kv-val">
                {formatBytes(diskUsed)} / {formatBytes(diskTotal)} ({diskPct.toFixed(1)}%)
              </span>
            </div>
            <div className="kv-row">
              <span className="kv-key">系统</span>
              <span className="kv-val">{client.os || 'Linux'}</span>
            </div>
            <div className="kv-row">
              <span className="kv-key">内核 / 架构</span>
              <span className="kv-val">
                {client.kernel_version || '--'} ·{' '}
                {(client.virtualization || 'KVM').toUpperCase()} ({client.arch || 'x86_64'})
              </span>
            </div>
          </div>
        </div>

        <div className="glass-panel spec-card">
          <div className="spec-title">
            <span>网络状态</span>
          </div>

          <div className="mono">
            <div className="kv-row">
              <span className="kv-key">实时速率</span>
              <span className="kv-val">
                <span style={{ color: 'var(--accent-cyan)' }}>
                  ↓ {formatSpeed(live?.netDown ?? 0)}
                </span>{' '}
                /{' '}
                <span style={{ color: 'var(--accent-emerald)' }}>
                  ↑ {formatSpeed(live?.netUp ?? 0)}
                </span>
              </span>
            </div>
            <div className="kv-row">
              <span className="kv-key">累计流量</span>
              <span className="kv-val">
                ↓ {formatBytes(live?.netTotalDown ?? 0)} / ↑{' '}
                {formatBytes(live?.netTotalUp ?? 0)}
              </span>
            </div>
            <div className="kv-row">
              <span className="kv-key">配额 ({traffic.modeLabel})</span>
              <span className="kv-val">
                {traffic.limitBytes > 0
                  ? `${formatBytes(traffic.usedBytes)} / ${formatBytes(
                      traffic.limitBytes
                    )} (${traffic.pct.toFixed(1)}%)`
                  : `${formatBytes(traffic.usedBytes)} (不限)`}
              </span>
            </div>
            <div className="kv-row">
              <span className="kv-key">连接 / 进程</span>
              <span className="kv-val">
                TCP {live?.tcpConnections ?? 0} · UDP {live?.udpConnections ?? 0} · 进程{' '}
                {live?.processCount ?? 0}
              </span>
            </div>
            <div className="kv-row">
              <span className="kv-key">负载 (1/5/15m)</span>
              <span className="kv-val">
                {live?.load1?.toFixed(2) ?? '0.00'} / {live?.load5?.toFixed(2) ?? '0.00'} /{' '}
                {live?.load15?.toFixed(2) ?? '0.00'}
              </span>
            </div>
            <div className="kv-row">
              <span className="kv-key">延迟检测</span>
              <span className="kv-val">
                {allPingSeries.length} 项 · 均丢包 {avgLossAcrossProbes}%
                {bestProbe ? ` · 最优 ${bestProbe.latestMs}ms` : ''}
              </span>
            </div>
          </div>

          {traffic.limitBytes > 0 && (
            <div className="liquid-track" style={{ marginTop: 12, height: 7 }}>
              <div
                className={`liquid-fill ${getFillClass(traffic.pct)}`}
                style={{ width: `${traffic.pct}%` }}
              />
            </div>
          )}
        </div>

        <div className="glass-panel spec-card">
          <div className="spec-title">
            <span>账单信息</span>
          </div>

          <div className="mono">
            <div className="kv-row">
              <span className="kv-key">账单周期</span>
              <span className="kv-val">
                {billing.hasBilling
                  ? billing.isFree
                    ? '免费'
                    : `${CURRENCY_META[billing.rawCurrency].symbol}${billing.rawPrice} / ${
                        billing.cycleLabel
                      }`
                  : '--'}
              </span>
            </div>
            <div className="kv-row">
              <span className="kv-key">结算币种</span>
              <span className="kv-val">{currency}</span>
            </div>
            <div className="kv-row">
              <span className="kv-key">每月费用</span>
              <span
                className="kv-val"
                style={{ color: 'var(--accent-amber)', fontWeight: 700 }}
              >
                {billing.hasBilling
                  ? formatCurrencyValue(billing.monthlyInTarget, currency)
                  : '--'}
              </span>
            </div>
            <div className="kv-row">
              <span className="kv-key">到期日期</span>
              <span className="kv-val">{billing.expiredAtText}</span>
            </div>
            <div className="kv-row">
              <span className="kv-key">剩余天数</span>
              <span className="kv-val">
                {billing.remainDays !== null
                  ? `${billing.remainDays} / ${billing.cycleDays} 天`
                  : '长期'}
              </span>
            </div>
            <div className="kv-row">
              <span className="kv-key">剩余价值</span>
              <span
                className="kv-val"
                style={{
                  color: 'var(--accent-emerald)',
                  fontWeight: 700,
                  fontSize: 14,
                }}
              >
                {billing.hasBilling
                  ? billing.isExpired
                    ? '已到期'
                    : formatCurrencyValue(billing.residualInTarget, currency)
                  : '--'}
              </span>
            </div>
          </div>

          {billing.hasBilling && !billing.isFree && (
            <div className="liquid-track" style={{ marginTop: 12, height: 7 }}>
              <div
                className="liquid-fill fill-normal"
                style={{ width: `${Math.round(billing.remainRatio * 100)}%` }}
              />
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
