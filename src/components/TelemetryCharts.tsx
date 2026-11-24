import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KomariLoadRecord, PingTaskPoint, PingTaskSeries } from '../types/komari';
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

function pickSample(points: PingTaskPoint[], idx: number, timelineCount: number): PingTaskPoint | null {
  if (points.length === 0 || timelineCount === 0) return null;
  const mapped = Math.min(
    points.length - 1,
    Math.round((idx / Math.max(1, timelineCount - 1)) * (points.length - 1))
  );
  return points[mapped];
}

interface MultiTargetPingChartProps {
  seriesList: PingTaskSeries[];
  hours: number;
  loading: boolean;
  defaultCutPeak: boolean;
}

export const MultiTargetPingChart: React.FC<MultiTargetPingChartProps> = memo(
  ({ seriesList, hours, loading, defaultCutPeak }) => {
    const [cutPeak, setCutPeak] = useState<boolean>(defaultCutPeak);
    const [hiddenIds, setHiddenIds] = useState<Set<number>>(() => new Set());
    const [hoverIdx, setHoverIdx] = useState<number | null>(null);
    const rafRef = useRef<number | null>(null);

    useEffect(() => {
      return () => {
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      };
    }, []);

    const activeSeries = useMemo(
      () => seriesList.filter((s) => !hiddenIds.has(s.taskId)),
      [seriesList, hiddenIds]
    );

    const timelineCount = useMemo(
      () => seriesList.reduce((m, s) => Math.max(m, s.points.length), 0),
      [seriesList]
    );

    const W = 780;
    const H = 235;
    const padLeft = 44;
    const padRight = 14;
    const padTop = 18;
    const padBottom = 26;
    const plotW = W - padLeft - padRight;
    const plotH = H - padTop - padBottom;

    // Precompute Y-bounds, SVG paths, loss spikes, and X-ticks ONLY when data/toggles change (never on hover!)
    const chartGeometry = useMemo(() => {
      const vals: number[] = [];
      let spikeCount = 0;

      for (const s of activeSeries) {
        for (const p of s.points) {
          if (p.wasShaved) spikeCount += 1;
          const v = cutPeak ? p.shavedMs : p.rawMs;
          if (v !== null) vals.push(v);
        }
      }

      const minVal = vals.length > 0 ? Math.max(0, Math.floor(Math.min(...vals) * 0.82)) : 0;
      const maxVal =
        vals.length > 0 ? Math.max(minVal + 16, Math.ceil(Math.max(...vals) * 1.12)) : 100;
      const span = Math.max(1, maxVal - minVal);

      const paths = activeSeries.map((s) => {
        if (timelineCount === 0 || s.points.length === 0) {
          return { taskId: s.taskId, color: s.color, d: '' };
        }
        const cmds: string[] = [];
        let penDown = false;
        for (let i = 0; i < timelineCount; i++) {
          const pt = pickSample(s.points, i, timelineCount);
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
        return { taskId: s.taskId, color: s.color, d: cmds.join(' ') };
      });

      const lossXs: number[] = [];
      for (let i = 0; i < timelineCount; i++) {
        if (activeSeries.some((s) => pickSample(s.points, i, timelineCount)?.lost)) {
          lossXs.push(padLeft + (i / Math.max(1, timelineCount - 1)) * plotW);
        }
      }

      const refSeries = seriesList.find((s) => s.points.length > 0) || null;
      const xTicks = refSeries
        ? [0, 0.25, 0.5, 0.75, 1].map((p) => {
            const idx = Math.min(
              timelineCount - 1,
              Math.round(p * Math.max(0, timelineCount - 1))
            );
            const pt = pickSample(refSeries.points, idx, timelineCount);
            return {
              p,
              x: padLeft + p * plotW,
              label: formatAxisTime(pt?.ts ?? 0, hours),
            };
          })
        : [];

      return { minVal, maxVal, shavedSpikeCount: spikeCount, paths, lossXs, xTicks, refSeries };
    }, [activeSeries, cutPeak, timelineCount, seriesList, hours, plotW, plotH]);

    const toggleTask = useCallback((taskId: number) => {
      setHiddenIds((prev) => {
        const next = new Set(prev);
        if (next.has(taskId)) next.delete(taskId);
        else next.add(taskId);
        return next;
      });
    }, []);

    const soloTask = useCallback(
      (e: React.MouseEvent, taskId: number) => {
        e.stopPropagation();
        setHiddenIds((prev) => {
          const othersHidden =
            seriesList.length > 1 &&
            seriesList.every((s) =>
              s.taskId === taskId ? !prev.has(taskId) : prev.has(s.taskId)
            );
          if (othersHidden) return new Set();
          return new Set(seriesList.filter((s) => s.taskId !== taskId).map((s) => s.taskId));
        });
      },
      [seriesList]
    );

    const schedulePointerIndex = useCallback(
      (clientX: number, rectLeft: number, rectWidth: number) => {
        if (timelineCount <= 0 || rectWidth <= 0) return;
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
          const relX = ((clientX - rectLeft) / rectWidth) * W;
          const clamped = Math.max(padLeft, Math.min(W - padRight, relX));
          const idx = Math.round(
            ((clamped - padLeft) / plotW) * Math.max(1, timelineCount - 1)
          );
          const bounded = Math.max(0, Math.min(timelineCount - 1, idx));
          setHoverIdx((prev) => (prev === bounded ? prev : bounded));
        });
      },
      [timelineCount, plotW]
    );

    const rangeLabel = hours >= 24 ? `${hours / 24} 天` : `${hours} 小时`;
    const hoveredTs =
      hoverIdx !== null && chartGeometry.refSeries
        ? pickSample(chartGeometry.refSeries.points, hoverIdx, timelineCount)?.ts ?? 0
        : 0;

    return (
      <div className="glass-panel chart-card km-load-chart">
        <div className="chart-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>延迟检测</h3>
            <span
              className="mono"
              style={{
                fontSize: 11,
                padding: '2px 8px',
                borderRadius: 6,
                backgroundColor: 'var(--accent-pill-bg)',
                color: 'var(--accent-pill-text)',
              }}
            >
              {rangeLabel} · {seriesList.length} 项
            </span>
          </div>

          <div
            style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}
            className="mono"
          >
            <button
              type="button"
              id="btn-toggle-cut-peak"
              className={`glass-icon-btn ${cutPeak ? 'active-toggle' : ''}`}
              onClick={() => setCutPeak((v) => !v)}
            >
              <span>✂ 削峰</span>
              {cutPeak && chartGeometry.shavedSpikeCount > 0 && (
                <span style={{ opacity: 0.78, fontSize: 10.5 }}>
                  ({chartGeometry.shavedSpikeCount})
                </span>
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
                          width: 7,
                          height: 7,
                          borderRadius: '50%',
                          backgroundColor: s.color,
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
                          borderRadius: 4,
                          backgroundColor: 'var(--glass-well-hover)',
                          color: 'var(--text-secondary)',
                          flexShrink: 0,
                        }}
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
                      marginTop: 4,
                    }}
                  >
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: stColor }}>
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
                      marginTop: 1,
                      fontSize: 10.5,
                    }}
                  >
                    <span style={{ color: stColor }}>丢包 {s.lossPct.toFixed(1)}%</span>
                    <span style={{ color: 'var(--text-muted)' }}>峰 {s.maxMs ?? '--'}ms</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div
          style={{
            position: 'relative',
            width: '100%',
            height: 230,
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
                onMouseMove={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  schedulePointerIndex(e.clientX, rect.left, rect.width);
                }}
                onMouseLeave={() => setHoverIdx(null)}
                onTouchStart={(e) => {
                  if (e.touches[0]) {
                    const rect = e.currentTarget.getBoundingClientRect();
                    schedulePointerIndex(e.touches[0].clientX, rect.left, rect.width);
                  }
                }}
                onTouchMove={(e) => {
                  if (e.touches[0]) {
                    const rect = e.currentTarget.getBoundingClientRect();
                    schedulePointerIndex(e.touches[0].clientX, rect.left, rect.width);
                  }
                }}
                onTouchEnd={() => setHoverIdx(null)}
              >
                {[0, 0.33, 0.66, 1].map((ratio) => {
                  const y = padTop + plotH * ratio;
                  const val = Math.round(
                    chartGeometry.maxVal - (chartGeometry.maxVal - chartGeometry.minVal) * ratio
                  );
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

                {chartGeometry.lossXs.map((x, idx) => (
                  <rect
                    key={idx}
                    x={x - 1.5}
                    y={padTop + plotH - 20}
                    width={3}
                    height={20}
                    rx={1.5}
                    fill="var(--accent-coral)"
                    opacity={0.65}
                  />
                ))}

                {chartGeometry.paths.map((item) => (
                  <path
                    key={item.taskId}
                    d={item.d}
                    fill="none"
                    stroke={item.color}
                    strokeWidth={1.8}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ))}

                {chartGeometry.xTicks.map((t) => (
                  <text
                    key={t.p}
                    x={t.x}
                    y={H - 4}
                    textAnchor={t.p === 0 ? 'start' : t.p === 1 ? 'end' : 'middle'}
                    fill="var(--chart-axis)"
                    fontSize="10.5"
                    className="mono"
                  >
                    {t.label}
                  </text>
                ))}

                {hoverIdx !== null && (
                  <line
                    x1={padLeft + (hoverIdx / Math.max(1, timelineCount - 1)) * plotW}
                    y1={padTop}
                    x2={padLeft + (hoverIdx / Math.max(1, timelineCount - 1)) * plotW}
                    y2={padTop + plotH}
                    stroke="var(--text-muted)"
                    strokeWidth={1}
                    strokeDasharray="3 3"
                  />
                )}
              </svg>

              {hoverIdx !== null && activeSeries.length > 0 && (
                <div
                  className="mono"
                  style={{
                    position: 'absolute',
                    top: 6,
                    left: hoverIdx > timelineCount / 2 ? 46 : undefined,
                    right: hoverIdx <= timelineCount / 2 ? 10 : undefined,
                    maxWidth: 'min(250px, calc(100% - 54px))',
                    maxHeight: 196,
                    overflowY: 'auto',
                    padding: '8px 10px',
                    borderRadius: 9,
                    backgroundColor: 'var(--glass-popover-bg)',
                    border: '1px solid var(--glass-border-hover)',
                    fontSize: 11,
                    pointerEvents: 'none',
                    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
                    zIndex: 10,
                  }}
                >
                  <div style={{ color: 'var(--text-muted)', marginBottom: 4 }}>
                    {formatAxisTime(hoveredTs, 48)}
                  </div>
                  {activeSeries.map((s) => {
                    const pt = pickSample(s.points, hoverIdx, timelineCount);
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
                          {s.taskName}
                        </span>
                        <span style={{ flexShrink: 0, fontWeight: 600 }}>
                          {pt.lost
                            ? '丢包'
                            : cutPeak && pt.wasShaved && pt.rawMs !== null
                            ? `${val}ms (${pt.rawMs})`
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
  }
);
MultiTargetPingChart.displayName = 'MultiTargetPingChart';

interface NetworkLoadChartProps {
  records: KomariLoadRecord[];
  hours: number;
  loading: boolean;
}

export const NetworkLoadChart: React.FC<NetworkLoadChartProps> = memo(
  ({ records, hours, loading }) => {
    const [hoverIdx, setHoverIdx] = useState<number | null>(null);
    const rafRef = useRef<number | null>(null);

    useEffect(() => {
      return () => {
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      };
    }, []);

    const W = 780;
    const H = 215;
    const padLeft = 44;
    const padRight = 14;
    const padTop = 18;
    const padBottom = 26;
    const plotW = W - padLeft - padRight;
    const plotH = H - padTop - padBottom;

    const chartData = useMemo(() => {
      const sorted = [...records].sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
      const series = sorted.map((r) => {
        const ramPct = r.ram_total > 0 ? (r.ram / r.ram_total) * 100 : 0;
        return {
          ts: Date.parse(r.time) || 0,
          rxMbps: bytesPerSecToMbps(r.net_in),
          txMbps: bytesPerSecToMbps(r.net_out),
          cpuPct: Math.min(100, Math.max(0, r.cpu || 0)),
          ramPct: Math.min(100, Math.max(0, ramPct)),
        };
      });

      const peakRx = series.length > 0 ? Math.max(...series.map((s) => s.rxMbps)) : 0;
      const peakTx = series.length > 0 ? Math.max(...series.map((s) => s.txMbps)) : 0;
      const maxMbps = Math.ceil(Math.max(peakRx, peakTx, 10) * 1.15);

      const avgCpu =
        series.length > 0
          ? series.reduce((acc, s) => acc + s.cpuPct, 0) / series.length
          : 0;
      const avgRam =
        series.length > 0
          ? series.reduce((acc, s) => acc + s.ramPct, 0) / series.length
          : 0;

      const buildPoints = (getter: (s: (typeof series)[number]) => number, maxY: number) => {
        if (series.length === 0) return '';
        return series
          .map((s, i) => {
            const x = padLeft + (i / Math.max(1, series.length - 1)) * plotW;
            const y =
              padTop + plotH - (Math.min(maxY, getter(s)) / Math.max(1, maxY)) * plotH;
            return `${x.toFixed(1)},${y.toFixed(1)}`;
          })
          .join(' ');
      };

      const xTicks =
        series.length > 0
          ? [0, 0.25, 0.5, 0.75, 1].map((p) => {
              const idx = Math.min(
                series.length - 1,
                Math.round(p * Math.max(0, series.length - 1))
              );
              return {
                p,
                x: padLeft + p * plotW,
                label: formatAxisTime(series[idx]?.ts ?? 0, hours),
              };
            })
          : [];

      return {
        series,
        maxMbps,
        peakRx,
        peakTx,
        avgCpu,
        avgRam,
        rxPoints: buildPoints((s) => s.rxMbps, maxMbps),
        txPoints: buildPoints((s) => s.txMbps, maxMbps),
        cpuPoints: buildPoints((s) => s.cpuPct, 100),
        xTicks,
      };
    }, [records, hours, plotW, plotH]);

    const schedulePointerIndex = useCallback(
      (clientX: number, rectLeft: number, rectWidth: number) => {
        const len = chartData.series.length;
        if (len <= 0 || rectWidth <= 0) return;
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
          const relX = ((clientX - rectLeft) / rectWidth) * W;
          const clamped = Math.max(padLeft, Math.min(W - padRight, relX));
          const idx = Math.round(((clamped - padLeft) / plotW) * Math.max(1, len - 1));
          const bounded = Math.max(0, Math.min(len - 1, idx));
          setHoverIdx((prev) => (prev === bounded ? prev : bounded));
        });
      },
      [chartData.series.length, plotW]
    );

    const rangeLabel = hours >= 24 ? `${hours / 24} 天` : `${hours} 小时`;
    const hovered = hoverIdx !== null ? chartData.series[hoverIdx] : null;

    return (
      <div className="glass-panel chart-card km-load-chart">
        <div className="chart-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>网络与负载</h3>
            <span
              className="mono"
              style={{
                fontSize: 11,
                padding: '2px 8px',
                borderRadius: 6,
                backgroundColor: 'var(--accent-pill-bg)',
                color: 'var(--accent-pill-text)',
              }}
            >
              {rangeLabel}
            </span>
          </div>

          <div
            style={{ display: 'flex', gap: 10, fontSize: 11.5, flexWrap: 'wrap' }}
            className="mono"
          >
            <span style={{ color: 'var(--accent-cyan)' }}>● 下行 RX</span>
            <span style={{ color: 'var(--accent-emerald)' }}>● 上行 TX</span>
            <span style={{ color: 'var(--accent-amber)' }}>┈ CPU%</span>
          </div>
        </div>

        <div className="chart-stats-row mono">
          <div className="carrier-cell">
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>峰值下行</div>
            <div style={{ fontSize: 14, fontWeight: 600, marginTop: 3 }}>
              {chartData.peakRx.toFixed(1)}{' '}
              <span style={{ fontSize: 10.5, fontWeight: 400 }}>Mbps</span>
            </div>
          </div>
          <div className="carrier-cell">
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>峰值上行</div>
            <div style={{ fontSize: 14, fontWeight: 600, marginTop: 3 }}>
              {chartData.peakTx.toFixed(1)}{' '}
              <span style={{ fontSize: 10.5, fontWeight: 400 }}>Mbps</span>
            </div>
          </div>
          <div className="carrier-cell">
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>CPU / 内存均值</div>
            <div style={{ fontSize: 14, fontWeight: 600, marginTop: 3 }}>
              {chartData.avgCpu.toFixed(0)}% / {chartData.avgRam.toFixed(0)}%
            </div>
          </div>
        </div>

        <div
          style={{
            position: 'relative',
            width: '100%',
            height: 210,
            touchAction: 'pan-y',
          }}
        >
          {loading && chartData.series.length === 0 ? (
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
          ) : chartData.series.length === 0 ? (
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
              暂无负载记录
            </div>
          ) : (
            <>
              <svg
                viewBox={`0 0 ${W} ${H}`}
                preserveAspectRatio="none"
                style={{ width: '100%', height: '100%', overflow: 'visible', display: 'block' }}
                onMouseMove={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  schedulePointerIndex(e.clientX, rect.left, rect.width);
                }}
                onMouseLeave={() => setHoverIdx(null)}
                onTouchStart={(e) => {
                  if (e.touches[0]) {
                    const rect = e.currentTarget.getBoundingClientRect();
                    schedulePointerIndex(e.touches[0].clientX, rect.left, rect.width);
                  }
                }}
                onTouchMove={(e) => {
                  if (e.touches[0]) {
                    const rect = e.currentTarget.getBoundingClientRect();
                    schedulePointerIndex(e.touches[0].clientX, rect.left, rect.width);
                  }
                }}
                onTouchEnd={() => setHoverIdx(null)}
              >
                <defs>
                  <linearGradient id="aeroRxGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent-cyan)" stopOpacity="0.22" />
                    <stop offset="100%" stopColor="var(--accent-cyan)" stopOpacity="0.0" />
                  </linearGradient>
                  <linearGradient id="aeroTxGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent-emerald)" stopOpacity="0.18" />
                    <stop offset="100%" stopColor="var(--accent-emerald)" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {[0, 0.5, 1].map((ratio) => {
                  const y = padTop + plotH * ratio;
                  const val = Math.round(chartData.maxMbps * (1 - ratio));
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
                  points={`${padLeft},${padTop + plotH} ${chartData.rxPoints} ${W - padRight},${
                    padTop + plotH
                  }`}
                />
                <polygon
                  fill="url(#aeroTxGrad)"
                  points={`${padLeft},${padTop + plotH} ${chartData.txPoints} ${W - padRight},${
                    padTop + plotH
                  }`}
                />
                <polyline
                  fill="none"
                  stroke="var(--accent-cyan)"
                  strokeWidth={1.9}
                  points={chartData.rxPoints}
                />
                <polyline
                  fill="none"
                  stroke="var(--accent-emerald)"
                  strokeWidth={1.8}
                  points={chartData.txPoints}
                />
                <polyline
                  fill="none"
                  stroke="var(--accent-amber)"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  points={chartData.cpuPoints}
                />

                {chartData.xTicks.map((t) => (
                  <text
                    key={t.p}
                    x={t.x}
                    y={H - 4}
                    textAnchor={t.p === 0 ? 'start' : t.p === 1 ? 'end' : 'middle'}
                    fill="var(--chart-axis)"
                    fontSize="10.5"
                    className="mono"
                  >
                    {t.label}
                  </text>
                ))}

                {hoverIdx !== null && (
                  <line
                    x1={
                      padLeft +
                      (hoverIdx / Math.max(1, chartData.series.length - 1)) * plotW
                    }
                    y1={padTop}
                    x2={
                      padLeft +
                      (hoverIdx / Math.max(1, chartData.series.length - 1)) * plotW
                    }
                    y2={padTop + plotH}
                    stroke="var(--text-muted)"
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
                    left: hoverIdx > chartData.series.length / 2 ? 46 : undefined,
                    right: hoverIdx <= chartData.series.length / 2 ? 10 : undefined,
                    padding: '8px 10px',
                    borderRadius: 9,
                    backgroundColor: 'var(--glass-popover-bg)',
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
  }
);
NetworkLoadChart.displayName = 'NetworkLoadChart';
