import React, {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { KomariLoadRecord, PingTaskPoint, PingTaskSeries } from '../types/komari';
import { bytesPerSecToMbps } from '../utils/format';

interface PlotPoint {
  x: number;
  y: number;
}

interface PlotLayout {
  width: number;
  height: number;
  themeRev: number;
}

interface PointerSnapshot {
  x: number;
  y: number;
  wellW: number;
  wellH: number;
}

function applyFloatingTooltip(tipEl: HTMLDivElement | null, ptr: PointerSnapshot): void {
  if (!tipEl || ptr.wellW <= 0 || ptr.wellH <= 0) return;
  const tipW = tipEl.offsetWidth;
  const tipH = tipEl.offsetHeight;
  const offsetX = 16;
  const margin = 8;

  let tx = ptr.x + offsetX;
  if (tx + tipW > ptr.wellW - margin) {
    tx = ptr.x - tipW - offsetX;
  }
  tx = Math.max(margin, Math.min(Math.max(margin, ptr.wellW - tipW - margin), tx));

  let ty = ptr.y - Math.min(32, tipH * 0.25);
  ty = Math.max(margin, Math.min(Math.max(margin, ptr.wellH - tipH - margin), ty));

  tipEl.style.transform = `translate3d(${Math.round(tx)}px, ${Math.round(ty)}px, 0)`;
}

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

function formatTooltipTime(ts: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${mo}/${da} ${hh}:${mm}`;
}

function pickSample(points: PingTaskPoint[], idx: number, totalBuckets: number): PingTaskPoint | null {
  if (points.length === 0 || totalBuckets === 0) return null;
  const mapped = Math.min(
    points.length - 1,
    Math.round((idx / Math.max(1, totalBuckets - 1)) * (points.length - 1))
  );
  return points[mapped];
}

function computeNiceAxis(
  rawMin: number,
  rawMax: number
): { min: number; max: number; ticks: number[] } {
  if (!Number.isFinite(rawMin) || !Number.isFinite(rawMax)) {
    return { min: 0, max: 100, ticks: [0, 25, 50, 75, 100] };
  }
  const lo = rawMin < rawMax * 0.28 ? 0 : Math.max(0, rawMin * 0.92);
  const hi = Math.max(lo + 8, rawMax * 1.08);
  const roughStep = (hi - lo) / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(Math.max(1, roughStep))));
  const residual = roughStep / mag;
  const niceMult =
    residual <= 1 ? 1 : residual <= 2 ? 2 : residual <= 2.5 ? 2.5 : residual <= 5 ? 5 : 10;
  const step = Math.max(1, Math.round(niceMult * mag));
  const niceMin = Math.floor(lo / step) * step;
  const niceMax = Math.max(niceMin + step * 2, Math.ceil(hi / step) * step);
  const ticks: number[] = [];
  for (let v = niceMin; v <= niceMax + step * 0.01; v += step) {
    ticks.push(Math.round(v));
  }
  return { min: niceMin, max: niceMax, ticks };
}

function withAlpha(color: string, alpha: number): string {
  const trimmed = color.trim();
  if (trimmed.startsWith('#')) {
    const hex = trimmed.slice(1);
    const full =
      hex.length === 3
        ? hex
            .split('')
            .map((c) => c + c)
            .join('')
        : hex;
    if (full.length === 6) {
      const r = parseInt(full.slice(0, 2), 16);
      const g = parseInt(full.slice(2, 4), 16);
      const b = parseInt(full.slice(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
  }
  const rgbMatch = trimmed.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgbMatch) {
    return `rgba(${rgbMatch[1]}, ${rgbMatch[2]}, ${rgbMatch[3]}, ${alpha})`;
  }
  return trimmed;
}

/**
 * Fritsch–Carlson Monotone Cubic Hermite Spline:
 * Smooth ECharts-style curve interpolation that never overshoots local extrema (e.g. 0ms stays >= 0ms).
 */
function traceMonotoneSpline(
  ctx: CanvasRenderingContext2D,
  pts: PlotPoint[],
  moveFirst = true
): void {
  const n = pts.length;
  if (n === 0) return;

  if (moveFirst) {
    ctx.moveTo(pts[0].x, pts[0].y);
  } else {
    ctx.lineTo(pts[0].x, pts[0].y);
  }

  if (n === 1) return;
  if (n === 2) {
    ctx.lineTo(pts[1].x, pts[1].y);
    return;
  }

  const deltas = new Array<number>(n - 1);
  const slopes = new Array<number>(n);

  for (let i = 0; i < n - 1; i++) {
    const dx = Math.max(1e-5, pts[i + 1].x - pts[i].x);
    deltas[i] = (pts[i + 1].y - pts[i].y) / dx;
  }

  slopes[0] = deltas[0];
  slopes[n - 1] = deltas[n - 2];

  for (let i = 1; i < n - 1; i++) {
    if (deltas[i - 1] * deltas[i] <= 0) {
      slopes[i] = 0;
    } else {
      slopes[i] = (deltas[i - 1] + deltas[i]) * 0.5;
    }
  }

  for (let i = 0; i < n - 1; i++) {
    const d = deltas[i];
    if (Math.abs(d) < 1e-9) {
      slopes[i] = 0;
      slopes[i + 1] = 0;
    } else {
      const a = slopes[i] / d;
      const b = slopes[i + 1] / d;
      const h = a * a + b * b;
      if (h > 9) {
        const tau = 3 / Math.sqrt(h);
        slopes[i] = tau * a * d;
        slopes[i + 1] = tau * b * d;
      }
    }
  }

  for (let i = 0; i < n - 1; i++) {
    const dx3 = (pts[i + 1].x - pts[i].x) / 3;
    ctx.bezierCurveTo(
      pts[i].x + dx3,
      pts[i].y + slopes[i] * dx3,
      pts[i + 1].x - dx3,
      pts[i + 1].y - slopes[i + 1] * dx3,
      pts[i + 1].x,
      pts[i + 1].y
    );
  }
}

function usePlotObserver(containerRef: React.RefObject<HTMLDivElement | null>): PlotLayout {
  const [layout, setLayout] = useState<PlotLayout>({ width: 0, height: 0, themeRev: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      const w = Math.round(rect.width);
      const h = Math.round(rect.height);
      setLayout((prev) => (prev.width === w && prev.height === h ? prev : { ...prev, width: w, height: h }));
    });
    ro.observe(el);

    const mo = new MutationObserver(() => {
      setLayout((prev) => ({ ...prev, themeRev: prev.themeRev + 1 }));
    });
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'style', 'class'],
    });

    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, [containerRef]);

  return layout;
}

const PAD_LEFT = 46;
const PAD_RIGHT = 14;
const PAD_TOP = 14;
const PAD_BOTTOM = 24;

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
    const [focusTaskId, setFocusTaskId] = useState<number | null>(null);
    const [hoverIdx, setHoverIdx] = useState<number | null>(null);

    const wellRef = useRef<HTMLDivElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const tooltipRef = useRef<HTMLDivElement | null>(null);
    const pointerRef = useRef<PointerSnapshot>({ x: 0, y: 0, wellW: 0, wellH: 0 });
    const rafRef = useRef<number | null>(null);
    const layout = usePlotObserver(wellRef);

    useEffect(() => {
      return () => {
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      };
    }, []);

    const activeSeries = useMemo(
      () => seriesList.filter((s) => !hiddenIds.has(s.taskId)),
      [seriesList, hiddenIds]
    );

    const rawTimelineCount = useMemo(
      () => seriesList.reduce((m, s) => Math.max(m, s.points.length), 0),
      [seriesList]
    );

    const plotW = Math.max(10, layout.width - PAD_LEFT - PAD_RIGHT);
    const plotH = Math.max(10, layout.height - PAD_TOP - PAD_BOTTOM);

    // Cap sample density to ~3.2px spacing so curves remain silky smooth even on 24h/72h windows
    const sampleCount = useMemo(() => {
      if (rawTimelineCount <= 0) return 0;
      const cap = layout.width > 0 ? Math.max(96, Math.floor(plotW / 3.2)) : 240;
      return Math.min(rawTimelineCount, cap);
    }, [rawTimelineCount, layout.width, plotW]);

    const chartModel = useMemo(() => {
      let minRaw = Infinity;
      let maxRaw = -Infinity;
      let spikeCount = 0;

      for (const s of activeSeries) {
        for (const p of s.points) {
          if (p.wasShaved) spikeCount += 1;
          const v = cutPeak ? p.shavedMs : p.rawMs;
          if (v !== null) {
            if (v < minRaw) minRaw = v;
            if (v > maxRaw) maxRaw = v;
          }
        }
      }

      const axis =
        minRaw <= maxRaw
          ? computeNiceAxis(minRaw, maxRaw)
          : { min: 0, max: 100, ticks: [0, 25, 50, 75, 100] };

      const refSeries = seriesList.find((s) => s.points.length > 0) || null;
      const tickCount = layout.width > 0 && layout.width < 460 ? 4 : 5;
      const xTicks =
        refSeries && sampleCount > 0
          ? Array.from({ length: tickCount }, (_, idx) => {
              const p = idx / Math.max(1, tickCount - 1);
              const sIdx = Math.min(
                sampleCount - 1,
                Math.round(p * Math.max(0, sampleCount - 1))
              );
              const pt = pickSample(refSeries.points, sIdx, sampleCount);
              return {
                p,
                label: formatAxisTime(pt?.ts ?? 0, hours),
              };
            })
          : [];

      return {
        minVal: axis.min,
        maxVal: axis.max,
        yTicks: axis.ticks,
        shavedSpikeCount: spikeCount,
        refSeries,
        xTicks,
      };
    }, [activeSeries, cutPeak, seriesList, sampleCount, hours, layout.width]);

    const safeHoverIdx =
      hoverIdx !== null && sampleCount > 0 ? Math.min(hoverIdx, sampleCount - 1) : null;

    // High-DPI Retina Canvas Renderer
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas || layout.width <= 0 || layout.height <= 0 || sampleCount <= 0) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const targetW = Math.round(layout.width * dpr);
      const targetH = Math.round(layout.height * dpr);
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, layout.width, layout.height);

      const styles = getComputedStyle(canvas);
      const gridColor = styles.getPropertyValue('--chart-grid').trim() || 'rgba(148, 163, 184, 0.12)';
      const axisColor = styles.getPropertyValue('--chart-axis').trim() || '#8b9bb0';
      const bgCanvas = styles.getPropertyValue('--bg-canvas').trim() || '#090d16';
      const fontMono =
        styles.getPropertyValue('--font-mono').trim() ||
        'ui-monospace, "JetBrains Mono", SFMono-Regular, Menlo, monospace';

      const span = Math.max(1, chartModel.maxVal - chartModel.minVal);
      const yFor = (v: number) =>
        PAD_TOP + plotH - ((v - chartModel.minVal) / span) * plotH;
      const xFor = (i: number) =>
        PAD_LEFT + (i / Math.max(1, sampleCount - 1)) * plotW;

      // 1. Horizontal Gridlines & Crisp Y-Axis Labels
      ctx.font = `11px ${fontMono}`;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'right';

      for (let i = 0; i < chartModel.yTicks.length; i++) {
        const val = chartModel.yTicks[i];
        const y = Math.round(yFor(val)) + 0.5;

        ctx.beginPath();
        ctx.strokeStyle = gridColor;
        ctx.lineWidth = 1;
        if (i === 0) {
          ctx.setLineDash([]);
        } else {
          ctx.setLineDash([3, 4]);
        }
        ctx.moveTo(PAD_LEFT, y);
        ctx.lineTo(PAD_LEFT + plotW, y);
        ctx.stroke();

        ctx.fillStyle = axisColor;
        ctx.fillText(`${val}`, PAD_LEFT - 8, y);
      }
      ctx.setLineDash([]);

      // 2. X-Axis Time Labels
      ctx.textBaseline = 'bottom';
      for (const tick of chartModel.xTicks) {
        const x = PAD_LEFT + tick.p * plotW;
        ctx.textAlign = tick.p === 0 ? 'left' : tick.p === 1 ? 'right' : 'center';
        ctx.fillStyle = axisColor;
        ctx.fillText(tick.label, x, layout.height - 3);
      }

      // 3. Multi-Series Smooth Monotone Cubic Splines (Spotlight-aware)
      const hasFocusedActive =
        focusTaskId !== null && activeSeries.some((s) => s.taskId === focusTaskId);

      const orderedSeries = hasFocusedActive
        ? [
            ...activeSeries.filter((s) => s.taskId !== focusTaskId),
            ...activeSeries.filter((s) => s.taskId === focusTaskId),
          ]
        : activeSeries;

      ctx.save();
      ctx.beginPath();
      ctx.rect(PAD_LEFT - 1, PAD_TOP - 3, plotW + 2, plotH + 6);
      ctx.clip();

      for (const s of orderedSeries) {
        const isFocused = hasFocusedActive && s.taskId === focusTaskId;
        const isDimmed = hasFocusedActive && s.taskId !== focusTaskId;

        const segments: PlotPoint[][] = [];
        let currentSeg: PlotPoint[] = [];

        for (let i = 0; i < sampleCount; i++) {
          const pt = pickSample(s.points, i, sampleCount);
          const val = pt ? (cutPeak ? pt.shavedMs : pt.rawMs) : null;
          if (val === null) {
            if (currentSeg.length > 0) {
              segments.push(currentSeg);
              currentSeg = [];
            }
            continue;
          }
          currentSeg.push({ x: xFor(i), y: yFor(val) });
        }
        if (currentSeg.length > 0) {
          segments.push(currentSeg);
        }

        ctx.globalAlpha = isDimmed ? 0.14 : isFocused ? 1 : activeSeries.length > 6 ? 0.88 : 0.94;
        ctx.strokeStyle = s.color;
        ctx.fillStyle = s.color;
        ctx.lineWidth = isFocused ? 2.15 : isDimmed ? 1.05 : activeSeries.length === 1 ? 1.65 : 1.35;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (isFocused) {
          ctx.shadowColor = withAlpha(s.color, 0.45);
          ctx.shadowBlur = 6;
        }

        for (const seg of segments) {
          if (seg.length === 1) {
            ctx.beginPath();
            ctx.arc(seg[0].x, seg[0].y, isFocused ? 2.2 : 1.5, 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.beginPath();
            traceMonotoneSpline(ctx, seg, true);
            ctx.stroke();
          }
        }

        if (isFocused) {
          ctx.shadowBlur = 0;
        }
      }

      ctx.restore();
      ctx.globalAlpha = 1;

      // 4. Interactive Crosshair & Crisp Point Markers
      if (safeHoverIdx !== null) {
        const hx = Math.round(xFor(safeHoverIdx)) + 0.5;
        ctx.beginPath();
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = axisColor;
        ctx.lineWidth = 1;
        ctx.moveTo(hx, PAD_TOP);
        ctx.lineTo(hx, PAD_TOP + plotH);
        ctx.stroke();
        ctx.setLineDash([]);

        for (const s of orderedSeries) {
          const pt = pickSample(s.points, safeHoverIdx, sampleCount);
          const val = pt ? (cutPeak ? pt.shavedMs : pt.rawMs) : null;
          if (val === null) continue;
          const hy = yFor(val);
          ctx.beginPath();
          ctx.arc(hx, hy, 3.1, 0, Math.PI * 2);
          ctx.fillStyle = s.color;
          ctx.fill();
          ctx.lineWidth = 1.4;
          ctx.strokeStyle = bgCanvas;
          ctx.stroke();
        }
      }
    }, [
      layout,
      sampleCount,
      plotW,
      plotH,
      chartModel,
      activeSeries,
      cutPeak,
      focusTaskId,
      safeHoverIdx,
    ]);

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

    const handlePointerMove = useCallback(
      (clientX: number, clientY: number, canvasEl: HTMLCanvasElement) => {
        if (sampleCount <= 0) return;
        const canvasRect = canvasEl.getBoundingClientRect();
        const wellRect = wellRef.current?.getBoundingClientRect() || canvasRect;
        if (canvasRect.width <= 0) return;

        pointerRef.current = {
          x: clientX - wellRect.left,
          y: clientY - wellRect.top,
          wellW: wellRect.width,
          wellH: wellRect.height,
        };

        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
          const localX = clientX - canvasRect.left;
          const usableW = Math.max(10, canvasRect.width - PAD_LEFT - PAD_RIGHT);
          const clamped = Math.max(0, Math.min(usableW, localX - PAD_LEFT));
          const idx = Math.round((clamped / usableW) * Math.max(1, sampleCount - 1));
          const bounded = Math.max(0, Math.min(sampleCount - 1, idx));
          setHoverIdx((prev) => (prev === bounded ? prev : bounded));
          applyFloatingTooltip(tooltipRef.current, pointerRef.current);
        });
      },
      [sampleCount]
    );

    const rangeLabel = hours >= 24 ? `${hours / 24} 天` : `${hours} 小时`;
    const hoveredTs =
      safeHoverIdx !== null && chartModel.refSeries
        ? pickSample(chartModel.refSeries.points, safeHoverIdx, sampleCount)?.ts ?? 0
        : 0;
    const useTwoColTooltip = activeSeries.length > 6 && layout.width >= 520;

    useLayoutEffect(() => {
      if (safeHoverIdx !== null) {
        applyFloatingTooltip(tooltipRef.current, pointerRef.current);
      }
    }, [safeHoverIdx, activeSeries.length, cutPeak, useTwoColTooltip]);

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
              {cutPeak && chartModel.shavedSpikeCount > 0 && (
                <span style={{ opacity: 0.78, fontSize: 10.5 }}>
                  ({chartModel.shavedSpikeCount})
                </span>
              )}
            </button>

            {seriesList.length > 1 && (
              <>
                <button
                  type="button"
                  className={`glass-icon-btn ${hiddenIds.size === 0 ? '' : 'active-toggle'}`}
                  onClick={() => setHiddenIds(new Set())}
                >
                  全显
                </button>
                <button
                  type="button"
                  className="glass-icon-btn"
                  onClick={() => {
                    const nonLossy = new Set(
                      seriesList.filter((s) => s.lossPct <= 0).map((s) => s.taskId)
                    );
                    if (
                      nonLossy.size === seriesList.length ||
                      (hiddenIds.size === nonLossy.size &&
                        Array.from(nonLossy).every((id) => hiddenIds.has(id)))
                    ) {
                      setHiddenIds(new Set());
                    } else {
                      setHiddenIds(nonLossy);
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
              const isSolo =
                seriesList.length > 1 &&
                !isHidden &&
                hiddenIds.size === seriesList.length - 1;
              const lossTone =
                s.lossPct >= 5
                  ? 'var(--accent-coral)'
                  : s.lossPct > 0
                  ? 'var(--accent-amber)'
                  : 'var(--text-muted)';

              return (
                <div
                  key={s.taskId}
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleTask(s.taskId)}
                  onMouseEnter={() => setFocusTaskId(s.taskId)}
                  onMouseLeave={() =>
                    setFocusTaskId((prev) => (prev === s.taskId ? null : prev))
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggleTask(s.taskId);
                    }
                  }}
                  className={`probe-chip-card ${isHidden ? 'inactive' : ''} ${
                    focusTaskId === s.taskId && !isHidden ? 'focused' : ''
                  }`}
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
                        gap: 7,
                        minWidth: 0,
                        fontWeight: 600,
                        fontSize: 12,
                        color: 'var(--text-primary)',
                      }}
                    >
                      <span
                        style={{
                          width: 3.5,
                          height: 12,
                          borderRadius: 2,
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
                          padding: '1px 6px',
                          borderRadius: 4,
                          backgroundColor: isSolo
                            ? 'var(--accent-pill-bg)'
                            : 'var(--glass-well-hover)',
                          color: isSolo ? 'var(--accent-pill-text)' : 'var(--text-muted)',
                          flexShrink: 0,
                        }}
                      >
                        {isSolo ? '恢复' : '单看'}
                      </span>
                    )}
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      justifyContent: 'space-between',
                      gap: 6,
                      marginTop: 5,
                      fontSize: 11,
                    }}
                  >
                    <span>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                        {s.latestMs !== null ? `${s.latestMs}ms` : '--'}
                      </span>
                      <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>
                        均 {s.avgMs ?? '--'}
                      </span>
                    </span>
                    <span
                      style={{
                        color: lossTone,
                        fontWeight: s.lossPct > 0 ? 600 : 400,
                      }}
                    >
                      丢包 {s.lossPct.toFixed(1)}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="chart-canvas-well" ref={wellRef}>
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
          ) : seriesList.length === 0 || sampleCount === 0 ? (
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
              <canvas
                ref={canvasRef}
                style={{ width: '100%', height: '100%', display: 'block' }}
                onMouseMove={(e) => {
                  handlePointerMove(e.clientX, e.clientY, e.currentTarget);
                }}
                onMouseLeave={() => setHoverIdx(null)}
                onTouchStart={(e) => {
                  if (e.touches[0]) {
                    handlePointerMove(e.touches[0].clientX, e.touches[0].clientY, e.currentTarget);
                  }
                }}
                onTouchMove={(e) => {
                  if (e.touches[0]) {
                    handlePointerMove(e.touches[0].clientX, e.touches[0].clientY, e.currentTarget);
                  }
                }}
                onTouchEnd={() => setHoverIdx(null)}
              />

              {safeHoverIdx !== null && activeSeries.length > 0 && (
                <div
                  ref={tooltipRef}
                  className="mono"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    willChange: 'transform',
                    maxWidth: useTwoColTooltip
                      ? 'min(360px, calc(100% - 16px))'
                      : 'min(220px, calc(100% - 16px))',
                    maxHeight: 'calc(100% - 16px)',
                    overflowY: 'auto',
                    padding: '8px 11px',
                    borderRadius: 10,
                    backgroundColor: 'var(--glass-popover-bg)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    border: '1px solid var(--glass-border-hover)',
                    fontSize: 11,
                    pointerEvents: 'none',
                    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.24)',
                    zIndex: 10,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 10,
                      color: 'var(--text-muted)',
                      paddingBottom: 5,
                      marginBottom: 5,
                      borderBottom: '1px solid var(--glass-divider)',
                      fontSize: 10.5,
                    }}
                  >
                    <span>{formatTooltipTime(hoveredTs)}</span>
                    {cutPeak && <span>削峰</span>}
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: useTwoColTooltip
                        ? 'repeat(2, minmax(128px, 1fr))'
                        : 'minmax(145px, 1fr)',
                      columnGap: 14,
                      rowGap: 3.5,
                    }}
                  >
                    {activeSeries.map((s) => {
                      const pt = pickSample(s.points, safeHoverIdx, sampleCount);
                      if (!pt) return null;
                      const val = cutPeak ? pt.shavedMs : pt.rawMs;
                      return (
                        <div
                          key={s.taskId}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 8,
                            minWidth: 0,
                            lineHeight: 1.4,
                          }}
                        >
                          <span
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 5,
                              minWidth: 0,
                              color: 'var(--text-secondary)',
                            }}
                          >
                            <span
                              style={{
                                width: 6,
                                height: 6,
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
                            >
                              {s.taskName}
                            </span>
                          </span>
                          <span
                            style={{
                              flexShrink: 0,
                              fontWeight: 600,
                              color: pt.lost ? 'var(--accent-coral)' : 'var(--text-primary)',
                            }}
                          >
                            {pt.lost ? (
                              '丢包'
                            ) : cutPeak && pt.wasShaved && pt.rawMs !== null ? (
                              <>
                                {val}ms
                                <span
                                  style={{
                                    color: 'var(--text-muted)',
                                    fontWeight: 400,
                                    fontSize: 10,
                                  }}
                                >
                                  ({pt.rawMs})
                                </span>
                              </>
                            ) : (
                              `${val ?? '--'}ms`
                            )}
                          </span>
                        </div>
                      );
                    })}
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
MultiTargetPingChart.displayName = 'MultiTargetPingChart';

interface NetworkLoadChartProps {
  records: KomariLoadRecord[];
  hours: number;
  loading: boolean;
}

export const NetworkLoadChart: React.FC<NetworkLoadChartProps> = memo(
  ({ records, hours, loading }) => {
    const [hoverIdx, setHoverIdx] = useState<number | null>(null);
    const wellRef = useRef<HTMLDivElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const tooltipRef = useRef<HTMLDivElement | null>(null);
    const pointerRef = useRef<PointerSnapshot>({ x: 0, y: 0, wellW: 0, wellH: 0 });
    const rafRef = useRef<number | null>(null);
    const layout = usePlotObserver(wellRef);

    useEffect(() => {
      return () => {
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      };
    }, []);

    const plotW = Math.max(10, layout.width - PAD_LEFT - PAD_RIGHT);
    const plotH = Math.max(10, layout.height - PAD_TOP - PAD_BOTTOM);

    const chartData = useMemo(() => {
      const sorted = [...records].sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
      const fullSeries = sorted.map((r) => {
        const ramPct = r.ram_total > 0 ? (r.ram / r.ram_total) * 100 : 0;
        return {
          ts: Date.parse(r.time) || 0,
          rxMbps: bytesPerSecToMbps(r.net_in),
          txMbps: bytesPerSecToMbps(r.net_out),
          cpuPct: Math.min(100, Math.max(0, r.cpu || 0)),
          ramPct: Math.min(100, Math.max(0, ramPct)),
        };
      });

      const cap = layout.width > 0 ? Math.max(96, Math.floor(plotW / 3.2)) : 240;
      const series =
        fullSeries.length <= cap
          ? fullSeries
          : Array.from({ length: cap }, (_, i) => {
              const idx = Math.min(
                fullSeries.length - 1,
                Math.round((i / Math.max(1, cap - 1)) * (fullSeries.length - 1))
              );
              return fullSeries[idx];
            });

      const peakRx = fullSeries.length > 0 ? Math.max(...fullSeries.map((s) => s.rxMbps)) : 0;
      const peakTx = fullSeries.length > 0 ? Math.max(...fullSeries.map((s) => s.txMbps)) : 0;
      const axis = computeNiceAxis(0, Math.max(peakRx, peakTx, 8));

      const avgCpu =
        fullSeries.length > 0
          ? fullSeries.reduce((acc, s) => acc + s.cpuPct, 0) / fullSeries.length
          : 0;
      const avgRam =
        fullSeries.length > 0
          ? fullSeries.reduce((acc, s) => acc + s.ramPct, 0) / fullSeries.length
          : 0;

      const tickCount = layout.width > 0 && layout.width < 460 ? 4 : 5;
      const xTicks =
        series.length > 0
          ? Array.from({ length: tickCount }, (_, idx) => {
              const p = idx / Math.max(1, tickCount - 1);
              const sIdx = Math.min(
                series.length - 1,
                Math.round(p * Math.max(0, series.length - 1))
              );
              return {
                p,
                label: formatAxisTime(series[sIdx]?.ts ?? 0, hours),
              };
            })
          : [];

      return {
        series,
        maxMbps: axis.max,
        yTicks: axis.ticks,
        peakRx,
        peakTx,
        avgCpu,
        avgRam,
        xTicks,
      };
    }, [records, hours, layout.width, plotW]);

    const safeHoverIdx =
      hoverIdx !== null && chartData.series.length > 0
        ? Math.min(hoverIdx, chartData.series.length - 1)
        : null;

    // High-DPI Retina Canvas Renderer for Network & CPU Load
    useEffect(() => {
      const canvas = canvasRef.current;
      const len = chartData.series.length;
      if (!canvas || layout.width <= 0 || layout.height <= 0 || len === 0) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const targetW = Math.round(layout.width * dpr);
      const targetH = Math.round(layout.height * dpr);
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, layout.width, layout.height);

      const styles = getComputedStyle(canvas);
      const gridColor = styles.getPropertyValue('--chart-grid').trim() || 'rgba(148, 163, 184, 0.12)';
      const axisColor = styles.getPropertyValue('--chart-axis').trim() || '#8b9bb0';
      const bgCanvas = styles.getPropertyValue('--bg-canvas').trim() || '#090d16';
      const cyanColor = styles.getPropertyValue('--accent-cyan').trim() || '#0ea5e9';
      const emeraldColor = styles.getPropertyValue('--accent-emerald').trim() || '#10b981';
      const amberColor = styles.getPropertyValue('--accent-amber').trim() || '#f59e0b';
      const fontMono =
        styles.getPropertyValue('--font-mono').trim() ||
        'ui-monospace, "JetBrains Mono", SFMono-Regular, Menlo, monospace';

      const maxY = Math.max(1, chartData.maxMbps);
      const xFor = (i: number) => PAD_LEFT + (i / Math.max(1, len - 1)) * plotW;
      const yForMbps = (v: number) => PAD_TOP + plotH - (Math.min(maxY, v) / maxY) * plotH;
      const yForPct = (v: number) => PAD_TOP + plotH - (Math.min(100, v) / 100) * plotH;

      // 1. Gridlines & Y-Axis Labels
      ctx.font = `11px ${fontMono}`;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'right';

      for (let i = 0; i < chartData.yTicks.length; i++) {
        const val = chartData.yTicks[i];
        const y = Math.round(yForMbps(val)) + 0.5;
        ctx.beginPath();
        ctx.strokeStyle = gridColor;
        ctx.lineWidth = 1;
        if (i === 0) ctx.setLineDash([]);
        else ctx.setLineDash([3, 4]);
        ctx.moveTo(PAD_LEFT, y);
        ctx.lineTo(PAD_LEFT + plotW, y);
        ctx.stroke();

        ctx.fillStyle = axisColor;
        ctx.fillText(`${val}M`, PAD_LEFT - 8, y);
      }
      ctx.setLineDash([]);

      // 2. X-Axis Labels
      ctx.textBaseline = 'bottom';
      for (const tick of chartData.xTicks) {
        const x = PAD_LEFT + tick.p * plotW;
        ctx.textAlign = tick.p === 0 ? 'left' : tick.p === 1 ? 'right' : 'center';
        ctx.fillStyle = axisColor;
        ctx.fillText(tick.label, x, layout.height - 3);
      }

      // 3. Smooth Area + Spline Series
      const rxPts: PlotPoint[] = chartData.series.map((s, i) => ({
        x: xFor(i),
        y: yForMbps(s.rxMbps),
      }));
      const txPts: PlotPoint[] = chartData.series.map((s, i) => ({
        x: xFor(i),
        y: yForMbps(s.txMbps),
      }));
      const cpuPts: PlotPoint[] = chartData.series.map((s, i) => ({
        x: xFor(i),
        y: yForPct(s.cpuPct),
      }));

      ctx.save();
      ctx.beginPath();
      ctx.rect(PAD_LEFT - 1, PAD_TOP - 3, plotW + 2, plotH + 6);
      ctx.clip();

      const drawAreaAndLine = (pts: PlotPoint[], color: string, topAlpha: number, lw: number) => {
        if (pts.length === 0) return;
        if (pts.length >= 2) {
          const grad = ctx.createLinearGradient(0, PAD_TOP, 0, PAD_TOP + plotH);
          grad.addColorStop(0, withAlpha(color, topAlpha));
          grad.addColorStop(1, withAlpha(color, 0));

          ctx.beginPath();
          ctx.moveTo(pts[0].x, PAD_TOP + plotH);
          traceMonotoneSpline(ctx, pts, false);
          ctx.lineTo(pts[pts.length - 1].x, PAD_TOP + plotH);
          ctx.closePath();
          ctx.fillStyle = grad;
          ctx.fill();
        }

        ctx.beginPath();
        traceMonotoneSpline(ctx, pts, true);
        ctx.strokeStyle = color;
        ctx.lineWidth = lw;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
      };

      drawAreaAndLine(rxPts, cyanColor, 0.16, 1.5);
      drawAreaAndLine(txPts, emeraldColor, 0.12, 1.4);

      if (cpuPts.length >= 2) {
        ctx.beginPath();
        ctx.setLineDash([4, 3]);
        traceMonotoneSpline(ctx, cpuPts, true);
        ctx.strokeStyle = amberColor;
        ctx.lineWidth = 1.25;
        ctx.stroke();
        ctx.setLineDash([]);
      }

      ctx.restore();

      // 4. Hover Crosshair & Dots
      if (safeHoverIdx !== null) {
        const hx = Math.round(xFor(safeHoverIdx)) + 0.5;
        ctx.beginPath();
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = axisColor;
        ctx.lineWidth = 1;
        ctx.moveTo(hx, PAD_TOP);
        ctx.lineTo(hx, PAD_TOP + plotH);
        ctx.stroke();
        ctx.setLineDash([]);

        const markers = [
          { y: rxPts[safeHoverIdx]?.y, color: cyanColor },
          { y: txPts[safeHoverIdx]?.y, color: emeraldColor },
          { y: cpuPts[safeHoverIdx]?.y, color: amberColor },
        ];
        for (const m of markers) {
          if (m.y === undefined) continue;
          ctx.beginPath();
          ctx.arc(hx, m.y, 3.1, 0, Math.PI * 2);
          ctx.fillStyle = m.color;
          ctx.fill();
          ctx.lineWidth = 1.4;
          ctx.strokeStyle = bgCanvas;
          ctx.stroke();
        }
      }
    }, [layout, plotW, plotH, chartData, safeHoverIdx]);

    const handlePointerMove = useCallback(
      (clientX: number, clientY: number, canvasEl: HTMLCanvasElement) => {
        const len = chartData.series.length;
        if (len <= 0) return;
        const canvasRect = canvasEl.getBoundingClientRect();
        const wellRect = wellRef.current?.getBoundingClientRect() || canvasRect;
        if (canvasRect.width <= 0) return;

        pointerRef.current = {
          x: clientX - wellRect.left,
          y: clientY - wellRect.top,
          wellW: wellRect.width,
          wellH: wellRect.height,
        };

        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
          const localX = clientX - canvasRect.left;
          const usableW = Math.max(10, canvasRect.width - PAD_LEFT - PAD_RIGHT);
          const clamped = Math.max(0, Math.min(usableW, localX - PAD_LEFT));
          const idx = Math.round((clamped / usableW) * Math.max(1, len - 1));
          const bounded = Math.max(0, Math.min(len - 1, idx));
          setHoverIdx((prev) => (prev === bounded ? prev : bounded));
          applyFloatingTooltip(tooltipRef.current, pointerRef.current);
        });
      },
      [chartData.series.length]
    );

    const rangeLabel = hours >= 24 ? `${hours / 24} 天` : `${hours} 小时`;
    const hovered = safeHoverIdx !== null ? chartData.series[safeHoverIdx] : null;

    useLayoutEffect(() => {
      if (safeHoverIdx !== null) {
        applyFloatingTooltip(tooltipRef.current, pointerRef.current);
      }
    }, [safeHoverIdx]);

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
            style={{ display: 'flex', gap: 12, fontSize: 11.5, flexWrap: 'wrap' }}
            className="mono"
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--text-secondary)' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: 'var(--accent-cyan)' }} />
              下行 RX
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--text-secondary)' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: 'var(--accent-emerald)' }} />
              上行 TX
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--text-secondary)' }}>
              <span style={{ width: 9, height: 2, backgroundColor: 'var(--accent-amber)', borderRadius: 1 }} />
              CPU%
            </span>
          </div>
        </div>

        <div className="chart-stats-row mono">
          <div className="carrier-cell">
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>峰值下行</div>
            <div style={{ fontSize: 14, fontWeight: 600, marginTop: 3 }}>
              {chartData.peakRx.toFixed(1)}{' '}
              <span style={{ fontSize: 10.5, fontWeight: 400, color: 'var(--text-muted)' }}>Mbps</span>
            </div>
          </div>
          <div className="carrier-cell">
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>峰值上行</div>
            <div style={{ fontSize: 14, fontWeight: 600, marginTop: 3 }}>
              {chartData.peakTx.toFixed(1)}{' '}
              <span style={{ fontSize: 10.5, fontWeight: 400, color: 'var(--text-muted)' }}>Mbps</span>
            </div>
          </div>
          <div className="carrier-cell">
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>CPU / 内存均值</div>
            <div style={{ fontSize: 14, fontWeight: 600, marginTop: 3 }}>
              {chartData.avgCpu.toFixed(0)}% / {chartData.avgRam.toFixed(0)}%
            </div>
          </div>
        </div>

        <div className="chart-canvas-well" style={{ height: 250 }} ref={wellRef}>
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
              <canvas
                ref={canvasRef}
                style={{ width: '100%', height: '100%', display: 'block' }}
                onMouseMove={(e) => {
                  handlePointerMove(e.clientX, e.clientY, e.currentTarget);
                }}
                onMouseLeave={() => setHoverIdx(null)}
                onTouchStart={(e) => {
                  if (e.touches[0]) {
                    handlePointerMove(e.touches[0].clientX, e.touches[0].clientY, e.currentTarget);
                  }
                }}
                onTouchMove={(e) => {
                  if (e.touches[0]) {
                    handlePointerMove(e.touches[0].clientX, e.touches[0].clientY, e.currentTarget);
                  }
                }}
                onTouchEnd={() => setHoverIdx(null)}
              />

              {hovered && safeHoverIdx !== null && (
                <div
                  ref={tooltipRef}
                  className="mono"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    willChange: 'transform',
                    minWidth: 175,
                    padding: '8px 11px',
                    borderRadius: 10,
                    backgroundColor: 'var(--glass-popover-bg)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    border: '1px solid var(--glass-border-hover)',
                    fontSize: 11,
                    pointerEvents: 'none',
                    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.24)',
                    zIndex: 10,
                  }}
                >
                  <div
                    style={{
                      color: 'var(--text-muted)',
                      paddingBottom: 5,
                      marginBottom: 5,
                      borderBottom: '1px solid var(--glass-divider)',
                      fontSize: 10.5,
                    }}
                  >
                    {formatTooltipTime(hovered.ts)}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, lineHeight: 1.5 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>● 下行 RX</span>
                    <span style={{ fontWeight: 600, color: 'var(--accent-cyan)' }}>
                      {hovered.rxMbps.toFixed(2)} Mbps
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, lineHeight: 1.5 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>● 上行 TX</span>
                    <span style={{ fontWeight: 600, color: 'var(--accent-emerald)' }}>
                      {hovered.txMbps.toFixed(2)} Mbps
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, lineHeight: 1.5 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>┈ CPU / 内存</span>
                    <span style={{ fontWeight: 600, color: 'var(--accent-amber)' }}>
                      {hovered.cpuPct.toFixed(1)}% / {hovered.ramPct.toFixed(1)}%
                    </span>
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
