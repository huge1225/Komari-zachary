import type {
  KomariClient,
  KomariLoadRecord,
  KomariPingBasicInfo,
  KomariPingRecord,
  KomariPingTask,
  LiveNodeTelemetry,
  PublicSiteInfo,
  ThemeSettings,
} from '../types/komari';
import {
  createDemoLiveMap,
  DEMO_CLIENTS,
  DEMO_PING_TASKS,
  DEMO_SITE_INFO,
  generateDemoLoadRecords,
  generateDemoPingRecords,
} from './mockData';

function unwrapData<T>(payload: unknown): T | null {
  if (!payload || typeof payload !== 'object') return null;
  const obj = payload as Record<string, unknown>;
  if ('status' in obj && obj.status === 'error') return null;
  if ('data' in obj) return obj.data as T;
  return payload as T;
}

export interface BootstrapResult {
  isDemo: boolean;
  siteInfo: PublicSiteInfo;
  clients: KomariClient[];
  pingTasks: KomariPingTask[];
}

export async function bootstrapKomariData(): Promise<BootstrapResult> {
  const urlParams = new URLSearchParams(window.location.search);
  const forceDemo = urlParams.get('demo') === '1';

  if (!forceDemo) {
    try {
      const [pubRes, nodesRes, tasksRes] = await Promise.all([
        fetch('/api/public', { headers: { Accept: 'application/json' } }),
        fetch('/api/nodes', { headers: { Accept: 'application/json' } }),
        fetch('/api/task/ping', { headers: { Accept: 'application/json' } }).catch(() => null),
      ]);

      const contentType = nodesRes.headers.get('content-type') || '';
      if (nodesRes.ok && contentType.includes('application/json')) {
        const nodesJson = await nodesRes.json();
        const rawClients = unwrapData<KomariClient[] | Record<string, KomariClient>>(nodesJson);
        const clientList: KomariClient[] = Array.isArray(rawClients)
          ? rawClients
          : rawClients && typeof rawClients === 'object'
          ? Object.values(rawClients)
          : [];

        let sitename = 'Komari Monitor';
        let description = 'A simple server monitor tool.';
        let themeSettings: ThemeSettings = {};

        if (pubRes.ok && (pubRes.headers.get('content-type') || '').includes('application/json')) {
          const pubJson = await pubRes.json();
          const pubData = unwrapData<Record<string, unknown>>(pubJson) || {};
          if (typeof pubData.sitename === 'string' && pubData.sitename) {
            sitename = pubData.sitename;
          }
          if (typeof pubData.description === 'string' && pubData.description) {
            description = pubData.description;
          }
          if (pubData.theme_settings && typeof pubData.theme_settings === 'object') {
            themeSettings = pubData.theme_settings as ThemeSettings;
          }
        }

        let pingTasks: KomariPingTask[] = [];
        if (
          tasksRes &&
          tasksRes.ok &&
          (tasksRes.headers.get('content-type') || '').includes('application/json')
        ) {
          const tasksJson = await tasksRes.json();
          const unwrappedTasks = unwrapData<KomariPingTask[]>(tasksJson);
          if (Array.isArray(unwrappedTasks)) {
            pingTasks = unwrappedTasks;
          }
        }

        const sorted = [...clientList]
          .filter((c) => !c.hidden)
          .sort((a, b) => (a.weight ?? 0) - (b.weight ?? 0));

        return {
          isDemo: false,
          siteInfo: { sitename, description, themeSettings },
          clients: sorted,
          pingTasks,
        };
      }
    } catch {
      // Fallback to Demo mode when running standalone preview
    }
  }

  return {
    isDemo: true,
    siteInfo: DEMO_SITE_INFO,
    clients: DEMO_CLIENTS,
    pingTasks: DEMO_PING_TASKS,
  };
}

function parseWsNodePayload(
  rawNode: Record<string, unknown>,
  online: boolean
): LiveNodeTelemetry {
  const cpuObj = (rawNode.cpu as Record<string, unknown>) || {};
  const ramObj = (rawNode.ram as Record<string, unknown>) || {};
  const swapObj = (rawNode.swap as Record<string, unknown>) || {};
  const loadObj = (rawNode.load as Record<string, unknown>) || {};
  const diskObj = (rawNode.disk as Record<string, unknown>) || {};
  const netObj = (rawNode.network as Record<string, unknown>) || {};
  const connObj = (rawNode.connections as Record<string, unknown>) || {};

  return {
    online,
    cpuUsage: Number(cpuObj.usage ?? rawNode.cpu ?? 0),
    ramUsed: Number(ramObj.used ?? rawNode.ram ?? 0),
    ramTotal: Number(ramObj.total ?? rawNode.ram_total ?? 0),
    swapUsed: Number(swapObj.used ?? rawNode.swap ?? 0),
    swapTotal: Number(swapObj.total ?? rawNode.swap_total ?? 0),
    diskUsed: Number(diskObj.used ?? rawNode.disk ?? 0),
    diskTotal: Number(diskObj.total ?? rawNode.disk_total ?? 0),
    load1: Number(loadObj.load1 ?? rawNode.load ?? 0),
    load5: Number(loadObj.load5 ?? 0),
    load15: Number(loadObj.load15 ?? 0),
    netUp: Number(netObj.up ?? rawNode.net_out ?? 0),
    netDown: Number(netObj.down ?? rawNode.net_in ?? 0),
    netTotalUp: Number(netObj.totalUp ?? netObj.total_up ?? rawNode.net_total_up ?? 0),
    netTotalDown: Number(netObj.totalDown ?? netObj.total_down ?? rawNode.net_total_down ?? 0),
    tcpConnections: Number(connObj.tcp ?? rawNode.connections ?? 0),
    udpConnections: Number(connObj.udp ?? rawNode.connections_udp ?? 0),
    processCount: Number(rawNode.process ?? 0),
    uptime: Number(rawNode.uptime ?? 0),
    temp: rawNode.temp !== undefined ? Number(rawNode.temp) : undefined,
    updatedAt: String(rawNode.updated_at ?? rawNode.time ?? new Date().toISOString()),
  };
}

export function subscribeLiveTelemetry(
  isDemo: boolean,
  onUpdate: (map: Record<string, LiveNodeTelemetry>) => void
): () => void {
  if (isDemo) {
    let tick = 0;
    onUpdate(createDemoLiveMap(tick));
    const timer = window.setInterval(() => {
      tick += 1;
      onUpdate(createDemoLiveMap(tick));
    }, 2000);
    return () => window.clearInterval(timer);
  }

  let disposed = false;
  let ws: WebSocket | null = null;
  let pollTimer: number | null = null;
  let rpcFallbackTimer: number | null = null;

  const pollRpcFallback = async () => {
    try {
      const res = await fetch('/api/rpc2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'common:getNodesLatestStatus',
          params: {},
          id: 1,
        }),
      });
      if (!res.ok) return;
      const json = (await res.json()) as { result?: Record<string, Record<string, unknown>> };
      if (json.result && typeof json.result === 'object') {
        const nextMap: Record<string, LiveNodeTelemetry> = {};
        for (const [uuid, val] of Object.entries(json.result)) {
          const isOnline = Boolean(val.online ?? true);
          nextMap[uuid] = parseWsNodePayload(val, isOnline);
        }
        onUpdate(nextMap);
      }
    } catch {
      // Ignore transient network errors
    }
  };

  const connectWs = () => {
    if (disposed) return;
    try {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(`${proto}//${window.location.host}/api/clients`);

      ws.onopen = () => {
        if (rpcFallbackTimer) {
          window.clearInterval(rpcFallbackTimer);
          rpcFallbackTimer = null;
        }
        ws?.send('get');
        pollTimer = window.setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN) {
            ws.send('get');
          }
        }, 2000);
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data as string);
          const payload = unwrapData<{
            online?: string[];
            data?: Record<string, Record<string, unknown>>;
          }>(msg);
          if (!payload || !payload.data) return;
          const onlineSet = new Set(payload.online || []);
          const nextMap: Record<string, LiveNodeTelemetry> = {};
          for (const [uuid, nodeRaw] of Object.entries(payload.data)) {
            nextMap[uuid] = parseWsNodePayload(nodeRaw, onlineSet.has(uuid));
          }
          onUpdate(nextMap);
        } catch {
          // Ignore malformed frame
        }
      };

      ws.onclose = () => {
        if (pollTimer) {
          window.clearInterval(pollTimer);
          pollTimer = null;
        }
        if (!disposed) {
          if (!rpcFallbackTimer) {
            void pollRpcFallback();
            rpcFallbackTimer = window.setInterval(pollRpcFallback, 3000);
          }
          window.setTimeout(connectWs, 5000);
        }
      };
    } catch {
      if (!rpcFallbackTimer) {
        void pollRpcFallback();
        rpcFallbackTimer = window.setInterval(pollRpcFallback, 3000);
      }
    }
  };

  connectWs();

  return () => {
    disposed = true;
    if (pollTimer) window.clearInterval(pollTimer);
    if (rpcFallbackTimer) window.clearInterval(rpcFallbackTimer);
    ws?.close();
  };
}

export async function fetchNodePingHistory(
  uuid: string,
  hours: number,
  isDemo: boolean
): Promise<{
  records: KomariPingRecord[];
  basicInfos: KomariPingBasicInfo[];
  tasks: KomariPingTask[];
}> {
  if (isDemo) {
    return {
      records: generateDemoPingRecords(uuid, hours),
      basicInfos: [],
      tasks: DEMO_PING_TASKS,
    };
  }

  try {
    const res = await fetch(
      `/api/records/ping?uuid=${encodeURIComponent(uuid)}&hours=${encodeURIComponent(hours)}`
    );
    if (res.ok) {
      const json = await res.json();
      const data = unwrapData<{
        records?: KomariPingRecord[];
        basic_info?: KomariPingBasicInfo[];
        tasks?: KomariPingTask[];
      }>(json);
      return {
        records: Array.isArray(data?.records) ? data.records : [],
        basicInfos: Array.isArray(data?.basic_info) ? data.basic_info : [],
        tasks: Array.isArray(data?.tasks) ? data.tasks : [],
      };
    }
  } catch {
    // Ignore error and return empty
  }

  return { records: [], basicInfos: [], tasks: [] };
}

export async function fetchNodeLoadHistory(
  uuid: string,
  hours: number,
  isDemo: boolean
): Promise<KomariLoadRecord[]> {
  if (isDemo) {
    return generateDemoLoadRecords(uuid, hours);
  }

  try {
    const res = await fetch(
      `/api/records/load?uuid=${encodeURIComponent(uuid)}&hours=${encodeURIComponent(hours)}`
    );
    if (res.ok) {
      const json = await res.json();
      const data = unwrapData<{ records?: KomariLoadRecord[] } | KomariLoadRecord[]>(json);
      if (Array.isArray(data)) return data;
      if (data && Array.isArray(data.records)) return data.records;
    }
  } catch {
    // Fallback to RPC2 common:getRecords if needed
  }

  return [];
}
