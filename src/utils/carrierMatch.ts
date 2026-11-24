import type {
  CarrierKey,
  CarrierMetric,
  KomariPingBasicInfo,
  KomariPingRecord,
  KomariPingTask,
  NodeCarrierTrio,
  PingTaskPoint,
  PingTaskSeries,
  ThemeSettings,
} from '../types/komari';

const DEFAULT_KEYWORDS: Record<CarrierKey, string[]> = {
  ct: ['电信', 'ct', 'telecom', 'cn2', '163', 'ctg', 'chinatelecom'],
  cu: ['联通', 'cu', 'unicom', '9929', '4837', 'cug', 'chinaunicom'],
  cm: ['移动', 'cm', 'mobile', 'cmcc', 'cmi', 'cmin2', 'chinamobile'],
};

const CARRIER_LABELS: Record<CarrierKey, string> = {
  ct: '电信',
  cu: '联通',
  cm: '移动',
};

// Curated Sci-Fi Luminous Palette for Multi-Target Ping Lines (Zero Purple!)
const PROBE_PALETTE = [
  '#38bdf8', // Sky Cyan
  '#fbbf24', // Solar Amber
  '#34d399', // Mint Emerald
  '#22d3ee', // Ice Cyan
  '#fb7185', // Coral Rose
  '#a3e635', // Cyber Lime
  '#f97316', // Signal Orange
  '#2dd4bf', // Bioluminescent Teal
  '#60a5fa', // Cobalt Blue
  '#facc15', // Warm Gold
  '#4ade80', // Phosphor Green
  '#94a3b8', // Titanium Silver
];

export function parseTaskIdsConfig(val: unknown): number[] {
  if (!val) return [];
  if (Array.isArray(val)) {
    return val.map((v) => Number(v)).filter((n) => Number.isFinite(n) && n > 0);
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.map((v) => Number(v)).filter((n) => Number.isFinite(n) && n > 0);
        }
      } catch {
        // Fallback to CSV split below
      }
    }
    return trimmed
      .split(/[,，\s]+/)
      .map((s) => Number(s))
      .filter((n) => Number.isFinite(n) && n > 0);
  }
  return [];
}

function parseKeywords(raw: string | undefined, fallback: string[]): string[] {
  if (!raw || !raw.trim()) return fallback;
  const list = raw
    .split(/[,，]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return list.length > 0 ? list : fallback;
}

function selectCarrierTaskForNode(
  nodeUuid: string,
  carrier: CarrierKey,
  tasks: KomariPingTask[],
  recordsByTask: Map<number, KomariPingRecord[]>,
  settings: ThemeSettings
): KomariPingTask | null {
  const configuredIds = parseTaskIdsConfig(
    carrier === 'ct'
      ? settings.ct_ping_tasks
      : carrier === 'cu'
      ? settings.cu_ping_tasks
      : settings.cm_ping_tasks
  );

  if (configuredIds.length > 0) {
    for (const id of configuredIds) {
      if ((recordsByTask.get(id)?.length ?? 0) > 0) {
        return (
          tasks.find((t) => t.id === id) || {
            id,
            name: `${CARRIER_LABELS[carrier]} #${id}`,
          }
        );
      }
    }
    for (const id of configuredIds) {
      const task = tasks.find((t) => t.id === id);
      if (
        task &&
        (!task.clients || task.clients.length === 0 || task.clients.includes(nodeUuid))
      ) {
        return task;
      }
    }
    const firstId = configuredIds[0];
    return (
      tasks.find((t) => t.id === firstId) || {
        id: firstId,
        name: `${CARRIER_LABELS[carrier]} #${firstId}`,
      }
    );
  }

  const keywords = parseKeywords(
    carrier === 'ct'
      ? settings.ct_keywords
      : carrier === 'cu'
      ? settings.cu_keywords
      : settings.cm_keywords,
    DEFAULT_KEYWORDS[carrier]
  );

  const matchingTasks = tasks.filter((t) => {
    const lower = (t.name || '').toLowerCase();
    return keywords.some((kw) => lower.includes(kw));
  });

  for (const t of matchingTasks) {
    if ((recordsByTask.get(t.id)?.length ?? 0) > 0) return t;
  }
  for (const t of matchingTasks) {
    if (!t.clients || t.clients.length === 0 || t.clients.includes(nodeUuid)) return t;
  }

  return matchingTasks[0] || null;
}

/**
 * Main Dashboard Only: Extract designated Three-Carrier (CT / CU / CM) latency & packet loss
 */
export function buildNodeCarrierMetrics(
  nodeUuid: string,
  tasks: KomariPingTask[],
  records: KomariPingRecord[],
  basicInfos: KomariPingBasicInfo[],
  settings: ThemeSettings
): NodeCarrierTrio {
  const nodeRecords = records.filter((r) => !r.client || r.client === nodeUuid);
  const recordsByTask = new Map<number, KomariPingRecord[]>();

  for (const rec of nodeRecords) {
    const arr = recordsByTask.get(rec.task_id);
    if (arr) arr.push(rec);
    else recordsByTask.set(rec.task_id, [rec]);
  }

  const knownTasks = [...tasks];
  for (const bi of basicInfos) {
    if (bi.task_id && !knownTasks.some((t) => t.id === bi.task_id)) {
      knownTasks.push({ id: bi.task_id, name: bi.name || `Task #${bi.task_id}` });
    }
  }

  const buildSingle = (carrier: CarrierKey): CarrierMetric => {
    const task = selectCarrierTaskForNode(
      nodeUuid,
      carrier,
      knownTasks,
      recordsByTask,
      settings
    );
    if (!task) {
      return {
        key: carrier,
        label: CARRIER_LABELS[carrier],
        taskId: null,
        taskName: '未绑定任务',
        latestMs: null,
        avgMs: null,
        minMs: null,
        maxMs: null,
        lossPct: null,
        points: [],
      };
    }

    const rawList = [...(recordsByTask.get(task.id) || [])].sort(
      (a, b) => Date.parse(a.time) - Date.parse(b.time)
    );
    const bi = basicInfos.find(
      (b) => b.task_id === task.id && (!b.client || b.client === nodeUuid)
    );

    const points = rawList.map((r) => {
      const ts = Date.parse(r.time);
      const lost = r.value === null || r.value === undefined || r.value < 0;
      return {
        time: r.time,
        ts: Number.isNaN(ts) ? 0 : ts,
        ms: lost ? null : Math.round(r.value),
        lost,
      };
    });

    const validValues = points.map((p) => p.ms).filter((v): v is number => v !== null);
    const totalCount = points.length;
    const lostCount = points.filter((p) => p.lost).length;

    const latestMs =
      validValues.length > 0
        ? validValues[validValues.length - 1]
        : bi?.latest !== undefined && bi.latest >= 0
        ? Math.round(bi.latest)
        : null;

    const avgMs =
      validValues.length > 0
        ? Math.round(validValues.reduce((s, v) => s + v, 0) / validValues.length)
        : bi?.avg !== undefined && bi.avg >= 0
        ? Math.round(bi.avg)
        : latestMs;

    const minMs =
      validValues.length > 0
        ? Math.min(...validValues)
        : bi?.min !== undefined && bi.min >= 0
        ? Math.round(bi.min)
        : null;

    const maxMs =
      validValues.length > 0
        ? Math.max(...validValues)
        : bi?.max !== undefined && bi.max >= 0
        ? Math.round(bi.max)
        : null;

    const lossPct =
      totalCount > 0
        ? +((lostCount / totalCount) * 100).toFixed(1)
        : bi?.loss !== undefined
        ? +Number(bi.loss).toFixed(1)
        : null;

    return {
      key: carrier,
      label: CARRIER_LABELS[carrier],
      taskId: task.id,
      taskName: task.name,
      latestMs,
      avgMs,
      minMs,
      maxMs,
      lossPct,
      points,
    };
  };

  return {
    ct: buildSingle('ct'),
    cu: buildSingle('cu'),
    cm: buildSingle('cm'),
  };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/**
 * Peak Shaving (削峰 / 平滑):
 * Clips extreme transient RTT spikes via IQR + median envelope and applies gentle EWMA
 * across contiguous non-lost segments while 100% preserving real packet-loss events.
 */
function computeShavedPoints(
  rawPoints: Array<{ time: string; ts: number; rawMs: number | null; lost: boolean }>
): PingTaskPoint[] {
  const valid = rawPoints
    .map((p) => p.rawMs)
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b);

  if (valid.length < 4) {
    return rawPoints.map((p) => ({
      ...p,
      shavedMs: p.rawMs,
      wasShaved: false,
    }));
  }

  const p25 = percentile(valid, 0.25);
  const p50 = percentile(valid, 0.5);
  const p75 = percentile(valid, 0.75);
  const iqr = Math.max(p75 - p25, p50 * 0.12, 6);
  const upperCap = Math.max(p75 + 2.0 * iqr, p50 * 1.55);

  // Pass 1: Clamp extreme spikes toward local neighbor median / upperCap
  const clamped = rawPoints.map((pt, idx) => {
    if (pt.rawMs === null) {
      return { ...pt, clampedMs: null as number | null, shaved: false };
    }
    if (pt.rawMs <= upperCap) {
      return { ...pt, clampedMs: pt.rawMs, shaved: false };
    }
    // Compute local window median excluding spikes
    const neighbors: number[] = [];
    for (let k = Math.max(0, idx - 4); k <= Math.min(rawPoints.length - 1, idx + 4); k++) {
      const nv = rawPoints[k].rawMs;
      if (nv !== null && nv <= upperCap) neighbors.push(nv);
    }
    neighbors.sort((a, b) => a - b);
    const localBase = neighbors.length > 0 ? percentile(neighbors, 0.5) : p50;
    const capped = Math.min(upperCap, Math.round(localBase * 1.18 + iqr * 0.35));
    return { ...pt, clampedMs: capped, shaved: true };
  });

  // Pass 2: Gentle EWMA smoothing (alpha = 0.45) across contiguous valid segments
  const alpha = 0.45;
  let prevSmoothed: number | null = null;

  return clamped.map((pt) => {
    if (pt.clampedMs === null) {
      prevSmoothed = null;
      return {
        time: pt.time,
        ts: pt.ts,
        rawMs: null,
        shavedMs: null,
        wasShaved: false,
        lost: pt.lost,
      };
    }
    const smoothed: number =
      prevSmoothed === null
        ? pt.clampedMs
        : alpha * pt.clampedMs + (1 - alpha) * prevSmoothed;
    prevSmoothed = smoothed;
    return {
      time: pt.time,
      ts: pt.ts,
      rawMs: pt.rawMs,
      shavedMs: Math.round(smoothed),
      wasShaved: pt.shaved,
      lost: pt.lost,
    };
  });
}

/**
 * Sub-Page (NodeDetailView): Build ALL Ping latency check tasks configured for a node!
 */
export function buildAllNodePingSeries(
  nodeUuid: string,
  tasks: KomariPingTask[],
  records: KomariPingRecord[],
  basicInfos: KomariPingBasicInfo[]
): PingTaskSeries[] {
  const nodeRecords = records.filter((r) => !r.client || r.client === nodeUuid);
  const recordsByTask = new Map<number, KomariPingRecord[]>();

  for (const rec of nodeRecords) {
    const arr = recordsByTask.get(rec.task_id);
    if (arr) arr.push(rec);
    else recordsByTask.set(rec.task_id, [rec]);
  }

  // Gather all task definitions applicable to this node
  const taskMap = new Map<number, KomariPingTask>();
  for (const t of tasks) {
    const assignedToNode =
      !t.clients || t.clients.length === 0 || t.clients.includes(nodeUuid);
    if (assignedToNode || recordsByTask.has(t.id)) {
      taskMap.set(t.id, t);
    }
  }
  for (const bi of basicInfos) {
    if (bi.task_id && !taskMap.has(bi.task_id)) {
      taskMap.set(bi.task_id, {
        id: bi.task_id,
        name: bi.name || `探测目标 #${bi.task_id}`,
      });
    }
  }
  for (const taskId of recordsByTask.keys()) {
    if (!taskMap.has(taskId)) {
      taskMap.set(taskId, { id: taskId, name: `探测目标 #${taskId}` });
    }
  }

  const sortedTasks = Array.from(taskMap.values()).sort(
    (a, b) => (a.weight ?? 0) - (b.weight ?? 0) || a.id - b.id
  );

  return sortedTasks.map((task, idx) => {
    const rawList = [...(recordsByTask.get(task.id) || [])].sort(
      (a, b) => Date.parse(a.time) - Date.parse(b.time)
    );
    const bi = basicInfos.find(
      (b) => b.task_id === task.id && (!b.client || b.client === nodeUuid)
    );

    const rawPts = rawList.map((r) => {
      const ts = Date.parse(r.time);
      const lost = r.value === null || r.value === undefined || r.value < 0;
      return {
        time: r.time,
        ts: Number.isNaN(ts) ? 0 : ts,
        rawMs: lost ? null : Math.round(r.value),
        lost,
      };
    });

    const points = computeShavedPoints(rawPts);
    const validRaw = rawPts
      .map((p) => p.rawMs)
      .filter((v): v is number => v !== null);
    const sortedValid = [...validRaw].sort((a, b) => a - b);

    const totalCount = rawPts.length;
    const lostCount = rawPts.filter((p) => p.lost).length;

    const latestMs =
      validRaw.length > 0
        ? validRaw[validRaw.length - 1]
        : bi?.latest !== undefined && bi.latest >= 0
        ? Math.round(bi.latest)
        : null;

    const avgMs =
      validRaw.length > 0
        ? Math.round(validRaw.reduce((s, v) => s + v, 0) / validRaw.length)
        : bi?.avg !== undefined && bi.avg >= 0
        ? Math.round(bi.avg)
        : latestMs;

    const minMs =
      sortedValid.length > 0
        ? sortedValid[0]
        : bi?.min !== undefined && bi.min >= 0
        ? Math.round(bi.min)
        : null;

    const maxMs =
      sortedValid.length > 0
        ? sortedValid[sortedValid.length - 1]
        : bi?.max !== undefined && bi.max >= 0
        ? Math.round(bi.max)
        : null;

    const p95Ms =
      sortedValid.length > 0 ? Math.round(percentile(sortedValid, 0.95)) : null;

    const lossPct =
      totalCount > 0
        ? +((lostCount / totalCount) * 100).toFixed(1)
        : bi?.loss !== undefined
        ? +Number(bi.loss).toFixed(1)
        : 0;

    return {
      taskId: task.id,
      taskName: task.name,
      color: PROBE_PALETTE[idx % PROBE_PALETTE.length],
      latestMs,
      avgMs,
      minMs,
      maxMs,
      p95Ms,
      lossPct,
      totalCount,
      lostCount,
      points,
    };
  });
}
