export type CurrencyCode = 'CNY' | 'USD' | 'EUR' | 'HKD' | 'GBP' | 'JPY';

export interface KomariClient {
  uuid: string;
  name: string;
  cpu_name: string;
  virtualization: string;
  arch: string;
  cpu_cores: number;
  cpu_physical_cores?: number;
  os: string;
  kernel_version: string;
  gpu_name?: string;
  region: string;
  public_remark?: string;
  mem_total: number;
  swap_total: number;
  disk_total: number;
  weight: number;
  price: number;
  billing_cycle: number;
  auto_renewal?: boolean;
  currency: string;
  expired_at: string | null;
  group?: string;
  tags?: string;
  hidden?: boolean;
  traffic_limit: number;
  traffic_limit_type?: 'max' | 'min' | 'sum' | 'up' | 'down' | string;
}

export interface LiveNodeTelemetry {
  online: boolean;
  cpuUsage: number; // 0 - 100
  ramUsed: number; // bytes
  ramTotal: number; // bytes
  swapUsed: number; // bytes
  swapTotal: number; // bytes
  diskUsed: number; // bytes
  diskTotal: number; // bytes
  load1: number;
  load5: number;
  load15: number;
  netUp: number; // bytes/sec
  netDown: number; // bytes/sec
  netTotalUp: number; // bytes
  netTotalDown: number; // bytes
  tcpConnections: number;
  udpConnections: number;
  processCount: number;
  uptime: number; // seconds
  temp?: number;
  updatedAt: string;
}

export interface KomariPingTask {
  id: number;
  weight?: number;
  name: string;
  clients?: string[];
  default_on?: boolean;
  type?: string;
  interval?: number;
}

export interface KomariPingRecord {
  task_id: number;
  time: string;
  value: number; // ms; < 0 (e.g. -1) indicates timeout / packet loss
  client?: string;
}

export interface KomariPingBasicInfo {
  client?: string;
  task_id?: number;
  name?: string;
  loss?: number;
  latest?: number;
  min?: number;
  max?: number;
  p99?: number;
  avg?: number;
}

export interface KomariLoadRecord {
  client?: string;
  time: string;
  cpu: number;
  gpu?: number;
  ram: number;
  ram_total: number;
  swap: number;
  swap_total: number;
  load: number;
  temp?: number;
  disk: number;
  disk_total: number;
  net_in: number; // bytes/s down
  net_out: number; // bytes/s up
  net_total_up: number;
  net_total_down: number;
  process: number;
  connections: number;
  connections_udp: number;
}

export type AppearanceMode = 'system' | 'dark' | 'light';

export interface ThemeSettings {
  ct_ping_tasks?: number[] | string;
  cu_ping_tasks?: number[] | string;
  cm_ping_tasks?: number[] | string;
  ct_keywords?: string;
  cu_keywords?: string;
  cm_keywords?: string;
  ping_window_hours?: number;
  default_appearance?: AppearanceMode;
  glass_blur?: number;
  glass_opacity?: number;
  background_url?: string;
  default_currency?: CurrencyCode;
  enable_live_exchange?: boolean;
  show_fleet_billing?: boolean;
  default_detail_hours?: string | number;
  default_cut_peak?: boolean;
}

export interface PublicSiteInfo {
  sitename: string;
  description: string;
  themeSettings: ThemeSettings;
}

export type CarrierKey = 'ct' | 'cu' | 'cm';

export interface CarrierMetric {
  key: CarrierKey;
  label: string;
  taskId: number | null;
  taskName: string;
  latestMs: number | null;
  avgMs: number | null;
  minMs: number | null;
  maxMs: number | null;
  lossPct: number | null; // 0 - 100
  points: Array<{ time: string; ts: number; ms: number | null; lost: boolean }>;
}

export interface NodeCarrierTrio {
  ct: CarrierMetric;
  cu: CarrierMetric;
  cm: CarrierMetric;
}

export interface PingTaskPoint {
  time: string;
  ts: number;
  rawMs: number | null;
  shavedMs: number | null;
  wasShaved: boolean;
  lost: boolean;
}

export interface PingTaskSeries {
  taskId: number;
  taskName: string;
  color: string;
  latestMs: number | null;
  avgMs: number | null;
  minMs: number | null;
  maxMs: number | null;
  p95Ms: number | null;
  lossPct: number;
  totalCount: number;
  lostCount: number;
  points: PingTaskPoint[];
}

export interface ExchangeRateState {
  /** Rates relative to 1 CNY (e.g., USD: 0.138 means 1 CNY = 0.138 USD, or cnyPerUnit map) */
  cnyPerUnit: Record<CurrencyCode, number>;
  updatedAt: string;
  isLive: boolean;
  source: string;
}

export interface ComputedBilling {
  hasBilling: boolean;
  isFree: boolean;
  rawPrice: number;
  rawCurrency: CurrencyCode;
  cycleDays: number;
  cycleLabel: string;
  monthlyInTarget: number;
  residualInTarget: number;
  remainDays: number | null;
  remainRatio: number; // 0 - 1
  expiredAtText: string;
  isExpired: boolean;
}
