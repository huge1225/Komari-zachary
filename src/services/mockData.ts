import type {
  KomariClient,
  KomariLoadRecord,
  KomariPingRecord,
  KomariPingTask,
  LiveNodeTelemetry,
  PublicSiteInfo,
} from '../types/komari';

const GB = 1024 ** 3;
const TB = 1024 ** 4;
const MB = 1024 ** 2;

function futureIsoFromDays(daysFromNow: number): string {
  return new Date(Date.now() + daysFromNow * 86_400_000).toISOString();
}

export const DEMO_SITE_INFO: PublicSiteInfo = {
  sitename: 'Komari',
  description: '',
  themeSettings: {
    ct_ping_tasks: [101],
    cu_ping_tasks: [201],
    cm_ping_tasks: [301],
    ping_window_hours: 3,
    default_appearance: 'system',
    glass_blur: 28,
    glass_opacity: 50,
    default_currency: 'CNY',
    enable_live_exchange: true,
    show_fleet_billing: true,
    default_detail_hours: '3',
    default_cut_peak: true,
  },
};

export const DEMO_PING_TASKS: KomariPingTask[] = [
  { id: 101, weight: 1, name: '上海电信 CN2-GIA', type: 'icmp', interval: 60 },
  { id: 102, weight: 2, name: '广州电信 163骨干', type: 'icmp', interval: 60 },
  { id: 103, weight: 3, name: '成都电信 5G核心', type: 'tcp', interval: 60 },
  { id: 201, weight: 4, name: '北京联通 AS9929', type: 'icmp', interval: 60 },
  { id: 202, weight: 5, name: '上海联通 AS4837', type: 'icmp', interval: 60 },
  { id: 301, weight: 6, name: '广州移动 CMI出口', type: 'icmp', interval: 60 },
  { id: 401, weight: 7, name: '香港 HKT 国际BGP', type: 'tcp', interval: 60 },
  { id: 501, weight: 8, name: 'Cloudflare Anycast', type: 'icmp', interval: 60 },
];

export const DEMO_CLIENTS: KomariClient[] = [
  {
    uuid: 'demo-hk-cn2gia-01',
    name: 'HK-Victoria-CN2GIA-01',
    cpu_name: 'AMD EPYC 9654 96-Core Processor',
    virtualization: 'KVM',
    arch: 'x86_64',
    cpu_cores: 4,
    os: 'Debian GNU/Linux 12 (bookworm)',
    kernel_version: '6.6.32-bbrplus',
    region: 'HK',
    mem_total: 8 * GB,
    swap_total: 2 * GB,
    disk_total: 80 * GB,
    weight: 10,
    price: 420,
    billing_cycle: 365,
    currency: 'CNY',
    expired_at: futureIsoFromDays(218),
    group: '亚太精品',
    tags: 'CN2GIA;BGP;NVMe',
    traffic_limit: 1 * TB,
    traffic_limit_type: 'max',
  },
  {
    uuid: 'demo-jp-tyo-02',
    name: 'JP-Tokyo-IIJ-Optima',
    cpu_name: 'AMD Ryzen 9 7950X',
    virtualization: 'KVM',
    arch: 'x86_64',
    cpu_cores: 2,
    os: 'Ubuntu 24.04.1 LTS',
    kernel_version: '6.8.0-45-generic',
    region: 'JP',
    mem_total: 4 * GB,
    swap_total: 1 * GB,
    disk_total: 60 * GB,
    weight: 20,
    price: 8.9,
    billing_cycle: 30,
    currency: 'USD',
    expired_at: futureIsoFromDays(19),
    group: '亚太精品',
    tags: 'IIJ;SoftBank',
    traffic_limit: 2 * TB,
    traffic_limit_type: 'sum',
  },
  {
    uuid: 'demo-sg-cmi-03',
    name: 'SG-Marina-CMI-Ultra',
    cpu_name: 'Intel Xeon Platinum 8480+',
    virtualization: 'KVM',
    arch: 'x86_64',
    cpu_cores: 4,
    os: 'Debian GNU/Linux 12',
    kernel_version: '6.1.0-26-amd64',
    region: 'SG',
    mem_total: 16 * GB,
    swap_total: 4 * GB,
    disk_total: 160 * GB,
    weight: 30,
    price: 198,
    billing_cycle: 90,
    currency: 'HKD',
    expired_at: futureIsoFromDays(64),
    group: '亚太精品',
    tags: 'CMI;10Gbps',
    traffic_limit: 3 * TB,
    traffic_limit_type: 'sum',
  },
  {
    uuid: 'demo-tw-hinet-04',
    name: 'TW-Taipei-Hinet-Dynamic',
    cpu_name: 'AMD EPYC 7763 64-Core',
    virtualization: 'KVM',
    arch: 'x86_64',
    cpu_cores: 2,
    os: 'Debian GNU/Linux 12',
    kernel_version: '6.6.28-xanmod1',
    region: 'TW',
    mem_total: 4 * GB,
    swap_total: 2 * GB,
    disk_total: 50 * GB,
    weight: 40,
    price: 12.5,
    billing_cycle: 30,
    currency: 'USD',
    expired_at: futureIsoFromDays(23),
    group: '亚太流媒体',
    tags: 'HiNet;600M',
    traffic_limit: 4 * TB,
    traffic_limit_type: 'max',
  },
  {
    uuid: 'demo-us-lax-05',
    name: 'US-LAX-CU9929-Premium',
    cpu_name: 'AMD Ryzen 9 9950X',
    virtualization: 'KVM',
    arch: 'x86_64',
    cpu_cores: 2,
    os: 'AlmaLinux 9.4',
    kernel_version: '5.14.0-427.el9',
    region: 'US',
    mem_total: 2 * GB,
    swap_total: 2 * GB,
    disk_total: 40 * GB,
    weight: 50,
    price: 39.9,
    billing_cycle: 365,
    currency: 'USD',
    expired_at: futureIsoFromDays(274),
    group: '北美直连',
    tags: '9929;CMIN2',
    traffic_limit: 800 * GB,
    traffic_limit_type: 'sum',
  },
  {
    uuid: 'demo-de-fra-06',
    name: 'DE-Frankfurt-NVMe-Vault',
    cpu_name: 'AMD EPYC 9554P',
    virtualization: 'KVM',
    arch: 'x86_64',
    cpu_cores: 6,
    os: 'Debian GNU/Linux 12',
    kernel_version: '6.6.44-production',
    region: 'DE',
    mem_total: 16 * GB,
    swap_total: 4 * GB,
    disk_total: 1000 * GB,
    weight: 60,
    price: 9.5,
    billing_cycle: 30,
    currency: 'EUR',
    expired_at: futureIsoFromDays(12),
    group: '欧洲存储',
    tags: 'RAID10;2.5Gbps',
    traffic_limit: 10 * TB,
    traffic_limit_type: 'sum',
  },
];

const BASE_PROFILES: Record<
  string,
  {
    cpu: number;
    ramGB: number;
    swapGB: number;
    diskGB: number;
    upMBs: number;
    downMBs: number;
    totalUpGB: number;
    totalDownGB: number;
    uptimeDays: number;
    ctMs: number;
    ctLoss: number;
    cuMs: number;
    cuLoss: number;
    cmMs: number;
    cmLoss: number;
  }
> = {
  'demo-hk-cn2gia-01': {
    cpu: 26.4,
    ramGB: 3.15,
    swapGB: 0.12,
    diskGB: 33.4,
    upMBs: 6.2,
    downMBs: 15.8,
    totalUpGB: 382,
    totalDownGB: 412,
    uptimeDays: 86,
    ctMs: 31,
    ctLoss: 0,
    cuMs: 37,
    cuLoss: 0,
    cmMs: 25,
    cmLoss: 0,
  },
  'demo-jp-tyo-02': {
    cpu: 58.2,
    ramGB: 2.74,
    swapGB: 0.35,
    diskGB: 28.5,
    upMBs: 11.4,
    downMBs: 26.5,
    totalUpGB: 580,
    totalDownGB: 695,
    uptimeDays: 49,
    ctMs: 56,
    ctLoss: 0.3,
    cuMs: 49,
    cuLoss: 0,
    cmMs: 62,
    cmLoss: 0.2,
  },
  'demo-sg-cmi-03': {
    cpu: 19.8,
    ramGB: 5.2,
    swapGB: 0,
    diskGB: 76.2,
    upMBs: 3.8,
    downMBs: 9.4,
    totalUpGB: 410,
    totalDownGB: 512,
    uptimeDays: 132,
    ctMs: 74,
    ctLoss: 0.6,
    cuMs: 81,
    cuLoss: 0.2,
    cmMs: 43,
    cmLoss: 0,
  },
  'demo-tw-hinet-04': {
    cpu: 34.5,
    ramGB: 1.95,
    swapGB: 0.18,
    diskGB: 21.0,
    upMBs: 18.2,
    downMBs: 42.6,
    totalUpGB: 1420,
    totalDownGB: 1890,
    uptimeDays: 31,
    ctMs: 48,
    ctLoss: 0.2,
    cuMs: 55,
    cuLoss: 0.2,
    cmMs: 39,
    cmLoss: 0,
  },
  'demo-us-lax-05': {
    cpu: 41.6,
    ramGB: 1.36,
    swapGB: 0.42,
    diskGB: 18.4,
    upMBs: 14.1,
    downMBs: 23.8,
    totalUpGB: 295,
    totalDownGB: 348,
    uptimeDays: 214,
    ctMs: 138,
    ctLoss: 0,
    cuMs: 132,
    cuLoss: 0,
    cmMs: 151,
    cmLoss: 0.9,
  },
  'demo-de-fra-06': {
    cpu: 74.2,
    ramGB: 11.4,
    swapGB: 1.05,
    diskGB: 815,
    upMBs: 36.5,
    downMBs: 52.4,
    totalUpGB: 3820,
    totalDownGB: 2640,
    uptimeDays: 64,
    ctMs: 164,
    ctLoss: 2.1,
    cuMs: 149,
    cuLoss: 0.3,
    cmMs: 172,
    cmLoss: 1.2,
  },
};

export function createDemoLiveMap(tick = 0): Record<string, LiveNodeTelemetry> {
  const map: Record<string, LiveNodeTelemetry> = {};
  DEMO_CLIENTS.forEach((c, idx) => {
    const p = BASE_PROFILES[c.uuid];
    const wave = Math.sin(tick * 0.65 + idx * 1.4);
    const wave2 = Math.cos(tick * 0.45 + idx * 2.1);
    const cpu = Math.min(98, Math.max(3, +(p.cpu + wave * 4.2).toFixed(1)));
    const netUp = Math.max(12_000, Math.round((p.upMBs + wave2 * p.upMBs * 0.24) * MB));
    const netDown = Math.max(24_000, Math.round((p.downMBs + wave * p.downMBs * 0.28) * MB));

    map[c.uuid] = {
      online: true,
      cpuUsage: cpu,
      ramUsed: Math.round((p.ramGB + wave2 * 0.08) * GB),
      ramTotal: c.mem_total,
      swapUsed: Math.round(p.swapGB * GB),
      swapTotal: c.swap_total,
      diskUsed: Math.round(p.diskGB * GB),
      diskTotal: c.disk_total,
      load1: +((cpu / 100) * c.cpu_cores * 0.72).toFixed(2),
      load5: +((p.cpu / 100) * c.cpu_cores * 0.68).toFixed(2),
      load15: +((p.cpu / 100) * c.cpu_cores * 0.64).toFixed(2),
      netUp,
      netDown,
      netTotalUp: Math.round(p.totalUpGB * GB + tick * netUp * 2),
      netTotalDown: Math.round(p.totalDownGB * GB + tick * netDown * 2),
      tcpConnections: 95 + idx * 42 + Math.round(wave * 8),
      udpConnections: 14 + idx * 6,
      processCount: 128 + idx * 19,
      uptime: p.uptimeDays * 86400 + tick * 2,
      updatedAt: new Date().toISOString(),
    };
  });
  return map;
}

function deterministicHash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export function generateDemoPingRecords(uuid: string, hours: number): KomariPingRecord[] {
  const p = BASE_PROFILES[uuid] || BASE_PROFILES['demo-hk-cn2gia-01'];
  const pointsCount = hours <= 3 ? 60 : hours <= 6 ? 72 : hours <= 12 ? 84 : 96;
  const now = Date.now();
  const stepMs = (hours * 3600 * 1000) / pointsCount;
  const seed = deterministicHash(uuid);
  const records: KomariPingRecord[] = [];

  const taskDefs = [
    { id: 101, base: p.ctMs, lossPct: p.ctLoss, phase: 0.3, spikeAmp: 0 },
    { id: 102, base: Math.round(p.ctMs * 1.12 + 5), lossPct: +(p.ctLoss + 1.4).toFixed(1), phase: 0.9, spikeAmp: 420 },
    { id: 103, base: Math.round(p.ctMs * 1.18 + 9), lossPct: +(p.ctLoss + 2.2).toFixed(1), phase: 1.4, spikeAmp: 340 },
    { id: 201, base: p.cuMs, lossPct: p.cuLoss, phase: 1.9, spikeAmp: 0 },
    { id: 202, base: Math.round(p.cuMs * 1.09 + 6), lossPct: +(p.cuLoss + 0.5).toFixed(1), phase: 2.5, spikeAmp: 380 },
    { id: 203, base: Math.round(p.cuMs * 1.15 + 10), lossPct: 0, phase: 2.9, spikeAmp: 0 },
    { id: 301, base: p.cmMs, lossPct: p.cmLoss, phase: 3.3, spikeAmp: 290 },
    { id: 302, base: Math.round(p.cmMs * 1.08 + 5), lossPct: 0, phase: 3.7, spikeAmp: 0 },
    { id: 303, base: Math.round(p.cmMs * 1.16 + 11), lossPct: +(p.cmLoss + 0.8).toFixed(1), phase: 4.1, spikeAmp: 0 },
    { id: 401, base: 2, lossPct: 0, phase: 4.5, spikeAmp: 0 },
    { id: 501, base: 1, lossPct: 0, phase: 4.9, spikeAmp: 0 },
  ];

  for (let i = 0; i <= pointsCount; i++) {
    const tIso = new Date(now - (pointsCount - i) * stepMs).toISOString();
    for (const td of taskDefs) {
      const pseudoRand = ((seed + i * 37 + td.id * 13) % 1000) / 10; // 0..99.9
      const isLost = td.lossPct > 0 && pseudoRand < td.lossPct * 1.1;
      if (isLost) {
        records.push({ task_id: td.id, time: tIso, value: -1, client: uuid });
      } else {
        const jitter =
          Math.sin(i * 0.28 + td.phase) * (td.base * 0.08) +
          Math.cos(i * 0.63 + seed * 0.01) * (td.base * 0.045);
        // Simulate realistic brief routing jitter spikes (e.g. 163/4837/CMI evening congestion)
        const isExtremeSpike =
          td.spikeAmp > 0 && ((i + td.id) % 29 === 0 || (i === Math.floor(pointsCount * 0.62) && td.id === 102));
        const spike = isExtremeSpike ? td.spikeAmp + ((i * 19) % 140) : 0;
        records.push({
          task_id: td.id,
          time: tIso,
          value: Math.max(2, Math.round(td.base + jitter + spike)),
          client: uuid,
        });
      }
    }
  }
  return records;
}

export function generateDemoLoadRecords(uuid: string, hours: number): KomariLoadRecord[] {
  const client = DEMO_CLIENTS.find((c) => c.uuid === uuid) || DEMO_CLIENTS[0];
  const p = BASE_PROFILES[uuid] || BASE_PROFILES['demo-hk-cn2gia-01'];
  const pointsCount = hours <= 3 ? 60 : hours <= 6 ? 72 : hours <= 12 ? 84 : 96;
  const now = Date.now();
  const stepMs = (hours * 3600 * 1000) / pointsCount;
  const records: KomariLoadRecord[] = [];

  for (let i = 0; i <= pointsCount; i++) {
    const tIso = new Date(now - (pointsCount - i) * stepMs).toISOString();
    const w1 = Math.sin(i * 0.24 + p.ctMs * 0.1);
    const w2 = Math.cos(i * 0.41 + p.cuMs * 0.1);
    const cpu = Math.min(99, Math.max(4, +(p.cpu + w1 * 14 + w2 * 6).toFixed(1)));
    const ram = Math.round(
      Math.min(client.mem_total * 0.95, Math.max(client.mem_total * 0.12, (p.ramGB + w2 * 0.35) * GB))
    );
    const netIn = Math.max(15_000, Math.round((p.downMBs * (1 + w1 * 0.42 + (i % 17 === 0 ? 0.5 : 0))) * MB));
    const netOut = Math.max(10_000, Math.round((p.upMBs * (1 + w2 * 0.38)) * MB));

    records.push({
      client: uuid,
      time: tIso,
      cpu,
      ram,
      ram_total: client.mem_total,
      swap: Math.round(p.swapGB * GB),
      swap_total: client.swap_total,
      load: +((cpu / 100) * client.cpu_cores * 0.75).toFixed(2),
      disk: Math.round(p.diskGB * GB),
      disk_total: client.disk_total,
      net_in: netIn,
      net_out: netOut,
      net_total_up: Math.round(p.totalUpGB * GB),
      net_total_down: Math.round(p.totalDownGB * GB),
      process: 135,
      connections: 140 + Math.round(w1 * 25),
      connections_udp: 18,
    });
  }
  return records;
}
