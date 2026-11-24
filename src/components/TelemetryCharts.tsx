import React, { useMemo, useState } from 'react';
import type { KomariLoadRecord, PingTaskSeries } from '../types/komari';
import { bytesPerSecToMbps, getLatencyColor } from '../utils/format';

function formatAxisTime(ts: number, hours: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  if (hours > 24) {
    return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`;
  }
  return `${hh}:${mm}`;
}

interface MultiTargetPingChartProps {
  seriesList: PingTaskSeries[];
  hours: number;
  loading: boolean;
  defaultCutPeak: boolean;
}

export const MultiTargetPingChart: React.FC<MultiTargetPingChartProps> = ({
  seriesList,
  hours,
  loading,
  defaultCutPeak,
}) => {
  const [cutPeak, setCutPeak] = useState<boolean>(defaultCutPeak);
  const [hiddenIds, setHiddenIds] = useState<Set<number>>(() => new Set());
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const activeSeries = useMemo(
    () => seriesList.filter((s) => !hiddenIds.has(s.taskId)),
    [seriesList, hiddenIds]
  );

  // Align all tasks onto a unified sample timeline
  const timelineCount = useMemo(
    () => seriesList.reduce((m, s) => Math.max(m, s.points.length), 0),
    [seriesList]
  );

  const sampleAt = (s: PingTaskSeries, idx: number) => {
    if (s.points.length === 0 || timelineCount === 0) return null;
    const mapped = Math.min(
      s.points.length - 1,
      Math.round((idx / Math.max(1, timelineCount - 1)) * (s.points.length - 1))
    );
    return s.points[mapped];
  };

  const W = 780;
  const H = 240;
  const padLeft = 44;
  const padRight = 14;
  const padTop = 18;
  const padBottom = 26;
  const plotW = W - padLeft - padRight;
  const plotH = H - padTop - padBottom;

  const { minVal, maxVal, shavedSpikeCount } = useMemo(() => {
    const vals: number[] = [];
    let spikeCount = 0;
    for (const s of activeSeries) {
      for (const p of s.points) {
        if (p.wasShaved) spikeCount += 1;
        const v = cutPeak ? p.shavedMs : p.rawMs;
        if (v !== null) vals.push(v);
      }
    }
    if (vals.length === 0) return { minVal: 0, maxVal: 100, shavedSpikeCount: spikeCount };
    const lo = Math.max(0, Math.floor(Math.min(...vals) * 0.82));
    const hi = Math.max(lo + 16, Math.ceil(Math.max(...vals) * 1.12));
    return { minVal: lo, maxVal: hi, shavedSpikeCount: spikeCount };
  }, [activeSeries, cutPeak]);

  const buildSeriesPath = (s: PingTaskSeries) => {
    if (timelineCount === 0 || s.points.length === 0) return '';
    const span = Math.max(1, maxVal - minVal);
    const cmds: string[] = [];
    let penDown = false;

    for (let i = 0; i < timelineCount; i++) {
      const pt = sampleAt(s, i);
      const val = pt ? (cutPeak ? pt.shavedMs : pt.rawMs) : null;
      if (val === null) {
        penDown = false;
        continue;
      }
      const x = padLeft + (i / Math.max(1, timelineCount - 1)) * plotW;
      const y = padTop + plotH - ((val - minVal) / span) * plotH;
      cmds.push(`${penDown ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`);
      penDown = true;
    }
    return cmds.join(' ');
  };

  const toggleTask = (taskId: number) => {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const soloTask = (e: React.MouseEvent, taskId: number) => {
    e.stopPropagation();
    setHiddenIds((prev) => {
      // If already soloed on this task, restore all
      const othersHidden =
        seriesList.length > 1 &&
        seriesList.every((s) => (s.taskId === taskId ? !prev.has(taskId) : prev.has(s.taskId)));
      if (othersHidden) return new Set();
      return new Set(seriesList.filter((s) => s.taskId !== taskId).map((s) => s.taskId));
    });
  };

  const updatePointerIndex = (clientX: number, el: SVGSVGElement) => {
    if (timelineCount <= 0) return;
    const rect = el.getBoundingClientRect();
    const relX = ((clientX - rect.left) / rect.width) * W;
    const clamped = Math.max(padLeft, Math.min(W - padRight, relX));
    const idx = Math.round(((clamped - padLeft) / plotW) * Math.max(1, timelineCount - 1));
    setHoverIdx(Math.max(0, Math.min(timelineCount - 1, idx)));
  };

  const rangeLabel = hours >= 24 ? `${hours / 24} 天` : `${hours} 小时`;
  const referenceSeries = seriesList.find((s) => s.points.length > 0) || null;
  const hoveredTs =
    hoverIdx !== null && referenceSeries ? sampleAt(referenceSeries, hoverIdx)?.ts ?? 0 : 0;

  return (
    <div className="glass-panel chart-card km-load-chart">
      <div className="chart-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 700 }}>
            延迟检测
          </h3>
          <span
            className="mono"
            style={{
              fontSize: 11,
              padding: '2px 8px',
              borderRadius: 999,
              background: 'var(--accent-pill-bg)',
              color: 'var(--accent-pill-text)',
            }}
          >
            {rangeLabel} · {seriesList.length} 项
          </span>
        </div>

        {/* Peak Shaving (削峰) Switch + Quick Filter Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }} className="mono">
          <button
            type="button"
            id="btn-toggle-cut-peak"
            className={`glass-icon-btn ${cutPeak ? 'active-toggle' : ''}`}
            onClick={() => setCutPeak((v) => !v)}
          >
            <span>✂ 削峰</span>
            {cutPeak && shavedSpikeCount > 0 && (
              <span style={{ opacity: 0.78, fontSize: 10.5 }}>({shavedSpikeCount})</span>
            )}
          </button>

          {seriesList.length > 1 && (
            <>
              <button
                type="button"
                className="glass-icon-btn"
                onClick={() => setHiddenIds(new Set())}
              >
                全显
              </button>
              <button
                type="button"
                className="glass-icon-btn"
                onClick={() => {
                  const onlyLossy = new Set(
                    seriesList.filter((s) => s.lossPct <= 0).map((s) => s.taskId)
                  );
                  if (onlyLossy.size === seriesList.length) {
                    setHiddenIds(new Set());
                  } else {
                    setHiddenIds(onlyLossy);
                  }
                }}
              >
                仅丢包
              </button>
            </>
          )}
        </div>
      </div>

      {/* Multi-Target Probe Selector & Live Stats Matrix */}
      {seriesList.length > 0 && (
        <div className="probe-matrix-grid mono">
          {seriesList.map((s) => {
            const isHidden = hiddenIds.has(s.taskId);
            const stColor = getLatencyColor(s.latestMs, s.lossPct);
            return (
              <div
                key={s.taskId}
                role="button"
                tabIndex={0}
                onClick={() => toggleTask(s.taskId)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleTask(s.taskId);
                  }
                }}
                className={`probe-chip-card ${isHidden ? 'inactive' : ''}`}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 6,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      minWidth: 0,
                      fontWeight: 600,
                      fontSize: 11.5,
                    }}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: s.color,
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                      title={s.taskName}
                    >
                      {s.taskName}
                    </span>
                  </div>

                  {seriesList.length > 1 && (
                    <span
                      onClick={(e) => soloTask(e, s.taskId)}
                      style={{
                        fontSize: 10,
                        padding: '1px 5px',
                        borderRadius: 5,
                        background: 'var(--glass-well-hover)',
                        color: 'var(--text-secondary)',
                        flexShrink: 0,
                      }}
                      title="仅显示该检测目标（再次点击恢复全部）"
                    >
                      单看
                    </span>
                  )}
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                    marginTop: 5,
                  }}
                >
                  <span style={{ fontSize: 14, fontWeight: 700, color: stColor }}>
                    {s.latestMs !== null ? `${s.latestMs}ms` : '--'}
                  </span>
                  <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
                    均 {s.avgMs ?? '--'}ms
                  </span>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginTop: 2,
                    fontSize: 10.5,
                  }}
                >
                  <span style={{ color: stColor }}>丢包 {s.lossPct.toFixed(1)}%</span>
                  <span style={{ color: 'var(--text-muted)' }}>
                    峰 {s.maxMs ?? '--'}ms
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Interactive SVG Multi-Series Plot (Mouse + Mobile Touch Scrubbing!) */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: 235,
          touchAction: 'pan-y',
        }}
      >
        {loading && seriesList.length === 0 ? (
          <div
            className="mono"
            style={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-muted)',
              fontSize: 12,
            }}
          >
            加载中...
          </div>
        ) : seriesList.length === 0 || timelineCount === 0 ? (
          <div
            className="mono"
            style={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-muted)',
              fontSize: 12,
            }}
          >
            暂无延迟记录
          </div>
        ) : (
          <>
            <svg
              viewBox={`0 0 ${W} ${H}`}
              preserveAspectRatio="none"
              style={{ width: '100%', height: '100%', overflow: 'visible', display: 'block' }}
              onMouseMove={(e) => updatePointerIndex(e.clientX, e.currentTarget)}
              onMouseLeave={() => setHoverIdx(null)}
              onTouchStart={(e) => {
                if (e.touches[0]) updatePointerIndex(e.touches[0].clientX, e.currentTarget);
              }}
              onTouchMove={(e) => {
                if (e.touches[0]) updatePointerIndex(e.touches[0].clientX, e.currentTarget);
              }}
              onTouchEnd={() => setHoverIdx(null)}
            >
              {/* Horizontal Reference Grid Lines */}
              {[0, 0.33, 0.66, 1].map((ratio) => {
                const y = padTop + plotH * ratio;
                const val = Math.round(maxVal - (maxVal - minVal) * ratio);
                return (
                  <g key={ratio}>
                    <line
                      x1={padLeft}
                      y1={y}
                      x2={W - padRight}
                      y2={y}
                      stroke="var(--chart-grid)"
                      strokeDasharray={ratio === 1 ? undefined : '4 4'}
                    />
                    <text
                      x={padLeft - 6}
                      y={y + 4}
                      textAnchor="end"
                      fill="var(--chart-axis)"
                      fontSize="10.5"
                      className="mono"
                    >
                      {val}
                    </text>
                  </g>
                );
              })}

              {/* Packet Loss Markers Along Bottom */}
              {Array.from({ length: timelineCount }).map((_, idx) => {
                const anyLoss = activeSeries.some((s) => sampleAt(s, idx)?.lost);
                if (!anyLoss) return null;
                const x = padLeft + (idx / Math.max(1, timelineCount - 1)) * plotW;
                return (
                  <rect
                    key={idx}
                    x={x - 1.6}
                    y={padTop + plotH - 22}
                    width={3.2}
                    height={22}
                    rx={1.5}
                    fill="var(--accent-coral)"
                    opacity={0.65}
                  />
                );
              })}

              {/* Multi-Target Latency Curves */}
              {activeSeries.map((s) => (
                <path
                  key={s.taskId}
                  d={buildSeriesPath(s)}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}

              {/* X-Axis Timestamps */}
              {referenceSeries &&
                [0, 0.25, 0.5, 0.75, 1].map((p) => {
                  const idx = Math.min(
                    timelineCount - 1,
                    Math.round(p * (timelineCount - 1))
                  );
                  const x = padLeft + p * plotW;
                  const pt = sampleAt(referenceSeries, idx);
                  return (
                    <text
                      key={p}
                      x={x}
                      y={H - 4}
                      textAnchor={p === 0 ? 'start' : p === 1 ? 'end' : 'middle'}
                      fill="var(--chart-axis)"
                      fontSize="10.5"
                      className="mono"
                    >
                      {formatAxisTime(pt?.ts ?? 0, hours)}
                    </text>
                  );
                })}

              {/* Hover / Touch Crosshair */}
              {hoverIdx !== null && (
                <line
                  x1={padLeft + (hoverIdx / Math.max(1, timelineCount - 1)) * plotW}
                  y1={padTop}
                  x2={padLeft + (hoverIdx / Math.max(1, timelineCount - 1)) * plotW}
                  y2={padTop + plotH}
                  stroke="var(--accent-cyan)"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                />
              )}
            </svg>

            {/* Floating Crosshair Tooltip (Supports Multi-Target + Shaved Spike Note!) */}
            {hoverIdx !== null && activeSeries.length > 0 && (
              <div
                className="mono"
                style={{
                  position: 'absolute',
                  top: 6,
                  left: hoverIdx > timelineCount / 2 ? 46 : undefined,
                  right: hoverIdx <= timelineCount / 2 ? 10 : undefined,
                  maxWidth: 'min(260px, calc(100% - 54px))',
                  maxHeight: 200,
                  overflowY: 'auto',
                  padding: '8px 10px',
                  borderRadius: 11,
                  background: 'var(--glass-popover-bg)',
                  backdropFilter: 'blur(20px)',
                  border: '1px solid var(--glass-border-hover)',
                  fontSize: 11,
                  pointerEvents: 'none',
                  boxShadow: '0 10px 28px rgba(0,0,0,0.4)',
                  zIndex: 10,
                }}
              >
                <div style={{ color: 'var(--text-muted)', marginBottom: 4 }}>
                  {formatAxisTime(hoveredTs, 48)} {cutPeak ? '· 削峰视图' : '· 原始视图'}
                </div>
                {activeSeries.map((s) => {
                  const pt = sampleAt(s, hoverIdx);
                  if (!pt) return null;
                  const val = cutPeak ? pt.shavedMs : pt.rawMs;
                  return (
                    <div
                      key={s.taskId}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 8,
                        color: s.color,
                        lineHeight: 1.45,
                      }}
                    >
                      <span
                        style={{
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {s.taskName}:
                      </span>
                      <span style={{ flexShrink: 0, fontWeight: 600 }}>
                        {pt.lost
                          ? '丢包'
                          : cutPeak && pt.wasShaved && pt.rawMs !== null
                          ? `${val}ms (原${pt.rawMs})`
                          : `${val ?? '--'}ms`}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

interface NetworkLoadChartProps {
  records: KomariLoadRecord[];
  hours: number;
  loading: boolean;
}

export const NetworkLoadChart: React.FC<NetworkLoadChartProps> = ({
  records,
  hours,
  loading,
}) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const series = useMemo(() => {
    const sorted = [...records].sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
    return sorted.map((r) => {
      const ramPct = r.ram_total > 0 ? (r.ram / r.ram_total) * 100 : 0;
      return {
        ts: Date.parse(r.time) || 0,
        rxMbps: bytesPerSecToMbps(r.net_in),
        txMbps: bytesPerSecToMbps(r.net_out),
        cpuPct: Math.min(100, Math.max(0, r.cpu || 0)),
        ramPct: Math.min(100, Math.max(0, ramPct)),
      };
    });
  }, [records]);

  const W = 780;
  const H = 220;
  const padLeft = 44;
  const padRight = 14;
  const padTop = 18;
  const padBottom = 26;
  const plotW = W - padLeft - padRight;
  const plotH = H - padTop - padBottom;

  const maxMbps = useMemo(() => {
    if (series.length === 0) return 100;
    const peak = Math.max(...series.map((s) => Math.max(s.rxMbps, s.txMbps)), 10);
    return Math.ceil(peak * 1.15);
  }, [series]);

  const buildPoints = (getter: (s: (typeof series)[number]) => number, maxY: number) => {
    if (series.length === 0) return '';
    return series
      .map((s, i) => {
        const x = padLeft + (i / Math.max(1, series.length - 1)) * plotW;
        const y = padTop + plotH - (Math.min(maxY, getter(s)) / Math.max(1, maxY)) * plotH;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  };

  const updatePointerIndex = (clientX: number, el: SVGSVGElement) => {
    if (series.length === 0) return;
    const rect = el.getBoundingClientRect();
    const relX = ((clientX - rect.left) / rect.width) * W;
    const clamped = Math.max(padLeft, Math.min(W - padRight, relX));
    const idx = Math.round(((clamped - padLeft) / plotW) * Math.max(1, series.length - 1));
    setHoverIdx(Math.max(0, Math.min(series.length - 1, idx)));
  };

  const rxPoints = buildPoints((s) => s.rxMbps, maxMbps);
  const txPoints = buildPoints((s) => s.txMbps, maxMbps);
  const cpuPoints = buildPoints((s) => s.cpuPct, 100);

  const peakRx = series.length > 0 ? Math.max(...series.map((s) => s.rxMbps)) : 0;
  const peakTx = series.length > 0 ? Math.max(...series.map((s) => s.txMbps)) : 0;
  const avgCpu =
    series.length > 0
      ? series.reduce((acc, s) => acc + s.cpuPct, 0) / series.length
      : 0;
  const avgRam =
    series.length > 0
      ? series.reduce((acc, s) => acc + s.ramPct, 0) / series.length
      : 0;

  const rangeLabel = hours >= 24 ? `${hours / 24} 天` : `${hours} 小时`;
  const hovered = hoverIdx !== null ? series[hoverIdx] : null;

  return (
    <div className="glass-panel chart-card km-load-chart">
      <div className="chart-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 700 }}>
            网络与负载
          </h3>
          <span
            className="mono"
            style={{
              fontSize: 11,
              padding: '2px 8px',
              borderRadius: 999,
              background: 'var(--accent-pill-bg)',
              color: 'var(--accent-pill-text)',
            }}
          >
            {rangeLabel}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 10, fontSize: 11.5, flexWrap: 'wrap' }} className="mono">
          <span style={{ color: 'var(--accent-cyan)' }}>● 下行 RX</span>
          <span style={{ color: 'var(--accent-emerald)' }}>● 上行 TX</span>
          <span style={{ color: 'var(--accent-amber)' }}>┈ CPU%</span>
        </div>
      </div>

      <div className="chart-stats-row mono">
        <div className="carrier-cell">
          <div style={{ fontSize: 11, color: 'var(--accent-cyan)', fontWeight: 600 }}>
            窗口峰值下行
          </div>
          <div style={{ fontSize: 14.5, fontWeight: 700, marginTop: 4 }}>
            {peakRx.toFixed(1)} <span style={{ fontSize: 10.5, fontWeight: 400 }}>Mbps</span>
          </div>
        </div>
        <div className="carrier-cell">
          <div style={{ fontSize: 11, color: 'var(--accent-emerald)', fontWeight: 600 }}>
            窗口峰值上行
          </div>
          <div style={{ fontSize: 14.5, fontWeight: 700, marginTop: 4 }}>
            {peakTx.toFixed(1)} <span style={{ fontSize: 10.5, fontWeight: 400 }}>Mbps</span>
          </div>
        </div>
        <div className="carrier-cell">
          <div style={{ fontSize: 11, color: 'var(--accent-amber)', fontWeight: 600 }}>
            CPU / 内存均值
          </div>
          <div style={{ fontSize: 14.5, fontWeight: 700, marginTop: 4 }}>
            {avgCpu.toFixed(0)}% / {avgRam.toFixed(0)}%
          </div>
        </div>
      </div>

      <div
        style={{
          position: 'relative',
          width: '100%',
          height: 215,
          touchAction: 'pan-y',
        }}
      >
        {loading && series.length === 0 ? (
          <div
            className="mono"
            style={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-muted)',
              fontSize: 12,
            }}
          >
            正在同步历史网络与负载数据...
          </div>
        ) : series.length === 0 ? (
          <div
            className="mono"
            style={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-muted)',
              fontSize: 12,
            }}
          >
            当前窗口暂无历史负载记录
          </div>
        ) : (
          <>
            <svg
              viewBox={`0 0 ${W} ${H}`}
              preserveAspectRatio="none"
              style={{ width: '100%', height: '100%', overflow: 'visible', display: 'block' }}
              onMouseMove={(e) => updatePointerIndex(e.clientX, e.currentTarget)}
              onMouseLeave={() => setHoverIdx(null)}
              onTouchStart={(e) => {
                if (e.touches[0]) updatePointerIndex(e.touches[0].clientX, e.currentTarget);
              }}
              onTouchMove={(e) => {
                if (e.touches[0]) updatePointerIndex(e.touches[0].clientX, e.currentTarget);
              }}
              onTouchEnd={() => setHoverIdx(null)}
            >
              <defs>
                <linearGradient id="aeroRxGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent-cyan)" stopOpacity="0.32" />
                  <stop offset="100%" stopColor="var(--accent-cyan)" stopOpacity="0.0" />
                </linearGradient>
                <linearGradient id="aeroTxGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent-emerald)" stopOpacity="0.24" />
                  <stop offset="100%" stopColor="var(--accent-emerald)" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {[0, 0.5, 1].map((ratio) => {
                const y = padTop + plotH * ratio;
                const val = Math.round(maxMbps * (1 - ratio));
                return (
                  <g key={ratio}>
                    <line
                      x1={padLeft}
                      y1={y}
                      x2={W - padRight}
                      y2={y}
                      stroke="var(--chart-grid)"
                      strokeDasharray={ratio === 1 ? undefined : '4 4'}
                    />
                    <text
                      x={padLeft - 6}
                      y={y + 4}
                      textAnchor="end"
                      fill="var(--chart-axis)"
                      fontSize="10.5"
                      className="mono"
                    >
                      {val}M
                    </text>
                  </g>
                );
              })}

              <polygon
                fill="url(#aeroRxGrad)"
                points={`${padLeft},${padTop + plotH} ${rxPoints} ${W - padRight},${padTop + plotH}`}
              />
              <polygon
                fill="url(#aeroTxGrad)"
                points={`${padLeft},${padTop + plotH} ${txPoints} ${W - padRight},${padTop + plotH}`}
              />
              <polyline
                fill="none"
                stroke="var(--accent-cyan)"
                strokeWidth={2.2}
                points={rxPoints}
              />
              <polyline
                fill="none"
                stroke="var(--accent-emerald)"
                strokeWidth={2}
                points={txPoints}
              />
              <polyline
                fill="none"
                stroke="var(--accent-amber)"
                strokeWidth={1.6}
                strokeDasharray="4 3"
                points={cpuPoints}
              />

              {[0, 0.25, 0.5, 0.75, 1].map((p) => {
                const idx = Math.min(
                  series.length - 1,
                  Math.round(p * (series.length - 1))
                );
                const x = padLeft + p * plotW;
                return (
                  <text
                    key={p}
                    x={x}
                    y={H - 4}
                    textAnchor={p === 0 ? 'start' : p === 1 ? 'end' : 'middle'}
                    fill="var(--chart-axis)"
                    fontSize="10.5"
                    className="mono"
                  >
                    {formatAxisTime(series[idx]?.ts, hours)}
                  </text>
                );
              })}

              {hoverIdx !== null && (
                <line
                  x1={padLeft + (hoverIdx / Math.max(1, series.length - 1)) * plotW}
                  y1={padTop}
                  x2={padLeft + (hoverIdx / Math.max(1, series.length - 1)) * plotW}
                  y2={padTop + plotH}
                  stroke="var(--accent-cyan)"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                />
              )}
            </svg>

            {hovered && hoverIdx !== null && (
              <div
                className="mono"
                style={{
                  position: 'absolute',
                  top: 6,
                  left: hoverIdx > series.length / 2 ? 46 : undefined,
                  right: hoverIdx <= series.length / 2 ? 10 : undefined,
                  padding: '8px 11px',
                  borderRadius: 10,
                  background: 'var(--glass-popover-bg)',
                  backdropFilter: 'blur(18px)',
                  border: '1px solid var(--glass-border-hover)',
                  fontSize: 11,
                  pointerEvents: 'none',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
                }}
              >
                <div style={{ color: 'var(--text-muted)', marginBottom: 4 }}>
                  {formatAxisTime(hovered.ts, 48)}
                </div>
                <div style={{ color: 'var(--accent-cyan)' }}>
                  下行 RX: {hovered.rxMbps.toFixed(2)} Mbps
                </div>
                <div style={{ color: 'var(--accent-emerald)' }}>
                  上行 TX: {hovered.txMbps.toFixed(2)} Mbps
                </div>
                <div style={{ color: 'var(--accent-amber)' }}>
                  CPU: {hovered.cpuPct.toFixed(1)}% · 内存: {hovered.ramPct.toFixed(1)}%
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
