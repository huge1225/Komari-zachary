import React, { memo } from 'react';
import type {
  ComputedBilling,
  CurrencyCode,
  KomariClient,
  LiveNodeTelemetry,
  NodeCarrierTrio,
} from '../types/komari';
import { formatCurrencyValue } from '../utils/billing';
import { formatBytes, formatSpeed, normalizeRegionCode } from '../utils/format';

interface FleetSummaryProps {
  clients: KomariClient[];
  liveMap: Record<string, LiveNodeTelemetry>;
  carrierMap: Record<string, NodeCarrierTrio>;
  billingMap: Record<string, ComputedBilling>;
  currency: CurrencyCode;
  showBilling: boolean;
}

export const FleetSummary: React.FC<FleetSummaryProps> = memo(
  ({ clients, liveMap, carrierMap, billingMap, currency, showBilling }) => {
    const totalCount = clients.length;
    let onlineCount = 0;
    let totalDownBytes = 0;
    let totalUpBytes = 0;
    let cumulativeTraffic = 0;
    let totalMonthly = 0;
    let totalResidual = 0;
    let paidNodesCount = 0;
    let minRemainDays: number | null = null;

    const regions = new Set<string>();
    const ctVals: number[] = [];
    const cuVals: number[] = [];
    const cmVals: number[] = [];

    for (const c of clients) {
      regions.add(normalizeRegionCode(c.region));
      const live = liveMap[c.uuid];
      if (live?.online) {
        onlineCount += 1;
        totalDownBytes += live.netDown;
        totalUpBytes += live.netUp;
        cumulativeTraffic += live.netTotalDown + live.netTotalUp;
      }

      const trio = carrierMap[c.uuid];
      if (trio) {
        if (trio.ct.latestMs !== null) ctVals.push(trio.ct.latestMs);
        if (trio.cu.latestMs !== null) cuVals.push(trio.cu.latestMs);
        if (trio.cm.latestMs !== null) cmVals.push(trio.cm.latestMs);
      }

      const bill = billingMap[c.uuid];
      if (bill && bill.hasBilling && !bill.isFree) {
        paidNodesCount += 1;
        totalMonthly += bill.monthlyInTarget;
        totalResidual += bill.residualInTarget;
        if (bill.remainDays !== null && !bill.isExpired) {
          if (minRemainDays === null || bill.remainDays < minRemainDays) {
            minRemainDays = bill.remainDays;
          }
        }
      }
    }

    const avg = (arr: number[]) =>
      arr.length > 0 ? `${Math.round(arr.reduce((s, v) => s + v, 0) / arr.length)}` : '--';

    return (
      <section className="fleet-grid" aria-label="全局概览">
        <div className="glass-panel summary-card">
          <div className="summary-label">
            <span>在线节点</span>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                backgroundColor: 'var(--accent-emerald)',
              }}
            />
          </div>
          <div className="summary-value mono">
            {onlineCount}{' '}
            <span style={{ opacity: 0.45, fontSize: 15, fontWeight: 500 }}>
              / {totalCount}
            </span>
          </div>
          <div className="summary-sub mono">
            {regions.size} 地区 ·{' '}
            {totalCount > 0 ? Math.round((onlineCount / totalCount) * 100) : 0}%
          </div>
        </div>

        <div className="glass-panel summary-card">
          <div className="summary-label">
            <span>实时带宽</span>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                backgroundColor: 'var(--accent-cyan)',
              }}
            />
          </div>
          <div className="summary-value mono">↓ {formatSpeed(totalDownBytes)}</div>
          <div className="summary-sub mono">
            ↑ {formatSpeed(totalUpBytes)} · 总 {formatBytes(cumulativeTraffic)}
          </div>
        </div>

        <div className="glass-panel summary-card">
          <div className="summary-label">
            <span>三网均延</span>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                backgroundColor: 'var(--ct-color)',
              }}
            />
          </div>
          <div className="summary-value mono">
            {avg(ctVals)} / {avg(cuVals)} / {avg(cmVals)}
            <span style={{ fontSize: 12.5, fontWeight: 500, marginLeft: 3 }}>ms</span>
          </div>
          <div className="summary-sub mono">电信 · 联通 · 移动</div>
        </div>

        {showBilling && (
          <>
            <div className="glass-panel summary-card">
              <div className="summary-label">
                <span>每月费用</span>
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    backgroundColor: 'var(--accent-amber)',
                  }}
                />
              </div>
              <div className="summary-value mono" style={{ color: 'var(--accent-amber)' }}>
                {formatCurrencyValue(totalMonthly, currency)}
              </div>
              <div className="summary-sub mono">{paidNodesCount} 台计费</div>
            </div>

            <div className="glass-panel summary-card">
              <div className="summary-label">
                <span>总剩余价值</span>
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    backgroundColor: 'var(--accent-emerald)',
                  }}
                />
              </div>
              <div className="summary-value mono" style={{ color: 'var(--accent-emerald)' }}>
                {formatCurrencyValue(totalResidual, currency)}
              </div>
              <div className="summary-sub mono">
                {minRemainDays !== null ? `最近到期 ${minRemainDays} 天` : '长期有效'}
              </div>
            </div>
          </>
        )}
      </section>
    );
  }
);
FleetSummary.displayName = 'FleetSummary';
